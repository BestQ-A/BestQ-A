/**
 * OutcomeRecordStore — SQLite 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { OutcomeRecord } from './types.js';
import { assertValidOutcomeRecord } from './outcome-record.js';

interface OutcomeRecordRow {
  id: string;
  episode_id: string;
  caused_by_action_execution_id: string | null;
  status: string;
  recorded_at: string;
  data: string;
}

function rowToOutcomeRecord(row: OutcomeRecordRow): OutcomeRecord {
  return JSON.parse(row.data) as OutcomeRecord;
}

export interface OutcomeRecordStoreStats {
  total: number;
  byStatus: Record<string, number>;
}

export class OutcomeRecordStore {
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
      CREATE TABLE IF NOT EXISTS outcome_records (
        id                              TEXT PRIMARY KEY,
        episode_id                      TEXT NOT NULL,
        caused_by_action_execution_id   TEXT,
        status                          TEXT NOT NULL,
        recorded_at                     TEXT NOT NULL,
        data                            TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orc_episode ON outcome_records (episode_id);
      CREATE INDEX IF NOT EXISTS idx_orc_action  ON outcome_records (caused_by_action_execution_id);
      CREATE INDEX IF NOT EXISTS idx_orc_status  ON outcome_records (status);
    `);
  }

  save(record: OutcomeRecord): void {
    assertValidOutcomeRecord(record);

    this.db.prepare(`
      INSERT OR REPLACE INTO outcome_records
        (id, episode_id, caused_by_action_execution_id, status, recorded_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.episodeId,
      record.causedByActionExecutionId ?? null,
      record.status,
      record.recordedAt,
      JSON.stringify(record)
    );
  }

  get(id: string): OutcomeRecord | null {
    const row = this.db.prepare(
      'SELECT * FROM outcome_records WHERE id = ?'
    ).get(id) as OutcomeRecordRow | undefined;
    return row ? rowToOutcomeRecord(row) : null;
  }

  listByEpisode(episodeId: string): OutcomeRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM outcome_records WHERE episode_id = ? ORDER BY recorded_at'
    ).all(episodeId) as OutcomeRecordRow[];
    return rows.map(rowToOutcomeRecord);
  }

  listByActionExecution(actionExecutionId: string): OutcomeRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM outcome_records WHERE caused_by_action_execution_id = ? ORDER BY recorded_at'
    ).all(actionExecutionId) as OutcomeRecordRow[];
    return rows.map(rowToOutcomeRecord);
  }

  getStats(): OutcomeRecordStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM outcome_records').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM outcome_records GROUP BY status'
    ).all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = row.count;
    return { total, byStatus };
  }

  close(): void {
    this.db.close();
  }
}
