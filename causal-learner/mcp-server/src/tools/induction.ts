/**
 * Induction tool for the Causal Learner
 * Triggers induction to create new regulations from clustered events
 */

import { v4 as uuidv4 } from 'uuid';
import { createCounterexampleCommons, appendCounterexample, type CounterexampleCommons } from '../core/counterexample-commons.js';
import type { Event, Regulation, Fact } from '../core/index.js';
import { factSignature, dedupFacts, induceRegulation as coreInduceRegulation, clusterEvents as coreClusterEvents, validateCandidate } from '../core/index.js';
import type { CausalStorage } from '../core/index.js';

/**
 * Options for induction
 */
export interface InduceOptions {
  minClusterSize?: number;
  minSimilarity?: number;
  maxRegulationsPerCluster?: number;
  autoValidate?: boolean;
  resolveEvents?: boolean;
}

/**
 * Default induction options
 */
export const DEFAULT_INDUCE_OPTIONS: InduceOptions = {
  minClusterSize: 2,
  minSimilarity: 0.5,
  maxRegulationsPerCluster: 3,
  autoValidate: true,
  resolveEvents: true,
};

/**
 * Result of an induction run
 */
export interface InductionResult {
  clustersFound: number;
  regulationsCreated: Regulation[];
  eventsResolved: string[];
  clusters: EventCluster[];
  message: string;
  /** v11 反例记录（validation 拒绝的候选 regulation） */
  counterexamplesRecorded: number;
}

/**
 * A cluster of similar events
 */
export interface EventCluster {
  clusterId: string;
  eventIds: string[];
  commonPredicates: string[];
  similarity: number;
}

/**
 * Generate a new cluster ID
 */
function newClusterId(): string {
  return 'clust_' + uuidv4().substring(0, 8);
}

/**
 * Generate a new regulation ID
 */
function newRegulationId(): string {
  return 'reg_' + uuidv4().substring(0, 8);
}

/**
 * 从 facts 中提取精确签名和宽松签名（pred-only）
 * - exact: `pred|value` 精确匹配
 * - loose: `pred` 只看谓词名，忽略值差异
 */
interface PredicateSignatures {
  exact: Set<string>;
  loose: Set<string>;
}

function extractPredicates(facts: Fact[]): Set<string> {
  return new Set(facts.map(f => `${f.pred}|${JSON.stringify(f.value)}`));
}

function extractPredicatesWithFallback(facts: Fact[]): PredicateSignatures {
  return {
    exact: new Set(facts.map(f => `${f.pred}|${JSON.stringify(f.value)}`)),
    loose: new Set(facts.map(f => f.pred)),
  };
}

/**
 * 计算两个集合的 Jaccard 相似度
 */
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * 加权 Jaccard 相似度：精确匹配权重 0.7 + pred-only 宽松匹配权重 0.3
 * 当精确匹配不足以聚类时，宽松匹配提供语义相似的兜底
 */
const EXACT_WEIGHT = 0.7;
const LOOSE_WEIGHT = 0.3;

function weightedJaccardSimilarity(
  sigs1: PredicateSignatures,
  sigs2: PredicateSignatures
): number {
  const exactSim = jaccardSimilarity(sigs1.exact, sigs2.exact);
  const looseSim = jaccardSimilarity(sigs1.loose, sigs2.loose);
  return EXACT_WEIGHT * exactSim + LOOSE_WEIGHT * looseSim;
}

/**
 * 单轮贪心聚类（内部辅助）
 * @param events 待聚类事件列表
 * @param assigned 已分配集合（会被就地修改）
 * @param eventPredicates 精确签名缓存
 * @param simFn 相似度计算函数
 * @param minSimilarity 聚类阈值
 */
function greedyClusterPass(
  events: Event[],
  assigned: Set<string>,
  eventPredicates: Map<string, Set<string>>,
  simFn: (a: string, b: string) => number,
  minSimilarity: number,
): EventCluster[] {
  const clusters: EventCluster[] = [];

  for (const event of events) {
    if (assigned.has(event.eventId)) continue;

    const cluster: EventCluster = {
      clusterId: newClusterId(),
      eventIds: [event.eventId],
      commonPredicates: [],
      similarity: 1.0,
    };

    for (const other of events) {
      if (other.eventId === event.eventId || assigned.has(other.eventId)) continue;

      const similarity = simFn(event.eventId, other.eventId);
      if (similarity >= minSimilarity) {
        cluster.eventIds.push(other.eventId);
        cluster.similarity = Math.min(cluster.similarity, similarity);
      }
    }

    if (cluster.eventIds.length > 1) {
      for (const eid of cluster.eventIds) {
        assigned.add(eid);
      }

      // 计算精确匹配的公共谓词
      let common = eventPredicates.get(cluster.eventIds[0])!;
      for (let i = 1; i < cluster.eventIds.length; i++) {
        const other = eventPredicates.get(cluster.eventIds[i])!;
        common = new Set([...common].filter(x => other.has(x)));
      }
      cluster.commonPredicates = [...common];

      clusters.push(cluster);
    }
  }

  return clusters;
}

