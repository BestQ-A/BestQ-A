/**
 * ProblemClass + Strategy 模块 - 问题路由器和理解协议
 *
 * 架构说明：
 * ProblemClass 不是图中的 Atom，它是路由器。
 * 决定 explore 在哪个子图区域搜索。
 * 流程：classify → contextualize → constrain subgraph → explore
 *
 * 依赖：better-sqlite3（项目已有，无新依赖）
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// 核心接口定义
// =============================================================================

/**
 * 子图约束 - 告诉 explore 搜索哪个区域
 */
export interface SubgraphConstraint {
  /** 限制搜索的 Atom 类型 */
  atomKinds?: string[];
  /** 限制搜索的 Ref 类型 */
  refKinds?: string[];
  /** 关键词过滤 */
  keywordPatterns?: string[];
  /** 上下文约束 */
  contextFilter?: Record<string, unknown>;
}

/**
 * 问题类 - 路由器，定义一类问题的特征和搜索范围
 */
export interface ProblemClass {
  id: string;
  name: string;
  description: string;
  /** 匹配特征列表 */
  signatures: string[];
  /** 默认策略 ID */
  defaultStrategyId?: string;
  /** 子图约束 */
  subgraphConstraint?: SubgraphConstraint;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 分类结果
 */
export interface ClassifyResult {
  problemClassId: string;
  confidence: number;
  /** 哪些特征匹配了 */
  matchedSignatures: string[];
  suggestedStrategyId?: string;
}

/**
 * 策略步骤
 */
export interface StrategyStep {
  phase: 'classify' | 'contextualize' | 'constrain' | 'retrieve' | 'execute';
  description: string;
  /** 建议使用的 MCP 工具名 */
  toolHint?: string;
}

/**
 * 策略 / Archetype - 定义处理某类问题的步骤序列
 */
export interface Strategy {
  id: string;
  name: string;
  description: string;
  steps: StrategyStep[];
  /** 适用的 ProblemClass IDs */
  applicableTo: string[];
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// 数据库行类型（内部使用）
// =============================================================================

interface ProblemClassRow {
  id: string;
  name: string;
  description: string;
  signatures: string;
  default_strategy_id: string | null;
  subgraph_constraint: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

interface StrategyRow {
  id: string;
  name: string;
  description: string;
  steps: string;
  applicable_to: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 生成随机 8 位十六进制字符串
 */
function randomHex8(): string {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
}

/**
 * 将数据库行转换为 ProblemClass 对象
 */
function rowToProblemClass(row: ProblemClassRow): ProblemClass {
  const pc: ProblemClass = {
    id: row.id,
    name: row.name,
    description: row.description,
    signatures: JSON.parse(row.signatures) as string[],
    subgraphConstraint: JSON.parse(row.subgraph_constraint) as SubgraphConstraint,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.default_strategy_id) {
    pc.defaultStrategyId = row.default_strategy_id;
  }
  return pc;
}

/**
 * 将数据库行转换为 Strategy 对象
 */
function rowToStrategy(row: StrategyRow): Strategy {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    steps: JSON.parse(row.steps) as StrategyStep[],
    applicableTo: JSON.parse(row.applicable_to) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 对输入文本做 token 分词（小写，按空白和标点分割）
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter((t) => t.length > 0);
}

// =============================================================================
// ProblemClassRegistry
// =============================================================================

/**
 * 问题类注册表 - 管理 ProblemClass 和 Strategy 的 SQLite 持久化
 */
export class ProblemClassRegistry {
  private db: DatabaseType;

  constructor(dbPath: string) {
    // 确保目录存在（文件数据库）
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);

    // 启用 WAL 模式，提升并发写入性能
    this.db.pragma('journal_mode = WAL');

    this.initSchema();
  }

  // ---------------------------------------------------------------------------
  // Schema 初始化
  // ---------------------------------------------------------------------------

