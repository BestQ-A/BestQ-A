/**
 * HistoricalCompressionRecord — v13 历史压缩行为的显式记录
 * implements: docs/design_history/v13_historical_generative_ontology.md §12.1
 *
 * 核心语义："当前态是历史的压缩"。
 * 一个 CompressionRecord 对应一次历史压缩操作，显式记录：
 * - 哪些 Episode 被压缩
 * - 压缩后保留了什么、丢弃了什么
 * - 压缩比是多少
 * - 压缩是否可逆
 *
 * 这个对象告诉后来者：现在为什么看起来这么"自然"，
 * 以及这种自然感背后哪些失败已经被历史抹平。
 *
 * 本文件只建对象和工厂函数，不接入 pipeline.ts。
 */

import crypto from 'crypto';

// =============================================================================
// HistoricalCompressionRecord 接口
// =============================================================================

/** 历史压缩记录 — v13 核心审计对象 */
export interface HistoricalCompressionRecord {
  /** 唯一标识 */
  id: string;
  /** 人类可读名称（描述这次压缩操作的含义） */
  name: string;
  /** 被压缩的 Episode ID 列表（历史来源，不变量：非空） */
  sourceEpisodeIds: string[];
  /** 压缩结果指向的 PresentSlice ID */
  targetPresentSliceId: string;
  /** 保留的关键节点 Atom ID 列表 */
  retainedAtomIds: string[];
  /** 被丢弃的节点 Atom ID 列表 */
  discardedAtomIds: string[];
  /** 压缩比 = sourceCount / retainedCount（不变量：> 0） */
  compressionRatio: number;
  /** 压缩损失说明（人类可读，描述丢弃了什么信息） */
  lossDescription: string;
  /** 是否可逆 — 能否从 retainedAtomIds 完全重建原始 Episode */
  reversible: boolean;
  /** 创建时间 */
  createdAt: string;
  /** 创建者标识 */
  createdBy: string;
}

// =============================================================================
// 创建输入
// =============================================================================

export interface CreateHistoricalCompressionRecordInput {
  name: string;
  sourceEpisodeIds: string[];
  targetPresentSliceId: string;
  retainedAtomIds?: string[];
  discardedAtomIds?: string[];
  compressionRatio?: number;
  lossDescription?: string;
  reversible?: boolean;
  createdBy?: string;
  createdAt?: string;
}

// =============================================================================
// 不变量断言
// =============================================================================

/** 断言 HistoricalCompressionRecord 满足不变量 */
export function assertValidCompressionRecord(
  record: HistoricalCompressionRecord,
): void {
  if (!record.sourceEpisodeIds || record.sourceEpisodeIds.length === 0) {
    throw new Error(
      `HistoricalCompressionRecord ${record.id}: sourceEpisodeIds 不能为空`,
    );
  }
  if (record.compressionRatio <= 0) {
    throw new Error(
      `HistoricalCompressionRecord ${record.id}: compressionRatio 必须 > 0，当前值 ${record.compressionRatio}`,
    );
  }
}

// =============================================================================
// 工厂函数
// =============================================================================

/**
 * 计算默认压缩比。
 * 若 retainedAtomIds 非空，则 ratio = sourceEpisodeIds.length / retainedAtomIds.length。
 * 否则回退到 1.0（无压缩）。
 */
function defaultCompressionRatio(
  sourceCount: number,
  retainedCount: number,
): number {
  if (retainedCount <= 0) return sourceCount > 0 ? sourceCount : 1;
  return sourceCount / retainedCount;
}

/** 创建 HistoricalCompressionRecord 实例 */
export function createHistoricalCompressionRecord(
  input: CreateHistoricalCompressionRecordInput,
): HistoricalCompressionRecord {
  const retainedAtomIds = input.retainedAtomIds ?? [];
  const sourceEpisodeIds = input.sourceEpisodeIds;

  const ratio =
    input.compressionRatio ??
    defaultCompressionRatio(sourceEpisodeIds.length, retainedAtomIds.length);

  const record: HistoricalCompressionRecord = {
    id: `HCR_${crypto.randomBytes(6).toString('hex')}`,
    name: input.name,
    sourceEpisodeIds,
    targetPresentSliceId: input.targetPresentSliceId,
    retainedAtomIds,
    discardedAtomIds: input.discardedAtomIds ?? [],
    compressionRatio: ratio,
    lossDescription: input.lossDescription ?? '',
    reversible: input.reversible ?? false,
    createdAt: input.createdAt ?? new Date().toISOString(),
    createdBy: input.createdBy ?? 'system',
  };

  assertValidCompressionRecord(record);
  return record;
}
