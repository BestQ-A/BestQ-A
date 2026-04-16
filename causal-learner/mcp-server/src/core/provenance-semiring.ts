/**
 * Provenance Semiring — 借鉴 Scallop 的 top-k probability semiring
 *
 * 将 explainer 的 provenance 从布尔升级到概率半环：
 * - 每条推导路径携带概率 score（来自 regulation 的 support/confidence）
 * - 只保留 top-k 个最优证明（避免指数爆炸）
 * - 最终结果按概率排序
 *
 * 三种 semiring 实现：
 * 1. BooleanSemiring：add=OR, mul=AND — 当前行为的代数化表达
 * 2. ProbabilitySemiring：add=max, mul=乘 — 概率链式推导
 * 3. TopKSemiring<K>：维护 top-k 个最优证明，add=merge+truncate, mul=cross product+truncate
 */

import type { Fact, Observation, Regulation } from './types.js';
import { observationGoals } from './types.js';
import {
  type Bindings,
  dedupFacts,
  factEntails,
  substituteFact,
  unifyFact,
} from './unify.js';
import {
  type ExplainOptions,
  type ProvenanceStep,
  DEFAULT_EXPLAIN_OPTIONS,
  ruleScore,
  EffectIndex,
} from './explainer.js';

// =============================================================================
// Semiring 接口
// =============================================================================

/** Provenance semiring：追踪推导路径的代数结构 */
export interface ProvenanceSemiring<T> {
  /** 空证明（加法零元 / 乘法吸收元） */
  zero: T;
  /** 平凡证明（乘法单元） */
  one: T;
  /** 合并两条证明（取并 / 取最优） */
  add(a: T, b: T): T;
  /** 组合推导步骤（链式概率） */
  mul(a: T, b: T): T;
}

// =============================================================================
// ProvenanceTag — 带概率的推导证明标签
// =============================================================================

/** 单条推导证明的标签 */
export interface ProvenanceTag {
  /** 该证明的概率 [0,1] */
  probability: number;
  /** 使用的 regulation IDs 链 */
  regulationChain: string[];
  /** 推导步数 */
  stepCount: number;
}

// =============================================================================
// BooleanSemiring
// =============================================================================

/** 布尔半环：add=OR, mul=AND — 等价于当前 explainer 的行为 */
export class BooleanSemiring implements ProvenanceSemiring<boolean> {
  readonly zero = false;
  readonly one = true;

  add(a: boolean, b: boolean): boolean {
    return a || b;
  }

  mul(a: boolean, b: boolean): boolean {
    return a && b;
  }
}

// =============================================================================
// ProbabilitySemiring
// =============================================================================

/** 概率半环：add=max, mul=乘 — 概率链式推导 */
export class ProbabilitySemiring implements ProvenanceSemiring<number> {
  readonly zero = 0;
  readonly one = 1;

  /** 取两条证明中概率更高的那条 */
  add(a: number, b: number): number {
    return Math.max(a, b);
  }

  /** 链式组合：概率相乘 */
  mul(a: number, b: number): number {
    return a * b;
  }
}

// =============================================================================
// TopKSemiring
// =============================================================================

/** top-k 证明列表：每个元素是一条 ProvenanceTag */
export type TopKProofs = ProvenanceTag[];

/** Top-K Probability Semiring：维护 top-k 个最优证明 */
export class TopKSemiring implements ProvenanceSemiring<TopKProofs> {
  readonly zero: TopKProofs = [];
  readonly one: TopKProofs = [{ probability: 1, regulationChain: [], stepCount: 0 }];
  private readonly k: number;

  constructor(k: number) {
    if (k < 1) throw new Error('TopKSemiring: k 必须 >= 1');
    this.k = k;
  }

  /** 合并两组证明，保留 top-k 个概率最高的 */
  add(a: TopKProofs, b: TopKProofs): TopKProofs {
    const merged = [...a, ...b];
    merged.sort((x, y) => y.probability - x.probability);
    return merged.slice(0, this.k);
  }

  /** 交叉乘积：每对 (a_i, b_j) 组合概率、合并 regulation 链，保留 top-k */
  mul(a: TopKProofs, b: TopKProofs): TopKProofs {
    if (a.length === 0 || b.length === 0) return [];
    const results: ProvenanceTag[] = [];
    for (const ai of a) {
      for (const bj of b) {
        results.push({
          probability: ai.probability * bj.probability,
          regulationChain: [...ai.regulationChain, ...bj.regulationChain],
          stepCount: ai.stepCount + bj.stepCount,
        });
      }
    }
    results.sort((x, y) => y.probability - x.probability);
    return results.slice(0, this.k);
  }
}

