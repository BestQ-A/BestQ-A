/**
 * AtomGraph — BestQ-A v5 真相层
 *
 * 卡片盒知识图谱 + 双模式引擎：
 * - Atom（原子卡片）：不可再分的单一事实/概念，全局去重
 * - Ref（引用边）：卡片之间的关系，关系本身就是知识
 * - Shortcut（快捷边）：高频路径的髓鞘化缓存
 * - 双模式：发散（tentative 边，探索）vs 编译（compiled 边，沉淀）
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getRefAlgebra, canCompose, isPathLegal } from './ref-algebra.js';

// =============================================================================
// 枚举
// =============================================================================

/** Atom 类型 */
export enum AtomKind {
  FACT        = 'fact',        // 观测事实
  CONCEPT     = 'concept',     // 抽象概念
  ACTION      = 'action',      // 操作步骤
  CONTEXT     = 'context',     // 环境上下文
  PATTERN     = 'pattern',     // 模式标签
  CONJUNCTION = 'conjunction',  // 合取节点：表达 A && B 的联合条件
}

/** Ref（引用边）的语义类型 */
export enum RefKind {
  CAUSES     = 'causes',
  PREVENTS   = 'prevents',
  REQUIRES   = 'requires',
  IS_A       = 'is_a',
  PART_OF    = 'part_of',
  SIMILAR_TO = 'similar_to',
  FIXES      = 'fixes',
  INDICATES  = 'indicates',
  COOCCURS   = 'cooccurs',
}

/** Ref 的学习阶段 */
export type RefMode = 'tentative' | 'compiled';

// =============================================================================
// 数据结构
// =============================================================================

/** 原子卡片 */
export interface Atom {
  id: string;
  content: string;
  kind: AtomKind;
  canonicalKey: string;  // 规范化 key（小写、去标点、排序 tokens），用于同义去重
  refCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Atom 别名（同义词映射） */
export interface AtomAlias {
  atomId: string;
  alias: string;
}

/** Ref 来源 */
export type RefProvenance = 'observed' | 'induced' | 'manual' | 'shortcut';

/** 引用边 */
export interface Ref {
  id: string;
  fromAtomId: string;
  toAtomId: string;
  kind: RefKind;
  weight: number;        // 0.0-1.0
  evidence: number;      // 验证次数
  mode: RefMode;
  provenance: RefProvenance;  // 来源：观测/归纳/手动/快捷
  contextScope: string;       // JSON：此关系成立的上下文条件，如 {"repo":"django","lang":"python"}
  createdAt: string;
  lastUsedAt: string;
}

/** 快捷边（髓鞘化缓存） */
export interface Shortcut {
  id: string;
  fromAtomId: string;
  toAtomId: string;
  viaPath: string[];  // 中间 atom IDs
  totalWeight: number;
  useCount: number;
  createdAt: string;
}

/** 图查询路径结果 */
export interface PathResult {
  atoms: Atom[];
  refs: Ref[];
  totalWeight: number;
}

/** 发散模式结果 */
export interface ExploreResult {
  paths: PathResult[];
  newTentativeRefs: number;
  shortcutHits: number;
  illegalPathsPruned: number;    // 被 RefAlgebra 复合规则剪枝的路径数
}

/** 编译模式结果 */
export interface CompileResult {
  compiledRefs: number;
  weakenedRefs: number;
  prunedRefs: number;
  newShortcuts: number;
}

/** 图统计信息 */
export interface GraphStats {
  atomCount: number;
  refCount: number;
  shortcutCount: number;
  atomsByKind: Record<string, number>;
  refsByKind: Record<string, number>;
  refsByMode: Record<string, number>;
  avgWeight: number;
  orphanAtoms: number;  // refCount = 0 的孤立卡片
}

// =============================================================================
// 内部数据库行类型
// =============================================================================

interface AtomRow {
  id: string;
  content: string;
  kind: string;
  canonical_key: string;
  ref_count: number;
  created_at: string;
  updated_at: string;
}

interface RefRow {
  id: string;
  from_atom_id: string;
  to_atom_id: string;
  kind: string;
  weight: number;
  evidence: number;
  mode: string;
  provenance: string;
  context_scope: string;
  created_at: string;
  last_used_at: string;
}

interface ShortcutRow {
  id: string;
  from_atom_id: string;
  to_atom_id: string;
  via_path: string;
  total_weight: number;
  use_count: number;
  context_scope: string;
  created_at: string;
}

// =============================================================================
// ID 生成工具
// =============================================================================

/** 生成 8 字符 hex ID */
function genId(prefix: 'a' | 'r' | 's'): string {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

/** 当前 ISO 时间戳 */
function now(): string {
  return new Date().toISOString();
}

/** 规范化文本为 canonical key：小写、去标点、排序 tokens */
function canonicalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')  // 保留中英文和数字
    .split(/\s+/)
    .filter(t => t.length > 0)
    .sort()
    .join(' ');
}

// =============================================================================
// 行转接口工具
// =============================================================================

function rowToAtom(row: AtomRow): Atom {
  return {
    id:           row.id,
    content:      row.content,
    kind:         row.kind as AtomKind,
    canonicalKey: row.canonical_key,
    refCount:     row.ref_count,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };
}

function rowToRef(row: RefRow): Ref {
  return {
    id:           row.id,
    fromAtomId:   row.from_atom_id,
    toAtomId:     row.to_atom_id,
    kind:         row.kind as RefKind,
    weight:       row.weight,
    evidence:     row.evidence,
    mode:         row.mode as RefMode,
    provenance:   row.provenance as RefProvenance,
    contextScope: row.context_scope,
    createdAt:    row.created_at,
    lastUsedAt:   row.last_used_at,
  };
}

function rowToShortcut(row: ShortcutRow): Shortcut {
  return {
    id:          row.id,
    fromAtomId:  row.from_atom_id,
    toAtomId:    row.to_atom_id,
    viaPath:     JSON.parse(row.via_path) as string[],
    totalWeight: row.total_weight,
    useCount:    row.use_count,
    createdAt:   row.created_at,
  };
}

// =============================================================================
// AtomGraph 主类
// =============================================================================

export class AtomGraph {
  /** 暴露给 RegulationViewBuilder 等只读消费者使用 */
  readonly db: Database.Database;

