/**
 * Beam Search backward chaining explainer for the Causal Learner
 * Explains observations using causal regulation chains
 */

import type { Fact, Observation, Regulation, Story } from './types.js';
import { observationGoals } from './types.js';
import {
  Bindings,
  dedupFacts,
  factEntails,
  substituteFact,
  unifyFact,
} from './unify.js';

// Evidence kind weights
const EVI_WEIGHT: Record<string, number> = {
  intervention: 1.0,
  quasi_experiment: 0.8,
  observational: 0.5,
};

// Status weights
const STATUS_WEIGHT: Record<string, number> = {
  confirmed: 1.0,
  hypothesis: 0.85,
  candidate: 0.65,
  retired: 0.1,
};

export interface ExplainOptions {
  topK: number;
  beamSize: number;
  maxDepth: number;
  maxAssumptions: number;
  assumptionPenalty: number;
  lengthPenalty: number;
}

export const DEFAULT_EXPLAIN_OPTIONS: ExplainOptions = {
  topK: 5,
  beamSize: 20,
  maxDepth: 8,
  maxAssumptions: 10,
  assumptionPenalty: 1.2,
  lengthPenalty: 0.05,
};

function contextToFacts(context: Record<string, unknown> | undefined): Fact[] {
  if (!context) return [];
  return Object.entries(context).map(([k, v]) => ({
    pred: String(k),
    args: {},
    value: v,
  }));
}

function scopeCompatible(
  rule: Regulation,
  obsContext: Record<string, unknown> | undefined
): boolean {
  const ctx = obsContext || {};
  const scope = rule.scope || {};
  for (const [k, v] of Object.entries(scope)) {
    if (ctx[k] !== v) {
      return false;
    }
  }
  return true;
}

function repWeight(supportN: number, counterexampleN: number): number {
  const base = 1.0 - Math.exp(-Math.max(0, supportN) / 5.0);
  const baseAdjusted = Math.max(0.05, base);
  const penalty = Math.exp(-Math.max(0, counterexampleN));
  return Math.max(0.05, baseAdjusted * penalty);
}

function specWeight(rule: Regulation): number {
  const size = rule.pre.length + rule.eff.length;
  return Math.min(1.0, 0.4 + 0.05 * size);
}

export function ruleScore(rule: Regulation): number {
  const wEvi = EVI_WEIGHT[rule.evidenceKind || 'observational'] ?? 0.5;
  const wRep = repWeight(rule.supportN || 0, rule.counterexampleN || 0);
  const wSpec = specWeight(rule);
  const wStat = STATUS_WEIGHT[rule.status] ?? 0.8;
  const score = wEvi * wRep * wSpec * wStat;
  return Math.max(0.01, Math.min(1.0, score));
}

class EffectIndex {
  private idx: Map<string, Regulation[]> = new Map();

  constructor(regulations: Regulation[]) {
    for (const r of regulations) {
      for (const eff of r.eff) {
        const key = eff.pred + '|' + JSON.stringify(eff.value);
        const existing = this.idx.get(key) || [];
        existing.push(r);
        this.idx.set(key, existing);
      }
    }
  }

  candidates(goal: Fact): Regulation[] {
    const key = goal.pred + '|' + JSON.stringify(goal.value);
    return this.idx.get(key) || [];
  }
}

/** how-provenance：记录每步推导的精确路径 */
export interface ProvenanceStep {
  /** 使用的 regulation ID */
  regulationId: string;
  /** 本步要解释的 goal fact */
  matchedGoal: Fact;
  /** regulation 的哪些 pre 被已知 facts 满足 */
  satisfiedPre: Fact[];
  /** regulation 的哪些 pre 变成新的子目标 */
  newSubgoals: Fact[];
}

interface SearchNode {
  goals: Fact[];
  regulationIds: string[];
  assumptions: Fact[];
  bindings: Bindings;
  scoreLog: number;
  used: Set<string>;
  /** how-provenance 推导链 */
  provenance: ProvenanceStep[];
}

