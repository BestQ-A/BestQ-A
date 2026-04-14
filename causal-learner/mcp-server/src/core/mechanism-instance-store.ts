/**
 * MechanismInstanceStore — SQLite 持久化层
 * implements: mechanism-instance-contract.md §7（落盘格式）
 *
 * 设计原则：
 * - JSON blob 存整对象，indexed 列（episode_id / mechanism_class_ref / status）供快速查询
 * - 第一轮不做复杂索引，先解决"reconstruction 引用的 instance 能被找回"
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { MechanismInstance } from './mechanism-instance.js';

// =============================================================================
// 内部行结构
// =============================================================================

interface MechanismInstanceRow {
  id: string;
  episode_id: string;
  mechanism_class_ref: string;
  status: string;
  created_at: string;
  data: string; // JSON blob
}

function rowToInstance(row: MechanismInstanceRow): MechanismInstance {
  return JSON.parse(row.data) as MechanismInstance;
}

// =============================================================================
// MechanismInstanceStore 类
// =============================================================================

export interface MechanismInstanceStoreStats {
  total: number;
  byStatus: Record<string, number>;
}

export class MechanismInstanceStore {
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
      CREATE TABLE IF NOT EXISTS mechanism_instances (
        id                   TEXT PRIMARY KEY,
        episode_id           TEXT NOT NULL,
        mechanism_class_ref  TEXT NOT NULL,
        status               TEXT NOT NULL,
        created_at           TEXT NOT NULL,
        data                 TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mi_episode   ON mechanism_instances (episode_id);
      CREATE INDEX IF NOT EXISTS idx_mi_class_ref ON mechanism_instances (mechanism_class_ref);
      CREATE INDEX IF NOT EXISTS idx_mi_status    ON mechanism_instances (status);
    `);
  }

  /** 保存或替换（状态流转后重新 save 即可） */
  save(instance: MechanismInstance): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO mechanism_instances
        (id, episode_id, mechanism_class_ref, status, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      instance.id,
      instance.episode_id,
      instance.mechanism_class_ref,
      instance.status,
      instance.created_at,
      JSON.stringify(instance)
    );
  }

  /** 按 ID 查找 */
  get(id: string): MechanismInstance | null {
    const row = this.db.prepare(
      'SELECT * FROM mechanism_instances WHERE id = ?'
    ).get(id) as MechanismInstanceRow | undefined;
    return row ? rowToInstance(row) : null;
  }

  /** 列举某 Episode 下的所有实例（按创建时间升序） */
  listByEpisode(episodeId: string): MechanismInstance[] {
    const rows = this.db.prepare(
      'SELECT * FROM mechanism_instances WHERE episode_id = ? ORDER BY created_at'
    ).all(episodeId) as MechanismInstanceRow[];
    return rows.map(rowToInstance);
  }

  /** 列举使用某 MechanismClass 引用的所有实例 */
  listByMechanismClassRef(ref: string): MechanismInstance[] {
    const rows = this.db.prepare(
      'SELECT * FROM mechanism_instances WHERE mechanism_class_ref = ? ORDER BY created_at'
    ).all(ref) as MechanismInstanceRow[];
    return rows.map(rowToInstance);
  }

  /** 列举某 Episode 下状态为 accepted 的实例（供 Reconstruction bridge 查询） */
  listAcceptedByEpisode(episodeId: string): MechanismInstance[] {
    const rows = this.db.prepare(
      "SELECT * FROM mechanism_instances WHERE episode_id = ? AND status = 'accepted' ORDER BY created_at"
    ).all(episodeId) as MechanismInstanceRow[];
    return rows.map(rowToInstance);
  }

  getStats(): MechanismInstanceStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM mechanism_instances').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM mechanism_instances GROUP BY status'
    ).all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = row.count;
    return { total, byStatus };
  }

  close(): void {
    this.db.close();
  }
}
