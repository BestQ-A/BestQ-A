/**
 * 知识聚类模块（KnowledgeCluster）
 *
 * 基于 Sirchmunk 项目的 KnowledgeCluster + KnowledgeStorage 设计，
 * 为因果学习系统添加跨会话的知识聚合与复用能力。
 *
 * 核心概念：
 * - KnowledgeCluster：将分散的 Regulation 和 Event 聚合为有语义的知识单元
 * - ClusterLifecycle：知识的演化状态（新兴→稳定→争议→废弃）
 * - AbstractionLevel：知识的抽象层级（实例→模式→原则→范式）
 * - EvidenceRef：指向原始数据的轻量引用，避免数据冗余
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import type { Regulation, Event } from './types.js';

// =============================================================================
// 枚举：知识生命周期
// =============================================================================

/** 知识生命周期 - 描述一个知识集群在系统中的演化状态 */
export enum ClusterLifecycle {
  /** 新发现的模式，尚未经过足够验证 */
  EMERGING = 'emerging',
  /** 已通过多次验证的稳定知识 */
  STABLE = 'stable',
  /** 存在矛盾证据，需要进一步调查 */
  CONTESTED = 'contested',
  /** 已被更新知识替代或不再适用 */
  DEPRECATED = 'deprecated',
}

// =============================================================================
// 枚举：抽象层级
// =============================================================================

/** 知识抽象层级 - 从具体实例到系统性方法论 */
export enum AbstractionLevel {
  /** 具体实例：单个 bug fix、单次操作 */
  INSTANCE = 1,
  /** 模式：一类问题的通用修复方式 */
  PATTERN = 2,
  /** 原则：跨域适用的通用调试策略 */
  PRINCIPLE = 3,
  /** 范式：系统性方法论，最高抽象层级 */
  PARADIGM = 4,
}

// =============================================================================
// 接口：证据引用
// =============================================================================

/** 证据单元 - 指向原始数据的轻量引用，避免复制原始文档 */
export interface EvidenceRef {
  /** 来源文档/事件 ID */
  docId: string;
  /** 证据摘要（一句话概括） */
  summary: string;
  /** 关键片段列表 */
  snippets: Array<{
    /** 片段文本 */
    text: string;
    /** 相关性得分 0.0-1.0 */
    score: number;
    /** 为何相关的说明（可选） */
    reasoning?: string;
  }>;
  /** 提取时间（ISO 8601） */
  extractedAt: string;
  /** 是否判定为相关证据 */
  isRelevant: boolean;
}

// =============================================================================
// 接口：弱语义边
// =============================================================================

/** 弱语义边 - 描述两个 cluster 之间的关联关系 */
export interface WeakSemanticEdge {
  /** 目标 cluster ID */
  targetClusterId: string;
  /** 关联权重 0.0-1.0 */
  weight: number;
  /** 关联来源：共现 / 查询序列 / 关键词相似 */
  source: 'co_occur' | 'query_seq' | 'keyword_sim';
}

// =============================================================================
// 接口：约束条件
// =============================================================================

/** 约束条件 - 描述此 cluster 适用的限制条件 */
export interface ClusterConstraint {
  /** 条件表达式（自然语言或代码片段） */
  condition: string;
  /** 严重程度：low / medium / high */
  severity: 'low' | 'medium' | 'high';
  /** 约束说明 */
  description: string;
}

// =============================================================================
// 主结构：KnowledgeCluster
// =============================================================================

/** 知识集群 - 将分散的因果规则和事件聚合为有语义的知识单元 */
export interface KnowledgeCluster {
  /** 唯一 ID，格式 "KC_xxxx"（8位 hex） */
  id: string;
  /** 人类可读的简短名称 */
  name: string;
  /** 详细描述（一段话） */
  description: string;
  /** 主要内容（Markdown 格式） */
  content: string;

  /** 来源证据列表 */
  evidences: EvidenceRef[];

  /** 关联的 Regulation ID 列表（因果规则） */
  regulationIds: string[];

  /** 关联的 Event ID 列表（原始事件） */
  eventIds: string[];

  /** 发现的模式描述列表 */
  patterns: string[];

  /** 约束条件列表 */
  constraints: ClusterConstraint[];

  /** 置信度 0.0-1.0（支持证据越多越高） */
  confidence: number;

  /** 热度 0.0-1.0（最近被访问/引用越多越高） */
  hotness: number;