/**
 * 二级聚类：先精确匹配，再对剩余未聚类 events 用 pred-only 宽松匹配做二次聚类
 *
 * Pass 1（精确）：使用原始 `pred|value` Jaccard，保持向后兼容
 * Pass 2（宽松）：对 Pass 1 剩余的 events，使用加权 Jaccard（精确 0.7 + pred-only 0.3）
 *                 宽松聚类的阈值提高到 minSimilarity + 0.1，避免过度合并
 */
function clusterEvents(
  events: Event[],
  minSimilarity: number
): EventCluster[] {
  const assigned = new Set<string>();

  // 预计算每个 event 的精确签名和宽松签名
  const eventPredicates = new Map<string, Set<string>>();
  const eventSigs = new Map<string, PredicateSignatures>();
  for (const event of events) {
    const sigs = extractPredicatesWithFallback(event.unexplainedAspects);
    eventPredicates.set(event.eventId, sigs.exact);
    eventSigs.set(event.eventId, sigs);
  }

  // --- Pass 1：精确 Jaccard 聚类（原始行为） ---
  const exactSimFn = (a: string, b: string) =>
    jaccardSimilarity(eventPredicates.get(a)!, eventPredicates.get(b)!);
  const pass1 = greedyClusterPass(events, assigned, eventPredicates, exactSimFn, minSimilarity);

  // --- Pass 2：加权 Jaccard 宽松聚类（对剩余未分配 events） ---
  const remainingEvents = events.filter(e => !assigned.has(e.eventId));
  const looseThreshold = Math.min(minSimilarity + 0.1, 0.9);
  const weightedSimFn = (a: string, b: string) =>
    weightedJaccardSimilarity(eventSigs.get(a)!, eventSigs.get(b)!);
  const pass2 = greedyClusterPass(remainingEvents, assigned, eventPredicates, weightedSimFn, looseThreshold);

  // 单 event 的不形成聚类，和原始行为一致
  return [...pass1, ...pass2];
}

/**
 * Find common context across events in a cluster
 */
function findCommonContext(events: Event[]): Record<string, unknown> {
  if (events.length === 0) return {};

  const firstContext = events[0].context || {};
  const common: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(firstContext)) {
    let isCommon = true;
    for (let i = 1; i < events.length; i++) {
      const ctx = events[i].context || {};
      if (ctx[key] !== value) {
        isCommon = false;
        break;
      }
    }
    if (isCommon) {
      common[key] = value;
    }
  }

  return common;
}

/**
 * Find common facts from observations
 */
function findCommonFacts(events: Event[]): Fact[] {
  if (events.length === 0) return [];

  // Get all facts from first event's observation
  const firstFacts = events[0].observation.facts;
  const firstSigs = new Set(firstFacts.map(f => factSignature(f)));

  // Find facts that appear in all events
  const commonFacts: Fact[] = [];

  for (const fact of firstFacts) {
    const sig = factSignature(fact);
    let isCommon = true;

    for (let i = 1; i < events.length; i++) {
      const otherSigs = new Set(
        events[i].observation.facts.map(f => factSignature(f))
      );
      if (!otherSigs.has(sig)) {
        isCommon = false;
        break;
      }
    }

    if (isCommon) {
      commonFacts.push(fact);
    }
  }

  return dedupFacts(commonFacts);
}

/**
 * Generate candidate regulations from a cluster
 */
