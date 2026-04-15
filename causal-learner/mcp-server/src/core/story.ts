/**
 * Story/Case 模块 —— BestQ-A 元模型的学习样本层
 *
 * Story 是一次完整的"遇到问题 → 尝试解释 → 实际修复"的全过程记录。
 * 图（AtomGraph/Regulations）是知识，Story 是学习样本。两者分开，系统稳。
 *
 * compile 的输入不是抽象图操作，而是具体的案例（Story）。
 * 系统通过 getResolvedForCompile() 获取待归纳的成功案例，
 * 归纳完成后调用 markCompiled() 标记消费。
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ===========================================================================
// 核心接口
// ===========================================================================

/** 上下文作用域（结构化，非纯 JSON 字符串） */
export interface ContextScope {
  /** 环境标识，如 dev / prod / ci */
  env?: string;
  /** 技术栈列表，如 ["django", "postgresql", "linux"] */
  stack?: string[];
  /** 版本约束，如 "django>=4.0" */
  version?: string;
  /** 时间范围 */
  timeRange?: {
    from?: string; // ISO 时间戳
    to?: string;   // ISO 时间戳
  };
  /** 项目或租户标识 */
  project?: string;
  /** 自定义扩展字段 */
  custom?: Record<string, unknown>;
}

/** 路径结果（简化版，避免与 AtomGraph 产生循环依赖） */
export interface StoryPath {
  /** 路径经过的 Atom ID 列表（有序） */
  atomIds: string[];
  /** 路径总权重 */
  totalWeight: number;
}

/** Story 状态机 */
export type StoryStatus =
  | 'open'        // 刚创建，尚未开始分析
  | 'exploring'   // 正在收集候选路径
  | 'executing'   // 已选择路径，正在执行技能
  | 'resolved'    // 问题已解决
  | 'failed'      // 执行失败
  | 'abandoned';  // 主动放弃

/** Story / Case —— 一次完整的问题解决记录 */
export interface Story {
  /** 唯一 ID，格式 "story_xxxxxxxx" */
  id: string;

  // ---- 输入 ----
  /** 原始问题描述（自然语言或结构化文本） */
  rawInput: string;
  /** 问题分类 ID（可选，关联 AtomGraph 中的问题类节点） */
  problemClassId?: string;
  /** 上下文作用域 */
  context: ContextScope;

  // ---- 过程 ----
  /** 本次收集到的观测 Atom ID 列表 */
  observationAtomIds: string[];
  /** 系统生成的候选路径列表 */
  candidatePaths: StoryPath[];
  /** 最终选择的路径 */
  chosenPath?: StoryPath;
  /** 实际执行过的技能 ID 列表（按顺序） */
  executedSkillIds: string[];

  // ---- 结果 ----
  /** 当前状态 */
  status: StoryStatus;
  /** 最终结果 */
  outcome?: 'success' | 'partial' | 'failure';
  /** 结果说明（可选，记录关键细节或失败原因） */
  outcomeNotes?: string;

  // ---- 元数据 ----
  /** 操作者（人类用户名或 agent ID） */
  operator: string;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 解决时间 ISO 字符串（resolved/failed/abandoned 时设置） */
  resolvedAt?: string;
  /** 最后更新时间 ISO 字符串 */
  updatedAt: string;
}

/** Episode 兼容壳的初始条件 */
export interface InitialConditions {
  /** 参与观察回放的 Atom IDs */
  observationAtomIds: string[];
  /** 上下文快照 */
  context: ContextScope;
}

/** Episode（与 Story 的兼容包装层，v7 §3.2 + §10 条件 1/2） */
export interface Episode extends Story {
  /** Episode 标识（兼容层映射到 Story.id） */
  episodeId: string;
  /** Episode 初始条件 */
  initialConditions: InitialConditions;
  /** 当前采纳的 Reconstruction ID */
  acceptedReconstructionId?: string;
  /** 当前生效的 Ontology 更新记录 ID */
  ontologyDeltaId?: string;
  /** ObservationRecord IDs（显式绑定到本 Episode，满足 §10 条件 2） */
  observationRecordIds: string[];
  /** Transition IDs（timeline/transitions，满足 §10 条件 1） */
  transitionIds: string[];
  /** OutcomeRecord ID（一等结果对象，非裸 outcome 字段） */
  outcomeRecordId?: string;
  /** EpisodeEvent IDs（按 seq 顺序，构成轻量 timeline） */
  episodeEventIds: string[];
}

