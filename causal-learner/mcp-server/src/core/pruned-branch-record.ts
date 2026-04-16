/**
 * PrunedBranchRecord — v13 被剪掉的真实分支显式记录
 * implements: docs/design_history/v13_historical_generative_ontology.md §9.1
 * contract:   docs/current/pruned-branch-record-contract.md
 *
 * 核心语义：失败不是目的，而是被剪掉的可能性空间（v13 G5）。
 * 每当一条分支被 failure/institution/design/physics 剪掉，必须产生一条 PBR，
 * 记录它曾经真实存在、被什么剪掉、在什么条件下可能重新打开。
 *
 * 本文件只建对象和工厂函数，不接入 pipeline.ts。
 */

import crypto from 'crypto';

// =============================================================================
// 类型
// =============================================================================

export type PruneReason = 'failure' | 'institution' | 'design' | 'physics';

export interface PrunedBranchRecord {
  id: string;
  branchDescription: string;
  prunedBy: PruneReason[];
  presentSliceRef: string;
  definingEpisodeIds: string[];
  reactivationRisks: string[];
  evidenceAtomIds: string[];
  rationale: string;
  prunedAt: string;
  prunedByActor: string;
}

export interface CreatePrunedBranchRecordInput {
  branchDescription: string;
  prunedBy: PruneReason[];
  presentSliceRef: string;
  definingEpisodeIds?: string[];
  reactivationRisks?: string[];
  evidenceAtomIds?: string[];
  rationale?: string;
  prunedAt?: string;
  prunedByActor?: string;
}

// =============================================================================
// 不变量断言
// =============================================================================

export function assertValidPrunedBranchRecord(
  record: PrunedBranchRecord,
): void {
  if (!record.branchDescription || record.branchDescription.trim() === '') {
    throw new Error(
      `PrunedBranchRecord ${record.id}: branchDescription 不能为空（PBR-1）`,
    );
  }
  if (!record.prunedBy || record.prunedBy.length === 0) {
    throw new Error(
      `PrunedBranchRecord ${record.id}: prunedBy 至少一项（PBR-2）`,
    );
  }
  if (!record.presentSliceRef || record.presentSliceRef.trim() === '') {
    throw new Error(
      `PrunedBranchRecord ${record.id}: presentSliceRef 不能为空（PBR-3）`,
    );
  }
}

// =============================================================================
// 工厂函数
// =============================================================================

export function createPrunedBranchRecord(
  input: CreatePrunedBranchRecordInput,
): PrunedBranchRecord {
  const record: PrunedBranchRecord = {
    id: `PBR_${crypto.randomBytes(6).toString('hex')}`,
    branchDescription: input.branchDescription,
    prunedBy: [...input.prunedBy],
    presentSliceRef: input.presentSliceRef,
    definingEpisodeIds: input.definingEpisodeIds ?? [],
    reactivationRisks: input.reactivationRisks ?? [],
    evidenceAtomIds: input.evidenceAtomIds ?? [],
    rationale: input.rationale ?? '',
    prunedAt: input.prunedAt ?? new Date().toISOString(),
    prunedByActor: input.prunedByActor ?? 'system',
  };

  assertValidPrunedBranchRecord(record);
  return record;
}
