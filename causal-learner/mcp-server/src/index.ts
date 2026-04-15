#!/usr/bin/env node
/**
 * Causal Learner MCP Server
 *
 * An exception-driven causal learning system that helps AI agents:
 * 1. Learn causal regulations from unexplained observations
 * 2. Explain new observations using learned regulations
 * 3. Continuously improve through induction and validation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

// Core imports
import {
  createStorage,
  createDualStorage,
  CausalPipeline,
  type CausalStorage,
  type DualLayerStorage,
  type ContextScope,
  type Observation,
  type ObservationInput,
  type FixInput,
  type PipelineConfig,
  type Regulation,
  type Fact,
  processObservation,
  induceFromEvents,
  validateCandidate,
  promoteOrDemote,
} from './core/index.js';

// Tool imports
import {
  submitObservationTool,
  batchSubmitObservations,
  reevaluateEvent,
} from './tools/observation.js';
import {
  listEventsTool,
  getEventTool,
  listRegulationsTool,
  getRegulationTool,
  addRegulationTool,
  updateRegulationTool,
  deleteRegulationTool,
  updateEventStatusTool,
  getStatsTool,
  searchEventsByPredicate,
  searchRegulationsByPredicate,
  getRegulationsForEffect,
  getRegulationsWithPrecondition,
} from './tools/query.js';
import {
  triggerInductionTool,
  createManualCluster,
  generateRegulationFromManualCluster,
} from './tools/induction.js';
import {
  importSweIssueTool,
  recordFixTool,
  suggestCausesTool,
  analyzeSweBatch,
  type SweIssue,
  type FixInfo,
} from './tools/swebench.js';

// 新搜索工具 (参考 Sirchmunk 改进)
import {
  causalSearchTool,
  fuzzySearchRegulationsTool,
  fuzzySearchEventsTool,
  buildKnowledgeClusterTool,
  searchKnowledgeClustersTool,
  sampleEvidenceTool,
} from './tools/search.js';

// v5 图工具 (卡片盒 + 双模式)
import {
  addAtomTool,
  addRefTool,
  exploreGraphTool,
  compilePathTool,
  myelinateGraphTool,
  queryGraphTool,
  findAtomsTool,
  graphStatsTool,
  pruneGraphTool,
  ingestFactsTool,
} from './tools/graph.js';

// Get database paths from environment
// CAUSAL_DB_PATH: legacy single-DB mode (backward compatible)
// CAUSAL_LONGTERM_DB_PATH: long-term DB for dual-layer mode
const DB_PATH = process.env.CAUSAL_DB_PATH || path.join(process.cwd(), 'data', 'causal.db');
const LONGTERM_DB_PATH = process.env.CAUSAL_LONGTERM_DB_PATH;

// Dual-layer mode: use separate short-term (memory) and long-term (persistent) DBs
const USE_DUAL_LAYER = !!LONGTERM_DB_PATH;

// Initialize storage (either single or dual-layer)
// Using 'any' for flexibility - both CausalStorage and DualLayerStorage implement the same public API
let storage: any;
let dualStorage: DualLayerStorage | null = null;
let pipeline: CausalPipeline | null = null;

// Zod schemas for tool inputs
const FactSchema = z.object({
  pred: z.string(),
  value: z.unknown(),
  args: z.record(z.unknown()).optional(),
});

const ObservationInputSchema = z.object({
  observationId: z.string().optional(),
  timestamp: z.string().optional(),
  facts: z.array(FactSchema),
  context: z.record(z.unknown()).optional(),
  focusFacts: z.array(FactSchema).optional(),
  rawRefs: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const SweIssueSchema = z.object({
  issueId: z.string(),
  repo: z.string(),
  title: z.string(),
  description: z.string(),
  errorLog: z.string().optional(),
  stackTrace: z.string().optional(),
  testFile: z.string().optional(),
  failingTests: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
});

const FixInfoSchema = z.object({
  fixCommit: z.string(),
  fixDescription: z.string(),
  filesChanged: z.array(z.string()).optional(),
  linesChanged: z.number().optional(),
  testsPassed: z.boolean().optional(),
});

// Tool definitions
const TOOLS: Tool[] = [
  // Core observation tools
  {
    name: 'submit_observation',
    description: 'Submit an observation to the causal learner. Attempts to explain it using existing regulations, creates an Event if unexplainable.',
    inputSchema: {
      type: 'object',
      properties: {
        observation: {
          type: 'object',
          description: 'The observation to submit',
          properties: {
            facts: { type: 'array', items: { type: 'object' } },
            context: { type: 'object' },
            focusFacts: { type: 'array', items: { type: 'object' } },
          },
          required: ['facts'],
        },
        options: {
          type: 'object',
          properties: {
            minScore: { type: 'number' },
            maxAssumptions: { type: 'number' },
            updateEvidence: { type: 'boolean' },
          },
        },
      },
      required: ['observation'],
    },
  },
  {
    name: 'batch_submit_observations',
    description: 'Submit multiple observations at once.',
    inputSchema: {
      type: 'object',
      properties: {
        observations: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of observations to submit',
        },
        options: {
          type: 'object',
          properties: {
            minScore: { type: 'number' },
            maxAssumptions: { type: 'number' },
            updateEvidence: { type: 'boolean' },
          },
        },
      },
      required: ['observations'],
    },
  },
  {
    name: 'reevaluate_event',
    description: 'Re-evaluate an existing event against current regulations to see if it can now be explained.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'The event ID to re-evaluate' },
      },
      required: ['eventId'],
    },
  },
  // Query tools
  {
    name: 'list_events',
    description: 'List events with optional status filter.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'clustered', 'resolved', 'archived'] },
        limit: { type: 'number', default: 100 },
      },
    },
  },
  {
    name: 'get_event',
    description: 'Get detailed information about a specific event.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'The event ID to retrieve' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'list_regulations',
    description: 'List causal regulations with optional status filter.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['candidate', 'hypothesis', 'confirmed', 'retired'] },
        limit: { type: 'number', default: 100 },
      },
    },
  },
  {
    name: 'get_regulation',
    description: 'Get detailed information about a specific regulation.',
    inputSchema: {
      type: 'object',
      properties: {
        regulationId: { type: 'string', description: 'The regulation ID to retrieve' },
      },
      required: ['regulationId'],
    },
  },
  {
    name: 'add_regulation',
    description: 'Add a new causal regulation manually (seed rule).',
    inputSchema: {
      type: 'object',
      properties: {
        pre: { type: 'array', items: { type: 'object' }, description: 'Precondition facts' },
        eff: { type: 'array', items: { type: 'object' }, description: 'Effect facts' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['candidate', 'hypothesis', 'confirmed'] },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['pre', 'eff'],
    },
  },
  {
    name: 'update_event_status',
    description: 'Update the status of an event.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'The event ID to update' },
        status: { type: 'string', enum: ['open', 'clustered', 'resolved', 'archived'] },
        clusterId: { type: 'string', description: 'Optional cluster ID' },
      },
      required: ['eventId', 'status'],
    },
  },
  {
    name: 'update_regulation',
    description: 'Update an existing regulation.',
    inputSchema: {
      type: 'object',
      properties: {
        regulationId: { type: 'string', description: 'The regulation ID to update' },
        updates: { type: 'object', description: 'Partial updates to apply' },
      },
      required: ['regulationId', 'updates'],
    },
  },
  {
    name: 'delete_regulation',
    description: 'Delete a regulation.',
    inputSchema: {
      type: 'object',
      properties: {
        regulationId: { type: 'string', description: 'The regulation ID to delete' },
      },
      required: ['regulationId'],
    },
  },
  {
    name: 'get_regulations_for_effect',
    description: 'Get regulations that can produce a given effect.',
    inputSchema: {
      type: 'object',
      properties: {
        effectPred: { type: 'string', description: 'Effect predicate to search for' },
        effectValue: { description: 'Optional value to match' },
      },
      required: ['effectPred'],
    },
  },
  {
    name: 'get_regulations_with_precondition',
    description: 'Get regulations that require a given precondition.',
    inputSchema: {
      type: 'object',
      properties: {
        prePred: { type: 'string', description: 'Precondition predicate to search for' },
        preValue: { description: 'Optional value to match' },
      },
      required: ['prePred'],
    },
  },
  {
    name: 'get_stats',
    description: 'Get statistics about the causal learning system.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_events',
    description: 'Search events by predicate pattern in unexplained aspects.',
    inputSchema: {
      type: 'object',
      properties: {
        predPattern: { type: 'string', description: 'Predicate pattern to search for' },
        limit: { type: 'number', default: 50 },
      },
      required: ['predPattern'],
    },
  },
  {
    name: 'search_regulations',
    description: 'Search regulations by predicate pattern in preconditions or effects.',
    inputSchema: {
      type: 'object',
      properties: {
        predPattern: { type: 'string', description: 'Predicate pattern to search for' },
        limit: { type: 'number', default: 50 },
      },
      required: ['predPattern'],
    },
  },
  // Induction tools
  {
    name: 'trigger_induction',
    description: 'Trigger induction to create new regulations from clustered open events.',
    inputSchema: {
      type: 'object',
      properties: {
        options: {
          type: 'object',
          properties: {
            minClusterSize: { type: 'number', default: 2 },
            minSimilarity: { type: 'number', default: 0.5 },
            maxRegulationsPerCluster: { type: 'number', default: 3 },
            autoValidate: { type: 'boolean', default: true },
            resolveEvents: { type: 'boolean', default: true },
          },
        },
      },
    },
  },
  {
    name: 'create_cluster',
    description: 'Manually create a cluster from specified events.',
    inputSchema: {
      type: 'object',
      properties: {
        eventIds: { type: 'array', items: { type: 'string' }, description: 'Event IDs to cluster' },
      },
      required: ['eventIds'],
    },
  },
  // SWE-bench integration tools
  {
    name: 'import_swe_issue',
    description: 'Import a SWE-bench issue and create an observation from it.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: {
          type: 'object',
          properties: {
            issueId: { type: 'string' },
            repo: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            errorLog: { type: 'string' },
            stackTrace: { type: 'string' },
            testFile: { type: 'string' },
            failingTests: { type: 'array', items: { type: 'string' } },
            labels: { type: 'array', items: { type: 'string' } },
          },
          required: ['issueId', 'repo', 'title', 'description'],
        },
      },
      required: ['issue'],
    },
  },
  {
    name: 'record_fix',
    description: 'Record a successful fix for an event and update regulations.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'The event ID that was fixed' },
        fix: {
          type: 'object',
          properties: {
            fixCommit: { type: 'string' },
            fixDescription: { type: 'string' },
            filesChanged: { type: 'array', items: { type: 'string' } },
            linesChanged: { type: 'number' },
            testsPassed: { type: 'boolean' },
          },
          required: ['fixCommit', 'fixDescription'],
        },
      },
      required: ['eventId', 'fix'],
    },
  },
  {
    name: 'suggest_causes',
    description: 'Suggest possible causes for an observation based on existing regulations.',
    inputSchema: {
      type: 'object',
      properties: {
        observation: {
          type: 'object',
          description: 'The observation to analyze',
          properties: {
            facts: { type: 'array', items: { type: 'object' } },
            context: { type: 'object' },
            focusFacts: { type: 'array', items: { type: 'object' } },
          },
          required: ['facts'],
        },
      },
      required: ['observation'],
    },
  },
  {
    name: 'analyze_swe_batch',
    description: 'Analyze multiple SWE-bench issues and find common patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              issueId: { type: 'string' },
              repo: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              errorLog: { type: 'string' },
            },
            required: ['issueId', 'repo', 'title', 'description'],
          },
        },
      },
      required: ['issues'],
    },
  },
  // Dual-layer storage tools
  {
    name: 'flush_to_longterm',
    description: 'Flush short-term learning to long-term storage. Call this before context compaction or session end to persist learned knowledge.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_dual_stats',
    description: 'Get statistics for both short-term and long-term storage (dual-layer mode only).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'reset_session',
    description: 'Reset the short-term session storage while keeping long-term knowledge. Use to start a fresh session.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_longterm_stats',
    description: 'Get statistics from long-term storage only.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // 新搜索工具 (参考 Sirchmunk 改进)
  {
    name: 'causal_search',
    description: 'Intelligent causal search using ReAct loop. Automatically searches knowledge clusters, regulations, and events to find causal relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query describing the causal relationship to find' },
        maxDepth: { type: 'number', default: 5, description: 'Maximum search depth' },
        strategy: { type: 'string', enum: ['knowledge_first', 'regulation_first', 'event_first'], default: 'knowledge_first' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fuzzy_search_regulations',
    description: 'Fuzzy search causal regulations using token-based matching. Better than exact predicate matching for natural language queries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        threshold: { type: 'number', default: 30, description: 'Minimum match score (0-100)' },
        limit: { type: 'number', default: 10, description: 'Maximum results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fuzzy_search_events',
    description: 'Fuzzy search historical events using token-based matching.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        status: { type: 'string', enum: ['open', 'clustered', 'resolved', 'archived'] },
        threshold: { type: 'number', default: 30, description: 'Minimum match score (0-100)' },
        limit: { type: 'number', default: 10, description: 'Maximum results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'build_knowledge_cluster',
    description: 'Build a knowledge cluster from related regulations and events. Groups causal knowledge for reuse.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Cluster name' },
        regulationIds: { type: 'array', items: { type: 'string' }, description: 'Related regulation IDs' },
        eventIds: { type: 'array', items: { type: 'string' }, description: 'Related event IDs' },
        description: { type: 'string', description: 'Cluster description' },
      },
      required: ['name'],
    },
  },
  {
    name: 'search_knowledge_clusters',
    description: 'Search existing knowledge clusters by fuzzy text matching.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', default: 5, description: 'Maximum results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'sample_evidence',
    description: 'Monte Carlo evidence sampling on long documents. Finds the most relevant snippets without reading the entire document.',
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'Document content to sample' },
        query: { type: 'string', description: 'Search query' },
        keywords: { type: 'object', description: 'Keywords with IDF weights' },
        topK: { type: 'number', default: 3, description: 'Number of best snippets to return' },
      },
      required: ['document', 'query'],
    },
  },
  // v5 图工具 (卡片盒 + 双模式)
  {
    name: 'add_atom',
    description: 'Create an atomic knowledge card (fact, concept, action, context, or pattern). Auto-deduplicates by content+kind.',
    inputSchema: { type: 'object', properties: { content: { type: 'string' }, kind: { type: 'string', enum: ['fact', 'concept', 'action', 'context', 'pattern'] } }, required: ['content', 'kind'] },
  },
  {
    name: 'add_ref',
    description: 'Create a reference edge between two atoms. The relationship itself IS knowledge.',
    inputSchema: { type: 'object', properties: { fromAtomId: { type: 'string' }, toAtomId: { type: 'string' }, kind: { type: 'string', enum: ['causes', 'prevents', 'requires', 'is_a', 'part_of', 'similar_to', 'fixes', 'indicates', 'cooccurs'] }, weight: { type: 'number' }, mode: { type: 'string', enum: ['tentative', 'compiled'] } }, required: ['fromAtomId', 'toAtomId', 'kind'] },
  },
  {
    name: 'explore_graph',
    description: 'Divergent mode: from observation atoms, find all candidate explanation paths through the knowledge graph.',
    inputSchema: { type: 'object', properties: { atomIds: { type: 'array', items: { type: 'string' } }, maxDepth: { type: 'number', default: 3 }, maxPaths: { type: 'number', default: 10 } }, required: ['atomIds'] },
  },
  {
    name: 'compile_path',
    description: 'Compile mode: strengthen the correct path (myelinate) and weaken failed paths.',
    inputSchema: { type: 'object', properties: { correctAtomIds: { type: 'array', items: { type: 'string' } }, failedAtomIdsList: { type: 'array', items: { type: 'array', items: { type: 'string' } } } }, required: ['correctAtomIds'] },
  },
  {
    name: 'myelinate_graph',
    description: 'Create shortcut edges for frequently-used compiled paths (like neural myelination).',
    inputSchema: { type: 'object', properties: { minUseCount: { type: 'number', default: 3 }, minWeight: { type: 'number', default: 0.6 } } },
  },
  {
    name: 'query_graph',
    description: 'Query the knowledge graph: find neighbors, reachable nodes, or paths between atoms.',
    inputSchema: { type: 'object', properties: { atomId: { type: 'string' }, operation: { type: 'string', enum: ['neighbors', 'reachable', 'find_path'] }, targetAtomId: { type: 'string' }, maxDepth: { type: 'number', default: 3 }, direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'] } }, required: ['atomId', 'operation'] },
  },
  {
    name: 'find_atoms',
    description: 'Search atomic knowledge cards by keyword and optional kind filter.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, kind: { type: 'string', enum: ['fact', 'concept', 'action', 'context', 'pattern'] }, limit: { type: 'number', default: 20 } }, required: ['query'] },
  },
  {
    name: 'graph_stats',
    description: 'Get knowledge graph statistics: atom/ref/shortcut counts, distributions, orphan count.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'prune_graph',
    description: 'Prune weak tentative edges and optionally remove orphan atoms.',
    inputSchema: { type: 'object', properties: { minWeight: { type: 'number', default: 0.1 }, removeOrphans: { type: 'boolean', default: false } } },
  },
  {
    name: 'ingest_facts',
    description: 'Ingest a set of facts as atoms and auto-create cooccurs edges between them.',
    inputSchema: { type: 'object', properties: { facts: { type: 'array', items: { type: 'object', properties: { pred: { type: 'string' }, value: {}, args: { type: 'object' } }, required: ['pred', 'value'] } }, context: { type: 'object' } }, required: ['facts'] },
  },
  // Smart caching and test mode tools
  {
    name: 'set_test_mode',
    description: 'Enable or disable test mode. In test mode, flush to long-term is blocked, enabling train/test separation for evaluation.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Whether to enable test mode' },
      },
      required: ['enabled'],
    },
  },
  {
    name: 'load_relevant_knowledge',
    description: 'Load regulations relevant to the given observation from long-term DB to short-term cache. Uses predicate matching for RAG-like smart loading instead of loading all regulations.',
    inputSchema: {
      type: 'object',
      properties: {
        observation: {
          type: 'object',
          description: 'The observation to find relevant regulations for',
          properties: {
            facts: { type: 'array', items: { type: 'object' } },
            context: { type: 'object' },
            focusFacts: { type: 'array', items: { type: 'object' } },
          },
          required: ['facts'],
        },
      },
      required: ['observation'],
    },
  },
];

// Generate unique observation ID
function generateObservationId(): string {
  return 'obs_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type SubmitObservationToolArgs = {
  observation: Observation;
  options?: Record<string, unknown>;
};

type RecordFixToolArgs = {
  eventId: string;
  fix: FixInfo;
};

type NormalizedSubmitObservationArgs = {
  observation: Observation;
  pipelineInput: ObservationInput;
  options?: Record<string, unknown>;
};

type NormalizedRecordFixArgs = {
  eventId: string;
  fix: FixInfo;
  pipelineInput: FixInput;
};

function createJsonResponse(payload: unknown): ToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function ensurePipelineInstance(current: CausalPipeline | null): CausalPipeline {
  if (!current) {
    throw new Error('CausalPipeline not initialized');
  }
  return current;
}

function toContextScope(context: Record<string, unknown> | undefined, custom: Record<string, unknown> = {}): ContextScope | undefined {
  const base = context ?? {};
  const {
    env,
    stack,
    version,
    timeRange,
    project,
    custom: existingCustom,
    ...rest
  } = base;

  const mergedCustom: Record<string, unknown> = {
    ...(existingCustom && typeof existingCustom === 'object' && !Array.isArray(existingCustom)
      ? existingCustom as Record<string, unknown>
      : {}),
    ...rest,
    ...custom,
  };

  const scope: ContextScope = {};
  if (typeof env === 'string') scope.env = env;
  if (Array.isArray(stack) && stack.every((item) => typeof item === 'string')) scope.stack = stack;
  if (typeof version === 'string') scope.version = version;
  if (timeRange && typeof timeRange === 'object' && !Array.isArray(timeRange)) {
    const range = timeRange as { from?: unknown; to?: unknown };
    scope.timeRange = {};
    if (typeof range.from === 'string') scope.timeRange.from = range.from;
    if (typeof range.to === 'string') scope.timeRange.to = range.to;
    if (!scope.timeRange.from && !scope.timeRange.to) delete scope.timeRange;
  }
  if (typeof project === 'string') scope.project = project;
  if (Object.keys(mergedCustom).length > 0) scope.custom = mergedCustom;

  return Object.keys(scope).length > 0 ? scope : undefined;
}

function buildRawInput(observation: Observation): string {
  if (Array.isArray(observation.rawRefs) && observation.rawRefs.length > 0) {
    const joinedRefs = observation.rawRefs.filter((ref): ref is string => typeof ref === 'string' && ref.length > 0).join('\n');
    if (joinedRefs) {
      return joinedRefs;
    }
  }

  const metadataTitle = typeof observation.metadata?.title === 'string' ? observation.metadata.title : undefined;
  const metadataDescription = typeof observation.metadata?.description === 'string' ? observation.metadata.description : undefined;
  const metadataText = [metadataTitle, metadataDescription].filter((value): value is string => typeof value === 'string' && value.length > 0).join('\n');
  if (metadataText) {
    return metadataText;
  }

  return JSON.stringify({
    facts: observation.facts,
    context: observation.context,
  });
}

export function buildPipelineConfig(baseDbPath: string): PipelineConfig {
  const parsed = path.parse(baseDbPath);
  const pipelineBaseName = `${parsed.name}.pipeline`;
  const withSuffix = (suffix: string): string => path.join(parsed.dir, `${pipelineBaseName}.${suffix}${parsed.ext || '.db'}`);

  return {
    graphDbPath: withSuffix('graph'),
    storyDbPath: withSuffix('story'),
    evidenceDbPath: withSuffix('evidence'),
    problemClassDbPath: withSuffix('problem-class'),
    patternDbPath: withSuffix('pattern'),
    autoClassify: true,
    autoExplore: true,
    seedDefaults: true,
    mechanismInstanceDbPath: withSuffix('mechanism-instance'),
    derivationTraceDbPath: withSuffix('derivation-trace'),
    episodeEventDbPath: withSuffix('episode-event'),
    supportLinksDbPath: withSuffix('support-link'),
    observationRecordsDbPath: withSuffix('observation-record'),
    observationModelsDbPath: withSuffix('observation-model'),
    mechanismProgramsDbPath: withSuffix('mechanism-program'),
    mechanismClassesDbPath: withSuffix('mechanism-class'),
    counterfactualScenariosDbPath: withSuffix('counterfactual-scenario'),
    experimentDesignsDbPath: withSuffix('experiment-design'),
    actionExecutionDbPath: withSuffix('action-execution'),
    outcomeRecordDbPath: withSuffix('outcome-record'),
    predictionErrorDbPath: withSuffix('prediction-error'),
    stateSnapshotDbPath:            withSuffix('state-snapshot'),
    transitionDbPath:               withSuffix('transition'),
    programRevisionProposalsDbPath: withSuffix('program-revision-proposal'),
    validityEnvelopesDbPath:        withSuffix('validity-envelope'),
    reviewDecisionsDbPath:          withSuffix('review-decision'),
    failureBoundaryArchiveDbPath:   withSuffix('failure-boundary-archive'),
    reconstructionDbPath:           withSuffix('reconstruction'),
    branchPointDbPath:              withSuffix('branch-point'),
    presentSliceDbPath:             withSuffix('present-slice'),
  };
}

export function normalizeSubmitObservationArgs(args: unknown): NormalizedSubmitObservationArgs {
  const parsedArgs = (args ?? {}) as { observation?: unknown; options?: Record<string, unknown> };
  const observation = ObservationInputSchema.parse(parsedArgs.observation ?? {});
  const normalizedObservation: Observation = {
    observationId: observation.observationId ?? generateObservationId(),
    timestamp: observation.timestamp ?? new Date().toISOString(),
    facts: observation.facts as Fact[],
    context: observation.context,
    focusFacts: observation.focusFacts as Fact[] | undefined,
    rawRefs: observation.rawRefs,
    metadata: observation.metadata,
  };
  const pipelineInput: ObservationInput = {
    rawInput: buildRawInput(normalizedObservation),
    facts: normalizedObservation.facts,
    context: toContextScope(normalizedObservation.context, {
      legacyObservationId: normalizedObservation.observationId,
      legacyTimestamp: normalizedObservation.timestamp,
      legacyFocusFacts: normalizedObservation.focusFacts,
      legacyRawRefs: normalizedObservation.rawRefs,
      legacyMetadata: normalizedObservation.metadata,
    }),
  };

  return {
    observation: normalizedObservation,
    pipelineInput,
    options: parsedArgs.options,
  };
}

export function normalizeRecordFixArgs(args: unknown): NormalizedRecordFixArgs {
  const parsedArgs = (args ?? {}) as { eventId?: unknown; fix?: unknown };
  const eventId = z.string().parse(parsedArgs.eventId);
  const fix = FixInfoSchema.parse(parsedArgs.fix ?? {});
  const pipelineInput: FixInput = {
    storyId: eventId,
    fixDescription: fix.fixDescription,
    context: toContextScope(undefined, {
      legacyFixCommit: fix.fixCommit,
      legacyFilesChanged: fix.filesChanged,
      legacyLinesChanged: fix.linesChanged,
      legacyTestsPassed: fix.testsPassed,
    }),
    interventionOutcome: fix.testsPassed === false ? 'no_effect' : undefined,
  };

  return {
    eventId,
    fix,
    pipelineInput,
  };
}

export function handleSubmitObservationTool(currentPipeline: CausalPipeline, args: unknown): ToolResponse {
  const normalized = normalizeSubmitObservationArgs(args);
  const pipelineResult = currentPipeline.submitObservation(normalized.pipelineInput);

  return createJsonResponse({
    eventCreated: {
      eventId: pipelineResult.story.id,
      status: pipelineResult.story.status,
    },
    pipelineResult,
  });
}

export function handleRecordFixTool(currentPipeline: CausalPipeline, args: unknown): ToolResponse {
  const normalized = normalizeRecordFixArgs(args);
  const pipelineResult = currentPipeline.recordFix(normalized.pipelineInput);

  return createJsonResponse({
    eventUpdated: {
      eventId: normalized.eventId,
      status: pipelineResult.story.status,
      outcome: pipelineResult.story.outcome,
    },
    pipelineResult,
  });
}

export function handleCausalSearchTool(currentPipeline: CausalPipeline, args: unknown): ToolResponse {
  const searchArgs = z.object({
    query: z.string(),
    maxDepth: z.number().optional(),
    strategy: z.enum(['knowledge_first', 'regulation_first', 'event_first']).optional(),
  }).parse(args ?? {});
  const pipelineResult = currentPipeline.search(searchArgs.query);

  return createJsonResponse({
    query: searchArgs.query,
    pipelineResult,
  });
}

// Create the MCP server
const server = new Server(
  {
    name: 'causal-learner',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // Core observation tools
      case 'submit_observation': {
        // v7-v8 bridge (#39): 同步写入 Observation + Event 到 legacy storage，
        // 使 trigger_induction / suggest_causes / causal_search 可查询
        const normalized = normalizeSubmitObservationArgs(args);
        submitObservationTool(storage, normalized.observation, normalized.options as any);

        // v9-v11 pipeline（主路径）
        return handleSubmitObservationTool(ensurePipelineInstance(pipeline), args);
      }

      case 'batch_submit_observations': {
        const observations = (args?.observations as Record<string, unknown>[]).map((obsInput) => ({
          observationId: (obsInput.observationId as string) || generateObservationId(),
          timestamp: (obsInput.timestamp as string) || new Date().toISOString(),
          facts: obsInput.facts as Fact[],
          context: obsInput.context as Record<string, unknown>,
          focusFacts: obsInput.focusFacts as Fact[],
          rawRefs: obsInput.rawRefs as string[],
          metadata: obsInput.metadata as Record<string, unknown>,
        }));
        const results = batchSubmitObservations(storage, observations, args?.options as any);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      case 'reevaluate_event': {
        const result = reevaluateEvent(storage, args?.eventId as string);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // Query tools
      case 'list_events': {
        const events = listEventsTool(storage, args?.status as any, args?.limit as number);
        return { content: [{ type: 'text', text: JSON.stringify(events, null, 2) }] };
      }

      case 'get_event': {
        const event = getEventTool(storage, args?.eventId as string);
        return { content: [{ type: 'text', text: JSON.stringify(event, null, 2) }] };
      }

      case 'list_regulations': {
        const regs = listRegulationsTool(storage, args?.status as any, args?.limit as number);
        return { content: [{ type: 'text', text: JSON.stringify(regs, null, 2) }] };
      }

      case 'get_regulation': {
        const reg = getRegulationTool(storage, args?.regulationId as string);
        return { content: [{ type: 'text', text: JSON.stringify(reg, null, 2) }] };
      }

      case 'add_regulation': {
        const reg = addRegulationTool(storage, {
          pre: args?.pre as Fact[],
          eff: args?.eff as Fact[],
          description: args?.description as string,
          status: args?.status as any,
          tags: args?.tags as string[],
        });
        return { content: [{ type: 'text', text: JSON.stringify(reg, null, 2) }] };
      }

      case 'update_event_status': {
        const result = updateEventStatusTool(
          storage,
          args?.eventId as string,
          args?.status as any,
          args?.clusterId as string | undefined
        );
        return { content: [{ type: 'text', text: JSON.stringify({ success: result }, null, 2) }] };
      }

      case 'update_regulation': {
        const result = updateRegulationTool(
          storage,
          args?.regulationId as string,
          args?.updates as any
        );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'delete_regulation': {
        const result = deleteRegulationTool(storage, args?.regulationId as string);
        return { content: [{ type: 'text', text: JSON.stringify({ deleted: result }, null, 2) }] };
      }

      case 'get_regulations_for_effect': {
        const regs = getRegulationsForEffect(
          storage,
          args?.effectPred as string,
          args?.effectValue
        );
        return { content: [{ type: 'text', text: JSON.stringify(regs, null, 2) }] };
      }

      case 'get_regulations_with_precondition': {
        const regs = getRegulationsWithPrecondition(
          storage,
          args?.prePred as string,
          args?.preValue
        );
        return { content: [{ type: 'text', text: JSON.stringify(regs, null, 2) }] };
      }

      case 'get_stats': {
        const stats = getStatsTool(storage);
        return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
      }

      case 'search_events': {
        const events = searchEventsByPredicate(storage, args?.predPattern as string, args?.limit as number);
        return { content: [{ type: 'text', text: JSON.stringify(events, null, 2) }] };
      }

      case 'search_regulations': {
        const regs = searchRegulationsByPredicate(storage, args?.predPattern as string, args?.limit as number);
        return { content: [{ type: 'text', text: JSON.stringify(regs, null, 2) }] };
      }

      // Induction tools
      case 'trigger_induction': {
        const result = triggerInductionTool(storage, args?.options as any);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'create_cluster': {
        const cluster = createManualCluster(storage, args?.eventIds as string[]);
        if (cluster) {
          const reg = generateRegulationFromManualCluster(storage, cluster);
          return { content: [{ type: 'text', text: JSON.stringify({ cluster, regulation: reg }, null, 2) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Failed to create cluster' }, null, 2) }] };
      }

      // SWE-bench tools
      case 'import_swe_issue': {
        const issue = args?.issue as SweIssue;
        const obs = importSweIssueTool(storage, issue);
        return { content: [{ type: 'text', text: JSON.stringify(obs, null, 2) }] };
      }

      case 'record_fix': {
        return handleRecordFixTool(ensurePipelineInstance(pipeline), args);
      }

      case 'suggest_causes': {
        const obsInput = args?.observation as Record<string, unknown>;
        const observation: Observation = {
          observationId: generateObservationId(),
          timestamp: new Date().toISOString(),
          facts: obsInput.facts as Fact[],
          context: obsInput.context as Record<string, unknown>,
          focusFacts: obsInput.focusFacts as Fact[],
        };
        const suggestions = suggestCausesTool(storage, observation);
        return { content: [{ type: 'text', text: JSON.stringify(suggestions, null, 2) }] };
      }

      case 'analyze_swe_batch': {
        const result = analyzeSweBatch(storage, args?.issues as SweIssue[]);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      // v5 图工具 (卡片盒 + 双模式)
      case 'add_atom':
        return await addAtomTool(args as any);
      case 'add_ref':
        return await addRefTool(args as any);
      case 'explore_graph':
        return await exploreGraphTool(args as any);
      case 'compile_path':
        return await compilePathTool(args as any);
      case 'myelinate_graph':
        return await myelinateGraphTool(args as any);
      case 'query_graph':
        return await queryGraphTool(args as any);
      case 'find_atoms':
        return await findAtomsTool(args as any);
      case 'graph_stats':
        return await graphStatsTool(args as any);
      case 'prune_graph':
        return await pruneGraphTool(args as any);
      case 'ingest_facts':
        return await ingestFactsTool(args as any);

      // 新搜索工具 (参考 Sirchmunk 改进)
      case 'causal_search':
        return handleCausalSearchTool(ensurePipelineInstance(pipeline), args);

      case 'fuzzy_search_regulations':
        return await fuzzySearchRegulationsTool(storage, args as any);

      case 'fuzzy_search_events':
        return await fuzzySearchEventsTool(storage, args as any);

      case 'build_knowledge_cluster':
        return await buildKnowledgeClusterTool(storage, args as any);

      case 'search_knowledge_clusters':
        return await searchKnowledgeClustersTool(storage, args as any);

      case 'sample_evidence':
        return await sampleEvidenceTool(storage, args as any);

      // Dual-layer storage tools
      case 'flush_to_longterm': {
        if (!dualStorage) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Dual-layer mode not enabled. Set CAUSAL_LONGTERM_DB_PATH environment variable.',
                mode: 'single',
              }, null, 2),
            }],
          };
        }
        const result = dualStorage.flushToLongterm();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_dual_stats': {
        if (!dualStorage) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                mode: 'single',
                stats: getStatsTool(storage),
              }, null, 2),
            }],
          };
        }
        const stats = dualStorage.getDualStats();
        return { content: [{ type: 'text', text: JSON.stringify({ mode: 'dual', ...stats }, null, 2) }] };
      }

      case 'reset_session': {
        if (!dualStorage) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Dual-layer mode not enabled. Set CAUSAL_LONGTERM_DB_PATH environment variable.',
                mode: 'single',
              }, null, 2),
            }],
          };
        }
        dualStorage.resetShortTerm();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, message: 'Session reset. Long-term knowledge preserved.' }, null, 2),
          }],
        };
      }

      case 'get_longterm_stats': {
        if (!dualStorage) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Dual-layer mode not enabled. Set CAUSAL_LONGTERM_DB_PATH environment variable.',
                mode: 'single',
              }, null, 2),
            }],
          };
        }
        const stats = dualStorage.getLongtermStats();
        return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
      }

      // Smart caching and test mode tools
      case 'set_test_mode': {
        if (!dualStorage) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Dual-layer mode not enabled. Set CAUSAL_LONGTERM_DB_PATH environment variable.',
                mode: 'single',
              }, null, 2),
            }],
          };
        }
        const enabled = args?.enabled as boolean;
        dualStorage.setTestMode(enabled);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              testMode: enabled,
              message: enabled
                ? 'Test mode enabled. Flush to long-term DB is now blocked.'
                : 'Test mode disabled. Flush to long-term DB is now allowed.',
            }, null, 2),
          }],
        };
      }

      case 'load_relevant_knowledge': {
        if (!dualStorage) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Dual-layer mode not enabled. Set CAUSAL_LONGTERM_DB_PATH environment variable.',
                mode: 'single',
              }, null, 2),
            }],
          };
        }
        const obsInput = args?.observation as Record<string, unknown>;
        const observation: Observation = {
          observationId: generateObservationId(),
          timestamp: new Date().toISOString(),
          facts: obsInput.facts as Fact[],
          context: obsInput.context as Record<string, unknown>,
          focusFacts: obsInput.focusFacts as Fact[],
        };
        const loadResult = dualStorage.loadRelevantKnowledge(observation);
        return { content: [{ type: 'text', text: JSON.stringify(loadResult, null, 2) }] };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Graceful shutdown handler
function shutdown() {
  console.error('Shutting down Causal Learner MCP Server...');
  if (pipeline) {
    pipeline.close();
  }
  if (storage) {
    storage.close();
  }
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Main entry point
async function main() {
  // Initialize storage based on mode
  if (USE_DUAL_LAYER && LONGTERM_DB_PATH) {
    // Dual-layer mode: short-term (memory) + long-term (persistent)
    dualStorage = createDualStorage(LONGTERM_DB_PATH);
    storage = dualStorage;
    console.error(`Causal Learner MCP Server initialized in DUAL-LAYER mode`);
    console.error(`  Short-term: in-memory (session-scoped)`);
    console.error(`  Long-term:  ${LONGTERM_DB_PATH}`);
  } else {
    // Single-layer mode (backward compatible)
    storage = createStorage(DB_PATH);
    console.error(`Causal Learner MCP Server initialized in SINGLE mode at: ${DB_PATH}`);
  }

  pipeline = new CausalPipeline(buildPipelineConfig(DB_PATH));
  console.error(`CausalPipeline initialized at sibling DB set derived from: ${DB_PATH}`);

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Causal Learner MCP Server running on stdio');
}

const entryFilePath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentModulePath = fileURLToPath(import.meta.url);

if (entryFilePath === currentModulePath) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
