/**
 * 蒙特卡洛证据采样模块
 *
 * 移植自 Sirchmunk 项目的 MonteCarloEvidenceSampling 算法。
 * 在大型文档中高效定位相关区域（Region of Interest）。
 *
 * 采样流程：
 *   第 1 轮：Fuzz 锚点（exploitation）+ 分层随机（exploration）
 *   第 2+ 轮：以高分种子为中心做高斯采样（sigma 随轮次衰减）
 *   每轮结束：评估所有样本 → 更新种子 → 检查提前停止
 *   最终：扩展上下文窗口 → 生成结果
 */

// =============================================================================
// 公共接口
// =============================================================================

/**
 * 采样窗口：文档中的一个片段及其评分信息
 */
export interface SampleWindow {
  startIdx: number;
  endIdx: number;
  content: string;
  score: number;         // 相关性评分 0-10
  fuzzScore: number;     // 模糊匹配分数 0-100
  reasoning: string;
  roundNum: number;
  source: 'fuzz' | 'stratified' | 'gaussian';
}

/**
 * Region of Interest 结果
 */
export interface RoiResult {
  summary: string;
  isFound: boolean;
  snippets: Array<{
    snippet: string;
    start: number;
    end: number;
    score: number;
    reasoning: string;
  }>;
}

/**
 * 采样器配置
 */
export interface SamplerConfig {
  maxRounds?: number;            // 最大轮次，默认 3
  probeWindow?: number;          // 探测窗口大小（字符数），默认 500
  roiWindow?: number;            // 最终上下文窗口大小，默认 2000
  fuzzCandidatesNum?: number;    // Fuzz 锚点数，默认 5
  randomExplorationNum?: number; // 随机探索数，默认 2
  samplesPerRound?: number;      // 每轮采样数（含 fuzz 和随机），默认 5
  topKSeeds?: number;            // 保留种子数，默认 2
  confidenceThreshold?: number;  // 提前停止阈值，默认 8.0
}

/**
 * 评分函数类型（由外部提供，可以是 LLM 或简单规则）
 */
export type ScorerFn = (
  content: string,
  query: string
) => Promise<{ score: number; reasoning: string }>;

// =============================================================================
// 轻量版 tokenSetRatio（不依赖外部模块）
// =============================================================================

/**
 * 对文本进行 token 化（转小写、去标点、分词）
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * 计算两个 token 集合的 Jaccard 相似度，映射到 0-100 分
 * 类似于 fuzzywuzzy 的 token_set_ratio
 */
function tokenSetRatio(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (setA.size === 0 && setB.size === 0) return 100;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return Math.round((intersection / union) * 100);
}

// =============================================================================
// 高斯随机数（Box-Muller 变换）
// =============================================================================

/**
 * 生成标准正态随机数（Box-Muller 变换）
 */
function gaussianRandom(mean: number, sigma: number): number {
  // Box-Muller 变换
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + sigma * z;
}

// =============================================================================
// 小文档阈值
// =============================================================================

/** 小文档直接返回全文，跳过采样 */
const SMALL_DOC_THRESHOLD = 100_000;

// =============================================================================
// MonteCarloSampler 主类
// =============================================================================

export class MonteCarloSampler {
  private readonly document: string;
  private readonly docLength: number;

  // 配置（已填充默认值）
  private readonly maxRounds: number;
  private readonly probeWindow: number;
  private readonly roiWindow: number;
  private readonly fuzzCandidatesNum: number;
  private readonly randomExplorationNum: number;
  private readonly samplesPerRound: number;
  private readonly topKSeeds: number;
  private readonly confidenceThreshold: number;

  constructor(document: string, config: SamplerConfig = {}) {
    this.document = document;
    this.docLength = document.length;

    this.maxRounds = config.maxRounds ?? 3;
    this.probeWindow = config.probeWindow ?? 500;
    this.roiWindow = config.roiWindow ?? 2000;
    this.fuzzCandidatesNum = config.fuzzCandidatesNum ?? 5;
    this.randomExplorationNum = config.randomExplorationNum ?? 2;
    this.samplesPerRound = config.samplesPerRound ?? 5;
    this.topKSeeds = config.topKSeeds ?? 2;
    this.confidenceThreshold = config.confidenceThreshold ?? 8.0;
  }

