/**
 * TransitionStore — SQLite 持久化层
 * implements: docs/current/transition-contract.md（待补）
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { Transition } from './types.js';

interface TransitionRow {
  id: string;
  episode_id: string;
  from_snapshot_id: string;
  to_snapshot_id: string;
  caused_by_action_id: string | null;
  created_at: string;
  data: string; // JSON blob
}

function rowToTransition(row: TransitionRow): Transition {
  return JSON.parse(row.data) as Transition;
}

export interface TransitionStoreStats {
  total: number;
  byEpisode: Record<string, number>;
}

export class TransitionStore {
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
      CREATE TABLE IF NOT EXISTS transitions (
        id                    TEXT PRIMARY KEY,
        episode_id            TEXT NOT NULL,
        from_snapshot_id      TEXT NOT NULL,
        to_snapshot_id        TEXT NOT NULL,
        caused_by_action_id   TEXT,
        created_at            TEXT NOT NULL,
        data                  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tr_episode    ON transitions (episode_id);
      CREATE INDEX IF NOT EXISTS idx_tr_action     ON transitions (caused_by_action_id);
      CREATE INDEX IF NOT EXISTS idx_tr_created_at ON transitions (created_at);
    `);
  }

  save(transition: Transition): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO transitions
        (id, episode_id, from_snapshot_id, to_snapshot_id, caused_by_action_id, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      transition.id,
      transition.episodeId,
      transition.fromSnapshotId,
      transition.toSnapshotId,
      transition.causedByActionId ?? null,
      transition.createdAt,
      JSON.stringify(transition)
    );
  }

  get(id: string): Transition | null {
    const row = this.db.prepare(
      'SELECT * FROM transitions WHERE id = ?'
    ).get(id) as TransitionRow | undefined;
    return row ? rowToTransition(row) : null;
  }

  listByEpisode(episodeId: string): Transition[] {
    const rows = this.db.prepare(
      'SELECT * FROM transitions WHERE episode_id = ? ORDER BY created_at'
    ).all(episodeId) as TransitionRow[];
    return rows.map(rowToTransition);
  }

  listByActionExecution(actionExecutionId: string): Transition[] {
    const rows = this.db.prepare(
      'SELECT * FROM transitions WHERE caused_by_action_id = ? ORDER BY created_at'
    ).all(actionExecutionId) as TransitionRow[];
    return rows.map(rowToTransition);
  }

  getStats(): TransitionStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM transitions').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT episode_id, COUNT(*) as count FROM transitions GROUP BY episode_id'
    ).all() as Array<{ episode_id: string; count: number }>;
    const byEpisode: Record<string, number> = {};
    for (const row of rows) byEpisode[row.episode_id] = row.count;
    return { total, byEpisode };
  }

  close(): void {
    this.db.close();
  }
}
