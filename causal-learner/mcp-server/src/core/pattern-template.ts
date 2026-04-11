/**
 * PatternTemplate — BestQ-A v6 模式模板引擎
 *
 * 把 Pattern 从"标签"升级为"小范畴"：
 * - PatternTemplate（模板/小范畴）：少量槽位（对象）+ 少量箭头约束（态射）
 * - PatternInstance（实例/函子）：模板到事实图的保结构映射
 *
 * 核心思想：一次"数据库连不上"只是把诊断模板实例化：
 *   Symptom="连接超时"，Mechanism="安全组缺失"，Failure="服务不可达"
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// 公共接口
// =============================================================================

/** Slot 的关系指纹约束 — 用入边/出边签名区分角色 */
export interface SlotFingerprint {
  inboundRefKinds?: string[];     // 期望的入边类型（如 Symptom 通常没有因果入边）
  outboundRefKinds?: string[];    // 期望的出边类型（如 Symptom 通常有 indicates 出边）
  isConvergencePoint?: boolean;   // 是否是多条路径的汇合点
  minInDegree?: number;           // 最小入度
  minOutDegree?: number;          // 最小出度
}

/** 模板中的槽位（角色/对象） */
export interface PatternSlot {
  role: string;           // "Symptom" | "Mechanism" | "Failure" | "Action" 等
  atomKinds: string[];    // 允许填入的 Atom 类型
  description: string;
  required: boolean;      // 是否必须填充
  /** 关系指纹约束 — 按结构角色区分而非仅靠 atomKinds */
  fingerprint?: SlotFingerprint;
}

/** 模板中的箭头约束（态射） */
export interface PatternArrow {
  fromRole: string;       // 源 slot role
  toRole: string;         // 目标 slot role
  refKind: string;        // RefKind 值（causes/fixes/indicates 等）
  minWeight?: number;     // 最低权重要求（可选）
}

/** 不变量检查结果 */
export interface InvariantResult {
  passed: boolean;
  reason?: string;
}

/** 可执行不变量定义 */
export interface InvariantCheckDef {
  id: string;
  description: string;
  severity: 'hard' | 'soft';
  /**
   * 检查函数的字符串表示（可序列化存储）。
   * 格式："slot:X != slot:Y" 或 "ref:X->Y:kind exists"
   * 在 evaluateInvariant 中解析执行。
   */
  rule: string;
}

/** 模式模板（小范畴） */
export interface PatternTemplate {
  id: string;             // "PT_diagnostic" 或 "PT_xxxxxxxx"
  name: string;
  description: string;
  slots: PatternSlot[];
  arrows: PatternArrow[];
  /** 人类可读的不变量描述（向后兼容） */
  invariants?: string[];
  /** 可执行不变量检查 — hard 不过则不能 compile */
  invariantChecks?: InvariantCheckDef[];
  contextSchema?: Record<string, unknown>;   // 上下文匹配条件
  compileThreshold: number;                  // 几次成功实例化后可固化
  createdAt: string;
  updatedAt: string;
}

/** 模板实例化（函子：模板 → 事实图的映射） */
export interface PatternInstance {
  id: string;                           // "PI_xxxxxxxx"
  templateId: string;
  storyId?: string;                     // 关联的 Story ID（可选）

  // slot role → atomId 的映射
  bindings: Record<string, string>;

  // 验证状态
  complete: boolean;                    // 所有 required slot 都已填充
  arrowsVerified: boolean;              // 所有 arrow 在事实图中都找到对应 Ref
  score: number;                        // 匹配质量 0.0-1.0

  createdAt: string;
}

// =============================================================================
// 内部 SQLite 行类型
// =============================================================================

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  slots: string;
  arrows: string;
  invariants: string;
  invariant_checks: string;
  context_schema: string;
  compile_threshold: number;
  created_at: string;
  updated_at: string;
}

interface InstanceRow {
  id: string;
  template_id: string;
  story_id: string | null;
  bindings: string;
  complete: number;     // SQLite BOOLEAN = 0/1
  arrows_verified: number;
  score: number;
  created_at: string;
}

// =============================================================================
// ID 生成工具
// =============================================================================

