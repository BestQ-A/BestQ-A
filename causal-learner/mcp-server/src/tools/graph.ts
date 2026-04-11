/**
 * 图操作工具模块 - BestQ-A v5 真相层
 * 将 AtomGraph 的 Atom/Ref/Shortcut 图操作暴露为 MCP 工具
 * 使用延迟初始化模式，兼容 atom-graph.ts 尚未编译的情况
 */

import { z } from 'zod';
import { AtomGraph } from '../core/atom-graph.js';

// ──────────────────────────────────────────────
// Zod Schema 定义
// ──────────────────────────────────────────────

/** 创建原子卡片 Schema */
export const addAtomSchema = z.object({
  content: z.string().describe('原子内容（不可再分的单一事实或概念）'),
  kind: z
    .enum(['fact', 'concept', 'action', 'context', 'pattern'])
    .describe('类型：fact=观测事实, concept=抽象概念, action=操作步骤, context=环境上下文, pattern=模式标签'),
});

/** 创建引用边 Schema */
export const addRefSchema = z.object({
  fromAtomId: z.string().describe('源卡片 ID'),
  toAtomId: z.string().describe('目标卡片 ID'),
  kind: z
    .enum(['causes', 'prevents', 'requires', 'is_a', 'part_of', 'similar_to', 'fixes', 'indicates', 'cooccurs'])
    .describe('关系类型'),
  weight: z.number().min(0).max(1).optional().default(0.5).describe('关系强度 0.0-1.0'),
  mode: z
    .enum(['tentative', 'compiled'])
    .optional()
    .default('tentative')
    .describe('tentative=探索中, compiled=已确认'),
});

/** 发散探索图 Schema */
export const exploreGraphSchema = z.object({
  atomIds: z.array(z.string()).describe('起始观测的 Atom IDs'),
  maxDepth: z.number().optional().default(3).describe('最大搜索深度'),
  maxPaths: z.number().optional().default(10).describe('最大返回路径数'),
});

/** 编译正确路径 Schema */
export const compilePathSchema = z.object({
  correctAtomIds: z.array(z.string()).describe('正确路径上的 Atom IDs（有序）'),
  failedAtomIdsList: z
    .array(z.array(z.string()))
    .optional()
    .describe('错误路径列表，每条是一组 Atom IDs'),
});

/** 髓鞘化高频路径 Schema */
export const myelinateGraphSchema = z.object({
  minUseCount: z.number().optional().default(3).describe('最低使用次数'),
  minWeight: z.number().optional().default(0.6).describe('最低权重'),
});

/** 图查询 Schema */
export const queryGraphSchema = z.object({
  atomId: z.string().describe('查询起点 Atom ID'),
  operation: z
    .enum(['neighbors', 'reachable', 'find_path'])
    .describe('操作：neighbors=直接邻居, reachable=可达节点, find_path=路径搜索'),
  targetAtomId: z.string().optional().describe('find_path 时的目标 Atom ID'),
  maxDepth: z.number().optional().default(3).describe('最大深度'),
  direction: z.enum(['outgoing', 'incoming', 'both']).optional().default('both'),
});

/** 搜索原子卡片 Schema */
export const findAtomsSchema = z.object({
  query: z.string().describe('搜索关键词'),
  kind: z
    .enum(['fact', 'concept', 'action', 'context', 'pattern'])
    .optional()
    .describe('按类型过滤'),
  limit: z.number().optional().default(20).describe('最大返回数'),
});

/** 图统计 Schema */
export const graphStatsSchema = z.object({});

/** 修剪弱边和孤立卡片 Schema */
export const pruneGraphSchema = z.object({
  minWeight: z.number().optional().default(0.1).describe('低于此权重的 tentative 边被删'),
  removeOrphans: z.boolean().optional().default(false).describe('是否删除孤立卡片'),
});

/** 批量摄入事实 Schema */
export const ingestFactsSchema = z.object({
  facts: z
    .array(
      z.object({
        pred: z.string(),
        value: z.unknown(),
        args: z.record(z.unknown()).optional(),
      })
    )
    .describe('观测事实列表'),
  context: z.record(z.unknown()).optional().describe('环境上下文'),
});

