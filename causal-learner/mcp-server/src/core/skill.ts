/**
 * Skill 模块 - 可执行技能绑定层
 *
 * 区分"知识层面的建议"（ACTION Atom）和"执行层面的能力"（Skill）。
 *
 * 设计：
 *   ActionAtom("add null check") ← 知识：这是一个可能的修复建议
 *             ↓ boundAtomId
 *   Skill("SKL_add_null_check")  ← 执行：输入 file+line，输出 patch，可自动执行
 *
 * 图告诉你"add null check"是个修复动作，Skill 让系统知道怎么真正去做。
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as crypto from 'crypto';

// =============================================================================
// 接口定义
// =============================================================================

/** 技能参数 */
export interface SkillParam {
  name: string;
  /** 参数类型：'string' | 'number' | 'boolean' | 'object' | 'array' */
  type: string;
  description: string;
  required: boolean;
  defaultValue?: unknown;
}

/** 技能执行结果 */
export interface SkillExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

/** 可执行技能 */
export interface Skill {
  id: string;                    // "SKL_xxxxxxxx"
  name: string;
  description: string;

  // 执行契约
  inputs: SkillParam[];
  outputs: SkillParam[];
  sideEffects: boolean;
  idempotent: boolean;
  autoExecutable: boolean;       // 是否允许自动执行（vs 需人工确认）

  // 绑定
  boundAtomId?: string;          // 关联的 ACTION Atom ID
  toolBinding?: string;          // MCP 工具名或 CLI 命令

