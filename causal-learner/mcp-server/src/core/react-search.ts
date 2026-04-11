/**
 * ReAct 搜索代理模块 — 因果推理主动搜索
 *
 * 设计思路：让因果推理从被动查询变为主动搜索
 * 循环模式：Think → Act (call tool) → Observe (get result) → Think → ... → Answer
 *
 * 参考 ReActSearchAgent + ToolRegistry 设计，带 token budget 和循环限制的安全控制。
 */

import type { Regulation, Event, Observation, Story } from './types.js';

// =============================================================================
// KnowledgeCluster 引用类型（简化版，避免循环依赖）
// =============================================================================

/**
 * 知识聚类引用（简化版，用于搜索结果展示）
 */
export interface KnowledgeClusterRef {
  id: string;
  name: string;
  description: string;
  content: string;
  confidence: number;
}

// =============================================================================
// SearchContext — 搜索状态追踪
// =============================================================================

/**
 * 工具调用日志条目
 */
export interface ToolLog {
  toolName: string;
  tokens: number;
  timestamp: string;
  metadata: Record<string, unknown>;
}

/**
 * 搜索上下文：追踪整个 ReAct 会话的状态、预算和历史
 */
export interface SearchContext {
  maxTokenBudget: number;
  maxLoops: number;
  tokenUsed: number;
  loopCount: number;
  searchHistory: string[];
  readFileIds: Set<string>;
  logs: ToolLog[];

  /** 是否已达到循环上限 */
  isLoopLimitReached(): boolean;
  /** 是否已超出 token 预算 */
  isBudgetExceeded(): boolean;
  /** 剩余 token 预算 */
  budgetRemaining(): number;
  /** 记录一次搜索查询 */
  addSearch(query: string): void;
  /** 记录工具调用日志 */
  addLog(toolName: string, tokens: number, metadata?: Record<string, unknown>): void;
  /** 标记某个文件/文档已读 */
  markFileRead(fileId: string): void;
  /** 检查某个文件/文档是否已读 */
  isFileRead(fileId: string): boolean;
  /** 返回上下文摘要字符串 */
  summary(): string;
}

/**
 * 创建搜索上下文实例
 */
export function createSearchContext(
  maxTokenBudget: number = 64000,
  maxLoops: number = 10
): SearchContext {
  const ctx: SearchContext = {
    maxTokenBudget,
    maxLoops,
    tokenUsed: 0,
    loopCount: 0,
    searchHistory: [],
    readFileIds: new Set<string>(),
    logs: [],

    isLoopLimitReached(): boolean {
      return this.loopCount >= this.maxLoops;
    },

    isBudgetExceeded(): boolean {
      return this.tokenUsed >= this.maxTokenBudget;
    },

    budgetRemaining(): number {
      return Math.max(0, this.maxTokenBudget - this.tokenUsed);
    },

    addSearch(query: string): void {
      this.searchHistory.push(query);
    },

    addLog(toolName: string, tokens: number, metadata: Record<string, unknown> = {}): void {
      this.tokenUsed += tokens;
      this.logs.push({
        toolName,
        tokens,
        timestamp: new Date().toISOString(),
        metadata,
      });
    },

    markFileRead(fileId: string): void {
      this.readFileIds.add(fileId);
    },

    isFileRead(fileId: string): boolean {
      return this.readFileIds.has(fileId);
    },

    summary(): string {
      return [
        `循环次数: ${this.loopCount}/${this.maxLoops}`,
        `Token 使用: ${this.tokenUsed}/${this.maxTokenBudget}`,
        `搜索历史: ${this.searchHistory.length} 条`,
        `已读文档: ${this.readFileIds.size} 个`,
        `工具调用: ${this.logs.length} 次`,
      ].join(', ');
    },
  };

  return ctx;
}

// =============================================================================
// Tool 抽象与 ToolRegistry
// =============================================================================

/**
 * 工具参数 schema 定义
 */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      default?: unknown;
    }>;
    required: string[];
  };
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  text: string;
  metadata: Record<string, unknown>;
}

/**
 * 搜索工具接口
 */