  /**
   * 初始化数据库表结构
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS problem_classes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        signatures TEXT DEFAULT '[]',
        default_strategy_id TEXT,
        subgraph_constraint TEXT DEFAULT '{}',
        tags TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pc_name ON problem_classes(name);

      CREATE TABLE IF NOT EXISTS strategies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        steps TEXT DEFAULT '[]',
        applicable_to TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_strategies_name ON strategies(name);
    `);
  }

  // ---------------------------------------------------------------------------
  // ProblemClass CRUD
  // ---------------------------------------------------------------------------

  /**
   * 注册新的问题类
   */
  register(input: {
    id?: string;
    name: string;
    description: string;
    signatures: string[];
    defaultStrategyId?: string;
    subgraphConstraint?: SubgraphConstraint;
    tags?: string[];
  }): ProblemClass {
    const now = new Date().toISOString();
    const id = input.id ?? `PC_${randomHex8()}`;

    const stmt = this.db.prepare(`
      INSERT INTO problem_classes
        (id, name, description, signatures, default_strategy_id, subgraph_constraint, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      input.description,
      JSON.stringify(input.signatures),
      input.defaultStrategyId ?? null,
      JSON.stringify(input.subgraphConstraint ?? {}),
      JSON.stringify(input.tags ?? []),
      now,
      now,
    );

    return this.get(id)!;
  }

  /**
   * 按 ID 获取问题类
   */
  get(id: string): ProblemClass | null {
    const stmt = this.db.prepare(`SELECT * FROM problem_classes WHERE id = ?`);
    const row = stmt.get(id) as ProblemClassRow | undefined;
    if (!row) return null;
    return rowToProblemClass(row);
  }

  /**
   * 更新问题类字段
   */
  update(
    id: string,
    updates: Partial<
      Pick<
        ProblemClass,
        | 'name'
        | 'description'
        | 'signatures'
        | 'defaultStrategyId'
        | 'subgraphConstraint'
        | 'tags'
      >
    >,
  ): ProblemClass | null {
    const existing = this.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    // 合并更新
    const name = updates.name ?? existing.name;
    const description = updates.description ?? existing.description;
    const signatures = updates.signatures ?? existing.signatures;
    const defaultStrategyId =
      'defaultStrategyId' in updates
        ? (updates.defaultStrategyId ?? null)
        : (existing.defaultStrategyId ?? null);
    const subgraphConstraint =
      updates.subgraphConstraint ?? existing.subgraphConstraint ?? {};
    const tags = updates.tags ?? existing.tags ?? [];

    const stmt = this.db.prepare(`
      UPDATE problem_classes
      SET name = ?, description = ?, signatures = ?, default_strategy_id = ?,
          subgraph_constraint = ?, tags = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      name,
      description,
      JSON.stringify(signatures),
      defaultStrategyId,
      JSON.stringify(subgraphConstraint),
      JSON.stringify(tags),
      now,
      id,
    );

    return this.get(id);
  }

