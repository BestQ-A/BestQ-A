/**
 * OntologyModelStore — SQLite 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { OntologyModel } from './ontology-model.js';

interface OntologyModelRow {
  id: string;
  name: string;
  version: string;
  is_canonical: number;
  status: string;
  created_at: string;
  data: string;
}

function rowToModel(row: OntologyModelRow): OntologyModel {
  return JSON.parse(row.data) as OntologyModel;
}

export class OntologyModelStore {
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
      CREATE TABLE IF NOT EXISTS ontology_models (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        version      TEXT NOT NULL,
        is_canonical INTEGER NOT NULL DEFAULT 0,
        status       TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        data         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_om_status ON ontology_models (status);
      CREATE INDEX IF NOT EXISTS idx_om_name   ON ontology_models (name);
    `);
  }

  save(model: OntologyModel): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO ontology_models
        (id, name, version, is_canonical, status, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      model.id,
      model.name,
      model.version,
      model.isCanonical ? 1 : 0,
      model.status,
      model.createdAt,
      JSON.stringify(model)
    );
  }

  get(id: string): OntologyModel | null {
    const row = this.db.prepare(
      'SELECT * FROM ontology_models WHERE id = ?'
    ).get(id) as OntologyModelRow | undefined;
    return row ? rowToModel(row) : null;
  }

  listAll(limit = 100): OntologyModel[] {
    const rows = this.db.prepare(
      'SELECT * FROM ontology_models ORDER BY created_at LIMIT ?'
    ).all(limit) as OntologyModelRow[];
    return rows.map(rowToModel);
  }

  listCanonical(): OntologyModel[] {
    const rows = this.db.prepare(
      'SELECT * FROM ontology_models WHERE is_canonical = 1 ORDER BY created_at'
    ).all() as OntologyModelRow[];
    return rows.map(rowToModel);
  }

  close(): void {
    this.db.close();
  }
}
