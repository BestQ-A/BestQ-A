/**
 * ObservationModel — 从世界状态到 ObservationRecord 的投影模型
 * implements: docs/current/observation-model-contract.md
 *
 * 职责：定义哪些世界状态可被观测、以什么信号形式输出、噪声/偏差/盲区来自哪里。
 * 不是 ObservationRecord 的副本，不是 SupportLink，不是 InstrumentModel 的替代。
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

/** 观测信号规格（OutputSignal 的最小描述） */
export interface ObservationSignalSpec {
  /** payload 中的 key */
  key: string;
  /** 值类型 */
  valueType: 'number' | 'boolean' | 'enum' | 'text' | 'vector';
  /** 语义说明 */
  semantics: string;
  /** 是否可缺失，默认 false */
  optional?: boolean;
}

/** 观测投影模型 */
export interface ObservationModel {
  id: string;
  name: string;
  description: string;

  /** 输入端：世界中哪些状态变量进入观测（StateVarClass / LatentStateClass / EntityClass refs） */
  observedStateRefs: string[];
  /** 输出端：该模型会发射哪些观测信号 */
  outputSignals: ObservationSignalSpec[];

  /** 观测限制 */
  blindSpots: string[];
  noiseModel: string[];
  biasModel: string[];

  /** 运行上下文（可选，后续接 Observer / Instrument 层） */
  observerModelRef?: string;
  instrumentModelRef?: string;
  validityEnvelope?: string[];

  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateObservationModelInput {
  id?: string;
  name: string;
  description: string;
  observedStateRefs?: string[];
  outputSignals?: ObservationSignalSpec[];
  blindSpots?: string[];
  noiseModel?: string[];
  biasModel?: string[];
  observerModelRef?: string;
  instrumentModelRef?: string;
  validityEnvelope?: string[];
  createdBy?: string;
  status?: ObservationModel['status'];
}

export function createObservationModel(input: CreateObservationModelInput): ObservationModel {
  if (!input.outputSignals || input.outputSignals.length === 0) {
    throw new Error('ObservationModel 不变量 I1：outputSignals 不可为空');
  }

  // 检查 outputSignals key 唯一性
  const keys = input.outputSignals.map(s => s.key);
  if (new Set(keys).size !== keys.length) {
    throw new Error('ObservationModel 不变量 I3：outputSignals[].key 必须唯一');
  }

  return {
    id:                 input.id ?? `OM_${crypto.randomBytes(6).toString('hex')}`,
    name:               input.name,
    description:        input.description,
    observedStateRefs:  input.observedStateRefs ?? [],
    outputSignals:      input.outputSignals,
    blindSpots:         input.blindSpots  ?? [],
    noiseModel:         input.noiseModel  ?? [],
    biasModel:          input.biasModel   ?? [],
    observerModelRef:   input.observerModelRef,
    instrumentModelRef: input.instrumentModelRef,
    validityEnvelope:   input.validityEnvelope,
    createdAt:          new Date().toISOString(),
    createdBy:          input.createdBy ?? 'system',
    status:             input.status ?? 'draft',
  };
}

// =============================================================================
// 默认 ObservationModel（第一轮：所有 submitObservation 路径共享）
// =============================================================================

/** 固定 ID，方便 pipeline 幂等获取 */
export const DEFAULT_OBSERVATION_MODEL_ID = 'OM_default_fact_ingest';

/**
 * 创建默认观测模型（第一轮近似）。
 * 语义："通过 submitObservation.ingestFacts 路径生成的观测"
 */
export function createDefaultObservationModel(): ObservationModel {
  return createObservationModel({
    id:          DEFAULT_OBSERVATION_MODEL_ID,
    name:        'default_fact_ingest',
    description: '通过 submitObservation.ingestFacts 路径从结构化 facts 生成的观测记录。第一轮过渡模型，不携带噪声/偏差建模。',
    observedStateRefs: [],
    outputSignals: [
      {
        key:       'atomId',
        valueType: 'text',
        semantics: '关联 Atom 的 ID',
      },
      {
        key:       'factIndex',
        valueType: 'number',
        semantics: '该观测在 ingestFacts 批次中的序号',
      },
    ],
    blindSpots:  ['latent_states', 'unobserved_variables'],
    noiseModel:  [],
    biasModel:   [],
    createdBy:   'pipeline_system',
    status:      'current',
  });
}