  // ---------- Prepared Statements ----------
  // Atom
  private stmtInsertAtom!: Database.Statement;
  private stmtSelectAtomByContentKind!: Database.Statement;
  private stmtSelectAtomById!: Database.Statement;
  private stmtUpdateAtomContent!: Database.Statement;
  private stmtDeleteAtom!: Database.Statement;
  private stmtSearchAtoms!: Database.Statement;
  private stmtSearchAtomsByKind!: Database.Statement;
  private stmtIncrRefCount!: Database.Statement;
  private stmtDecrRefCount!: Database.Statement;

  // Atom Alias
  private stmtInsertAlias!: Database.Statement;
  private stmtFindByAlias!: Database.Statement;

  // Ref
  private stmtInsertRef!: Database.Statement;
  private stmtSelectRefByUniqueKey!: Database.Statement;
  private stmtSelectRefById!: Database.Statement;
  private stmtUpdateRefOnConflict!: Database.Statement;
  private stmtUpdateRef!: Database.Statement;
  private stmtDeleteRef!: Database.Statement;
  private stmtGetNeighborsOut!: Database.Statement;
  private stmtGetNeighborsIn!: Database.Statement;
  private stmtGetNeighborsBoth!: Database.Statement;

  // Shortcut
  private stmtInsertShortcut!: Database.Statement;
  private stmtSelectShortcut!: Database.Statement;
  private stmtIncrShortcutUseCount!: Database.Statement;

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
      CREATE TABLE IF NOT EXISTS atoms (
        id            TEXT PRIMARY KEY,
        content       TEXT NOT NULL,
        kind          TEXT NOT NULL,
        canonical_key TEXT NOT NULL DEFAULT '',
        ref_count     INTEGER DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_atoms_canonical_kind ON atoms(canonical_key, kind);
      CREATE INDEX IF NOT EXISTS idx_atoms_kind ON atoms(kind);

      CREATE TABLE IF NOT EXISTS atom_aliases (
        atom_id TEXT NOT NULL REFERENCES atoms(id) ON DELETE CASCADE,
        alias   TEXT NOT NULL,
        PRIMARY KEY (atom_id, alias)
      );
      CREATE INDEX IF NOT EXISTS idx_aliases_alias ON atom_aliases(alias);

      CREATE TABLE IF NOT EXISTS refs (
        id            TEXT PRIMARY KEY,
        from_atom_id  TEXT NOT NULL REFERENCES atoms(id) ON DELETE CASCADE,
        to_atom_id    TEXT NOT NULL REFERENCES atoms(id) ON DELETE CASCADE,
        kind          TEXT NOT NULL,
        weight        REAL DEFAULT 0.5,
        evidence      INTEGER DEFAULT 0,
        mode          TEXT DEFAULT 'tentative',
        provenance    TEXT DEFAULT 'observed',
        context_scope TEXT DEFAULT '{}',
        created_at    TEXT NOT NULL,
        last_used_at  TEXT NOT NULL,
        UNIQUE(from_atom_id, to_atom_id, kind)
      );
      CREATE INDEX IF NOT EXISTS idx_refs_from ON refs(from_atom_id);
      CREATE INDEX IF NOT EXISTS idx_refs_to   ON refs(to_atom_id);
      CREATE INDEX IF NOT EXISTS idx_refs_kind ON refs(kind);
      CREATE INDEX IF NOT EXISTS idx_refs_mode ON refs(mode);

      CREATE TABLE IF NOT EXISTS shortcuts (
        id            TEXT PRIMARY KEY,
        from_atom_id  TEXT NOT NULL REFERENCES atoms(id) ON DELETE CASCADE,
        to_atom_id    TEXT NOT NULL REFERENCES atoms(id) ON DELETE CASCADE,
        via_path      TEXT NOT NULL,
        total_weight  REAL DEFAULT 0,
        use_count     INTEGER DEFAULT 0,
        context_scope TEXT DEFAULT '{}',
        created_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_shortcuts_from ON shortcuts(from_atom_id);
      CREATE INDEX IF NOT EXISTS idx_shortcuts_to   ON shortcuts(to_atom_id);
    `);
  }

  // ==========================================================================
  // Prepared Statements 预编译
  // ==========================================================================

  private prepareStatements(): void {
    // Atom
    this.stmtInsertAtom = this.db.prepare(`
      INSERT OR IGNORE INTO atoms (id, content, kind, canonical_key, ref_count, created_at, updated_at)
      VALUES (@id, @content, @kind, @canonicalKey, 0, @createdAt, @updatedAt)
    `);
    this.stmtSelectAtomByContentKind = this.db.prepare(`
      SELECT * FROM atoms WHERE canonical_key = ? AND kind = ?
    `);
    this.stmtSelectAtomById = this.db.prepare(`
      SELECT * FROM atoms WHERE id = ?
    `);
    this.stmtUpdateAtomContent = this.db.prepare(`
      UPDATE atoms SET content = ?, updated_at = ? WHERE id = ?
    `);
    this.stmtDeleteAtom = this.db.prepare(`
      DELETE FROM atoms WHERE id = ?
    `);
    this.stmtSearchAtoms = this.db.prepare(`
      SELECT * FROM atoms WHERE content LIKE ? LIMIT ?
    `);
    this.stmtSearchAtomsByKind = this.db.prepare(`
      SELECT * FROM atoms WHERE content LIKE ? AND kind = ? LIMIT ?
    `);
    this.stmtIncrRefCount = this.db.prepare(`
      UPDATE atoms SET ref_count = ref_count + 1 WHERE id = ?
    `);
    this.stmtDecrRefCount = this.db.prepare(`
      UPDATE atoms SET ref_count = MAX(0, ref_count - 1) WHERE id = ?
    `);

    // Atom Alias
    this.stmtInsertAlias = this.db.prepare(`
      INSERT OR IGNORE INTO atom_aliases (atom_id, alias) VALUES (?, ?)
    `);
    this.stmtFindByAlias = this.db.prepare(`
      SELECT a.* FROM atoms a JOIN atom_aliases al ON a.id = al.atom_id WHERE al.alias = ?
    `);

    // Ref
    this.stmtInsertRef = this.db.prepare(`
      INSERT OR IGNORE INTO refs (id, from_atom_id, to_atom_id, kind, weight, evidence, mode, provenance, context_scope, created_at, last_used_at)
      VALUES (@id, @fromAtomId, @toAtomId, @kind, @weight, @evidence, @mode, @provenance, @contextScope, @createdAt, @lastUsedAt)
    `);
    this.stmtSelectRefByUniqueKey = this.db.prepare(`
      SELECT * FROM refs WHERE from_atom_id = ? AND to_atom_id = ? AND kind = ?
    `);
    this.stmtSelectRefById = this.db.prepare(`
      SELECT * FROM refs WHERE id = ?
    `);
    this.stmtUpdateRefOnConflict = this.db.prepare(`
      UPDATE refs SET weight = ?, evidence = evidence + 1, last_used_at = ? WHERE from_atom_id = ? AND to_atom_id = ? AND kind = ?
    `);
    this.stmtUpdateRef = this.db.prepare(`
      UPDATE refs SET kind = @kind, weight = @weight, mode = @mode WHERE id = @id
    `);
    this.stmtDeleteRef = this.db.prepare(`
      DELETE FROM refs WHERE id = ?
    `);

    // 邻居查询（仅出向）
    this.stmtGetNeighborsOut = this.db.prepare(`
      SELECT r.*, a.* FROM refs r
      JOIN atoms a ON a.id = r.to_atom_id
      WHERE r.from_atom_id = ?
    `);
    // 仅入向
    this.stmtGetNeighborsIn = this.db.prepare(`
      SELECT r.*, a.* FROM refs r
      JOIN atoms a ON a.id = r.from_atom_id
      WHERE r.to_atom_id = ?
    `);
    // 双向
    this.stmtGetNeighborsBoth = this.db.prepare(`
      SELECT r.*, a.id AS nb_id, a.content AS nb_content, a.kind AS nb_kind,
             a.ref_count AS nb_ref_count, a.created_at AS nb_created_at, a.updated_at AS nb_updated_at,
             'outgoing' AS direction
      FROM refs r JOIN atoms a ON a.id = r.to_atom_id WHERE r.from_atom_id = ?
      UNION ALL
      SELECT r.*, a.id AS nb_id, a.content AS nb_content, a.kind AS nb_kind,
             a.ref_count AS nb_ref_count, a.created_at AS nb_created_at, a.updated_at AS nb_updated_at,
             'incoming' AS direction
      FROM refs r JOIN atoms a ON a.id = r.from_atom_id WHERE r.to_atom_id = ?
    `);

    // Shortcut
    this.stmtInsertShortcut = this.db.prepare(`
      INSERT INTO shortcuts (id, from_atom_id, to_atom_id, via_path, total_weight, use_count, created_at)
      VALUES (@id, @fromAtomId, @toAtomId, @viaPath, @totalWeight, 0, @createdAt)
    `);
    this.stmtSelectShortcut = this.db.prepare(`
      SELECT * FROM shortcuts WHERE from_atom_id = ? AND to_atom_id = ?
    `);
    this.stmtIncrShortcutUseCount = this.db.prepare(`
      UPDATE shortcuts SET use_count = use_count + 1 WHERE id = ?
    `);
  }

  // ==========================================================================
  // Atom CRUD
  // ==========================================================================

  /**
   * 创建 Atom，自动去重（canonical_key+kind 相同则返回已有的）
   * 若原始 content 与已有 content 不同，记为别名
   */
  addAtom(content: string, kind: AtomKind): Atom {
    const ts  = now();
    const id  = genId('a');
    const ck  = canonicalize(content);

    // INSERT OR IGNORE：如果 (canonical_key, kind) 已存在则跳过
    this.stmtInsertAtom.run({ id, content, kind, canonicalKey: ck, createdAt: ts, updatedAt: ts });

    // 无论插入还是跳过，都返回数据库中的实际记录
    const row  = this.stmtSelectAtomByContentKind.get(ck, kind) as AtomRow;
    const atom = rowToAtom(row);

    // 如果原始 content 和已有 content 不同，记为别名
    if (atom.content !== content) {
      this.stmtInsertAlias.run(atom.id, content);
    }

    return atom;
  }

  /**
   * 按 ID 获取 Atom
   */
  getAtom(id: string): Atom | null {
    const row = this.stmtSelectAtomById.get(id) as AtomRow | undefined;
    return row ? rowToAtom(row) : null;
  }

  /**
   * 修改 Atom 内容（SSOT：所有引用通过 ID 关联，自动看到新内容）
   */
  updateAtom(id: string, content: string): Atom | null {
    const ts = now();
    const info = this.stmtUpdateAtomContent.run(content, ts, id);
    if (info.changes === 0) return null;
    return this.getAtom(id);
  }

  /**
   * 删除 Atom（级联删除所有关联 Ref 和涉及的 Shortcut，由 ON DELETE CASCADE 保证）
   */
  removeAtom(id: string): boolean {
    const info = this.stmtDeleteAtom.run(id);
    return info.changes > 0;
  }

  /**
   * 按内容模糊搜索 Atom
   */
  findAtoms(query: string, kind?: AtomKind, limit = 20): Atom[] {
    const pattern = `%${query}%`;
    if (kind) {
      const rows = this.stmtSearchAtomsByKind.all(pattern, kind, limit) as AtomRow[];
      return rows.map(rowToAtom);
    }
    const rows = this.stmtSearchAtoms.all(pattern, limit) as AtomRow[];
    return rows.map(rowToAtom);
  }

  /**
   * 为 Atom 添加别名
   */
  addAlias(atomId: string, alias: string): void {
    this.stmtInsertAlias.run(atomId, alias);
  }

  /**
   * 通过别名查找 Atom
   */
  findByAlias(alias: string): Atom | null {
    const row = this.stmtFindByAlias.get(alias) as AtomRow | undefined;
    return row ? rowToAtom(row) : null;
  }

  /**
   * 创建合取节点：表达 A && B（联合条件）
   * 返回一个 CONJUNCTION 类型的 Atom，自动建立 PART_OF 边
   */
  createConjunction(atomIds: string[], description?: string): Atom {
    const atoms = atomIds.map(id => this.getAtom(id)).filter(Boolean) as Atom[];
    if (atoms.length < 2) throw new Error('合取节点至少需要 2 个 Atom');

    // 用排序后的 ID 作为 content，确保去重
    const sortedIds = [...atomIds].sort();
    const content = description || `conjunction(${sortedIds.join(', ')})`;

    const conjAtom = this.addAtom(content, AtomKind.CONJUNCTION);

    // 建立 PART_OF 边：每个成员 → 合取节点
    for (const aId of atomIds) {
      this.addRef(aId, conjAtom.id, RefKind.PART_OF, { weight: 1.0, mode: 'compiled', provenance: 'manual' });
    }

    return conjAtom;
  }

  /**
   * 添加合取因果关系：(A && B) causes C
   * 创建合取节点 + causes 边，避免拆成 A→C 和 B→C 夸大单因子能力
   */
  addConjunctCause(
    preconditionAtomIds: string[],
    effectAtomId: string,
    options?: { weight?: number; provenance?: RefProvenance; contextScope?: Record<string, unknown> }
  ): { conjunction: Atom; ref: Ref } {
    const conj = this.createConjunction(preconditionAtomIds);
    const ref = this.addRef(conj.id, effectAtomId, RefKind.CAUSES, {
      weight:       options?.weight ?? 0.5,
      mode:         'tentative',
      provenance:   options?.provenance ?? 'observed',
      contextScope: options?.contextScope,
    });
    return { conjunction: conj, ref };
  }

  // ==========================================================================
  // Ref CRUD
  // ==========================================================================

  /**
   * 创建 Ref（自动更新两端 Atom 的 refCount）
   * 如果 fromAtomId+toAtomId+kind 已存在，更新 weight 和 evidence
   */
  addRef(
    fromAtomId: string,
    toAtomId: string,
    kind: RefKind,
    options?: {
      weight?: number;
      mode?: RefMode;
      provenance?: RefProvenance;
      contextScope?: Record<string, unknown>;
    }
  ): Ref {
    const weight       = options?.weight     ?? 0.5;
    const mode         = options?.mode       ?? 'tentative';
    const provenance   = options?.provenance ?? 'observed';
    const contextScope = JSON.stringify(options?.contextScope ?? {});
    const ts           = now();
    const id           = genId('r');

    // 尝试插入
    const insertInfo = this.stmtInsertRef.run({
      id,
      fromAtomId,
      toAtomId,
      kind,
      weight,
      evidence: 0,
      mode,
      provenance,
      contextScope,
      createdAt:  ts,
      lastUsedAt: ts,
    });

    if (insertInfo.changes > 0) {
      // 新建成功，维护两端 refCount
      this.stmtIncrRefCount.run(fromAtomId);
      this.stmtIncrRefCount.run(toAtomId);
    } else {
      // 已存在，更新 weight + evidence
      this.stmtUpdateRefOnConflict.run(weight, ts, fromAtomId, toAtomId, kind);
    }

    const row = this.stmtSelectRefByUniqueKey.get(fromAtomId, toAtomId, kind) as RefRow;
    return rowToRef(row);
  }

  /**
   * 按 ID 获取 Ref
   */
  getRef(id: string): Ref | null {
    const row = this.stmtSelectRefById.get(id) as RefRow | undefined;
    return row ? rowToRef(row) : null;
  }

  /**
   * 修改 Ref 类型或权重
   */
  updateRef(id: string, updates: Partial<Pick<Ref, 'kind' | 'weight' | 'mode'>>): Ref | null {
    const existing = this.getRef(id);
    if (!existing) return null;

    const kind   = updates.kind   ?? existing.kind;
    const weight = updates.weight ?? existing.weight;
    const mode   = updates.mode   ?? existing.mode;

    this.stmtUpdateRef.run({ id, kind, weight, mode });
    return this.getRef(id);
  }

  /**
   * 删除 Ref（自动更新两端 refCount）
   */
  removeRef(id: string): boolean {
    const existing = this.getRef(id);
    if (!existing) return false;

    const info = this.stmtDeleteRef.run(id);
    if (info.changes > 0) {
      this.stmtDecrRefCount.run(existing.fromAtomId);
      this.stmtDecrRefCount.run(existing.toAtomId);
      return true;
    }
    return false;
  }

  // ==========================================================================
  // 图查询
  // ==========================================================================

  /**
   * 获取一个 Atom 的所有直接邻居（1-hop）
   */
  getNeighbors(
    atomId: string,
    options?: {
      direction?: 'outgoing' | 'incoming' | 'both';
      refKind?: RefKind;
      mode?: RefMode;
      minWeight?: number;
    }
  ): Array<{ atom: Atom; ref: Ref }> {
    const direction = options?.direction ?? 'outgoing';
    const minWeight = options?.minWeight ?? 0;

    let rows: Array<Record<string, unknown>>;

    if (direction === 'outgoing') {
      rows = this.stmtGetNeighborsOut.all(atomId) as Array<Record<string, unknown>>;
    } else if (direction === 'incoming') {
      rows = this.stmtGetNeighborsIn.all(atomId) as Array<Record<string, unknown>>;
    } else {
      rows = this.stmtGetNeighborsBoth.all(atomId, atomId) as Array<Record<string, unknown>>;
    }

    // 过滤并解析
    const results: Array<{ atom: Atom; ref: Ref }> = [];
    for (const row of rows) {
      // JOIN 后的行包含 refs 列和 atoms 列
      const refRow: RefRow = {
        id:            row.id as string,
        from_atom_id:  row.from_atom_id as string,
        to_atom_id:    row.to_atom_id as string,
        kind:          row.kind as string,
        weight:        row.weight as number,
        evidence:      row.evidence as number,
        mode:          row.mode as string,
        provenance:    (row.provenance as string) ?? 'observed',
        context_scope: (row.context_scope as string) ?? '{}',
        created_at:    row.created_at as string,
        last_used_at:  row.last_used_at as string,
      };

      // 从 JOIN 的 atoms 字段重建（atoms 和 refs 有重名列，SQLite 默认后者覆盖前者）
      // 因此 nb_id 等别名来自 BOTH 查询；outgoing/incoming 用另一种方式获取
      let atomRow: AtomRow;
      if (direction === 'both') {
        atomRow = {
          id:            row.nb_id as string,
          content:       row.nb_content as string,
          kind:          row.nb_kind as string,
          canonical_key: (row.nb_canonical_key as string) ?? '',
          ref_count:     row.nb_ref_count as number,
          created_at:    row.nb_created_at as string,
          updated_at:    row.nb_updated_at as string,
        };
      } else {
        // outgoing/incoming 用简单 JOIN，需要从 DB 重新取 atom
        const targetId = direction === 'outgoing' ? refRow.to_atom_id : refRow.from_atom_id;
        const a = this.getAtom(targetId);
        if (!a) continue;
        atomRow = {
          id:            a.id,
          content:       a.content,
          kind:          a.kind,
          canonical_key: a.canonicalKey,
          ref_count:     a.refCount,
          created_at:    a.createdAt,
          updated_at:    a.updatedAt,
        };
      }

      // 过滤条件
      if (options?.refKind && refRow.kind !== options.refKind) continue;
      if (options?.mode && refRow.mode !== options.mode) continue;
      if (refRow.weight < minWeight) continue;

      results.push({ atom: rowToAtom(atomRow), ref: rowToRef(refRow) });
    }

    return results;
  }

  /**
   * 找从 startAtom 到 endAtom 的所有路径（BFS，最大深度限制）
   */
  findPaths(startAtomId: string, endAtomId: string, maxDepth = 5): PathResult[] {
    if (startAtomId === endAtomId) return [];

    const results: PathResult[] = [];

    // BFS 队列：{ atomIds: string[], refs: Ref[], totalWeight: number }
    type QueueEntry = { atomIds: string[]; refs: Ref[]; totalWeight: number };
    const queue: QueueEntry[] = [{ atomIds: [startAtomId], refs: [], totalWeight: 1.0 }];
    const MAX_PATHS = 50;

    while (queue.length > 0 && results.length < MAX_PATHS) {
      const entry = queue.shift()!;
      const currentId = entry.atomIds[entry.atomIds.length - 1];

      if (entry.atomIds.length - 1 >= maxDepth) continue;

      const neighbors = this.getNeighbors(currentId, { direction: 'outgoing' });

      for (const { atom, ref } of neighbors) {
        if (entry.atomIds.includes(atom.id)) continue; // 避免环路

        const newWeight = entry.totalWeight * ref.weight;
        const newAtomIds = [...entry.atomIds, atom.id];
        const newRefs    = [...entry.refs, ref];

        if (atom.id === endAtomId) {
          // 找到路径，收集所有 Atom 对象
          const atoms = newAtomIds.map(id => this.getAtom(id)).filter(Boolean) as Atom[];
          results.push({ atoms, refs: newRefs, totalWeight: newWeight });
        } else {
          queue.push({ atomIds: newAtomIds, refs: newRefs, totalWeight: newWeight });
        }
      }
    }

    // 按权重降序排序
    return results.sort((a, b) => b.totalWeight - a.totalWeight);
  }

  /**
   * 获取一个 Atom 的所有 N-hop 可达 Atom（广度优先）
   */
  getReachable(atomId: string, maxDepth = 3, minWeight = 0): Atom[] {
    const visited = new Set<string>([atomId]);
    const queue: Array<{ id: string; depth: number }> = [{ id: atomId, depth: 0 }];
    const result: Atom[] = [];

    while (queue.length > 0) {
      const entry = queue.shift()!;
      if (entry.depth >= maxDepth) continue;

      const neighbors = this.getNeighbors(entry.id, { direction: 'outgoing', minWeight });
      for (const { atom } of neighbors) {
        if (!visited.has(atom.id)) {
          visited.add(atom.id);
          result.push(atom);
          queue.push({ id: atom.id, depth: entry.depth + 1 });
        }
      }
    }

    return result;
  }

  // ==========================================================================
  // Shortcut
  // ==========================================================================

  /**
   * 查找是否有现成的快捷路径
   */
  findShortcut(fromAtomId: string, toAtomId: string): Shortcut | null {
    const row = this.stmtSelectShortcut.get(fromAtomId, toAtomId) as ShortcutRow | undefined;
    return row ? rowToShortcut(row) : null;
  }

  /**
   * 创建快捷边
   */
  addShortcut(fromAtomId: string, toAtomId: string, viaPath: string[]): Shortcut {
    // 若已存在则先返回
    const existing = this.findShortcut(fromAtomId, toAtomId);
    if (existing) return existing;

    const id = genId('s');
    const ts = now();

    // 计算路径总权重（所有沿途 ref weight 之积）
    let totalWeight = 1.0;
    const allIds = [fromAtomId, ...viaPath, toAtomId];
    for (let i = 0; i < allIds.length - 1; i++) {
      const row = this.stmtSelectRefByUniqueKey.all(
        allIds[i], allIds[i + 1], '%'  // 取任意 kind
      );
      if (row.length > 0) {
        totalWeight *= (row[0] as RefRow).weight;
      }
    }

    this.stmtInsertShortcut.run({
      id,
      fromAtomId,
      toAtomId,
      viaPath:     JSON.stringify(viaPath),
      totalWeight,
      createdAt:   ts,
    });

    return this.findShortcut(fromAtomId, toAtomId)!;
  }

  /**
   * 使用快捷边（增加 useCount）
   */
  useShortcut(id: string): void {
    this.stmtIncrShortcutUseCount.run(id);
  }

  // ==========================================================================
  // 发散模式（Explore）
  // ==========================================================================

  /**
   * 从一组观测 Atom 出发，找所有候选解释路径
   *
   * 策略：
   * 1. 先查 Shortcut（快速命中）
   * 2. 再查 compiled Ref（已验证的知识）
   * 3. 最后查 tentative Ref 和创建新 tentative Ref（探索）
   */
  explore(
    observationAtomIds: string[],
    options?: {
      maxDepth?: number;
      maxPaths?: number;
      targetKinds?: AtomKind[];
    }
  ): ExploreResult {
    const maxDepth   = options?.maxDepth   ?? 3;
    const maxPaths   = options?.maxPaths   ?? 10;
    const targetKinds = options?.targetKinds ?? [AtomKind.PATTERN, AtomKind.ACTION];

    const allPaths: PathResult[] = [];
    let newTentativeRefs = 0;
    let shortcutHits     = 0;
    let illegalPathsPruned = 0;

    // 为 targetKinds 构建快速查找集合
    const targetKindSet = new Set<string>(targetKinds);

    for (const obsId of observationAtomIds) {
      // 步骤 1：查 Shortcut（快速命中）
      const shortcutRows = this.db
        .prepare(`SELECT * FROM shortcuts WHERE from_atom_id = ?`)
        .all(obsId) as ShortcutRow[];

      for (const sRow of shortcutRows) {
        const toAtom = this.getAtom(sRow.to_atom_id);
        if (!toAtom || !targetKindSet.has(toAtom.kind)) continue;

        shortcutHits++;
        this.stmtIncrShortcutUseCount.run(sRow.id);

        const viaPath: string[] = JSON.parse(sRow.via_path) as string[];
        const atomIds = [sRow.from_atom_id, ...viaPath, sRow.to_atom_id];
        const atoms   = atomIds.map(id => this.getAtom(id)).filter(Boolean) as Atom[];
        allPaths.push({ atoms, refs: [], totalWeight: sRow.total_weight });
      }

      // 步骤 2 & 3：BFS 遍历 refs（优先 compiled，其次 tentative）
      type BFSEntry = { atomIds: string[]; refs: Ref[]; totalWeight: number };
      const queue: BFSEntry[] = [{ atomIds: [obsId], refs: [], totalWeight: 1.0 }];
      const visited = new Set<string>([obsId]);

      while (queue.length > 0) {
        const entry = queue.shift()!;
        const currentId = entry.atomIds[entry.atomIds.length - 1];

        if (entry.atomIds.length - 1 >= maxDepth) continue;

        // 获取所有邻居，已排好序（compiled 优先）
        const neighborsRaw = this.db.prepare(`
          SELECT * FROM refs WHERE from_atom_id = ? ORDER BY CASE mode WHEN 'compiled' THEN 0 ELSE 1 END, weight DESC
        `).all(currentId) as RefRow[];

        let hasNeighbors = false;

        for (const rRow of neighborsRaw) {
          const neighborId = rRow.to_atom_id;
          if (entry.atomIds.includes(neighborId)) continue; // 避免环路

          const ref = rowToRef(rRow);

          // RefAlgebra 复合规则检查：新边能否与路径末尾合法复合
          if (entry.refs.length > 0) {
            const lastKind = entry.refs[entry.refs.length - 1].kind;
            if (!canCompose(lastKind, ref.kind)) {
              illegalPathsPruned++;
              continue; // 非法复合，跳过此边
            }
          }

          hasNeighbors = true;
          const newWeight  = entry.totalWeight * ref.weight;
          const newAtomIds = [...entry.atomIds, neighborId];
          const newRefs    = [...entry.refs, ref];

          const atom = this.getAtom(neighborId);
          if (!atom) continue;

          if (targetKindSet.has(atom.kind)) {
            // 找到目标类型，记录路径
            const atoms = newAtomIds.map(id => this.getAtom(id)).filter(Boolean) as Atom[];
            allPaths.push({ atoms, refs: newRefs, totalWeight: newWeight });
          } else if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push({ atomIds: newAtomIds, refs: newRefs, totalWeight: newWeight });
          }
        }

        // 步骤 3：若没有邻居且深度 < maxDepth，在 obsId 和 currentId 之间创建 tentative Ref
        if (!hasNeighbors && currentId !== obsId) {
          // 尝试找 obsId 到 currentId 的反向连接（探索用）
          const existingBack = this.stmtSelectRefByUniqueKey.get(obsId, currentId, RefKind.COOCCURS);
          if (!existingBack) {
            this.addRef(obsId, currentId, RefKind.COOCCURS, { weight: 0.3, mode: 'tentative', provenance: 'observed' });
            newTentativeRefs++;
          }
        }
      }
    }

    // 按权重排序，取 top maxPaths
    allPaths.sort((a, b) => b.totalWeight - a.totalWeight);
    const topPaths = allPaths.slice(0, maxPaths);

    return { paths: topPaths, newTentativeRefs, shortcutHits, illegalPathsPruned };
  }

  // ==========================================================================
  // 编译模式（Compile）
  // ==========================================================================

  /**
   * 强化正确路径，削弱错误路径
   */
  compile(
    correctPath: { atomIds: string[] },
    failedPaths?: { atomIds: string[] }[]
  ): CompileResult {
    let compiledRefs = 0;
    let weakenedRefs = 0;
    let prunedRefs   = 0;

    // 预检：收集正确路径上的 ref kinds，验证复合合法性
    const correctRefKinds: string[] = [];
    for (let i = 0; i < correctPath.atomIds.length - 1; i++) {
      const from = correctPath.atomIds[i];
      const to   = correctPath.atomIds[i + 1];
      const allRefs = this.db.prepare(
        `SELECT * FROM refs WHERE from_atom_id = ? AND to_atom_id = ? LIMIT 1`
      ).get(from, to) as RefRow | undefined;
      if (allRefs) {
        correctRefKinds.push(allRefs.kind);
      }
    }

    // 如果路径有足够的 ref kinds，验证复合合法性
    if (correctRefKinds.length >= 2 && !isPathLegal(correctRefKinds)) {
      // 路径违反复合规则，不允许 compile
      return { compiledRefs: 0, weakenedRefs: 0, prunedRefs: 0, newShortcuts: 0 };
    }

    const ts = now();

    // 强化正确路径
    const correctIds = correctPath.atomIds;
    const stmtStrength = this.db.prepare(`
      UPDATE refs
      SET weight       = MIN(1.0, weight + 0.1),
          evidence     = evidence + 1,
          mode         = 'compiled',
          last_used_at = ?
      WHERE from_atom_id = ? AND to_atom_id = ?
    `);

    for (let i = 0; i < correctIds.length - 1; i++) {
      const info = stmtStrength.run(ts, correctIds[i], correctIds[i + 1]);
      if (info.changes > 0) compiledRefs++;
    }

    // 削弱失败路径上的 tentative ref
    if (failedPaths && failedPaths.length > 0) {
      const stmtWeaken = this.db.prepare(`
        UPDATE refs
        SET weight = MAX(0.0, weight - 0.05)
        WHERE from_atom_id = ? AND to_atom_id = ? AND mode = 'tentative'
      `);

      for (const failedPath of failedPaths) {
        const ids = failedPath.atomIds;
        for (let i = 0; i < ids.length - 1; i++) {
          const info = stmtWeaken.run(ids[i], ids[i + 1]);
          if (info.changes > 0) weakenedRefs++;
        }
      }
    }

    // 修剪权重 < 0.1 的 tentative 边
    const weakRows = this.db.prepare(`
      SELECT * FROM refs WHERE mode = 'tentative' AND weight < 0.1
    `).all() as RefRow[];

    for (const row of weakRows) {
      this.removeRef(row.id);
      prunedRefs++;
    }

    return { compiledRefs, weakenedRefs, prunedRefs, newShortcuts: 0 };
  }

  /**
   * 髓鞘化：为高频 compiled 路径创建 Shortcut
   */
  myelinate(options?: { minUseCount?: number; minWeight?: number }): Shortcut[] {
    const minUseCount = options?.minUseCount ?? 3;
    const minWeight   = options?.minWeight   ?? 0.6;

    // 找所有 compiled 且高权重的 ref
    const compiledRefs = this.db.prepare(`
      SELECT * FROM refs
      WHERE mode = 'compiled' AND weight >= ? AND evidence >= ?
      ORDER BY weight DESC
    `).all(minWeight, minUseCount) as RefRow[];

    // 构建邻接表，用于寻找长链（长度 >= 3 的路径）
    const adjacency = new Map<string, RefRow[]>();
    for (const ref of compiledRefs) {
      if (!adjacency.has(ref.from_atom_id)) {
        adjacency.set(ref.from_atom_id, []);
      }
      adjacency.get(ref.from_atom_id)!.push(ref);
    }

    const newShortcuts: Shortcut[] = [];
    const createdPairs = new Set<string>();

    // DFS 查找长度 >= 3（跳数 >= 2，即中间有节点）的路径
    const findChains = (
      currentId: string,
      chain: string[],
      chainRefs: RefRow[]
    ): void => {
      const nextRefs = adjacency.get(currentId) || [];

      for (const nextRef of nextRefs) {
        if (chain.includes(nextRef.to_atom_id)) continue; // 避免环路

        const newChain     = [...chain, nextRef.to_atom_id];
        const newChainRefs = [...chainRefs, nextRef];

        // 链长度 >= 3（含首尾，中间 >= 1 个节点，即跳数 >= 2）
        if (newChain.length >= 3) {
          const fromId = newChain[0];
          const toId   = newChain[newChain.length - 1];
          const pairKey = `${fromId}→${toId}`;

          if (!createdPairs.has(pairKey)) {
            createdPairs.add(pairKey);
            const existing = this.findShortcut(fromId, toId);
            if (!existing) {
              const viaPath = newChain.slice(1, -1);
              const totalWeight = newChainRefs.reduce((acc, r) => acc * r.weight, 1.0);

              const id = genId('s');
              const ts = now();
              this.stmtInsertShortcut.run({
                id,
                fromAtomId:  fromId,
                toAtomId:    toId,
                viaPath:     JSON.stringify(viaPath),
                totalWeight,
                createdAt:   ts,
              });

              const sc = this.findShortcut(fromId, toId);
              if (sc) newShortcuts.push(sc);
            }
          }
        }

        findChains(nextRef.to_atom_id, newChain, newChainRefs);
      }
    };

    // 从每个有出边的节点出发
    for (const startId of adjacency.keys()) {
      findChains(startId, [startId], []);
    }

    return newShortcuts;
  }

  /**
   * 修剪：删除低权重边和孤立卡片
   */
  prune(options?: {
    minWeight?: number;
    removeOrphans?: boolean;
  }): { prunedRefs: number; prunedAtoms: number } {
    const minWeight    = options?.minWeight    ?? 0.1;
    const removeOrphans = options?.removeOrphans ?? false;

    // 删除低权重 tentative 边
    const weakRows = this.db.prepare(`
      SELECT * FROM refs WHERE mode = 'tentative' AND weight < ?
    `).all(minWeight) as RefRow[];

    let prunedRefs = 0;
    for (const row of weakRows) {
      this.removeRef(row.id);
      prunedRefs++;
    }

    // 删除孤立卡片（refCount = 0）
    let prunedAtoms = 0;
    if (removeOrphans) {
      const orphanRows = this.db.prepare(`
        SELECT * FROM atoms WHERE ref_count = 0
      `).all() as AtomRow[];

      for (const row of orphanRows) {
        this.removeAtom(row.id);
        prunedAtoms++;
      }
    }

    return { prunedRefs, prunedAtoms };
  }

  // ==========================================================================
  // 从 Observation 自动构建
  // ==========================================================================

  /**
   * 将一组 Fact 拆解为 Atom 并建立 cooccurs 关系
   */
  ingestFacts(
    facts: Array<{ pred: string; value: unknown; args?: Record<string, unknown> }>,
    context?: Record<string, unknown>
  ): Atom[] {
    const atoms: Atom[] = [];

    // 创建 FACT 类型的 Atom
    for (const fact of facts) {
      const content = `${fact.pred}: ${JSON.stringify(fact.value)}`;
      atoms.push(this.addAtom(content, AtomKind.FACT));
    }

    // 创建 CONTEXT 类型的 Atom
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        const content = `${key}: ${value}`;
        atoms.push(this.addAtom(content, AtomKind.CONTEXT));
      }
    }

    // 在所有新建的 Atom 之间建立 COOCCURS ref（tentative, weight=0.3）
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        this.addRef(atoms[i].id, atoms[j].id, RefKind.COOCCURS, {
          weight:     0.3,
          mode:       'tentative',
          provenance: 'observed',
        });
      }
    }

    return atoms;
  }

  /**
   * 将一次 fix 记录转化为 compile 操作
   */
  ingestFix(fixDescription: string, relatedAtomIds: string[]): CompileResult {
    // 创建一个 PATTERN Atom 表示此次 fix
    const fixAtom = this.addAtom(fixDescription, AtomKind.PATTERN);

    // 将 fix Atom 加入路径末尾
    const atomIds = [...relatedAtomIds, fixAtom.id];

    // 编译这条路径
    const result = this.compile({ atomIds });
    return result;
  }

  // ==========================================================================
  // 统计
  // ==========================================================================

  /**
   * 获取图统计信息
   */
  getStats(): GraphStats {
    const atomCount    = (this.db.prepare(`SELECT COUNT(*) AS c FROM atoms`).get() as { c: number }).c;
    const refCount     = (this.db.prepare(`SELECT COUNT(*) AS c FROM refs`).get() as { c: number }).c;
    const shortcutCount = (this.db.prepare(`SELECT COUNT(*) AS c FROM shortcuts`).get() as { c: number }).c;
    const orphanAtoms  = (this.db.prepare(`SELECT COUNT(*) AS c FROM atoms WHERE ref_count = 0`).get() as { c: number }).c;

    const avgWeightRow = this.db.prepare(`SELECT AVG(weight) AS avg FROM refs`).get() as { avg: number | null };
    const avgWeight    = avgWeightRow.avg ?? 0;

    // 按 kind 分组统计
    const atomsByKindRows = this.db.prepare(`
      SELECT kind, COUNT(*) AS c FROM atoms GROUP BY kind
    `).all() as Array<{ kind: string; c: number }>;
    const atomsByKind: Record<string, number> = {};
    for (const row of atomsByKindRows) {
      atomsByKind[row.kind] = row.c;
    }

    const refsByKindRows = this.db.prepare(`
      SELECT kind, COUNT(*) AS c FROM refs GROUP BY kind
    `).all() as Array<{ kind: string; c: number }>;
    const refsByKind: Record<string, number> = {};
    for (const row of refsByKindRows) {
      refsByKind[row.kind] = row.c;
    }

    const refsByModeRows = this.db.prepare(`
      SELECT mode, COUNT(*) AS c FROM refs GROUP BY mode
    `).all() as Array<{ mode: string; c: number }>;
    const refsByMode: Record<string, number> = {};
    for (const row of refsByModeRows) {
      refsByMode[row.mode] = row.c;
    }

    return {
      atomCount,
      refCount,
      shortcutCount,
      atomsByKind,
      refsByKind,
      refsByMode,
      avgWeight,
      orphanAtoms,
    };
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