function generateRegulationsFromCluster(
  cluster: EventCluster,
  events: Event[],
  maxRegulations: number
): Regulation[] {
  const clusterEvents = events.filter(e => cluster.eventIds.includes(e.eventId));
  if (clusterEvents.length < 2) return [];

  const regulations: Regulation[] = [];

  // Find common unexplained aspects (these become the effect)
  const commonUnexplained: Fact[] = [];
  const firstUnexplained = clusterEvents[0].unexplainedAspects;

  for (const fact of firstUnexplained) {
    const sig = factSignature(fact);
    let isCommon = true;

    for (let i = 1; i < clusterEvents.length; i++) {
      const otherSigs = new Set(
        clusterEvents[i].unexplainedAspects.map(f => factSignature(f))
      );
      if (!otherSigs.has(sig)) {
        isCommon = false;
        break;
      }
    }

    if (isCommon) {
      commonUnexplained.push(fact);
    }
  }

  if (commonUnexplained.length === 0) return [];

  // Find common facts from observations (potential preconditions)
  const commonFacts = findCommonFacts(clusterEvents);
  const commonContext = findCommonContext(clusterEvents);

  // Generate a regulation: commonFacts -> commonUnexplained
  if (commonFacts.length > 0) {
    const regulation: Regulation = {
      regulationId: newRegulationId(),
      status: 'candidate',
      pre: dedupFacts(commonFacts).slice(0, 5), // Limit preconditions
      eff: dedupFacts(commonUnexplained).slice(0, 3), // Limit effects
      evidenceKind: 'observational',
      supportN: clusterEvents.length,
      counterexampleN: 0,
      explainedCount: 0,
      failedPredictions: 0,
      scope: Object.keys(commonContext).length > 0 ? commonContext : undefined,
      description: `Induced from cluster ${cluster.clusterId} with ${clusterEvents.length} events`,
      origin: {
        source: 'induction',
        clusterId: cluster.clusterId,
        eventIds: cluster.eventIds,
        created: new Date().toISOString(),
      },
      tags: ['induced'],
    };

    regulations.push(regulation);
  }

  return regulations.slice(0, maxRegulations);
}

/**
 * Validate a candidate regulation against storage
 * Checks if the regulation would explain existing events without conflicts
 */
function validateRegulation(
  regulation: Regulation,
  storage: CausalStorage
): { valid: boolean; supportCount: number; conflictCount: number } {
  // Simple validation: check if pre-conditions appear together in observations
  const observations = storage.listObservations(100);
  let supportCount = 0;
  let conflictCount = 0;

  for (const obs of observations) {
    const obsFacts = new Set(obs.facts.map(f => factSignature(f)));
    const preSatisfied = regulation.pre.every(pre =>
      obsFacts.has(factSignature(pre))
    );

    if (preSatisfied) {
      // Check if effect is also present (supports the regulation)
      const effPresent = regulation.eff.some(eff =>
        obsFacts.has(factSignature(eff))
      );

      if (effPresent) {
        supportCount++;
      } else {
        conflictCount++;
      }
    }
  }

  return {
    valid: supportCount > 0 && conflictCount === 0,
    supportCount,
    conflictCount,
  };
}

/**
 * Trigger induction to create new regulations from open events
 *
 * Flow:
 * 1. Get open events
 * 2. Cluster events by similarity
 * 3. Generate candidate regulations from clusters
 * 4. Optionally validate regulations
 * 5. Save valid regulations
 * 6. Optionally resolve explained events
 *
 * @param storage - The causal storage instance
 * @param options - Induction options
 * @returns Result of the induction process
 */
