/**
 * ValidityEnvelopeStore — SQLite 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ValidityEnvelope } from './validity-envelope.js';
import { assertValidValidityEnvelope } from './validity-envelope.js';

interface ValidityEnvelopeRow {
  id: string;
  mechanism_program_ref: string;
  confidence_band: string;
  status: string;
  created_at: string;
  data: string;
}

function rowToVE(row: ValidityEnvelopeRow): ValidityEnvelope {
  return JSON.parse(row.data) as ValidityEnvelope;
}

export interface ValidityEnvelopeStoreStats {
  total: number;
  byConfidenceBand: Record<string, number>;
  byStatus: Record<string, number>;
}

export class ValidityEnvelopeStore {
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
      CREATE TABLE IF NOT EXISTS validity_envelopes (
        id                    TEXT PRIMARY KEY,
        mechanism_program_ref TEXT NOT NULL,
        confidence_band       TEXT NOT NULL,
        status                TEXT NOT NULL,
        created_at            TEXT NOT NULL,
        data                  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ve_mp ON validity_envelopes (mechanism_program_ref);
    `);
  }

  save(ve: ValidityEnvelope): void {
    assertValidValidityEnvelope(ve);
    this.db.prepare(`
      INSERT OR REPLACE INTO validity_envelopes
        (id, mechanism_program_ref, confidence_band, status, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      ve.id,
      ve.mechanismProgramRef,
      ve.confidenceBand,
      ve.status,
      ve.createdAt,
      JSON.stringify(ve)
    );
  }

  get(id: string): ValidityEnvelope | null {
    const row = this.db.prepare(
      'SELECT * FROM validity_envelopes WHERE id = ?'
    ).get(id) as ValidityEnvelopeRow | undefined;
    return row ? rowToVE(row) : null;
  }

  listByMechanismProgram(mechanismProgramRef: string): ValidityEnvelope[] {
    const rows = this.db.prepare(
      'SELECT * FROM validity_envelopes WHERE mechanism_program_ref = ? ORDER BY created_at'
    ).all(mechanismProgramRef) as ValidityEnvelopeRow[];
    return rows.map(rowToVE);
  }

  getStats(): ValidityEnvelopeStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM validity_envelopes').get() as { count: number }
    ).count;
    const bandRows = this.db.prepare(
      'SELECT confidence_band, COUNT(*) as count FROM validity_envelopes GROUP BY confidence_band'
    ).all() as Array<{ confidence_band: string; count: number }>;
    const statusRows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM validity_envelopes GROUP BY status'
    ).all() as Array<{ status: string; count: number }>;
    const byConfidenceBand: Record<string, number> = {};
    for (const r of bandRows) byConfidenceBand[r.confidence_band] = r.count;
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.status] = r.count;
    return { total, byConfidenceBand, byStatus };
  }

  close(): void {
    this.db.close();
  }
}
