/**
 * 模糊匹配模块 - 替代 keywords.ts 中的粗糙关键词匹配
 *
 * 参考 Sirchmunk 项目的 RapidFuzz + TF-IDF 重排序设计，
 * 实现纯 TypeScript 的 token_set_ratio、Levenshtein 距离和相关性评分。
 *
 * 无外部依赖，严格 ES module 导出。
 */

import type { Fact } from './types.js';

// =============================================================================
// 基础接口定义
// =============================================================================

/**
 * 模糊匹配结果
 */
export interface FuzzyMatchResult {
  /** 匹配到的文本内容 */
  item: string;
  /** 对应的 ID */
  id: string;
  /** 综合得分，0-100 */
  score: number;
  /** 匹配类型：精确匹配 / token集合匹配 / 部分匹配 */
  matchType: 'exact' | 'token_set' | 'partial';
}

/**
 * 模糊匹配选项
 */
export interface FuzzyMatchOptions {
  /** 最低分数阈值，默认 30 */
  threshold?: number;
  /** 最大返回数，默认 10 */
  limit?: number;
  /** 各匹配策略权重 */
  weights?: {
    /** 精确匹配权重，默认 2.0 */
    exact: number;
    /** token_set 匹配权重，默认 1.5 */
    tokenSet: number;
    /** 部分匹配权重，默认 1.0 */
    partial: number;
  };
}

/**
 * 相关性评分选项
 */
export interface RelevanceScoreOptions {
  /** 是否区分大小写，默认 false */
  caseSensitive?: boolean;
  /** 长度归一化方式，默认 'log' */
  lengthNorm?: 'linear' | 'log' | 'none';
  /** 基准文档长度（用于归一化），默认 100 */
  baseLength?: number;
  /** 精确词命中额外加分，默认 2.0 */
  exactBonus?: number;
  /** TF 权重系数，默认 1.0 */
  tfWeight?: number;
  /** 是否模拟 IDF（惩罚常见词），默认 true */
  idfSimulate?: boolean;
}

// =============================================================================
// 默认常量
// =============================================================================

const DEFAULT_THRESHOLD = 30;
const DEFAULT_LIMIT = 10;
const DEFAULT_WEIGHTS = { exact: 2.0, tokenSet: 1.5, partial: 1.0 };

// 常见停用词，IDF 模拟时用于降权
const HIGH_FREQ_TERMS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'was',
  'one', 'our', 'out', 'get', 'has', 'how', 'its', 'let', 'say', 'she',
  'too', 'use', 'this', 'that', 'with', 'have', 'from', 'they', 'been',
  'will', 'more', 'when', 'your', 'said', 'each', 'which', 'their', 'there',
  'would', 'about', 'could', 'other', 'than', 'then', 'into', 'some', 'any',
]);

// =============================================================================
// 1. Levenshtein 编辑距离
// =============================================================================

/**
 * 计算两个字符串之间的 Levenshtein 编辑距离
 *
 * 使用动态规划实现，时间复杂度 O(m*n)，空间复杂度 O(min(m,n))。
 *
 * @param a - 字符串 a
 * @param b - 字符串 b
 * @returns 最小编辑操作数（插入、删除、替换）
 */
export function levenshteinDistance(a: string, b: string): number {
  // 边界情况快速返回
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // 确保 a 是较短的字符串，节省空间
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const lenA = a.length;
  const lenB = b.length;

  // 只保留两行的滚动数组
  let prevRow = new Array<number>(lenA + 1);
  let currRow = new Array<number>(lenA + 1);

  // 初始化第一行
  for (let i = 0; i <= lenA; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= lenB; j++) {
    currRow[0] = j;
    for (let i = 1; i <= lenA; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        prevRow[i] + 1,       // 删除
        currRow[i - 1] + 1,   // 插入
        prevRow[i - 1] + cost // 替换
      );
    }
    // 交换行，避免重新分配内存
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[lenA];
}

// =============================================================================
// 内部工具函数
// =============================================================================

/**
 * 将字符串分词并去重，返回有序 token 集合
 *
 * @param text - 输入文本
 * @returns 小写、去重、排序后的 token 数组
 */
function tokenize(text: string): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0)
  )].sort();
}

/**
 * 计算两个字符串的 Levenshtein 相似度（0-100）
 *
 * @param a - 字符串 a
 * @param b - 字符串 b
 * @returns 0-100 的相似度分数
 */
function levenshteinRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 100;
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.round((1 - dist / maxLen) * 100);
}

// =============================================================================
// 2. token_set_ratio
// =============================================================================