export interface SearchTool {
  name: string;
  getSchema(): ToolSchema;
  execute(context: SearchContext, args: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * 工具注册表：管理所有可用工具
 */
export class ToolRegistry {
  private tools: Map<string, SearchTool> = new Map();

  /** 注册一个工具 */
  register(tool: SearchTool): void {
    this.tools.set(tool.name, tool);
  }

  /** 根据名称获取工具 */
  get(name: string): SearchTool | undefined {
    return this.tools.get(name);
  }

  /** 获取所有工具的 schema */
  getAllSchemas(): ToolSchema[] {
    return [...this.tools.values()].map((t) => t.getSchema());
  }

  /** 获取所有工具名称 */
  toolNames(): string[] {
    return [...this.tools.keys()];
  }

  /**
   * 执行指定工具
   * 工具不存在时返回错误结果，不抛出异常
   */
  async execute(
    toolName: string,
    context: SearchContext,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        text: `错误：未找到工具 "${toolName}"。可用工具：${this.toolNames().join(', ')}`,
        metadata: { error: 'tool_not_found', toolName },
      };
    }
    return tool.execute(context, args);
  }
}

// =============================================================================
// 内置工具实现
// =============================================================================

/**
 * RegulationSearchTool — 搜索因果规则（轻量级）
 * 按关键词搜索 regulations，返回匹配的 regulation 摘要
 */
export class RegulationSearchTool implements SearchTool {
  readonly name = 'regulation_search';

  constructor(
    private readonly getRegulations: () => Regulation[],
    private readonly fuzzyMatch: (
      query: string,
      items: Array<{ id: string; text: string }>
    ) => Array<{ id: string; score: number }>
  ) {}

  getSchema(): ToolSchema {
    return {
      name: this.name,
      description: '按关键词搜索因果规则（Regulation）。返回匹配的规则 ID、描述和状态。适合快速定位相关因果知识。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词或短语',
          },
          limit: {
            type: 'number',
            description: '最多返回的结果数量',
            default: 10,
          },
          status: {
            type: 'string',
            description: '按状态筛选：candidate / hypothesis / confirmed / retired',
            default: '',
          },
        },
        required: ['query'],
      },
    };
  }

  async execute(context: SearchContext, args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args['query'] || '');
    const limit = Number(args['limit'] || 10);
    const statusFilter = String(args['status'] || '');

    context.addSearch(query);

    let regs = this.getRegulations();
    if (statusFilter) {
      regs = regs.filter((r) => r.status === statusFilter);
    }

    // 构建用于模糊匹配的文档列表
    const items = regs.map((r) => ({
      id: r.regulationId,
      text: [
        r.description || '',
        r.pre.map((f) => `${f.pred}=${JSON.stringify(f.value)}`).join(' '),
        r.eff.map((f) => `${f.pred}=${JSON.stringify(f.value)}`).join(' '),
        (r.tags || []).join(' '),
      ].join(' '),
    }));

    const matches = this.fuzzyMatch(query, items).slice(0, limit);

    // 构建规则 ID 到规则的索引
    const regById = new Map(regs.map((r) => [r.regulationId, r]));

    const lines: string[] = [`找到 ${matches.length} 条匹配规则：`];
    for (const m of matches) {
      const r = regById.get(m.id);
      if (!r) continue;
      lines.push(
        `  [${r.regulationId}] (${r.status}, score=${m.score.toFixed(3)}) ${r.description || '(无描述)'}`
      );
    }

    const tokenEstimate = lines.join('\n').length;
    context.addLog(this.name, tokenEstimate, { query, matchCount: matches.length });

    return {
      text: lines.join('\n'),
      metadata: {
        matches: matches.map((m) => ({ id: m.id, score: m.score })),
        total: regs.length,
      },
    };
  }
}

/**
 * EventSearchTool — 搜索历史事件（中等成本）
 * 按关键词搜索 events，返回匹配的 event 摘要
 */
export class EventSearchTool implements SearchTool {
  readonly name = 'event_search';

