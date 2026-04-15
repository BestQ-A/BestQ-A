/**
 * SupportLinkStore — SQLite 持久化层
 * implements: docs/current/support-link-contract.md
 *
 * 设计原则：
 * - JSON blob 存整对象，indexed 列（observation_record_id / claim_id / polarity）供快速查询
 * - 第一轮不做复杂索引，先解决"SupportLink 可落盘、可查询、被 MechanismInstance 引用"
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { SupportLink } from './types.js';

// =============================================================================
// 内部行结构
// =============================================================================

interface SupportLinkRow {
  id: string;
  observation_record_id: string;
  claim_id: string;
  polarity: string;
  created_at: string;
  data: string; // JSON blob
}

function rowToLink(row: SupportLinkRow): SupportLink {
  return JSON.parse(row.data) as SupportLink;
}

// =============================================================================
// SupportLinkStore 类
// =============================================================================

export interface SupportLinkStoreStats {
  total: number;
  byPolarity: Record<string, number>;
}

export class SupportLinkStore {
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
      CREATE TABLE IF NOT EXISTS support_links (
        id                    TEXT PRIMARY KEY,
        observation_record_id TEXT NOT NULL,
        claim_id              TEXT NOT NULL,
        polarity              TEXT NOT NULL,
        created_at            TEXT NOT NULL,
        data                  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sl_obs_record ON support_links (observation_record_id);
      CREATE INDEX IF NOT EXISTS idx_sl_claim      ON support_links (claim_id);
      CREATE INDEX IF NOT EXISTS idx_sl_polarity   ON support_links (polarity);
    `);
  }

  /** 保存或替换 */
  save(link: SupportLink): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO support_links
        (id, observation_record_id, claim_id, polarity, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      link.id,
      link.observationRecordId,
      link.claimId,
      link.polarity,
      link.createdAt,
      JSON.stringify(link)
    );
  }

  /** 按 ID 查找 */
  get(id: string): SupportLink | null {
    const row = this.db.prepare(
      'SELECT * FROM support_links WHERE id = ?'
    ).get(id) as SupportLinkRow | undefined;
    return row ? rowToLink(row) : null;
  }

  /** 列举某 ObservationRecord 的所有 SupportLink（按创建时间升序） */
  listByObservationRecord(observationRecordId: string): SupportLink[] {
    const rows = this.db.prepare(
      'SELECT * FROM support_links WHERE observation_record_id = ? ORDER BY created_at'
    ).all(observationRecordId) as SupportLinkRow[];
    return rows.map(rowToLink);
  }

  /** 列举某 Claim 的所有 SupportLink（按创建时间升序） */
  listByClaim(claimId: string): SupportLink[] {
    const rows = this.db.prepare(
      'SELECT * FROM support_links WHERE claim_id = ? ORDER BY created_at'
    ).all(claimId) as SupportLinkRow[];
    return rows.map(rowToLink);
  }

  getStats(): SupportLinkStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM support_links').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT polarity, COUNT(*) as count FROM support_links GROUP BY polarity'
    ).all() as Array<{ polarity: string; count: number }>;
    const byPolarity: Record<string, number> = {};
    for (const row of rows) byPolarity[row.polarity] = row.count;
    return { total, byPolarity };
  }

  close(): void {
    this.db.close();
  }
}