/**
 * 模拟 RapidFuzz 的 token_set_ratio
 *
 * 算法：
 * 1. 对两个字符串分词并去重，得到集合 S1 和 S2
 * 2. 计算交集 I = S1 ∩ S2
 * 3. 分别计算以下三种组合的 Levenshtein 相似度：
 *    - intersection vs union1 (I vs I+S1差集)
 *    - intersection vs union2 (I vs I+S2差集)
 *    - union1 vs union2
 * 4. 返回三者的最大值（0-100）
 *
 * @param query - 查询字符串
 * @param target - 目标字符串
 * @returns 0-100 的 token_set_ratio 分数
 */
export function tokenSetRatio(query: string, target: string): number {
  if (query === target) return 100;

  const tokens1 = new Set(tokenize(query));
  const tokens2 = new Set(tokenize(target));

  // 计算交集和差集
  const intersection: string[] = [];
  const diff1: string[] = []; // 在 tokens1 中但不在 tokens2 中
  const diff2: string[] = []; // 在 tokens2 中但不在 tokens1 中

  for (const t of tokens1) {
    if (tokens2.has(t)) {
      intersection.push(t);
    } else {
      diff1.push(t);
    }
  }
  for (const t of tokens2) {
    if (!tokens1.has(t)) {
      diff2.push(t);
    }
  }

  // 将各部分拼接成字符串（排序保证一致性）
  intersection.sort();
  diff1.sort();
  diff2.sort();

  const intersStr = intersection.join(' ');
  const union1Str = [intersStr, ...diff1].filter(Boolean).join(' ');
  const union2Str = [intersStr, ...diff2].filter(Boolean).join(' ');

  // 计算三种组合的相似度
  const score1 = levenshteinRatio(intersStr, union1Str);
  const score2 = levenshteinRatio(intersStr, union2Str);
  const score3 = levenshteinRatio(union1Str, union2Str);

  return Math.max(score1, score2, score3);
}

/**
 * 计算两个字符串的部分匹配比率（最长公共子串滑动窗口）
 *
 * 用较短字符串在较长字符串中滑动，取最大 Levenshtein 相似度。
 *
 * @param query - 查询字符串
 * @param target - 目标字符串
 * @returns 0-100 的部分匹配分数
 */
function partialRatio(query: string, target: string): number {
  if (query === target) return 100;
  if (query.length === 0 || target.length === 0) return 0;

  // 确保 query 是较短的
  let shorter = query;
  let longer = target;
  if (query.length > target.length) {
    shorter = target;
    longer = query;
  }

  const shortLen = shorter.length;
  const longLen = longer.length;

  let best = 0;
  // 滑动窗口：从 longer 中截取与 shorter 等长的子串
  for (let i = 0; i <= longLen - shortLen; i++) {
    const substr = longer.slice(i, i + shortLen);
    const ratio = levenshteinRatio(shorter, substr);
    if (ratio > best) {
      best = ratio;
      if (best === 100) break; // 已达最高分，提前退出
    }
  }

  return best;
}

// =============================================================================
// 3. FuzzyMatcher 类
// =============================================================================

/**
 * 模糊匹配器 - 支持多种匹配策略的综合搜索
 *
 * 使用三种匹配策略（精确、token_set、部分匹配）的加权组合，
 * 返回按综合分数排序的匹配结果。
 */
export class FuzzyMatcher {
  private readonly items: ReadonlyArray<{ id: string; text: string; keywords?: string[] }>;

  /**
   * @param items - 待搜索的条目列表，每条包含 id、text 和可选 keywords
   */
  constructor(items: Array<{ id: string; text: string; keywords?: string[] }>) {
    this.items = items;
  }

