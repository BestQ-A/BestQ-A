/**
 * 搜索工具模块 - 为因果学习系统暴露智能搜索能力
 * 包含：模糊匹配、知识聚类、蒙特卡洛采样、ReAct 搜索
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { CausalStorage } from '../core/storage.js';
import type { Event, Regulation } from '../core/index.js';

// ──────────────────────────────────────────────
// Zod Schema 定义
// ──────────────────────────────────────────────

/** 智能因果搜索 Schema */
export const causalSearchSchema = z.object({
  query: z.string().describe('搜索查询，描述要查找的因果关系'),
  maxDepth: z.number().optional().default(5).describe('最大搜索深度'),
  strategy: z
    .enum(['knowledge_first', 'regulation_first', 'event_first'])
    .optional()
    .default('knowledge_first')
    .describe('搜索策略：优先查知识缓存/规则/事件'),
});

/** 模糊搜索因果规则 Schema */
export const fuzzySearchRegulationsSchema = z.object({
  query: z.string().describe('搜索查询'),
  threshold: z.number().optional().default(30).describe('最低匹配分数 (0-100)'),
  limit: z.number().optional().default(10).describe('最大返回数量'),
});

/** 模糊搜索历史事件 Schema */
export const fuzzySearchEventsSchema = z.object({
  query: z.string().describe('搜索查询'),
  status: z
    .enum(['open', 'clustered', 'resolved', 'archived'])
    .optional()
    .describe('按状态过滤'),
  threshold: z.number().optional().default(30).describe('最低匹配分数 (0-100)'),
  limit: z.number().optional().default(10).describe('最大返回数量'),
});

/** 构建知识聚类 Schema */
export const buildKnowledgeClusterSchema = z.object({
  name: z.string().describe('聚类名称'),
  regulationIds: z.array(z.string()).optional().describe('关联的 regulation IDs'),
  eventIds: z.array(z.string()).optional().describe('关联的 event IDs'),
  description: z.string().optional().describe('聚类描述'),
});

/** 搜索知识聚类 Schema */
export const searchKnowledgeClustersSchema = z.object({
  query: z.string().describe('搜索查询'),
  limit: z.number().optional().default(5).describe('最大返回数量'),
});

/** 蒙特卡洛证据采样 Schema */
export const sampleEvidenceSchema = z.object({
  document: z.string().describe('要采样的文档内容'),
  query: z.string().describe('搜索查询'),
  keywords: z.record(z.number()).optional().describe('关键词及其 IDF 权重'),
  topK: z.number().optional().default(3).describe('返回的最佳片段数'),
});

/** 所有工具 Schema 集合导出 */
export const searchToolSchemas = {
  causal_search: causalSearchSchema,
  fuzzy_search_regulations: fuzzySearchRegulationsSchema,
  fuzzy_search_events: fuzzySearchEventsSchema,
  build_knowledge_cluster: buildKnowledgeClusterSchema,
  search_knowledge_clusters: searchKnowledgeClustersSchema,
  sample_evidence: sampleEvidenceSchema,
};

// ──────────────────────────────────────────────
// 内部工具函数
// ──────────────────────────────────────────────

/** MCP 工具返回类型 */
type ToolResult = { content: Array<{ type: 'text'; text: string }> };

/** 构造标准文本响应 */
function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

/**
 * 内联模糊匹配算法（token overlap ratio）
 * @param query 搜索查询
 * @param items 待匹配条目列表
 * @param threshold 最低匹配分数 (0-100)
 * @returns 匹配结果（已按分数降序排列）
 */