  /** 地标潜力 0.0-1.0（对其他知识的连接程度） */
  landmarkPotential: number;

  /** 抽象层级 */
  abstractionLevel: AbstractionLevel;

  /** 生命周期状态 */
  lifecycle: ClusterLifecycle;

  /** 与其他 cluster 的弱语义关联 */
  relatedClusters: WeakSemanticEdge[];

  /** 触发过此 cluster 的查询历史（用于知识复用分析） */
  queries: string[];

  /** 创建时间（ISO 8601） */
  createdAt: string;

  /** 最后更新时间（ISO 8601） */
  updatedAt: string;

  /** 版本号（每次 update 递增） */
  version: number;
}

// =============================================================================
// 内部辅助：序列化 / 反序列化
// =============================================================================

/** 将 KnowledgeCluster 序列化为 JSON 字符串（存入数据库） */
function serializeCluster(cluster: KnowledgeCluster): string {
  return JSON.stringify(cluster);
}

/** 从 JSON 字符串反序列化为 KnowledgeCluster */
function deserializeCluster(raw: string): KnowledgeCluster {
  return JSON.parse(raw) as KnowledgeCluster;
}

// =============================================================================
// KnowledgeClusterStorage - 持久化存储
// =============================================================================

/**
 * KnowledgeCluster 的 SQLite 持久化存储
 *
 * 数据库结构：
 * - knowledge_clusters 主表：存储集群完整 JSON
 * - 索引：lifecycle、abstraction_level、关键词搜索
 *
 * 使用 better-sqlite3 保证同步操作、高性能。
 */
export class KnowledgeClusterStorage {
  private db: DatabaseType;

  constructor(dbPath: string) {
    // 确保目录存在
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);

    // WAL 模式提升并发性能
    this.db.pragma('journal_mode = WAL');