/** 生成 8 字符 hex ID */
function genId(prefix: 'PT' | 'PI'): string {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

/** 当前 ISO 时间戳 */
function now(): string {
  return new Date().toISOString();
}

// =============================================================================
// 行转接口工具
// =============================================================================

function rowToTemplate(row: TemplateRow): PatternTemplate {
  return {
    id:               row.id,
    name:             row.name,
    description:      row.description,
    slots:            JSON.parse(row.slots) as PatternSlot[],
    arrows:           JSON.parse(row.arrows) as PatternArrow[],
    invariants:       JSON.parse(row.invariants) as string[],
    invariantChecks:  JSON.parse(row.invariant_checks ?? '[]') as InvariantCheckDef[],
    contextSchema:    JSON.parse(row.context_schema) as Record<string, unknown>,
    compileThreshold: row.compile_threshold,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

function rowToInstance(row: InstanceRow): PatternInstance {
  return {
    id:             row.id,
    templateId:     row.template_id,
    storyId:        row.story_id ?? undefined,
    bindings:       JSON.parse(row.bindings) as Record<string, string>,
    complete:       row.complete === 1,
    arrowsVerified: row.arrows_verified === 1,
    score:          row.score,
    createdAt:      row.created_at,
  };
}

// =============================================================================
// PatternEngine 主类
// =============================================================================

export class PatternEngine {
  private db: Database.Database;

  // ---------- Prepared Statements ----------
  private stmtInsertTemplate!: Database.Statement;
  private stmtSelectTemplateById!: Database.Statement;
  private stmtUpdateTemplate!: Database.Statement;
  private stmtDeleteTemplate!: Database.Statement;
  private stmtListTemplates!: Database.Statement;

  private stmtInsertInstance!: Database.Statement;
  private stmtSelectInstanceById!: Database.Statement;
  private stmtSelectInstancesByTemplate!: Database.Statement;
  private stmtSelectInstancesByStory!: Database.Statement;
  private stmtCountInstancesByTemplate!: Database.Statement;

  constructor(dbPath: string) {
    // 如果是文件路径，确保目录存在
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);

    // 启用 WAL 模式和外键约束
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.initSchema();
    this.prepareStatements();
  }

  // ==========================================================================
  // Schema 初始化
  // ==========================================================================

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_templates (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        description      TEXT DEFAULT '',
        slots            TEXT DEFAULT '[]',
        arrows           TEXT DEFAULT '[]',
        invariants       TEXT DEFAULT '[]',
        invariant_checks TEXT DEFAULT '[]',
        context_schema   TEXT DEFAULT '{}',
        compile_threshold INTEGER DEFAULT 3,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pt_name ON pattern_templates(name);

      CREATE TABLE IF NOT EXISTS pattern_instances (
        id              TEXT PRIMARY KEY,
        template_id     TEXT NOT NULL REFERENCES pattern_templates(id) ON DELETE CASCADE,
        story_id        TEXT,
        bindings        TEXT DEFAULT '{}',
        complete        BOOLEAN DEFAULT 0,
        arrows_verified BOOLEAN DEFAULT 0,
        score           REAL DEFAULT 0,
        created_at      TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pi_template ON pattern_instances(template_id);
      CREATE INDEX IF NOT EXISTS idx_pi_story ON pattern_instances(story_id);
    `);
  }

  // ==========================================================================
  // Prepared Statements
  // ==========================================================================

  private prepareStatements(): void {
    this.stmtInsertTemplate = this.db.prepare(`
      INSERT INTO pattern_templates
        (id, name, description, slots, arrows, invariants, invariant_checks, context_schema, compile_threshold, created_at, updated_at)
      VALUES
        (@id, @name, @description, @slots, @arrows, @invariants, @invariant_checks, @context_schema, @compile_threshold, @created_at, @updated_at)
    `);

    this.stmtSelectTemplateById = this.db.prepare(
      `SELECT * FROM pattern_templates WHERE id = ?`
    );

    this.stmtUpdateTemplate = this.db.prepare(`
      UPDATE pattern_templates
      SET name = @name,
          description = @description,
          slots = @slots,
          arrows = @arrows,
          invariants = @invariants,
          invariant_checks = @invariant_checks,
          context_schema = @context_schema,
          compile_threshold = @compile_threshold,
          updated_at = @updated_at
      WHERE id = @id
    `);

    this.stmtDeleteTemplate = this.db.prepare(
      `DELETE FROM pattern_templates WHERE id = ?`
    );

    this.stmtListTemplates = this.db.prepare(
      `SELECT * FROM pattern_templates ORDER BY created_at DESC LIMIT ?`
    );

    this.stmtInsertInstance = this.db.prepare(`
      INSERT INTO pattern_instances
        (id, template_id, story_id, bindings, complete, arrows_verified, score, created_at)
      VALUES
        (@id, @template_id, @story_id, @bindings, @complete, @arrows_verified, @score, @created_at)
    `);

    this.stmtSelectInstanceById = this.db.prepare(
      `SELECT * FROM pattern_instances WHERE id = ?`
    );

    this.stmtSelectInstancesByTemplate = this.db.prepare(
      `SELECT * FROM pattern_instances WHERE template_id = ? ORDER BY created_at DESC LIMIT ?`
    );

    this.stmtSelectInstancesByStory = this.db.prepare(
      `SELECT * FROM pattern_instances WHERE story_id = ? ORDER BY created_at DESC`
    );

    this.stmtCountInstancesByTemplate = this.db.prepare(
      `SELECT template_id, COUNT(*) AS cnt FROM pattern_instances GROUP BY template_id`
    );
  }

  // ==========================================================================
  // Template CRUD
  // ==========================================================================

  /**
   * 注册一个新的模式模板
   */
  register(input: {
    id?: string;
    name: string;
    description: string;
    slots: PatternSlot[];
    arrows: PatternArrow[];
    invariants?: string[];
    invariantChecks?: InvariantCheckDef[];
    contextSchema?: Record<string, unknown>;
    compileThreshold?: number;
  }): PatternTemplate {
    const id = input.id ?? genId('PT');
    const ts = now();

    this.stmtInsertTemplate.run({
      id,
      name:              input.name,
      description:       input.description,
      slots:             JSON.stringify(input.slots),
      arrows:            JSON.stringify(input.arrows),
      invariants:        JSON.stringify(input.invariants ?? []),
      invariant_checks:  JSON.stringify(input.invariantChecks ?? []),
      context_schema:    JSON.stringify(input.contextSchema ?? {}),
      compile_threshold: input.compileThreshold ?? 3,
      created_at:        ts,
      updated_at:        ts,
    });

    return this.getTemplate(id)!;
  }

  /**
   * 按 ID 获取模板
   */
  getTemplate(id: string): PatternTemplate | null {
    const row = this.stmtSelectTemplateById.get(id) as TemplateRow | undefined;
    return row ? rowToTemplate(row) : null;
  }

  /**
   * 更新模板字段（部分更新）
   */
  updateTemplate(
    id: string,
    updates: Partial<Pick<PatternTemplate,
      'name' | 'description' | 'slots' | 'arrows' | 'invariants' | 'invariantChecks' | 'contextSchema' | 'compileThreshold'
    >>
  ): PatternTemplate | null {
    const existing = this.getTemplate(id);
    if (!existing) return null;

    this.stmtUpdateTemplate.run({
      id,
      name:              updates.name              ?? existing.name,
      description:       updates.description       ?? existing.description,
      slots:             JSON.stringify(updates.slots       ?? existing.slots),
      arrows:            JSON.stringify(updates.arrows      ?? existing.arrows),
      invariants:        JSON.stringify(updates.invariants  ?? existing.invariants ?? []),
      invariant_checks:  JSON.stringify(updates.invariantChecks ?? existing.invariantChecks ?? []),
      context_schema:    JSON.stringify(updates.contextSchema ?? existing.contextSchema ?? {}),
      compile_threshold: updates.compileThreshold  ?? existing.compileThreshold,
      updated_at:        now(),
    });

    return this.getTemplate(id);
  }

  /**
   * 删除模板（级联删除所有实例）
   */
  removeTemplate(id: string): boolean {
    const result = this.stmtDeleteTemplate.run(id);
    return result.changes > 0;
  }

  /**
   * 列出所有模板，按创建时间降序
   */
  listTemplates(limit = 100): PatternTemplate[] {
    const rows = this.stmtListTemplates.all(limit) as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  // ==========================================================================
  // 模式匹配（核心功能）
  // ==========================================================================

  /**
   * 给定一组 Atom，尝试匹配所有模板，返回匹配结果
   *
   * 算法（简化版子图匹配，适合 3-5 slot 的小模板）：
   * 1. 对每个模板，按 atomKinds 过滤候选 atom
   * 2. 暴力枚举所有 slot → atom 的分配组合
   * 3. 检查 arrows 约束（调用 refChecker）
   * 4. 计算分数并取最优分配
   */
  matchTemplates(
    atoms: Array<{ id: string; kind: string; content: string }>,
    refChecker: (fromAtomId: string, toAtomId: string, refKind: string) => boolean,
    options: { minScore?: number; limit?: number } = {}
  ): Array<{ template: PatternTemplate; instance: PatternInstance }> {
    const { minScore = 0, limit = 20 } = options;
    const templates = this.listTemplates(200);
    const results: Array<{ template: PatternTemplate; instance: PatternInstance }> = [];

    for (const template of templates) {
      const instance = this._tryMatchTemplate(template, atoms, refChecker);
      if (instance && instance.score > minScore) {
        results.push({ template, instance });
      }
    }

    // 按分数降序，取前 limit 个
    results.sort((a, b) => b.instance.score - a.instance.score);
    return results.slice(0, limit);
  }

  /**
   * 对单个模板尝试匹配
   */
  matchTemplate(
    templateId: string,
    atoms: Array<{ id: string; kind: string; content: string }>,
    refChecker: (fromAtomId: string, toAtomId: string, refKind: string) => boolean
  ): PatternInstance | null {
    const template = this.getTemplate(templateId);
    if (!template) return null;
    return this._tryMatchTemplate(template, atoms, refChecker);
  }

  /**
   * 内部：对一个模板尝试匹配，返回最优实例
   */
  private _tryMatchTemplate(
    template: PatternTemplate,
    atoms: Array<{ id: string; kind: string; content: string }>,
    refChecker: (fromAtomId: string, toAtomId: string, refKind: string) => boolean
  ): PatternInstance | null {
    const { slots, arrows } = template;
    if (slots.length === 0) return null;

    // 为每个 slot 找候选 atoms（按 kind 过滤）
    const candidatesPerSlot: Map<string, typeof atoms> = new Map();
    for (const slot of slots) {
      const candidates = atoms.filter(a => slot.atomKinds.includes(a.kind));
      candidatesPerSlot.set(slot.role, candidates);

      // 必须槽位无候选 → 直接放弃
      if (slot.required && candidates.length === 0) {
        return null;
      }
    }

    // 暴力枚举所有 slot 到 atom 的注入分配（每个 slot 选一个 atom，且不重复）
    let bestScore = -1;
    let bestBindings: Record<string, string> = {};

    this._enumerate(slots, 0, candidatesPerSlot, {}, new Set(), (bindings) => {
      const { score, arrowsVerified } = this._scoreBindings(bindings, slots, arrows, refChecker);
      if (score > bestScore) {
        bestScore = score;
        bestBindings = { ...bindings };
      }
      return arrowsVerified; // 提前剪枝：如果 arrows 全满足，不必继续搜索
    });

    if (bestScore <= 0) return null;

    // 计算最优 bindings 的 arrowsVerified 和 complete
    const { complete, arrowsVerified } = this._scoreBindings(bestBindings, slots, arrows, refChecker);

    const instance: PatternInstance = {
      id:             genId('PI'),
      templateId:     template.id,
      storyId:        undefined,
      bindings:       bestBindings,
      complete,
      arrowsVerified,
      score:          bestScore,
      createdAt:      now(),
    };

    return instance;
  }

  /**
   * 递归枚举所有注入分配（DFS + 剪枝）
   * @returns true 表示已找到满意答案，可以提前中止
   */
  private _enumerate(
    slots: PatternSlot[],
    slotIndex: number,
    candidatesPerSlot: Map<string, Array<{ id: string; kind: string; content: string }>>,
    currentBindings: Record<string, string>,
    usedAtomIds: Set<string>,
    callback: (bindings: Record<string, string>) => boolean
  ): boolean {
    // 所有 slot 都已分配，调用回调
    if (slotIndex === slots.length) {
      return callback(currentBindings);
    }

    const slot = slots[slotIndex];
    const candidates = candidatesPerSlot.get(slot.role) ?? [];

    // 非必须槽位：允许跳过（不分配）
    if (!slot.required) {
      const done = this._enumerate(slots, slotIndex + 1, candidatesPerSlot, currentBindings, usedAtomIds, callback);
      if (done) return true;
    }

    // 尝试每个候选
    for (const atom of candidates) {
      // 确保注入性：同一个 atom 不能分配给多个 slot
      if (usedAtomIds.has(atom.id)) continue;

      currentBindings[slot.role] = atom.id;
      usedAtomIds.add(atom.id);

      const done = this._enumerate(slots, slotIndex + 1, candidatesPerSlot, currentBindings, usedAtomIds, callback);

      // 回溯
      delete currentBindings[slot.role];
      usedAtomIds.delete(atom.id);

      if (done) return true;
    }

    // 必须槽位找不到候选：不分配（分数会受惩罚）
    if (slot.required && candidates.length === 0) {
      return this._enumerate(slots, slotIndex + 1, candidatesPerSlot, currentBindings, usedAtomIds, callback);
    }

    return false;
  }

  /**
   * 计算一组 bindings 的匹配分数
   * score = filledRequired * 0.6 + arrowMatch * 0.4
   */
  private _scoreBindings(
    bindings: Record<string, string>,
    slots: PatternSlot[],
    arrows: PatternArrow[],
    refChecker: (fromAtomId: string, toAtomId: string, refKind: string) => boolean
  ): { score: number; complete: boolean; arrowsVerified: boolean } {
    // 计算 required slot 填充比例
    const requiredSlots = slots.filter(s => s.required);
    const filledRequired = requiredSlots.filter(s => bindings[s.role] !== undefined).length;
    const filledRatio = requiredSlots.length > 0 ? filledRequired / requiredSlots.length : 1;

    // 计算 arrows 满足比例
    let satisfiedArrows = 0;
    for (const arrow of arrows) {
      const fromAtomId = bindings[arrow.fromRole];
      const toAtomId   = bindings[arrow.toRole];

      // 如果源或目标 slot 未填充，跳过此箭头约束
      if (!fromAtomId || !toAtomId) continue;

      if (refChecker(fromAtomId, toAtomId, arrow.refKind)) {
        satisfiedArrows++;
      }
    }

    const arrowRatio = arrows.length > 0 ? satisfiedArrows / arrows.length : 1;
    const score = filledRatio * 0.6 + arrowRatio * 0.4;

    return {
      score,
      complete:       filledRequired === requiredSlots.length,
      arrowsVerified: satisfiedArrows === arrows.length,
    };
  }

  // ==========================================================================
  // 实例化管理
  // ==========================================================================

  /**
   * 持久化保存一个实例
   */
  saveInstance(instance: PatternInstance): void {
    this.stmtInsertInstance.run({
      id:              instance.id,
      template_id:     instance.templateId,
      story_id:        instance.storyId ?? null,
      bindings:        JSON.stringify(instance.bindings),
      complete:        instance.complete ? 1 : 0,
      arrows_verified: instance.arrowsVerified ? 1 : 0,
      score:           instance.score,
      created_at:      instance.createdAt,
    });
  }

  /**
   * 按 ID 获取实例
   */
  getInstance(id: string): PatternInstance | null {
    const row = this.stmtSelectInstanceById.get(id) as InstanceRow | undefined;
    return row ? rowToInstance(row) : null;
  }

  /**
   * 获取某模板下的所有实例
   */
  getInstancesByTemplate(templateId: string, limit = 50): PatternInstance[] {
    const rows = this.stmtSelectInstancesByTemplate.all(templateId, limit) as InstanceRow[];
    return rows.map(rowToInstance);
  }

  /**
   * 获取关联到某个 Story 的所有实例
   */
  getInstancesByStory(storyId: string): PatternInstance[] {
    const rows = this.stmtSelectInstancesByStory.all(storyId) as InstanceRow[];
    return rows.map(rowToInstance);
  }

  // ==========================================================================
  // 模式涌现：从成功 Story 中发现重复图结构，提议新模板
  // ==========================================================================

  /**
   * 简化版频率挖掘：
   * 1. 把每个 story 的 (atomKinds 序列, refKinds 序列) 编码为签名字符串
   * 2. 统计签名出现频率
   * 3. 频率 >= minFrequency 的签名候选为新模板
   */
  suggestTemplates(
    stories: Array<{
      atomKinds: string[];
      refKinds: string[];
      atomContents: string[];
    }>,
    minFrequency = 2
  ): Array<{
    suggestedTemplate: Omit<PatternTemplate, 'id' | 'createdAt' | 'updatedAt'>;
    frequency: number;
    supportingStoryCount: number;
  }> {
    // 对每个 story 生成结构签名
    const sigFrequency = new Map<string, number>();
    const sigStories   = new Map<string, typeof stories>();

    for (const story of stories) {
      // 签名 = atomKinds 序列 + "|" + refKinds 序列
      const sig = `${story.atomKinds.join('-')}|${story.refKinds.join('-')}`;
      sigFrequency.set(sig, (sigFrequency.get(sig) ?? 0) + 1);

      if (!sigStories.has(sig)) sigStories.set(sig, []);
      sigStories.get(sig)!.push(story);
    }

    const results: Array<{
      suggestedTemplate: Omit<PatternTemplate, 'id' | 'createdAt' | 'updatedAt'>;
      frequency: number;
      supportingStoryCount: number;
    }> = [];

    for (const [sig, frequency] of sigFrequency.entries()) {
      if (frequency < minFrequency) continue;

      const [atomKindsPart, refKindsPart] = sig.split('|');
      const atomKinds = (atomKindsPart ?? '').split('-').filter(Boolean);
      const refKinds  = (refKindsPart ?? '').split('-').filter(Boolean);

      // 从 atomKinds 序列构造 slots
      const slots: PatternSlot[] = atomKinds.map((kind, i) => ({
        role:        `Role${i}`,
        atomKinds:   [kind],
        description: `自动发现的角色 ${i}（类型：${kind}）`,
        required:    true,
      }));

      // 从 refKinds 序列构造 arrows（链式：Role0→Role1→Role2...）
      const arrows: PatternArrow[] = refKinds
        .slice(0, slots.length - 1)
        .map((refKind, i) => ({
          fromRole: `Role${i}`,
          toRole:   `Role${i + 1}`,
          refKind,
        }));

      // 用代表性内容作为模板名称
      const representative = sigStories.get(sig)?.[0];
      const nameHint = representative?.atomContents.slice(0, 2).join(' → ') ?? sig;

      results.push({
        suggestedTemplate: {
          name:             `自动发现: ${nameHint.slice(0, 40)}`,
          description:      `从 ${frequency} 个成功案例中自动发现的结构（签名: ${sig}）`,
          slots,
          arrows,
          invariants:       [],
          contextSchema:    {},
          compileThreshold: 3,
        },
        frequency,
        supportingStoryCount: sigStories.get(sig)!.length,
      });
    }

    // 按频率降序
    results.sort((a, b) => b.frequency - a.frequency);
    return results;
  }

  // ==========================================================================
  // 不变量评估
  // ==========================================================================

  /**
   * 评估一个实例是否满足模板的不变量
   *
   * 规则语法（简化版 DSL）：
   * - "slot:X != slot:Y"  → 两个 slot 绑定的 atomId 不能相同
   * - "slot:X exists"     → slot X 必须有绑定
   * - "ref:X->Y:kind"     → X 到 Y 必须有指定类型的边
   */
  evaluateInvariants(
    template: PatternTemplate,
    bindings: Record<string, string>,
    refChecker: (fromAtomId: string, toAtomId: string, refKind: string) => boolean
  ): Array<{ check: InvariantCheckDef; result: InvariantResult }> {
    const results: Array<{ check: InvariantCheckDef; result: InvariantResult }> = [];

    for (const check of (template.invariantChecks ?? [])) {
      const result = this.evaluateSingleInvariant(check.rule, bindings, refChecker);
      results.push({ check, result });
    }

    return results;
  }

  /**
   * 判断实例是否可以 compile（所有 hard invariant 必须通过）
   */
  canCompile(
    template: PatternTemplate,
    bindings: Record<string, string>,
    refChecker: (fromAtomId: string, toAtomId: string, refKind: string) => boolean
  ): { allowed: boolean; failures: Array<{ id: string; reason: string }> } {
    const results = this.evaluateInvariants(template, bindings, refChecker);
    const failures = results
      .filter(r => r.check.severity === 'hard' && !r.result.passed)
      .map(r => ({ id: r.check.id, reason: r.result.reason ?? '不变量检查未通过' }));
    return { allowed: failures.length === 0, failures };
  }

  private evaluateSingleInvariant(
    rule: string,
    bindings: Record<string, string>,
    refChecker: (fromAtomId: string, toAtomId: string, refKind: string) => boolean
  ): InvariantResult {
    // 规则: "slot:X != slot:Y"
    const neqMatch = rule.match(/^slot:(\w+)\s*!=\s*slot:(\w+)$/);
    if (neqMatch) {
      const [, a, b] = neqMatch;
      const idA = bindings[a];
      const idB = bindings[b];
      if (!idA || !idB) return { passed: true, reason: '一方未绑定，跳过' };
      return idA !== idB
        ? { passed: true }
        : { passed: false, reason: `slot ${a} 和 slot ${b} 绑定了同一个 Atom: ${idA}` };
    }

    // 规则: "slot:X exists"
    const existsMatch = rule.match(/^slot:(\w+)\s+exists$/);
    if (existsMatch) {
      const [, name] = existsMatch;
      return bindings[name]
        ? { passed: true }
        : { passed: false, reason: `slot ${name} 未绑定` };
    }

    // 规则: "ref:X->Y:kind"
    const refMatch = rule.match(/^ref:(\w+)->(\w+):(\w+)$/);
    if (refMatch) {
      const [, from, to, kind] = refMatch;
      const fromId = bindings[from];
      const toId = bindings[to];
      if (!fromId || !toId) return { passed: true, reason: '端点未绑定，跳过' };
      return refChecker(fromId, toId, kind)
        ? { passed: true }
        : { passed: false, reason: `缺少 ${from}(${fromId}) → ${to}(${toId}) 的 ${kind} 边` };
    }

    // 未知规则格式，默认通过
    return { passed: true, reason: `未识别的规则格式: ${rule}` };
  }

  // ==========================================================================
  // 统计
  // ==========================================================================

  /**
   * 获取引擎统计信息
   */
  getStats(): {
    templateCount: number;
    instanceCount: number;
    avgSlotsPerTemplate: number;
    avgArrowsPerTemplate: number;
    mostUsedTemplates: Array<{ id: string; name: string; instanceCount: number }>;
  } {
    const templates = this.listTemplates(1000);

    const templateCount  = templates.length;
    const instanceCount  = (this.db.prepare(
      `SELECT COUNT(*) AS cnt FROM pattern_instances`
    ).get() as { cnt: number }).cnt;

    const avgSlotsPerTemplate = templateCount > 0
      ? templates.reduce((sum, t) => sum + t.slots.length, 0) / templateCount
      : 0;

    const avgArrowsPerTemplate = templateCount > 0
      ? templates.reduce((sum, t) => sum + t.arrows.length, 0) / templateCount
      : 0;

    // 统计每个模板的实例数量
    const countRows = this.stmtCountInstancesByTemplate.all() as Array<{
      template_id: string;
      cnt: number;
    }>;

    const countMap = new Map(countRows.map(r => [r.template_id, r.cnt]));

    const mostUsedTemplates = templates
      .map(t => ({
        id:            t.id,
        name:          t.name,
        instanceCount: countMap.get(t.id) ?? 0,
      }))
      .sort((a, b) => b.instanceCount - a.instanceCount)
      .slice(0, 10);

    return {
      templateCount,
      instanceCount,
      avgSlotsPerTemplate,
      avgArrowsPerTemplate,
      mostUsedTemplates,
    };
  }

  // ==========================================================================
  // 种子模板
  // ==========================================================================

  /**
   * 注册内置种子模板（幂等，已存在则跳过）
   */
  seedDefaults(): void {
    // 诊断模板：Symptom → Mechanism → Failure，Action → Mechanism
    if (!this.getTemplate('PT_diagnostic')) {
      this.register({
        id:          'PT_diagnostic',
        name:        '错误诊断模板',
        description: 'Symptom → Mechanism → Failure，Action → Mechanism',
        slots: [
          { role: 'Symptom',   atomKinds: ['fact'],              description: '可观测的症状/错误',   required: true  },
          { role: 'Mechanism', atomKinds: ['concept'],           description: '底层机制/根因',       required: true  },
          { role: 'Failure',   atomKinds: ['fact', 'pattern'],   description: '最终失败结果',        required: true  },
          { role: 'Action',    atomKinds: ['action'],            description: '修复动作',            required: false },
        ],
        arrows: [
          { fromRole: 'Symptom',   toRole: 'Mechanism', refKind: 'indicates' },
          { fromRole: 'Mechanism', toRole: 'Failure',   refKind: 'causes'    },
          { fromRole: 'Action',    toRole: 'Mechanism', refKind: 'fixes'     },
        ],
        invariants:       ['Symptom 和 Failure 必须是不同的 Atom'],
        invariantChecks: [
          {
            id: 'INV_symptom_ne_failure',
            description: 'Symptom 和 Failure 必须是不同的 Atom',
            severity: 'hard' as const,
            rule: 'slot:Symptom != slot:Failure',
          },
          {
            id: 'INV_mechanism_exists',
            description: 'Mechanism 必须有绑定',
            severity: 'hard' as const,
            rule: 'slot:Mechanism exists',
          },
        ],
        compileThreshold: 3,
      });
    }

    // 依赖缺失模板：Module requires Dependency, Dependency causes Error
    if (!this.getTemplate('PT_dependency')) {
      this.register({
        id:          'PT_dependency',
        name:        '依赖缺失模板',
        description: 'Module requires Dependency, Missing causes Error',
        slots: [
          { role: 'Module',     atomKinds: ['fact', 'context'],         description: '依赖方模块',     required: true },
          { role: 'Dependency', atomKinds: ['fact', 'concept'],         description: '被依赖的组件',   required: true },
          { role: 'Error',      atomKinds: ['fact', 'pattern'],         description: '缺失导致的错误', required: true },
        ],
        arrows: [
          { fromRole: 'Module',     toRole: 'Dependency', refKind: 'requires' },
          { fromRole: 'Dependency', toRole: 'Error',      refKind: 'causes'   },
        ],
        compileThreshold: 3,
      });
    }

    // 版本回归模板：NewVersion causes Bug, Fix fixes Bug
    if (!this.getTemplate('PT_regression')) {
      this.register({
        id:          'PT_regression',
        name:        '版本回归模板',
        description: 'NewVersion causes Bug, OldVersion prevents Bug',
        slots: [
          { role: 'NewVersion', atomKinds: ['context', 'fact'], description: '新版本/变更',   required: true  },
          { role: 'Bug',        atomKinds: ['fact', 'pattern'], description: '引入的 bug',    required: true  },
          { role: 'Fix',        atomKinds: ['action'],          description: '修复方案',       required: false },
        ],
        arrows: [
          { fromRole: 'NewVersion', toRole: 'Bug', refKind: 'causes' },
          { fromRole: 'Fix',        toRole: 'Bug', refKind: 'fixes'  },
        ],
        compileThreshold: 2,
      });
    }
  }

  // ==========================================================================
  // 生命周期
  // ==========================================================================

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }
}
