/**
 * ConflictSetStore — SQLite 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ConflictSet } from './conflict-set.js';

interface ConflictSetRow {
  id: string;
  name: string;
  translation_functor_id: string;
  entry_count: number;
  status: string;
  created_at: string;
  data: string;
}

function rowToConflictSet(row: ConflictSetRow): ConflictSet {
  return JSON.parse(row.data) as ConflictSet;
}

export class ConflictSetStore {
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
      CREATE TABLE IF NOT EXISTS conflict_sets (
        id                      TEXT PRIMARY KEY,
        name                    TEXT NOT NULL,
        translation_functor_id  TEXT NOT NULL,
        entry_count             INTEGER NOT NULL DEFAULT 0,
        status                  TEXT NOT NULL,
        created_at              TEXT NOT NULL,
        data                    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cs_functor ON conflict_sets (translation_functor_id);
      CREATE INDEX IF NOT EXISTS idx_cs_status  ON conflict_sets (status);
    `);
  }

  save(conflictSet: ConflictSet): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO conflict_sets
        (id, name, translation_functor_id, entry_count, status, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      conflictSet.id,
      conflictSet.name,
      conflictSet.translationFunctorId,
      conflictSet.entries.length,
      conflictSet.status,
      conflictSet.createdAt,
      JSON.stringify(conflictSet)
    );
  }

  get(id: string): ConflictSet | null {
    const row = this.db.prepare(
      'SELECT * FROM conflict_sets WHERE id = ?'
    ).get(id) as ConflictSetRow | undefined;
    return row ? rowToConflictSet(row) : null;
  }

  listByFunctor(functorId: string): ConflictSet[] {
    const rows = this.db.prepare(
      'SELECT * FROM conflict_sets WHERE translation_functor_id = ? ORDER BY created_at'
    ).all(functorId) as ConflictSetRow[];
    return rows.map(rowToConflictSet);
  }

  listAll(limit = 100): ConflictSet[] {
    const rows = this.db.prepare(
      'SELECT * FROM conflict_sets ORDER BY created_at LIMIT ?'
    ).all(limit) as ConflictSetRow[];
    return rows.map(rowToConflictSet);
  }

  close(): void {
    this.db.close();
  }
}
