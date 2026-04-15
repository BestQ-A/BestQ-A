/**
 * LineageCompileProposal — v13 谱系编译提案对象
 * implements: docs/design_history/v13_historical_generative_ontology.md §11.1
 *
 * 一个 CompileProposal 对应一次 compile 操作，记录为什么这条 lineage 值得编译、
 * 编译前后的变化、谁批准的。
 *
 * 状态机：
 *   draft → challenged → approved/rejected
 *   draft → approved/rejected
 *   approved → applied
 *   approved → rolled_back
 *   rejected（终态）
 *   rolled_back（终态）
 *
 * v13 编译条件（§11.2）：
 *   1. 有 positioned observations 支持
 *   2. 有 replay 或 equivalent reconstruction 支持
 *   3. 有最小充分性论证
 *   4. 有已知 pruned branches 的引用
 *   5. 有对 future branch governance 的说明
 *   6. 若涉及跨本体，必须有 lineage convergence 审理
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

/** 编译提案状态 — 对齐 v13 §11.1 五态 + applied */
export type LineageCompileProposalStatus =
  | 'draft'
  | 'challenged'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'rolled_back';

/** Ref 变更条目 — 记录编译前后的 Ref 变化 */
export interface ProposedRefChange {
  /** 受影响的 Ref ID（Atom→Atom 的 Ref） */
  refId: string;
  /** 变更类型 */
  changeKind: 'add' | 'remove' | 'update_weight' | 'update_mode';
  /** 变更前值（新增时为 null） */
  beforeValue: string | null;
  /** 变更后值（删除时为 null） */
  afterValue: string | null;
}

/** LineageCompileProposal 主体 */
export interface LineageCompileProposal {
  /** 唯一标识 */
  id: string;
  /** 目标 PresentSlice ID — 此提案编译的当下切片 */
  targetPresentSliceId: string;
  /** 被提议编译的 ProvenanceLineage ID */
  proposedLineageId: string;
  /** 支撑该 lineage 的 Episode ID 列表（§11.2 条件 1） */
  supportingEpisodes: string[];
  /** 反例 ID 列表（CounterexampleCommons 条目） */
  counterexampleIds: string[];
  /** 已被剪除的分支引用（§11.2 条件 4） */
  prunedBranchRefs: string[];
  /** 分叉治理影响说明（§11.2 条件 5） */
  branchGovernanceImplications: string[];
  /** 提议的 Ref 变更列表 */
  proposedChanges: ProposedRefChange[];
  /** 编译理由（为什么值得编译） */
  justification: string;
  /** 当前状态 */
  status: LineageCompileProposalStatus;
  /** 关联的 ReviewDecision ID（approved/rejected 后填入） */
  reviewDecisionId: string | null;
  /** 关联的 Reconstruction ID（编译依据的重建） */
  reconstructionId: string | null;
  /** 创建时间 */
  createdAt: string;
  /** 创建者标识 */
  createdBy: string;
}

/** 创建输入 */
export interface CreateLineageCompileProposalInput {
  targetPresentSliceId: string;
  proposedLineageId: string;
  supportingEpisodes: string[];
  counterexampleIds?: string[];
  prunedBranchRefs?: string[];
  branchGovernanceImplications?: string[];
  proposedChanges?: ProposedRefChange[];
  justification: string;
  reconstructionId?: string;
  createdBy?: string;
  createdAt?: string;
}

// =============================================================================
// 合法值集合
// =============================================================================

const STATUSES = new Set<LineageCompileProposalStatus>([
  'draft', 'challenged', 'approved', 'rejected', 'applied', 'rolled_back',
]);

const CHANGE_KINDS = new Set<ProposedRefChange['changeKind']>([
  'add', 'remove', 'update_weight', 'update_mode',
]);

/** 允许的状态转移 — key 为源状态，value 为可达目标状态集合 */
const ALLOWED_TRANSITIONS: Record<LineageCompileProposalStatus, Set<LineageCompileProposalStatus>> = {
  draft: new Set(['challenged', 'approved', 'rejected']),
  challenged: new Set(['approved', 'rejected']),
  approved: new Set(['applied', 'rolled_back']),
  rejected: new Set(),        // 终态
  applied: new Set(),         // 终态（暂不允许进一步转移）
  rolled_back: new Set(),     // 终态
};

// =============================================================================
// 工具函数
// =============================================================================

function nowIso(): string {
  return new Date().toISOString();
}

function newProposalId(): string {
  return `LCP_${crypto.randomBytes(6).toString('hex')}`;
}

// =============================================================================
// 不变量校验
// =============================================================================