function inlineFuzzyMatch(
  query: string,
  items: Array<{ id: string; text: string }>,
  threshold = 30
): Array<{ id: string; score: number }> {
  const queryLower = query.toLowerCase();
  const queryTokens = new Set(queryLower.split(/\s+/).filter(t => t.length > 0));

  return items
    .map(item => {
      const textLower = item.text.toLowerCase();
      const textTokens = new Set(textLower.split(/\s+/).filter(t => t.length > 0));

      // 子字符串包含检查（精确加分）
      const directContains = textLower.includes(queryLower) ? 20 : 0;

      // Token overlap ratio
      let overlap = 0;
      for (const qt of queryTokens) {
        for (const tt of textTokens) {
          if (tt.includes(qt) || qt.includes(tt)) {
            overlap++;
            break;
          }
        }
      }

      const overlapScore =
        queryTokens.size > 0 ? (overlap / queryTokens.size) * 80 : 0;
      const score = Math.min(100, overlapScore + directContains);

      return { id: item.id, score };
    })
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/**
 * 将 Regulation 转换为可搜索的文本表示
 */
function regulationToSearchText(reg: Regulation): string {
  const preParts = reg.pre.map(f => `${f.pred}=${JSON.stringify(f.value)}`).join(' ');
  const effParts = reg.eff.map(f => `${f.pred}=${JSON.stringify(f.value)}`).join(' ');
  const desc = reg.description || '';
  const tags = (reg.tags || []).join(' ');
  return `${desc} ${preParts} ${effParts} ${tags}`.trim();
}

/**
 * 将 Event 转换为可搜索的文本表示
 */
function eventToSearchText(event: Event): string {
  const unexplained = event.unexplainedAspects
    .map(f => `${f.pred}=${JSON.stringify(f.value)}`)
    .join(' ');
  const facts = event.observation.facts
    .map(f => `${f.pred}=${JSON.stringify(f.value)}`)
    .join(' ');
  const ctx = event.context
    ? Object.entries(event.context)
        .map(([k, v]) => `${k}:${JSON.stringify(v)}`)
        .join(' ')
    : '';
  return `${unexplained} ${facts} ${ctx}`.trim();
}

// ──────────────────────────────────────────────
// 知识聚类内存存储（进程内缓存）
// ──────────────────────────────────────────────

interface KnowledgeCluster {
  clusterId: string;
  name: string;
  description?: string;
  regulationIds: string[];
  eventIds: string[];
  createdAt: string;
}

/** 进程级知识聚类缓存（跨调用持久，但不落盘） */
const knowledgeClusters: Map<string, KnowledgeCluster> = new Map();

// ──────────────────────────────────────────────
// ReAct 搜索内部辅助
// ──────────────────────────────────────────────

interface ReActStep {
  step: number;
  thought: string;
  action: string;
  observation: string;
}

/**
 * 规则驱动的 ReAct 搜索循环
 * 不依赖外部 LLM，通过固定策略迭代搜索
 */
function runReActLoop(
  storage: CausalStorage,
  query: string,
  maxDepth: number,
  strategy: 'knowledge_first' | 'regulation_first' | 'event_first'
): { steps: ReActStep[]; finalAnswer: string } {
  const steps: ReActStep[] = [];
  const results: string[] = [];
  let depth = 0;

  // 决定搜索顺序
  const searchOrder: Array<'knowledge' | 'regulation' | 'event'> =
    strategy === 'regulation_first'
      ? ['regulation', 'knowledge', 'event']
      : strategy === 'event_first'
        ? ['event', 'knowledge', 'regulation']
        : ['knowledge', 'regulation', 'event'];

  for (const source of searchOrder) {
    if (depth >= maxDepth) break;
    depth++;

    if (source === 'knowledge') {
      // 搜索知识聚类
      const queryLower = query.toLowerCase();
      const matched: KnowledgeCluster[] = [];
      for (const cluster of knowledgeClusters.values()) {
        const searchText = `${cluster.name} ${cluster.description || ''}`.toLowerCase();
        if (searchText.includes(queryLower)) {
          matched.push(cluster);
        }
      }

      const thought = `检查知识聚类缓存，查询: "${query}"`;
      const action = 'search_knowledge_clusters';
      const observation =
        matched.length > 0
          ? `找到 ${matched.length} 个匹配聚类: ${matched.map(c => c.name).join(', ')}`
          : '知识聚类中无匹配结果';

      steps.push({ step: depth, thought, action, observation });
      if (matched.length > 0) {
        results.push(observation);
        for (const c of matched) {
          results.push(
            `  聚类 "${c.name}": 包含 ${c.regulationIds.length} 条规则, ${c.eventIds.length} 个事件`
          );
        }
      }
    } else if (source === 'regulation') {
      // 模糊搜索规则
      depth++;
      if (depth > maxDepth) break;

      const allRegs = storage.listRegulations({ limit: 1000 });
      const items = allRegs.map(r => ({
        id: r.regulationId,
        text: regulationToSearchText(r),
      }));
      const matches = inlineFuzzyMatch(query, items, 20);

      const thought = `在 ${allRegs.length} 条规则中搜索与查询相关的因果规则`;
      const action = 'fuzzy_search_regulations';
      const observation =
        matches.length > 0
          ? `找到 ${matches.length} 条匹配规则 (最高分: ${matches[0].score.toFixed(1)})`
          : '未找到匹配的因果规则';

      steps.push({ step: depth, thought, action, observation });
      if (matches.length > 0) {
        results.push(observation);
        const topMatches = matches.slice(0, 3);
        for (const m of topMatches) {
          const reg = allRegs.find(r => r.regulationId === m.id);
          if (reg) {
            const desc = reg.description || regulationToSearchText(reg).substring(0, 80);
            results.push(`  规则 ${reg.regulationId} (score=${m.score.toFixed(1)}): ${desc}`);
          }
        }
      }
    } else if (source === 'event') {
      // 模糊搜索事件
      depth++;
      if (depth > maxDepth) break;

      const allEvents = storage.listEvents({ limit: 500 });
      const items = allEvents.map(e => ({
        id: e.eventId,
        text: eventToSearchText(e),
      }));
      const matches = inlineFuzzyMatch(query, items, 20);

      const thought = `在 ${allEvents.length} 个历史事件中搜索相关事件`;
      const action = 'fuzzy_search_events';
      const observation =
        matches.length > 0
          ? `找到 ${matches.length} 个匹配事件 (最高分: ${matches[0].score.toFixed(1)})`
          : '未找到匹配的历史事件';

      steps.push({ step: depth, thought, action, observation });
      if (matches.length > 0) {
        results.push(observation);
        const topMatches = matches.slice(0, 3);
        for (const m of topMatches) {
          const evt = allEvents.find(e => e.eventId === m.id);
          if (evt) {
            const summary = evt.unexplainedAspects
              .slice(0, 2)
              .map(f => f.pred)
              .join(', ');
            results.push(
              `  事件 ${evt.eventId} [${evt.status}] (score=${m.score.toFixed(1)}): ${summary}`
            );
          }
        }
      }
    }
  }

  const finalAnswer =
    results.length > 0
      ? `搜索查询 "${query}" 的结果:\n${results.join('\n')}`
      : `未找到与 "${query}" 相关的因果知识`;

  return { steps, finalAnswer };
}

// ──────────────────────────────────────────────
// 蒙特卡洛证据采样内部实现
// ──────────────────────────────────────────────

interface TextChunk {
  text: string;
  start: number;
  end: number;
  score: number;
}

/**
 * 将文档切分为句子或段落级别的片段
 */
function splitIntoChunks(document: string, chunkSize = 200): TextChunk[] {
  const chunks: TextChunk[] = [];
  // 先按段落切分，再按句子切分
  const paragraphs = document.split(/\n{2,}/);
  let pos = 0;

  for (const para of paragraphs) {
    const sentences = para.split(/(?<=[。！？.!?])\s*/);
    let buf = '';
    let bufStart = pos;

    for (const sent of sentences) {
      buf += sent;
      if (buf.length >= chunkSize) {
        chunks.push({ text: buf.trim(), start: bufStart, end: pos + buf.length, score: 0 });
        bufStart = pos + buf.length;
        buf = '';
      }
      pos += sent.length;
    }

    if (buf.trim().length > 0) {
      chunks.push({ text: buf.trim(), start: bufStart, end: pos, score: 0 });
    }
    pos += 2; // 跳过段落分隔符
  }

  return chunks.filter(c => c.text.length > 10);
}

/**
 * 计算文本片段与查询的相关分数
 * 结合 TF 和 IDF 权重
 */
function scoreChunk(
  chunk: string,
  queryTokens: string[],
  idfWeights: Record<string, number>
): number {
  const chunkLower = chunk.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    const weight = idfWeights[token] ?? 1.0;
    // 计算 TF（token 在 chunk 中出现的次数）
    let count = 0;
    let pos = 0;
    while ((pos = chunkLower.indexOf(token, pos)) !== -1) {
      count++;
      pos += token.length;
    }
    if (count > 0) {
      // TF-IDF 得分（对数平滑）
      score += (1 + Math.log(count)) * weight;
    }
  }

  return score;
}

