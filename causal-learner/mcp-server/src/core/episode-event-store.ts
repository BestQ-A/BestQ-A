/**
 * EpisodeEventStore — Episode 轻量 timeline 持久化层
 * 实现缺口二：event log，不做 StateSnapshot / TransitionStore
 *
 * 设计原则：
 * - append-only，每条事件带 seq 保证顺序
 * - JSON blob 存整对象，indexed 列（episode_id, kind）供快速查询
 * - 所有高层对象（Reconstruction/OntologyDelta 等）通过 ref_id 回指事件
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// EpisodeEvent 接口
// =============================================================================

export type EpisodeEventKind =
  | 'observation_recorded'
  | 'hypothesis_created'
  | 'hypothesis_validated'
  | 'compile_applied'
  | 'compile_blocked'
  | 'mechanism_instance_created'
  | 'mechanism_instance_accepted'
  | 'mechanism_instance_rejected'
  | 'reconstruction_written'
  | 'ontology_delta_written'
  | 'outcome_recorded'
  | 'failure_boundary_recorded';

export interface EpisodeEvent {
  id: string;
  episode_id: string;
  /** 同一 Episode 内单调递增序号（从 1 开始） */
  seq: number;
  kind: EpisodeEventKind;
  /** 关联对象 ID（如 hypothesis.id / reconstruction.id 等） */
  ref_id?: string;
  /** 轻量 payload，仅记录关键字段，不含完整对象 */
  payload: Record<string, unknown>;
  created_at: string;
}

// =============================================================================
// 工厂函数
// =============================================================================

export function createEpisodeEvent(input: {
  episode_id: string;
  seq: number;
  kind: EpisodeEventKind;
  ref_id?: string;
  payload?: Record<string, unknown>;
}): EpisodeEvent {
  return {
    id: `EE_${input.episode_id}_${input.seq}_${crypto.randomBytes(3).toString('hex')}`,
    episode_id: input.episode_id,
    seq: input.seq,
    kind: input.kind,
    ref_id: input.ref_id,
    payload: input.payload ?? {},
    created_at: new Date().toISOString(),
  };
}

// =============================================================================
// 内部行结构
// =============================================================================

interface EpisodeEventRow {
  id: string;
  episode_id: string;
  seq: number;
  kind: string;
  ref_id: string | null;
  created_at: string;
  data: string; // JSON blob
}

function rowToEvent(row: EpisodeEventRow): EpisodeEvent {
  return JSON.parse(row.data) as EpisodeEvent;
}

// =============================================================================
// EpisodeEventStore 类
// =============================================================================

export interface EpisodeEventStoreStats {
  total: number;
  byKind: Record<string, number>;
}

export class EpisodeEventStore {
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
      CREATE TABLE IF NOT EXISTS episode_events (
        id          TEXT PRIMARY KEY,
        episode_id  TEXT NOT NULL,
        seq         INTEGER NOT NULL,
        kind        TEXT NOT NULL,
        ref_id      TEXT,
        created_at  TEXT NOT NULL,
        data        TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ee_episode     ON episode_events (episode_id);
      CREATE INDEX IF NOT EXISTS idx_ee_episode_seq ON episode_events (episode_id, seq);
      CREATE INDEX IF NOT EXISTS idx_ee_kind        ON episode_events (kind);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ee_uniq_seq ON episode_events (episode_id, seq);
    `);
  }

  /** 追加一条事件（append-only，重复 seq 静默忽略） */
  append(event: EpisodeEvent): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO episode_events
        (id, episode_id, seq, kind, ref_id, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.episode_id,
      event.seq,
      event.kind,
      event.ref_id ?? null,
      event.created_at,
      JSON.stringify(event)
    );
  }

  /** 返回某 Episode 下一个 seq（当前最大 + 1，或 1） */
  nextSeq(episodeId: string): number {
    const row = this.db.prepare(
      'SELECT MAX(seq) as max_seq FROM episode_events WHERE episode_id = ?'
    ).get(episodeId) as { max_seq: number | null };
    return (row.max_seq ?? 0) + 1;
  }

  /** 按 ID 查找单条事件 */
  get(id: string): EpisodeEvent | null {
    const row = this.db.prepare(
      'SELECT * FROM episode_events WHERE id = ?'
    ).get(id) as EpisodeEventRow | undefined;
    return row ? rowToEvent(row) : null;
  }

  /** 列举某 Episode 的所有事件（按 seq 升序） */
  getByEpisode(episodeId: string): EpisodeEvent[] {
    const rows = this.db.prepare(
      'SELECT * FROM episode_events WHERE episode_id = ? ORDER BY seq'
    ).all(episodeId) as EpisodeEventRow[];
    return rows.map(rowToEvent);
  }

  /** 列举某 Episode 特定类型的事件（按 seq 升序） */
  getByEpisodeAndKind(episodeId: string, kind: EpisodeEventKind): EpisodeEvent[] {
    const rows = this.db.prepare(
      'SELECT * FROM episode_events WHERE episode_id = ? AND kind = ? ORDER BY seq'
    ).all(episodeId, kind) as EpisodeEventRow[];
    return rows.map(rowToEvent);
  }

  getStats(): EpisodeEventStoreStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM episode_events').get() as { count: number }
    ).count;
    const rows = this.db.prepare(
      'SELECT kind, COUNT(*) as count FROM episode_events GROUP BY kind'
    ).all() as Array<{ kind: string; count: number }>;
    const byKind: Record<string, number> = {};
    for (const row of rows) byKind[row.kind] = row.count;
    return { total, byKind };
  }

  close(): void {
    this.db.close();
  }
}