  constructor(
    private readonly getEvents: (options?: { status?: string; limit?: number }) => Event[],
    private readonly fuzzyMatch: (
      query: string,
      items: Array<{ id: string; text: string }>
    ) => Array<{ id: string; score: number }>
  ) {}

  getSchema(): ToolSchema {
    return {
      name: this.name,
      description: '按关键词搜索历史事件（Event）。返回匹配事件的 ID、时间戳、状态和未解释方面。适合查找相似历史案例。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词或短语',
          },
          limit: {
            type: 'number',
            description: '最多返回的结果数量',
            default: 10,
          },
          status: {
            type: 'string',
            description: '按状态筛选：open / clustered / resolved / archived',
            default: '',
          },
        },
        required: ['query'],
      },
    };
  }

  async execute(context: SearchContext, args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args['query'] || '');
    const limit = Number(args['limit'] || 10);
    const statusFilter = String(args['status'] || '');

    context.addSearch(query);

    const events = this.getEvents(statusFilter ? { status: statusFilter } : undefined);

    // 构建用于模糊匹配的文档列表
    const items = events.map((e) => ({
      id: e.eventId,
      text: [
        e.notes || '',
        e.observation.facts.map((f) => `${f.pred}=${JSON.stringify(f.value)}`).join(' '),
        e.unexplainedAspects.map((f) => f.pred).join(' '),
        (e.tags || []).join(' '),
      ].join(' '),
    }));

    const matches = this.fuzzyMatch(query, items).slice(0, limit);

    // 构建事件 ID 到事件的索引
    const eventById = new Map(events.map((e) => [e.eventId, e]));

    const lines: string[] = [`找到 ${matches.length} 条匹配事件：`];
    for (const m of matches) {
      const e = eventById.get(m.id);
      if (!e) continue;
      lines.push(
        `  [${e.eventId}] (${e.status || 'open'}, score=${m.score.toFixed(3)}) ` +
        `时间: ${e.timestamp}, 未解释方面: ${e.unexplainedAspects.length} 个`
      );
    }

    const tokenEstimate = lines.join('\n').length;
    context.addLog(this.name, tokenEstimate, { query, matchCount: matches.length });

    return {
      text: lines.join('\n'),
      metadata: {
        matches: matches.map((m) => ({ id: m.id, score: m.score })),
        total: events.length,
      },
    };
  }
}

/**
 * KnowledgeQueryTool — 查询知识缓存（零成本）
 * 搜索 KnowledgeCluster 缓存，返回相关知识摘要
 */
export class KnowledgeQueryTool implements SearchTool {
  readonly name = 'knowledge_query';

  constructor(
    private readonly findClusters: (query: string, limit?: number) => KnowledgeClusterRef[]
  ) {}

  getSchema(): ToolSchema {
    return {
      name: this.name,
      description: '查询知识缓存（KnowledgeCluster）。零成本操作，优先使用。返回已归纳的知识摘要和置信度。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '查询关键词或问题描述',
          },
          limit: {
            type: 'number',
            description: '最多返回的结果数量',
            default: 5,
          },
        },
        required: ['query'],
      },
    };
  }

  async execute(context: SearchContext, args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args['query'] || '');
    const limit = Number(args['limit'] || 5);

    context.addSearch(query);

    const clusters = this.findClusters(query, limit);

    if (clusters.length === 0) {
      context.addLog(this.name, 10, { query, matchCount: 0 });
      return {
        text: `知识缓存中未找到与 "${query}" 相关的内容。`,
        metadata: { matches: [], total: 0 },
      };
    }

    const lines: string[] = [`找到 ${clusters.length} 个相关知识聚类：`];
    for (const c of clusters) {
      lines.push(`  [${c.id}] ${c.name} (置信度: ${c.confidence.toFixed(2)})`);
      if (c.description) {
        lines.push(`    描述: ${c.description}`);
      }
      if (c.content) {
        // 截断过长的内容
        const preview = c.content.length > 200 ? c.content.slice(0, 200) + '...' : c.content;
        lines.push(`    内容: ${preview}`);
      }

      // 标记为已读
      context.markFileRead(c.id);
    }

    const tokenEstimate = lines.join('\n').length;
    context.addLog(this.name, tokenEstimate, { query, matchCount: clusters.length });

    return {
      text: lines.join('\n'),
      metadata: {
        clusters: clusters.map((c) => ({ id: c.id, name: c.name, confidence: c.confidence })),
        total: clusters.length,
      },
    };
  }
}

