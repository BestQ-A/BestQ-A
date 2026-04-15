/**
 * ExperimentDesign — v8 实验设计对象
 * implements: docs/current/experiment-design-contract.md
 *
 * 站在 CounterfactualScenario 之上：
 * 给定多个反事实场景，选择下一次最值得执行的观测或干预。
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

export interface ExperimentDesign {
  id: string;
  /** 基于哪个真实 Episode */
  baseEpisodeId: string;
  /** 基于哪些反事实场景（不变量 1：非空） */
  basedOnCounterfactualIds: string[];

  /** 想减少不确定性的变量 / 机制 / 结论 ref */
  targetUncertaintyRefs: string[];
  /** 候选观测动作（不变量 2：与 candidateInterventions 至少一侧非空） */
  candidateMeasurements: string[];
  /** 候选干预动作（不变量 2：与 candidateMeasurements 至少一侧非空） */
  candidateInterventions: string[];

  /** 预期信息增益，范围 [0,1]（不变量 3） */
  expectedInformationGain: number;
  /** 对各候选机制的区分力 map */
  discriminatingPower: Record<string, number>;
  /** 安全约束（可为空数组，不可为 null）（不变量 5） */
  safetyConstraints: string[];

  /** 当前推荐实验/干预，必须属于候选集合（不变量 4） */
  recommendedAction: string;

  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateExperimentDesignInput {
  id?: string;
  baseEpisodeId: string;
  basedOnCounterfactualIds: string[];
  targetUncertaintyRefs?: string[];
  candidateMeasurements?: string[];
  candidateInterventions?: string[];
  expectedInformationGain: number;
  discriminatingPower?: Record<string, number>;
  safetyConstraints?: string[];
  recommendedAction: string;
  createdBy?: string;
  status?: ExperimentDesign['status'];
}

// =============================================================================
// 信息增益计算引擎
// =============================================================================

/**
 * 假设预测器：给定一个候选动作，每个假设会预测哪些观测信号。
 */
export interface HypothesisPredictor {
  /** MechanismClass ID 或假设标识符 */
  hypothesisId: string;
  /** 该假设在此动作下预测会出现的观测信号 keys */
  predictedSignals: string[];
}

/**
 * 计算某个候选动作在一组假设下的信息增益。
 *
 * 原理：统计「执行该动作后，能区分的假设对数 / 总假设对数」。
 * 两个假设"可区分"= 它们预测的信号集合不完全相同。
 *
 * 返回值在 [0, 1]：0 = 完全无法区分，1 = 每对假设均可区分。
 */
export function computeInformationGain(
  hypotheses: HypothesisPredictor[],
): number {
  if (hypotheses.length <= 1) return 0;

  let discriminatingPairs = 0;
  let totalPairs = 0;

  for (let i = 0; i < hypotheses.length; i++) {
    for (let j = i + 1; j < hypotheses.length; j++) {
      totalPairs++;
      const sigsI = new Set(hypotheses[i].predictedSignals);
      const sigsJ = new Set(hypotheses[j].predictedSignals);
      // 两个信号集合不完全相同 → 可区分
      const isDistinct =
        hypotheses[i].predictedSignals.some(s => !sigsJ.has(s)) ||
        hypotheses[j].predictedSignals.some(s => !sigsI.has(s));
      if (isDistinct) discriminatingPairs++;
    }
  }

  return totalPairs > 0 ? discriminatingPairs / totalPairs : 0;
}

/**
 * 从候选动作集合中选出信息增益最大的实验。
 *
 * @param actionPredictors - 每个候选动作对应一组假设预测器
 * @returns 最优动作、信息增益值、所有动作的区分力 map
 */
export function selectOptimalExperiment(
  actionPredictors: Record<string, HypothesisPredictor[]>,
): {
  bestAction: string;
  informationGain: number;
  discriminatingPower: Record<string, number>;
} {
  const candidates = Object.keys(actionPredictors);
  if (candidates.length === 0) {
    return { bestAction: '', informationGain: 0, discriminatingPower: {} };
  }

  const discriminatingPower: Record<string, number> = {};
  let bestAction = candidates[0];
  let bestGain = -1;

  for (const action of candidates) {
    const gain = computeInformationGain(actionPredictors[action] ?? []);
    discriminatingPower[action] = gain;
    if (gain > bestGain) {
      bestGain = gain;
      bestAction = action;
    }
  }

  return { bestAction, informationGain: Math.max(0, bestGain), discriminatingPower };
}

export function createExperimentDesign(
  input: CreateExperimentDesignInput
): ExperimentDesign {
  // 不变量 1：basedOnCounterfactualIds 非空
  if (!input.basedOnCounterfactualIds || input.basedOnCounterfactualIds.length === 0) {
    throw new Error('ExperimentDesign 不变量 1：basedOnCounterfactualIds 不可为空');
  }

  const measurements  = input.candidateMeasurements  ?? [];
  const interventions = input.candidateInterventions ?? [];

  // 不变量 2：candidateMeasurements 与 candidateInterventions 至少一侧非空
  if (measurements.length === 0 && interventions.length === 0) {
    throw new Error('ExperimentDesign 不变量 2：candidateMeasurements 与 candidateInterventions 至少一侧非空');
  }

  // 不变量 3：expectedInformationGain 在 [0,1]
  if (
    typeof input.expectedInformationGain !== 'number' ||
    input.expectedInformationGain < 0 ||
    input.expectedInformationGain > 1
  ) {
    throw new Error('ExperimentDesign 不变量 3：expectedInformationGain 必须在 [0,1] 内');
  }

  // 不变量 4：recommendedAction 必须属于候选集合
  const allCandidates = [...measurements, ...interventions];
  if (!allCandidates.includes(input.recommendedAction)) {
    throw new Error(
      `ExperimentDesign 不变量 4：recommendedAction "${input.recommendedAction}" 不在候选集合中`
    );
  }

  // 不变量 5：safetyConstraints 不可为 null（可为空数组）
  const safetyConstraints = input.safetyConstraints ?? [];

  return {
    id:                       input.id ?? `ED_${crypto.randomBytes(6).toString('hex')}`,
    baseEpisodeId:            input.baseEpisodeId,
    basedOnCounterfactualIds: input.basedOnCounterfactualIds,
    targetUncertaintyRefs:    input.targetUncertaintyRefs   ?? [],
    candidateMeasurements:    measurements,
    candidateInterventions:   interventions,
    expectedInformationGain:  input.expectedInformationGain,
    discriminatingPower:      input.discriminatingPower     ?? {},
    safetyConstraints,
    recommendedAction:        input.recommendedAction,
    createdAt:                new Date().toISOString(),
    createdBy:                input.createdBy               ?? 'system',
    status:                   input.status                  ?? 'draft',
  };
}
