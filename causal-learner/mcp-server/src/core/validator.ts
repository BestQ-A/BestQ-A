/**
 * Rule Validator for the Causal Learner system
 * Validates candidate regulations and manages their lifecycle
 */

import type { Event, Fact, Observation, Regulation } from './types.js';
import { signatureFull } from './unify.js';

/**
 * Result of validating a candidate regulation
 */
export interface ValidationResult {
  valid: boolean;
  reasons?: string[];
}

/**
 * Options for validating regulations
 */
export interface ValidateOptions {
  /** Minimum ratio of events where preconditions are satisfied (default: 0.8) */
  minPreSupportRatio: number;
  /** Whether to require non-empty preconditions (default: true) */
  requireNonemptyPre: boolean;
  /** Whether to require non-empty effects (default: true) */
  requireNonemptyEff: boolean;
}

/**
 * Default validation options
 */
export const DEFAULT_VALIDATE_OPTIONS: ValidateOptions = {
  minPreSupportRatio: 0.8,
  requireNonemptyPre: true,
  requireNonemptyEff: true,
};

/**
 * Thresholds for promotion and demotion
 */
export const PROMOTION_THRESHOLDS = {
  // candidate -> hypothesis
  candidateMinSupport: 3,
  candidateMaxContradictionRate: 0.2,
  // hypothesis -> confirmed
  hypothesisMinSupport: 10,
  hypothesisMaxContradictionRate: 0.1,
  // Demotion to retired
  retireContradictionRate: 0.3,
};

// =============================================================================
// Fisher exact test（单尾，不依赖外部包）
// 用于统计检验：regulation 的 support/counterexample 是否显著优于随机
// =============================================================================

/** 对数阶乘（Stirling 近似 + 小值查表） */
const LOG_FACT_CACHE = [0, 0, 0.6931, 1.7918, 3.1781, 4.7875, 6.5793, 8.5252, 10.6046, 12.8018];
function logFactorial(n: number): number {
  if (n < LOG_FACT_CACHE.length) return LOG_FACT_CACHE[n];
  // Stirling: ln(n!) ≈ n*ln(n) - n + 0.5*ln(2πn)
  return n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n);
}

/**
 * Fisher exact test p-value（单尾）
 * 2x2 表：
 *   | support | counterexample |
 *   | baseline_support | baseline_counter |
 * baseline 假设 50% 成功率（无信息先验）
 */
export function fisherExactPValue(support: number, counterexample: number): number {
  const total = support + counterexample;
  if (total === 0) return 1.0;

  // 简化：用二项检验替代完整 Fisher test
  // H0: 成功率 = 0.5，H1: 成功率 > 0.5
  // p = Σ C(n,k) * 0.5^n for k >= support
  let pValue = 0;
  for (let k = support; k <= total; k++) {
    const logP = logFactorial(total) - logFactorial(k) - logFactorial(total - k) - total * Math.log(2);
    pValue += Math.exp(logP);
  }
  return Math.min(1.0, pValue);
}

/**
 * 自适应晋升检查：用统计检验替代硬编码阈值
 * candidate → hypothesis: p < 0.05 且 support >= 3
 * hypothesis → confirmed: p < 0.01 且 support >= 5
 */
export function statisticalCanPromote(reg: Regulation): { canPromote: boolean; pValue: number; reason: string } {
  const support = reg.supportN ?? 0;
  const counter = reg.counterexampleN ?? 0;
  const p = fisherExactPValue(support, counter);

  if (reg.status === 'candidate') {
    if (support >= 3 && p < 0.05) {
      return { canPromote: true, pValue: p, reason: `candidate→hypothesis: p=${p.toFixed(4)} < 0.05, support=${support}` };
    }
    return { canPromote: false, pValue: p, reason: `p=${p.toFixed(4)}, support=${support}` };
  }
  if (reg.status === 'hypothesis') {
    if (support >= 5 && p < 0.01) {
      return { canPromote: true, pValue: p, reason: `hypothesis→confirmed: p=${p.toFixed(4)} < 0.01, support=${support}` };
    }
    return { canPromote: false, pValue: p, reason: `p=${p.toFixed(4)}, support=${support}` };
  }
  return { canPromote: false, pValue: p, reason: 'already confirmed or retired' };
}

