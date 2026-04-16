/**
 * 实验建议器：基于信息增益计算推荐下一个最有价值的实验
 *
 * 四种建议策略：
 * a. 不确定性消减 — 针对矛盾率最高的 regulation 做确认实验
 * b. 外推探索 — 超出已观测范围 ±20% 发现性能拐点
 * c. 交互效应发现 — 找从未同时改过的参数对
 * d. 反事实验证 — 对只有正面证据的 regulation 做反向实验
 */

import type { CausalStorage } from '../core/storage.js';
import type { Regulation, Observation, Fact } from '../core/types.js';

// ============================================================================
// 类型定义
// ============================================================================

export type SuggestionType =
  | 'uncertainty_reduction'
  | 'exploration'
  | 'interaction'
  | 'counterfactual';

export interface ExperimentSuggestion {
  rank: number;
  type: SuggestionType;
  description: string;
  params: Record<string, unknown>;
  informationGain: number;
  rationale: string;
}

// ============================================================================
// 内部工具函数
// ============================================================================

/**
 * 计算 regulation 的矛盾率
 */
function contradictionRate(reg: Regulation): number {
  const support = reg.supportN ?? 0;
  const counter = reg.counterexampleN ?? 0;
  const total = support + counter;
  if (total === 0) return 0;
  return counter / total;
}

/**
 * 从 Fact 中提取参数键值对（pred 作为参数名，value 作为参数值）
 */
function extractParamFromFact(f: Fact): { name: string; value: unknown } {
  return { name: f.pred, value: f.value };
}

/**
 * 判断值是否为数值型
 */
function isNumeric(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v);
}

/**
 * 从所有 observation 中提取每个数值型参数的 min/max 范围
 */
function buildNumericRanges(
  observations: Observation[]
): Map<string, { min: number; max: number }> {
  const ranges = new Map<string, { min: number; max: number }>();

  for (const obs of observations) {
    for (const fact of obs.facts) {
      if (isNumeric(fact.value)) {
        const existing = ranges.get(fact.pred);
        if (existing) {
          existing.min = Math.min(existing.min, fact.value);
          existing.max = Math.max(existing.max, fact.value);
        } else {
          ranges.set(fact.pred, { min: fact.value, max: fact.value });
        }
      }
      // 也检查 args 中的数值
      if (fact.args) {
        for (const [key, val] of Object.entries(fact.args)) {
          const paramName = `${fact.pred}.${key}`;
          if (isNumeric(val)) {
            const existing = ranges.get(paramName);
            if (existing) {
              existing.min = Math.min(existing.min, val);
              existing.max = Math.max(existing.max, val);
            } else {
              ranges.set(paramName, { min: val, max: val });
            }
          }
        }
      }
    }
  }

  return ranges;
}

/**
 * 构建参数共现矩阵：统计哪些参数在同一 observation 中被同时观测过
 */
function buildCoOccurrenceMatrix(
  observations: Observation[]
): Map<string, number> {
  const matrix = new Map<string, number>();

  for (const obs of observations) {
    // 提取本次观测涉及的所有参数名
    const params = new Set<string>();
    for (const fact of obs.facts) {
      params.add(fact.pred);
    }

    // 对每对参数计数
    const paramList = Array.from(params).sort();
    for (let i = 0; i < paramList.length; i++) {
      for (let j = i + 1; j < paramList.length; j++) {
        const key = `${paramList[i]}||${paramList[j]}`;
        matrix.set(key, (matrix.get(key) ?? 0) + 1);
      }
    }
  }

  return matrix;
}

/**
 * 收集所有出现过的参数名
 */
function collectAllParams(observations: Observation[]): Set<string> {
  const params = new Set<string>();
  for (const obs of observations) {
    for (const fact of obs.facts) {
      params.add(fact.pred);
    }
  }
  return params;
}

// ============================================================================
// 四种建议策略
// ============================================================================

/**
 * 策略 a：不确定性消减
 * 找 contradictionRate 最高的 regulation，建议用其 pre 条件的新值做确认实验
 */
