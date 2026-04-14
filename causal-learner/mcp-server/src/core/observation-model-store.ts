/**
 * ObservationModelStore — SQLite 持久化层
 * implements: docs/current/observation-model-contract.md §9（第一轮实现建议）
 *
 * 设计原则：
 * - JSON blob 存整对象，indexed 列（status / created_at）供快速查询
 * - 第一轮先解决"ObservationModel 可落盘 + ObservationRecord 可通过 id 回溯"
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ObservationModel } from './observation-model.js';

// =============================================================================
// 内部行结构
// =============================================================================

interface ObservationModelRow {
  id: string;
  status: string;
  created_at: string;
  data: string; // JSON blob
}

function rowToModel(row: ObservationModelRow): ObservationModel {
  return JSON.parse(row.data) as ObservationModel;
}

// =============================================================================
// ObservationModelStore 类
// =============================================================================

export interface ObservationModelStoreStats {
  total: number;
  byStatus: Record<string, number>;
}

export class ObservationModelStore {
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
      CREATE TABLE IF NOT EXISTS observation_models (
        id         TEXT PRIMARY KEY,
        status     TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_om_status     ON observation_models (status);
      CREATE INDEX IF NOT EXISTS idx_om_created_at ON observation_models (created_at);
    `);
  }

  /** 保存或替换 */
  save(model: ObservationModel): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO observation_models (id, status, created_at, data)
      VALUES (?, ?, ?, ?)
    `).run(
      model.id,
      model.status,
      model.createdAt,
      JSON.stringify(model)
    );
  }

  /** 按 ID 查找 */
  get(id: string): ObservationModel | null {
    const row = this.db.prepare(
      'SELECT * FROM observation_models WHERE id = ?'
    ).get(id) as ObservationModelRow | undefined;
    return row ? rowToModel(row) : null;
  }

  /** 列举所有（按创建时间升序，可选 limit） */
  listAll(limit = 100): ObservationModel[] {
    const rows = this.db.prepare(
      'SELECT * FROM observation_models ORDER BY created_at LIMIT ?'
    ).all(limit) as ObservationModelRow[];
    return rows.map(rowToModel);
  }

  getStats(): ObservationModelStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM observation_models').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM observation_models GROUP BY status'
    ).all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = row.count;
    return { total, byStatus };
  }

  close(): void {
    this.db.close();
  }
}
