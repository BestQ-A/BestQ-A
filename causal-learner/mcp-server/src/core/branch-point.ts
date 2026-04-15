/**
 * BranchPoint + FutureBranch — v13 分叉治理对象
 * implements: docs/design_history/v13_historical_generative_ontology.md §8.1-8.2
 *
 * BranchPoint 标记因果链上的分叉位置：系统在此处面临多条候选路径，
 * 必须选择一条执行、剪除其余。FutureBranch 描述每条候选的预测结果和风险。
 *
 * 语义：从 pipeline 的 candidatePaths / chosenPath / failedPaths 自然派生。
 */

import crypto from 'crypto';

// =============================================================================
// BranchPoint
// =============================================================================

export interface BranchPoint {
  id: string;
  /** 所属 Episode（lineage 锚点） */
  episodeId: string;
  /** 分叉位置描述（人类可读） */
  locationDescription: string;
  /** 候选路径数量（= FutureBranch 数量） */
  candidateCount: number;
  /** 可控因素（来自 context 中可干预的 keys） */
  controllableFactors: string[];
  /** 不可控因素（来自 context 中不可干预的 keys） */
  uncontrollableFactors: string[];
  /** 最终选定的 FutureBranch ID */
  chosenBranchId: string | null;
  /** 创建时间 */
  createdAt: string;
  createdBy: string;
}

export interface CreateBranchPointInput {
  episodeId: string;
  locationDescription: string;
  candidateCount: number;
  controllableFactors?: string[];
  uncontrollableFactors?: string[];
  createdBy?: string;
}

export function createBranchPoint(input: CreateBranchPointInput): BranchPoint {
  return {
    id: `BP_${crypto.randomBytes(6).toString('hex')}`,
    episodeId: input.episodeId,
    locationDescription: input.locationDescription,
    candidateCount: input.candidateCount,
    controllableFactors: input.controllableFactors ?? [],
    uncontrollableFactors: input.uncontrollableFactors ?? [],
    chosenBranchId: null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? 'system',
  };
}

// =============================================================================
// FutureBranch
// =============================================================================

/** 分支状态：chosen（选中执行）、pruned（剪除）、pending（未决） */
export type BranchStatus = 'chosen' | 'pruned' | 'pending';

export interface FutureBranch {
  id: string;
  /** 所属 BranchPoint */
  branchPointId: string;
  /** 路径 Atom ID 列表 */
  pathAtomIds: string[];
  /** 预测结果描述 */
  predictedOutcome: string;
  /** 风险描述 */
  riskProfile: string;
  /** 路径权重/得分 */
  score: number;
  /** 分支状态 */
  status: BranchStatus;
  /** 剪除原因（status=pruned 时） */
  pruneReason?: string;
  createdAt: string;
}

export interface CreateFutureBranchInput {
  branchPointId: string;
  pathAtomIds: string[];
  predictedOutcome?: string;
  riskProfile?: string;
  score: number;
  status?: BranchStatus;
  pruneReason?: string;
}

export function createFutureBranch(input: CreateFutureBranchInput): FutureBranch {
  return {
    id: `FB_${crypto.randomBytes(6).toString('hex')}`,
    branchPointId: input.branchPointId,
    pathAtomIds: input.pathAtomIds,
    predictedOutcome: input.predictedOutcome ?? '',
    riskProfile: input.riskProfile ?? '',
    score: input.score,
    status: input.status ?? 'pending',
    pruneReason: input.pruneReason,
    createdAt: new Date().toISOString(),
  };
}

// =============================================================================
// 辅助：选择分支 + 剪除其余
// =============================================================================

/**
 * 在 BranchPoint 上选择一条 FutureBranch，将其余标记为 pruned。
 * 返回更新后的 [branchPoint, branches]。
 */
export function chooseBranch(
  bp: BranchPoint,
  branches: FutureBranch[],
  chosenBranchId: string,
  pruneReason = '未被选择的候选路径'
): { branchPoint: BranchPoint; branches: FutureBranch[] } {
  const updatedBranches = branches.map(b => {
    if (b.id === chosenBranchId) {
      return { ...b, status: 'chosen' as const };
    }
    return b.status === 'pending'
      ? { ...b, status: 'pruned' as const, pruneReason }
      : b;
  });

  return {
    branchPoint: { ...bp, chosenBranchId },
    branches: updatedBranches,
  };
}
