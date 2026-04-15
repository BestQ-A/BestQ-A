/**
 * CounterfactualScenarioStore — SQLite 持久化层
 * implements: docs/current/counterfactual-scenario-contract.md §7（第一轮实现建议）
 *
 * 设计原则：JSON blob 存整对象，indexed 列（base_episode_id / status）供快速查询
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { CounterfactualScenario } from './counterfactual-scenario.js';

// =============================================================================
// 内部行结构
// =============================================================================

interface CounterfactualScenarioRow {
  id: string;
  base_episode_id: string;
  status: string;
  created_at: string;
  data: string; // JSON blob
}

function rowToScenario(row: CounterfactualScenarioRow): CounterfactualScenario {
  return JSON.parse(row.data) as CounterfactualScenario;
}

// =============================================================================
// CounterfactualScenarioStore 类
// =============================================================================

export interface CounterfactualScenarioStoreStats {
  total: number;
  byStatus: Record<string, number>;
}

export class CounterfactualScenarioStore {
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
      CREATE TABLE IF NOT EXISTS counterfactual_scenarios (
        id               TEXT PRIMARY KEY,
        base_episode_id  TEXT NOT NULL,
        status           TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        data             TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cs_episode ON counterfactual_scenarios (base_episode_id);
      CREATE INDEX IF NOT EXISTS idx_cs_status  ON counterfactual_scenarios (status);
    `);
  }

  /** 保存或替换 */
  save(scenario: CounterfactualScenario): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO counterfactual_scenarios
        (id, base_episode_id, status, created_at, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      scenario.id,
      scenario.baseEpisodeId,
      scenario.status,
      scenario.createdAt,
      JSON.stringify(scenario)
    );
  }

  /** 按 ID 查找 */
  get(id: string): CounterfactualScenario | null {
    const row = this.db.prepare(
      'SELECT * FROM counterfactual_scenarios WHERE id = ?'
    ).get(id) as CounterfactualScenarioRow | undefined;
    return row ? rowToScenario(row) : null;
  }

  /** 列举某 Episode 的所有反事实场景 */
  listByEpisode(baseEpisodeId: string): CounterfactualScenario[] {
    const rows = this.db.prepare(
      'SELECT * FROM counterfactual_scenarios WHERE base_episode_id = ? ORDER BY created_at'
    ).all(baseEpisodeId) as CounterfactualScenarioRow[];
    return rows.map(rowToScenario);
  }

  /** 列举引用了某 MechanismProgram 的所有场景（内存过滤，refs 在 JSON blob 中） */
  listByMechanismProgramRef(ref: string): CounterfactualScenario[] {
    const rows = this.db.prepare(
      'SELECT * FROM counterfactual_scenarios ORDER BY created_at'
    ).all() as CounterfactualScenarioRow[];
    return rows.map(rowToScenario).filter(s => s.mechanismProgramRefs.includes(ref));
  }

  /** 全量列举（最多 limit 条，按创建时间升序） */
  listAll(limit = 100): CounterfactualScenario[] {
    const rows = this.db.prepare(
      'SELECT * FROM counterfactual_scenarios ORDER BY created_at LIMIT ?'
    ).all(limit) as CounterfactualScenarioRow[];
    return rows.map(rowToScenario);
  }

  getStats(): CounterfactualScenarioStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM counterfactual_scenarios').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM counterfactual_scenarios GROUP BY status'
    ).all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = row.count;
    return { total, byStatus };
  }

  close(): void {
    this.db.close();
  }
}
