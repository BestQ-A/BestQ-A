/**
 * Rule Inducer for the Causal Learner system
 * Induces candidate regulations from clusters of unexplained events
 */

import type { Event, Fact, Regulation, Json } from './types.js';
import { factFromDict } from './types.js';
import { signatureFull, dedupFacts } from './unify.js';

export interface InduceOptions {
  minEvents: number;
  contextKeys: string[];
  missingPreMinSupport: number;
  factMinSupport: number;
  maxPreFacts: number;
  maxEffFacts: number;
}

export const DEFAULT_INDUCE_OPTIONS: InduceOptions = {
  minEvents: 3,
  contextKeys: ['env.os', 'gpu.model', 'driver.version', 'device.kind'],
  missingPreMinSupport: 0.6,
  factMinSupport: 0.8,
  maxPreFacts: 8,
  maxEffFacts: 3,
};

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function newRegId(): string {
  const hex = Math.random().toString(16).substring(2, 10);
  return `reg_${hex}`;
}

function clusterKey(evt: Event, contextKeys: string[]): string {
  const uaSigs = evt.unexplainedAspects
    .map((f) => `${f.pred}=${JSON.stringify(f.value)}`)
    .sort();
  const uaKey = uaSigs.join('|');
  const ctxParts: string[] = [];
  const ctx = evt.context || {};
  for (const k of contextKeys) {
    if (k in ctx) ctxParts.push(`${k}:${JSON.stringify(ctx[k])}`);
  }
  return `${uaKey}::${ctxParts.join('|')}`;
}

export function clusterEvents(
  events: Event[],
  options: Partial<InduceOptions> = {}
): Event[][] {
  const opts = { ...DEFAULT_INDUCE_OPTIONS, ...options };
  const buckets = new Map<string, Event[]>();
  for (const evt of events) {
    const key = clusterKey(evt, opts.contextKeys);
    const bucket = buckets.get(key) || [];
    bucket.push(evt);
    buckets.set(key, bucket);
  }
  const clusters: Event[][] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length >= opts.minEvents) clusters.push(bucket);
  }
  return clusters;
}

function factsFromMissingPres(evt: Event): Fact[] {
  if (!evt.attemptedExplanations?.length) return [];
  const top = evt.attemptedExplanations[0];
  // Get missing preconditions from the explanation attempt
  const missingPres = top.missingPres || [];
  return [...missingPres];
}

function factsFromContext(events: Event[], contextKeys: string[]): Fact[] {
  const out: Fact[] = [];
  for (const k of contextKeys) {
    const vals: unknown[] = [];
    for (const evt of events) {
      const ctx = evt.context || {};
      if (k in ctx) vals.push(ctx[k]);
    }
    if (!vals.length) continue;
    const firstVal = vals[0];
    if (vals.every((v) => JSON.stringify(v) === JSON.stringify(firstVal))) {
      out.push({ pred: k, args: {}, value: firstVal });
    }
  }
  return out;
}

function mostCommonFacts(factsByEvent: Fact[][], minSupport: number): Fact[] {
  const counts = new Map<string, number>();
  const factBySig = new Map<string, Fact>();
  const n = factsByEvent.length;
  for (const facts of factsByEvent) {
    const seen = new Set<string>();
    for (const f of facts) {
      const sig = signatureFull(f);
      if (seen.has(sig)) continue;
      seen.add(sig);
      counts.set(sig, (counts.get(sig) || 0) + 1);
      if (!factBySig.has(sig)) factBySig.set(sig, f);
    }
  }
  const out: Fact[] = [];
  for (const [sig, count] of counts.entries()) {
    if (count / Math.max(1, n) >= minSupport) {
      const fact = factBySig.get(sig);
      if (fact) out.push(fact);
    }
  }
  out.sort((a, b) => {
    const predCmp = a.pred.localeCompare(b.pred);
    if (predCmp !== 0) return predCmp;
    const argsCmp = JSON.stringify(a.args).localeCompare(JSON.stringify(b.args));
    if (argsCmp !== 0) return argsCmp;
    return JSON.stringify(a.value).localeCompare(JSON.stringify(b.value));
  });
  return out;
}