/** Story -> Episode 兼容转换 */
export function toEpisode(story: Story): Episode {
  return {
    ...story,
    episodeId: story.id,
    initialConditions: {
      observationAtomIds: [...story.observationAtomIds],
      context: { ...story.context },
    },
    // ObservationRecord / Transition / EpisodeEvent 由管道层在运行时填充；
    // 默认空数组表示"壳已就位，内容待写入"
    observationRecordIds: [],
    transitionIds: [],
    episodeEventIds: [],
  };
}

// ===========================================================================
// ContextScope 工具函数
// ===========================================================================

/**
 * 判断作用域 A 是否包含（兼容）作用域 B
 * 即：A 描述的环境范围 >= B 描述的环境范围
 */
export function scopeContains(a: ContextScope, b: ContextScope): boolean {
  // env：A 未设置视为通配，B 有值则 A 必须相同
  if (b.env !== undefined && a.env !== undefined && a.env !== b.env) {
    return false;
  }

  // stack：A 的栈必须包含 B 的全部栈项
  if (b.stack && b.stack.length > 0) {
    const aStack = new Set(a.stack ?? []);
    for (const item of b.stack) {
      if (!aStack.has(item)) return false;
    }
  }

  // version：简单字符串相等判断（更复杂的 semver 范围交集不在本模块范围内）
  if (b.version !== undefined && a.version !== undefined && a.version !== b.version) {
    return false;
  }

  // project：A 未设置视为通配
  if (b.project !== undefined && a.project !== undefined && a.project !== b.project) {
    return false;
  }

  // timeRange：A 的时间范围必须覆盖 B 的时间范围
  if (b.timeRange) {
    const aFrom = a.timeRange?.from;
    const aTo = a.timeRange?.to;
    const bFrom = b.timeRange.from;
    const bTo = b.timeRange.to;

    if (bFrom && aFrom && aFrom > bFrom) return false;
    if (bTo && aTo && aTo < bTo) return false;
  }

  return true;
}

/**
 * 判断两个作用域是否有交集
 * 任意一方未设置字段视为通配
 */
export function scopeOverlaps(a: ContextScope, b: ContextScope): boolean {
  // env：都有值时必须相同
  if (a.env !== undefined && b.env !== undefined && a.env !== b.env) {
    return false;
  }

  // stack：都有值时至少有一个公共项
  if (a.stack && a.stack.length > 0 && b.stack && b.stack.length > 0) {
    const aStack = new Set(a.stack);
    if (!b.stack.some(item => aStack.has(item))) return false;
  }

  // project：都有值时必须相同
  if (a.project !== undefined && b.project !== undefined && a.project !== b.project) {
    return false;
  }

  // timeRange：都有值时不能完全不重叠
  if (a.timeRange && b.timeRange) {
    const aFrom = a.timeRange.from ?? '';
    const aTo = a.timeRange.to ?? '9999';
    const bFrom = b.timeRange.from ?? '';
    const bTo = b.timeRange.to ?? '9999';

    if (aTo < bFrom || bTo < aFrom) return false;
  }

  return true;
}

/**
 * 合并两个作用域（取并集）
 * 对于单值字段，优先保留非空值；对于数组字段，取并集
 */
