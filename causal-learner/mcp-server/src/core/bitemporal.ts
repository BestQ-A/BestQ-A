/**
 * Bitemporal 时间维度工具（借鉴 Graphiti）
 *
 * 每条 Fact 有两个时间轴：
 * - validFrom / validTo：事实在真实世界中有效的时间范围
 * - recordedAt：事实被录入系统的时间
 *
 * 旧知识不删除而是 invalidate（validTo 设为当前时间），
 * 支持历史回溯和知识演化追踪。
 */

import type { Fact } from './types.js';

/**
 * 使一条 Fact 失效：设置 validTo = now。
 * 返回新对象，不修改原 Fact。
 */
export function invalidateFact(fact: Fact, asOf?: string): Fact {
  return {
    ...fact,
    validTo: asOf ?? new Date().toISOString(),
  };
}

/**
 * 检查某条 Fact 在指定时间点是否有效。
 *
 * 规则：
 * - 无 validFrom 且无 validTo → 始终有效
 * - validFrom 存在 → asOf 必须 >= validFrom
 * - validTo 存在 → asOf 必须 < validTo
 */
export function isFactValid(fact: Fact, asOf?: string): boolean {
  const t = asOf ?? new Date().toISOString();

  if (fact.validFrom && t < fact.validFrom) {
    return false;
  }
  if (fact.validTo && t >= fact.validTo) {
    return false;
  }
  return true;
}

/**
 * 过滤出在指定时间点有效的 Facts。
 */
export function filterValidFacts(facts: Fact[], asOf?: string): Fact[] {
  return facts.filter((f) => isFactValid(f, asOf));
}

/**
 * 获取某个 pred 的历史值序列，按 validFrom 升序排列。
 * 用于追踪同一个谓词的值如何随时间演化。
 */
export function getFactHistory(facts: Fact[], pred: string): Fact[] {
  return facts
    .filter((f) => f.pred === pred)
    .sort((a, b) => {
      const ta = a.validFrom ?? '';
      const tb = b.validFrom ?? '';
      return ta.localeCompare(tb);
    });
}