/** 所有工具 Schema 集合导出 */
export const graphToolSchemas = {
  add_atom: addAtomSchema,
  add_ref: addRefSchema,
  explore_graph: exploreGraphSchema,
  compile_path: compilePathSchema,
  myelinate_graph: myelinateGraphSchema,
  query_graph: queryGraphSchema,
  find_atoms: findAtomsSchema,
  graph_stats: graphStatsSchema,
  prune_graph: pruneGraphSchema,
  ingest_facts: ingestFactsSchema,
};

// ──────────────────────────────────────────────
// MCP 工具返回类型
// ──────────────────────────────────────────────

/** MCP 工具返回类型 */
type ToolResult = { content: Array<{ type: 'text'; text: string }> };

/** 构造标准文本响应 */
function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

// ──────────────────────────────────────────────
// AtomGraph 延迟初始化
// ──────────────────────────────────────────────

/** 全局 AtomGraph 实例（延迟初始化） */
let _graphInstance: any = null;

/**
 * 获取 AtomGraph 实例，首次调用时初始化
 * 若 atom-graph 模块不可用则返回 null
 */
function getGraph(): any {
  if (!_graphInstance) {
    try {
      const dbPath =
        process.env.CAUSAL_GRAPH_DB_PATH ||
        process.env.CAUSAL_LONGTERM_DB_PATH?.replace('.db', '_graph.db') ||
        ':memory:';
      _graphInstance = new AtomGraph(dbPath);
    } catch {
      return null;
    }
  }
  return _graphInstance;
}

/** 若图实例不可用，返回标准错误响应 */
function graphUnavailableError(): ToolResult {
  return textResult('❌ AtomGraph 模块未加载。请确保 atom-graph.ts 已编译。');
}

// ──────────────────────────────────────────────
// 工具函数导出
// ──────────────────────────────────────────────

/**
 * 创建原子卡片工具
 * 将不可再分的单一事实或概念保存为图节点
 */
export async function addAtomTool(
  args: z.infer<typeof addAtomSchema>
): Promise<ToolResult> {
  const graph = getGraph();
  if (!graph) return graphUnavailableError();

  const { content, kind } = args;

  if (!content.trim()) {
    return textResult('错误：原子内容不能为空');
  }

  const atom = graph.addAtom(content.trim(), kind);

  return textResult(
    [
      `## 创建原子卡片`,
      `- ID: ${atom.id}`,
      `- 内容: ${atom.content}`,
      `- 类型: ${atom.kind}`,
      `- 创建时间: ${atom.createdAt ?? new Date().toISOString()}`,
    ].join('\n')
  );
}

/**
 * 创建引用边工具
 * 在两个原子卡片之间建立有向关系边
 */
export async function addRefTool(
  args: z.infer<typeof addRefSchema>
): Promise<ToolResult> {
  const graph = getGraph();
  if (!graph) return graphUnavailableError();

  const { fromAtomId, toAtomId, kind, weight = 0.5, mode = 'tentative' } = args;

  if (!fromAtomId.trim() || !toAtomId.trim()) {
    return textResult('错误：源卡片 ID 和目标卡片 ID 不能为空');
  }

  const ref = graph.addRef(fromAtomId, toAtomId, kind, { weight, mode });

  return textResult(
    [
      `## 创建引用边`,
      `- 边 ID: ${ref.id}`,
      `- 源卡片: ${fromAtomId}`,
      `- 目标卡片: ${toAtomId}`,
      `- 关系类型: ${kind}`,
      `- 权重: ${weight}`,
      `- 模式: ${mode}`,
    ].join('\n')
  );
}

/**
 * 发散探索图工具
 * 从给定观测出发，找出候选解释路径
 */
