/**
 * OutcomeRecord — 从 ActionExecution 到 Episode 反馈的最小结果对象
 * implements: docs/current/outcome-record-contract.md
 */

import crypto from 'crypto';
import type { OutcomeRecord } from './types.js';

const OUTCOME_RECORD_STATUSES = new Set<OutcomeRecord['status']>([
  'success',
  'failure',
  'partial',
  'abandoned',
]);

export interface CreateOutcomeRecordInput {
  episodeId: string;
  causedByActionExecutionId?: string;
  status: OutcomeRecord['status'];
  summary: string;
  observedSignals?: string[];
  sideEffects?: string[];
  evidenceRefs?: string[];
  recordedAt?: string;
  recordedBy?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newOutcomeRecordId(): string {
  return `ORC_${crypto.randomBytes(6).toString('hex')}`;
}

function requireStringArray(value: string[] | null | undefined, fieldName: string): string[] {
  if (value == null) {
    throw new Error(`OutcomeRecord 不变量 4：${fieldName} 不可为 null`);
  }
  return value;
}

export function assertValidOutcomeRecord(record: OutcomeRecord): void {
  if (!record.episodeId || record.episodeId.trim() === '') {
    throw new Error('OutcomeRecord 不变量 1：episodeId 不可为空');
  }
  if (!record.summary || record.summary.trim() === '') {
    throw new Error('OutcomeRecord 不变量 2：summary 不可为空');
  }
  if (!OUTCOME_RECORD_STATUSES.has(record.status)) {
    throw new Error('OutcomeRecord 不变量 3：status 必须是 success|failure|partial|abandoned');
  }

  requireStringArray(record.observedSignals, 'observedSignals');
  requireStringArray(record.sideEffects, 'sideEffects');
  requireStringArray(record.evidenceRefs, 'evidenceRefs');
}

export function createOutcomeRecord(input: CreateOutcomeRecordInput): OutcomeRecord {
  const record: OutcomeRecord = {
    id: newOutcomeRecordId(),
    episodeId: input.episodeId.trim(),
    causedByActionExecutionId: input.causedByActionExecutionId,
    status: input.status,
    summary: input.summary.trim(),
    observedSignals: input.observedSignals ?? [],
    sideEffects: input.sideEffects ?? [],
    evidenceRefs: input.evidenceRefs ?? [],
    recordedAt: input.recordedAt ?? nowIso(),
    recordedBy: input.recordedBy ?? 'system',
  };

  assertValidOutcomeRecord(record);
  return record;
}