function suggestUncertaintyReduction(
  regulations: Regulation[]
): ExperimentSuggestion[] {
  const suggestions: ExperimentSuggestion[] = [];

  // 按矛盾率降序
  const sorted = regulations
    .filter((r) => r.status !== 'retired')
    .map((r) => ({ reg: r, rate: contradictionRate(r) }))
    .filter((item) => item.rate > 0)
    .sort((a, b) => b.rate - a.rate);

  for (const { reg, rate } of sorted.slice(0, 5)) {
    const params: Record<string, unknown> = {};
    for (const fact of reg.pre) {
      const { name, value } = extractParamFromFact(fact);
      params[name] = value;
    }

    suggestions.push({
      rank: 0, // 排序后再填
      type: 'uncertainty_reduction',
      description: `确认实验：验证 regulation "${reg.description || reg.regulationId}" 的前提条件`,
      params,
      informationGain: rate, // uncertainty_score = contradictionRate
      rationale: `该 regulation 矛盾率 ${(rate * 100).toFixed(1)}%（支持=${reg.supportN ?? 0}，反例=${reg.counterexampleN ?? 0}），需要更多实验确认因果关系是否成立`,
    });
  }

  return suggestions;
}

/**
 * 策略 b：外推探索
 * 对数值型参数建议超出已测范围 ±20% 的值
 */
function suggestExploration(
  observations: Observation[]
): ExperimentSuggestion[] {
  const suggestions: ExperimentSuggestion[] = [];
  const ranges = buildNumericRanges(observations);

  for (const [paramName, { min, max }] of ranges) {
    const span = max - min;
    // 跳过零跨度（只观测过一个值）的参数仍有探索价值，用绝对值的 20%
    const delta = span > 0 ? span * 0.2 : Math.abs(max) * 0.2 || 1;

    const lowerTarget = min - delta;
    const upperTarget = max + delta;

    // 估算探索分：如果 span 很小说明探索不足
    // reasonable_range 假设为 span * 3（启发式）
    const reasonableRange = span > 0 ? span * 3 : Math.abs(max) * 2 || 10;
    const explorationScore = 1 - span / reasonableRange;

    suggestions.push({
      rank: 0,
      type: 'exploration',
      description: `外推探索：将 ${paramName} 推至已测范围之外（当前范围 [${min}, ${max}]）`,
      params: {
        [paramName]: { suggestedLow: lowerTarget, suggestedHigh: upperTarget },
        currentRange: { min, max },
      },
      informationGain: Math.max(0, Math.min(1, explorationScore)),
      rationale: `参数 ${paramName} 仅在 [${min}, ${max}] 范围内被测试过，建议尝试 ${lowerTarget.toFixed(2)} 或 ${upperTarget.toFixed(2)} 以发现性能拐点`,
    });
  }

  return suggestions;
}

/**
 * 策略 c：交互效应发现
 * 找从未在同一 observation 中同时出现的参数对
 */
function suggestInteraction(
  observations: Observation[]
): ExperimentSuggestion[] {
  const suggestions: ExperimentSuggestion[] = [];
  const coOccurrence = buildCoOccurrenceMatrix(observations);
  const allParams = Array.from(collectAllParams(observations)).sort();

  // 找共现次数为 0 的参数对
  const missingPairs: Array<{ a: string; b: string; count: number }> = [];

  for (let i = 0; i < allParams.length; i++) {
    for (let j = i + 1; j < allParams.length; j++) {
      const key = `${allParams[i]}||${allParams[j]}`;
      const count = coOccurrence.get(key) ?? 0;
      // 交互效应未知：共现次数低
      if (count <= 1) {
        missingPairs.push({ a: allParams[i], b: allParams[j], count });
      }
    }
  }

  // 按共现次数升序（0 最优先）
  missingPairs.sort((x, y) => x.count - y.count);

  for (const { a, b, count } of missingPairs.slice(0, 5)) {
    const interactionScore = 1 / (count + 1);

    suggestions.push({
      rank: 0,
      type: 'interaction',
      description: `交互效应实验：同时变更 ${a} 和 ${b}`,
      params: { paramA: a, paramB: b, coOccurrenceCount: count },
      informationGain: interactionScore,
      rationale: `参数 ${a} 和 ${b} 仅共现 ${count} 次，交互效应未知。同时改变两者可发现潜在的协同或拮抗关系`,
    });
  }

  return suggestions;
}

/**
 * 策略 d：反事实验证
 * 找只有正面证据（counterexampleN=0, supportN>=3）的 regulation，做反向实验
 */
