/**
 * MechanismClassStore — SQLite 持久化层
 *
 * 设计原则：
 * - JSON blob 存整对象
 * - 第一轮只提供最小 save/get/listAll 查询能力
 * - 目标是让主链第一次能稳定引用真实 MC_* 身份
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { MechanismClass } from './mechanism-class.js';

interface MechanismClassRow {
  id: string;
  name: string;
  compilation_status: string;
  created_at: string;
  data: string;
}

function rowToMechanismClass(row: MechanismClassRow): MechanismClass {
  return JSON.parse(row.data) as MechanismClass;
}

export interface MechanismClassStoreStats {
  total: number;
  byStatus: Record<string, number>;
}

export class MechanismClassStore {
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
      CREATE TABLE IF NOT EXISTS mechanism_classes (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        compilation_status  TEXT NOT NULL,
        created_at          TEXT NOT NULL,
        data                TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mc_status ON mechanism_classes (compilation_status);
      CREATE INDEX IF NOT EXISTS idx_mc_name   ON mechanism_classes (name);
    `);
  }

  save(mechanismClass: MechanismClass): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO mechanism_classes
        (id, name, compilation_status, created_at, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      mechanismClass.id,
      mechanismClass.name,
      mechanismClass.compilation_status,
      mechanismClass.created_at,
      JSON.stringify(mechanismClass)
    );
  }

  get(id: string): MechanismClass | null {
    const row = this.db.prepare(
      'SELECT * FROM mechanism_classes WHERE id = ?'
    ).get(id) as MechanismClassRow | undefined;
    return row ? rowToMechanismClass(row) : null;
  }

  listAll(limit = 100): MechanismClass[] {
    const rows = this.db.prepare(
      'SELECT * FROM mechanism_classes ORDER BY created_at LIMIT ?'
    ).all(limit) as MechanismClassRow[];
    return rows.map(rowToMechanismClass);
  }

  getStats(): MechanismClassStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM mechanism_classes').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT compilation_status as status, COUNT(*) as count FROM mechanism_classes GROUP BY compilation_status'
    ).all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = row.count;
    return { total, byStatus };
  }

  close(): void {
    this.db.close();
  }
}
