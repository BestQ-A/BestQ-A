/**
 * Evidence 模块——一等证据系统
 *
 * 可溯源的 append-only 日志，用于记录支撑或反驳 Ref 的证据。
 * 有了 Evidence，系统可以回答：
 * - 这条边为什么存在？→ sourceId
 * - 它在哪些上下文里成立？→ contextSnapshot
 * - 是谁验证过？→ sourceType
 * - 有哪些反例？→ supportsOrContradicts == 'contradicts'
 */

import Database, { Database as DatabaseType, Statement } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// 类型定义
// =============================================================================

/** 证据来源类型 */
export type EvidenceSourceType =
  | 'observation'
  | 'test'
  | 'fix'
  | 'user_confirmed'
  | 'benchmark';

/** 上下文作用域（记录证据产生时的上下文快照） */
export interface ContextScope {
  env?: string;
  stack?: string[];
  version?: string;
  timeRange?: { from?: string; to?: string };
  project?: string;
  custom?: Record<string, unknown>;
}

/** 证据——append-only，不可修改不可删除 */
export interface EvidenceRecord {
  id: string;                            // "evi_xxxxxxxx"
  refId: string;                         // 所支撑的 Ref ID（必须绑定）
  sourceType: EvidenceSourceType;
  sourceId: string;                      // Story ID / Test ID / Fix commit
  contextSnapshot: ContextScope;         // 产生证据时的上下文快照
  supportsOrContradicts: 'supports' | 'contradicts';
  reproducible: boolean;
  confidence: number;                    // 0.0-1.0
  notes?: string;
  capturedAt: string;                    // ISO 时间戳
}

/** 证据统计摘要（给 Ref 用的聚合统计，不是手动维护的计数器） */
export interface EvidenceSummary {
  totalCount: number;
  supportCount: number;
  contradictCount: number;
  avgConfidence: number;
  latestCapturedAt?: string;
  sourceTypes: Record<string, number>;
}

// =============================================================================
// ID 生成
// =============================================================================

/** 生成 Evidence ID: evi_xxxxxxxx */
function generateEvidenceId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `evi_${suffix}`;
}

// =============================================================================
// SQLite 行结构（内部使用）
// =============================================================================

interface EvidenceRow {
  id: string;
  ref_id: string;
  source_type: string;
  source_id: string;
  context_snapshot: string;
  supports_or_contradicts: string;
  reproducible: number;
  confidence: number;
  notes: string | null;
  captured_at: string;
}

/** 将数据库行转换为 EvidenceRecord */
function rowToRecord(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    refId: row.ref_id,
    sourceType: row.source_type as EvidenceSourceType,
    sourceId: row.source_id,
    contextSnapshot: JSON.parse(row.context_snapshot) as ContextScope,
    supportsOrContradicts: row.supports_or_contradicts as 'supports' | 'contradicts',
    reproducible: row.reproducible === 1,
    confidence: row.confidence,
    notes: row.notes ?? undefined,
    capturedAt: row.captured_at,
  };
}

// =============================================================================
// EvidenceStore 类
// =============================================================================

/**
 * Evidence 存储——append-only SQLite 日志
 *
 * 设计约束：
 * 1. 只增不改不删（通过应用层保证，没有 UPDATE/DELETE 方法）
 * 2. 每条 Evidence 必须绑定 refId
 * 3. contextSnapshot 是快照，不随后续变化
 */
export class EvidenceStore {
  private db: DatabaseType;

  // 预编译语句缓存
  private stmtInsert: Statement<unknown[]>;
  private stmtGetById: Statement<unknown[]>;
  private stmtGetByRefId: Statement<unknown[]>;
  private stmtGetBySourceId: Statement<unknown[]>;
  private stmtGetContradictions: Statement<unknown[]>;
  private stmtGetSupports: Statement<unknown[]>;
  private stmtFindRecent: Statement<unknown[]>;
  private stmtFindBySourceType: Statement<unknown[]>;

  constructor(dbPath: string) {
    // 确保目录存在
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);

    // 启用 WAL 模式，提升并发写入性能
    this.db.pragma('journal_mode = WAL');

    // 初始化表结构
    this.initSchema();

