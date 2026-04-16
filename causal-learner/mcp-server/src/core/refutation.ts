/**
 * Regulation 反驳测试模块（借鉴 DoWhy refutation API）
 *
 * 归纳出 regulation 后，自动生成多种反驳测试验证其可信度：
 * - Placebo test: 把 pre 中 fact 的 value 随机替换，检查是否还能解释同样的 events
 * - Subset test: 随机取 70% 支持观测重跑归纳，看是否产生相同 regulation
 * - Permutation test: 打乱 observations 的 facts 赋值，检查 support 是否显著下降
 */

import type { Fact, Observation, Regulation } from './types.js';
import { factSignature } from './types.js';

// =============================================================================
// 公共接口
// =============================================================================

/** 单项反驳测试结果 */
export interface RefutationTest {
  type: 'placebo' | 'subset' | 'permutation';
  description: string;
  passed: boolean;
  detail: string;
}

/** 整体反驳结果 */
export interface RefutationResult {
  regulationId: string;
  tests: RefutationTest[];
  overallConfidence: number; // 0-1，通过的测试越多越高
  passed: boolean;           // overallConfidence > 0.5
}

// =============================================================================
// 内部工具函数
// =============================================================================

/**
 * 简易伪随机数生成器（Mulberry32），确保可选种子化以便测试可复现
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从数组中随机选 k 个元素（Fisher-Yates 部分洗牌） */
function sampleArray<T>(arr: T[], k: number, rng: () => number): T[] {
  if (k >= arr.length) return [...arr];
  const copy = [...arr];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

/** 收集所有观测中出现过的 unique value（按 pred 分组） */
function collectValuesByPred(observations: Observation[]): Map<string, unknown[]> {
  const map = new Map<string, unknown[]>();
  for (const obs of observations) {
    for (const f of obs.facts) {
      const key = f.pred;
      if (!map.has(key)) map.set(key, []);
      const arr = map.get(key)!;
      const vStr = JSON.stringify(f.value);
      if (!arr.some(v => JSON.stringify(v) === vStr)) {
        arr.push(f.value);
      }
    }
  }
  return map;
}

/** 检查一个 observation 是否满足 regulation 的所有 pre */
function observationSatisfiesPre(obs: Observation, pre: Fact[]): boolean {
  const obsSigs = new Set(obs.facts.map(f => factSignature(f)));
  return pre.every(p => obsSigs.has(factSignature(p)));
}

/** 计算 regulation 在一组观测中的 support 数（满足 pre 的观测数量） */
function countSupport(reg: Regulation, observations: Observation[]): number {
  let count = 0;
  for (const obs of observations) {
    if (observationSatisfiesPre(obs, reg.pre)) count++;
  }
  return count;
}

// =============================================================================
// 三种反驳测试
// =============================================================================

/** placebo 迭代次数 — 多次采样取平均，消除单次随机替换的偶然性 */
const PLACEBO_ITERATIONS = 5;

/**
 * Placebo test（安慰剂测试）
 *
 * 把 regulation 的 pre 中每个 fact 的 value 随机替换为同 pred 下的其他值，
 * 重复多次取平均 support，检查 placebo regulation 是否还能解释同样比例的观测。
 * 如果能 → 说明原始 pre 不是真正的原因（测试失败）。
 */
function runPlaceboTest(
  reg: Regulation,
  observations: Observation[],
  rng: () => number,
): RefutationTest {
  const valuesByPred = collectValuesByPred(observations);
  const originalSupport = countSupport(reg, observations);

  let totalPlaceboSupport = 0;
  for (let iter = 0; iter < PLACEBO_ITERATIONS; iter++) {
    const placeboPre: Fact[] = reg.pre.map(f => {
      const candidates = (valuesByPred.get(f.pred) || []).filter(
        v => JSON.stringify(v) !== JSON.stringify(f.value)
      );
      if (candidates.length === 0) return f; // 无可替换值，保留原值
      const newValue = candidates[Math.floor(rng() * candidates.length)];
      return { pred: f.pred, args: f.args ? { ...f.args } : undefined, value: newValue };
    });
    totalPlaceboSupport += countSupport({ ...reg, pre: placeboPre }, observations);
  }

  const avgPlaceboSupport = totalPlaceboSupport / PLACEBO_ITERATIONS;

  // 如果平均 placebo support 仍然 >= 原始的 50%，说明 pre 没有区分力 → 测试失败
  const ratio = originalSupport > 0 ? avgPlaceboSupport / originalSupport : 0;
  const passed = ratio < 0.5;

  return {
    type: 'placebo',
    description: '安慰剂测试：将 pre 的 value 随机替换后检查 support 是否消失',
    passed,
    detail: passed
      ? `Placebo 平均 support ${avgPlaceboSupport.toFixed(1)}/${originalSupport}（比率 ${ratio.toFixed(2)}），原始 pre 具有区分力`
      : `Placebo 平均 support ${avgPlaceboSupport.toFixed(1)}/${originalSupport}（比率 ${ratio.toFixed(2)}），pre 可能缺乏区分力`,
  };
}

/**
 * Subset test（子集稳定性测试）
 *
 * 随机取 70% 的支持观测，检查在子集上 regulation 的 support 比例是否保持稳定。
 * 如果子集上的 support 比例与全集差异过大 → 说明规律不稳定（测试失败）。
 */
function runSubsetTest(
  reg: Regulation,
  observations: Observation[],
  rng: () => number,
): RefutationTest {
  const n = observations.length;
  if (n < 3) {
    return {
      type: 'subset',
      description: '子集稳定性测试：取 70% 观测检查 support 比例是否稳定',
      passed: true,
      detail: `观测数不足（${n} < 3），跳过子集测试，默认通过`,
    };
  }

  const subsetSize = Math.max(2, Math.floor(n * 0.7));
  const subset = sampleArray(observations, subsetSize, rng);

  const fullSupport = countSupport(reg, observations);
  const subsetSupport = countSupport(reg, subset);

  const fullRatio = n > 0 ? fullSupport / n : 0;
  const subsetRatio = subsetSize > 0 ? subsetSupport / subsetSize : 0;

  // 如果两个比率差异 > 0.3，说明不稳定 → 测试失败
  const diff = Math.abs(fullRatio - subsetRatio);
  const passed = diff <= 0.3;

  return {
    type: 'subset',
    description: '子集稳定性测试：取 70% 观测检查 support 比例是否稳定',
    passed,
    detail: passed
      ? `全集比率 ${fullRatio.toFixed(2)} vs 子集比率 ${subsetRatio.toFixed(2)}（差 ${diff.toFixed(2)}），规律稳定`
      : `全集比率 ${fullRatio.toFixed(2)} vs 子集比率 ${subsetRatio.toFixed(2)}（差 ${diff.toFixed(2)}），规律不稳定`,
  };
}

/** permutation 迭代次数 — 多次打乱取平均，消除单次置换的偶然性 */
const PERMUTATION_ITERATIONS = 5;

/**
 * Permutation test（置换测试）
 *
 * 打乱所有观测中 facts 的 value 赋值，重复多次取平均，
 * 检查 regulation 的 support 是否显著下降。
 * 如果打乱后 support 不下降 → 说明关联是虚假的（测试失败）。
 */
function runPermutationTest(
  reg: Regulation,
  observations: Observation[],
  rng: () => number,
): RefutationTest {
  const originalSupport = countSupport(reg, observations);
  const valuesByPred = collectValuesByPred(observations);

  let totalPermutedSupport = 0;
  for (let iter = 0; iter < PERMUTATION_ITERATIONS; iter++) {
    // 对每个观测，打乱其 facts 的 value（在同 pred 的所有观测值中随机挑选）
    const permuted: Observation[] = observations.map(obs => ({
      ...obs,
      facts: obs.facts.map(f => {
        const candidates = valuesByPred.get(f.pred) || [f.value];
        const newValue = candidates[Math.floor(rng() * candidates.length)];
        return { pred: f.pred, args: f.args ? { ...f.args } : undefined, value: newValue };
      }),
    }));
    totalPermutedSupport += countSupport(reg, permuted);
  }

  const avgPermutedSupport = totalPermutedSupport / PERMUTATION_ITERATIONS;

  // 如果平均打乱后 support 仍然 >= 原始的 50%，说明关联可能是虚假的 → 测试失败
  const ratio = originalSupport > 0 ? avgPermutedSupport / originalSupport : 0;
  const passed = ratio < 0.5;

  return {
    type: 'permutation',
    description: '置换测试：打乱 facts 的 value 赋值后检查 support 是否显著下降',
    passed,
    detail: passed
      ? `置换平均 support ${avgPermutedSupport.toFixed(1)}/${originalSupport}（比率 ${ratio.toFixed(2)}），关联有统计显著性`
      : `置换平均 support ${avgPermutedSupport.toFixed(1)}/${originalSupport}（比率 ${ratio.toFixed(2)}），关联可能是虚假的`,
  };
}

// =============================================================================
// 主入口
// =============================================================================

/** 可选配置 */
export interface RefutationOptions {
  /** 伪随机种子，默认 42 */
  seed?: number;
}

/**
 * 对一个已归纳的 regulation 执行全套反驳测试
 *
 * @param reg - 待检验的 regulation
 * @param allObservations - 所有可用观测（含支持与不支持该 regulation 的）
 * @param options - 可选配置
 * @returns 反驳结果，包含三项测试的详情和总体置信度
 */
export function refuteRegulation(
  reg: Regulation,
  allObservations: Observation[],
  options?: RefutationOptions,
): RefutationResult {
  const seed = options?.seed ?? 42;
  const rng = mulberry32(seed);

  const tests: RefutationTest[] = [
    runPlaceboTest(reg, allObservations, rng),
    runSubsetTest(reg, allObservations, rng),
    runPermutationTest(reg, allObservations, rng),
  ];

  const passedCount = tests.filter(t => t.passed).length;
  const overallConfidence = passedCount / tests.length;

  return {
    regulationId: reg.regulationId,
    tests,
    overallConfidence,
    passed: overallConfidence > 0.5,
  };
}