  /**
   * 获取 Region of Interest
   *
   * @param query       查询字符串
   * @param keywords    关键词 → IDF 权重 映射
   * @param scorer      评分函数
   * @param topK        返回的最大片段数，默认 3
   */
  async getRoi(
    query: string,
    keywords: Map<string, number>,
    scorer: ScorerFn,
    topK = 3
  ): Promise<RoiResult> {
    // 小文档快速路径
    if (this.docLength < SMALL_DOC_THRESHOLD) {
      return this._buildRoiFromWholeDoc(query, scorer, topK);
    }

    // 已访问位置集合（用于去重）
    const visitedCenters: number[] = [];
    // 当前高分种子
    let seeds: SampleWindow[] = [];
    // 所有已评估样本
    const allSamples: SampleWindow[] = [];

    for (let round = 1; round <= this.maxRounds; round++) {
      let roundSamples: Array<Omit<SampleWindow, 'score' | 'reasoning'>>;

      if (round === 1) {
        // 第 1 轮：Fuzz 锚点 + 分层随机
        const fuzzAnchors = this._getFuzzyAnchors(query, keywords);
        const stratified = this._sampleStratified(
          this.randomExplorationNum,
          visitedCenters
        );
        roundSamples = [...fuzzAnchors, ...stratified];
      } else {
        // 第 2+ 轮：以高分种子为中心高斯采样
        roundSamples = this._sampleGaussian(seeds, round, visitedCenters);
      }

      // 记录访问位置
      for (const s of roundSamples) {
        visitedCenters.push(Math.floor((s.startIdx + s.endIdx) / 2));
      }

      // 并发评估本轮所有样本
      const evaluated = await this._evaluateBatch(
        roundSamples as SampleWindow[],
        query,
        scorer
      );
      allSamples.push(...evaluated);

      // 更新种子：取本轮得分最高的 topK
      seeds = [...allSamples]
        .sort((a, b) => b.score - a.score)
        .slice(0, this.topKSeeds);

      // 提前停止：最高分超过阈值
      if (seeds.length > 0 && seeds[0].score >= this.confidenceThreshold) {
        break;
      }
    }

    // 按得分排序，取 topK，扩展为 roiWindow 上下文
    const topSamples = [...allSamples]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (topSamples.length === 0 || topSamples[0].score < 1.0) {
      return {
        summary: '未找到相关内容',
        isFound: false,
        snippets: [],
      };
    }

    const snippets = topSamples.map((s) => {
      const { start, end } = this._expandToRoiWindow(s.startIdx, s.endIdx);
      return {
        snippet: this.document.slice(start, end),
        start,
        end,
        score: s.score,
        reasoning: s.reasoning,
      };
    });

    return {
      summary: `找到 ${snippets.length} 个相关区域，最高得分 ${topSamples[0].score.toFixed(1)}`,
      isFound: true,
      snippets,
    };
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  /**
   * Fuzz 锚点：滑动窗口扫描，返回 token set ratio 最高的 top-K 窗口
   */
  private _getFuzzyAnchors(
    query: string,
    keywords: Map<string, number>,
    threshold = 10
  ): Array<Omit<SampleWindow, 'score' | 'reasoning'>> {
    const stride = Math.max(1, Math.floor(this.probeWindow / 2));
    const results: Array<{ startIdx: number; endIdx: number; fuzzScore: number }> = [];

    // 构造用于匹配的扩展查询（query + 高权重关键词）
    const topKeywords = [...keywords.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k]) => k)
      .join(' ');
    const matchTarget = `${query} ${topKeywords}`.trim();