    // 预编译常用语句
    this.stmtInsert = this.db.prepare(`
      INSERT INTO evidence
        (id, ref_id, source_type, source_id, context_snapshot,
         supports_or_contradicts, reproducible, confidence, notes, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetById = this.db.prepare(
      `SELECT * FROM evidence WHERE id = ?`
    );

    this.stmtGetByRefId = this.db.prepare(
      `SELECT * FROM evidence WHERE ref_id = ? ORDER BY captured_at DESC LIMIT ?`
    );

    this.stmtGetBySourceId = this.db.prepare(
      `SELECT * FROM evidence WHERE source_id = ? ORDER BY captured_at DESC`
    );

    this.stmtGetContradictions = this.db.prepare(
      `SELECT * FROM evidence WHERE ref_id = ? AND supports_or_contradicts = 'contradicts' ORDER BY captured_at DESC`
    );

    this.stmtGetSupports = this.db.prepare(
      `SELECT * FROM evidence WHERE ref_id = ? AND supports_or_contradicts = 'supports' ORDER BY captured_at DESC`
    );

    this.stmtFindRecent = this.db.prepare(
      `SELECT * FROM evidence ORDER BY captured_at DESC LIMIT ?`
    );

    this.stmtFindBySourceType = this.db.prepare(
      `SELECT * FROM evidence WHERE source_type = ? ORDER BY captured_at DESC LIMIT ?`
    );
  }

  /** 初始化数据库表结构 */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        ref_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        context_snapshot TEXT DEFAULT '{}',
        supports_or_contradicts TEXT NOT NULL,
        reproducible BOOLEAN DEFAULT 1,
        confidence REAL DEFAULT 0.5,
        notes TEXT,
        captured_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_ref ON evidence(ref_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence(source_type);
      CREATE INDEX IF NOT EXISTS idx_evidence_verdict ON evidence(supports_or_contradicts);
      CREATE INDEX IF NOT EXISTS idx_evidence_captured ON evidence(captured_at);
    `);
  }

  // ===========================================================================
  // 写入（append-only）
  // ===========================================================================

  /**
   * 记录一条证据（append-only，不可修改不可删除）
   */
  record(input: {
    refId: string;
    sourceType: EvidenceSourceType;
    sourceId: string;
    contextSnapshot?: ContextScope;
    supportsOrContradicts: 'supports' | 'contradicts';
    reproducible?: boolean;
    confidence?: number;
    notes?: string;
  }): EvidenceRecord {
    const id = generateEvidenceId();
    const capturedAt = new Date().toISOString();
    const contextSnapshot = input.contextSnapshot ?? {};
    const reproducible = input.reproducible ?? true;
    const confidence = Math.min(1, Math.max(0, input.confidence ?? 0.5));

    this.stmtInsert.run(
      id,
      input.refId,
      input.sourceType,
      input.sourceId,
      JSON.stringify(contextSnapshot),
      input.supportsOrContradicts,
      reproducible ? 1 : 0,
      confidence,
      input.notes ?? null,
      capturedAt
    );

    return {
      id,
      refId: input.refId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      contextSnapshot,
      supportsOrContradicts: input.supportsOrContradicts,
      reproducible,
      confidence,
      notes: input.notes,
      capturedAt,
    };
  }

  // ===========================================================================
  // 查询
  // ===========================================================================

  /** 按 ID 查询证据 */
  get(id: string): EvidenceRecord | null {
    const row = this.stmtGetById.get(id) as EvidenceRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  /** 查询某条 Ref 的所有证据，按时间倒序 */
  getByRefId(refId: string, limit = 100): EvidenceRecord[] {
    const rows = this.stmtGetByRefId.all(refId, limit) as EvidenceRow[];
    return rows.map(rowToRecord);
  }

  /** 查询某个来源（Story/Test/Fix）的所有证据 */
  getBySourceId(sourceId: string): EvidenceRecord[] {
    const rows = this.stmtGetBySourceId.all(sourceId) as EvidenceRow[];
    return rows.map(rowToRecord);
  }

  /** 查询某条 Ref 的反驳证据 */
  getContradictions(refId: string): EvidenceRecord[] {
    const rows = this.stmtGetContradictions.all(refId) as EvidenceRow[];
    return rows.map(rowToRecord);
  }

  /** 查询某条 Ref 的支持证据 */
  getSupports(refId: string): EvidenceRecord[] {
    const rows = this.stmtGetSupports.all(refId) as EvidenceRow[];
    return rows.map(rowToRecord);
  }

  // ===========================================================================
  // 摘要（聚合统计，不是手动维护的计数器）
  // ===========================================================================

  /** 获取某条 Ref 的证据摘要 */
  getSummary(refId: string): EvidenceSummary {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN supports_or_contradicts = 'supports' THEN 1 ELSE 0 END) as support_count,
        SUM(CASE WHEN supports_or_contradicts = 'contradicts' THEN 1 ELSE 0 END) as contradict_count,
        AVG(confidence) as avg_confidence,
        MAX(captured_at) as latest_captured_at
      FROM evidence
      WHERE ref_id = ?
    `).get(refId) as {
      total_count: number;
      support_count: number;
      contradict_count: number;
      avg_confidence: number | null;
      latest_captured_at: string | null;
    };

    const typeRows = this.db.prepare(`
      SELECT source_type, COUNT(*) as cnt
      FROM evidence
      WHERE ref_id = ?
      GROUP BY source_type
    `).all(refId) as { source_type: string; cnt: number }[];

    const sourceTypes: Record<string, number> = {};
    for (const r of typeRows) {
      sourceTypes[r.source_type] = r.cnt;
    }

    return {
      totalCount: row.total_count,
      supportCount: row.support_count,
      contradictCount: row.contradict_count,
      avgConfidence: row.avg_confidence ?? 0,
      latestCapturedAt: row.latest_captured_at ?? undefined,
      sourceTypes,
    };
  }

  /** 批量获取多条 Ref 的证据摘要 */
  getSummaries(refIds: string[]): Map<string, EvidenceSummary> {
    const result = new Map<string, EvidenceSummary>();
    if (refIds.length === 0) return result;

    // 使用事务批量查询，减少往返开销
    const getSummaryTx = this.db.transaction((ids: string[]) => {
      for (const refId of ids) {
        result.set(refId, this.getSummary(refId));
      }
    });
    getSummaryTx(refIds);

    return result;
  }

  // ===========================================================================
  // 搜索
  // ===========================================================================

  /**
   * 按上下文过滤器搜索证据
   * 使用 JSON 字段做模糊匹配（基于 LIKE，适合中小数据量）
   */
  findByContext(contextFilter: Partial<ContextScope>, limit = 100): EvidenceRecord[] {
    // 将过滤条件序列化为部分 JSON 片段进行 LIKE 匹配
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (contextFilter.env !== undefined) {
      conditions.push(`context_snapshot LIKE ?`);
      params.push(`%"env":"${contextFilter.env}"%`);
    }
    if (contextFilter.version !== undefined) {
      conditions.push(`context_snapshot LIKE ?`);
      params.push(`%"version":"${contextFilter.version}"%`);
    }
    if (contextFilter.project !== undefined) {
      conditions.push(`context_snapshot LIKE ?`);
      params.push(`%"project":"${contextFilter.project}"%`);
    }

    let sql = `SELECT * FROM evidence`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ` ORDER BY captured_at DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as EvidenceRow[];
    return rows.map(rowToRecord);
  }

  /** 获取最近的证据 */
  findRecent(limit = 50): EvidenceRecord[] {
    const rows = this.stmtFindRecent.all(limit) as EvidenceRow[];
    return rows.map(rowToRecord);
  }

  /** 按来源类型搜索证据 */
  findBySourceType(sourceType: EvidenceSourceType, limit = 100): EvidenceRecord[] {
    const rows = this.stmtFindBySourceType.all(sourceType, limit) as EvidenceRow[];
    return rows.map(rowToRecord);
  }

  // ===========================================================================
  // 统计
  // ===========================================================================

  /** 获取全局证据统计 */
  getStats(): {
    total: number;
    bySourceType: Record<string, number>;
    byVerdict: { supports: number; contradicts: number };
    avgConfidence: number;
    refsWithEvidence: number;
    refsWithContradiction: number;
  } {
    const totalRow = this.db.prepare(
      `SELECT COUNT(*) as cnt, AVG(confidence) as avg_conf FROM evidence`
    ).get() as { cnt: number; avg_conf: number | null };

    const verdictRows = this.db.prepare(`
      SELECT supports_or_contradicts, COUNT(*) as cnt
      FROM evidence
      GROUP BY supports_or_contradicts
    `).all() as { supports_or_contradicts: string; cnt: number }[];

    const byVerdict = { supports: 0, contradicts: 0 };
    for (const r of verdictRows) {
      if (r.supports_or_contradicts === 'supports') byVerdict.supports = r.cnt;
      else if (r.supports_or_contradicts === 'contradicts') byVerdict.contradicts = r.cnt;
    }

    const typeRows = this.db.prepare(`
      SELECT source_type, COUNT(*) as cnt
      FROM evidence
      GROUP BY source_type
    `).all() as { source_type: string; cnt: number }[];

    const bySourceType: Record<string, number> = {};
    for (const r of typeRows) {
      bySourceType[r.source_type] = r.cnt;
    }

    const refsRow = this.db.prepare(
      `SELECT COUNT(DISTINCT ref_id) as cnt FROM evidence`
    ).get() as { cnt: number };

    const refsWithContradictionRow = this.db.prepare(
      `SELECT COUNT(DISTINCT ref_id) as cnt FROM evidence WHERE supports_or_contradicts = 'contradicts'`
    ).get() as { cnt: number };

    return {
      total: totalRow.cnt,
      bySourceType,
      byVerdict,
      avgConfidence: totalRow.avg_conf ?? 0,
      refsWithEvidence: refsRow.cnt,
      refsWithContradiction: refsWithContradictionRow.cnt,
    };
  }

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }
}

