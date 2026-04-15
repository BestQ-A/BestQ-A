/**
 * CounterfactualScenario — v8 反事实场景对象
 * implements: docs/current/counterfactual-scenario-contract.md
 *
 * 不是 AcceptedReconstruction 的别名。
 * 给定 Episode + modifiedAssumptions，用 MechanismProgram 推演一条假设轨迹。
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

export interface CounterfactualAssumption {
  /** 被改动的变量/前提/动作 ref */
  targetRef: string;
  modification: 'set' | 'remove' | 'perturb';
  fromValue?: unknown;
  toValue?: unknown;
  rationale?: string;
}

export interface PredictedStep {
  step: number;
  kind: 'initial_condition' | 'latent_phase' | 'observable' | 'intervention' | 'outcome';
  content: string;
  source: 'program_simulated' | 'episode_anchored';
}

export interface CounterfactualScenario {
  id: string;
  /** 基于哪个真实 Episode */
  baseEpisodeId: string;
  /** 基于哪条 accepted reconstruction */
  baseReconstructionId: string;
  /** 改动了什么（不变量 1：非空） */
  modifiedAssumptions: CounterfactualAssumption[];
  /** 用什么程序推演（不变量 2：非空） */
  mechanismProgramRefs: string[];
  /** 可选推导链 */
  derivationTraceId?: string;
  /** 预测轨迹（不变量 3：非空） */
  predictedTrajectory: PredictedStep[];
  /** 预测会观测到的信号 */
  predictedObservationSignals: string[];
  /** 预测结局（不变量 4：非空字符串） */
  predictedOutcome: string;
  /** 与原轨迹的关键分叉点（可空数组，不可 null） */
  divergencePoints: string[];
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateCounterfactualScenarioInput {
  id?: string;
  baseEpisodeId: string;
  baseReconstructionId: string;
  modifiedAssumptions: CounterfactualAssumption[];
  mechanismProgramRefs: string[];
  derivationTraceId?: string;
  predictedTrajectory: PredictedStep[];
  predictedObservationSignals?: string[];
  predictedOutcome: string;
  divergencePoints?: string[];
  createdBy?: string;
  status?: CounterfactualScenario['status'];
}

export function createCounterfactualScenario(
  input: CreateCounterfactualScenarioInput
): CounterfactualScenario {
  // 不变量 1：modifiedAssumptions 非空
  if (!input.modifiedAssumptions || input.modifiedAssumptions.length === 0) {
    throw new Error('CounterfactualScenario 不变量 1：modifiedAssumptions 不可为空');
  }
  // 不变量 2：mechanismProgramRefs 非空
  if (!input.mechanismProgramRefs || input.mechanismProgramRefs.length === 0) {
    throw new Error('CounterfactualScenario 不变量 2：mechanismProgramRefs 不可为空');
  }
  // 不变量 3：predictedTrajectory 非空
  if (!input.predictedTrajectory || input.predictedTrajectory.length === 0) {
    throw new Error('CounterfactualScenario 不变量 3：predictedTrajectory 不可为空');
  }
  // 不变量 4：predictedOutcome 非空字符串
  if (!input.predictedOutcome || input.predictedOutcome.trim() === '') {
    throw new Error('CounterfactualScenario 不变量 4：predictedOutcome 不可为空');
  }

  return {
    id:                          input.id ?? `CS_${crypto.randomBytes(6).toString('hex')}`,
    baseEpisodeId:               input.baseEpisodeId,
    baseReconstructionId:        input.baseReconstructionId,
    modifiedAssumptions:         input.modifiedAssumptions,
    mechanismProgramRefs:        input.mechanismProgramRefs,
    derivationTraceId:           input.derivationTraceId,
    predictedTrajectory:         input.predictedTrajectory,
    predictedObservationSignals: input.predictedObservationSignals ?? [],
    predictedOutcome:            input.predictedOutcome,
    divergencePoints:            input.divergencePoints            ?? [],
    createdAt:                   new Date().toISOString(),
    createdBy:                   input.createdBy                   ?? 'system',
    status:                      input.status                      ?? 'draft',
  };
}
