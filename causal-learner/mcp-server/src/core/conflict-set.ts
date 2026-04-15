/**
 * ConflictSet — v9 本体冲突集合
 * implements: docs/current/ontology-federation-contract.md
 *
 * ConflictSet 收集同一实体在两个（或多个）本体下的不兼容描述。
 * 每条 ConflictEntry 记录一对本体对同一 entityRef 的不同断言。
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

/** 冲突类型 */
export type ConflictKind =
  | 'type_mismatch'      // 两个本体对同一实体赋予不同类型
  | 'attribute_clash'    // 同一属性值不一致
  | 'relation_missing'   // 一个本体有某关系，另一个没有
  | 'concept_absent'     // 一个本体无对应概念
  | 'semantic_divergence'; // 语义上无法对齐

/** 单条冲突条目 */
export interface ConflictEntry {
  id: string;
  /** 冲突实体（Atom ref 或 entityRef） */
  entityRef: string;
  /** 第一个本体 ID */
  ontologyAId: string;
  /** 第一个本体对该实体的描述（JSON 序列化） */
  descriptionA: string;
  /** 第二个本体 ID */
  ontologyBId: string;
  /** 第二个本体对该实体的描述（JSON 序列化） */
  descriptionB: string;
  /** 冲突类型 */
  kind: ConflictKind;
  /** 冲突说明 */
  explanation: string;
  /** 是否已解决 */
  resolved: boolean;
  /** 解决方式（resolved=true 时提供） */
  resolution?: string;
  createdAt: string;
}

/** 冲突集合 */
export interface ConflictSet {
  id: string;
  name: string;
  /** 本次冲突分析关联的 TranslationFunctor ID */
  translationFunctorId: string;
  /** 冲突条目列表（不变量 1：可为空，但不为 null） */
  entries: ConflictEntry[];
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateConflictSetInput {
  id?: string;
  name: string;
  translationFunctorId: string;
  entries?: ConflictEntry[];
  createdBy?: string;
  status?: ConflictSet['status'];
}

export function createConflictSet(input: CreateConflictSetInput): ConflictSet {
  return {
    id:                   input.id ?? `CS_${crypto.randomBytes(6).toString('hex')}`,
    name:                 input.name,
    translationFunctorId: input.translationFunctorId,
    entries:              input.entries ?? [],
    createdAt:            new Date().toISOString(),
    createdBy:            input.createdBy ?? 'system',
    status:               input.status ?? 'draft',
  };
}

/** 向 ConflictSet 追加一条冲突条目（immutable update） */
export function appendConflictEntry(
  conflictSet: ConflictSet,
  entry: Omit<ConflictEntry, 'id' | 'createdAt' | 'resolved'>
): ConflictSet {
  const newEntry: ConflictEntry = {
    id:           `CE_${crypto.randomBytes(6).toString('hex')}`,
    resolved:     false,
    createdAt:    new Date().toISOString(),
    ...entry,
  };
  return {
    ...conflictSet,
    entries: [...conflictSet.entries, newEntry],
  };
}

/** 标记某条冲突条目为已解决 */
export function resolveConflictEntry(
  conflictSet: ConflictSet,
  entryId: string,
  resolution: string
): ConflictSet {
  return {
    ...conflictSet,
    entries: conflictSet.entries.map(e =>
      e.id === entryId ? { ...e, resolved: true, resolution } : e
    ),
  };
}
