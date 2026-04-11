/**
 * Hypothesis 模块——BestQ-A 一等假设对象
 *
 * Hypothesis 填补了 Story（完整案例）和 tentative Ref（单条边）之间的空白：
 * 一个可持久化、可回放、可被拒绝的候选推断。
 *
 * 产生路径：evidential ∘ explanatory → Hypothesis（不是 Ref）
 * 升级路径：validated Hypothesis + 足够强的 outcome → canPromote() → compiled Ref
 *
 * 核心约束：
 * 1. 只有 validated 状态的 Hypothesis 才能被升级
 * 2. interventionOutcome 至少是 symptom_relieved 才允许升级
 * 3. forceUpperBound 为 analogical 时禁止升级（类比≠因果）
 * 4. 必须有 Evidence 支撑
 */

import Database, { Database as DatabaseType, Statement } from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 干预结果细分——"修复成功" ≠ "解释正确"
 *
 * 强度排序（由强到弱）：
 * mechanism_confirmed(4) > symptom_relieved(3) > workaround_only(2) > no_effect(1) > side_effect(0)
 */
export type InterventionOutcome =
  | 'mechanism_confirmed'  // 机理被确认（最强）
  | 'symptom_relieved'     // 症状被缓解但机理未确认
  | 'workaround_only'      // 只是绕过，未触及机理
  | 'no_effect'            // 无效果
  | 'side_effect';         // 有副作用

/** 干预结果强度权重，数值越大越强 */
export const OUTCOME_STRENGTH: Record<InterventionOutcome, number> = {
  mechanism_confirmed: 4,
  symptom_relieved: 3,
  workaround_only: 2,
  no_effect: 1,
  side_effect: 0,
};

/** 假设状态机 */
export type HypothesisStatus = 'open' | 'validated' | 'rejected' | 'superseded';

/**
 * 推导步骤——与 ref-algebra.ts 的 DerivationStep 兼容
 * 故意独立声明，避免循环依赖（ref-algebra.ts 不导入本模块）
 */
export interface HypothesisDerivation {
  /** Ref 类型字符串，如 'causes', 'indicates' */
  refKind: string;
  /** RefForce 值：'necessary' | 'sufficient' | 'contributory' | 'analogical' */
  force: string;
  /** 在推导路径中的位置（从 0 开始） */
  position: number;
  /** 来源 Ref ID（如果有） */
  sourceRefId?: string;
}

/**
 * 上下文作用域——与 story.ts 的 ContextScope 兼容，独立声明避免循环依赖
 */
export interface HypothesisScope {
  /** 环境标识，如 dev / prod / ci */
  env?: string;
  /** 技术栈列表，如 ["django", "postgresql"] */
  stack?: string[];
  /** 版本约束，如 "django>=4.0" */
  version?: string;
  /** 项目或租户标识 */
  project?: string;
  /** 自定义扩展字段 */
  custom?: Record<string, unknown>;
}

/** 一等假设对象 */
export interface Hypothesis {
  /** 唯一 ID，格式 "hyp_xxxxxxxx" */
  id: string;

  /** 声明：某对 atom 之间存在某种关系 */
  claim: {
    fromAtomId: string;
    toAtomId: string;
    /** 推断出的 RefKind，如 'causes', 'requires' */
    kind: string;
  };

  /** RefForce 的上界（不能超过此强度），如 'necessary' | 'sufficient' | 'contributory' | 'analogical' */
  forceUpperBound: string;

  /** 证据策略：'inherit' | 'revalidate' | 'discard' */
  evidencePolicy: string;

  /** 推导步骤（proof-carrying，记录推导来源） */
  derivation: HypothesisDerivation[];

  /** 作用域（产生此假设时的上下文） */
  scope: HypothesisScope;

  /** 假设状态 */
  status: HypothesisStatus;

  /** 产生此假设的 Story ID */
  storyId?: string;

  /** 人类可读描述 */
  sourceDescription?: string;

  /** 被哪些 Hypothesis/Evidence ID 阻塞 */
  blockedBy?: string[];

  /** 验证此假设的 Evidence ID 列表 */
  validatedByEvidenceIds?: string[];

  /** 干预结果 */
  interventionOutcome?: InterventionOutcome;

  /** 创建时间（ISO 时间戳） */
  createdAt: string;

