/**
 * ReconstructionStore — AcceptedReconstruction 持久化层
 *
 * HIGH 4 修复：使 AcceptedReconstruction 成为可查询、可审计、可复用的一等治理对象，
 * 而非仅存在于 recordFix 返回值中的临时快照。
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { AcceptedReconstruction } from './reconstruction.js';

interface ReconstructionRow {
  id: string;
  episode_id: string;
  version: number;
  fidelity_score: number;
  created_at: string;
  created_by: string;
  data: string;
}

function rowToReconstruction(row: ReconstructionRow): AcceptedReconstruction {
  return JSON.parse(row.data) as AcceptedReconstruction;
}

export interface ReconstructionStoreStats {
  totalCount: number;
}

export class ReconstructionStore {
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
      CREATE TABLE IF NOT EXISTS reconstructions (
        id              TEXT PRIMARY KEY,
        episode_id      TEXT NOT NULL,
        version         INTEGER NOT NULL,
        fidelity_score  REAL NOT NULL,
        created_at      TEXT NOT NULL,
        created_by      TEXT NOT NULL,
        data            TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rc_episode ON reconstructions (episode_id);
      CREATE INDEX IF NOT EXISTS idx_rc_fidelity ON reconstructions (fidelity_score);
    `);
  }

  save(reconstruction: AcceptedReconstruction): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO reconstructions
        (id, episode_id, version, fidelity_score, created_at, created_by, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      reconstruction.id,
      reconstruction.episode_id,
      reconstruction.version,
      reconstruction.fidelity.score,
      reconstruction.created_at,
      reconstruction.created_by,
      JSON.stringify(reconstruction)
    );
  }

  get(id: string): AcceptedReconstruction | null {
    const row = this.db.prepare(
      'SELECT * FROM reconstructions WHERE id = ?'
    ).get(id) as ReconstructionRow | undefined;
    return row ? rowToReconstruction(row) : null;
  }

  /** 按 Episode 查询所有版本的 Reconstruction（按 version 降序） */
  getByEpisode(episodeId: string): AcceptedReconstruction[] {
    const rows = this.db.prepare(
      'SELECT * FROM reconstructions WHERE episode_id = ? ORDER BY version DESC'
    ).all(episodeId) as ReconstructionRow[];
    return rows.map(rowToReconstruction);
  }

  /** 查询 fidelity 低于阈值的 Reconstruction（用于审计） */
  getLowFidelity(threshold: number, limit = 50): AcceptedReconstruction[] {
    const rows = this.db.prepare(
      'SELECT * FROM reconstructions WHERE fidelity_score < ? ORDER BY fidelity_score ASC LIMIT ?'
    ).all(threshold, limit) as ReconstructionRow[];
    return rows.map(rowToReconstruction);
  }

  getStats(): ReconstructionStoreStats {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM reconstructions').get() as { cnt: number };
    return { totalCount: row.cnt };
  }

  close(): void {
    this.db.close();
  }
}