  /**
   * 对单个条目计算综合匹配分数
   *
   * @param query - 查询字符串（已转小写）
   * @param item - 待匹配条目
   * @param weights - 各策略权重
   * @returns 综合分数（0-100）和匹配类型
   */
  private scoreItem(
    query: string,
    item: { id: string; text: string; keywords?: string[] },
    weights: { exact: number; tokenSet: number; partial: number }
  ): { score: number; matchType: FuzzyMatchResult['matchType'] } {
    const text = item.text.toLowerCase();

    // 合并 keywords 到文本中参与匹配
    const keywordsText = item.keywords ? item.keywords.join(' ').toLowerCase() : '';
    const combinedText = keywordsText ? `${text} ${keywordsText}` : text;

    // 精确匹配
    if (text === query || combinedText.includes(query)) {
      const exactScore = text === query ? 100 : 90;
      return { score: Math.min(100, exactScore * weights.exact / 2.0), matchType: 'exact' };
    }

    // 计算三种原始分数
    const tsRatio = tokenSetRatio(query, combinedText);
    const pRatio = partialRatio(query, combinedText);

    // 关键词额外加分：检查是否与任一关键词高度匹配
    let kwBonus = 0;
    if (item.keywords) {
      for (const kw of item.keywords) {
        const kwScore = tokenSetRatio(query, kw.toLowerCase());
        if (kwScore > kwBonus) kwBonus = kwScore;
      }
    }

    // 综合分：取 token_set 和 partial 的加权最大
    const weightedTsScore = tsRatio * weights.tokenSet;
    const weightedPScore = pRatio * weights.partial;
    const rawScore = Math.max(weightedTsScore, weightedPScore);

    // 关键词命中时给予额外加分（最多 +15）
    const bonusAdded = kwBonus > 70 ? Math.min(15, (kwBonus - 70) * 0.5) : 0;

    // 归一化到 0-100
    const maxPossible = 100 * Math.max(weights.tokenSet, weights.partial);
    const finalScore = Math.min(100, (rawScore / maxPossible) * 100 + bonusAdded);

    // 判断主导匹配类型
    const matchType: FuzzyMatchResult['matchType'] =
      tsRatio >= pRatio ? 'token_set' : 'partial';

    return { score: Math.round(finalScore), matchType };
  }

  /**
   * 模糊搜索，返回按分数降序排列的结果
   *
   * @param query - 查询字符串
   * @param options - 搜索选项
   * @returns 匹配结果列表
   */
  search(query: string, options: FuzzyMatchOptions = {}): FuzzyMatchResult[] {
    const threshold = options.threshold ?? DEFAULT_THRESHOLD;
    const limit = options.limit ?? DEFAULT_LIMIT;
    const weights = options.weights ?? DEFAULT_WEIGHTS;

    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return [];

    const results: FuzzyMatchResult[] = [];

    for (const item of this.items) {
      const { score, matchType } = this.scoreItem(normalizedQuery, item, weights);
      if (score >= threshold) {
        results.push({
          item: item.text,
          id: item.id,
          score,
          matchType,
        });
      }
    }

    // 按分数降序排列
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * 批量计算查询列表与所有条目的相似度矩阵
   *
   * @param queries - 查询字符串列表
   * @returns Map<query, Map<itemId, score>>
   */
  similarityMatrix(queries: string[]): Map<string, Map<string, number>> {
    const matrix = new Map<string, Map<string, number>>();

    for (const query of queries) {
      const rowMap = new Map<string, number>();
      const normalizedQuery = query.toLowerCase().trim();

      for (const item of this.items) {
        const { score } = this.scoreItem(normalizedQuery, item, DEFAULT_WEIGHTS);
        rowMap.set(item.id, score);
      }

      matrix.set(query, rowMap);
    }

    return matrix;
  }
}

// =============================================================================
// 4. calculateRelevanceScore
// =============================================================================

/**
 * 参考 Sirchmunk 的 _calculate_relevance_score，计算文本对查询词的相关性分数
 *
 * 综合考虑：
 * - 词频（TF）：词在文本中出现的比例
 * - IDF 模拟：对高频常见词降权
 * - 精确词命中加分
 * - 文档长度归一化（避免长文本虚高）
 *
 * @param text - 待评分的文本
 * @param terms - 查询词列表
 * @param options - 评分选项
 * @returns 相关性分数（非负浮点数）
 */
export function calculateRelevanceScore(
  text: string,
  terms: string[],
  options: RelevanceScoreOptions = {}
): number {
  const {
    caseSensitive = false,
    lengthNorm = 'log',
    baseLength = 100,
    exactBonus = 2.0,
    tfWeight = 1.0,
    idfSimulate = true,
  } = options;

  if (!text || terms.length === 0) return 0;

  const normalizedText = caseSensitive ? text : text.toLowerCase();
  const normalizedTerms = caseSensitive ? terms : terms.map(t => t.toLowerCase());

  // 分词（保留出现次数用于 TF 计算）
  const textTokens = normalizedText
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);

  const totalTokens = textTokens.length;
  if (totalTokens === 0) return 0;

  // 构建词频表
  const tfMap = new Map<string, number>();
  for (const token of textTokens) {
    tfMap.set(token, (tfMap.get(token) ?? 0) + 1);
  }

  let totalScore = 0;