export async function exploreGraphTool(
  args: z.infer<typeof exploreGraphSchema>
): Promise<ToolResult> {
  const graph = getGraph();
  if (!graph) return graphUnavailableError();

  const rawIds = typeof args.atomIds === 'string' ? JSON.parse(args.atomIds) : args.atomIds;
  const atomIds: string[] = rawIds;
  const { maxDepth = 3, maxPaths = 10 } = args;

  if (atomIds.length === 0) {
    return textResult('错误：起始 Atom IDs 不能为空');
  }

  const result = graph.explore(atomIds, { maxDepth, maxPaths });
  const paths: any[][] = result.paths ?? [];

  if (paths.length === 0) {
    return textResult(
      [
        `## 图探索结果`,
        `起始节点: ${atomIds.join(', ')}`,
        `未找到候选解释路径（最大深度: ${maxDepth}）`,
      ].join('\n')
    );
  }

  const lines: string[] = [
    `## 图探索结果`,
    `起始节点: ${atomIds.join(', ')}`,
    `找到 ${paths.length} 条候选路径（最大深度: ${maxDepth}，最大路径数: ${maxPaths}）`,
    '',
  ];

  paths.forEach((path: any, i: number) => {
    const atoms = path.atoms ?? [];
    const weight = path.totalWeight ?? 0;
    const atomStr = atoms
      .map((a: any) => `${a.id} [${a.kind}] "${a.content}"`)
      .join(' → ');
    lines.push(`### 路径 ${i + 1}（权重: ${weight.toFixed(2)}）`, atomStr || '(空路径)', '');
  });

  return textResult(lines.join('\n'));
}

/**
 * 编译正确路径工具
 * 强化已验证正确的推理路径，同时弱化错误路径
 */
export async function compilePathTool(
  args: z.infer<typeof compilePathSchema>
): Promise<ToolResult> {
  const graph = getGraph();
  if (!graph) return graphUnavailableError();

  const correctAtomIds: string[] = typeof args.correctAtomIds === 'string' ? JSON.parse(args.correctAtomIds) : args.correctAtomIds;
  const rawFailed = args.failedAtomIdsList ?? [];
  const failedAtomIdsList: string[][] = typeof rawFailed === 'string' ? JSON.parse(rawFailed) : rawFailed;

  if (correctAtomIds.length < 2) {
    return textResult('错误：正确路径至少需要包含 2 个 Atom ID');
  }

  const result = graph.compile({ atomIds: correctAtomIds }, failedAtomIdsList.map((ids: string[]) => ({ atomIds: ids })));

  const lines: string[] = [
    `## 路径编译结果`,
    `- 正确路径长度: ${correctAtomIds.length} 个节点`,
    `- 已弱化错误路径: ${failedAtomIdsList.length} 条`,
    `- 强化的边数: ${result.reinforcedRefs ?? 0}`,
    `- 弱化的边数: ${result.weakenedRefs ?? 0}`,
  ];

  if (result.newShortcuts && result.newShortcuts > 0) {
    lines.push(`- 新建快捷边: ${result.newShortcuts} 条`);
  }

  return textResult(lines.join('\n'));
}

/**
 * 髓鞘化图工具
 * 为高频使用的路径建立快捷边，加速未来推理
 */
export async function myelinateGraphTool(
  args: z.infer<typeof myelinateGraphSchema>
): Promise<ToolResult> {
  const graph = getGraph();
  if (!graph) return graphUnavailableError();

  const { minUseCount = 3, minWeight = 0.6 } = args;

  const result = graph.myelinate({ minUseCount, minWeight } as any);

  return textResult(
    [
      `## 髓鞘化结果`,
      `- 扫描条件：使用次数 ≥ ${minUseCount}，权重 ≥ ${minWeight}`,
      `- 新建快捷边: ${result.shortcutsCreated ?? 0} 条`,
      `- 已跳过（已存在）: ${result.shortcutsSkipped ?? 0} 条`,
      `- 覆盖路径: ${result.pathsCovered ?? 0} 条`,
    ].join('\n')
  );
}

/**
 * 图查询工具
 * 支持邻居查询、可达节点查询、路径搜索
 */