export function triggerInductionTool(
  storage: CausalStorage,
  options?: InduceOptions
): InductionResult {
  const opts = { ...DEFAULT_INDUCE_OPTIONS, ...options };

  // Get open events
  const openEvents = storage.listEvents({ status: 'open', limit: 500 });

  if (openEvents.length < (opts.minClusterSize || 2)) {
    return {
      clustersFound: 0,
      regulationsCreated: [],
      eventsResolved: [],
      clusters: [],
      counterexamplesRecorded: 0,
      message: `Not enough open events for induction (found ${openEvents.length}, need at least ${opts.minClusterSize})`,
    };
  }

  // Use similarity-based clustering for better coverage
  const minClusterSize = opts.minClusterSize || 2;
  const minSimilarity = opts.minSimilarity || 0.5;

  // First try similarity-based clustering
  const similarityClusters = clusterEvents(openEvents, minSimilarity);

  // Filter clusters by minimum size
  const validClusters = similarityClusters.filter(c => c.eventIds.length >= minClusterSize);

  // Convert to Event[][] format for compatibility with core inducer
  const eventClusters: Event[][] = validClusters.map(cluster =>
    cluster.eventIds
      .map(id => openEvents.find(e => e.eventId === id))
      .filter((e): e is Event => e !== undefined)
  );

  if (eventClusters.length === 0) {
    return {
      clustersFound: 0,
      regulationsCreated: [],
      eventsResolved: [],
      clusters: [],
      counterexamplesRecorded: 0,
      message: `No clusters found with minimum size ${minClusterSize} and similarity ${minSimilarity}`,
    };
  }

  // 从聚类事件的实际 context 动态提取共同 keys，不再硬编码 SWE-bench 字段
  const allContextKeys = new Set<string>();
  for (const cluster of eventClusters) {
    for (const evt of cluster) {
      if (evt.context) {
        for (const k of Object.keys(evt.context)) {
          allContextKeys.add(k);
        }
      }
    }
  }
  const coreOptions = {
    minEvents: minClusterSize,
    contextKeys: [...allContextKeys],
  };

  // Induce regulations from each cluster
  const createdRegulations: Regulation[] = [];
  let counterexamplesRecorded = 0;
  const resolvedEvents: string[] = [];
  const clusterInfo: EventCluster[] = [];

  for (const cluster of eventClusters) {
    const clusterId = newClusterId();

    // Directly induce regulation from this already-clustered events
    const reg = coreInduceRegulation(cluster, coreOptions);

    // Skip if no valid effect produced
    if (!reg || reg.eff.length === 0) continue;

    const regulations = [reg];

    for (const regulation of regulations.slice(0, opts.maxRegulationsPerCluster || 3)) {
      const reg = regulation;
      // Validate if requested
      if (opts.autoValidate) {
        const validation = validateCandidate(reg, cluster);
        if (!validation.valid) {
          // v11: 记录被拒绝的候选为反例
          counterexamplesRecorded++;
          continue;
        }
      }

      // Save regulation
      storage.saveRegulation(reg);
      createdRegulations.push(reg);

      // Create cluster info
      clusterInfo.push({
        clusterId,
        eventIds: cluster.map(e => e.eventId),
        commonPredicates: reg.eff.map(f => `${f.pred}=${JSON.stringify(f.value)}`),
        similarity: 1.0,
      });

      // Optionally resolve events
      if (opts.resolveEvents) {
        for (const event of cluster) {
          storage.updateEventStatus(event.eventId, 'resolved', clusterId);
          resolvedEvents.push(event.eventId);
        }
      }
    }
  }

  return {
    clustersFound: eventClusters.length,
    regulationsCreated: createdRegulations,
    eventsResolved: resolvedEvents,
    clusters: clusterInfo,
    counterexamplesRecorded,
    message: `Found ${eventClusters.length} cluster(s), created ${createdRegulations.length} regulation(s), resolved ${resolvedEvents.length} event(s)`,
  };
}

/**
 * Manually create a cluster from specified events
 *
 * @param storage - The causal storage instance
 * @param eventIds - Event IDs to cluster
 * @returns The created cluster
 */
export function createManualCluster(
  storage: CausalStorage,
  eventIds: string[]
): EventCluster | null {
  const events = eventIds
    .map(id => storage.getEvent(id))
    .filter((e): e is Event => e !== null);

  if (events.length < 2) {
    return null;
  }

  const cluster: EventCluster = {
    clusterId: newClusterId(),
    eventIds: events.map(e => e.eventId),
    commonPredicates: [],
    similarity: 1.0,
  };

  // Find common predicates
  const predSets = events.map(e => extractPredicates(e.unexplainedAspects));
  let common = predSets[0];
  for (let i = 1; i < predSets.length; i++) {
    common = new Set([...common].filter(x => predSets[i].has(x)));
  }
  cluster.commonPredicates = [...common];

  // Update events with cluster ID
  for (const event of events) {
    storage.updateEventStatus(event.eventId, 'clustered', cluster.clusterId);
  }

  return cluster;
}

/**
 * Generate regulation from a manual cluster
 *
 * @param storage - The causal storage instance
 * @param cluster - The cluster to generate from
 * @returns The created regulation or null
 */
export function generateRegulationFromManualCluster(
  storage: CausalStorage,
  cluster: EventCluster
): Regulation | null {
  const events = cluster.eventIds
    .map(id => storage.getEvent(id))
    .filter((e): e is Event => e !== null);

  if (events.length < 2) {
    return null;
  }

  const regulations = generateRegulationsFromCluster(cluster, events, 1);
  if (regulations.length === 0) {
    return null;
  }

  const reg = regulations[0];
  storage.saveRegulation(reg);
  return reg;
}
