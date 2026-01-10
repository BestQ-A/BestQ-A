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

// Core imports
import {
  createStorage,
  type CausalStorage,
  type Observation,
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

// Get database path from environment or use default
const DB_PATH = process.env.CAUSAL_DB_PATH || path.join(process.cwd(), 'data', 'causal.db');

// Initialize storage
let storage: CausalStorage;

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
];

// Generate unique observation ID
function generateObservationId(): string {
  return 'obs_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
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
        const obsInput = args?.observation as Record<string, unknown>;
        const observation: Observation = {
          observationId: (obsInput.observationId as string) || generateObservationId(),
          timestamp: (obsInput.timestamp as string) || new Date().toISOString(),
          facts: obsInput.facts as Fact[],
          context: obsInput.context as Record<string, unknown>,
          focusFacts: obsInput.focusFacts as Fact[],
          rawRefs: obsInput.rawRefs as string[],
          metadata: obsInput.metadata as Record<string, unknown>,
        };
        const result = submitObservationTool(storage, observation, args?.options as any);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
        const reg = recordFixTool(storage, args?.eventId as string, args?.fix as FixInfo);
        return { content: [{ type: 'text', text: JSON.stringify(reg, null, 2) }] };
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
  // Initialize storage (synchronous with better-sqlite3)
  storage = createStorage(DB_PATH);
  console.error(`Causal Learner MCP Server initialized with database at: ${DB_PATH}`);

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Causal Learner MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
