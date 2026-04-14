/**
 * ValidityEnvelope — MechanismProgram 的适用边界对象
 * implements: docs/current/validity-envelope-contract.md
 *
 * MechanismProgram = 机制如何运行
 * ValidityEnvelope = 这个运行规则在哪些边界内可信
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

export type ValidityConfidenceBand = 'narrow' | 'medium' | 'broad';
export type ValidityEnvelopeStatus = 'draft' | 'current' | 'deprecated';

export interface ValidityEnvelope {
  id: string;
  /** 指向 MechanismProgram.id */
  mechanismProgramRef: string;

  /** 适用上下文 refs（ContextClass / Episode / 领域标签） */
  contextRefs: string[];
  /** 程序有效时必须满足的前置条件 */
  requiredPreconditions: string[];
  /** 导致该程序失效的条件 */
  invalidatingConditions: string[];

  /** 有效域置信带宽 */
  confidenceBand: ValidityConfidenceBand;
  /** 人类可读的有效域理由说明 */
  rationale: string;

  createdAt: string;
  createdBy: string;
  status: ValidityEnvelopeStatus;
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateValidityEnvelopeInput {
  id?: string;
  mechanismProgramRef: string;
  contextRefs?: string[];
  requiredPreconditions?: string[];
  invalidatingConditions?: string[];
  confidenceBand: ValidityConfidenceBand;
  rationale: string;
  createdBy?: string;
  status?: ValidityEnvelopeStatus;
}

const VALID_CONFIDENCE_BANDS = new Set<ValidityConfidenceBand>(['narrow', 'medium', 'broad']);

/**
 * 创建 ValidityEnvelope 实例。
 *
 * 不变量：
 * 1. mechanismProgramRef 非空
 * 2. requiredPreconditions 与 invalidatingConditions 不得同时全空
 * 3. confidenceBand 必须是 narrow | medium | broad
 * 4. rationale 必须非空
 */
export function createValidityEnvelope(input: CreateValidityEnvelopeInput): ValidityEnvelope {
  // 不变量 1：mechanismProgramRef 非空
  if (!input.mechanismProgramRef || input.mechanismProgramRef.trim() === '') {
    throw new Error('ValidityEnvelope 不变量 1：mechanismProgramRef 不可为空');
  }

  const required = input.requiredPreconditions ?? [];
  const invalidating = input.invalidatingConditions ?? [];

  // 不变量 2：requiredPreconditions 与 invalidatingConditions 不得同时全空
  if (required.length === 0 && invalidating.length === 0) {
    throw new Error(
      'ValidityEnvelope 不变量 2：requiredPreconditions 与 invalidatingConditions 不得同时为空'
    );
  }

  // 不变量 3：confidenceBand 合法
  if (!VALID_CONFIDENCE_BANDS.has(input.confidenceBand)) {
    throw new Error(
      `ValidityEnvelope 不变量 3：confidenceBand 非法值 '${input.confidenceBand}'（必须为 narrow|medium|broad）`
    );
  }

  // 不变量 4：rationale 非空
  if (!input.rationale || input.rationale.trim() === '') {
    throw new Error('ValidityEnvelope 不变量 4：rationale 不可为空');
  }

  return {
    id:                      input.id ?? `VE_${crypto.randomBytes(6).toString('hex')}`,
    mechanismProgramRef:     input.mechanismProgramRef,
    contextRefs:             input.contextRefs          ?? [],
    requiredPreconditions:   required,
    invalidatingConditions:  invalidating,
    confidenceBand:          input.confidenceBand,
    rationale:               input.rationale,
    createdAt:               new Date().toISOString(),
    createdBy:               input.createdBy            ?? 'system',
    status:                  input.status               ?? 'draft',
  };
}

// =============================================================================
// 断言（供外部校验）
// =============================================================================

export function assertValidValidityEnvelope(ve: ValidityEnvelope): void {
  if (!ve.mechanismProgramRef || ve.mechanismProgramRef.trim() === '') {
    throw new Error('ValidityEnvelope 不变量 1 违反：mechanismProgramRef 为空');
  }
  if (ve.requiredPreconditions.length === 0 && ve.invalidatingConditions.length === 0) {
    throw new Error('ValidityEnvelope 不变量 2 违反：requiredPreconditions 与 invalidatingConditions 同时为空');
  }
  if (!VALID_CONFIDENCE_BANDS.has(ve.confidenceBand)) {
    throw new Error(`ValidityEnvelope 不变量 3 违反：confidenceBand 非法 '${ve.confidenceBand}'`);
  }
  if (!ve.rationale || ve.rationale.trim() === '') {
    throw new Error('ValidityEnvelope 不变量 4 违反：rationale 为空');
  }
}

// =============================================================================
// 默认 ValidityEnvelope（与 DEFAULT_MECHANISM_PROGRAM_ID 绑定的 demo 级 VE）
// =============================================================================

export const DEFAULT_VALIDITY_ENVELOPE_ID = 'VE_default_path_projection';

export function createDefaultValidityEnvelope(mechanismProgramRef: string): ValidityEnvelope {
  return createValidityEnvelope({
    id:                   DEFAULT_VALIDITY_ENVELOPE_ID,
    mechanismProgramRef,
    contextRefs:          [],
    requiredPreconditions: ['观测数据至少覆盖一个 AtomGraph 路径节点'],
    invalidatingConditions: ['AtomGraph 路径长度为 0', '所有关联 Atom 均为噪声状态'],
    confidenceBand:       'narrow',
    rationale:            '第一轮过渡模型：路径投影有效域窄，仅在标准 Atom 观测场景下可信',
    createdBy:            'pipeline_system',
    status:               'current',
  });
}
