/**
 * ReviewDecision — ProgramRevisionProposal review lane 裁决对象
 * implements: docs/current/review-decision-contract.md
 *
 * review lane 三态转移：
 *   proposed → accepted   (acceptProposal)
 *   proposed → rejected   (rejectProposal)
 *   proposed → superseded (supersedeProposal)
 */

import crypto from 'crypto';
import type { ProgramRevisionProposal } from './program-revision-proposal.js';
import type { OntologyDelta } from './ontology-delta.js';
import {
  createOntologyDeltaFromReviewAccept,
  createOntologyDeltaFromReviewReject,
} from './ontology-delta.js';

// =============================================================================
// 类型定义
// =============================================================================

export type ReviewDecisionKind = 'accepted' | 'rejected' | 'superseded';

export interface ReviewDecision {
  id: string;
  /** 所审查的 PRP id */
  proposalRef: string;
  decision: ReviewDecisionKind;
  /** decision=superseded 时必填：接管本提案的新 PRP id */
  supersededByRef: string | null;
  rationale: string;
  /** 本决策生成的 OntologyDelta id；superseded 时为 null */
  generatedDeltaRef: string | null;
  reviewedAt: string;
  reviewedBy: string;
}

export interface CreateReviewDecisionInput {
  proposalRef: string;
  decision: ReviewDecisionKind;
  supersededByRef?: string | null;
  rationale: string;
  generatedDeltaRef?: string | null;
  reviewedAt?: string;
  reviewedBy?: string;
}

// =============================================================================
// 不变量校验
// =============================================================================

const DECISION_KINDS = new Set<ReviewDecisionKind>(['accepted', 'rejected', 'superseded']);

function nowIso(): string {
  return new Date().toISOString();
}

function newDecisionId(): string {
  return `RD_${crypto.randomBytes(6).toString('hex')}`;
}

export function assertValidReviewDecision(rd: ReviewDecision): void {
  if (!rd.proposalRef || rd.proposalRef.trim() === '') {
    throw new Error('ReviewDecision 不变量 RD-1：proposalRef 不可为空');
  }
  if (!DECISION_KINDS.has(rd.decision)) {
    throw new Error('ReviewDecision 不变量 RD-2：decision 必须是 accepted|rejected|superseded');
  }
  if (rd.decision === 'superseded' && (!rd.supersededByRef || rd.supersededByRef.trim() === '')) {
    throw new Error('ReviewDecision 不变量 RD-3：decision=superseded 时 supersededByRef 不可为空');
  }
  if (!rd.rationale || rd.rationale.trim() === '') {
    throw new Error('ReviewDecision 不变量 RD-4：rationale 不可为空');
  }
}

export function createReviewDecision(input: CreateReviewDecisionInput): ReviewDecision {
  const rd: ReviewDecision = {
    id: newDecisionId(),
    proposalRef: input.proposalRef.trim(),
    decision: input.decision,
    supersededByRef: input.supersededByRef ?? null,
    rationale: input.rationale.trim(),
    generatedDeltaRef: input.generatedDeltaRef ?? null,
    reviewedAt: input.reviewedAt ?? nowIso(),
    reviewedBy: input.reviewedBy ?? 'reviewer',
  };
  assertValidReviewDecision(rd);
  return rd;
}

// =============================================================================
// review lane 三态转移 helper
// =============================================================================

export interface AcceptResult {
  updatedProposal: ProgramRevisionProposal;
  delta: OntologyDelta;
  reviewDecision: ReviewDecision;
}

export interface RejectResult {
  updatedProposal: ProgramRevisionProposal;
  delta: OntologyDelta;
  reviewDecision: ReviewDecision;
}

export interface SupersedeResult {
  updatedProposal: ProgramRevisionProposal;
  reviewDecision: ReviewDecision;
}

/**
 * 接受提案：生成 OntologyDelta(kind=AppliedRevision) + ReviewDecision，将 PRP 状态切到 accepted
 */
export function acceptProposal(
  prp: ProgramRevisionProposal,
  rationale: string,
  reviewedBy?: string,
): AcceptResult {
  if (prp.status !== 'proposed') {
    throw new Error(`acceptProposal：只能接受 status=proposed 的提案，当前为 '${prp.status}'`);
  }
  const delta = createOntologyDeltaFromReviewAccept(
    prp.id,
    prp.targetKind,
    prp.targetRef,
    prp.proposedChangeKind,
  );
  const rd = createReviewDecision({
    proposalRef: prp.id,
    decision: 'accepted',
    rationale,
    generatedDeltaRef: delta.id,
    reviewedBy,
  });
  const updatedProposal: ProgramRevisionProposal = { ...prp, status: 'accepted' };
  return { updatedProposal, delta, reviewDecision: rd };
}

/**
 * 拒绝提案：生成 OntologyDelta(kind=none, reason_kind=human_override) + ReviewDecision，将 PRP 状态切到 rejected
 */
export function rejectProposal(
  prp: ProgramRevisionProposal,
  rationale: string,
  reviewedBy?: string,
): RejectResult {
  if (prp.status !== 'proposed') {
    throw new Error(`rejectProposal：只能拒绝 status=proposed 的提案，当前为 '${prp.status}'`);
  }
  const delta = createOntologyDeltaFromReviewReject(prp.id, rationale);
  const rd = createReviewDecision({
    proposalRef: prp.id,
    decision: 'rejected',
    rationale,
    generatedDeltaRef: delta.id,
    reviewedBy,
  });
  const updatedProposal: ProgramRevisionProposal = { ...prp, status: 'rejected' };
  return { updatedProposal, delta, reviewDecision: rd };
}

/**
 * 以新提案取代旧提案：不产生 OntologyDelta（由接管的新 PRP 的 review 负责），将 PRP 状态切到 superseded
 */
export function supersedeProposal(
  prp: ProgramRevisionProposal,
  supersededByRef: string,
  rationale: string,
  reviewedBy?: string,
): SupersedeResult {
  if (prp.status !== 'proposed') {
    throw new Error(`supersedeProposal：只能 supersede status=proposed 的提案，当前为 '${prp.status}'`);
  }
  if (!supersededByRef || supersededByRef.trim() === '') {
    throw new Error('supersedeProposal：supersededByRef 不可为空');
  }
  const rd = createReviewDecision({
    proposalRef: prp.id,
    decision: 'superseded',
    supersededByRef: supersededByRef.trim(),
    rationale,
    generatedDeltaRef: null,
    reviewedBy,
  });
  const updatedProposal: ProgramRevisionProposal = { ...prp, status: 'superseded' };
  return { updatedProposal, reviewDecision: rd };
}
