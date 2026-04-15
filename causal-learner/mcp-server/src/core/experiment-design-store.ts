/**
 * ExperimentDesignStore — SQLite 持久化层
 * implements: docs/current/experiment-design-contract.md §7（第一轮实现建议）
 *
 * 设计原则：JSON blob 存整对象，indexed 列（base_episode_id / status）供快速查询
 * listByCounterfactual() 第一轮做内存过滤（过渡态），待后续加专用索引。
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ExperimentDesign } from './experiment-design.js';

// =============================================================================
// 内部行结构
// =============================================================================

interface ExperimentDesignRow {
  id: string;
  base_episode_id: string;
  status: string;
  created_at: string;
  data: string; // JSON blob
}

function rowToDesign(row: ExperimentDesignRow): ExperimentDesign {
  return JSON.parse(row.data) as ExperimentDesign;
}

// =============================================================================
// ExperimentDesignStore 类
// =============================================================================

export interface ExperimentDesignStoreStats {
  total: number;
  byStatus: Record<string, number>;
}

export class ExperimentDesignStore {
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
      CREATE TABLE IF NOT EXISTS experiment_designs (
        id               TEXT PRIMARY KEY,
        base_episode_id  TEXT NOT NULL,
        status           TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        data             TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ed_episode ON experiment_designs (base_episode_id);
      CREATE INDEX IF NOT EXISTS idx_ed_status  ON experiment_designs (status);
    `);
  }

  /** 保存或替换 */
  save(design: ExperimentDesign): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO experiment_designs
        (id, base_episode_id, status, created_at, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      design.id,
      design.baseEpisodeId,
      design.status,
      design.createdAt,
      JSON.stringify(design)
    );
  }

  /** 按 ID 查找 */
  get(id: string): ExperimentDesign | null {
    const row = this.db.prepare(
      'SELECT * FROM experiment_designs WHERE id = ?'
    ).get(id) as ExperimentDesignRow | undefined;
    return row ? rowToDesign(row) : null;
  }

  /** 列举某 Episode 的所有实验设计 */
  listByEpisode(baseEpisodeId: string): ExperimentDesign[] {
    const rows = this.db.prepare(
      'SELECT * FROM experiment_designs WHERE base_episode_id = ? ORDER BY created_at'
    ).all(baseEpisodeId) as ExperimentDesignRow[];
    return rows.map(rowToDesign);
  }

  /**
   * 列举引用了某 CounterfactualScenario 的所有设计
   * 过渡态：内存过滤（basedOnCounterfactualIds 在 JSON blob 中），待后续加专用索引
   */
  listByCounterfactual(counterfactualId: string): ExperimentDesign[] {
    const rows = this.db.prepare(
      'SELECT * FROM experiment_designs ORDER BY created_at'
    ).all() as ExperimentDesignRow[];
    return rows.map(rowToDesign).filter(d => d.basedOnCounterfactualIds.includes(counterfactualId));
  }

  /** 全量列举（最多 limit 条，按创建时间升序） */
  listAll(limit = 100): ExperimentDesign[] {
    const rows = this.db.prepare(
      'SELECT * FROM experiment_designs ORDER BY created_at LIMIT ?'
    ).all(limit) as ExperimentDesignRow[];
    return rows.map(rowToDesign);
  }

  getStats(): ExperimentDesignStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM experiment_designs').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM experiment_designs GROUP BY status'
    ).all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = row.count;
    return { total, byStatus };
  }

  close(): void {
    this.db.close();
  }
}