  // 元数据
  tags?: string[];
  executionCount: number;
  lastExecutedAt?: string;
  avgDurationMs?: number;
  successRate?: number;          // 0.0-1.0

  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// SkillRegistry 实现
// =============================================================================

/** 生成 SKL_ 前缀的 ID */
function generateSkillId(): string {
  return 'SKL_' + crypto.randomBytes(4).toString('hex');
}

/** 从数据库行反序列化为 Skill 对象 */
function rowToSkill(row: Record<string, unknown>): Skill {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    description: (row['description'] as string) ?? '',
    inputs: JSON.parse((row['inputs'] as string) || '[]') as SkillParam[],
    outputs: JSON.parse((row['outputs'] as string) || '[]') as SkillParam[],
    sideEffects: Boolean(row['side_effects']),
    idempotent: Boolean(row['idempotent']),
    autoExecutable: Boolean(row['auto_executable']),
    boundAtomId: (row['bound_atom_id'] as string) || undefined,
    toolBinding: (row['tool_binding'] as string) || undefined,
    tags: JSON.parse((row['tags'] as string) || '[]') as string[],
    executionCount: (row['execution_count'] as number) ?? 0,
    lastExecutedAt: (row['last_executed_at'] as string) || undefined,
    avgDurationMs: (row['avg_duration_ms'] as number) || undefined,
    successRate: (row['success_rate'] as number) || undefined,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

/**
 * Skill 注册表 - 管理可执行技能的 CRUD、搜索与执行统计
 */
export class SkillRegistry {
  private db: DatabaseType;

  // Prepared Statements
  private stmtInsert!: Database.Statement;
  private stmtGetById!: Database.Statement;
  private stmtUpdateById!: Database.Statement;
  private stmtDeleteById!: Database.Statement;
  private stmtList!: Database.Statement;
  private stmtFindByAtom!: Database.Statement;
  private stmtFindByTool!: Database.Statement;
  private stmtAutoExecutable!: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // WAL 模式，提升并发写性能
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this._initSchema();
    this._prepareStatements();
  }

  /** 初始化表结构与索引 */
  private _initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        inputs TEXT DEFAULT '[]',
        outputs TEXT DEFAULT '[]',
        side_effects BOOLEAN DEFAULT 0,
        idempotent BOOLEAN DEFAULT 1,
        auto_executable BOOLEAN DEFAULT 0,
        bound_atom_id TEXT,
        tool_binding TEXT,
        tags TEXT DEFAULT '[]',
        execution_count INTEGER DEFAULT 0,
        last_executed_at TEXT,
        avg_duration_ms REAL,
        success_rate REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_skills_atom ON skills(bound_atom_id);
      CREATE INDEX IF NOT EXISTS idx_skills_tool ON skills(tool_binding);
      CREATE INDEX IF NOT EXISTS idx_skills_auto ON skills(auto_executable);
    `);
  }

  /** 预编译常用语句 */
  private _prepareStatements(): void {
    this.stmtInsert = this.db.prepare(`
      INSERT INTO skills (
        id, name, description, inputs, outputs,
        side_effects, idempotent, auto_executable,
        bound_atom_id, tool_binding, tags,
        execution_count, last_executed_at, avg_duration_ms, success_rate,
        created_at, updated_at
      ) VALUES (
        @id, @name, @description, @inputs, @outputs,
        @side_effects, @idempotent, @auto_executable,
        @bound_atom_id, @tool_binding, @tags,
        0, NULL, NULL, NULL,
        @created_at, @updated_at
      )
    `);

    this.stmtGetById = this.db.prepare(
      'SELECT * FROM skills WHERE id = ?'
    );

    this.stmtUpdateById = this.db.prepare(`
      UPDATE skills SET
        name = @name,
        description = @description,
        inputs = @inputs,
        outputs = @outputs,
        side_effects = @side_effects,
        idempotent = @idempotent,
        auto_executable = @auto_executable,
        bound_atom_id = @bound_atom_id,
        tool_binding = @tool_binding,
        tags = @tags,
        updated_at = @updated_at
      WHERE id = @id
    `);

    this.stmtDeleteById = this.db.prepare(
      'DELETE FROM skills WHERE id = ?'
    );

    this.stmtList = this.db.prepare(
      'SELECT * FROM skills ORDER BY created_at DESC LIMIT ?'
    );

    this.stmtFindByAtom = this.db.prepare(
      'SELECT * FROM skills WHERE bound_atom_id = ? ORDER BY created_at DESC'
    );

    this.stmtFindByTool = this.db.prepare(
      'SELECT * FROM skills WHERE tool_binding = ? LIMIT 1'
    );

    this.stmtAutoExecutable = this.db.prepare(
      'SELECT * FROM skills WHERE auto_executable = 1 ORDER BY name'
    );
  }

  // ===========================================================================
  // CRUD
  // ===========================================================================

  /**
   * 注册新技能
   */
  register(input: {
    id?: string;
    name: string;
    description: string;
    inputs?: SkillParam[];
    outputs?: SkillParam[];
    sideEffects?: boolean;
    idempotent?: boolean;
    autoExecutable?: boolean;
    boundAtomId?: string;
    toolBinding?: string;
    tags?: string[];
  }): Skill {
    const now = new Date().toISOString();
    const id = input.id ?? generateSkillId();

    this.stmtInsert.run({
      id,
      name: input.name,
      description: input.description ?? '',
      inputs: JSON.stringify(input.inputs ?? []),
      outputs: JSON.stringify(input.outputs ?? []),
      side_effects: input.sideEffects ? 1 : 0,
      idempotent: (input.idempotent ?? true) ? 1 : 0,
      auto_executable: input.autoExecutable ? 1 : 0,
      bound_atom_id: input.boundAtomId ?? null,
      tool_binding: input.toolBinding ?? null,
      tags: JSON.stringify(input.tags ?? []),
      created_at: now,
      updated_at: now,
    });

    return this.get(id)!;
  }

  /**
   * 按 ID 获取技能
   */
  get(id: string): Skill | null {
    const row = this.stmtGetById.get(id) as Record<string, unknown> | undefined;
    return row ? rowToSkill(row) : null;
  }

  /**
   * 更新技能（部分字段）
   */
  update(
    id: string,
    updates: Partial<Pick<Skill,
      'name' | 'description' | 'inputs' | 'outputs' | 'sideEffects' |
      'idempotent' | 'autoExecutable' | 'boundAtomId' | 'toolBinding' | 'tags'
    >>
  ): Skill | null {
    const existing = this.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    this.stmtUpdateById.run({
      id,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      inputs: JSON.stringify(updates.inputs ?? existing.inputs),
      outputs: JSON.stringify(updates.outputs ?? existing.outputs),
      side_effects: (updates.sideEffects ?? existing.sideEffects) ? 1 : 0,
      idempotent: (updates.idempotent ?? existing.idempotent) ? 1 : 0,
      auto_executable: (updates.autoExecutable ?? existing.autoExecutable) ? 1 : 0,
      bound_atom_id: updates.boundAtomId ?? existing.boundAtomId ?? null,
      tool_binding: updates.toolBinding ?? existing.toolBinding ?? null,
      tags: JSON.stringify(updates.tags ?? existing.tags ?? []),
      updated_at: now,
    });

    return this.get(id);
  }

  /**
   * 删除技能
   */
  remove(id: string): boolean {
    const result = this.stmtDeleteById.run(id);
    return result.changes > 0;
  }

  /**
   * 列出技能（按创建时间倒序）
   */
  list(limit = 100): Skill[] {
    const rows = this.stmtList.all(limit) as Record<string, unknown>[];
    return rows.map(rowToSkill);
  }

  // ===========================================================================
  // 查询
  // ===========================================================================

  /**
   * 按关联 Atom ID 查找技能
   */
  findByAtomId(atomId: string): Skill[] {
    const rows = this.stmtFindByAtom.all(atomId) as Record<string, unknown>[];
    return rows.map(rowToSkill);
  }

  /**
   * 按工具绑定名称查找技能
   */
  findByToolBinding(toolName: string): Skill | null {
    const row = this.stmtFindByTool.get(toolName) as Record<string, unknown> | undefined;
    return row ? rowToSkill(row) : null;
  }

  /**
   * 按标签搜索技能（精确标签匹配）
   */
  findByTag(tag: string): Skill[] {
    // tags 以 JSON 数组存储，使用 LIKE 进行子串匹配
    const stmt = this.db.prepare(
      `SELECT * FROM skills WHERE tags LIKE ? ORDER BY created_at DESC`
    );
    const pattern = `%"${tag}"%`;
    const rows = stmt.all(pattern) as Record<string, unknown>[];
    return rows.map(rowToSkill);
  }

  /**
   * 全文搜索（name + description + tags）
   */
  search(query: string, limit = 20): Skill[] {
    const stmt = this.db.prepare(`
      SELECT * FROM skills
      WHERE name LIKE @q OR description LIKE @q OR tags LIKE @q
      ORDER BY
        CASE
          WHEN name LIKE @q THEN 0
          WHEN description LIKE @q THEN 1
          ELSE 2
        END,
        created_at DESC
      LIMIT @limit
    `);
    const pattern = `%${query}%`;
    const rows = stmt.all({ q: pattern, limit }) as Record<string, unknown>[];
    return rows.map(rowToSkill);
  }

  // ===========================================================================
  // 执行统计
  // ===========================================================================

  /**
   * 记录一次执行结果，更新统计信息（executionCount、avgDurationMs、successRate）
   */
  recordExecution(id: string, result: SkillExecutionResult): void {
    const skill = this.get(id);
    if (!skill) return;

    const count = skill.executionCount + 1;
    const now = new Date().toISOString();

    // 滚动均值：新均值 = (旧均值 * 旧count + 新值) / 新count
    let newAvgDuration = skill.avgDurationMs ?? null;
    if (result.durationMs !== undefined) {
      const oldAvg = skill.avgDurationMs ?? 0;
      newAvgDuration = (oldAvg * skill.executionCount + result.durationMs) / count;
    }

    // 成功率滚动均值
    const successVal = result.success ? 1 : 0;
    const oldRate = skill.successRate ?? 0;
    const newSuccessRate = (oldRate * skill.executionCount + successVal) / count;

    const stmt = this.db.prepare(`
      UPDATE skills SET
        execution_count = @count,
        last_executed_at = @now,
        avg_duration_ms = @avg_duration,
        success_rate = @success_rate,
        updated_at = @now
      WHERE id = @id
    `);

    stmt.run({
      id,
      count,
      now,
      avg_duration: newAvgDuration,
      success_rate: newSuccessRate,
    });
  }

  /**
   * 获取所有允许自动执行的技能
   */
  getAutoExecutable(): Skill[] {
    const rows = this.stmtAutoExecutable.all() as Record<string, unknown>[];
    return rows.map(rowToSkill);
  }

  // ===========================================================================
  // 统计
  // ===========================================================================

  /**
   * 获取注册表统计信息
   */
  getStats(): {
    total: number;
    withAtomBinding: number;
    withToolBinding: number;
    autoExecutable: number;
    avgSuccessRate: number;
    totalExecutions: number;
  } {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN bound_atom_id IS NOT NULL THEN 1 ELSE 0 END) as with_atom,
        SUM(CASE WHEN tool_binding IS NOT NULL THEN 1 ELSE 0 END) as with_tool,
        SUM(CASE WHEN auto_executable = 1 THEN 1 ELSE 0 END) as auto_exec,
        AVG(CASE WHEN success_rate IS NOT NULL THEN success_rate END) as avg_sr,
        SUM(execution_count) as total_exec
      FROM skills
    `).get() as Record<string, number>;

