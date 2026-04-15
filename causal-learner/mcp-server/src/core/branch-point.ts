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
  /** v13: 血统链 ID，追踪分叉的历史谱系 */
  lineageId?: string;
  /** 分叉位置描述（人类可读） */
  locationDescription: string;
  /** 候选路径数量（= FutureBranch 数量） */
  candidateCount: number;
  /** 可控因素（来自 context 中可干预的 keys） */
  controllableFactors: string[];
  /** 不可控因素（来自 context 中不可干预的 keys） */
  uncontrollableFactors: string[];
  /** v13: 历史敏感性标签，标记哪些历史因素对此分叉有决定性影响 */
  historicalSensitivity?: string[];
  /** 最终选定的 FutureBranch ID */
  chosenBranchId: string | null;
  /** 创建时间 */
  createdAt: string;
  createdBy: string;
}

export interface CreateBranchPointInput {
  episodeId: string;
  lineageId?: string;
  locationDescription: string;
  candidateCount: number;
  controllableFactors?: string[];
  uncontrollableFactors?: string[];
  historicalSensitivity?: string[];
  createdBy?: string;
}

export function createBranchPoint(input: CreateBranchPointInput): BranchPoint {
  return {
    id: `BP_${crypto.randomBytes(6).toString('hex')}`,
    episodeId: input.episodeId,
    lineageId: input.lineageId,
    locationDescription: input.locationDescription,
    candidateCount: input.candidateCount,
    controllableFactors: input.controllableFactors ?? [],
    uncontrollableFactors: input.uncontrollableFactors ?? [],
    historicalSensitivity: input.historicalSensitivity,
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
  /** v13: 关联的干预 ID 列表，标记此分支依赖哪些主动干预 */
  interventionIds?: string[];
  /** v13: 预测轨迹，按时序描述路径上的关键状态变化 */
  predictedTrajectory?: string[];
  /** 预测结果描述（兼容旧 string 单值） */
  predictedOutcome: string;
  /** v13: 预测结果列表，多维度结果预测 */
  predictedOutcomes?: string[];
  /** 风险描述（v13 扩展为 string | string[]，兼容数组形式） */
  riskProfile: string | string[];
  /** v13: 信息增益估计，量化此分支对认知的贡献度 */
  informationGainEstimate?: number;
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
  interventionIds?: string[];
  predictedTrajectory?: string[];
  predictedOutcome?: string;
  predictedOutcomes?: string[];
  riskProfile?: string | string[];
  informationGainEstimate?: number;
  score: number;
  status?: BranchStatus;
  pruneReason?: string;
}

export function createFutureBranch(input: CreateFutureBranchInput): FutureBranch {
  return {
    id: `FB_${crypto.randomBytes(6).toString('hex')}`,
    branchPointId: input.branchPointId,
    pathAtomIds: input.pathAtomIds,
    interventionIds: input.interventionIds,
    predictedTrajectory: input.predictedTrajectory,
    predictedOutcome: input.predictedOutcome ?? '',
    predictedOutcomes: input.predictedOutcomes,
    riskProfile: input.riskProfile ?? '',
    informationGainEstimate: input.informationGainEstimate,
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
