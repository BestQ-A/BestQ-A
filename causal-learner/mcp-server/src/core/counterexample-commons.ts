/**
 * CounterexampleCommons — v11 反例公共知识库
 * implements: docs/current/civilization-memory-contract.md
 *
 * 存储对已有理论/假设的反驳证据（反例）。
 * 与 FailureBoundaryArchive 的区别：
 * - FBA 记录"某件坏事发生了"（经验性失败）
 * - CounterexampleCommons 记录"某个命题在某条件下为假"（认识论反例）
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

/** 反例严重程度 */
export type CounterexampleSeverity = 'minor' | 'moderate' | 'critical' | 'fatal';

/** 单条反例条目 */
export interface CounterexampleEntry {
  id: string;
  /** 被反驳的命题/假设 ref（对应 MechanismClass ID、Regulation ID 等） */
  refutedClaimRef: string;
  /** 反例描述 */
  description: string;
  /** 构成反例的证据 refs（Atom ID、Episode ID 等） */
  evidenceRefs: string[];
  /** 触发条件（反例成立的上下文） */
  triggerContext: string;
  /** 严重程度 */
  severity: CounterexampleSeverity;
  /** 是否已被吸收（理论已更新，反例不再成立） */
  absorbed: boolean;
  /** 吸收说明（absorbed=true 时提供） */
  absorptionNote?: string;
  createdAt: string;
  createdBy: string;
}

/** 反例公共知识库 */
export interface CounterexampleCommons {
  id: string;
  name: string;
  description: string;
  /** 反例条目（append-only 语义） */
  entries: CounterexampleEntry[];
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateCounterexampleCommonsInput {
  id?: string;
  name: string;
  description: string;
  entries?: CounterexampleEntry[];
  createdBy?: string;
  status?: CounterexampleCommons['status'];
}

export function createCounterexampleCommons(
  input: CreateCounterexampleCommonsInput
): CounterexampleCommons {
  return {
    id:          input.id ?? `CC_${crypto.randomBytes(6).toString('hex')}`,
    name:        input.name,
    description: input.description,
    entries:     input.entries ?? [],
    createdAt:   new Date().toISOString(),
    createdBy:   input.createdBy ?? 'system',
    status:      input.status ?? 'draft',
  };
}

// =============================================================================
// 反例操作
// =============================================================================

export interface AppendCounterexampleInput {
  refutedClaimRef: string;
  description: string;
  evidenceRefs: string[];
  triggerContext: string;
  severity: CounterexampleSeverity;
  createdBy?: string;
}

/**
 * 追加反例（immutable update，返回新 CounterexampleCommons）。
 * 不变量 CE-I1：evidenceRefs 非空。
 */
export function appendCounterexample(
  commons: CounterexampleCommons,
  input: AppendCounterexampleInput
): CounterexampleCommons {
  // 不变量 CE-I1：evidenceRefs 非空
  if (!input.evidenceRefs || input.evidenceRefs.length === 0) {
    throw new Error('CounterexampleEntry 不变量 CE-I1：evidenceRefs 不可为空');
  }

  const entry: CounterexampleEntry = {
    id:               `CE_${crypto.randomBytes(6).toString('hex')}`,
    refutedClaimRef:  input.refutedClaimRef,
    description:      input.description,
    evidenceRefs:     input.evidenceRefs,
    triggerContext:   input.triggerContext,
    severity:         input.severity,
    absorbed:         false,
    createdAt:        new Date().toISOString(),
    createdBy:        input.createdBy ?? 'system',
  };

  return {
    ...commons,
    entries: [...commons.entries, entry],
  };
}

/**
 * 标记反例已被吸收（理论已更新）。
 */
export function markCounterexampleAbsorbed(
  commons: CounterexampleCommons,
  entryId: string,
  absorptionNote: string
): CounterexampleCommons {
  return {
    ...commons,
    entries: commons.entries.map(e =>
      e.id === entryId ? { ...e, absorbed: true, absorptionNote } : e
    ),
  };
}

/**
 * 搜索针对特定 claim 的所有未被吸收的反例。
 */
export function searchActiveCounterexamples(
  commons: CounterexampleCommons,
  claimRef: string
): CounterexampleEntry[] {
  return commons.entries.filter(
    e => e.refutedClaimRef === claimRef && !e.absorbed
  );
}

/**
 * 按严重程度过滤反例。
 */
export function searchBySeverity(
  commons: CounterexampleCommons,
  severity: CounterexampleSeverity
): CounterexampleEntry[] {
  return commons.entries.filter(e => e.severity === severity);
}
