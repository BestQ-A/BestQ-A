import crypto from 'crypto';

import type { AcceptedReconstruction, FidelityScore } from './reconstruction.js';

/** v7 §3.4 顶层 delta 种类 */
export type OntologyDeltaKind =
  | 'PromoteMechanism'   // 将候选机制晋升为已接受的机制类
  | 'SplitClass'         // 将一个机制类拆分为两个更精细的类
  | 'MergeClass'         // 合并两个相似的机制类
  | 'DeprecateRelation'  // 废弃/移除一个因果关系
  | 'RegisterPattern'    // 注册新的结构模式或关系
  | 'AppliedRevision'    // P06 review lane：审查通过的 PRP 所驱动的本体变更
  | 'none';              // Episode 已处理但本体无需更新

export type OntologyChangeAction =
  | 'add_entity'
  | 'modify_entity'
  | 'deprecate_entity'
  | 'add_attribute'
  | 'modify_attribute'
  | 'remove_attribute'
  | 'add_relation'
  | 'strengthen_relation'
  | 'weaken_relation'
  | 'retype_relation'
  | 'remove_relation'
  | 'promote_mechanism'
  | 'extend_mechanism'
  | 'retire_mechanism'
  | 'accept_claim'
  | 'reject_claim'
  | 'supersede_claim';

export interface OntologyChange {
  action: OntologyChangeAction;
  target_space: 'ontology';
  target_kind: string;
  target_id: string;
  details: Record<string, unknown>;
  evidence_episode_id: string;
}

export interface RegressionDetail {
  episode_id: string;
  fidelity_before: number;
  fidelity_after: number;
  delta: number;
  affected_nodes: string[];
}

export interface FidelityRegressionCheck {
  episodes_checked: number;
  episodes_skipped: number;
  skipped_ids: string[];
  min_fidelity_before: number;
  min_fidelity_after: number;
  regression_detected: boolean;
  regressed_episodes: RegressionDetail[] | null;
  isMonotonic: boolean;
}

export interface NoUpdateReasonPayload {
  reason_kind:
    | 'ontology_sufficient'
    | 'episode_inconclusive'
    | 'duplicate_episode'
    | 'human_override'
    | 'pending_more_evidence';
  explanation: string;
  follow_up: string | null;
}