// =============================================================================
// ScoredStory — scoredExplain 的输出
// =============================================================================

/** 带概率排序的解释结果 */
export interface ScoredStory {
  /** 使用的 regulation IDs */
  regulationIds: string[];
  /** 无法用已知 regulation 解释的假设 */
  assumptions: Fact[];
  /** 该证明的概率 score [0,1] */
  probability: number;
  /** 推导步数 */
  stepCount: number;
  /** how-provenance 推导链 */
  provenance: ProvenanceStep[];
}

// =============================================================================
// 内部搜索节点
// =============================================================================

/** beam search 内部节点（携带 semiring 概率） */
interface ScoredSearchNode {
  goals: Fact[];
  regulationIds: string[];
  assumptions: Fact[];
  bindings: Bindings;
  /** semiring 概率（用于排序和最终输出） */
  probability: number;
  /** log-score（用于 beam 内排序，兼容 lengthPenalty） */
  scoreLog: number;
  used: Set<string>;
  provenance: ProvenanceStep[];
  stepCount: number;
}

// =============================================================================
// 辅助函数
// =============================================================================

/** 从 context 提取 facts（复用 explainer 逻辑） */
function contextToFacts(context: Record<string, unknown> | undefined): Fact[] {
  if (!context) return [];
  return Object.entries(context).map(([k, v]) => ({
    pred: String(k),
    args: {},
    value: v,
  }));
}

/** scope 兼容检查（复用 explainer 逻辑） */
function scopeCompatible(
  rule: Regulation,
  obsContext: Record<string, unknown> | undefined,
): boolean {
  const ctx = obsContext || {};
  const scope = rule.scope || {};
  for (const [k, v] of Object.entries(scope)) {
    if (ctx[k] !== v) return false;
  }
  return true;
}

/** MRV 启发式：选择候选最少的 goal 优先展开 */
function chooseGoal(
  goals: Fact[],
  idx: EffectIndex,
  obsContext: Record<string, unknown> | undefined,
): number {
  let bestI = 0;
  let bestCount = Infinity;
  for (let i = 0; i < goals.length; i++) {
    const cands = idx.candidates(goals[i]).filter((r) => scopeCompatible(r, obsContext));
    if (cands.length < bestCount) {
      bestCount = cands.length;
      bestI = i;
    }
  }
  return bestI;
}

// =============================================================================
// scoredExplain — semiring-aware beam search explainer
// =============================================================================

/** scoredExplain 配置（扩展 ExplainOptions） */
export interface ScoredExplainOptions extends ExplainOptions {
  /** semiring 类型：'boolean' | 'probability' | 'topk'（默认 'topk'） */
  semiringKind?: 'boolean' | 'probability' | 'topk';
}

/**
 * semiring-aware 的 beam search 解释器。
 *
 * 复用现有 explainObservation 的 beam search 框架，
 * 在每一步用 semiring.mul 组合概率，
 * 最终用 semiring.add 合并候选，
 * 返回 top-k 个带概率的证明。
 *
 * @param obs        - 待解释的观测
 * @param regulations - 可用的因果规律库
 * @param semiring   - 使用的 provenance semiring（默认 TopKSemiring）
 * @param topK       - 返回的最优证明数（默认 5）
 * @param options    - beam search 参数
 */
