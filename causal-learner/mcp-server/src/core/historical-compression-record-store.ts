/**
 * HistoricalCompressionRecordStore — HistoricalCompressionRecord SQLite 持久化层
 *
 * 遵循 PresentSliceStore / BranchPointStore 的统一模式：
 * - better-sqlite3 WAL 模式
 * - data 列存完整 JSON
 * - 索引列用于高频查询
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { HistoricalCompressionRecord } from './historical-compression-record.js';

export interface HistoricalCompressionRecordStoreStats {
  totalCount: number;
}

export class HistoricalCompressionRecordStore {
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
      CREATE TABLE IF NOT EXISTS historical_compression_records (
        id                      TEXT PRIMARY KEY,
        name                    TEXT NOT NULL,
        target_present_slice_id TEXT NOT NULL,
        compression_ratio       REAL NOT NULL,
        reversible              INTEGER NOT NULL,
        created_at              TEXT NOT NULL,
        created_by              TEXT NOT NULL,
        data                    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hcr_target_ps
        ON historical_compression_records (target_present_slice_id);
      CREATE INDEX IF NOT EXISTS idx_hcr_ratio
        ON historical_compression_records (compression_ratio);
      CREATE INDEX IF NOT EXISTS idx_hcr_created_at
        ON historical_compression_records (created_at);
    `);
  }

  /** 保存（INSERT OR REPLACE） */
  save(record: HistoricalCompressionRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO historical_compression_records
        (id, name, target_present_slice_id, compression_ratio, reversible, created_at, created_by, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.name,
      record.targetPresentSliceId,
      record.compressionRatio,
      record.reversible ? 1 : 0,
      record.createdAt,
      record.createdBy,
      JSON.stringify(record),
    );
  }

  /** 按 ID 查询 */
  get(id: string): HistoricalCompressionRecord | null {
    const row = this.db.prepare(
      'SELECT data FROM historical_compression_records WHERE id = ?',
    ).get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /** 查询所有记录（按创建时间降序） */
  listAll(limit = 100): HistoricalCompressionRecord[] {
    const rows = this.db.prepare(
      'SELECT data FROM historical_compression_records ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  /** 按 targetPresentSliceId 查询（一个 PresentSlice 可能由多次压缩产生） */
  getByPresentSliceId(sliceId: string): HistoricalCompressionRecord[] {
    const rows = this.db.prepare(
      'SELECT data FROM historical_compression_records WHERE target_present_slice_id = ? ORDER BY created_at DESC',
    ).all(sliceId) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  /** 按 sourceEpisodeId 查询包含该 episode 的压缩记录（JSON 子串 + 精确过滤） */
  getBySourceEpisodeId(episodeId: string): HistoricalCompressionRecord[] {
    const rows = this.db.prepare(
      "SELECT data FROM historical_compression_records WHERE data LIKE ? ORDER BY created_at DESC",
    ).all(`%"${episodeId}"%`) as { data: string }[];
    return rows
      .map(r => JSON.parse(r.data) as HistoricalCompressionRecord)
      .filter(rec => rec.sourceEpisodeIds.includes(episodeId));
  }

  /** 查询高压缩比记录（用于审计 — 压缩比过高可能意味着信息损失严重） */
  getHighCompression(threshold: number, limit = 50): HistoricalCompressionRecord[] {
    const rows = this.db.prepare(
      'SELECT data FROM historical_compression_records WHERE compression_ratio >= ? ORDER BY compression_ratio DESC LIMIT ?',
    ).all(threshold, limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  /** 查询可逆的压缩记录 */
  getReversible(limit = 50): HistoricalCompressionRecord[] {
    const rows = this.db.prepare(
      'SELECT data FROM historical_compression_records WHERE reversible = 1 ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  getStats(): HistoricalCompressionRecordStoreStats {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM historical_compression_records',
    ).get() as { cnt: number };
    return { totalCount: row.cnt };
  }

  close(): void {
    this.db.close();
  }
}
