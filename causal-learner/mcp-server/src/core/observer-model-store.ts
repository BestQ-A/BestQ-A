/**
 * ObserverModelStore — SQLite 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ObserverModel } from './observer-model.js';

interface ObserverModelRow {
  id: string;
  name: string;
  position: string;
  status: string;
  created_at: string;
  data: string;
}

function rowToModel(row: ObserverModelRow): ObserverModel {
  return JSON.parse(row.data) as ObserverModel;
}

export class ObserverModelStore {
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
      CREATE TABLE IF NOT EXISTS observer_models (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        position   TEXT NOT NULL,
        status     TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_obs_status ON observer_models (status);
    `);
  }

  save(model: ObserverModel): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO observer_models
        (id, name, position, status, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      model.id,
      model.name,
      model.position,
      model.status,
      model.createdAt,
      JSON.stringify(model)
    );
  }

  get(id: string): ObserverModel | null {
    const row = this.db.prepare(
      'SELECT * FROM observer_models WHERE id = ?'
    ).get(id) as ObserverModelRow | undefined;
    return row ? rowToModel(row) : null;
  }

  listAll(limit = 100): ObserverModel[] {
    const rows = this.db.prepare(
      'SELECT * FROM observer_models ORDER BY created_at LIMIT ?'
    ).all(limit) as ObserverModelRow[];
    return rows.map(rowToModel);
  }

  close(): void {
    this.db.close();
  }
}
