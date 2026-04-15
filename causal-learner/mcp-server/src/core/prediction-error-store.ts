/**
 * PredictionErrorStore — SQLite 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { PredictionError } from './types.js';
import { assertValidPredictionError } from './prediction-error.js';

interface PredictionErrorRow {
  id: string;
  outcome_record_id: string;
  caused_by_action_execution_id: string;
  based_on_counterfactual_id: string | null;
  error_kind: string;
  severity: string;
  recorded_at: string;
  data: string;
}

function rowToPredictionError(row: PredictionErrorRow): PredictionError {
  return JSON.parse(row.data) as PredictionError;
}

export interface PredictionErrorStoreStats {
  total: number;
  byErrorKind: Record<string, number>;
  bySeverity: Record<string, number>;
}

export class PredictionErrorStore {
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
      CREATE TABLE IF NOT EXISTS prediction_errors (
        id                              TEXT PRIMARY KEY,
        outcome_record_id               TEXT NOT NULL,
        caused_by_action_execution_id   TEXT NOT NULL,
        based_on_counterfactual_id      TEXT,
        error_kind                      TEXT NOT NULL,
        severity                        TEXT NOT NULL,
        recorded_at                     TEXT NOT NULL,
        data                            TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pe_outcome ON prediction_errors (outcome_record_id);
      CREATE INDEX IF NOT EXISTS idx_pe_action  ON prediction_errors (caused_by_action_execution_id);
      CREATE INDEX IF NOT EXISTS idx_pe_cf      ON prediction_errors (based_on_counterfactual_id);
    `);
  }

  save(pe: PredictionError): void {
    assertValidPredictionError(pe);
    this.db.prepare(`
      INSERT OR REPLACE INTO prediction_errors
        (id, outcome_record_id, caused_by_action_execution_id, based_on_counterfactual_id,
         error_kind, severity, recorded_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pe.id,
      pe.outcomeRecordId,
      pe.causedByActionExecutionId,
      pe.basedOnCounterfactualId ?? null,
      pe.errorKind,
      pe.severity,
      pe.recordedAt,
      JSON.stringify(pe)
    );
  }

  get(id: string): PredictionError | null {
    const row = this.db.prepare(
      'SELECT * FROM prediction_errors WHERE id = ?'
    ).get(id) as PredictionErrorRow | undefined;
    return row ? rowToPredictionError(row) : null;
  }

  listByOutcomeRecord(outcomeRecordId: string): PredictionError[] {
    const rows = this.db.prepare(
      'SELECT * FROM prediction_errors WHERE outcome_record_id = ? ORDER BY recorded_at'
    ).all(outcomeRecordId) as PredictionErrorRow[];
    return rows.map(rowToPredictionError);
  }

  listByActionExecution(actionExecutionId: string): PredictionError[] {
    const rows = this.db.prepare(
      'SELECT * FROM prediction_errors WHERE caused_by_action_execution_id = ? ORDER BY recorded_at'
    ).all(actionExecutionId) as PredictionErrorRow[];
    return rows.map(rowToPredictionError);
  }

  getStats(): PredictionErrorStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM prediction_errors').get() as { count: number }
    ).count;
    const kindRows = this.db.prepare(
      'SELECT error_kind, COUNT(*) as count FROM prediction_errors GROUP BY error_kind'
    ).all() as Array<{ error_kind: string; count: number }>;
    const sevRows = this.db.prepare(
      'SELECT severity, COUNT(*) as count FROM prediction_errors GROUP BY severity'
    ).all() as Array<{ severity: string; count: number }>;
    const byErrorKind: Record<string, number> = {};
    for (const r of kindRows) byErrorKind[r.error_kind] = r.count;
    const bySeverity: Record<string, number> = {};
    for (const r of sevRows) bySeverity[r.severity] = r.count;
    return { total, byErrorKind, bySeverity };
  }

  close(): void {
    this.db.close();
  }
}
