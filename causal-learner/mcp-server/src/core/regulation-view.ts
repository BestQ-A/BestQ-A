/**
 * regulation-view.ts — Regulation 降级为视图
 *
 * 系统不变量：
 * - 图是唯一写模型：所有知识变更先落 Atom/Ref，再物化为 Regulation 视图
 * - Regulation 只是读视图：不可直接手工维护，它是 compiled Ref 的投影
 *
 * RegulationViewBuilder 不拥有自己的 SQLite 表，只读 AtomGraph 的 atoms/refs 表。
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';

// =============================================================================
// 接口定义
// =============================================================================

/** 从图投影出的 Regulation 视图 */
export interface RegulationView {
  id: string;                    // 由 compiled Ref 链的 hash 生成
  description: string;           // 人类可读描述

  // 从 Ref 投影的因果结构
  preconditions: Array<{
    atomId: string;
    content: string;
    kind: string;
  }>;
  effects: Array<{
    atomId: string;
    content: string;
    kind: string;
  }>;

  // 从 Ref 聚合的度量
  avgWeight: number;
  totalEvidence: number;
  refIds: string[];              // 来源 Ref IDs

  // 从 ContextScope 聚合的适用条件
  contextScope: Record<string, unknown>;

  // 状态映射：compiled + 高 weight = confirmed，低 weight = hypothesis
  status: 'confirmed' | 'hypothesis' | 'candidate';

  // 时间戳
  lastUpdated: string;
}

/** 旧的 Regulation 接口（兼容现有 list_regulations 等 MCP 工具） */
export interface LegacyRegulation {
  regulationId: string;
  status: 'candidate' | 'hypothesis' | 'confirmed' | 'retired';
  pre: Array<{ pred: string; value: unknown; args?: Record<string, unknown> }>;
  eff: Array<{ pred: string; value: unknown; args?: Record<string, unknown> }>;
  description?: string;
  supportN?: number;
  counterexampleN?: number;
  explainedCount?: number;
  tags?: string[];
}

// =============================================================================
// 内部数据库行类型
// =============================================================================

/** refs 表原始行 */
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

