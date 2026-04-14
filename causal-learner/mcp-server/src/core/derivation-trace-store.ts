/**
 * DerivationTraceStore — SQLite 持久化层
 * implements: docs/current/derivation-chain-contract.md
 *
 * 设计原则：
 * - JSON blob 存整对象，indexed 列供快速查询
 * - episode_id / reconstruction_id 双向可查
 * - 第一轮先保证 reconstruction 引用的 trace 能被找回
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { DerivationTrace } from './types.js';

// =============================================================================
// 内部行结构
// =============================================================================

interface DerivationTraceRow {
  id: string;
  episode_id: string | null;
  reconstruction_id: string | null;
  context_kind: string;
  chain_integrity: string;
  created_at: string;
  data: string; // JSON blob
}

function rowToTrace(row: DerivationTraceRow): DerivationTrace {
  return JSON.parse(row.data) as DerivationTrace;
}

// =============================================================================
// DerivationTraceStore 类
// =============================================================================

export interface DerivationTraceStoreStats {
  total: number;
  byIntegrity: Record<string, number>;
}

export class DerivationTraceStore {
  private db: DatabaseType;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS derivation_traces (
        id                TEXT PRIMARY KEY,
        episode_id        TEXT,
        reconstruction_id TEXT,
        context_kind      TEXT NOT NULL,
        chain_integrity   TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        data              TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_dt_episode        ON derivation_traces (episode_id);
      CREATE INDEX IF NOT EXISTS idx_dt_reconstruction ON derivation_traces (reconstruction_id);
    `);
  }

  /** 保存或替换 */
  save(trace: DerivationTrace): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO derivation_traces
        (id, episode_id, reconstruction_id, context_kind, chain_integrity, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      trace.id,
      trace.episodeId ?? null,
      trace.reconstructionId ?? null,
      trace.contextKind,
      trace.chainIntegrity,
      trace.createdAt,
      JSON.stringify(trace)
    );
  }

  /** 按 ID 查找 */
  get(id: string): DerivationTrace | null {
    const row = this.db.prepare(
      'SELECT * FROM derivation_traces WHERE id = ?'
    ).get(id) as DerivationTraceRow | undefined;
    return row ? rowToTrace(row) : null;
  }

  /** 列举某 Episode 的所有推导链（按创建时间升序） */
  getByEpisode(episodeId: string): DerivationTrace[] {
    const rows = this.db.prepare(
      'SELECT * FROM derivation_traces WHERE episode_id = ? ORDER BY created_at'
    ).all(episodeId) as DerivationTraceRow[];
    return rows.map(rowToTrace);
  }

  /** 按 Reconstruction ID 查找（取最新一条） */
  getByReconstruction(reconstructionId: string): DerivationTrace | null {
    const row = this.db.prepare(
      'SELECT * FROM derivation_traces WHERE reconstruction_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(reconstructionId) as DerivationTraceRow | undefined;
    return row ? rowToTrace(row) : null;
  }

  getStats(): DerivationTraceStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM derivation_traces').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT chain_integrity, COUNT(*) as count FROM derivation_traces GROUP BY chain_integrity'
    ).all() as Array<{ chain_integrity: string; count: number }>;
    const byIntegrity: Record<string, number> = {};
    for (const row of rows) byIntegrity[row.chain_integrity] = row.count;
    return { total, byIntegrity };
  }

  close(): void {
    this.db.close();
  }
}