    this.initSchema();
  }

  /** 初始化数据库表结构 */
  private initSchema(): void {
    this.db.exec(`
      -- 知识集群主表
      CREATE TABLE IF NOT EXISTS knowledge_clusters (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        lifecycle       TEXT NOT NULL DEFAULT 'emerging',
        abstraction_lvl INTEGER NOT NULL DEFAULT 1,
        confidence      REAL NOT NULL DEFAULT 0.0,
        hotness         REAL NOT NULL DEFAULT 0.0,
        data            TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      -- 生命周期索引
      CREATE INDEX IF NOT EXISTS idx_kc_lifecycle ON knowledge_clusters(lifecycle);

      -- 抽象层级索引
      CREATE INDEX IF NOT EXISTS idx_kc_abstraction ON knowledge_clusters(abstraction_lvl);

      -- 更新时间索引（用于排序）
      CREATE INDEX IF NOT EXISTS idx_kc_updated ON knowledge_clusters(updated_at);
    `);
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /** 插入新 cluster（ID 重复时报错） */
  insert(cluster: KnowledgeCluster): void {
    const stmt = this.db.prepare(`
      INSERT INTO knowledge_clusters
        (id, name, lifecycle, abstraction_lvl, confidence, hotness, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      cluster.id,
      cluster.name,
      cluster.lifecycle,
      cluster.abstractionLevel,
      cluster.confidence,
      cluster.hotness,
      serializeCluster(cluster),
      cluster.createdAt,
      cluster.updatedAt,
    );
  }

  /** 按 ID 获取 cluster，不存在返回 null */
  get(id: string): KnowledgeCluster | null {
    const stmt = this.db.prepare(
      `SELECT data FROM knowledge_clusters WHERE id = ?`
    );
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return null;
    return deserializeCluster(row.data);
  }

  /** 更新已有 cluster（版本号自动递增） */
  update(cluster: KnowledgeCluster): void {
    const updated: KnowledgeCluster = {
      ...cluster,
      version: cluster.version + 1,
      updatedAt: new Date().toISOString(),
    };
    const stmt = this.db.prepare(`
      UPDATE knowledge_clusters
      SET name = ?, lifecycle = ?, abstraction_lvl = ?,
          confidence = ?, hotness = ?, data = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.name,
      updated.lifecycle,
      updated.abstractionLevel,
      updated.confidence,
      updated.hotness,
      serializeCluster(updated),
      updated.updatedAt,
      updated.id,
    );
  }

  /** 删除 cluster */
  remove(id: string): void {
    const stmt = this.db.prepare(
      `DELETE FROM knowledge_clusters WHERE id = ?`
    );
    stmt.run(id);
  }

  // ---------------------------------------------------------------------------
  // 搜索
  // ---------------------------------------------------------------------------

  /**
   * 关键词搜索：在 name、data（JSON 全文）中匹配
   * SQLite LIKE 搜索，适合中小规模知识库
   */
  findByKeyword(query: string, limit = 20): KnowledgeCluster[] {
    const pattern = `%${query}%`;
    const stmt = this.db.prepare(`
      SELECT data FROM knowledge_clusters
      WHERE name LIKE ? OR data LIKE ?
      ORDER BY hotness DESC, updated_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(pattern, pattern, limit) as { data: string }[];
    return rows.map((r) => deserializeCluster(r.data));
  }

  /** 按关联的 Regulation ID 查找所有包含它的 cluster */
  findByRegulationId(regulationId: string): KnowledgeCluster[] {
    // 在 JSON 数据中搜索 regulation ID 字符串
    const pattern = `%"${regulationId}"%`;
    const stmt = this.db.prepare(`
      SELECT data FROM knowledge_clusters
      WHERE data LIKE ?
      ORDER BY updated_at DESC
    `);
    const rows = stmt.all(pattern) as { data: string }[];
    // 过滤：确认 regulationIds 数组中确实包含该 ID
    return rows
      .map((r) => deserializeCluster(r.data))
      .filter((c) => c.regulationIds.includes(regulationId));
  }

  /** 按关联的 Event ID 查找所有包含它的 cluster */
  findByEventId(eventId: string): KnowledgeCluster[] {
    const pattern = `%"${eventId}"%`;
    const stmt = this.db.prepare(`
      SELECT data FROM knowledge_clusters
      WHERE data LIKE ?
      ORDER BY updated_at DESC
    `);
    const rows = stmt.all(pattern) as { data: string }[];
    return rows
      .map((r) => deserializeCluster(r.data))
      .filter((c) => c.eventIds.includes(eventId));
  }

  // ---------------------------------------------------------------------------
  // 生命周期管理
  // ---------------------------------------------------------------------------

  /** 更新 cluster 的生命周期状态 */
  updateLifecycle(id: string, lifecycle: ClusterLifecycle): void {
    const cluster = this.get(id);
    if (!cluster) return;
    const updated: KnowledgeCluster = {
      ...cluster,
      lifecycle,
      version: cluster.version + 1,
      updatedAt: new Date().toISOString(),
    };
    const stmt = this.db.prepare(`
      UPDATE knowledge_clusters
      SET lifecycle = ?, data = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(lifecycle, serializeCluster(updated), updated.updatedAt, id);
  }

  /** 获取特定生命周期的所有 cluster */
  getByLifecycle(lifecycle: ClusterLifecycle): KnowledgeCluster[] {
    const stmt = this.db.prepare(`
      SELECT data FROM knowledge_clusters
      WHERE lifecycle = ?
      ORDER BY confidence DESC, updated_at DESC
    `);
    const rows = stmt.all(lifecycle) as { data: string }[];
    return rows.map((r) => deserializeCluster(r.data));
  }

  // ---------------------------------------------------------------------------
  // 统计
  // ---------------------------------------------------------------------------

  /** 获取知识库统计数据 */
  getStats(): {
    total: number;
    byLifecycle: Record<string, number>;
    byAbstraction: Record<string, number>;
    avgConfidence: number;
  } {
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM knowledge_clusters`)
      .get() as { count: number };

    const lifecycleRows = this.db
      .prepare(
        `SELECT lifecycle, COUNT(*) as count FROM knowledge_clusters GROUP BY lifecycle`
      )
      .all() as { lifecycle: string; count: number }[];

    const abstractionRows = this.db
      .prepare(
        `SELECT abstraction_lvl, COUNT(*) as count FROM knowledge_clusters GROUP BY abstraction_lvl`
      )
      .all() as { abstraction_lvl: number; count: number }[];

    const avgRow = this.db
      .prepare(`SELECT AVG(confidence) as avg FROM knowledge_clusters`)
      .get() as { avg: number | null };

    // 生命周期统计（初始化所有枚举值为 0）
    const byLifecycle: Record<string, number> = {
      [ClusterLifecycle.EMERGING]: 0,
      [ClusterLifecycle.STABLE]: 0,
      [ClusterLifecycle.CONTESTED]: 0,
      [ClusterLifecycle.DEPRECATED]: 0,
    };
    for (const row of lifecycleRows) {
      byLifecycle[row.lifecycle] = row.count;
    }

    // 抽象层级统计（初始化所有枚举值为 0）
    const byAbstraction: Record<string, number> = {
      [AbstractionLevel.INSTANCE]: 0,
      [AbstractionLevel.PATTERN]: 0,
      [AbstractionLevel.PRINCIPLE]: 0,
      [AbstractionLevel.PARADIGM]: 0,
    };
    for (const row of abstractionRows) {
      byAbstraction[String(row.abstraction_lvl)] = row.count;
    }

    return {
      total: totalRow.count,
      byLifecycle,
      byAbstraction,
      avgConfidence: avgRow.avg ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // 合并
  // ---------------------------------------------------------------------------

  /**
   * 合并两个 cluster 为一个新 cluster
   *
   * 合并策略：
   * - ID：重新生成
   * - name：使用 cluster1 的名称（主导方）
   * - 列表字段（evidences, regulationIds, eventIds 等）：去重合并
   * - 数值字段（confidence, hotness）：取较高值
   * - abstractionLevel：取较高层级
   * - lifecycle：若有 CONTESTED 则保留 CONTESTED，否则取 cluster1
   * - queries：合并去重
   * - relatedClusters：合并去重，并去除指向被合并 cluster 的自引用
   *
   * 合并后删除两个原 cluster，插入新 cluster。
   * 返回新 cluster，失败（任一不存在）返回 null。
   */
  merge(
    clusterId1: string,
    clusterId2: string
  ): KnowledgeCluster | null {
    const c1 = this.get(clusterId1);
    const c2 = this.get(clusterId2);
    if (!c1 || !c2) return null;

    const now = new Date().toISOString();

    // 合并 regulationIds（去重）
    const regulationIds = Array.from(
      new Set([...c1.regulationIds, ...c2.regulationIds])
    );

    // 合并 eventIds（去重）
    const eventIds = Array.from(new Set([...c1.eventIds, ...c2.eventIds]));

    // 合并 evidences（按 docId 去重）
    const evidenceMap = new Map<string, EvidenceRef>();
    for (const e of [...c1.evidences, ...c2.evidences]) {
      evidenceMap.set(e.docId, e);
    }
    const evidences = Array.from(evidenceMap.values());

    // 合并 patterns（去重）
    const patterns = Array.from(new Set([...c1.patterns, ...c2.patterns]));

    // 合并 constraints（按 condition 去重）
    const constraintMap = new Map<string, ClusterConstraint>();
    for (const c of [...c1.constraints, ...c2.constraints]) {
      constraintMap.set(c.condition, c);
    }
    const constraints = Array.from(constraintMap.values());

    // 合并 queries（去重）
    const queries = Array.from(new Set([...c1.queries, ...c2.queries]));

    // 合并 relatedClusters（去除对两个原 cluster 的引用，按 targetClusterId 去重取最高 weight）
    const edgeMap = new Map<string, WeakSemanticEdge>();
    for (const edge of [...c1.relatedClusters, ...c2.relatedClusters]) {
      if (edge.targetClusterId === clusterId1 || edge.targetClusterId === clusterId2) {
        continue; // 去除自引用
      }
      const existing = edgeMap.get(edge.targetClusterId);
      if (!existing || edge.weight > existing.weight) {
        edgeMap.set(edge.targetClusterId, edge);
      }
    }
    const relatedClusters = Array.from(edgeMap.values());

    // 生命周期：有 CONTESTED 则保留
    const lifecycle =
      c1.lifecycle === ClusterLifecycle.CONTESTED ||
      c2.lifecycle === ClusterLifecycle.CONTESTED
        ? ClusterLifecycle.CONTESTED
        : c1.lifecycle;

    // 合并后的内容：拼接两个 cluster 的 content
    const content = [
      `## 合并自 ${c1.name}`,
      c1.content,
      `## 合并自 ${c2.name}`,
      c2.content,
    ].join('\n\n');

    const merged: KnowledgeCluster = {
      id: generateClusterId(`${clusterId1}+${clusterId2}+${now}`),
      name: c1.name,
      description: `[合并] ${c1.description} | ${c2.description}`,
      content,
      evidences,
      regulationIds,
      eventIds,
      patterns,
      constraints,
      confidence: Math.max(c1.confidence, c2.confidence),
      hotness: Math.max(c1.hotness, c2.hotness),
      landmarkPotential: Math.max(c1.landmarkPotential, c2.landmarkPotential),
      abstractionLevel: Math.max(
        c1.abstractionLevel,
        c2.abstractionLevel
      ) as AbstractionLevel,
      lifecycle,
      relatedClusters,
      queries,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    // 事务：删除两个原 cluster，插入合并结果
    const mergeTx = this.db.transaction(() => {
      this.remove(clusterId1);
      this.remove(clusterId2);
      this.insert(merged);
    });
    mergeTx();

    return merged;
  }

  // ---------------------------------------------------------------------------
  // 清理
  // ---------------------------------------------------------------------------

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }
}