export async function queryGraphTool(
  args: z.infer<typeof queryGraphSchema>
): Promise<ToolResult> {
  const graph = getGraph();
  if (!graph) return graphUnavailableError();

  const { atomId, operation, targetAtomId, maxDepth = 3, direction = 'both' } = args;

  if (!atomId.trim()) {
    return textResult('错误：查询起点 Atom ID 不能为空');
  }

  if (operation === 'find_path' && !targetAtomId?.trim()) {
    return textResult('错误：find_path 操作需要提供目标 Atom ID');
  }

  const lines: string[] = [`## 图查询结果`, `- 操作: ${operation}`, `- 起点: ${atomId}`];

  if (operation === 'find_path' && targetAtomId) {
    lines.push(`- 终点: ${targetAtomId}`);
  }

  lines.push(`- 方向: ${direction}`, `- 最大深度: ${maxDepth}`, '');

  if (operation === 'neighbors') {
    const neighbors: any[] = graph.getNeighbors(atomId, { direction, minWeight: 0 }) ?? [];
    if (neighbors.length === 0) {
      lines.push('未找到任何邻居节点');
    } else {
      lines.push(`找到 ${neighbors.length} 个邻居节点:`, '');
      for (const n of neighbors) {
        const atom = n.atom ?? n;
        const ref = n.ref;
        const id = atom.id ?? JSON.stringify(n);
        const label = atom.content ? ` - ${atom.content}` : '';
        const kind = atom.kind ? ` [${atom.kind}]` : '';
        const refInfo = ref ? ` (${ref.kind}, w=${ref.weight})` : '';
        lines.push(`- ${id}${kind}${label}${refInfo}`);
      }
    }
  } else if (operation === 'reachable') {
    const nodes: any[] = graph.getReachable(atomId, maxDepth, 0) ?? [];
    if (nodes.length === 0) {
      lines.push('未找到可达节点');
    } else {
      lines.push(`可达节点（共 ${nodes.length} 个）:`, '');
      for (const n of nodes) {
        const id = n.id ?? JSON.stringify(n);
        const label = n.content ? ` - ${n.content}` : '';
        lines.push(`- ${id}${label}`);
      }
    }
  } else if (operation === 'find_path') {
    const paths: any[] = graph.findPaths(atomId, targetAtomId!, maxDepth) ?? [];
    if (paths.length === 0) {
      lines.push(`未找到从 ${atomId} 到 ${targetAtomId} 的路径`);
    } else {
      for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        const atomIds = (p.atoms ?? []).map((a: any) => a.id ?? a).join(' → ');
        lines.push(`路径 ${i + 1}（权重 ${(p.totalWeight ?? 0).toFixed(2)}）: ${atomIds}`);
      }
    }
  }

  return textResult(lines.join('\n'));
}

/**
 * 搜索原子卡片工具
 * 按关键词和类型过滤查找已有的 Atom 节点
 */
export async function findAtomsTool(
  args: z.infer<typeof findAtomsSchema>
): Promise<ToolResult> {
  const graph = getGraph();
  if (!graph) return graphUnavailableError();

  const { query, kind, limit = 20 } = args;

  if (!query.trim()) {
    return textResult('错误：搜索关键词不能为空');
  }

  const result = graph.findAtoms(query.trim(), kind, limit);
  const atoms: any[] = result.atoms ?? result ?? [];

  if (atoms.length === 0) {
    return textResult(
      `## 原子搜索结果\n` +
        `未找到与 "${query}" 匹配的原子卡片` +
        (kind ? `（类型过滤: ${kind}）` : '')
    );
  }

  const lines: string[] = [
    `## 原子搜索结果`,
    `查询: "${query}"${kind ? `，类型: ${kind}` : ''}`,
    `找到 ${atoms.length} 条结果:`,
    '',
  ];

  for (const atom of atoms) {
    lines.push(
      `### ${atom.id}`,
      `- 类型: ${atom.kind}`,
      `- 内容: ${atom.content}`,
      atom.useCount != null ? `- 使用次数: ${atom.useCount}` : '',
      ''
    );
  }

  return textResult(lines.filter((l) => l !== '').join('\n'));
}

/**
 * 图统计工具
 * 返回当前图的节点数、边数、快捷边数等统计信息
 */
