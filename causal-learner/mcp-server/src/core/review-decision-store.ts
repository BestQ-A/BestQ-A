/**
 * ReviewDecisionStore — SQLite WAL 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ReviewDecision } from './review-decision.js';
import { assertValidReviewDecision } from './review-decision.js';

interface RdRow {
  id: string;
  proposal_ref: string;
  decision: string;
  reviewed_at: string;
  data: string;
}

function rowToRd(row: RdRow): ReviewDecision {
  return JSON.parse(row.data) as ReviewDecision;
}

export interface ReviewDecisionStoreStats {
  total: number;
  byDecision: Record<string, number>;
}

export class ReviewDecisionStore {
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
      CREATE TABLE IF NOT EXISTS review_decisions (
        id           TEXT PRIMARY KEY,
        proposal_ref TEXT NOT NULL,
        decision     TEXT NOT NULL,
        reviewed_at  TEXT NOT NULL,
        data         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rd_proposal ON review_decisions (proposal_ref);
      CREATE INDEX IF NOT EXISTS idx_rd_decision ON review_decisions (decision);
    `);
  }

  save(rd: ReviewDecision): void {
    assertValidReviewDecision(rd);
    this.db.prepare(`
      INSERT OR REPLACE INTO review_decisions
        (id, proposal_ref, decision, reviewed_at, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      rd.id,
      rd.proposalRef,
      rd.decision,
      rd.reviewedAt,
      JSON.stringify(rd)
    );
  }

  get(id: string): ReviewDecision | null {
    const row = this.db.prepare(
      'SELECT * FROM review_decisions WHERE id = ?'
    ).get(id) as RdRow | undefined;
    return row ? rowToRd(row) : null;
  }

  listByProposal(proposalRef: string): ReviewDecision[] {
    const rows = this.db.prepare(
      'SELECT * FROM review_decisions WHERE proposal_ref = ? ORDER BY reviewed_at'
    ).all(proposalRef) as RdRow[];
    return rows.map(rowToRd);
  }

  getStats(): ReviewDecisionStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM review_decisions').get() as { count: number }
    ).count;
    const decisionRows = this.db.prepare(
      'SELECT decision, COUNT(*) as count FROM review_decisions GROUP BY decision'
    ).all() as Array<{ decision: string; count: number }>;
    const byDecision: Record<string, number> = {};
    for (const r of decisionRows) byDecision[r.decision] = r.count;
    return { total, byDecision };
  }

  close(): void {
    this.db.close();
  }
}