/** atoms 表原始行 */
interface AtomRow {
  id: string;
  content: string;
  kind: string;
  canonical_key: string;
  ref_count: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ID 生成工具
// =============================================================================

/**
 * 生成 RegulationView ID
 * rv_ + sha256(sorted precondition atom ids + effect atom ids).slice(0, 8)
 */
function genRegulationViewId(preconditionAtomIds: string[], effectAtomIds: string[]): string {
  const sortedPre = [...preconditionAtomIds].sort();
  const sortedEff = [...effectAtomIds].sort();
  const key = [...sortedPre, '→', ...sortedEff].join(',');
  return 'rv_' + crypto.createHash('sha256').update(key).digest('hex').substring(0, 8);
}

/**
 * 计算 status：根据 avgWeight 和 totalEvidence 映射
 */
function calcStatus(avgWeight: number, totalEvidence: number): 'confirmed' | 'hypothesis' | 'candidate' {
  if (avgWeight >= 0.7 && totalEvidence >= 3) return 'confirmed';
  if (avgWeight >= 0.4) return 'hypothesis';
  return 'candidate';
}

/**
 * 解析 context_scope JSON，失败时返回空对象
 */
function parseContextScope(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * 计算多个 contextScope 的交集（只保留所有 scope 中都有且值相同的键）
 */
function intersectContextScopes(scopes: Record<string, unknown>[]): Record<string, unknown> {
  if (scopes.length === 0) return {};
  if (scopes.length === 1) return { ...scopes[0] };

  const result: Record<string, unknown> = {};
  const first = scopes[0];
  for (const [key, value] of Object.entries(first)) {
    // 所有 scope 中该键的值都与 first 相同，才保留
    const allMatch = scopes.every(s => key in s && JSON.stringify(s[key]) === JSON.stringify(value));
    if (allMatch) {
      result[key] = value;
    }
  }
  return result;
}

// =============================================================================
// RegulationViewBuilder 主类
// =============================================================================

export class RegulationViewBuilder {
  private db: Database.Database;

  // ---------- Prepared Statements ----------
  /** 查询所有 compiled 的因果/修复/依赖边 */
  private stmtCausalRefs!: Database.Statement;
  /** 按 from_atom_id 查询 PART_OF 入边（展开合取节点） */
  private stmtPartOfIncoming!: Database.Statement;
  /** 按 atom id 查询 atom */
  private stmtGetAtom!: Database.Statement;
  /** 按 to_atom_id 查询 compiled 因果边 */
  private stmtCausalRefsForEffect!: Database.Statement;
  /** 按 ref id 查询 ref */
  private stmtGetRef!: Database.Statement;

  /**
   * 接收一个已有的 Database 实例（AtomGraph 的 DB），不创建任何表
   */
  constructor(db: Database.Database) {
    this.db = db;
    this.prepareStatements();
  }

  // ==========================================================================
  // Prepared Statements
  // ==========================================================================

  private prepareStatements(): void {
    // 查询所有 compiled 的因果/修复/依赖边
    this.stmtCausalRefs = this.db.prepare(`
      SELECT * FROM refs
      WHERE mode = 'compiled'
        AND kind IN ('causes', 'fixes', 'requires')
    `);

    // 查询 CONJUNCTION atom 的 PART_OF 入边（即合取成员 → CONJUNCTION 节点）
    this.stmtPartOfIncoming = this.db.prepare(`
      SELECT r.*, a.id AS member_id, a.content AS member_content, a.kind AS member_kind
      FROM refs r
      JOIN atoms a ON a.id = r.from_atom_id
      WHERE r.to_atom_id = ?
        AND r.kind = 'part_of'
    `);

    // 按 ID 查询单个 atom
    this.stmtGetAtom = this.db.prepare(`
      SELECT * FROM atoms WHERE id = ?
    `);

    // 按 to_atom_id 查询 compiled 因果边
    this.stmtCausalRefsForEffect = this.db.prepare(`
      SELECT * FROM refs
      WHERE mode = 'compiled'
        AND kind IN ('causes', 'fixes', 'requires')
        AND to_atom_id = ?
    `);

    // 按 ID 查询单条 ref
    this.stmtGetRef = this.db.prepare(`
      SELECT * FROM refs WHERE id = ?
    `);
  }

  // ==========================================================================
  // 核心：展开前置条件
  // ==========================================================================

  /**
   * 展开 from_atom 的前置条件列表
   * - 若 from_atom 是 CONJUNCTION 类型，展开其 PART_OF 入边为多个 preconditions
   * - 否则直接以 from_atom 本身作为单一前置条件
   */
  private expandPreconditions(fromAtomId: string): Array<{ atomId: string; content: string; kind: string }> {
    const fromAtom = this.stmtGetAtom.get(fromAtomId) as AtomRow | undefined;
    if (!fromAtom) return [];

    if (fromAtom.kind === 'conjunction') {
      // 展开 PART_OF 入边（合取成员们）
      const partOfRows = this.stmtPartOfIncoming.all(fromAtomId) as Array<
        RefRow & { member_id: string; member_content: string; member_kind: string }
      >;

      if (partOfRows.length > 0) {
        return partOfRows.map(row => ({
          atomId:  row.member_id,
          content: row.member_content,
          kind:    row.member_kind,
        }));
      }
      // 合取节点没有 PART_OF 入边时退化为自身
    }

    // 普通节点直接返回
    return [{
      atomId:  fromAtom.id,
      content: fromAtom.content,
      kind:    fromAtom.kind,
    }];
  }

  // ==========================================================================
  // buildAll：从所有 compiled 边投影 Regulation 视图
  // ==========================================================================

  /**
   * 从图中的 compiled CAUSES/REQUIRES/FIXES 边投影出所有 Regulation 视图
   *
   * 算法：
   * 1. 查询所有 compiled 因果边
   * 2. 对每条边展开 from_atom 的前置条件（支持 CONJUNCTION 展开）
   * 3. 相同 effect atom + 相同 precondition set → 合并为一条 RegulationView
   * 4. 聚合 avgWeight / totalEvidence / contextScope
   * 5. 映射 status
   */
  buildAll(options?: {
    minWeight?: number;     // 最低权重阈值，默认 0.3
    minEvidence?: number;   // 最低证据数，默认 1
  }): RegulationView[] {
    const minWeight   = options?.minWeight   ?? 0.3;
    const minEvidence = options?.minEvidence ?? 0;

    const causalRefs = this.stmtCausalRefs.all() as RefRow[];

    // 按（sorted precondition ids, effect atom id）分组聚合
    // key = "<sorted-pre-ids>|<effect-id>"
    const groups = new Map<string, {
      preconditions: Array<{ atomId: string; content: string; kind: string }>;
      effectAtomId:  string;
      effectContent: string;
      effectKind:    string;
      refIds:        string[];
      weights:       number[];
      evidences:     number[];
      contextScopes: Record<string, unknown>[];
      lastUpdated:   string;
    }>();

    for (const ref of causalRefs) {
      // 过滤低权重、低证据
      if (ref.weight < minWeight || ref.evidence < minEvidence) continue;

      // 展开前置条件
      const preconditions = this.expandPreconditions(ref.from_atom_id);
      if (preconditions.length === 0) continue;

      // 获取 effect atom
      const effectAtom = this.stmtGetAtom.get(ref.to_atom_id) as AtomRow | undefined;
      if (!effectAtom) continue;

      // 构造分组 key
      const sortedPreIds = preconditions.map(p => p.atomId).sort().join(',');
      const groupKey = `${sortedPreIds}|${effectAtom.id}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          preconditions,
          effectAtomId:  effectAtom.id,
          effectContent: effectAtom.content,
          effectKind:    effectAtom.kind,
          refIds:        [],
          weights:       [],
          evidences:     [],
          contextScopes: [],
          lastUpdated:   ref.last_used_at,
        });
      }

      const group = groups.get(groupKey)!;
      group.refIds.push(ref.id);
      group.weights.push(ref.weight);
      group.evidences.push(ref.evidence);
      group.contextScopes.push(parseContextScope(ref.context_scope));

      // 取最新的 lastUpdated
      if (ref.last_used_at > group.lastUpdated) {
        group.lastUpdated = ref.last_used_at;
      }
    }

    // 将分组转换为 RegulationView
    const views: RegulationView[] = [];
    for (const [, group] of groups) {
      const avgWeight    = group.weights.reduce((s, w) => s + w, 0) / group.weights.length;
      const totalEvidence = group.evidences.reduce((s, e) => s + e, 0);
      const contextScope  = intersectContextScopes(group.contextScopes);

      const preIds = group.preconditions.map(p => p.atomId);
      const id     = genRegulationViewId(preIds, [group.effectAtomId]);

      views.push({
        id,
        description: this.buildDescription(group.preconditions, {
          atomId:  group.effectAtomId,
          content: group.effectContent,
          kind:    group.effectKind,
        }),
        preconditions: group.preconditions,
        effects: [{
          atomId:  group.effectAtomId,
          content: group.effectContent,
          kind:    group.effectKind,
        }],
        avgWeight,
        totalEvidence,
        refIds:      group.refIds,
        contextScope,
        status:      calcStatus(avgWeight, totalEvidence),
        lastUpdated: group.lastUpdated,
      });
    }

    return views;
  }

  // ==========================================================================
  // buildForEffect：为单个 effect atom 构建相关的 Regulation 视图
  // ==========================================================================

  /**
   * 为单个 effect atom 构建相关的 Regulation 视图
   */
  buildForEffect(effectAtomId: string): RegulationView[] {
    const causalRefs = this.stmtCausalRefsForEffect.all(effectAtomId) as RefRow[];
    if (causalRefs.length === 0) return [];

    // 取 effect atom 信息
    const effectAtom = this.stmtGetAtom.get(effectAtomId) as AtomRow | undefined;
    if (!effectAtom) return [];

    // 按 precondition set 分组
    const groups = new Map<string, {
      preconditions: Array<{ atomId: string; content: string; kind: string }>;
      refIds:        string[];
      weights:       number[];
      evidences:     number[];
      contextScopes: Record<string, unknown>[];
      lastUpdated:   string;
    }>();

    for (const ref of causalRefs) {
      const preconditions = this.expandPreconditions(ref.from_atom_id);
      if (preconditions.length === 0) continue;

      const sortedPreIds = preconditions.map(p => p.atomId).sort().join(',');

      if (!groups.has(sortedPreIds)) {
        groups.set(sortedPreIds, {
          preconditions,
          refIds:        [],
          weights:       [],
          evidences:     [],
          contextScopes: [],
          lastUpdated:   ref.last_used_at,
        });
      }

      const group = groups.get(sortedPreIds)!;
      group.refIds.push(ref.id);
      group.weights.push(ref.weight);
      group.evidences.push(ref.evidence);
      group.contextScopes.push(parseContextScope(ref.context_scope));

      if (ref.last_used_at > group.lastUpdated) {
        group.lastUpdated = ref.last_used_at;
      }
    }

    const views: RegulationView[] = [];
    for (const [, group] of groups) {
      const avgWeight     = group.weights.reduce((s, w) => s + w, 0) / group.weights.length;
      const totalEvidence = group.evidences.reduce((s, e) => s + e, 0);
      const contextScope  = intersectContextScopes(group.contextScopes);

      const preIds = group.preconditions.map(p => p.atomId);
      const id     = genRegulationViewId(preIds, [effectAtomId]);

      views.push({
        id,
        description: this.buildDescription(group.preconditions, {
          atomId:  effectAtom.id,
          content: effectAtom.content,
          kind:    effectAtom.kind,
        }),
        preconditions: group.preconditions,
        effects: [{
          atomId:  effectAtom.id,
          content: effectAtom.content,
          kind:    effectAtom.kind,
        }],
        avgWeight,
        totalEvidence,
        refIds:      group.refIds,
        contextScope,
        status:      calcStatus(avgWeight, totalEvidence),
        lastUpdated: group.lastUpdated,
      });
    }

    return views;
  }

  // ==========================================================================
  // buildFromRefChain：为单条 Ref 链构建 Regulation 视图
  // ==========================================================================

  /**
   * 为单条 Ref ID 列表构建 Regulation 视图
   * Ref 链的最后一条边的 to_atom 作为 effect，其余 from_atom 合并为 preconditions
   */
  buildFromRefChain(refIds: string[]): RegulationView | null {
    if (refIds.length === 0) return null;

    const refs: RefRow[] = [];
    for (const refId of refIds) {
      const row = this.stmtGetRef.get(refId) as RefRow | undefined;
      if (!row) return null;
      refs.push(row);
    }

    // 收集所有 precondition（每条边的 from_atom 展开）
    const allPreconditions: Array<{ atomId: string; content: string; kind: string }> = [];
    const seenAtomIds = new Set<string>();

    for (const ref of refs) {
      const preconds = this.expandPreconditions(ref.from_atom_id);
      for (const p of preconds) {
        if (!seenAtomIds.has(p.atomId)) {
          seenAtomIds.add(p.atomId);
          allPreconditions.push(p);
        }
      }
    }

    // 最后一条 ref 的 to_atom 作为 effect
    const lastRef = refs[refs.length - 1];
    const effectAtom = this.stmtGetAtom.get(lastRef.to_atom_id) as AtomRow | undefined;
    if (!effectAtom) return null;

    // 移除 effect atom 自身（如果在 preconditions 里）
    const preconditions = allPreconditions.filter(p => p.atomId !== effectAtom.id);

    const avgWeight     = refs.reduce((s, r) => s + r.weight, 0) / refs.length;
    const totalEvidence = refs.reduce((s, r) => s + r.evidence, 0);
    const contextScopes = refs.map(r => parseContextScope(r.context_scope));
    const contextScope  = intersectContextScopes(contextScopes);
    const lastUpdated   = refs.reduce((latest, r) => r.last_used_at > latest ? r.last_used_at : latest, refs[0].last_used_at);

    const preIds = preconditions.map(p => p.atomId);
    const id     = genRegulationViewId(preIds, [effectAtom.id]);

    return {
      id,
      description: this.buildDescription(preconditions, {
        atomId:  effectAtom.id,
        content: effectAtom.content,
        kind:    effectAtom.kind,
      }),
      preconditions,
      effects: [{
        atomId:  effectAtom.id,
        content: effectAtom.content,
        kind:    effectAtom.kind,
      }],
      avgWeight,
      totalEvidence,
      refIds,
      contextScope,
      status:      calcStatus(avgWeight, totalEvidence),
      lastUpdated,
    };
  }

  // ==========================================================================
  // search：搜索 Regulation 视图
  // ==========================================================================

  /**
   * 搜索 Regulation 视图（对 preconditions + effects 的 content 做关键词匹配）
   */
  search(query: string, limit = 20): RegulationView[] {
    // 先 buildAll，再内存过滤（视图无独立表，无法 SQL 搜索）
    const all = this.buildAll();
    const q   = query.toLowerCase();

    const matched = all.filter(view => {
      if (view.description.toLowerCase().includes(q)) return true;
      if (view.preconditions.some(p => p.content.toLowerCase().includes(q))) return true;
      if (view.effects.some(e => e.content.toLowerCase().includes(q))) return true;
      return false;
    });

    return matched.slice(0, limit);
  }

  // ==========================================================================
  // toRegulation：将 RegulationView 映射回旧的 Regulation 接口
  // ==========================================================================

  /**
   * 将 RegulationView 映射回旧的 Regulation 接口（兼容现有 MCP 工具）
   *
   * content 格式约定：`pred: value`（冒号分隔），pred 取冒号前部分，value 取后部分
   */
  toRegulation(view: RegulationView): LegacyRegulation {
    return {
      regulationId: view.id,
      status:       view.status,
      pre: view.preconditions.map(p => ({
        pred:  p.content.split(':')[0]?.trim() || p.content,
        value: p.content.split(':').slice(1).join(':')?.trim() || true,
      })),
      eff: view.effects.map(e => ({
        pred:  e.content.split(':')[0]?.trim() || e.content,
        value: e.content.split(':').slice(1).join(':')?.trim() || true,
      })),
      description:      view.description,
      supportN:         view.totalEvidence,
      counterexampleN:  0,   // 从 Evidence 系统获取更准确
      explainedCount:   view.totalEvidence,
      tags:             [],
    };
  }

  /**
   * 批量将 RegulationView[] 转换为 LegacyRegulation[]
   */
  toRegulations(views: RegulationView[]): LegacyRegulation[] {
    return views.map(v => this.toRegulation(v));
  }

  // ==========================================================================
  // 内部工具
  // ==========================================================================

  /**
   * 为 RegulationView 生成人类可读描述
   */
  private buildDescription(
    preconditions: Array<{ atomId: string; content: string; kind: string }>,
    effect: { atomId: string; content: string; kind: string }
  ): string {
    const preDesc = preconditions.map(p => p.content).join(' AND ');
    return `IF ${preDesc} THEN ${effect.content}`;
  }
}