    return {
      total: row['total'] ?? 0,
      withAtomBinding: row['with_atom'] ?? 0,
      withToolBinding: row['with_tool'] ?? 0,
      autoExecutable: row['auto_exec'] ?? 0,
      avgSuccessRate: row['avg_sr'] ?? 0,
      totalExecutions: row['total_exec'] ?? 0,
    };
  }

  // ===========================================================================
  // 种子数据
  // ===========================================================================

  /**
   * 注入默认种子技能（已存在则跳过）
   */
  seedDefaults(): void {
    const seeds = [
      {
        id: 'SKL_add_null_check',
        name: '添加空指针检查',
        description: '在访问对象属性前添加 null/None 检查',
        inputs: [
          { name: 'file', type: 'string', description: '文件路径', required: true },
          { name: 'line', type: 'number', description: '行号', required: true },
        ],
        outputs: [
          { name: 'patch', type: 'string', description: '修改补丁', required: true },
        ],
        sideEffects: true,
        idempotent: true,
        autoExecutable: false,
        tags: ['null-check', 'safety'],
      },
      {
        id: 'SKL_add_import',
        name: '添加缺失的 import',
        description: '添加缺失的模块导入语句',
        inputs: [
          { name: 'file', type: 'string', description: '文件路径', required: true },
          { name: 'module', type: 'string', description: '模块名', required: true },
        ],
        outputs: [
          { name: 'patch', type: 'string', description: '修改补丁', required: true },
        ],
        sideEffects: true,
        idempotent: true,
        autoExecutable: true,
        tags: ['import', 'dependency'],
      },
      {
        id: 'SKL_increase_timeout',
        name: '增加超时时间',
        description: '增加连接或请求的超时时间配置',
        inputs: [
          { name: 'config', type: 'string', description: '配置文件路径', required: true },
          { name: 'timeout_ms', type: 'number', description: '新超时时间(ms)', required: true },
        ],
        outputs: [
          { name: 'patch', type: 'string', description: '修改补丁', required: true },
        ],
        sideEffects: true,
        idempotent: true,
        autoExecutable: false,
        tags: ['timeout', 'config'],
      },
    ];

    for (const s of seeds) {
      if (!this.get(s.id)) {
        this.register(s);
      }
    }
  }

  // ===========================================================================
  // 生命周期
  // ===========================================================================

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }
}
