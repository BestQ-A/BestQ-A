/**
 * ActionExecutionStore — SQLite 持久化层
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ActionExecution } from './types.js';

interface ActionExecutionRow {
  id: string;
  based_on_experiment_design_id: string;
  source_episode_id: string;
  target_episode_id: string | null;
  execution_status: string;
  started_at: string;
  data: string;
}

function rowToExecution(row: ActionExecutionRow): ActionExecution {
  return JSON.parse(row.data) as ActionExecution;
}

export interface ActionExecutionStoreStats {
  total: number;
  byStatus: Record<string, number>;
}

export class ActionExecutionStore {
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
      CREATE TABLE IF NOT EXISTS action_executions (
        id                              TEXT PRIMARY KEY,
        based_on_experiment_design_id   TEXT NOT NULL,
        source_episode_id               TEXT NOT NULL,
        target_episode_id               TEXT,
        execution_status                TEXT NOT NULL,
        started_at                      TEXT NOT NULL,
        data                            TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ax_design  ON action_executions (based_on_experiment_design_id);
      CREATE INDEX IF NOT EXISTS idx_ax_source  ON action_executions (source_episode_id);
      CREATE INDEX IF NOT EXISTS idx_ax_target  ON action_executions (target_episode_id);
      CREATE INDEX IF NOT EXISTS idx_ax_status  ON action_executions (execution_status);
    `);
  }

  save(execution: ActionExecution): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO action_executions
        (id, based_on_experiment_design_id, source_episode_id, target_episode_id, execution_status, started_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      execution.id,
      execution.basedOnExperimentDesignId,
      execution.sourceEpisodeId,
      execution.targetEpisodeId ?? null,
      execution.executionStatus,
      execution.startedAt,
      JSON.stringify(execution)
    );
  }

  get(id: string): ActionExecution | null {
    const row = this.db.prepare(
      'SELECT * FROM action_executions WHERE id = ?'
    ).get(id) as ActionExecutionRow | undefined;
    return row ? rowToExecution(row) : null;
  }

  listByExperimentDesign(designId: string): ActionExecution[] {
    const rows = this.db.prepare(
      'SELECT * FROM action_executions WHERE based_on_experiment_design_id = ? ORDER BY started_at'
    ).all(designId) as ActionExecutionRow[];
    return rows.map(rowToExecution);
  }

  listBySourceEpisode(sourceEpisodeId: string): ActionExecution[] {
    const rows = this.db.prepare(
      'SELECT * FROM action_executions WHERE source_episode_id = ? ORDER BY started_at'
    ).all(sourceEpisodeId) as ActionExecutionRow[];
    return rows.map(rowToExecution);
  }

  listByTargetEpisode(targetEpisodeId: string): ActionExecution[] {
    const rows = this.db.prepare(
      'SELECT * FROM action_executions WHERE target_episode_id = ? ORDER BY started_at'
    ).all(targetEpisodeId) as ActionExecutionRow[];
    return rows.map(rowToExecution);
  }

  getStats(): ActionExecutionStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM action_executions').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT execution_status as status, COUNT(*) as count FROM action_executions GROUP BY execution_status'
    ).all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = row.count;
    return { total, byStatus };
  }

  close(): void {
    this.db.close();
  }
}