  /** 最后更新时间（ISO 时间戳） */
  updatedAt: string;
}

// =============================================================================
// canPromote 返回类型
// =============================================================================

export interface PromoteCheckResult {
  allowed: boolean;
  reason?: string;
  hypothesis?: Hypothesis;
}

// =============================================================================
// getReadyForCompile 选项
// =============================================================================

export interface ReadyForCompileOptions {
  /** 最低接受的 outcome 强度，默认为 'mechanism_confirmed'（强度 4） */
  minOutcome?: InterventionOutcome;
}

// =============================================================================
// ID 生成
// =============================================================================

/** 生成 Hypothesis ID: hyp_xxxxxxxx */
function generateHypothesisId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `hyp_${suffix}`;
}

// =============================================================================
// SQLite 行结构（内部使用）
// =============================================================================

interface HypothesisRow {
  id: string;
  from_atom_id: string;
  to_atom_id: string;
  claim_kind: string;
  force_upper_bound: string;
  evidence_policy: string;
  derivation: string;       // JSON
  scope: string;            // JSON
  status: string;
  story_id: string | null;
  source_description: string | null;
  blocked_by: string;       // JSON array
  validated_by_evidence_ids: string;  // JSON array
  intervention_outcome: string | null;
  created_at: string;
  updated_at: string;
}