export function induceRegulation(
  cluster: Event[],
  options: Partial<InduceOptions> = {}
): Regulation {
  const opts = { ...DEFAULT_INDUCE_OPTIONS, ...options };
  const uaLists = cluster.map((e) => e.unexplainedAspects);
  let eff = mostCommonFacts(uaLists, 1.0);
  if (!eff.length) eff = mostCommonFacts(uaLists, opts.missingPreMinSupport).slice(0, opts.maxEffFacts);
  eff = eff.slice(0, opts.maxEffFacts);

  const pre: Fact[] = [];
  pre.push(...factsFromContext(cluster, opts.contextKeys));
  const missingPresLists = cluster.map((e) => factsFromMissingPres(e));
  pre.push(...mostCommonFacts(missingPresLists, opts.missingPreMinSupport));

  const obsFactLists: Fact[][] = [];
  for (const evt of cluster) {
    const focusSigs = new Set((evt.observation.focusFacts || []).map(signatureFull));
    const supportFacts = evt.observation.facts.filter((f) => !focusSigs.has(signatureFull(f)));
    obsFactLists.push(supportFacts);
  }
  pre.push(...mostCommonFacts(obsFactLists, opts.factMinSupport));

  const effSigs = new Set(eff.map(signatureFull));
  const dedupedPre = dedupFacts(pre).filter((f) => !effSigs.has(signatureFull(f)));
  const finalPre = dedupedPre.slice(0, opts.maxPreFacts);

  return {
    regulationId: newRegId(),
    status: 'candidate',
    pre: finalPre,
    eff: eff,
    evidenceKind: 'observational',
    supportN: cluster.length,
    counterexampleN: 0,
    explainedCount: cluster.length,
    failedPredictions: 0,
    lastUsed: undefined,
    scope: {},
    description: 'Induced from event cluster (MVP heuristic).',
    cost: 1.0,
    risk: 1.0,
    origin: {
      inducedFromEvents: cluster.map((e) => e.eventId),
      inducedAt: nowIso(),
      inducedMethod: 'cluster_intersection+missing_pre+common_context',
    },
    nextTests: [],
    tags: ['induced'],
  };
}

export function induceFromEvents(events: Event[], options?: Partial<InduceOptions>): Regulation[] {
  const opts: InduceOptions = { ...DEFAULT_INDUCE_OPTIONS, ...options };
  const eligibleEvents = events.filter(
    (e) => (e.status === 'open' || e.status === undefined) && e.unexplainedAspects?.length > 0
  );
  if (eligibleEvents.length < opts.minEvents) return [];
  const clusters = clusterEvents(eligibleEvents, opts);
  const regulations: Regulation[] = [];
  for (const cluster of clusters) {
    const reg = induceRegulation(cluster, opts);
    if (reg.eff.length > 0) regulations.push(reg);
  }
  return regulations;
}

export interface ClusterStats {
  clusterId: string;
  eventCount: number;
  commonUnexplained: string[];
  commonContext: Record<string, unknown>;
}

export function analyzeCluster(cluster: Event[], options: InduceOptions = DEFAULT_INDUCE_OPTIONS): ClusterStats {
  const uaLists = cluster.map((e) => e.unexplainedAspects);
  const commonUa = mostCommonFacts(uaLists, 1.0);
  const commonCtx: Record<string, unknown> = {};
  for (const k of options.contextKeys) {
    const vals: unknown[] = [];
    for (const evt of cluster) {
      const ctx = evt.context || {};
      if (k in ctx) vals.push(ctx[k]);
    }
    if (vals.length > 0) {
      const firstVal = vals[0];
      if (vals.every((v) => JSON.stringify(v) === JSON.stringify(firstVal))) {
        commonCtx[k] = firstVal;
      }
    }
  }
  return {
    clusterId: cluster[0]?.clusterId || `cluster_${cluster.length}`,
    eventCount: cluster.length,
    commonUnexplained: commonUa.map((f) => `${f.pred}=${JSON.stringify(f.value)}`),
    commonContext: commonCtx,
  };
}
