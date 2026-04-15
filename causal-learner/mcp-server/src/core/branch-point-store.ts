/**
 * BranchPointStore — BranchPoint + FutureBranch SQLite 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { BranchPoint, FutureBranch } from './branch-point.js';

export interface BranchPointStoreStats {
  branchPointCount: number;
  futureBranchCount: number;
}

export class BranchPointStore {
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
      CREATE TABLE IF NOT EXISTS branch_points (
        id              TEXT PRIMARY KEY,
        episode_id      TEXT NOT NULL,
        candidate_count INTEGER NOT NULL,
        chosen_branch_id TEXT,
        created_at      TEXT NOT NULL,
        data            TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bp_episode ON branch_points (episode_id);

      CREATE TABLE IF NOT EXISTS future_branches (
        id               TEXT PRIMARY KEY,
        branch_point_id  TEXT NOT NULL,
        status           TEXT NOT NULL,
        score            REAL NOT NULL,
        created_at       TEXT NOT NULL,
        data             TEXT NOT NULL,
        FOREIGN KEY (branch_point_id) REFERENCES branch_points(id)
      );
      CREATE INDEX IF NOT EXISTS idx_fb_bp ON future_branches (branch_point_id);
      CREATE INDEX IF NOT EXISTS idx_fb_status ON future_branches (status);
    `);
  }

  saveBranchPoint(bp: BranchPoint): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO branch_points
        (id, episode_id, candidate_count, chosen_branch_id, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(bp.id, bp.episodeId, bp.candidateCount, bp.chosenBranchId, bp.createdAt, JSON.stringify(bp));
  }

  saveFutureBranch(fb: FutureBranch): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO future_branches
        (id, branch_point_id, status, score, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(fb.id, fb.branchPointId, fb.status, fb.score, fb.createdAt, JSON.stringify(fb));
  }

  getBranchPoint(id: string): BranchPoint | null {
    const row = this.db.prepare('SELECT data FROM branch_points WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  getByEpisode(episodeId: string): BranchPoint[] {
    const rows = this.db.prepare('SELECT data FROM branch_points WHERE episode_id = ? ORDER BY created_at').all(episodeId) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  getBranches(branchPointId: string): FutureBranch[] {
    const rows = this.db.prepare('SELECT data FROM future_branches WHERE branch_point_id = ? ORDER BY score DESC').all(branchPointId) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  /** 查询所有被剪除的分支（用于失败边界审计） */
  getPrunedBranches(limit = 50): FutureBranch[] {
    const rows = this.db.prepare("SELECT data FROM future_branches WHERE status = 'pruned' ORDER BY created_at DESC LIMIT ?").all(limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  getStats(): BranchPointStoreStats {
    const bp = this.db.prepare('SELECT COUNT(*) as cnt FROM branch_points').get() as { cnt: number };
    const fb = this.db.prepare('SELECT COUNT(*) as cnt FROM future_branches').get() as { cnt: number };
    return { branchPointCount: bp.cnt, futureBranchCount: fb.cnt };
  }

  close(): void {
    this.db.close();
  }
}