export async function graphStatsTool(
  args: z.infer<typeof graphStatsSchema>
): Promise<ToolResult> {
  // args 为空对象，仅用于 zod 校验
  void args;

  const graph = getGraph();
  if (!graph) return graphUnavailableError();

  const stats = graph.getStats();

  const lines: string[] = [
    `## 图统计信息`,
    `- 原子节点数: ${stats.atomCount ?? 0}`,
    `- 引用边数: ${stats.refCount ?? 0}`,
    `- 快捷边数: ${stats.shortcutCount ?? 0}`,
    `- tentative 边: ${stats.refsByMode?.tentative ?? 0}`,
    `- compiled 边: ${stats.refsByMode?.compiled ?? 0}`,
    `- 孤立节点数: ${stats.orphanAtoms ?? 0}`,
  ];

  if (stats.kindDistribution) {
    lines.push('', '### 节点类型分布');
    for (const [kindKey, count] of Object.entries(stats.kindDistribution)) {
      lines.push(`- ${kindKey}: ${count}`);
    }
  }

  if (stats.refKindDistribution) {
    lines.push('', '### 关系类型分布');
    for (const [kindKey, count] of Object.entries(stats.refKindDistribution)) {
      lines.push(`- ${kindKey}: ${count}`);
    }
  }

  return textResult(lines.join('\n'));
}

/**
 * 修剪图工具
 * 删除权重过低的 tentative 边，可选删除孤立节点
 */
export async function pruneGraphTool(
  args: z.infer<typeof pruneGraphSchema>
): Promise<ToolResult> {
  const graph = getGraph();
  if (!graph) return graphUnavailableError();

  const { minWeight = 0.1, removeOrphans = false } = args;

  const result = graph.prune({ minWeight, removeOrphans } as any);

  const lines: string[] = [
    `## 图修剪结果`,
    `- 修剪条件：tentative 边权重 < ${minWeight}`,
    `- 删除的弱边数: ${result.refsRemoved ?? 0}`,
  ];

  if (removeOrphans) {
    lines.push(`- 删除的孤立节点数: ${result.orphansRemoved ?? 0}`);
  } else {
    lines.push(`- 孤立节点保留（removeOrphans=false）`);
  }

  lines.push(`- 修剪后剩余边数: ${result.refsRemaining ?? 0}`);
  lines.push(`- 修剪后剩余节点数: ${result.atomsRemaining ?? 0}`);

  return textResult(lines.join('\n'));
}

/**
 * 批量摄入事实工具
 * 将一组 Facts 自动拆解为 Atoms，并在同批 Atoms 间建立 cooccurs 关系
 */
export async function ingestFactsTool(
  args: z.infer<typeof ingestFactsSchema>
): Promise<ToolResult> {
  const graph = getGraph();
  if (!graph) return graphUnavailableError();

  // MCP 传参可能是 JSON 字符串，需要解析
  const parsedFacts = typeof args.facts === 'string' ? JSON.parse(args.facts) : args.facts;
  const parsedContext = typeof args.context === 'string' ? JSON.parse(args.context) : args.context;

  if (!Array.isArray(parsedFacts) || parsedFacts.length === 0) {
    return textResult('错误：事实列表不能为空');
  }

  // ingestFacts 返回 Atom[]
  const atoms: any[] = graph.ingestFacts(parsedFacts, parsedContext);

  const lines: string[] = [
    `## 事实摄入结果`,
    `- 输入事实数: ${parsedFacts.length}`,
    `- 创建原子节点数: ${atoms.length}`,
    '',
  ];

  if (atoms.length > 0) {
    lines.push('### 创建的原子节点');
    for (const atom of atoms) {
      lines.push(`- [${atom.kind}] ${atom.id}: ${atom.content}`);
    }
  }

  if (parsedContext && typeof parsedContext === 'object' && Object.keys(parsedContext).length > 0) {
    lines.push('', `### 环境上下文`);
    for (const [k, v] of Object.entries(parsedContext)) {
      lines.push(`- ${k}: ${JSON.stringify(v)}`);
    }
  }

  return textResult(lines.join('\n'));
}
