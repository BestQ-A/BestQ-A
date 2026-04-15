/**
 * PredictionError — OutcomeRecord 与 CounterfactualScenario 之间的显式偏差对象
 * implements: docs/current/prediction-error-contract.md
 */

import crypto from 'crypto';
import type { PredictionError } from './types.js';

const ERROR_KINDS = new Set<PredictionError['errorKind']>([
  'observation', 'transition', 'outcome', 'context', 'unknown',
]);
const SEVERITIES = new Set<PredictionError['severity']>([
  'low', 'medium', 'high',
]);

export interface CreatePredictionErrorInput {
  basedOnCounterfactualId?: string;
  causedByActionExecutionId: string;
  outcomeRecordId: string;
  errorKind: PredictionError['errorKind'];
  expectedSummary: string;
  actualSummary: string;
  deltaSummary: string;
  severity: PredictionError['severity'];
  score?: number | null;
  recordedAt?: string;
  recordedBy?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newPredictionErrorId(): string {
  return `PE_${crypto.randomBytes(6).toString('hex')}`;
}

export function assertValidPredictionError(pe: PredictionError): void {
  if (!pe.causedByActionExecutionId || pe.causedByActionExecutionId.trim() === '') {
    throw new Error('PredictionError 不变量 1：causedByActionExecutionId 不可为空');
  }
  if (!pe.outcomeRecordId || pe.outcomeRecordId.trim() === '') {
    throw new Error('PredictionError 不变量 2：outcomeRecordId 不可为空');
  }
  if (!pe.expectedSummary || pe.expectedSummary.trim() === '') {
    throw new Error('PredictionError 不变量 3a：expectedSummary 不可为空');
  }
  if (!pe.actualSummary || pe.actualSummary.trim() === '') {
    throw new Error('PredictionError 不变量 3b：actualSummary 不可为空');
  }
  if (!pe.deltaSummary || pe.deltaSummary.trim() === '') {
    throw new Error('PredictionError 不变量 3c：deltaSummary 不可为空');
  }
  if (!ERROR_KINDS.has(pe.errorKind)) {
    throw new Error('PredictionError 不变量 4：errorKind 必须是 observation|transition|outcome|context|unknown');
  }
  if (!SEVERITIES.has(pe.severity)) {
    throw new Error('PredictionError severity 必须是 low|medium|high');
  }
  if (!('score' in pe)) {
    throw new Error('PredictionError 不变量 5：score 字段不可缺失（允许 null）');
  }
}

export function createPredictionError(input: CreatePredictionErrorInput): PredictionError {
  const pe: PredictionError = {
    id: newPredictionErrorId(),
    basedOnCounterfactualId: input.basedOnCounterfactualId,
    causedByActionExecutionId: input.causedByActionExecutionId.trim(),
    outcomeRecordId: input.outcomeRecordId.trim(),
    errorKind: input.errorKind,
    expectedSummary: input.expectedSummary.trim(),
    actualSummary: input.actualSummary.trim(),
    deltaSummary: input.deltaSummary.trim(),
    severity: input.severity,
    score: input.score ?? null,
    recordedAt: input.recordedAt ?? nowIso(),
    recordedBy: input.recordedBy ?? 'system',
  };
  assertValidPredictionError(pe);
  return pe;
}