    for (let start = 0; start + this.probeWindow <= this.docLength; start += stride) {
      const end = start + this.probeWindow;
      const content = this.document.slice(start, end);
      const fuzz = tokenSetRatio(content, matchTarget);
      if (fuzz >= threshold) {
        results.push({ startIdx: start, endIdx: end, fuzzScore: fuzz });
      }
    }

    // 处理最后一个不完整窗口
    if (this.docLength > 0 && this.docLength % stride !== 0) {
      const start = this.docLength - this.probeWindow;
      if (start >= 0) {
        const content = this.document.slice(start, this.docLength);
        const fuzz = tokenSetRatio(content, matchTarget);
        if (fuzz >= threshold) {
          results.push({
            startIdx: start,
            endIdx: this.docLength,
            fuzzScore: fuzz,
          });
        }
      }
    }

    // 取 top-K
    results.sort((a, b) => b.fuzzScore - a.fuzzScore);
    return results.slice(0, this.fuzzCandidatesNum).map((r) => ({
      startIdx: r.startIdx,
      endIdx: r.endIdx,
      content: this.document.slice(r.startIdx, r.endIdx),
      fuzzScore: r.fuzzScore,
      roundNum: 1,
      source: 'fuzz' as const,
    }));
  }

  /**
   * 分层随机采样：将文档等分成 count 段，每段内随机选一个位置
   */
  private _sampleStratified(
    count: number,
    visitedCenters: number[]
  ): Array<Omit<SampleWindow, 'score' | 'reasoning'>> {
    const segmentSize = Math.floor(this.docLength / count);
    const results: Array<Omit<SampleWindow, 'score' | 'reasoning'>> = [];

    for (let i = 0; i < count; i++) {
      const segStart = i * segmentSize;
      const segEnd = i === count - 1 ? this.docLength : (i + 1) * segmentSize;

      // 在段内随机选起始位置
      const maxStart = Math.max(segStart, segEnd - this.probeWindow);
      const start = segStart + Math.floor(Math.random() * (maxStart - segStart + 1));
      const end = Math.min(start + this.probeWindow, this.docLength);
      const center = Math.floor((start + end) / 2);

      // 去重检查
      if (this._isTooClose(center, visitedCenters)) continue;

      results.push({
        startIdx: start,
        endIdx: end,
        content: this.document.slice(start, end),
        fuzzScore: 0,
        roundNum: 1,
        source: 'stratified' as const,
      });
    }

    return results;
  }

  /**
   * 高斯采样：以高分种子为中心，sigma 随轮次衰减
   */
  private _sampleGaussian(
    seeds: SampleWindow[],
    currentRound: number,
    visitedCenters: number[]
  ): Array<Omit<SampleWindow, 'score' | 'reasoning'>> {
    // sigma 随轮次指数衰减：round=1 时最大，之后减半
    const sigma = (this.docLength / 20) / Math.pow(2, currentRound - 1);
    const results: Array<Omit<SampleWindow, 'score' | 'reasoning'>> = [];
    const samplesPerSeed = Math.max(
      1,
      Math.ceil(this.samplesPerRound / Math.max(1, seeds.length))
    );

    for (const seed of seeds) {
      const seedCenter = Math.floor((seed.startIdx + seed.endIdx) / 2);

      for (let i = 0; i < samplesPerSeed; i++) {
        const center = Math.round(gaussianRandom(seedCenter, sigma));
        const clampedCenter = Math.max(
          this.probeWindow / 2,
          Math.min(this.docLength - this.probeWindow / 2, center)
        );

        const start = Math.max(
          0,
          Math.floor(clampedCenter - this.probeWindow / 2)
        );
        const end = Math.min(this.docLength, start + this.probeWindow);
        const actualCenter = Math.floor((start + end) / 2);

        // 去重检查
        if (this._isTooClose(actualCenter, visitedCenters)) continue;

        visitedCenters.push(actualCenter);
        results.push({
          startIdx: start,
          endIdx: end,
          content: this.document.slice(start, end),
          fuzzScore: 0,
          roundNum: currentRound,
          source: 'gaussian' as const,
        });
      }
    }

    return results;
  }

  /**
   * 并发评估一批样本（使用 Promise.allSettled）
   */
  private async _evaluateBatch(
    samples: SampleWindow[],
    query: string,
    scorer: ScorerFn
  ): Promise<SampleWindow[]> {
    const tasks = samples.map((s) => scorer(s.content, query));
    const results = await Promise.allSettled(tasks);

    return samples.map((s, i) => {
      const result = results[i];
      if (result.status === 'fulfilled') {
        return {
          ...s,
          score: result.value.score,
          reasoning: result.value.reasoning,
        };
      }
      // 评分失败时给 0 分
      return { ...s, score: 0, reasoning: '评分失败' };
    });
  }

  /**
   * 将探测窗口扩展为 roiWindow 大小的上下文区域
   */
  private _expandToRoiWindow(
    startIdx: number,
    endIdx: number
  ): { start: number; end: number } {
    const center = Math.floor((startIdx + endIdx) / 2);
    const half = Math.floor(this.roiWindow / 2);
    const start = Math.max(0, center - half);
    const end = Math.min(this.docLength, center + half);
    return { start, end };
  }

  /**
   * 检查 center 与已访问位置的距离是否过近（< probeWindow/2）
   */
  private _isTooClose(center: number, visitedCenters: number[]): boolean {
    const minDist = this.probeWindow / 2;
    return visitedCenters.some((v) => Math.abs(v - center) < minDist);
  }

  /**
   * 小文档快速路径：直接对全文评分并返回
   */
  private async _buildRoiFromWholeDoc(
    query: string,
    scorer: ScorerFn,
    topK: number
  ): Promise<RoiResult> {
    const result = await scorer(this.document, query);
    if (result.score < 1.0) {
      return { summary: '文档内容与查询不相关', isFound: false, snippets: [] };
    }

    // 小文档直接返回全文（但限制 topK 数量）
    const snippets = Array.from({ length: Math.min(topK, 1) }, () => ({
      snippet: this.document,
      start: 0,
      end: this.docLength,
      score: result.score,
      reasoning: result.reasoning,
    }));

    return {
      summary: `小文档直接匹配，得分 ${result.score.toFixed(1)}`,
      isFound: true,
      snippets,
    };
  }
}