export function scoredExplain(
  obs: Observation,
  regulations: Regulation[],
  semiring?: ProvenanceSemiring<TopKProofs>,
  topK?: number,
  options?: Partial<ExplainOptions>,
): ScoredStory[] {
  const opts = { ...DEFAULT_EXPLAIN_OPTIONS, ...options };
  const k = topK ?? opts.topK;
  const ring = semiring ?? new TopKSemiring(k);

  const goals = dedupFacts(observationGoals(obs));
  const known = dedupFacts([...obs.facts, ...contextToFacts(obs.context)]);
  const idx = new EffectIndex(regulations);

  const init: ScoredSearchNode = {
    goals: [...goals],
    regulationIds: [],
    assumptions: [],
    bindings: {},
    probability: 1.0,
    scoreLog: 0.0,
    used: new Set(),
    provenance: [],
    stepCount: 0,
  };

  let beam: ScoredSearchNode[] = [init];
  const completed: ScoredSearchNode[] = [];

  for (let depth = 0; depth < opts.maxDepth; depth++) {
    const newBeam: ScoredSearchNode[] = [];

    for (const node of beam) {
      // 所有 goal 已解决 → 完成
      if (node.goals.length === 0) {
        completed.push(node);
        continue;
      }

      // MRV 启发式选择下一个 goal
      const gi = chooseGoal(node.goals, idx, obs.context);
      const g = node.goals[gi];
      const rest = [...node.goals.slice(0, gi), ...node.goals.slice(gi + 1)];

      let expanded = false;

      // 尝试每条候选 regulation
      for (const r of idx.candidates(g)) {
        if (node.used.has(r.regulationId)) continue;
        if (!scopeCompatible(r, obs.context)) continue;

        for (const eff of r.eff) {
          let b2 = unifyFact(eff, g, node.bindings);
          if (b2 === null) continue;
          expanded = true;

          // 分离已满足的前置条件和新子目标
          const newGoals: Fact[] = [];
          const satisfiedPre: Fact[] = [];
          for (const p of r.pre) {
            const p2 = substituteFact(p, b2);
            const bKnown = factEntails(known, p2, b2);
            if (bKnown !== null) {
              b2 = bKnown;
              satisfiedPre.push(p2);
            } else {
              newGoals.push(p2);
            }
          }

          const merged = dedupFacts([...newGoals, ...rest]);
          const rs = ruleScore(r);

          // semiring.mul：组合当前概率和本步 regulation score
          const stepProb = rs;
          const childProbability = node.probability * stepProb;

          // log-score（兼容 beam 内排序）
          const childScoreLog = node.scoreLog + Math.log(rs) - opts.lengthPenalty;

          // how-provenance
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
            probability: childProbability,
            scoreLog: childScoreLog,
            used: new Set([...node.used, r.regulationId]),
            provenance: [...node.provenance, step],
            stepCount: node.stepCount + 1,
          });
        }
      }

      // 无法展开时做假设
      if (!expanded && node.assumptions.length < opts.maxAssumptions) {
        // 假设惩罚：概率乘以 e^{-penalty}
        const assumptionFactor = Math.exp(-opts.assumptionPenalty);
        newBeam.push({
          goals: [...rest],
          regulationIds: [...node.regulationIds],
          assumptions: [...node.assumptions, g],
          bindings: { ...node.bindings },
          probability: node.probability * assumptionFactor,
          scoreLog: node.scoreLog - opts.assumptionPenalty,
          used: new Set(node.used),
          provenance: [...node.provenance],
          stepCount: node.stepCount,
        });
      }
    }

    // beam 裁剪：按 scoreLog 排序，保留 beamSize 个
    newBeam.sort((a, b) => b.scoreLog - a.scoreLog);
    beam = newBeam.slice(0, opts.beamSize);
  }

  // 用 semiring.add 合并所有完成节点的证明
  let allProofs: TopKProofs = ring.zero;
  const storyMap = new Map<string, ScoredSearchNode>();

  for (const n of completed) {
    const tag: ProvenanceTag = {
      probability: n.probability,
      regulationChain: [...n.regulationIds],
      stepCount: n.stepCount,
    };
    allProofs = ring.add(allProofs, [tag]);
    // 用 regulationIds 签名索引完整节点（用于恢复 provenance 等字段）
    const key = n.regulationIds.join('|') + '||' + n.assumptions.map(a => a.pred).join('|');
    if (!storyMap.has(key)) {
      storyMap.set(key, n);
    }
  }

  // 构造 ScoredStory 输出，按概率降序
  const stories: ScoredStory[] = [];
  for (const proof of allProofs) {
    const key = proof.regulationChain.join('|');
    // 找到对应的完整节点
    let matchedNode: ScoredSearchNode | undefined;
    for (const n of completed) {
      if (n.regulationIds.join('|') === key && n.stepCount === proof.stepCount) {
        matchedNode = n;
        break;
      }
    }

    stories.push({
      regulationIds: [...proof.regulationChain],
      assumptions: matchedNode ? [...matchedNode.assumptions] : [],
      probability: proof.probability,
      stepCount: proof.stepCount,
      provenance: matchedNode ? [...matchedNode.provenance] : [],
    });
  }

  stories.sort((a, b) => b.probability - a.probability);
  return stories.slice(0, k);
}

// =============================================================================
// 便捷工厂
// =============================================================================

/** 创建布尔半环实例 */
export function createBooleanSemiring(): BooleanSemiring {
  return new BooleanSemiring();
}

/** 创建概率半环实例 */
export function createProbabilitySemiring(): ProbabilitySemiring {
  return new ProbabilitySemiring();
}

/** 创建 top-k 半环实例 */
export function createTopKSemiring(k: number): TopKSemiring {
  return new TopKSemiring(k);
}
