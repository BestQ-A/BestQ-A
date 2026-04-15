/**
 * StateSnapshotStore — SQLite 持久化层
 * implements: docs/current/state-snapshot-contract.md（待补）
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { StateSnapshot } from './types.js';

interface StateSnapshotRow {
  id: string;
  episode_id: string;
  t: string; // JSON-encoded (number | string)
  created_at: string;
  data: string; // JSON blob
}

function rowToSnapshot(row: StateSnapshotRow): StateSnapshot {
  return JSON.parse(row.data) as StateSnapshot;
}

export interface StateSnapshotStoreStats {
  total: number;
  byEpisode: Record<string, number>;
}

export class StateSnapshotStore {
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
      CREATE TABLE IF NOT EXISTS state_snapshots (
        id          TEXT PRIMARY KEY,
        episode_id  TEXT NOT NULL,
        t           TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        data        TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ss_episode    ON state_snapshots (episode_id);
      CREATE INDEX IF NOT EXISTS idx_ss_created_at ON state_snapshots (created_at);
    `);
  }

  save(snapshot: StateSnapshot): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO state_snapshots (id, episode_id, t, created_at, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      snapshot.id,
      snapshot.episodeId,
      String(snapshot.t),
      snapshot.createdAt,
      JSON.stringify(snapshot)
    );
  }

  get(id: string): StateSnapshot | null {
    const row = this.db.prepare(
      'SELECT * FROM state_snapshots WHERE id = ?'
    ).get(id) as StateSnapshotRow | undefined;
    return row ? rowToSnapshot(row) : null;
  }

  listByEpisode(episodeId: string): StateSnapshot[] {
    const rows = this.db.prepare(
      'SELECT * FROM state_snapshots WHERE episode_id = ? ORDER BY created_at'
    ).all(episodeId) as StateSnapshotRow[];
    return rows.map(rowToSnapshot);
  }

  /** 取某 Episode 的最新快照（按 created_at 降序第一条） */
  getLatestByEpisode(episodeId: string): StateSnapshot | null {
    const row = this.db.prepare(
      'SELECT * FROM state_snapshots WHERE episode_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(episodeId) as StateSnapshotRow | undefined;
    return row ? rowToSnapshot(row) : null;
  }

  getStats(): StateSnapshotStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM state_snapshots').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT episode_id, COUNT(*) as count FROM state_snapshots GROUP BY episode_id'
    ).all() as Array<{ episode_id: string; count: number }>;
    const byEpisode: Record<string, number> = {};
    for (const row of rows) byEpisode[row.episode_id] = row.count;
    return { total, byEpisode };
  }

  close(): void {
    this.db.close();
  }
}