// =============================================================================
// 简化版评分函数：基于关键词匹配（不依赖 LLM）
// =============================================================================

/**
 * 基于关键词匹配的简化评分器
 *
 * 计算方式：
 *   1. 统计 content 中每个关键词的出现次数
 *   2. 加权求和（使用 IDF 权重）
 *   3. 归一化到 0-10 分
 *
 * 使用示例：
 *   const scorer = keywordScorer(new Map([['error', 2.0], ['timeout', 1.5]]));
 *   const result = await sampler.getRoi(query, keywords, scorer);
 */
export function keywordScorer(keywords: Map<string, number>): ScorerFn {
  return async (content: string, _query: string) => {
    if (keywords.size === 0) {
      return { score: 0, reasoning: '关键词列表为空' };
    }

    const lowerContent = content.toLowerCase();
    let weightedSum = 0;
    let maxPossible = 0;
    const matched: string[] = [];

    for (const [keyword, idf] of keywords.entries()) {
      maxPossible += idf * 3; // 假设最多出现 3 次算满分
      const lowerKw = keyword.toLowerCase();

      // 统计出现次数（最多计 3 次以防单关键词刷分）
      let count = 0;
      let pos = 0;
      while (count < 3) {
        const idx = lowerContent.indexOf(lowerKw, pos);
        if (idx === -1) break;
        count++;
        pos = idx + 1;
      }

      if (count > 0) {
        weightedSum += idf * count;
        matched.push(`${keyword}(×${count})`);
      }
    }

    const normalized = maxPossible > 0
      ? Math.min(10, (weightedSum / maxPossible) * 10)
      : 0;

    const reasoning = matched.length > 0
      ? `命中关键词：${matched.join('、')}`
      : '未命中任何关键词';

    return { score: Math.round(normalized * 10) / 10, reasoning };
  };
}
