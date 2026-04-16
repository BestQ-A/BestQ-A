/**
 * 跨条目模式挖掘工具
 *
 * 从 90+ 实验记录中自动发现隐藏模式：
 * - 参数敏感性分析（哪些参数被最频繁改动）
 * - Tradeoff 检测（改善 A 时恶化 B 的共现对）
 * - 未覆盖区域（参数组合的空白地带）
 * - 规律冲突检测（前提相似但效果矛盾的 regulation 对）
 */

import type { CausalStorage } from '../core/storage.js';
import type { Fact, Observation, Event, Regulation } from '../core/types.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 参数敏感性条目 */
export interface ParameterSensitivityEntry {
  param: string;
  frequency: number;
}

/** Tradeoff 条目 */
export interface TradeoffEntry {
  improved: string;
  degraded: string;
  count: number;
}

/** 未覆盖区域条目 */
export interface UncoveredRegionEntry {
  params: string[];
  description: string;
}

/** 规律冲突条目 */
export interface ConflictEntry {
  reg1: string;
  reg2: string;
  description: string;
}

/** 模式挖掘报告 */
export interface PatternReport {
  parameterSensitivity: ParameterSensitivityEntry[];
  tradeoffs: TradeoffEntry[];
  uncoveredRegions: UncoveredRegionEntry[];
  conflicts: ConflictEntry[];
  suggestions: string[];
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 从 Fact 中提取 pred 名称
 */
function extractPreds(facts: Fact[]): string[] {
  return facts.map((f) => f.pred);
}

/**
 * 判断 fact 是否表示"改善"语义
 */
function isImproved(fact: Fact): boolean {
  const v = fact.value;
  if (v === true || v === 'improved' || v === 'fixed' || v === 'resolved') return true;
  if (typeof v === 'string' && v.toLowerCase().includes('improv')) return true;
  return false;
}

/**
 * 判断 fact 是否表示"恶化"语义
 */
function isDegraded(fact: Fact): boolean {
  const v = fact.value;
  if (v === false || v === 'degraded' || v === 'broken' || v === 'failed') return true;
  if (typeof v === 'string' && v.toLowerCase().includes('degrad')) return true;
  if (typeof v === 'string' && v.toLowerCase().includes('fail')) return true;
  return false;
}

/**
 * 从 context 中提取 project 标识（用于分组同一项目的观测）
 */
function getProjectKey(ctx: Record<string, unknown> | undefined): string {
  if (!ctx) return '__default__';
  return String(ctx.project ?? ctx.repo ?? ctx.module ?? '__default__');
}

/**
 * 计算两个 Fact 数组的 pred 集合 Jaccard 相似度
 */
function predJaccard(a: Fact[], b: Fact[]): number {
  const setA = new Set(extractPreds(a));
  const setB = new Set(extractPreds(b));
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const p of setA) {
    if (setB.has(p)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ============================================================================
// 核心分析
// ============================================================================

/**
 * a. 参数敏感性分析
 *
 * 统计每个 cause pred 在所有 events/observations 中出现的频率，
 * 按频率降序排列 → 最常被改动的参数 = 系统最敏感的参数。
 */
function analyzeParameterSensitivity(
  observations: Observation[],
  events: Event[],
  maxResults: number,
): ParameterSensitivityEntry[] {
  const freqMap = new Map<string, number>();

  // 从 observations 提取 pred
  for (const obs of observations) {
    for (const fact of obs.facts) {
      freqMap.set(fact.pred, (freqMap.get(fact.pred) ?? 0) + 1);
    }
    if (obs.focusFacts) {
      for (const fact of obs.focusFacts) {
        freqMap.set(fact.pred, (freqMap.get(fact.pred) ?? 0) + 1);
      }
    }
  }

  // 从 events 的 observation + unexplainedAspects 提取 pred
  for (const evt of events) {
    for (const fact of evt.observation.facts) {
      freqMap.set(fact.pred, (freqMap.get(fact.pred) ?? 0) + 1);
    }
    for (const fact of evt.unexplainedAspects) {
      freqMap.set(fact.pred, (freqMap.get(fact.pred) ?? 0) + 1);
    }
  }

  return Array.from(freqMap.entries())
    .map(([param, frequency]) => ({ param, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, maxResults);
}

/**
 * b. Tradeoff 检测
 *
 * 扫描同一 project 下的观测对，如果一个有 improved fact 另一个有 degraded fact，
 * 则为 tradeoff。统计 tradeoff 共现频率。
 */
function detectTradeoffs(
  observations: Observation[],
  maxResults: number,
): TradeoffEntry[] {
  // 按 project 分组
  const byProject = new Map<string, Observation[]>();
  for (const obs of observations) {
    const key = getProjectKey(obs.context);
    const list = byProject.get(key) ?? [];
    list.push(obs);
    byProject.set(key, list);
  }

  const tradeoffCount = new Map<string, { improved: string; degraded: string; count: number }>();

  for (const group of byProject.values()) {
    // 对同一 project 内的观测两两比较
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const obsA = group[i];
        const obsB = group[j];
        const factsA = [...obsA.facts, ...(obsA.focusFacts ?? [])];
        const factsB = [...obsB.facts, ...(obsB.focusFacts ?? [])];

        const improvedA = factsA.filter(isImproved).map((f) => f.pred);
        const degradedA = factsA.filter(isDegraded).map((f) => f.pred);
        const improvedB = factsB.filter(isImproved).map((f) => f.pred);
        const degradedB = factsB.filter(isDegraded).map((f) => f.pred);

        // A improved + B degraded
        for (const imp of improvedA) {
          for (const deg of degradedB) {
            if (imp !== deg) {
              const key = `${imp}|${deg}`;
              const existing = tradeoffCount.get(key);
              if (existing) {
                existing.count++;
              } else {
                tradeoffCount.set(key, { improved: imp, degraded: deg, count: 1 });
              }
            }
          }
        }

        // B improved + A degraded
        for (const imp of improvedB) {
          for (const deg of degradedA) {
            if (imp !== deg) {
              const key = `${imp}|${deg}`;
              const existing = tradeoffCount.get(key);
              if (existing) {
                existing.count++;
              } else {
                tradeoffCount.set(key, { improved: imp, degraded: deg, count: 1 });
              }
            }
          }
        }
      }
    }
  }

  return Array.from(tradeoffCount.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, maxResults);
}

/**
 * c. 未覆盖区域
 *
 * 从所有观测中提取参数名 + 已测试值域，
 * 找出只出现过少数值的参数组合 → 未覆盖区域。
 *
 * 由于真正的笛卡尔积可能爆炸，采用启发式：
 * 找 top 频率参数的值域，标出只测试过单一值的参数。
 */
function findUncoveredRegions(
  observations: Observation[],
  events: Event[],
  maxResults: number,
): UncoveredRegionEntry[] {
  // 收集每个 pred 的已见 value 集合
  const valueMap = new Map<string, Set<string>>();

  const collectFacts = (facts: Fact[]) => {
    for (const f of facts) {
      const valSet = valueMap.get(f.pred) ?? new Set<string>();
      valSet.add(JSON.stringify(f.value));
      valueMap.set(f.pred, valSet);
    }
  };

  for (const obs of observations) {
    collectFacts(obs.facts);
    if (obs.focusFacts) collectFacts(obs.focusFacts);
  }
  for (const evt of events) {
    collectFacts(evt.observation.facts);
    collectFacts(evt.unexplainedAspects);
  }

  const results: UncoveredRegionEntry[] = [];

  // 策略 1: 只测试过单一值的参数 → 值域未探索
  for (const [pred, values] of valueMap) {
    if (values.size === 1) {
      const singleVal = [...values][0];
      results.push({
        params: [pred],
        description: `参数 "${pred}" 只测试过单一值 ${singleVal}，未探索其他取值`,
      });
    }
  }

  // 策略 2: 高频参数对之间的组合覆盖缺口
  const sortedPreds = Array.from(valueMap.entries())
    .filter(([, vs]) => vs.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 10); // 只看 top 10 多值参数

  // 统计实际出现的参数对组合
  const pairSeen = new Map<string, Set<string>>();
  const allFacts: Fact[][] = [
    ...observations.map((o) => o.facts),
    ...events.map((e) => e.observation.facts),
  ];

  for (const facts of allFacts) {
    const predsInObs = sortedPreds.filter(([p]) => facts.some((f) => f.pred === p));
    for (let i = 0; i < predsInObs.length; i++) {
      for (let j = i + 1; j < predsInObs.length; j++) {
        const [pA] = predsInObs[i];
        const [pB] = predsInObs[j];
        const pairKey = pA < pB ? `${pA}|${pB}` : `${pB}|${pA}`;
        const valA = facts.find((f) => f.pred === pA);
        const valB = facts.find((f) => f.pred === pB);
        if (valA && valB) {
          const comboKey = `${JSON.stringify(valA.value)}+${JSON.stringify(valB.value)}`;
          const seen = pairSeen.get(pairKey) ?? new Set<string>();
          seen.add(comboKey);
          pairSeen.set(pairKey, seen);
        }
      }
    }
  }

  // 找覆盖率低的参数对
  for (const [pairKey, seenCombos] of pairSeen) {
    const [pA, pB] = pairKey.split('|');
    const totalPossible = (valueMap.get(pA)?.size ?? 1) * (valueMap.get(pB)?.size ?? 1);
    const coverage = seenCombos.size / totalPossible;
    if (coverage < 0.5 && totalPossible > 2) {
      results.push({
        params: [pA, pB],
        description: `参数对 (${pA}, ${pB}) 覆盖率 ${(coverage * 100).toFixed(0)}%（${seenCombos.size}/${totalPossible} 组合已测试）`,
      });
    }
  }

  return results
    .sort((a, b) => a.params.length - b.params.length)
    .slice(0, maxResults);
}

/**
 * d. 规律冲突检测
 *
 * 从 regulations 中找 pre 相似（Jaccard > 阈值）但 eff 矛盾的对。
 * 矛盾 = 同一个 pred 在一个 regulation 中 improved 另一个中 degraded。
 */
function detectConflicts(
  regulations: Regulation[],
  maxResults: number,
): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const SIM_THRESHOLD = 0.3;

  for (let i = 0; i < regulations.length; i++) {
    for (let j = i + 1; j < regulations.length; j++) {
      const regA = regulations[i];
      const regB = regulations[j];

      // 检查 pre 相似度
      const sim = predJaccard(regA.pre, regB.pre);
      if (sim < SIM_THRESHOLD) continue;

      // 检查 eff 是否矛盾
      for (const effA of regA.eff) {
        for (const effB of regB.eff) {
          if (effA.pred === effB.pred && effA.value !== effB.value) {
            // 同一 pred 不同 value → 矛盾
            const isTradeoff =
              (isImproved(effA) && isDegraded(effB)) ||
              (isDegraded(effA) && isImproved(effB));

            conflicts.push({
              reg1: regA.regulationId,
              reg2: regB.regulationId,
              description: isTradeoff
                ? `冲突: "${effA.pred}" 在 ${regA.regulationId} 中为 ${JSON.stringify(effA.value)}，在 ${regB.regulationId} 中为 ${JSON.stringify(effB.value)}（方向性矛盾）`
                : `差异: "${effA.pred}" 在 ${regA.regulationId} 中为 ${JSON.stringify(effA.value)}，在 ${regB.regulationId} 中为 ${JSON.stringify(effB.value)}（前提相似度 ${(sim * 100).toFixed(0)}%）`,
            });
          }
        }
      }
    }
  }

  return conflicts.slice(0, maxResults);
}

/**
 * 基于分析结果生成建议
 */
function generateSuggestions(
  sensitivity: ParameterSensitivityEntry[],
  tradeoffs: TradeoffEntry[],
  uncovered: UncoveredRegionEntry[],
  conflicts: ConflictEntry[],
): string[] {
  const suggestions: string[] = [];

  // 高频参数建议
  if (sensitivity.length > 0) {
    const top = sensitivity[0];
    suggestions.push(
      `最敏感参数: "${top.param}"（出现 ${top.frequency} 次）。建议围绕此参数设计控制实验，固定其他变量。`,
    );
  }

  // Tradeoff 建议
  if (tradeoffs.length > 0) {
    const top = tradeoffs[0];
    suggestions.push(
      `最频繁 tradeoff: 改善 "${top.improved}" 时 "${top.degraded}" 恶化（${top.count} 次）。建议寻找帕累托最优点或引入约束条件。`,
    );
  }

  // 未覆盖区域建议
  const lowCoverage = uncovered.filter((u) => u.params.length >= 2);
  if (lowCoverage.length > 0) {
    suggestions.push(
      `存在 ${lowCoverage.length} 个低覆盖参数组合。建议优先补充测试覆盖率最低的组合。`,
    );
  }

  const singleValue = uncovered.filter((u) => u.params.length === 1);
  if (singleValue.length > 0) {
    suggestions.push(
      `${singleValue.length} 个参数只测试过单一值。建议对这些参数进行变值实验以验证因果关系的鲁棒性。`,
    );
  }

  // 冲突建议
  if (conflicts.length > 0) {
    suggestions.push(
      `发现 ${conflicts.length} 对规律冲突。建议审查冲突对的 scope/context 差异，可能需要细分适用条件。`,
    );
  }

  if (suggestions.length === 0) {
    suggestions.push('当前数据量不足以发现显著模式，建议继续积累实验记录。');
  }

  return suggestions;
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * 跨条目模式挖掘
 *
 * 从 CausalStorage 中读取所有 observations、events、regulations，
 * 执行四类分析并生成综合报告。
 */
export function discoverPatterns(
  storage: CausalStorage,
  maxResults: number = 20,
): PatternReport {
  // 加载数据（取足够大的 limit 覆盖全部记录）
  const observations = storage.listObservations(10000, 0);
  const events = storage.listEvents({ limit: 10000 });
  const regulations = storage.listRegulations({ limit: 10000 });

  // 四类分析
  const parameterSensitivity = analyzeParameterSensitivity(observations, events, maxResults);
  const tradeoffs = detectTradeoffs(observations, maxResults);
  const uncoveredRegions = findUncoveredRegions(observations, events, maxResults);
  const conflicts = detectConflicts(regulations, maxResults);

  // 生成建议
  const suggestions = generateSuggestions(
    parameterSensitivity,
    tradeoffs,
    uncoveredRegions,
    conflicts,
  );

  return {
    parameterSensitivity,
    tradeoffs,
    uncoveredRegions,
    conflicts,
    suggestions,
  };
}