  for (const term of normalizedTerms) {
    if (!term) continue;

    // TF：词在文档中出现的频率
    const tf = (tfMap.get(term) ?? 0) / totalTokens;

    // IDF 模拟：对高频停用词降权，对低频词保持权重
    let idfFactor = 1.0;
    if (idfSimulate) {
      if (HIGH_FREQ_TERMS.has(term)) {
        idfFactor = 0.1; // 停用词大幅降权
      } else if (term.length <= 2) {
        idfFactor = 0.3; // 极短词降权
      }
    }

    // TF-IDF 分数
    const tfIdfScore = tf * idfFactor * tfWeight;

    // 精确词命中加分：词完整出现在文本中
    let bonus = 0;
    if (tf > 0) {
      // 词恰好作为完整词出现（非子串）
      const wordBoundaryMatch = new RegExp(`\\b${escapeRegex(term)}\\b`).test(normalizedText);
      if (wordBoundaryMatch) {
        bonus = exactBonus * idfFactor;
      }
    }

    totalScore += tfIdfScore + bonus;
  }

  // 文档长度归一化（避免长文档虚高）
  let lengthNormFactor = 1.0;
  if (lengthNorm === 'linear') {
    lengthNormFactor = Math.min(1.0, baseLength / Math.max(totalTokens, 1));
  } else if (lengthNorm === 'log') {
    lengthNormFactor = 1.0 / (1.0 + Math.log(Math.max(totalTokens, 1) / Math.max(baseLength, 1) + 1));
  }
  // lengthNorm === 'none' 时不做归一化

  return totalScore * lengthNormFactor;
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// 5. 与现有系统的集成接口
// =============================================================================

/**
 * 从 Fact 数组中提取可搜索文本
 *
 * 将 pred、args 键值、value 都拼接到文本中，
 * 方便模糊匹配时覆盖结构化数据。
 *
 * @param facts - Fact 数组
 * @returns 提取出的文本字符串
 */
function factsToText(facts: Fact[]): string {
  return facts
    .map(f => {
      const parts: string[] = [f.pred];
      if (f.args) {
        for (const [k, v] of Object.entries(f.args)) {
          parts.push(k);
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            parts.push(String(v));
          }
        }
      }
      if (f.value !== undefined && f.value !== null) {
        parts.push(String(f.value));
      }
      return parts.join(' ');
    })
    .join(' ');
}

/**
 * 用模糊匹配增强 Regulation 搜索
 *
 * 将 regulationId、description、pre/eff 中的 Fact 文本合并，
 * 使用 FuzzyMatcher 进行模糊搜索。
 *
 * @param query - 查询字符串
 * @param regulations - Regulation 数据（简化版，只需搜索相关字段）
 * @param options - 模糊匹配选项
 * @returns 按分数排序的匹配结果
 */
export function fuzzyMatchRegulations(
  query: string,
  regulations: Array<{
    regulationId: string;
    description?: string;
    pre: Fact[];
    eff: Fact[];
  }>,
  options?: FuzzyMatchOptions
): FuzzyMatchResult[] {
  const items = regulations.map(reg => {
    // 合并所有可搜索文本：ID + 描述 + pre facts + eff facts
    const preText = factsToText(reg.pre);
    const effText = factsToText(reg.eff);
    const text = [
      reg.description ?? '',
      preText,
      effText,
    ].filter(Boolean).join(' ');

    // 关键词：从 ID 中提取（通常含有语义信息）
    const idKeywords = reg.regulationId
      .split(/[_\-./]/)
      .filter(k => k.length > 1);

    return {
      id: reg.regulationId,
      text: text || reg.regulationId,
      keywords: idKeywords,
    };
  });

  const matcher = new FuzzyMatcher(items);
  return matcher.search(query, options);
}

/**
 * 用模糊匹配增强 Event 搜索
 *
 * 将 eventId、observation.facts、notes 合并为可搜索文本，
 * 使用 FuzzyMatcher 进行模糊搜索。
 *
 * @param query - 查询字符串
 * @param events - Event 数据（简化版，只需搜索相关字段）
 * @param options - 模糊匹配选项
 * @returns 按分数排序的匹配结果
 */
export function fuzzyMatchEvents(
  query: string,
  events: Array<{
    eventId: string;
    observation: { facts: Fact[] };
    notes?: string;
  }>,
  options?: FuzzyMatchOptions
): FuzzyMatchResult[] {
  const items = events.map(evt => {
    const factsText = factsToText(evt.observation.facts);
    const text = [
      factsText,
      evt.notes ?? '',
    ].filter(Boolean).join(' ');

    // 关键词：从 eventId 中提取语义片段
    const idKeywords = evt.eventId
      .split(/[_\-./]/)
      .filter(k => k.length > 1);

    return {
      id: evt.eventId,
      text: text || evt.eventId,
      keywords: idKeywords,
    };
  });

  const matcher = new FuzzyMatcher(items);
  return matcher.search(query, options);
}
