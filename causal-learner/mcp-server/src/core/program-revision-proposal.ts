/**
 * ProgramRevisionProposal — PredictionError 驱动的模型修正提名对象
 * implements: docs/current/program-revision-proposal-contract.md
 */

import crypto from 'crypto';

export interface ProgramRevisionProposal {
  id: string;
  basedOnPredictionErrorIds: string[];
  targetKind: 'mechanism_program' | 'observation_model';
  targetRef: string;
  proposedChangeKind:
    | 'phase_adjustment'
    | 'signature_adjustment'
    | 'precondition_adjustment'
    | 'observation_mapping_adjustment'
    | 'validity_narrowing'
    | 'validity_broadening';
  rationale: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  createdAt: string;
  createdBy: string;
}

export interface CreateProgramRevisionProposalInput {
  basedOnPredictionErrorIds: string[];
  targetKind: ProgramRevisionProposal['targetKind'];
  targetRef: string;
  proposedChangeKind: ProgramRevisionProposal['proposedChangeKind'];
  rationale: string;
  createdBy?: string;
  createdAt?: string;
}

const TARGET_KINDS = new Set<ProgramRevisionProposal['targetKind']>([
  'mechanism_program', 'observation_model',
]);

const CHANGE_KINDS = new Set<ProgramRevisionProposal['proposedChangeKind']>([
  'phase_adjustment', 'signature_adjustment', 'precondition_adjustment',
  'observation_mapping_adjustment', 'validity_narrowing', 'validity_broadening',
]);

const STATUSES = new Set<ProgramRevisionProposal['status']>([
  'proposed', 'accepted', 'rejected', 'superseded',
]);

function nowIso(): string {
  return new Date().toISOString();
}

function newProposalId(): string {
  return `PRP_${crypto.randomBytes(6).toString('hex')}`;
}

export function assertValidProgramRevisionProposal(prp: ProgramRevisionProposal): void {
  // 不变量 1: basedOnPredictionErrorIds 不得为空
  if (!Array.isArray(prp.basedOnPredictionErrorIds) || prp.basedOnPredictionErrorIds.length < 1) {
    throw new Error('ProgramRevisionProposal 不变量 1：basedOnPredictionErrorIds 至少包含一个 id');
  }
  // 不变量 2: targetRef 非空
  if (!prp.targetRef || prp.targetRef.trim() === '') {
    throw new Error('ProgramRevisionProposal 不变量 2：targetRef 不可为空');
  }
  // 不变量 3: rationale 非空
  if (!prp.rationale || prp.rationale.trim() === '') {
    throw new Error('ProgramRevisionProposal 不变量 3：rationale 不可为空');
  }
  // status 合法值
  if (!STATUSES.has(prp.status)) {
    throw new Error('ProgramRevisionProposal：status 必须是 proposed|accepted|rejected|superseded');
  }
  if (!TARGET_KINDS.has(prp.targetKind)) {
    throw new Error('ProgramRevisionProposal：targetKind 必须是 mechanism_program|observation_model');
  }
  if (!CHANGE_KINDS.has(prp.proposedChangeKind)) {
    throw new Error('ProgramRevisionProposal：proposedChangeKind 不合法');
  }
}

export function createProgramRevisionProposal(input: CreateProgramRevisionProposalInput): ProgramRevisionProposal {
  const prp: ProgramRevisionProposal = {
    id: newProposalId(),
    basedOnPredictionErrorIds: input.basedOnPredictionErrorIds,
    targetKind: input.targetKind,
    targetRef: input.targetRef.trim(),
    proposedChangeKind: input.proposedChangeKind,
    rationale: input.rationale.trim(),
    status: 'proposed', // 不变量 4：初始 status 必须为 proposed
    createdAt: input.createdAt ?? nowIso(),
    createdBy: input.createdBy ?? 'system',
  };
  assertValidProgramRevisionProposal(prp);
  return prp;
}
