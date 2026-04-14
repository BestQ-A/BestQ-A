/**
 * ObservationRecordStore — SQLite 持久化层
 * implements: docs/current/support-link-contract.md §3.1
 *             docs/current/v7-world-model-contract.md §3.2（Episode.observationRecordIds）
 *
 * 设计原则：
 * - JSON blob 存整对象，indexed 列（episode_id / t）供快速查询
 * - 第一轮不做复杂索引，先解决"SupportLink.observationRecordId 可以 resolve 到真实对象"
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ObservationRecord } from './types.js';

// =============================================================================
// 内部行结构
// =============================================================================

interface ObservationRecordRow {
  id: string;
  episode_id: string;
  t: string; // 存为 TEXT（数值/ISO 均可 stringify）
  data: string; // JSON blob
}

function rowToRecord(row: ObservationRecordRow): ObservationRecord {
  return JSON.parse(row.data) as ObservationRecord;
}

// =============================================================================
// ObservationRecordStore 类
// =============================================================================

export interface ObservationRecordStoreStats {
  total: number;
  byEpisode: Record<string, number>;
}

export class ObservationRecordStore {
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
      CREATE TABLE IF NOT EXISTS observation_records (
        id         TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        t          TEXT NOT NULL,
        data       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_or_episode ON observation_records (episode_id);
      CREATE INDEX IF NOT EXISTS idx_or_t       ON observation_records (t);
    `);
  }

  /** 保存或替换 */
  save(record: ObservationRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO observation_records (id, episode_id, t, data)
      VALUES (?, ?, ?, ?)
    `).run(
      record.id,
      record.episodeId,
      String(record.t),
      JSON.stringify(record)
    );
  }

  /** 按 ID 查找 */
  get(id: string): ObservationRecord | null {
    const row = this.db.prepare(
      'SELECT * FROM observation_records WHERE id = ?'
    ).get(id) as ObservationRecordRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  /** 列举某 Episode 的所有 ObservationRecord（按 t 升序） */
  listByEpisode(episodeId: string): ObservationRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM observation_records WHERE episode_id = ? ORDER BY t'
    ).all(episodeId) as ObservationRecordRow[];
    return rows.map(rowToRecord);
  }

  getStats(): ObservationRecordStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM observation_records').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT episode_id, COUNT(*) as count FROM observation_records GROUP BY episode_id'
    ).all() as Array<{ episode_id: string; count: number }>;
    const byEpisode: Record<string, number> = {};
    for (const row of rows) byEpisode[row.episode_id] = row.count;
    return { total, byEpisode };
  }

  close(): void {
    this.db.close();
  }
}