function suggestCounterfactual(
  regulations: Regulation[]
): ExperimentSuggestion[] {
  const suggestions: ExperimentSuggestion[] = [];

  const candidates = regulations.filter(
    (r) =>
      r.status !== 'retired' &&
      (r.counterexampleN ?? 0) === 0 &&
      (r.supportN ?? 0) >= 3
  );

  for (const reg of candidates.slice(0, 5)) {
    // 反转 pre 条件的值
    const invertedParams: Record<string, unknown> = {};
    for (const fact of reg.pre) {
      const { name, value } = extractParamFromFact(fact);
      if (typeof value === 'boolean') {
        invertedParams[name] = !value;
      } else if (isNumeric(value)) {
        // 数值型：取相反方向（如果是正数变负数，或者乘以 -1）
        invertedParams[name] = value === 0 ? 1 : -value;
      } else {
        invertedParams[name] = `NOT(${String(value)})`;
      }
    }

    // 反事实的信息增益：支持证据越多且无反例，反事实验证越有价值
    const cfScore = Math.min(1, (reg.supportN ?? 0) / 10);

    suggestions.push({
      rank: 0,
      type: 'counterfactual',
      description: `反事实验证：反转 regulation "${reg.description || reg.regulationId}" 的前提条件`,
      params: {
        originalPre: reg.pre.map((f) => ({ pred: f.pred, value: f.value })),
        invertedPre: invertedParams,
        regulationId: reg.regulationId,
      },
      informationGain: cfScore,
      rationale: `该 regulation 有 ${reg.supportN ?? 0} 条支持证据但 0 条反例，可能过拟合。反转前提条件可验证因果关系的必要性`,
    });
  }

  return suggestions;
}

// ============================================================================
// 主函数
// ============================================================================

/**
 * 综合四种策略，计算信息增益排序，返回 top-K 建议
 *
 * 信息增益综合公式：
 *   0.4 * uncertainty_score + 0.3 * exploration_score + 0.3 * interaction_score
 *
 * 对于非该策略类型的分数，使用该建议自身的 informationGain 作为主分量
 */
export function suggestNextExperiment(
  storage: CausalStorage,
  topK: number = 5
): ExperimentSuggestion[] {
  // 获取所有 regulation 和 observation
  const regulations = storage.listRegulations({ limit: 1000 });
  const observations = storage.listObservations(1000);

  if (regulations.length === 0 && observations.length === 0) {
    return [
      {
        rank: 1,
        type: 'exploration',
        description: '系统中无数据，建议先提交初始观测',
        params: {},
        informationGain: 1.0,
        rationale: '因果学习系统为空，需要先通过 submit_observation 提交实验数据',
      },
    ];
  }

  // 收集四种策略的建议
  const allSuggestions: ExperimentSuggestion[] = [
    ...suggestUncertaintyReduction(regulations),
    ...suggestExploration(observations),
    ...suggestInteraction(observations),
    ...suggestCounterfactual(regulations),
  ];

  if (allSuggestions.length === 0) {
    return [
      {
        rank: 1,
        type: 'exploration',
        description: '当前数据不足以生成具体建议，建议增加观测多样性',
        params: {},
        informationGain: 0.5,
        rationale: '已有数据中未发现足够的矛盾、数值范围或参数共现模式',
      },
    ];
  }

  // 综合信息增益权重计算
  // 每个策略类型有不同的权重贡献
  const weights: Record<SuggestionType, { u: number; e: number; i: number }> = {
    uncertainty_reduction: { u: 0.4, e: 0.0, i: 0.0 },
    exploration: { u: 0.0, e: 0.3, i: 0.0 },
    interaction: { u: 0.0, e: 0.0, i: 0.3 },
    counterfactual: { u: 0.2, e: 0.1, i: 0.0 },
  };

  // 对每个建议，用其类型的权重 * 自身 informationGain 作为综合分
  // 额外的跨类型分量：用全局统计补充
  const globalUncertainty =
    regulations.length > 0
      ? regulations.reduce((sum, r) => sum + contradictionRate(r), 0) /
        regulations.length
      : 0;

  for (const s of allSuggestions) {
    const w = weights[s.type];
    const baseGain = s.informationGain;
    // 综合分 = 策略权重 * 自身分 + 其他维度的全局背景分
    s.informationGain =
      (w.u > 0 ? w.u * baseGain : 0.1 * globalUncertainty) +
      (w.e > 0 ? w.e * baseGain : 0) +
      (w.i > 0 ? w.i * baseGain : 0) +
      // 基础分：确保每个建议都有非零增益
      0.1 * baseGain;
  }

  // 按综合信息增益降序排序
  allSuggestions.sort((a, b) => b.informationGain - a.informationGain);

  // 取 top-K 并填充 rank
  const result = allSuggestions.slice(0, topK);
  for (let i = 0; i < result.length; i++) {
    result[i].rank = i + 1;
  }

  return result;
}
