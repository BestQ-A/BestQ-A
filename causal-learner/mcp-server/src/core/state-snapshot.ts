/**
 * StateSnapshot — Episode 某时刻的系统状态切片
 * implements: docs/current/state-snapshot-contract.md（待补）
 */

import crypto from 'crypto';
import type { StateSnapshot } from './types.js';

export interface CreateStateSnapshotInput {
  episodeId: string;
  t: number | string;
  values: Record<string, unknown>;
  createdBy?: string;
  createdAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function assertValidStateSnapshot(ss: StateSnapshot): void {
  if (!ss.episodeId || ss.episodeId.trim() === '') {
    throw new Error('StateSnapshot 不变量 1：episodeId 不可为空');
  }
  if (ss.values === null || ss.values === undefined) {
    throw new Error('StateSnapshot 不变量 2：values 不可为 null');
  }
  if (ss.t === undefined || ss.t === null || ss.t === '') {
    throw new Error('StateSnapshot 不变量 3：t 必填');
  }
}

export function createStateSnapshot(input: CreateStateSnapshotInput): StateSnapshot {
  const ss: StateSnapshot = {
    id: `SS_${crypto.randomBytes(6).toString('hex')}`,
    episodeId: input.episodeId.trim(),
    t: input.t,
    values: input.values,
    createdBy: input.createdBy ?? 'system',
    createdAt: input.createdAt ?? nowIso(),
  };
  assertValidStateSnapshot(ss);
  return ss;
}
