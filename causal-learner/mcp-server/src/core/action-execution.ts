/**
 * ActionExecution — 从 ExperimentDesign 到新 Episode 的最小执行桥
 * implements: docs/current/action-execution-contract.md
 */

import crypto from 'crypto';
import type { ActionExecution } from './types.js';
import type { ExperimentDesign } from './experiment-design.js';

export interface CreateActionExecutionInput {
  id?: string;
  basedOnExperimentDesignId: string;
  sourceEpisodeId: string;
  targetEpisodeId?: string;
  actionRef: string;
  actionKind: ActionExecution['actionKind'];
  actionClassId?: string;
  parameters?: Record<string, unknown>;
  executionStatus?: ActionExecution['executionStatus'];
  observedOutcomeSummary?: string;
  predictionError?: number | null;
  startedAt?: string;
  completedAt?: string | null;
  createdBy?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newActionExecutionId(): string {
  return `AX_${crypto.randomBytes(6).toString('hex')}`;
}

export function createActionExecution(input: CreateActionExecutionInput): ActionExecution {
  if (!input.basedOnExperimentDesignId) {
    throw new Error('ActionExecution 不变量 1：basedOnExperimentDesignId 不可为空');
  }
  if (!input.actionRef) {
    throw new Error('ActionExecution: actionRef 不可为空');
  }

  const executionStatus = input.executionStatus ?? 'planned';
  const completedAt = input.completedAt ?? null;
  if (executionStatus === 'completed' && !completedAt) {
    throw new Error('ActionExecution 不变量 3：executionStatus=completed 时 completedAt 必填');
  }
  if (
    executionStatus === 'completed' &&
    !input.targetEpisodeId &&
    !input.observedOutcomeSummary
  ) {
    throw new Error('ActionExecution 不变量 4：completed 时 targetEpisodeId 或 observedOutcomeSummary 至少其一存在');
  }

  return {
    id: input.id ?? newActionExecutionId(),
    basedOnExperimentDesignId: input.basedOnExperimentDesignId,
    sourceEpisodeId: input.sourceEpisodeId,
    targetEpisodeId: input.targetEpisodeId,
    actionRef: input.actionRef,
    actionKind: input.actionKind,
    actionClassId: input.actionClassId,
    parameters: input.parameters ?? {},
    executionStatus,
    observedOutcomeSummary: input.observedOutcomeSummary,
    predictionError: input.predictionError ?? null,
    startedAt: input.startedAt ?? nowIso(),
    completedAt,
    createdBy: input.createdBy ?? 'system',
  };
}

export function createActionExecutionFromExperimentDesign(
  design: ExperimentDesign,
  opts: {
    targetEpisodeId?: string;
    observedOutcomeSummary?: string;
    createdBy?: string;
  } = {}
): ActionExecution {
  const actionRef = design.recommendedAction;
  const actionKind = design.candidateMeasurements.includes(actionRef)
    ? 'measurement'
    : 'intervention';

  return createActionExecution({
    basedOnExperimentDesignId: design.id,
    sourceEpisodeId: design.baseEpisodeId,
    targetEpisodeId: opts.targetEpisodeId,
    actionRef,
    actionKind,
    parameters: {},
    executionStatus: 'completed',
    observedOutcomeSummary: opts.observedOutcomeSummary,
    predictionError: null,
    completedAt: nowIso(),
    createdBy: opts.createdBy ?? 'pipeline_action_execution',
  });
}