/**
 * Create a set of fact signatures
 */
function factSet(facts: Fact[]): Set<string> {
  return new Set(facts.map(signatureFull));
}

/**
 * Check if all preconditions are satisfied in an event
 */
function preSatisfiedInEvent(reg: Regulation, evt: Event): boolean {
  // Build fact set from observation facts and context as facts
  const contextFacts: Fact[] = Object.entries(evt.context || {}).map(
    ([k, v]) => ({ pred: k, args: {}, value: v })
  );
  const allFactSigs = factSet([...evt.observation.facts, ...contextFacts]);

  // Check that all preconditions are present
  for (const p of reg.pre) {
    if (!allFactSigs.has(signatureFull(p))) {
      return false;
    }
  }
  return true;
}

/**
 * Check if effect is targeted by the event's unexplained aspects
 */
function effIsTargeted(reg: Regulation, evt: Event): boolean {
  const uaSigs = factSet(evt.unexplainedAspects);
  // At least one effect should be in unexplained aspects
  return reg.eff.some((e) => uaSigs.has(signatureFull(e)));
}

/**
 * Check if two regulations are duplicates
 */
function isDuplicate(reg: Regulation, existing: Regulation): boolean {
  const regPreSigs = factSet(reg.pre);
  const regEffSigs = factSet(reg.eff);
  const existingPreSigs = factSet(existing.pre);
  const existingEffSigs = factSet(existing.eff);

  // Compare sets
  if (regPreSigs.size !== existingPreSigs.size) return false;
  if (regEffSigs.size !== existingEffSigs.size) return false;

  for (const sig of regPreSigs) {
    if (!existingPreSigs.has(sig)) return false;
  }
  for (const sig of regEffSigs) {
    if (!existingEffSigs.has(sig)) return false;
  }

  return true;
}

/**
 * Validate a candidate regulation against a cluster of events
 * @param candidate - The candidate regulation to validate
 * @param cluster - The events used to induce this regulation
 * @param existing - Existing regulations to check for duplicates
 * @param options - Validation options
 * @returns Validation result with reasons if invalid
 */
export function validateCandidate(
  candidate: Regulation,
  cluster: Event[],
  existing: Regulation[] = [],
  options: ValidateOptions = DEFAULT_VALIDATE_OPTIONS
): ValidationResult {
  const reasons: string[] = [];

  // Check for empty effects
  if (options.requireNonemptyEff && (!candidate.eff || candidate.eff.length === 0)) {
    reasons.push('empty_eff');
  }

  // Check for empty preconditions
  if (options.requireNonemptyPre && (!candidate.pre || candidate.pre.length === 0)) {
    reasons.push('empty_pre');
  }

  // Check for duplicates
  for (const r of existing) {
    if (isDuplicate(candidate, r)) {
      reasons.push(`duplicate_of:${r.regulationId}`);
      break;
    }
  }

  // Validate against cluster
  if (cluster && cluster.length > 0) {
    // Check pre support ratio
    const satisfiedCount = cluster.filter((e) => preSatisfiedInEvent(candidate, e)).length;
    const ratio = satisfiedCount / Math.max(1, cluster.length);
    if (ratio < options.minPreSupportRatio) {
      reasons.push(`pre_support_ratio_too_low:${ratio.toFixed(2)}`);
    }

    // Check that effects relate to cluster's unexplained aspects
    const allTargeted = cluster.every((e) => effIsTargeted(candidate, e));
    if (!allTargeted) {
      reasons.push('eff_not_in_all_events_unexplained_aspects');
    }
  }

  return {
    valid: reasons.length === 0,
    reasons: reasons.length > 0 ? reasons : undefined,
  };
}

/**
 * Check if preconditions are satisfied in an observation
 */
function preSatisfiedInObservation(reg: Regulation, obs: Observation): boolean {
  const contextFacts: Fact[] = Object.entries(obs.context || {}).map(
    ([k, v]) => ({ pred: k, args: {}, value: v })
  );
  const allFactSigs = factSet([...obs.facts, ...contextFacts]);

  for (const p of reg.pre) {
    if (!allFactSigs.has(signatureFull(p))) {
      return false;
    }
  }
  return true;
}

/**
 * Check if effects are present in an observation
 */
