/**
 * Rule Inducer for the Causal Learner system
 * Induces candidate regulations from clusters of unexplained events
 */

import type { Event, Fact, Regulation, Json } from './types.js';
import { factFromDict } from './types.js';
import { signatureFull, signaturePredValue, dedupFacts } from './unify.js';

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

/**
 * effect 聚合用：只比较 pred+value 忽略 args，
 * 因为 effect 的语义是"什么发生了"，args 差异应进入 preconditions
 */
function mostCommonEffects(factsByEvent: Fact[][], minSupport: number): Fact[] {
  const counts = new Map<string, number>();
  const factBySig = new Map<string, Fact>();
  const n = factsByEvent.length;
  for (const facts of factsByEvent) {
    const seen = new Set<string>();
    for (const f of facts) {
      const sig = signaturePredValue(f);
      if (seen.has(sig)) continue;
      seen.add(sig);
      counts.set(sig, (counts.get(sig) || 0) + 1);
      // 保留第一个完整 fact（含 args）作为代表
      if (!factBySig.has(sig)) factBySig.set(sig, { pred: f.pred, value: f.value, args: {} });
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
    return JSON.stringify(a.value).localeCompare(JSON.stringify(b.value));
  });
  return out;
}

/**
 * P3: Discriminative Pattern Mining（AnyBURL 思路的最小可行实现）
 *
 * 替代 mostCommonFacts（集合交集），用 support × lift 选择有区分力的 pre facts：
 * - support = 本 cluster 中含该 fact 的比例（频率）
 * - lift = support / globalFreq（区分力：越高说明该 fact 对本 cluster 越特异）
 * - 按 score = support × lift 排序，取 top-k
 *
 * 这解决了"pre 退化为通用 facts"的根本问题：通用 facts 的 lift ≈ 1（无区分力），
 * 特异 facts 的 lift >> 1（高区分力）。
 */
function mineDiscriminativePatterns(
  cluster: Event[],
  allEvents: Event[],
  maxPatterns: number
): Fact[] {
  const n = cluster.length;
  const N = allEvents.length;
  if (n === 0 || N === 0) return [];

  // 统计本 cluster 中每个 fact 的频率
  const clusterCounts = new Map<string, number>();
  const factBySig = new Map<string, Fact>();
  for (const evt of cluster) {
    const seen = new Set<string>();
    for (const f of evt.observation.facts) {
      const sig = signaturePredValue(f);
      if (seen.has(sig)) continue;
      seen.add(sig);
      clusterCounts.set(sig, (clusterCounts.get(sig) || 0) + 1);
      if (!factBySig.has(sig)) factBySig.set(sig, { pred: f.pred, value: f.value, args: {} });
    }
    // context facts 也参与
    if (evt.context) {
      for (const [k, v] of Object.entries(evt.context)) {
        const sig = `${k}|${JSON.stringify(v)}`;
        if (!clusterCounts.has(sig)) {
          clusterCounts.set(sig, 0);
          factBySig.set(sig, { pred: k, value: v, args: {} });
        }
        clusterCounts.set(sig, clusterCounts.get(sig)! + 1);
      }
    }
  }

  // 统计全局频率（所有 events）
  const globalCounts = new Map<string, number>();
  for (const evt of allEvents) {
    const seen = new Set<string>();
    for (const f of evt.observation.facts) {
      const sig = signaturePredValue(f);
      if (seen.has(sig)) continue;
      seen.add(sig);
      globalCounts.set(sig, (globalCounts.get(sig) || 0) + 1);
    }
    if (evt.context) {
      for (const [k, v] of Object.entries(evt.context)) {
        const sig = `${k}|${JSON.stringify(v)}`;
        globalCounts.set(sig, (globalCounts.get(sig) || 0) + 1);
      }
    }
  }

  // 计算 score = support × lift，过滤低 support
  const candidates: Array<{ sig: string; support: number; lift: number; score: number }> = [];
  for (const [sig, count] of clusterCounts.entries()) {
    const support = count / n;
    if (support < 0.3) continue; // 至少 30% 的 cluster events 含该 fact
    const globalFreq = (globalCounts.get(sig) || 1) / N;
    const lift = support / globalFreq;
    if (lift <= 1.0) continue; // 无区分力的跳过
    candidates.push({ sig, support, lift, score: support * lift });
  }

  // 按 score 排序取 top-k
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxPatterns)
    .map(c => factBySig.get(c.sig)!)
    .filter(Boolean);
}

export function induceRegulation(
  cluster: Event[],
  options: Partial<InduceOptions> = {},
  allEvents?: Event[]
): Regulation {
  const opts = { ...DEFAULT_INDUCE_OPTIONS, ...options };
  const uaLists = cluster.map((e) => e.unexplainedAspects);
  // effect 聚合用 pred+value 匹配（忽略 args）
  let eff = mostCommonEffects(uaLists, 1.0);
  if (!eff.length) eff = mostCommonEffects(uaLists, opts.missingPreMinSupport).slice(0, opts.maxEffFacts);
  eff = eff.slice(0, opts.maxEffFacts);

  // P3: Discriminative Pattern Mining 替代集合交集
  let pre: Fact[];
  if (allEvents && allEvents.length > cluster.length) {
    // 有全局 events 参考时，用区分力挖掘
    pre = mineDiscriminativePatterns(cluster, allEvents, opts.maxPreFacts);
  } else {
    // 降级：沿用原有逻辑（context + missingPres + observation facts 交集）
    pre = [];
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
  }

  const effSigs = new Set(eff.map(signaturePredValue));
  const dedupedPre = dedupFacts(pre).filter((f) => !effSigs.has(signaturePredValue(f)));
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
    // P3: 传递 allEvents 启用 discriminative pattern mining
    const reg = induceRegulation(cluster, opts, eligibleEvents);
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
