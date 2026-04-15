/**
 * LineageCompileProposalStore — LineageCompileProposal SQLite WAL 持久化层
 *
 * 遵循 PresentSliceStore / BranchPointStore 的统一模式：
 * - better-sqlite3 WAL 模式
 * - data 列存完整 JSON
 * - 索引列用于高频查询
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { LineageCompileProposal } from './lineage-compile-proposal.js';
import { assertValidLineageCompileProposal } from './lineage-compile-proposal.js';

// =============================================================================
// 统计接口
// =============================================================================

export interface LineageCompileProposalStoreStats {
  total: number;
  byStatus: Record<string, number>;
}

// =============================================================================
// Store 实现
// =============================================================================

export class LineageCompileProposalStore {
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
      CREATE TABLE IF NOT EXISTS lineage_compile_proposals (
        id                       TEXT PRIMARY KEY,
        target_present_slice_id  TEXT NOT NULL,
        proposed_lineage_id      TEXT NOT NULL,
        status                   TEXT NOT NULL,
        review_decision_id       TEXT,
        reconstruction_id        TEXT,
        created_at               TEXT NOT NULL,
        created_by               TEXT NOT NULL,
        data                     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lcp_status ON lineage_compile_proposals (status);
      CREATE INDEX IF NOT EXISTS idx_lcp_slice  ON lineage_compile_proposals (target_present_slice_id);
      CREATE INDEX IF NOT EXISTS idx_lcp_lineage ON lineage_compile_proposals (proposed_lineage_id);
    `);
  }

  /** 保存（INSERT OR REPLACE） */
  save(proposal: LineageCompileProposal): void {
    assertValidLineageCompileProposal(proposal);
    this.db.prepare(`
      INSERT OR REPLACE INTO lineage_compile_proposals
        (id, target_present_slice_id, proposed_lineage_id, status,
         review_decision_id, reconstruction_id, created_at, created_by, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      proposal.id,
      proposal.targetPresentSliceId,
      proposal.proposedLineageId,
      proposal.status,
      proposal.reviewDecisionId,
      proposal.reconstructionId,
      proposal.createdAt,
      proposal.createdBy,
      JSON.stringify(proposal),
    );
  }

  /** 按 ID 查询 */
  get(id: string): LineageCompileProposal | null {
    const row = this.db.prepare(
      'SELECT data FROM lineage_compile_proposals WHERE id = ?'
    ).get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /** 按 PresentSlice ID 查询所有提案 */
  listByPresentSlice(presentSliceId: string): LineageCompileProposal[] {
    const rows = this.db.prepare(
      'SELECT data FROM lineage_compile_proposals WHERE target_present_slice_id = ? ORDER BY created_at'
    ).all(presentSliceId) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  /** 按 lineage ID 查询所有提案 */
  listByLineage(lineageId: string): LineageCompileProposal[] {
    const rows = this.db.prepare(
      'SELECT data FROM lineage_compile_proposals WHERE proposed_lineage_id = ? ORDER BY created_at'
    ).all(lineageId) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  /** 按状态查询 */
  listByStatus(status: string, limit = 100): LineageCompileProposal[] {
    const rows = this.db.prepare(
      'SELECT data FROM lineage_compile_proposals WHERE status = ? ORDER BY created_at DESC LIMIT ?'
    ).all(status, limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  /** 查询所有提案（按创建时间降序） */
  listAll(limit = 100): LineageCompileProposal[] {
    const rows = this.db.prepare(
      'SELECT data FROM lineage_compile_proposals ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  /** 统计信息 */
  getStats(): LineageCompileProposalStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM lineage_compile_proposals').get() as { count: number }
    ).count;
    const statusRows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM lineage_compile_proposals GROUP BY status'
    ).all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.status] = r.count;
    return { total, byStatus };
  }

  close(): void {
    this.db.close();
  }
}