export function assertValidLineageCompileProposal(p: LineageCompileProposal): void {
  // LCP-1: targetPresentSliceId 不可为空
  if (!p.targetPresentSliceId || p.targetPresentSliceId.trim() === '') {
    throw new Error('LineageCompileProposal 不变量 LCP-1：targetPresentSliceId 不可为空');
  }
  // LCP-2: proposedLineageId 不可为空
  if (!p.proposedLineageId || p.proposedLineageId.trim() === '') {
    throw new Error('LineageCompileProposal 不变量 LCP-2：proposedLineageId 不可为空');
  }
  // LCP-3: supportingEpisodes 至少一个（§11.2 条件 1）
  if (!Array.isArray(p.supportingEpisodes) || p.supportingEpisodes.length < 1) {
    throw new Error('LineageCompileProposal 不变量 LCP-3：supportingEpisodes 至少包含一个 Episode ID');
  }
  // LCP-4: justification 不可为空
  if (!p.justification || p.justification.trim() === '') {
    throw new Error('LineageCompileProposal 不变量 LCP-4：justification 不可为空');
  }
  // LCP-5: status 合法值
  if (!STATUSES.has(p.status)) {
    throw new Error('LineageCompileProposal 不变量 LCP-5：status 不合法');
  }
  // LCP-6: proposedChanges 中每条 changeKind 合法
  if (Array.isArray(p.proposedChanges)) {
    for (const c of p.proposedChanges) {
      if (!CHANGE_KINDS.has(c.changeKind)) {
        throw new Error(`LineageCompileProposal 不变量 LCP-6：changeKind '${c.changeKind}' 不合法`);
      }
    }
  }
}

// =============================================================================
// 工厂函数
// =============================================================================

/** 创建新的编译提案（初始 status 固定为 draft） */
export function createLineageCompileProposal(
  input: CreateLineageCompileProposalInput,
): LineageCompileProposal {
  const proposal: LineageCompileProposal = {
    id: newProposalId(),
    targetPresentSliceId: input.targetPresentSliceId.trim(),
    proposedLineageId: input.proposedLineageId.trim(),
    supportingEpisodes: input.supportingEpisodes,
    counterexampleIds: input.counterexampleIds ?? [],
    prunedBranchRefs: input.prunedBranchRefs ?? [],
    branchGovernanceImplications: input.branchGovernanceImplications ?? [],
    proposedChanges: input.proposedChanges ?? [],
    justification: input.justification.trim(),
    status: 'draft', // 不变量：初始状态固定为 draft
    reviewDecisionId: null,
    reconstructionId: input.reconstructionId ?? null,
    createdAt: input.createdAt ?? nowIso(),
    createdBy: input.createdBy ?? 'system',
  };
  assertValidLineageCompileProposal(proposal);
  return proposal;
}

// =============================================================================
// 状态转移函数
// =============================================================================

/**
 * 状态转移 — 校验合法转移后返回新对象（不可变更新）
 */
export function transitionProposalStatus(
  proposal: LineageCompileProposal,
  targetStatus: LineageCompileProposalStatus,
  reviewDecisionId?: string,
): LineageCompileProposal {
  const allowed = ALLOWED_TRANSITIONS[proposal.status];
  if (!allowed || !allowed.has(targetStatus)) {
    throw new Error(
      `LineageCompileProposal 状态转移非法：'${proposal.status}' → '${targetStatus}'`
    );
  }
  return {
    ...proposal,
    status: targetStatus,
    reviewDecisionId: reviewDecisionId ?? proposal.reviewDecisionId,
  };
}

/** challenge 提案（draft → challenged） */
export function challengeProposal(
  proposal: LineageCompileProposal,
): LineageCompileProposal {
  return transitionProposalStatus(proposal, 'challenged');
}

/** 批准提案（draft/challenged → approved），关联 ReviewDecision */
export function approveProposal(
  proposal: LineageCompileProposal,
  reviewDecisionId: string,
): LineageCompileProposal {
  if (!reviewDecisionId || reviewDecisionId.trim() === '') {
    throw new Error('approveProposal：reviewDecisionId 不可为空');
  }
  return transitionProposalStatus(proposal, 'approved', reviewDecisionId.trim());
}

/** 拒绝提案（draft/challenged → rejected），关联 ReviewDecision */
export function rejectProposal(
  proposal: LineageCompileProposal,
  reviewDecisionId: string,
): LineageCompileProposal {
  if (!reviewDecisionId || reviewDecisionId.trim() === '') {
    throw new Error('rejectProposal：reviewDecisionId 不可为空');
  }
  return transitionProposalStatus(proposal, 'rejected', reviewDecisionId.trim());
}

/** 执行已批准的提案（approved → applied） */
export function applyProposal(
  proposal: LineageCompileProposal,
): LineageCompileProposal {
  return transitionProposalStatus(proposal, 'applied');
}

/** 回滚已批准的提案（approved → rolled_back） */
export function rollbackProposal(
  proposal: LineageCompileProposal,
): LineageCompileProposal {
  return transitionProposalStatus(proposal, 'rolled_back');
}
