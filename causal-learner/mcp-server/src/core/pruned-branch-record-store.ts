/**
 * PrunedBranchRecordStore — PrunedBranchRecord SQLite 持久化层
 * contract: docs/current/pruned-branch-record-contract.md §4
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type {
  PrunedBranchRecord,
  PruneReason,
} from './pruned-branch-record.js';

export interface PrunedBranchRecordStoreStats {
  totalCount: number;
  byReason: Record<PruneReason, number>;
}

const ALL_REASONS: PruneReason[] = ['failure', 'institution', 'design', 'physics'];

export class PrunedBranchRecordStore {
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
      CREATE TABLE IF NOT EXISTS pruned_branch_records (
        id                 TEXT PRIMARY KEY,
        present_slice_ref  TEXT NOT NULL,
        pruned_at          TEXT NOT NULL,
        pruned_by_actor    TEXT NOT NULL,
        data               TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pbr_slice
        ON pruned_branch_records (present_slice_ref);
      CREATE INDEX IF NOT EXISTS idx_pbr_time
        ON pruned_branch_records (pruned_at);
    `);
  }

  save(record: PrunedBranchRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO pruned_branch_records
        (id, present_slice_ref, pruned_at, pruned_by_actor, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.presentSliceRef,
      record.prunedAt,
      record.prunedByActor,
      JSON.stringify(record),
    );
  }

  get(id: string): PrunedBranchRecord | null {
    const row = this.db.prepare(
      'SELECT data FROM pruned_branch_records WHERE id = ?',
    ).get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  listAll(limit = 100): PrunedBranchRecord[] {
    const rows = this.db.prepare(
      'SELECT data FROM pruned_branch_records ORDER BY pruned_at DESC LIMIT ?',
    ).all(limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  getByPresentSliceRef(sliceRef: string): PrunedBranchRecord[] {
    const rows = this.db.prepare(
      'SELECT data FROM pruned_branch_records WHERE present_slice_ref = ? ORDER BY pruned_at DESC',
    ).all(sliceRef) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  getByReason(reason: PruneReason, limit = 50): PrunedBranchRecord[] {
    const rows = this.db.prepare(
      "SELECT data FROM pruned_branch_records WHERE data LIKE ? ORDER BY pruned_at DESC LIMIT ?",
    ).all(`%"${reason}"%`, limit) as { data: string }[];
    return rows
      .map(r => JSON.parse(r.data) as PrunedBranchRecord)
      .filter(rec => rec.prunedBy.includes(reason));
  }

  getByEpisodeId(episodeId: string): PrunedBranchRecord[] {
    const rows = this.db.prepare(
      "SELECT data FROM pruned_branch_records WHERE data LIKE ? ORDER BY pruned_at DESC",
    ).all(`%"${episodeId}"%`) as { data: string }[];
    return rows
      .map(r => JSON.parse(r.data) as PrunedBranchRecord)
      .filter(rec => rec.definingEpisodeIds.includes(episodeId));
  }

  getStats(): PrunedBranchRecordStoreStats {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM pruned_branch_records',
    ).get() as { cnt: number };
    const byReason = Object.fromEntries(
      ALL_REASONS.map(r => [r, this.getByReason(r, 10000).length]),
    ) as Record<PruneReason, number>;
    return { totalCount: row.cnt, byReason };
  }

  close(): void {
    this.db.close();
  }
}