// =============================================================================
// 便捷函数
// =============================================================================

/**
 * 快速记录支持证据
 */
export function recordSupport(
  store: EvidenceStore,
  refId: string,
  sourceType: EvidenceSourceType,
  sourceId: string,
  confidence = 0.7,
  context?: ContextScope
): EvidenceRecord {
  return store.record({
    refId,
    sourceType,
    sourceId,
    contextSnapshot: context,
    supportsOrContradicts: 'supports',
    reproducible: true,
    confidence,
  });
}

/**
 * 快速记录反驳证据
 */
export function recordContradiction(
  store: EvidenceStore,
  refId: string,
  sourceType: EvidenceSourceType,
  sourceId: string,
  notes: string,
  context?: ContextScope
): EvidenceRecord {
  return store.record({
    refId,
    sourceType,
    sourceId,
    contextSnapshot: context,
    supportsOrContradicts: 'contradicts',
    reproducible: true,
    confidence: 0.5,
    notes,
  });
}

/**
 * 判断一条 Ref 的证据是否健康
 *
 * 健康标准：
 * - 支持数量 >= minSupports（默认 1）
 * - 反驳比例 <= maxContradictRatio（默认 0.3）
 * - 有近期证据（默认 30 天内）
 */
export function isEvidenceHealthy(
  summary: EvidenceSummary,
  options?: {
    minSupports?: number;        // 最低支持数，默认 1
    maxContradictRatio?: number; // 最大反驳比例，默认 0.3
    freshnessWindowDays?: number; // 新鲜度窗口（天），默认 30
  }
): boolean {
  const minSupports = options?.minSupports ?? 1;
  const maxContradictRatio = options?.maxContradictRatio ?? 0.3;
  const freshnessWindowDays = options?.freshnessWindowDays ?? 30;

  // 支持数量不足
  if (summary.supportCount < minSupports) return false;

  // 反驳比例过高
  if (summary.totalCount > 0) {
    const contradictRatio = summary.contradictCount / summary.totalCount;
    if (contradictRatio > maxContradictRatio) return false;
  }

  // 检查新鲜度
  if (summary.latestCapturedAt) {
    const latestDate = new Date(summary.latestCapturedAt);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - freshnessWindowDays);
    if (latestDate < cutoff) return false;
  } else {
    // 没有任何证据，不健康
    return false;
  }

  return true;
}