export interface OntologyDelta {
  id: string;
  episode_id: string;
  reconstruction_id: string;
  claim_ids: string[];
  kind: OntologyDeltaKind;
  changes: OntologyChange[];
  no_update_reason?: NoUpdateReasonPayload;
  fidelity_regression_check: FidelityRegressionCheck;
  created_at: string;
  created_by: string;
  applied_at: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 从原子变更动作集合推导顶层 delta kind */
function deriveKind(changes: OntologyChange[]): OntologyDeltaKind {
  if (changes.length === 0) return 'none';
  const actions = new Set(changes.map((c) => c.action));
  if (actions.has('promote_mechanism') || actions.has('extend_mechanism')) return 'PromoteMechanism';
  if (actions.has('remove_relation') || actions.has('retire_mechanism') || actions.has('deprecate_entity')) return 'DeprecateRelation';
  // add_relation / add_entity / accept_claim 等均视为注册新知识
  return 'RegisterPattern';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function newDeltaId(episodeId: string): string {
  return `OD_${episodeId}_${crypto.randomBytes(3).toString('hex')}`;
}

export function createRegressionCheck(
  current: FidelityScore
): FidelityRegressionCheck {
  return {
    episodes_checked: 0,
    episodes_skipped: 0,
    skipped_ids: [],
    min_fidelity_before: current.score,
    min_fidelity_after: current.score,
    regression_detected: false,
    regressed_episodes: null,
    isMonotonic: true,
  };
}

export function createOntologyDelta(
  episodeId: string,
  reconstruction: AcceptedReconstruction,
  claimIds: string[],
  changes: OntologyChange[]
): OntologyDelta {
  if (changes.length === 0) {
    throw new Error(
      'createOntologyDelta: changes must not be empty. Use createOntologyDeltaNone() for no-update cases.'
    );
  }
  return {
    id: newDeltaId(episodeId),
    episode_id: episodeId,
    reconstruction_id: reconstruction.id,
    claim_ids: unique(claimIds.filter(Boolean)),
    kind: deriveKind(changes),
    changes,
    fidelity_regression_check: createRegressionCheck(reconstruction.fidelity),
    created_at: nowIso(),
    created_by: 'pipeline_s7',
    applied_at: null,
  };
}

export function createOntologyDeltaNone(
  episodeId: string,
  reconstruction: AcceptedReconstruction,
  claimIds: string[],
  reason: NoUpdateReasonPayload
): OntologyDelta {
  return {
    id: newDeltaId(episodeId),
    episode_id: episodeId,
    reconstruction_id: reconstruction.id,
    claim_ids: unique(claimIds.filter(Boolean)),
    kind: 'none',
    changes: [],
    no_update_reason: reason,
    fidelity_regression_check: createRegressionCheck(reconstruction.fidelity),
    created_at: nowIso(),
    created_by: 'pipeline_s7',
    applied_at: null,
  };
}

// =============================================================================
// P06 review lane 工厂（不依赖 AcceptedReconstruction，使用虚拟 episode/reconstruction id）
// =============================================================================

/**
 * 从"接受提案"动作生成 OntologyDelta(kind=AppliedRevision)
 * episode_id / reconstruction_id 使用 review: 前缀虚拟 id，与真实 episode pipeline 解耦
 */
export function createOntologyDeltaFromReviewAccept(
  proposalId: string,
  targetKind: string,
  targetRef: string,
  changeKind: string,
): OntologyDelta {
  const virtualEpisodeId = `review:${proposalId}`;
  const change: OntologyChange = {
    action: 'accept_claim',
    target_space: 'ontology',
    target_kind: targetKind,
    target_id: targetRef,
    details: { proposalId, changeKind },
    evidence_episode_id: virtualEpisodeId,
  };
  return {
    id: `OD_rv_${proposalId}_${crypto.randomBytes(3).toString('hex')}`,
    episode_id: virtualEpisodeId,
    reconstruction_id: `rec:review:${proposalId}`,
    claim_ids: [proposalId],
    kind: 'AppliedRevision',
    changes: [change],
    fidelity_regression_check: {
      episodes_checked: 0,
      episodes_skipped: 0,
      skipped_ids: [],
      min_fidelity_before: 1.0,
      min_fidelity_after: 1.0,
      regression_detected: false,
      regressed_episodes: null,
      isMonotonic: true,
    },
    created_at: nowIso(),
    created_by: 'review_lane',
    applied_at: null,
  };
}

/**
 * 从"拒绝提案"动作生成 OntologyDelta(kind=none, reason_kind=human_override)
 */
export function createOntologyDeltaFromReviewReject(
  proposalId: string,
  explanation: string,
): OntologyDelta {
  const virtualEpisodeId = `review:${proposalId}`;
  return {
    id: `OD_rv_${proposalId}_${crypto.randomBytes(3).toString('hex')}`,
    episode_id: virtualEpisodeId,
    reconstruction_id: `rec:review:${proposalId}`,
    claim_ids: [proposalId],
    kind: 'none',
    changes: [],
    no_update_reason: {
      reason_kind: 'human_override',
      explanation,
      follow_up: null,
    },
    fidelity_regression_check: {
      episodes_checked: 0,
      episodes_skipped: 0,
      skipped_ids: [],
      min_fidelity_before: 1.0,
      min_fidelity_after: 1.0,
      regression_detected: false,
      regressed_episodes: null,
      isMonotonic: true,
    },
    created_at: nowIso(),
    created_by: 'review_lane',
    applied_at: null,
  };
}

export function buildRelationChange(
  fromAtomId: string,
  toAtomId: string,
  episodeId: string
): OntologyChange {
  return {
    action: 'add_relation',
    target_space: 'ontology',
    target_kind: 'Relation',
    target_id: `${fromAtomId}_${toAtomId}`,
    details: {
      from_id: fromAtomId,
      to_id: toAtomId,
      relation_type: 'causes',
      initial_weight: 0.6,
    },
    evidence_episode_id: episodeId,
  };
}
