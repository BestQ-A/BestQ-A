/**
 * PresentSliceStore — PresentSlice SQLite 持久化层
 *
 * 遵循 ReconstructionStore / BranchPointStore 的统一模式：
 * - better-sqlite3 WAL 模式
 * - data 列存完整 JSON
 * - 索引列用于高频查询
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { PresentSlice } from './present-slice.js';

export interface PresentSliceStoreStats {
  totalCount: number;
}

export class PresentSliceStore {
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
      CREATE TABLE IF NOT EXISTS present_slices (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        fidelity_score  REAL NOT NULL,
        created_at      TEXT NOT NULL,
        created_by      TEXT NOT NULL,
        data            TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ps_fidelity ON present_slices (fidelity_score);
      CREATE INDEX IF NOT EXISTS idx_ps_created_at ON present_slices (created_at);
    `);
  }

  /** 保存（INSERT OR REPLACE） */
  save(slice: PresentSlice): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO present_slices
        (id, name, fidelity_score, created_at, created_by, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      slice.id,
      slice.name,
      slice.fidelityScore,
      slice.createdAt,
      slice.createdBy,
      JSON.stringify(slice),
    );
  }

  /** 按 ID 查询 */
  get(id: string): PresentSlice | null {
    const row = this.db.prepare(
      'SELECT data FROM present_slices WHERE id = ?'
    ).get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /** 查询所有 slice（按创建时间降序） */
  listAll(limit = 100): PresentSlice[] {
    const rows = this.db.prepare(
      'SELECT data FROM present_slices ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  /** 查询 fidelity 低于阈值的 slice（用于审计） */
  getLowFidelity(threshold: number, limit = 50): PresentSlice[] {
    const rows = this.db.prepare(
      'SELECT data FROM present_slices WHERE fidelity_score < ? ORDER BY fidelity_score ASC LIMIT ?'
    ).all(threshold, limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  /** 按 Episode ID 查询包含该 episode 的 slice（JSON 子串匹配） */
  getByEpisodeId(episodeId: string): PresentSlice[] {
    // SQLite JSON 子串搜索：episodeIds 数组序列化后包含该 ID
    const rows = this.db.prepare(
      "SELECT data FROM present_slices WHERE data LIKE ? ORDER BY created_at DESC"
    ).all(`%"${episodeId}"%`) as { data: string }[];
    // 二次过滤确保精确匹配
    return rows
      .map(r => JSON.parse(r.data) as PresentSlice)
      .filter(s => s.episodeIds.includes(episodeId));
  }

  getStats(): PresentSliceStoreStats {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM present_slices').get() as { cnt: number };
    return { totalCount: row.cnt };
  }

  close(): void {
    this.db.close();
  }
}
