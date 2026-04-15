/**
 * FailureBoundaryArchiveStore — SQLite 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { FailureBoundaryArchive } from './failure-boundary-archive.js';

interface ArchiveRow {
  id: string;
  name: string;
  record_count: number;
  status: string;
  created_at: string;
  data: string;
}

function rowToArchive(row: ArchiveRow): FailureBoundaryArchive {
  return JSON.parse(row.data) as FailureBoundaryArchive;
}

export class FailureBoundaryArchiveStore {
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
      CREATE TABLE IF NOT EXISTS failure_boundary_archives (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        record_count INTEGER NOT NULL DEFAULT 0,
        status       TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        data         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fba_status ON failure_boundary_archives (status);
    `);
  }

  save(archive: FailureBoundaryArchive): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO failure_boundary_archives
        (id, name, record_count, status, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      archive.id,
      archive.name,
      archive.records.length,
      archive.status,
      archive.createdAt,
      JSON.stringify(archive)
    );
  }

  get(id: string): FailureBoundaryArchive | null {
    const row = this.db.prepare(
      'SELECT * FROM failure_boundary_archives WHERE id = ?'
    ).get(id) as ArchiveRow | undefined;
    return row ? rowToArchive(row) : null;
  }

  listAll(limit = 100): FailureBoundaryArchive[] {
    const rows = this.db.prepare(
      'SELECT * FROM failure_boundary_archives ORDER BY created_at LIMIT ?'
    ).all(limit) as ArchiveRow[];
    return rows.map(rowToArchive);
  }

  close(): void {
    this.db.close();
  }
}