// =============================================================================
// 工厂函数：生成 Cluster ID
// =============================================================================

/**
 * 生成 Cluster ID
 * 格式："KC_" + sha256 前 8 位 hex
 */
function generateClusterId(seed: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(seed)
    .digest('hex')
    .slice(0, 8);
  return `KC_${hash}`;
}

// =============================================================================
// 工厂函数：从 Regulation 列表构建 KnowledgeCluster
// =============================================================================

/**
 * 从一组相关的 Regulation 和 Event 构建知识集群
 *
 * 适用场景：诱导器发现一批相关规则后，将其打包为可复用的知识单元。
 *
 * @param regulations - 相关因果规则列表
 * @param events      - 这些规则覆盖的原始事件列表
 * @param clusterName - 人类可读的集群名称
 * @returns 新构建的 KnowledgeCluster（尚未持久化）
 */
export function buildClusterFromRegulations(
  regulations: Regulation[],
  events: Event[],
  clusterName: string
): KnowledgeCluster {
  const now = new Date().toISOString();

  const regulationIds = regulations.map((r) => r.regulationId);
  const eventIds = events.map((e) => e.eventId);

  // 用 regulation ID 列表作为 ID 种子，保证相同输入生成相同 ID
  const seed = [...regulationIds].sort().join(',') + now;

  // 从 regulations 提炼证据引用（每条规则对应一个证据）
  const evidences: EvidenceRef[] = regulations.map((r) => ({
    docId: r.regulationId,
    summary: r.description || `${r.regulationId} (${r.status})`,
    snippets: [
      {
        text: `pre: ${r.pre.map((f) => f.pred).join(', ')} → eff: ${r.eff.map((f) => f.pred).join(', ')}`,
        score: computeRegulationConfidence(r),
      },
    ],
    extractedAt: now,
    isRelevant: r.status !== 'retired',
  }));

  // 从 regulations 提炼模式描述
  const patterns: string[] = regulations
    .filter((r) => r.description)
    .map((r) => r.description as string);

  // 根据已确认规则数量估算置信度
  const confirmedCount = regulations.filter(
    (r) => r.status === 'confirmed'
  ).length;
  const confidence =
    regulations.length > 0 ? confirmedCount / regulations.length : 0;

  // 抽象层级：根据 regulation 数量粗略推断
  let abstractionLevel: AbstractionLevel;
  if (regulations.length === 1) {
    abstractionLevel = AbstractionLevel.INSTANCE;
  } else if (regulations.length <= 5) {
    abstractionLevel = AbstractionLevel.PATTERN;
  } else if (regulations.length <= 15) {
    abstractionLevel = AbstractionLevel.PRINCIPLE;
  } else {
    abstractionLevel = AbstractionLevel.PARADIGM;
  }

  // 构造 Markdown 内容
  const content = buildMarkdownContent(clusterName, regulations, events);

  return {
    id: generateClusterId(seed),
    name: clusterName,
    description: `包含 ${regulations.length} 条因果规则，覆盖 ${events.length} 个事件`,
    content,
    evidences,
    regulationIds,
    eventIds,
    patterns,
    constraints: [],
    confidence,
    hotness: 0.1,
    landmarkPotential: Math.min(1.0, regulations.length * 0.1),
    abstractionLevel,
    lifecycle: ClusterLifecycle.EMERGING,
    relatedClusters: [],
    queries: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

// =============================================================================
// 工厂函数：从搜索结果/证据构建 KnowledgeCluster
// =============================================================================

/**
 * 从搜索结果构建知识集群（类似 Sirchmunk 的 KnowledgeBase.build）
 *
 * 适用场景：用户查询后，将命中的证据和相关规则打包为知识单元，
 * 便于后续复用和关联分析。
 *
 * @param query              - 触发此集群的查询字符串
 * @param evidences          - 搜索命中的证据列表
 * @param relatedRegulations - 关联的 Regulation ID 列表
 * @returns 新构建的 KnowledgeCluster（尚未持久化）
 */
export function buildClusterFromEvidence(
  query: string,
  evidences: EvidenceRef[],
  relatedRegulations: string[]
): KnowledgeCluster {
  const now = new Date().toISOString();

  // 以查询 + 时间戳为种子
  const seed = `${query}:${now}`;

  // 从证据中提炼关键词作为名称（取查询本身，截断到 60 字符）
  const name =
    query.length > 60 ? `${query.slice(0, 57)}...` : query;

  // 过滤相关证据
  const relevantEvidences = evidences.filter((e) => e.isRelevant);

  // 置信度基于相关证据比例和平均片段得分
  let confidence = 0;
  if (evidences.length > 0) {
    const relevanceRatio = relevantEvidences.length / evidences.length;
    const avgSnippetScore =
      relevantEvidences.length > 0
        ? relevantEvidences.reduce((sum, e) => {
            const avg =
              e.snippets.length > 0
                ? e.snippets.reduce((s, sn) => s + sn.score, 0) /
                  e.snippets.length
                : 0;
            return sum + avg;
          }, 0) / relevantEvidences.length
        : 0;
    confidence = relevanceRatio * 0.5 + avgSnippetScore * 0.5;
  }

  // 构造简单 Markdown 内容
  const lines: string[] = [
    `# ${name}`,
    '',
    `**查询**：${query}`,
    '',
    '## 相关证据',
    '',
  ];
  for (const e of relevantEvidences) {
    lines.push(`- **${e.docId}**：${e.summary}`);
  }
  if (relatedRegulations.length > 0) {
    lines.push('', '## 关联规则', '');
    for (const rid of relatedRegulations) {
      lines.push(`- ${rid}`);
    }
  }
  const content = lines.join('\n');

  return {
    id: generateClusterId(seed),
    name,
    description: `基于查询「${query}」构建，包含 ${relevantEvidences.length} 条相关证据`,
    content,
    evidences,
    regulationIds: relatedRegulations,
    eventIds: [],
    patterns: [],
    constraints: [],
    confidence,
    hotness: 0.5, // 新建的搜索结果热度初始较高
    landmarkPotential: Math.min(1.0, relatedRegulations.length * 0.1),
    abstractionLevel: AbstractionLevel.INSTANCE,
    lifecycle: ClusterLifecycle.EMERGING,
    relatedClusters: [],
    queries: [query],
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

// =============================================================================
// 内部工具函数
// =============================================================================

/**
 * 计算单条 Regulation 的置信度（0.0-1.0）
 * 基于支持数 vs 反例数的比率
 */
function computeRegulationConfidence(r: Regulation): number {
  const support = r.supportN ?? 0;
  const counter = r.counterexampleN ?? 0;
  const total = support + counter;
  if (total === 0) return 0.3; // 无证据时默认低置信度
  return support / total;
}

/**
 * 从 regulations 和 events 构造 Markdown 文档内容
 */
function buildMarkdownContent(
  title: string,
  regulations: Regulation[],
  events: Event[]
): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    '## 因果规则',
    '',
  ];

  for (const r of regulations) {
    const preStr = r.pre.map((f) => `\`${f.pred}\``).join(', ');
    const effStr = r.eff.map((f) => `\`${f.pred}\``).join(', ');
    const conf = computeRegulationConfidence(r);
    lines.push(
      `- **${r.regulationId}** [${r.status}] 置信度 ${conf.toFixed(2)}`
    );
    lines.push(`  - 前置: ${preStr || '（无）'}`);
    lines.push(`  - 结果: ${effStr || '（无）'}`);
    if (r.description) {
      lines.push(`  - 描述: ${r.description}`);
    }
  }

  if (events.length > 0) {
    lines.push('', '## 关联事件', '');
    for (const e of events) {
      lines.push(
        `- **${e.eventId}** [${e.status ?? 'open'}] ${e.timestamp}`
      );
      if (e.notes) {
        lines.push(`  - ${e.notes}`);
      }
    }
  }

  return lines.join('\n');
}