/**
 * 蒙特卡洛证据采样：随机采样候选片段，多轮迭代挑选最优
 * 这里使用确定性的贪婪近似（无随机游走），但保留"蒙特卡洛"的统计评分思想：
 * 对每个片段多次评估（窗口滑动），取最大值作为最终分数
 */
function monteCarloSample(
  chunks: TextChunk[],
  queryTokens: string[],
  idfWeights: Record<string, number>,
  topK: number
): TextChunk[] {
  if (chunks.length === 0) return [];

  // 评分每个片段（基础分）
  const scored = chunks.map(chunk => ({
    ...chunk,
    score: scoreChunk(chunk.text, queryTokens, idfWeights),
  }));

  // 滑动窗口二次评估（模拟多次采样取最优）
  for (let i = 1; i < scored.length - 1; i++) {
    // 相邻片段合并得分（跨片段上下文奖励）
    const contextBonus =
      (scored[i - 1].score + scored[i + 1].score) * 0.1;
    scored[i].score += contextBonus;
  }

  // 返回 topK 个最高分片段
  return scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ──────────────────────────────────────────────
// 工具函数导出
// ──────────────────────────────────────────────

/**
 * 智能因果搜索工具
 * 使用规则驱动的 ReAct 循环自动搜索因果关系
 */
export async function causalSearchTool(
  storage: CausalStorage,
  args: z.infer<typeof causalSearchSchema>
): Promise<ToolResult> {
  const { query, maxDepth = 5, strategy = 'knowledge_first' } = args;

  if (!query.trim()) {
    return textResult('错误：搜索查询不能为空');
  }

  const { steps, finalAnswer } = runReActLoop(storage, query, maxDepth, strategy);

  // 格式化 ReAct 步骤日志
  const stepsText = steps
    .map(
      s =>
        `[步骤 ${s.step}]\n  思考: ${s.thought}\n  动作: ${s.action}\n  结果: ${s.observation}`
    )
    .join('\n\n');

  const output = [
    `## 因果搜索: "${query}"`,
    `策略: ${strategy}, 最大深度: ${maxDepth}`,
    '',
    '### 搜索过程',
    stepsText || '（无搜索步骤）',
    '',
    '### 最终结果',
    finalAnswer,
  ].join('\n');

  return textResult(output);
}

/**
 * 模糊搜索因果规则工具
 */
export async function fuzzySearchRegulationsTool(
  storage: CausalStorage,
  args: z.infer<typeof fuzzySearchRegulationsSchema>
): Promise<ToolResult> {
  const { query, threshold = 30, limit = 10 } = args;

  if (!query.trim()) {
    return textResult('错误：搜索查询不能为空');
  }

  const allRegs = storage.listRegulations({ limit: 2000 });

  if (allRegs.length === 0) {
    return textResult('当前存储中没有任何因果规则');
  }

  const items = allRegs.map(r => ({
    id: r.regulationId,
    text: regulationToSearchText(r),
  }));

  const matches = inlineFuzzyMatch(query, items, threshold).slice(0, limit);

  if (matches.length === 0) {
    return textResult(
      `未找到与 "${query}" 匹配的因果规则（阈值: ${threshold}，共检索 ${allRegs.length} 条规则）`
    );
  }

  const lines: string[] = [
    `## 模糊搜索因果规则: "${query}"`,
    `找到 ${matches.length} 条匹配规则（阈值: ${threshold}，共 ${allRegs.length} 条）`,
    '',
  ];

  for (const match of matches) {
    const reg = allRegs.find(r => r.regulationId === match.id);
    if (!reg) continue;

    const pre = reg.pre.map(f => `${f.pred}=${JSON.stringify(f.value)}`).join(', ');
    const eff = reg.eff.map(f => `${f.pred}=${JSON.stringify(f.value)}`).join(', ');

    lines.push(
      `### ${reg.regulationId} (分数: ${match.score.toFixed(1)})`,
      `- 状态: ${reg.status}`,
      `- 前提: ${pre || '（无）'}`,
      `- 效果: ${eff || '（无）'}`,
      reg.description ? `- 描述: ${reg.description}` : '',
      `- 支持数: ${reg.supportN}, 已解释: ${reg.explainedCount}`,
      ''
    );
  }

  return textResult(lines.filter(l => l !== null).join('\n'));
}

/**
 * 模糊搜索历史事件工具
 */
export async function fuzzySearchEventsTool(
  storage: CausalStorage,
  args: z.infer<typeof fuzzySearchEventsSchema>
): Promise<ToolResult> {
  const { query, status, threshold = 30, limit = 10 } = args;

  if (!query.trim()) {
    return textResult('错误：搜索查询不能为空');
  }

  const listOptions = status
    ? { status: status as Event['status'], limit: 2000 }
    : { limit: 2000 };

  const allEvents = storage.listEvents(listOptions);

  if (allEvents.length === 0) {
    return textResult(
      status
        ? `当前存储中没有状态为 "${status}" 的事件`
        : '当前存储中没有任何事件'
    );
  }

  const items = allEvents.map(e => ({
    id: e.eventId,
    text: eventToSearchText(e),
  }));

  const matches = inlineFuzzyMatch(query, items, threshold).slice(0, limit);

  if (matches.length === 0) {
    return textResult(
      `未找到与 "${query}" 匹配的事件（阈值: ${threshold}，共检索 ${allEvents.length} 个事件）`
    );
  }

  const lines: string[] = [
    `## 模糊搜索历史事件: "${query}"`,
    `找到 ${matches.length} 个匹配事件（阈值: ${threshold}，共 ${allEvents.length} 个）`,
    '',
  ];

  for (const match of matches) {
    const evt = allEvents.find(e => e.eventId === match.id);
    if (!evt) continue;

    const unexplained = evt.unexplainedAspects
      .map(f => `${f.pred}=${JSON.stringify(f.value)}`)
      .join(', ');

    lines.push(
      `### ${evt.eventId} (分数: ${match.score.toFixed(1)})`,
      `- 状态: ${evt.status}`,
      `- 未解释方面: ${unexplained || '（无）'}`,
      `- 观测时间: ${evt.observation.timestamp || '未知'}`,
      evt.clusterId ? `- 聚类 ID: ${evt.clusterId}` : '',
      ''
    );
  }

  return textResult(lines.filter(l => l !== null).join('\n'));
}

/**
 * 构建知识聚类工具
 * 从当前数据构建并缓存知识聚类
 */
export async function buildKnowledgeClusterTool(
  storage: CausalStorage,
  args: z.infer<typeof buildKnowledgeClusterSchema>
): Promise<ToolResult> {
  const { name, regulationIds = [], eventIds = [], description } = args;

  if (!name.trim()) {
    return textResult('错误：聚类名称不能为空');
  }

  // 验证 regulation IDs 是否存在
  const validRegIds: string[] = [];
  const invalidRegIds: string[] = [];
  for (const id of regulationIds) {
    if (storage.getRegulation(id)) {
      validRegIds.push(id);
    } else {
      invalidRegIds.push(id);
    }
  }

  // 验证 event IDs 是否存在
  const validEventIds: string[] = [];
  const invalidEventIds: string[] = [];
  for (const id of eventIds) {
    if (storage.getEvent(id)) {
      validEventIds.push(id);
    } else {
      invalidEventIds.push(id);
    }
  }

  // 构建聚类对象
  const clusterId = 'kc_' + uuidv4().substring(0, 8);
  const cluster: KnowledgeCluster = {
    clusterId,
    name: name.trim(),
    description,
    regulationIds: validRegIds,
    eventIds: validEventIds,
    createdAt: new Date().toISOString(),
  };

  knowledgeClusters.set(clusterId, cluster);

  const warnings: string[] = [];
  if (invalidRegIds.length > 0) {
    warnings.push(`警告：以下 regulation ID 不存在: ${invalidRegIds.join(', ')}`);
  }
  if (invalidEventIds.length > 0) {
    warnings.push(`警告：以下 event ID 不存在: ${invalidEventIds.join(', ')}`);
  }

  const lines = [
    `## 知识聚类构建成功`,
    `- 聚类 ID: ${clusterId}`,
    `- 名称: ${name}`,
    description ? `- 描述: ${description}` : '',
    `- 关联规则: ${validRegIds.length} 条`,
    `- 关联事件: ${validEventIds.length} 个`,
    `- 创建时间: ${cluster.createdAt}`,
    warnings.length > 0 ? '\n' + warnings.join('\n') : '',
  ];

  return textResult(lines.filter(l => l !== '').join('\n'));
}

/**
 * 搜索已有知识聚类工具
 */
export async function searchKnowledgeClustersTool(
  _storage: CausalStorage,
  args: z.infer<typeof searchKnowledgeClustersSchema>
): Promise<ToolResult> {
  const { query, limit = 5 } = args;

  if (!query.trim()) {
    return textResult('错误：搜索查询不能为空');
  }

  if (knowledgeClusters.size === 0) {
    return textResult('当前没有任何知识聚类，请先使用 build_knowledge_cluster 工具创建聚类');
  }

  const items = Array.from(knowledgeClusters.values()).map(c => ({
    id: c.clusterId,
    text: `${c.name} ${c.description || ''}`,
  }));

  const matches = inlineFuzzyMatch(query, items, 0).slice(0, limit);

  if (matches.length === 0) {
    return textResult(`未找到与 "${query}" 匹配的知识聚类`);
  }

  const lines: string[] = [
    `## 知识聚类搜索: "${query}"`,
    `找到 ${matches.length} 个匹配聚类（共 ${knowledgeClusters.size} 个）`,
    '',
  ];

  for (const match of matches) {
    const cluster = knowledgeClusters.get(match.id);
    if (!cluster) continue;

    lines.push(
      `### ${cluster.name} (分数: ${match.score.toFixed(1)})`,
      `- 聚类 ID: ${cluster.clusterId}`,
      cluster.description ? `- 描述: ${cluster.description}` : '',
      `- 关联规则: ${cluster.regulationIds.length} 条`,
      `- 关联事件: ${cluster.eventIds.length} 个`,
      `- 创建时间: ${cluster.createdAt}`,
      ''
    );
  }

  return textResult(lines.filter(l => l !== null).join('\n'));
}

/**
 * 蒙特卡洛证据采样工具
 * 从长文本中提取与查询最相关的片段
 */
export async function sampleEvidenceTool(
  _storage: CausalStorage,
  args: z.infer<typeof sampleEvidenceSchema>
): Promise<ToolResult> {
  const { document, query, keywords = {}, topK = 3 } = args;

  if (!document.trim()) {
    return textResult('错误：文档内容不能为空');
  }

  if (!query.trim()) {
    return textResult('错误：搜索查询不能为空');
  }

  // 提取查询 tokens
  const queryTokens = query
    .toLowerCase()
    .split(/[\s\u3000\u200B,，。！？.!?]+/)
    .filter(t => t.length > 0);

  // 构建 IDF 权重（使用提供的权重，未提供的 token 默认权重 1.0）
  const idfWeights: Record<string, number> = {};
  for (const token of queryTokens) {
    idfWeights[token] = keywords[token] ?? 1.0;
  }

  // 切分文档
  const chunks = splitIntoChunks(document);

  if (chunks.length === 0) {
    return textResult('文档内容过短，无法进行有效采样');
  }

  // 蒙特卡洛采样
  const topChunks = monteCarloSample(chunks, queryTokens, idfWeights, topK);

  if (topChunks.length === 0) {
    return textResult(`在文档中未找到与 "${query}" 相关的证据片段`);
  }

  const lines: string[] = [
    `## 证据采样结果: "${query}"`,
    `文档长度: ${document.length} 字符，切分为 ${chunks.length} 个片段，返回前 ${topChunks.length} 个最相关片段`,
    '',
  ];

  for (let i = 0; i < topChunks.length; i++) {
    const chunk = topChunks[i];
    lines.push(
      `### 片段 ${i + 1} (相关度分数: ${chunk.score.toFixed(3)})`,
      `位置: 字符 ${chunk.start}-${chunk.end}`,
      '',
      chunk.text,
      ''
    );
  }

  return textResult(lines.join('\n'));
}