export function scopeMerge(a: ContextScope, b: ContextScope): ContextScope {
  const merged: ContextScope = {};

  // env：两者相同则保留，不同则清空（表示更宽泛）
  if (a.env === b.env) {
    merged.env = a.env;
  } else if (a.env === undefined) {
    merged.env = b.env;
  } else if (b.env === undefined) {
    merged.env = a.env;
  }
  // 两者不同且都有值：不设置 env（通配）

  // stack：取并集
  const stackSet = new Set([...(a.stack ?? []), ...(b.stack ?? [])]);
  if (stackSet.size > 0) {
    merged.stack = Array.from(stackSet);
  }

  // version：相同则保留，不同则不设置
  if (a.version === b.version) {
    merged.version = a.version;
  } else if (a.version === undefined) {
    merged.version = b.version;
  } else if (b.version === undefined) {
    merged.version = a.version;
  }

  // timeRange：取最宽的范围
  if (a.timeRange || b.timeRange) {
    const aFrom = a.timeRange?.from;
    const aTo = a.timeRange?.to;
    const bFrom = b.timeRange?.from;
    const bTo = b.timeRange?.to;

    merged.timeRange = {};
    if (aFrom && bFrom) {
      merged.timeRange.from = aFrom < bFrom ? aFrom : bFrom;
    } else {
      merged.timeRange.from = aFrom ?? bFrom;
    }
    if (aTo && bTo) {
      merged.timeRange.to = aTo > bTo ? aTo : bTo;
    } else {
      merged.timeRange.to = aTo ?? bTo;
    }
  }

  // project：相同则保留
  if (a.project === b.project) {
    merged.project = a.project;
  } else if (a.project === undefined) {
    merged.project = b.project;
  } else if (b.project === undefined) {
    merged.project = a.project;
  }

  // custom：浅合并，b 覆盖 a 的同名键
  if (a.custom || b.custom) {
    merged.custom = { ...(a.custom ?? {}), ...(b.custom ?? {}) };
  }

  return merged;
}

/**
 * 将 ContextScope 序列化为 JSON 字符串
 */
export function scopeToJson(scope: ContextScope): string {
  return JSON.stringify(scope);
}

/**
 * 从 JSON 字符串反序列化 ContextScope
 */
export function scopeFromJson(json: string): ContextScope {
  try {
    return JSON.parse(json) as ContextScope;
  } catch {
    return {};
  }
}

// ===========================================================================
// ID 生成
// ===========================================================================

/**
 * 生成 Story ID，格式：story_xxxxxxxx（8 位 hex）
 */