/**
 * CausalAnalysisTool — 深度因果分析（高成本）
 * 执行因果解释，返回推理链
 */
export class CausalAnalysisTool implements SearchTool {
  readonly name = 'causal_analysis';

  constructor(
    private readonly explain: (
      observation: Observation,
      regulations: Regulation[]
    ) => Story[]
  ) {}

  getSchema(): ToolSchema {
    return {
      name: this.name,
      description: '对观察执行深度因果分析。高成本操作，仅在其他工具无法解答时使用。返回推理链（Story）列表。',
      parameters: {
        type: 'object',
        properties: {
          observation_id: {
            type: 'string',
            description: '要分析的观察 ID（observationId）',
          },
          observation_json: {
            type: 'string',
            description: '观察数据的 JSON 字符串（当无法通过 ID 查找时使用）',
            default: '',
          },
          regulation_ids: {
            type: 'string',
            description: '要参考的规则 ID 列表，逗号分隔（为空则使用所有规则）',
            default: '',
          },
        },
        required: ['observation_id'],
      },
    };
  }

  async execute(context: SearchContext, args: Record<string, unknown>): Promise<ToolResult> {
    const observationId = String(args['observation_id'] || '');
    const observationJson = String(args['observation_json'] || '');
    const regulationIdsStr = String(args['regulation_ids'] || '');

    // 解析观察对象
    let observation: Observation | null = null;
    if (observationJson) {
      try {
        observation = JSON.parse(observationJson) as Observation;
      } catch {
        return {
          text: `错误：无法解析 observation_json: ${observationJson.slice(0, 100)}`,
          metadata: { error: 'invalid_json', observationId },
        };
      }
    }

    if (!observation) {
      return {
        text: `错误：需要提供 observation_json 或可查找的 observation_id "${observationId}"`,
        metadata: { error: 'missing_observation', observationId },
      };
    }

    // 解析规则 ID 过滤列表
    const filterIds = regulationIdsStr
      ? new Set(regulationIdsStr.split(',').map((s) => s.trim()).filter(Boolean))
      : null;

    // 此处传入空 regulations 列表，由调用方在构建工具时注入
    // 实际使用时请通过闭包传入 getRegulations 函数
    const regulations: Regulation[] = [];
    const filtered = filterIds
      ? regulations.filter((r) => filterIds.has(r.regulationId))
      : regulations;

    const stories = this.explain(observation, filtered);

    if (stories.length === 0) {
      context.addLog(this.name, 50, { observationId, storyCount: 0 });
      return {
        text: `对观察 "${observationId}" 未找到有效的因果解释。`,
        metadata: { stories: [], observationId },
      };
    }

    const lines: string[] = [`找到 ${stories.length} 条因果解释链：`];
    for (let i = 0; i < stories.length; i++) {
      const s = stories[i];
      lines.push(
        `  [${i + 1}] 规则链: ${s.regulationIds.join(' → ')} ` +
        `(分数: ${(s.score || 0).toFixed(3)}, 假设: ${(s.assumptions || []).length} 个)`
      );
      if (s.notes) {
        lines.push(`      备注: ${s.notes}`);
      }
    }

    const tokenEstimate = lines.join('\n').length + 200; // 因果分析额外 token 开销
    context.addLog(this.name, tokenEstimate, { observationId, storyCount: stories.length });

    return {
      text: lines.join('\n'),
      metadata: {
        stories: stories.map((s) => ({
          regulationIds: s.regulationIds,
          score: s.score,
          assumptionCount: (s.assumptions || []).length,
        })),
        observationId,
      },
    };
  }
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 解析 LLM 输出中的工具调用
 * 支持三种格式：
 *   1. JSON block: ```json\n{"tool": "...", "args": {...}}\n```
 *   2. Markdown code block: ```\n{"tool": "...", "args": {...}}\n```
 *   3. Function call 格式: tool_name({"key": "value"})
 */
export function parseToolCall(
  text: string,
  availableTools: string[]
): { toolName: string; args: Record<string, unknown> } | null {
  // 格式 1 & 2: JSON / Markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      const toolName = String(parsed.tool || parsed.name || parsed.tool_name || '');
      if (toolName && availableTools.includes(toolName)) {
        const args = (parsed.args || parsed.arguments || parsed.parameters || {}) as Record<string, unknown>;
        return { toolName, args };
      }
    } catch {
      // JSON 解析失败，继续尝试其他格式
    }
  }

  // 格式 3: function_name({...}) 或 function_name(...)
  for (const toolName of availableTools) {
    // 匹配 tool_name({...}) 格式（带花括号参数）
    const funcCallRe = new RegExp(
      toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(([\\s\\S]*?)\\)'
    );
    const funcMatch = text.match(funcCallRe);
    if (funcMatch) {
      try {
        const args = JSON.parse(funcMatch[1].trim()) as Record<string, unknown>;
        return { toolName, args };
      } catch {
        // 参数解析失败，尝试裸字符串作为 query
        const rawArg = funcMatch[1].trim().replace(/^["']|["']$/g, '');
        if (rawArg) {
          return { toolName, args: { query: rawArg } };
        }
      }
    }
  }

  // 容错：在纯文本中寻找工具名称 + JSON 对象
  for (const toolName of availableTools) {
    const idx = text.indexOf(toolName);
    if (idx !== -1) {
      // 在工具名称之后寻找第一个 JSON 对象
      const afterTool = text.slice(idx + toolName.length);
      const jsonMatch = afterTool.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const args = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
          return { toolName, args };
        } catch {
          // 继续寻找下一个工具
        }
      }
    }
  }

  return null;
}

