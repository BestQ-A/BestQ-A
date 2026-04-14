/**
 * ProgramRevisionProposalStore — SQLite WAL 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ProgramRevisionProposal } from './program-revision-proposal.js';
import { assertValidProgramRevisionProposal } from './program-revision-proposal.js';

interface PrpRow {
  id: string;
  target_kind: string;
  target_ref: string;
  status: string;
  created_at: string;
  data: string;
}

function rowToPrp(row: PrpRow): ProgramRevisionProposal {
  return JSON.parse(row.data) as ProgramRevisionProposal;
}

export interface ProgramRevisionProposalStoreStats {
  total: number;
  byStatus: Record<string, number>;
  byTargetKind: Record<string, number>;
}

export class ProgramRevisionProposalStore {
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
      CREATE TABLE IF NOT EXISTS program_revision_proposals (
        id          TEXT PRIMARY KEY,
        target_kind TEXT NOT NULL,
        target_ref  TEXT NOT NULL,
        status      TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        data        TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_prp_target_ref ON program_revision_proposals (target_ref);
      CREATE INDEX IF NOT EXISTS idx_prp_status     ON program_revision_proposals (status);
    `);
  }

  save(prp: ProgramRevisionProposal): void {
    assertValidProgramRevisionProposal(prp);
    this.db.prepare(`
      INSERT OR REPLACE INTO program_revision_proposals
        (id, target_kind, target_ref, status, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      prp.id,
      prp.targetKind,
      prp.targetRef,
      prp.status,
      prp.createdAt,
      JSON.stringify(prp)
    );
  }

  get(id: string): ProgramRevisionProposal | null {
    const row = this.db.prepare(
      'SELECT * FROM program_revision_proposals WHERE id = ?'
    ).get(id) as PrpRow | undefined;
    return row ? rowToPrp(row) : null;
  }

  listByPredictionError(predictionErrorId: string): ProgramRevisionProposal[] {
    // basedOnPredictionErrorIds 存储在 JSON blob 中，使用 json_each 扫描
    const rows = this.db.prepare(
      `SELECT p.* FROM program_revision_proposals p,
       json_each(json_extract(p.data, '$.basedOnPredictionErrorIds')) j
       WHERE j.value = ? ORDER BY p.created_at`
    ).all(predictionErrorId) as PrpRow[];
    return rows.map(rowToPrp);
  }

  listByTargetRef(targetRef: string): ProgramRevisionProposal[] {
    const rows = this.db.prepare(
      'SELECT * FROM program_revision_proposals WHERE target_ref = ? ORDER BY created_at'
    ).all(targetRef) as PrpRow[];
    return rows.map(rowToPrp);
  }

  getStats(): ProgramRevisionProposalStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM program_revision_proposals').get() as { count: number }
    ).count;
    const statusRows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM program_revision_proposals GROUP BY status'
    ).all() as Array<{ status: string; count: number }>;
    const kindRows = this.db.prepare(
      'SELECT target_kind, COUNT(*) as count FROM program_revision_proposals GROUP BY target_kind'
    ).all() as Array<{ target_kind: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.status] = r.count;
    const byTargetKind: Record<string, number> = {};
    for (const r of kindRows) byTargetKind[r.target_kind] = r.count;
    return { total, byStatus, byTargetKind };
  }

  close(): void {
    this.db.close();
  }
}