function generateStoryId(): string {
  return `story_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 获取当前 ISO 时间戳
 */
function now(): string {
  return new Date().toISOString();
}

// ===========================================================================
// SQLite 行类型（内部使用）
// ===========================================================================

interface StoryRow {
  id: string;
  raw_input: string;
  problem_class_id: string | null;
  context: string;
  observation_atom_ids: string;
  candidate_paths: string;
  chosen_path: string | null;
  executed_skill_ids: string;
  status: string;
  outcome: string | null;
  outcome_notes: string | null;
  operator: string;
  compiled: number;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
}

// ===========================================================================
// 行与 Story 对象互转
// ===========================================================================

function rowToStory(row: StoryRow): Story {
  return {
    id: row.id,
    rawInput: row.raw_input,
    problemClassId: row.problem_class_id ?? undefined,
    context: scopeFromJson(row.context),
    observationAtomIds: JSON.parse(row.observation_atom_ids) as string[],
    candidatePaths: JSON.parse(row.candidate_paths) as StoryPath[],
    chosenPath: row.chosen_path ? (JSON.parse(row.chosen_path) as StoryPath) : undefined,
    executedSkillIds: JSON.parse(row.executed_skill_ids) as string[],
    status: row.status as StoryStatus,
    outcome: (row.outcome as Story['outcome']) ?? undefined,
    outcomeNotes: row.outcome_notes ?? undefined,
    operator: row.operator,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

// ===========================================================================
// StoryStorage
// ===========================================================================

/**
 * Story 存储层
 *
 * 使用 better-sqlite3 的 prepared statements 提高性能。
 * 支持 WAL 模式，适合多读少写场景。
 */
export class StoryStorage {
  private db: DatabaseType;

  // Prepared statements（在构造函数中初始化，避免重复编译）
  private stmtInsert: Database.Statement;
  private stmtGetById: Database.Statement;
  private stmtUpdate: Database.Statement;
  private stmtListByStatus: Database.Statement;
  private stmtListRecent: Database.Statement;
  private stmtFindByProblemClass: Database.Statement;
  private stmtSearch: Database.Statement;
  private stmtGetResolvedForCompile: Database.Statement;
  private stmtMarkCompiled: Database.Statement;
  private stmtCountAll: Database.Statement;
  private stmtCountByStatus: Database.Statement;
  private stmtCountByOutcome: Database.Statement;
  private stmtAvgResolutionTime: Database.Statement;
  private stmtCountUncompiled: Database.Statement;

  constructor(dbPath: string) {
    // 确保目录存在
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);

    // WAL 模式提升并发读写性能
    this.db.pragma('journal_mode = WAL');
    // 外键约束（本表暂无外键，预留开关）
    this.db.pragma('foreign_keys = ON');

    this.initSchema();
    this.stmtInsert = this.prepareInsert();
    this.stmtGetById = this.db.prepare('SELECT * FROM stories WHERE id = ?');
    this.stmtUpdate = this.prepareUpdate();
    this.stmtListByStatus = this.db.prepare(
      'SELECT * FROM stories WHERE status = ? ORDER BY created_at DESC LIMIT ?'
    );
    this.stmtListRecent = this.db.prepare(
      'SELECT * FROM stories ORDER BY created_at DESC LIMIT ?'
    );
    this.stmtFindByProblemClass = this.db.prepare(
      'SELECT * FROM stories WHERE problem_class_id = ? ORDER BY created_at DESC LIMIT ?'
    );
    this.stmtSearch = this.db.prepare(
      "SELECT * FROM stories WHERE raw_input LIKE ? OR outcome_notes LIKE ? ORDER BY created_at DESC LIMIT ?"
    );
    this.stmtGetResolvedForCompile = this.db.prepare(
      "SELECT * FROM stories WHERE status = 'resolved' AND outcome = 'success' AND compiled = 0 ORDER BY resolved_at ASC LIMIT ?"
    );
    this.stmtMarkCompiled = this.db.prepare(
      "UPDATE stories SET compiled = 1, updated_at = ? WHERE id = ?"
    );
    this.stmtCountAll = this.db.prepare('SELECT COUNT(*) as cnt FROM stories');
    this.stmtCountByStatus = this.db.prepare(
      'SELECT status, COUNT(*) as cnt FROM stories GROUP BY status'
    );
    this.stmtCountByOutcome = this.db.prepare(
      'SELECT outcome, COUNT(*) as cnt FROM stories WHERE outcome IS NOT NULL GROUP BY outcome'
    );
    this.stmtAvgResolutionTime = this.db.prepare(`
      SELECT AVG(
        (julianday(resolved_at) - julianday(created_at)) * 86400000
      ) as avg_ms
      FROM stories
      WHERE resolved_at IS NOT NULL AND created_at IS NOT NULL
    `);
    this.stmtCountUncompiled = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM stories WHERE status = 'resolved' AND outcome = 'success' AND compiled = 0"
    );
  }

  // ---------------------------------------------------------------------------
  // Schema 初始化
  // ---------------------------------------------------------------------------

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        raw_input TEXT NOT NULL,
        problem_class_id TEXT,
        context TEXT DEFAULT '{}',
        observation_atom_ids TEXT DEFAULT '[]',
        candidate_paths TEXT DEFAULT '[]',
        chosen_path TEXT,
        executed_skill_ids TEXT DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'open',
        outcome TEXT,
        outcome_notes TEXT,
        operator TEXT DEFAULT 'system',
        compiled INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
      CREATE INDEX IF NOT EXISTS idx_stories_problem_class ON stories(problem_class_id);
      CREATE INDEX IF NOT EXISTS idx_stories_compiled ON stories(compiled);
      CREATE INDEX IF NOT EXISTS idx_stories_created ON stories(created_at);
    `);
  }

  // ---------------------------------------------------------------------------
  // Prepared Statement 工厂
  // ---------------------------------------------------------------------------

  private prepareInsert(): Database.Statement {
    return this.db.prepare(`
      INSERT INTO stories (
        id, raw_input, problem_class_id, context,
        observation_atom_ids, candidate_paths, chosen_path, executed_skill_ids,
        status, outcome, outcome_notes, operator, compiled,
        created_at, resolved_at, updated_at
      ) VALUES (
        @id, @raw_input, @problem_class_id, @context,
        @observation_atom_ids, @candidate_paths, @chosen_path, @executed_skill_ids,
        @status, @outcome, @outcome_notes, @operator, @compiled,
        @created_at, @resolved_at, @updated_at
      )
    `);
  }

  private prepareUpdate(): Database.Statement {
    return this.db.prepare(`
      UPDATE stories SET
        status = @status,
        problem_class_id = @problem_class_id,
        candidate_paths = @candidate_paths,
        chosen_path = @chosen_path,
        executed_skill_ids = @executed_skill_ids,
        outcome = @outcome,
        outcome_notes = @outcome_notes,
        resolved_at = @resolved_at,
        updated_at = @updated_at
      WHERE id = @id
    `);
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * 创建新 Story
   */
  create(input: {
    rawInput: string;
    problemClassId?: string;
    context?: ContextScope;
    observationAtomIds?: string[];
    operator?: string;
  }): Story {
    const t = now();
    const story: Story = {
      id: generateStoryId(),
      rawInput: input.rawInput,
      problemClassId: input.problemClassId,
      context: input.context ?? {},
      observationAtomIds: input.observationAtomIds ?? [],
      candidatePaths: [],
      executedSkillIds: [],
      status: 'open',
      operator: input.operator ?? 'system',
      createdAt: t,
      updatedAt: t,
    };

    this.stmtInsert.run({
      id: story.id,
      raw_input: story.rawInput,
      problem_class_id: story.problemClassId ?? null,
      context: scopeToJson(story.context),
      observation_atom_ids: JSON.stringify(story.observationAtomIds),
      candidate_paths: JSON.stringify(story.candidatePaths),
      chosen_path: null,
      executed_skill_ids: JSON.stringify(story.executedSkillIds),
      status: story.status,
      outcome: null,
      outcome_notes: null,
      operator: story.operator,
      compiled: 0,
      created_at: story.createdAt,
      resolved_at: null,
      updated_at: story.updatedAt,
    });

    return story;
  }

  /**
   * 按 ID 获取 Story，不存在返回 null
   */
  get(id: string): Story | null {
    const row = this.stmtGetById.get(id) as StoryRow | undefined;
    return row ? rowToStory(row) : null;
  }

  /**
   * 部分更新 Story
   * 仅允许更新过程和结果字段，不允许修改核心输入
   */
  update(
    id: string,
    updates: Partial<
      Pick<
        Story,
        | 'status'
        | 'problemClassId'
        | 'candidatePaths'
        | 'chosenPath'
        | 'executedSkillIds'
        | 'outcome'
        | 'outcomeNotes'
        | 'resolvedAt'
      >
    >
  ): Story | null {
    const existing = this.get(id);
    if (!existing) return null;

    const merged: Story = { ...existing, ...updates, updatedAt: now() };

    this.stmtUpdate.run({
      id,
      status: merged.status,
      problem_class_id: merged.problemClassId ?? null,
      candidate_paths: JSON.stringify(merged.candidatePaths),
      chosen_path: merged.chosenPath ? JSON.stringify(merged.chosenPath) : null,
      executed_skill_ids: JSON.stringify(merged.executedSkillIds),
      outcome: merged.outcome ?? null,
      outcome_notes: merged.outcomeNotes ?? null,
      resolved_at: merged.resolvedAt ?? null,
      updated_at: merged.updatedAt,
    });

    return merged;
  }

  // ---------------------------------------------------------------------------
  // 状态流转
  // ---------------------------------------------------------------------------

  /**
   * 开始探索阶段：记录候选路径，状态变为 exploring
   */
  startExploring(id: string, candidatePaths: StoryPath[]): Story | null {
    return this.update(id, { status: 'exploring', candidatePaths });
  }

  /**
   * 选择路径：记录最终选择，状态变为 executing
   */
  choosePath(id: string, path: StoryPath): Story | null {
    return this.update(id, { status: 'executing', chosenPath: path });
  }

  /**
   * 记录技能执行：追加一个技能 ID
   */
  recordExecution(id: string, skillId: string): Story | null {
    const existing = this.get(id);
    if (!existing) return null;

    const executedSkillIds = [...existing.executedSkillIds, skillId];
    return this.update(id, { executedSkillIds });
  }

  /**
   * 标记解决：设置最终结果和解决时间
   */
  resolve(
    id: string,
    outcome: 'success' | 'partial' | 'failure',
    notes?: string
  ): Story | null {
    const status: StoryStatus = outcome === 'failure' ? 'failed' : 'resolved';
    return this.update(id, {
      status,
      outcome,
      outcomeNotes: notes,
      resolvedAt: now(),
    });
  }

  /**
   * 放弃 Story
   */
  abandon(id: string, reason?: string): Story | null {
    return this.update(id, {
      status: 'abandoned',
      outcomeNotes: reason,
      resolvedAt: now(),
    });
  }

  // ---------------------------------------------------------------------------
  // 查询
  // ---------------------------------------------------------------------------

  /**
   * 按状态列出 Story（最新优先）
   */
  listByStatus(status: StoryStatus, limit = 50): Story[] {
    const rows = this.stmtListByStatus.all(status, limit) as StoryRow[];
    return rows.map(rowToStory);
  }

  /**
   * 列出最近的 Story（创建时间倒序）
   */
  listRecent(limit = 20): Story[] {
    const rows = this.stmtListRecent.all(limit) as StoryRow[];
    return rows.map(rowToStory);
  }

  /**
   * 按问题分类 ID 查找 Story
   */
  findByProblemClass(problemClassId: string, limit = 20): Story[] {
    const rows = this.stmtFindByProblemClass.all(problemClassId, limit) as StoryRow[];
    return rows.map(rowToStory);
  }

  /**
   * 全文搜索（在 rawInput 和 outcomeNotes 中查找）
   */
  search(query: string, limit = 20): Story[] {
    const like = `%${query}%`;
    const rows = this.stmtSearch.all(like, like, limit) as StoryRow[];
    return rows.map(rowToStory);
  }

  // ---------------------------------------------------------------------------
  // Compile 服务接口
  // ---------------------------------------------------------------------------

  /**
   * 获取待 compile 消费的成功案例
   * 条件：status='resolved' AND outcome='success' AND compiled=0
   */
  getResolvedForCompile(limit = 100): Story[] {
    const rows = this.stmtGetResolvedForCompile.all(limit) as StoryRow[];
    return rows.map(rowToStory);
  }

  /**
   * 标记 Story 已被 compile 消费
   */
  markCompiled(id: string): void {
    this.stmtMarkCompiled.run(now(), id);
  }

  // ---------------------------------------------------------------------------
  // 统计
  // ---------------------------------------------------------------------------

  /**
   * 返回存储统计信息
   */
  getStats(): {
    total: number;
    byStatus: Record<string, number>;
    byOutcome: Record<string, number>;
    avgResolutionTimeMs: number;
    uncompiledCount: number;
  } {
    const { cnt: total } = this.stmtCountAll.get() as { cnt: number };

    const statusRows = this.stmtCountByStatus.all() as Array<{ status: string; cnt: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of statusRows) {
      byStatus[row.status] = row.cnt;
    }

    const outcomeRows = this.stmtCountByOutcome.all() as Array<{ outcome: string; cnt: number }>;
    const byOutcome: Record<string, number> = {};
    for (const row of outcomeRows) {
      byOutcome[row.outcome] = row.cnt;
    }

    const { avg_ms } = this.stmtAvgResolutionTime.get() as { avg_ms: number | null };
    const { cnt: uncompiledCount } = this.stmtCountUncompiled.get() as { cnt: number };

    return {
      total,
      byStatus,
      byOutcome,
      avgResolutionTimeMs: avg_ms ?? 0,
      uncompiledCount,
    };
  }

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }
}