/**
 * 从 LLM 输出中提取 <ANSWER>...</ANSWER> 标签内的内容
 */
export function extractAnswer(text: string): string | null {
  const match = text.match(/<ANSWER>([\s\S]*?)<\/ANSWER>/i);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * 构建工具描述文本（给 LLM 看的提示词部分）
 */
export function buildToolDescriptions(registry: ToolRegistry): string {
  const schemas = registry.getAllSchemas();
  if (schemas.length === 0) {
    return '（无可用工具）';
  }

  const lines: string[] = ['可用工具列表：', ''];
  for (const schema of schemas) {
    lines.push(`### ${schema.name}`);
    lines.push(schema.description);
    lines.push('参数：');

    const props = schema.parameters.properties;
    const required = new Set(schema.parameters.required);

    for (const [paramName, paramDef] of Object.entries(props)) {
      const isRequired = required.has(paramName) ? '必填' : '可选';
      const defaultStr = paramDef.default !== undefined
        ? `，默认: ${JSON.stringify(paramDef.default)}`
        : '';
      lines.push(
        `  - ${paramName} (${paramDef.type}, ${isRequired}${defaultStr}): ${paramDef.description}`
      );
    }

    lines.push('');
    lines.push('调用格式（JSON block）：');
    lines.push('```json');
    const exampleArgs: Record<string, string> = {};
    for (const req of schema.parameters.required) {
      exampleArgs[req] = `<${req}>`;
    }
    lines.push(JSON.stringify({ tool: schema.name, args: exampleArgs }, null, 2));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// ReasonerFn — 推理回调类型
// =============================================================================

/**
 * 推理函数签名：由外部提供 LLM 能力，或使用规则引擎
 */
export type ReasonerFn = (
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
) => Promise<string>;

// =============================================================================
// ruleBasedReasoner — 基于规则的简易推理器
// =============================================================================

/**
 * 基于规则的简易推理器（不依赖 LLM）
 * 策略：
 *   1. 若 knowledgeFirst=true，先尝试 knowledge_query
 *   2. 按顺序尝试 regulation_search → event_search → causal_analysis
 *   3. 搜索完成后生成 <ANSWER>
 */
export function ruleBasedReasoner(
  tools: ToolRegistry,
  knowledgeFirst: boolean = true
): ReasonerFn {
  // 记录内部状态：已尝试的工具
  const triedTools = new Set<string>();

  return async (
    _systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> => {
    // 从消息历史推断当前查询
    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

    // 提取查询关键词（取第一条用户消息或最后一条）
    const firstUserMsg = userMessages[0]?.content || lastUserMsg;

    // 确定下一个要调用的工具
    const toolOrder = knowledgeFirst
      ? ['knowledge_query', 'regulation_search', 'event_search', 'causal_analysis']
      : ['regulation_search', 'event_search', 'knowledge_query', 'causal_analysis'];

    // 检查最后一条助手消息，看是否已有工具结果
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    const hasResults = assistantMessages.some((m) =>
      m.content.includes('找到') || m.content.includes('Observe:')
    );

    // 如果已经收集到足够信息，生成最终答案
    if (hasResults && assistantMessages.length >= 2) {
      const observations = assistantMessages
        .filter((m) => m.content.startsWith('Observe:'))
        .map((m) => m.content.replace('Observe:', '').trim())
        .join('\n\n');

      return `<ANSWER>${observations || '已完成搜索，请参考以上工具返回的信息进行分析。'}</ANSWER>`;
    }

    // 找到下一个未尝试的工具
    const availableTools = tools.toolNames();
    for (const toolName of toolOrder) {
      if (!triedTools.has(toolName) && availableTools.includes(toolName)) {
        triedTools.add(toolName);

        // 生成工具调用指令
        const args: Record<string, string> = { query: firstUserMsg };

        return [
          `Think: 我将使用 ${toolName} 工具搜索相关信息。`,
          '',
          '```json',
          JSON.stringify({ tool: toolName, args }, null, 2),
          '```',
        ].join('\n');
      }
    }

    // 所有工具都已尝试，生成最终答案
    const allObservations = assistantMessages
      .filter((m) => m.content.startsWith('Observe:'))
      .map((m) => m.content.replace('Observe:', '').trim())
      .join('\n\n');

    return `<ANSWER>${allObservations || '搜索完成，未找到足够的相关信息。'}</ANSWER>`;
  };
}

// =============================================================================
// ReActSearchAgent — 主代理
// =============================================================================

/**
 * ReAct 代理配置
 */
export interface ReActConfig {
  /** 最大循环次数，默认 10 */
  maxLoops?: number;
  /** 最大 token 预算，默认 64000 */
  maxTokenBudget?: number;
  /** 是否输出详细日志，默认 true */
  verbose?: boolean;
}

/**
 * ReAct 搜索代理
 * 执行完整的 Think→Act→Observe 循环，直到得出答案或达到限制
 */
export class ReActSearchAgent {
  private readonly maxLoops: number;
  private readonly maxTokenBudget: number;
  private readonly verbose: boolean;

  constructor(
    private readonly registry: ToolRegistry,
    private readonly reasoner: ReasonerFn,
    config: ReActConfig = {}
  ) {
    this.maxLoops = config.maxLoops ?? 10;
    this.maxTokenBudget = config.maxTokenBudget ?? 64000;
    this.verbose = config.verbose ?? true;
  }

  /**
   * 执行完整的 ReAct 搜索会话
   *
   * @param query 用户查询
   * @param initialKeywords 可选的初始关键词（用于引导第一轮搜索）
   * @returns 最终答案和搜索上下文
   */
  async run(
    query: string,
    initialKeywords: string[] = []
  ): Promise<{ answer: string; context: SearchContext }> {
    const context = createSearchContext(this.maxTokenBudget, this.maxLoops);

    // 构建系统提示词
    const toolDescriptions = buildToolDescriptions(this.registry);
    const systemPrompt = this.buildSystemPrompt(toolDescriptions);

    // 初始化消息历史
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // 构建初始用户消息
    const initialKeywordHint = initialKeywords.length > 0
      ? `\n\n提示关键词：${initialKeywords.join('、')}`
      : '';
    messages.push({
      role: 'user',
      content: `问题：${query}${initialKeywordHint}`,
    });

    if (this.verbose) {
      this.log(`开始 ReAct 搜索: "${query}"`);
    }

    let finalAnswer = '';

    // 主循环
    while (!context.isLoopLimitReached() && !context.isBudgetExceeded()) {
      context.loopCount++;

      if (this.verbose) {
        this.log(`循环 ${context.loopCount}/${context.maxLoops}, 预算剩余: ${context.budgetRemaining()}`);
      }

      // 调用推理器（Think 步骤）
      let reasonerOutput: string;
      try {
        reasonerOutput = await this.reasoner(systemPrompt, messages);
      } catch (err) {
        this.log(`推理器错误: ${String(err)}`);
        break;
      }

      // 记录推理输出到消息历史
      messages.push({ role: 'assistant', content: reasonerOutput });

      // 检查是否包含最终答案
      const answer = extractAnswer(reasonerOutput);
      if (answer !== null) {
        finalAnswer = answer;
        if (this.verbose) {
          this.log(`找到最终答案（循环 ${context.loopCount}）`);
        }
        break;
      }

      // 解析工具调用（Act 步骤）
      const toolCall = parseToolCall(reasonerOutput, this.registry.toolNames());
      if (!toolCall) {
        if (this.verbose) {
          this.log(`未找到工具调用，尝试直接提取内容作为答案`);
        }
        // 没有工具调用也没有答案标签，将输出本身视为最终答案
        finalAnswer = reasonerOutput.trim();
        break;
      }

      if (this.verbose) {
        this.log(`调用工具: ${toolCall.toolName}(${JSON.stringify(toolCall.args).slice(0, 80)}...)`);
      }

      // 执行工具（Observe 步骤）
      let toolResult: ToolResult;
      try {
        toolResult = await this.registry.execute(toolCall.toolName, context, toolCall.args);
      } catch (err) {
        toolResult = {
          text: `工具执行异常: ${String(err)}`,
          metadata: { error: String(err) },
        };
      }

      // 将工具结果追加到消息历史
      messages.push({
        role: 'user',
        content: `Observe: ${toolResult.text}`,
      });

      if (this.verbose) {
        this.log(`Observe (${toolCall.toolName}): ${toolResult.text.slice(0, 120)}...`);
      }
    }

    // 循环结束后仍无答案，生成兜底答案
    if (!finalAnswer) {
      const observeMessages = messages
        .filter((m) => m.role === 'user' && m.content.startsWith('Observe:'))
        .map((m) => m.content.replace('Observe:', '').trim());

      if (observeMessages.length > 0) {
        finalAnswer = `搜索结果摘要（已达到${context.isLoopLimitReached() ? '循环' : 'Token'}上限）：\n\n` +
          observeMessages.join('\n\n---\n\n');
      } else {
        finalAnswer = `搜索完成，未找到与 "${query}" 相关的信息。`;
      }
    }

    if (this.verbose) {
      this.log(`搜索完成。${context.summary()}`);
    }

    return { answer: finalAnswer, context };
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(toolDescriptions: string): string {
    return [
      '你是一个因果推理搜索代理，使用 ReAct 循环（Think → Act → Observe）主动搜索和分析信息。',
      '',
      '工作流程：',
      '1. Think: 分析当前信息，决定下一步行动',
      '2. Act: 调用工具（使用 JSON block 格式）',
      '3. Observe: 观察工具返回结果',
      '4. 重复，直到找到满意答案',
      '5. 输出 <ANSWER>最终答案</ANSWER> 结束搜索',
      '',
      '规则：',
      '- 优先使用低成本工具（knowledge_query > regulation_search > event_search > causal_analysis）',
      '- 已搜索过的查询不要重复',
      '- 找到足够信息后立即输出 <ANSWER>',
      '',
      toolDescriptions,
    ].join('\n');
  }

  /**
   * 输出日志
   */
  private log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[ReAct ${ts}] ${msg}`);
  }
}