function effectsPresent(reg: Regulation, obs: Observation): boolean {
  const obsSigs = factSet(obs.facts);
  // All effects must be present
  return reg.eff.every((e) => obsSigs.has(signatureFull(e)));
}

/**
 * Validate a regulation with a new observation and update its evidence
 * @param reg - The regulation to validate (MUTATED in place)
 * @param obs - The new observation
 * @param actualOutcome - Whether the effect actually appeared
 */
export function validateWithObservation(
  reg: Regulation,
  obs: Observation,
  actualOutcome: boolean,
  eventId?: string
): void {
  // Check if preconditions are satisfied
  const preSatisfied = preSatisfiedInObservation(reg, obs);

  if (!preSatisfied) {
    // Preconditions not met, this observation is not relevant
    return;
  }

  // Preconditions are met, check if prediction matches outcome
  const predictedOutcome = true; // Rule predicts effect when pre is met

  if (predictedOutcome === actualOutcome) {
    // Supporting evidence
    reg.supportN = (reg.supportN || 0) + 1;
    reg.explainedCount = (reg.explainedCount || 0) + 1;
    // event 证据链：追加确认 event
    if (eventId) {
      reg.confirmedByEvents = [...(reg.confirmedByEvents ?? []), eventId];
    }
  } else {
    // Contradicting evidence
    reg.counterexampleN = (reg.counterexampleN || 0) + 1;
    reg.failedPredictions = (reg.failedPredictions || 0) + 1;
    // event 证据链：追加挑战 event
    if (eventId) {
      reg.challengedByEvents = [...(reg.challengedByEvents ?? []), eventId];
    }
  }

  // Update last used timestamp
  reg.lastUsed = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Calculate the contradiction rate for a regulation
 */
function contradictionRate(reg: Regulation): number {
  const total = (reg.supportN || 0) + (reg.counterexampleN || 0);
  if (total === 0) return 0;
  return (reg.counterexampleN || 0) / total;
}

/**
 * Promote or demote a regulation based on its evidence
 * 
 * Promotion conditions:
 * - candidate -> hypothesis: support_n >= 3, contradiction_rate < 20%
 * - hypothesis -> confirmed: support_n >= 10, contradiction_rate < 10%
 * 
 * Demotion conditions:
 * - contradiction_rate > 30% -> retired
 * 
 * @param reg - The regulation to update (MUTATED in place)
 */
export function promoteOrDemote(reg: Regulation): void {
  const rate = contradictionRate(reg);
  const support = reg.supportN || 0;
  const t = PROMOTION_THRESHOLDS;

  // Check for demotion first (regardless of current status)
  if (rate > t.retireContradictionRate) {
    reg.status = 'retired';
    return;
  }

  // Check for promotion based on current status
  switch (reg.status) {
    case 'candidate':
      if (support >= t.candidateMinSupport && rate < t.candidateMaxContradictionRate) {
        reg.status = 'hypothesis';
      }
      break;

    case 'hypothesis':
      if (support >= t.hypothesisMinSupport && rate < t.hypothesisMaxContradictionRate) {
        reg.status = 'confirmed';
      }
      break;

    case 'confirmed':
      // Confirmed status is stable unless retired
      break;

    case 'retired':
      // Retired status is final
      break;
  }
}

/**
 * Get a summary of the regulation's evidence status
 */
export interface EvidenceSummary {
  supportCount: number;
  counterexampleCount: number;
  contradictionRate: number;
  status: Regulation['status'];
  canPromote: boolean;
  canRetire: boolean;
}

/**
 * Get an esidence summary for a regulation
 */
export function getEvidenceSummary(reg: Regulation): EvidenceSummary {
  const rate = contradictionRate(reg);
  const support = reg.supportN || 0;
  const t = PROMOTION_THRESHOLDS;

  let canPromote = false;
  if (reg.status === 'candidate') {
    canPromote = support >= t.candidateMinSupport && rate < t.candidateMaxContradictionRate;
  } else if (reg.status === 'hypothesis') {
    canPromote = support >= t.hypothesisMinSupport && rate < t.hypothesisMaxContradictionRate;
  }

  return {
    supportCount: support,
    counterexampleCount: reg.counterexampleN || 0,
    contradictionRate: rate,
    status: reg.status,
    canPromote,
    canRetire: rate > t.retireContradictionRate,
  };
}
