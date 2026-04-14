/**
 * MechanismProgramStore — SQLite 持久化层
 * implements: docs/current/mechanism-program-contract.md §7（第一轮实现建议）
 *
 * 设计原则：
 * - JSON blob 存整对象，indexed 列（mechanism_class_ref / status）供快速查询
 * - 第一轮先解决"MechanismProgram 可落盘 + MechanismInstance 可通过 id 回指"
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { MechanismProgram } from './mechanism-program.js';

// =============================================================================
// 内部行结构
// =============================================================================

interface MechanismProgramRow {
  id: string;
  mechanism_class_ref: string;
  status: string;
  created_at: string;
  data: string; // JSON blob
}

function rowToProgram(row: MechanismProgramRow): MechanismProgram {
  return JSON.parse(row.data) as MechanismProgram;
}

// =============================================================================
// MechanismProgramStore 类
// =============================================================================

export interface MechanismProgramStoreStats {
  total: number;
  byStatus: Record<string, number>;
}

export class MechanismProgramStore {
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
      CREATE TABLE IF NOT EXISTS mechanism_programs (
        id                   TEXT PRIMARY KEY,
        mechanism_class_ref  TEXT NOT NULL,
        status               TEXT NOT NULL,
        created_at           TEXT NOT NULL,
        data                 TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mp_class_ref ON mechanism_programs (mechanism_class_ref);
      CREATE INDEX IF NOT EXISTS idx_mp_status    ON mechanism_programs (status);
    `);
  }

  /** 保存或替换 */
  save(program: MechanismProgram): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO mechanism_programs
        (id, mechanism_class_ref, status, created_at, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      program.id,
      program.mechanismClassRef,
      program.status,
      program.createdAt,
      JSON.stringify(program)
    );
  }

  /** 按 ID 查找 */
  get(id: string): MechanismProgram | null {
    const row = this.db.prepare(
      'SELECT * FROM mechanism_programs WHERE id = ?'
    ).get(id) as MechanismProgramRow | undefined;
    return row ? rowToProgram(row) : null;
  }

  /** 列举所有（按创建时间升序，可选 limit） */
  listAll(limit = 100): MechanismProgram[] {
    const rows = this.db.prepare(
      'SELECT * FROM mechanism_programs ORDER BY created_at LIMIT ?'
    ).all(limit) as MechanismProgramRow[];
    return rows.map(rowToProgram);
  }

  /** 列举某 MechanismClass 对应的所有程序 */
  listByMechanismClassRef(ref: string): MechanismProgram[] {
    const rows = this.db.prepare(
      'SELECT * FROM mechanism_programs WHERE mechanism_class_ref = ? ORDER BY created_at'
    ).all(ref) as MechanismProgramRow[];
    return rows.map(rowToProgram);
  }

  getStats(): MechanismProgramStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM mechanism_programs').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM mechanism_programs GROUP BY status'
    ).all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = row.count;
    return { total, byStatus };
  }

  close(): void {
    this.db.close();
  }
}
