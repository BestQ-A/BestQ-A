/**
 * Transition — 连接两个 StateSnapshot 的显式状态转移边
 * implements: docs/current/transition-contract.md（待补）
 */

import crypto from 'crypto';
import type { Transition } from './types.js';

export interface CreateTransitionInput {
  episodeId: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  causedByActionId?: string;
  candidateMechanismIds?: string[];
  createdBy?: string;
  createdAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function assertValidTransition(tr: Transition): void {
  if (!tr.episodeId || tr.episodeId.trim() === '') {
    throw new Error('Transition 不变量 1：episodeId 不可为空');
  }
  if (tr.fromSnapshotId === tr.toSnapshotId) {
    throw new Error('Transition 不变量 2：fromSnapshotId 与 toSnapshotId 不可相同');
  }
  if (!Array.isArray(tr.candidateMechanismIds)) {
    throw new Error('Transition 不变量 3：candidateMechanismIds 不可为 null，可为空数组');
  }
}

export function createTransition(input: CreateTransitionInput): Transition {
  const tr: Transition = {
    id: `TR_${crypto.randomBytes(6).toString('hex')}`,
    episodeId: input.episodeId.trim(),
    fromSnapshotId: input.fromSnapshotId,
    toSnapshotId: input.toSnapshotId,
    causedByActionId: input.causedByActionId,
    candidateMechanismIds: input.candidateMechanismIds ?? [],
    createdBy: input.createdBy ?? 'system',
    createdAt: input.createdAt ?? nowIso(),
  };
  assertValidTransition(tr);
  return tr;
}