function chooseGoal(
  goals: Fact[],
  idx: EffectIndex,
  obsContext: Record<string, unknown> | undefined
): number {
  let bestI = 0;
  let bestCount = Infinity;

  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    const cands = idx.candidates(g).filter((r) => scopeCompatible(r, obsContext));
    const count = cands.length;
    if (count < bestCount) {
      bestCount = count;
      bestI = i;
    }
  }

  return bestI;
}

export function explainObservation(
  obs: Observation,
  regulations: Regulation[],
  options?: Partial<ExplainOptions>
): Story[] {
  const opts = { ...DEFAULT_EXPLAIN_OPTIONS, ...options };
  const goals = dedupFacts(observationGoals(obs));
  const known = dedupFacts([...obs.facts, ...contextToFacts(obs.context)]);
  const idx = new EffectIndex(regulations);

  const init: SearchNode = {
    goals: [...goals],
    regulationIds: [],
    assumptions: [],
    bindings: {},
    scoreLog: 0.0,
    used: new Set(),
    provenance: [],
  };

  let beam: SearchNode[] = [init];
  const completed: SearchNode[] = [];

  for (let depth = 0; depth < opts.maxDepth; depth++) {
    const newBeam: SearchNode[] = [];

    for (const node of beam) {
      if (node.goals.length === 0) {
        completed.push(node);
        continue;
      }

      const gi = chooseGoal(node.goals, idx, obs.context);
      const g = node.goals[gi];
      const rest = [...node.goals.slice(0, gi), ...node.goals.slice(gi + 1)];

      let expanded = false;

      for (const r of idx.candidates(g)) {
        if (node.used.has(r.regulationId)) {
          continue;
        }
        if (!scopeCompatible(r, obs.context)) {
          continue;
        }

        for (const eff of r.eff) {
          let b2 = unifyFact(eff, g, node.bindings);
          if (b2 === null) {
            continue;
          }
          expanded = true;

          const newGoals: Fact[] = [];
          const satisfiedPre: Fact[] = [];
          for (const p of r.pre) {
            const p2 = substituteFact(p, b2);
            const bKnown = factEntails(known, p2, b2);
            if (bKnown !== null) {
              b2 = bKnown;
              satisfiedPre.push(p2);
              continue;
            }
            newGoals.push(p2);
          }

          const merged = dedupFacts([...newGoals, ...rest]);
          const rs = ruleScore(r);
          const childScore = node.scoreLog + Math.log(rs) - opts.lengthPenalty;

          // how-provenance：记录本步推导
          const step: ProvenanceStep = {
            regulationId: r.regulationId,
            matchedGoal: g,
            satisfiedPre,
            newSubgoals: newGoals,
          };

          newBeam.push({
            goals: merged,
            regulationIds: [...node.regulationIds, r.regulationId],
            assumptions: [...node.assumptions],
            bindings: b2,
            scoreLog: childScore,
            used: new Set([...node.used, r.regulationId]),
            provenance: [...node.provenance, step],
          });
        }
      }

      if (expanded) {
        continue;
      }

      if (node.assumptions.length < opts.maxAssumptions) {
        newBeam.push({
          goals: [...rest],
          regulationIds: [...node.regulationIds],
          assumptions: [...node.assumptions, g],
          bindings: { ...node.bindings },
          scoreLog: node.scoreLog - opts.assumptionPenalty,
          used: new Set(node.used),
          provenance: [...node.provenance],
        });
      }
    }

    newBeam.sort((a, b) => b.scoreLog - a.scoreLog);
    beam = newBeam.slice(0, opts.beamSize);
  }

  const stories: Story[] = completed.map((n) => ({
    regulationIds: [...n.regulationIds],
    assumptions: [...n.assumptions],
    score: n.scoreLog / Math.max(1, n.regulationIds.length),
    provenance: [...n.provenance],
  }));

  stories.sort((a, b) => (b.score || 0) - (a.score || 0));
  return stories.slice(0, opts.topK);
}

export { EffectIndex };