/** 将数据库行转换为 Hypothesis 对象 */
function rowToHypothesis(row: HypothesisRow): Hypothesis {
  return {
    id: row.id,
    claim: {
      fromAtomId: row.from_atom_id,
      toAtomId: row.to_atom_id,
      kind: row.claim_kind,
    },
    forceUpperBound: row.force_upper_bound,
    evidencePolicy: row.evidence_policy,
    derivation: JSON.parse(row.derivation) as HypothesisDerivation[],
    scope: JSON.parse(row.scope) as HypothesisScope,
    status: row.status as HypothesisStatus,
    storyId: row.story_id ?? undefined,
    sourceDescription: row.source_description ?? undefined,
    blockedBy: JSON.parse(row.blocked_by) as string[],
    validatedByEvidenceIds: JSON.parse(row.validated_by_evidence_ids) as string[],
    interventionOutcome: (row.intervention_outcome ?? undefined) as InterventionOutcome | undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// HypothesisStore 类
// =============================================================================

/**
 * Hypothesis 存储——可持久化的候选推断管理
 *
 * 设计原则：
 * 1. 一个 Hypothesis 代表跨层复合（evidential → explanatory）产生的候选推断
 * 2. 状态流转：open → validated / rejected / superseded
 * 3. 只有满足 canPromote() 条件的 Hypothesis 才能升级为 compiled Ref
 */
export class HypothesisStore {
  private db: DatabaseType;

  // 预编译语句缓存
  private stmtInsert: Statement<unknown[]>;
  private stmtGetById: Statement<unknown[]>;
  private stmtUpdateStatus: Statement<unknown[]>;
  private stmtListByStatus: Statement<unknown[]>;
  private stmtFindByClaim: Statement<unknown[]>;
  private stmtFindByClaimKind: Statement<unknown[]>;
  private stmtFindByStory: Statement<unknown[]>;
  private stmtFindOpen: Statement<unknown[]>;

  constructor(dbPath: string) {
    // 确保目录存在
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);

    // 启用 WAL 模式，提升并发写入性能
    this.db.pragma('journal_mode = WAL');

    // 初始化表结构
    this.initSchema();

    // 预编译常用语句
    this.stmtInsert = this.db.prepare(`
      INSERT INTO hypotheses
        (id, from_atom_id, to_atom_id, claim_kind,
         force_upper_bound, evidence_policy,
         derivation, scope, status,
         story_id, source_description,
         blocked_by, validated_by_evidence_ids,
         intervention_outcome,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetById = this.db.prepare(
      `SELECT * FROM hypotheses WHERE id = ?`
    );

    this.stmtUpdateStatus = this.db.prepare(
      `UPDATE hypotheses SET status = ?, validated_by_evidence_ids = ?, intervention_outcome = ?, updated_at = ? WHERE id = ?`
    );

    this.stmtListByStatus = this.db.prepare(
      `SELECT * FROM hypotheses WHERE status = ? ORDER BY created_at DESC LIMIT ?`
    );

    this.stmtFindByClaim = this.db.prepare(
      `SELECT * FROM hypotheses WHERE from_atom_id = ? AND to_atom_id = ? ORDER BY created_at DESC`
    );

    this.stmtFindByClaimKind = this.db.prepare(
      `SELECT * FROM hypotheses WHERE from_atom_id = ? AND to_atom_id = ? AND claim_kind = ? ORDER BY created_at DESC`
    );

    this.stmtFindByStory = this.db.prepare(
      `SELECT * FROM hypotheses WHERE story_id = ? ORDER BY created_at ASC`
    );

    this.stmtFindOpen = this.db.prepare(
      `SELECT * FROM hypotheses WHERE status = 'open' ORDER BY created_at ASC LIMIT ?`
    );
  }

  // ---------------------------------------------------------------------------
  // 表结构初始化
  // ---------------------------------------------------------------------------

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hypotheses (
        id TEXT PRIMARY KEY,
        from_atom_id TEXT NOT NULL,
        to_atom_id TEXT NOT NULL,
        claim_kind TEXT NOT NULL,
        force_upper_bound TEXT NOT NULL,
        evidence_policy TEXT NOT NULL DEFAULT 'revalidate',
        derivation TEXT DEFAULT '[]',
        scope TEXT DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'open',
        story_id TEXT,
        source_description TEXT,
        blocked_by TEXT DEFAULT '[]',
        validated_by_evidence_ids TEXT DEFAULT '[]',
        intervention_outcome TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hyp_status ON hypotheses(status);
      CREATE INDEX IF NOT EXISTS idx_hyp_claim ON hypotheses(from_atom_id, to_atom_id, claim_kind);
      CREATE INDEX IF NOT EXISTS idx_hyp_story ON hypotheses(story_id);
      CREATE INDEX IF NOT EXISTS idx_hyp_outcome ON hypotheses(intervention_outcome);
    `);
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * 创建新的 Hypothesis
   *
   * @param input 假设的初始信息
   * @returns 创建的 Hypothesis 对象
   */
  create(input: {
    claim: { fromAtomId: string; toAtomId: string; kind: string };
    forceUpperBound: string;
    evidencePolicy: string;
    derivation?: HypothesisDerivation[];
    scope?: HypothesisScope;
    storyId?: string;
    sourceDescription?: string;
  }): Hypothesis {
    const now = new Date().toISOString();
    const id = generateHypothesisId();

    this.stmtInsert.run(
      id,
      input.claim.fromAtomId,
      input.claim.toAtomId,
      input.claim.kind,
      input.forceUpperBound,
      input.evidencePolicy,
      JSON.stringify(input.derivation ?? []),
      JSON.stringify(input.scope ?? {}),
      'open',
      input.storyId ?? null,
      input.sourceDescription ?? null,
      '[]',  // blocked_by
      '[]',  // validated_by_evidence_ids
      null,  // intervention_outcome
      now,
      now
    );

    return this.get(id)!;
  }

  /**
   * 按 ID 获取 Hypothesis
   *
   * @param id Hypothesis ID
   * @returns Hypothesis 对象，不存在时返回 null
   */
  get(id: string): Hypothesis | null {
    const row = this.stmtGetById.get(id) as HypothesisRow | undefined;
    return row ? rowToHypothesis(row) : null;
  }

  // ---------------------------------------------------------------------------
  // 状态流转
  // ---------------------------------------------------------------------------

  /**
   * 验证假设——将状态从 open 改为 validated
   *
   * @param id Hypothesis ID
   * @param evidenceIds 支撑此假设的 Evidence ID 列表
   * @param outcome 干预结果
   * @returns 更新后的 Hypothesis，不存在时返回 null
   */
  validate(
    id: string,
    evidenceIds: string[],
    outcome: InterventionOutcome
  ): Hypothesis | null {
    const h = this.get(id);
    if (!h) return null;

    const now = new Date().toISOString();
    this.stmtUpdateStatus.run(
      'validated',
      JSON.stringify(evidenceIds),
      outcome,
      now,
      id
    );

    return this.get(id);
  }

  /**
   * 拒绝假设——将状态从 open 改为 rejected
   *
   * @param id Hypothesis ID
   * @param reason 拒绝原因（记录在 sourceDescription 中）
   * @returns 更新后的 Hypothesis，不存在时返回 null
   */
  reject(id: string, reason: string): Hypothesis | null {
    const h = this.get(id);
    if (!h) return null;

    const now = new Date().toISOString();

    // 更新状态并将拒绝原因追加到 source_description
    this.db.prepare(
      `UPDATE hypotheses SET status = 'rejected', source_description = ?, updated_at = ? WHERE id = ?`
    ).run(
      reason,
      now,
      id
    );

    return this.get(id);
  }

  /**
   * 标记假设被取代——当有更好的假设出现时
   *
   * @param id 被取代的 Hypothesis ID
   * @param supersededById 取代它的 Hypothesis ID
   * @returns 更新后的 Hypothesis，不存在时返回 null
   */
  supersede(id: string, supersededById: string): Hypothesis | null {
    const h = this.get(id);
    if (!h) return null;

    const now = new Date().toISOString();

    this.db.prepare(
      `UPDATE hypotheses SET status = 'superseded', source_description = ?, updated_at = ? WHERE id = ?`
    ).run(
      `被 ${supersededById} 取代`,
      now,
      id
    );

    return this.get(id);
  }

  // ---------------------------------------------------------------------------
  // 查询
  // ---------------------------------------------------------------------------

  /**
   * 按状态列出 Hypothesis
   *
   * @param status 目标状态
   * @param limit 最大返回数量，默认 50
   * @returns Hypothesis 列表
   */
  listByStatus(status: HypothesisStatus, limit: number = 50): Hypothesis[] {
    const rows = this.stmtListByStatus.all(status, limit) as HypothesisRow[];
    return rows.map(rowToHypothesis);
  }

  /**
   * 按 claim（from, to, 可选 kind）查找 Hypothesis
   *
   * @param fromAtomId 来源 Atom ID
   * @param toAtomId 目标 Atom ID
   * @param kind 可选的 claim kind 过滤
   * @returns 匹配的 Hypothesis 列表
   */
  findByClaim(
    fromAtomId: string,
    toAtomId: string,
    kind?: string
  ): Hypothesis[] {
    if (kind !== undefined) {
      const rows = this.stmtFindByClaimKind.all(fromAtomId, toAtomId, kind) as HypothesisRow[];
      return rows.map(rowToHypothesis);
    }
    const rows = this.stmtFindByClaim.all(fromAtomId, toAtomId) as HypothesisRow[];
    return rows.map(rowToHypothesis);
  }

  /**
   * 按 Story ID 查找 Hypothesis
   *
   * @param storyId Story ID
   * @returns 该 Story 产生的所有 Hypothesis
   */
  findByStory(storyId: string): Hypothesis[] {
    const rows = this.stmtFindByStory.all(storyId) as HypothesisRow[];
    return rows.map(rowToHypothesis);
  }

  /**
   * 查找所有 open 状态的 Hypothesis
   *
   * @param limit 最大返回数量，默认 50
   * @returns open 状态的 Hypothesis 列表（按创建时间升序）
   */
  findOpen(limit: number = 50): Hypothesis[] {
    const rows = this.stmtFindOpen.all(limit) as HypothesisRow[];
    return rows.map(rowToHypothesis);
  }

  // ---------------------------------------------------------------------------
  // 升级候选
  // ---------------------------------------------------------------------------

  /**
   * 获取可升级为 compiled Ref 的候选 Hypothesis 列表
   *
   * 条件：
   * 1. status === 'validated'
   * 2. interventionOutcome 的强度 >= minOutcome（默认 mechanism_confirmed = 4）
   * 3. 有 Evidence 支撑
   * 4. forceUpperBound !== 'analogical'
   *
   * @param options 过滤选项
   * @returns 满足条件的 Hypothesis 列表
   */
  getReadyForCompile(options: ReadyForCompileOptions = {}): Hypothesis[] {
    const minOutcome = options.minOutcome ?? 'mechanism_confirmed';
    const minStrength = OUTCOME_STRENGTH[minOutcome];

    // 先取所有 validated 状态的条目
    const validated = this.listByStatus('validated', 1000);

    return validated.filter((h) => {
      // 必须有 interventionOutcome 且强度足够
      if (!h.interventionOutcome) return false;
      if (OUTCOME_STRENGTH[h.interventionOutcome] < minStrength) return false;

      // 必须有 Evidence 支撑
      if (!h.validatedByEvidenceIds || h.validatedByEvidenceIds.length === 0) return false;

      // forceUpperBound 不能是 analogical
      if (h.forceUpperBound === 'analogical') return false;

      return true;
    });
  }

  /**
   * 判断一个 Hypothesis 是否允许升级为 compiled Ref
   *
   * 四项检查（全部通过才允许）：
   * 1. 状态必须是 validated
   * 2. interventionOutcome 至少是 symptom_relieved（强度 ≥ 3）
   * 3. 必须有 Evidence 支撑
   * 4. forceUpperBound 不能是 analogical
   *
   * @param id Hypothesis ID
   * @returns 包含 allowed 标志和原因说明的结果对象
   */
  canPromote(id: string): PromoteCheckResult {
    const h = this.get(id);
    if (!h) {
      return { allowed: false, reason: '假设不存在' };
    }

    // 检查 1：状态必须是 validated
    if (h.status !== 'validated') {
      return {
        allowed: false,
        reason: `状态为 ${h.status}，只有 validated 才能升级`,
        hypothesis: h,
      };
    }

    // 检查 2：interventionOutcome 必须足够强（至少 symptom_relieved = 3）
    if (!h.interventionOutcome || OUTCOME_STRENGTH[h.interventionOutcome] < 3) {
      return {
        allowed: false,
        reason: `干预结果为 ${h.interventionOutcome ?? 'none'}，至少需要 symptom_relieved`,
        hypothesis: h,
      };
    }

    // 检查 3：必须有 Evidence 支撑
    if (!h.validatedByEvidenceIds || h.validatedByEvidenceIds.length === 0) {
      return {
        allowed: false,
        reason: '没有 Evidence 支撑',
        hypothesis: h,
      };
    }

    // 检查 4：forceUpperBound 不能是 analogical
    if (h.forceUpperBound === 'analogical') {
      return {
        allowed: false,
        reason: 'force 上界为 analogical，不能升级为世界模型 Ref',
        hypothesis: h,
      };
    }

    return { allowed: true, hypothesis: h };
  }

  // ---------------------------------------------------------------------------
  // 统计
  // ---------------------------------------------------------------------------

  /**
   * 获取 Hypothesis 统计信息
   *
   * @returns 统计摘要
   */
  getStats(): {
    total: number;
    byStatus: Record<string, number>;
    byOutcome: Record<string, number>;
    avgDerivationLength: number;
    readyForCompile: number;
  } {
    // 总数
    const totalRow = this.db.prepare(
      `SELECT COUNT(*) as count FROM hypotheses`
    ).get() as { count: number };
    const total = totalRow.count;

    // 按状态统计
    const statusRows = this.db.prepare(
      `SELECT status, COUNT(*) as count FROM hypotheses GROUP BY status`
    ).all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) {
      byStatus[r.status] = r.count;
    }

    // 按 outcome 统计
    const outcomeRows = this.db.prepare(
      `SELECT intervention_outcome, COUNT(*) as count FROM hypotheses WHERE intervention_outcome IS NOT NULL GROUP BY intervention_outcome`
    ).all() as Array<{ intervention_outcome: string; count: number }>;
    const byOutcome: Record<string, number> = {};
    for (const r of outcomeRows) {
      byOutcome[r.intervention_outcome] = r.count;
    }

    // 平均推导步骤长度（通过 JSON_ARRAY_LENGTH 或 JavaScript 计算）
    let avgDerivationLength = 0;
    if (total > 0) {
      const allDerivations = this.db.prepare(
        `SELECT derivation FROM hypotheses`
      ).all() as Array<{ derivation: string }>;
      const totalSteps = allDerivations.reduce((sum, row) => {
        const steps = JSON.parse(row.derivation) as unknown[];
        return sum + steps.length;
      }, 0);
      avgDerivationLength = totalSteps / total;
    }

    // 可升级数量
    const readyForCompile = this.getReadyForCompile().length;

    return {
      total,
      byStatus,
      byOutcome,
      avgDerivationLength,
      readyForCompile,
    };
  }

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }
}