  /**
   * 删除问题类
   */
  remove(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM problem_classes WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 列出所有问题类（按创建时间倒序）
   */
  list(limit = 100): ProblemClass[] {
    const stmt = this.db.prepare(
      `SELECT * FROM problem_classes ORDER BY created_at DESC LIMIT ?`,
    );
    const rows = stmt.all(limit) as ProblemClassRow[];
    return rows.map(rowToProblemClass);
  }

  // ---------------------------------------------------------------------------
  // classify - 核心分类功能
  // ---------------------------------------------------------------------------

  /**
   * 对输入文本进行问题类分类
   *
   * 算法：
   * 1. 遍历所有 ProblemClass 的 signatures 进行匹配
   *    - 精确匹配：signature 完整出现在 input 中（大小写不敏感）
   *    - 模糊匹配：signature 的 tokens 部分出现在 input tokens 中
   * 2. score = (精确匹配数 * 2 + 模糊匹配数) / (total_signatures * 2)
   * 3. 按分数降序，返回 score > 0 的结果
   */
  classify(input: string, context?: Record<string, unknown>): ClassifyResult[] {
    const allClasses = this.list(1000);
    const inputLower = input.toLowerCase();
    const inputTokens = new Set(tokenize(input));

    const results: ClassifyResult[] = [];

    for (const pc of allClasses) {
      if (pc.signatures.length === 0) continue;

      // 可选的 context 兼容性检查
      if (pc.subgraphConstraint?.contextFilter && context) {
        const filter = pc.subgraphConstraint.contextFilter;
        // 如果 context 不包含 filter 中的所有键值，跳过该 ProblemClass
        const compatible = Object.entries(filter).every(([k, v]) => context[k] === v);
        if (!compatible) continue;
      }

      let exactMatches = 0;
      let fuzzyMatches = 0;
      const matchedSignatures: string[] = [];

      for (const sig of pc.signatures) {
        const sigLower = sig.toLowerCase();

        // 精确匹配（signature 完整出现在输入中）
        if (inputLower.includes(sigLower)) {
          exactMatches++;
          matchedSignatures.push(sig);
          continue;
        }

        // 模糊匹配（signature tokens 至少有一半出现在 input tokens 中）
        const sigTokens = tokenize(sig);
        if (sigTokens.length === 0) continue;

        const hitCount = sigTokens.filter((t) => inputTokens.has(t)).length;
        const hitRatio = hitCount / sigTokens.length;
        if (hitRatio >= 0.5) {
          fuzzyMatches++;
          matchedSignatures.push(sig);
        }
      }

      if (exactMatches === 0 && fuzzyMatches === 0) continue;

      // 分数归一化到 0.0-1.0
      const score =
        (exactMatches * 2 + fuzzyMatches) / (pc.signatures.length * 2);

      results.push({
        problemClassId: pc.id,
        confidence: Math.min(score, 1.0),
        matchedSignatures,
        suggestedStrategyId: pc.defaultStrategyId,
      });
    }

    // 按置信度降序排列
    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  // ---------------------------------------------------------------------------
  // Strategy CRUD
  // ---------------------------------------------------------------------------

  /**
   * 添加新策略
   */
  addStrategy(input: {
    id?: string;
    name: string;
    description: string;
    steps: StrategyStep[];
    applicableTo: string[];
  }): Strategy {
    const now = new Date().toISOString();
    const id = input.id ?? `STR_${randomHex8()}`;

    const stmt = this.db.prepare(`
      INSERT INTO strategies (id, name, description, steps, applicable_to, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      input.description,
      JSON.stringify(input.steps),
      JSON.stringify(input.applicableTo),
      now,
      now,
    );

    return this.getStrategy(id)!;
  }

  /**
   * 按 ID 获取策略
   */
  getStrategy(id: string): Strategy | null {
    const stmt = this.db.prepare(`SELECT * FROM strategies WHERE id = ?`);
    const row = stmt.get(id) as StrategyRow | undefined;
    if (!row) return null;
    return rowToStrategy(row);
  }

  /**
   * 更新策略字段
   */
  updateStrategy(
    id: string,
    updates: Partial<Pick<Strategy, 'name' | 'description' | 'steps' | 'applicableTo'>>,
  ): Strategy | null {
    const existing = this.getStrategy(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    const name = updates.name ?? existing.name;
    const description = updates.description ?? existing.description;
    const steps = updates.steps ?? existing.steps;
    const applicableTo = updates.applicableTo ?? existing.applicableTo;

    const stmt = this.db.prepare(`
      UPDATE strategies
      SET name = ?, description = ?, steps = ?, applicable_to = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(name, description, JSON.stringify(steps), JSON.stringify(applicableTo), now, id);

    return this.getStrategy(id);
  }

  /**
   * 删除策略
   */
  removeStrategy(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM strategies WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 列出所有策略（按创建时间倒序）
   */
  listStrategies(limit = 100): Strategy[] {
    const stmt = this.db.prepare(
      `SELECT * FROM strategies ORDER BY created_at DESC LIMIT ?`,
    );
    const rows = stmt.all(limit) as StrategyRow[];
    return rows.map(rowToStrategy);
  }

  /**
   * 获取适用于某个 ProblemClass 的所有策略
   */
  getStrategiesFor(problemClassId: string): Strategy[] {
    // applicable_to 是 JSON 数组，用 LIKE 做简单过滤后在内存中精确校验
    const stmt = this.db.prepare(
      `SELECT * FROM strategies WHERE applicable_to LIKE ?`,
    );
    const pattern = `%"${problemClassId}"%`;
    const rows = stmt.all(pattern) as StrategyRow[];
    return rows
      .map(rowToStrategy)
      .filter((s) => s.applicableTo.includes(problemClassId));
  }

  // ---------------------------------------------------------------------------
  // 统计
  // ---------------------------------------------------------------------------

  /**
   * 获取注册表统计信息
   */
  getStats(): {
    problemClassCount: number;
    strategyCount: number;
    avgSignaturesPerClass: number;
    classesWithStrategy: number;
  } {
    const pcCountRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM problem_classes`)
      .get() as { cnt: number };

    const strCountRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM strategies`)
      .get() as { cnt: number };

    const allClasses = this.list(10000);
    const totalSigs = allClasses.reduce((sum, pc) => sum + pc.signatures.length, 0);
    const classesWithStrategy = allClasses.filter((pc) => pc.defaultStrategyId).length;

    return {
      problemClassCount: pcCountRow.cnt,
      strategyCount: strCountRow.cnt,
      avgSignaturesPerClass:
        allClasses.length > 0 ? totalSigs / allClasses.length : 0,
      classesWithStrategy,
    };
  }

  // ---------------------------------------------------------------------------
  // 种子数据
  // ---------------------------------------------------------------------------

  /**
   * 预装常见的 ProblemClass 和 Strategy 种子数据
   * 幂等操作：已存在的条目不会重复插入
   */
  seedDefaults(): void {
    const seeds: Array<{
      id: string;
      name: string;
      description: string;
      signatures: string[];
    }> = [
      {
        id: 'PC_null_deref',
        name: '空指针/空值解引用',
        description: '访问 null/undefined/None 的属性或方法',
        signatures: [
          'NoneType',
          'AttributeError',
          'null pointer',
          'undefined is not',
          'TypeError: Cannot read',
          'NullPointerException',
        ],
      },
      {
        id: 'PC_timeout',
        name: '超时类问题',
        description: '连接超时、请求超时、死锁导致的超时',
        signatures: [
          'timeout',
          'timed out',
          'TimeoutError',
          'deadline exceeded',
          'ETIMEDOUT',
        ],
      },
      {
        id: 'PC_import_error',
        name: '导入/依赖类问题',
        description: '模块找不到、版本不兼容、循环依赖',
        signatures: [
          'ImportError',
          'ModuleNotFoundError',
          'No module named',
          'Cannot find module',
          'version conflict',
        ],
      },
      {
        id: 'PC_assertion_fail',
        name: '断言/测试失败',
        description: '单测失败、断言不成立、预期值不匹配',
        signatures: [
          'AssertionError',
          'AssertionFailure',
          'Expected',
          'assert',
          'test failed',
          'FAIL',
        ],
      },
      {
        id: 'PC_permission',
        name: '权限/认证类问题',
        description: '权限不足、认证失败、token 过期',
        signatures: [
          'PermissionError',
          'Forbidden',
          '403',
          '401',
          'Unauthorized',
          'Access denied',
          'token expired',
        ],
      },
      {
        id: 'PC_data_integrity',
        name: '数据完整性问题',
        description: '数据不一致、约束违反、外键错误',
        signatures: [
          'IntegrityError',
          'constraint',
          'foreign key',
          'unique violation',
          'duplicate key',
        ],
      },
    ];

    for (const s of seeds) {
      if (!this.get(s.id)) {
        this.register(s);
      }
    }

    // 注册通用错误诊断策略
    if (!this.getStrategy('STR_diagnose_error')) {
      this.addStrategy({
        id: 'STR_diagnose_error',
        name: '错误诊断策略',
        description: '通用的错误诊断流程',
        steps: [
          { phase: 'classify', description: '识别错误类型', toolHint: 'classify' },
          {
            phase: 'contextualize',
            description: '确定技术栈和环境',
            toolHint: 'get_context',
          },
          {
            phase: 'constrain',
            description: '缩小到相关子图',
            toolHint: 'explore_graph',
          },
          {
            phase: 'retrieve',
            description: '搜索类似的已解决案例',
            toolHint: 'fuzzy_search_events',
          },
          {
            phase: 'execute',
            description: '执行修复方案',
            toolHint: 'suggest_causes',
          },
        ],
        applicableTo: [
          'PC_null_deref',
          'PC_timeout',
          'PC_import_error',
          'PC_assertion_fail',
          'PC_permission',
          'PC_data_integrity',
        ],
      });

      // 将默认策略关联到所有种子问题类
      for (const s of seeds) {
        this.update(s.id, { defaultStrategyId: 'STR_diagnose_error' });
      }
    }
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
