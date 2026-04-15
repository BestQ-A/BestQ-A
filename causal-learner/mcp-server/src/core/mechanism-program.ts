/**
 * MechanismProgram — 从动力学模板到可执行状态转移程序
 * implements: docs/current/mechanism-program-contract.md
 *
 * MechanismClass = 机制是什么
 * MechanismProgram = 机制如何运行（phase 顺序、状态变化、观测发射、失效条件）
 */

import crypto from 'crypto';
import { DEFAULT_MECHANISM_CLASS_ID } from './mechanism-class.js';

// =============================================================================
// 类型定义
// =============================================================================

/** 机制程序的一个执行阶段 */
export interface MechanismProgramPhase {
  name: string;
  /** 本 phase 预期造成的状态变化 */
  expectedStateChanges: string[];
  /** 本 phase 预期发出的 observation keys（对应 ObservationModel.outputSignals.key） */
  expectedObservations: string[];
  /** 阈值触发条件（可选） */
  thresholdTriggers?: string[];
}

/** 机制程序 */
export interface MechanismProgram {
  id: string;
  /** 指向真实 MechanismClass */
  mechanismClassRef: string;
  name: string;
  description: string;

  /** 输入端：所需 StateVarClass / LatentStateClass / EntityClass refs */
  inputStateRefs: string[];
  /** 上下文输入：ConstraintClass refs */
  contextInputRefs: string[];
  /** 触发前提 */
  preconditions: string[];

  /** 核心程序：有序阶段列表（不变量 I1：至少一个） */
  phases: MechanismProgramPhase[];

  /** 输出端：程序会发射的 observation signal keys（覆盖所有 phase.expectedObservations） */
  emittedObservationSignals: string[];
  /** 可能的终局 */
  outcomes: string[];

  /** 可干预点（对应 phase 名 / 点 id）  */
  interventionPoints: string[];
  /** 适用上下文 / 有效域（自由文本描述，向后兼容） */
  validityEnvelope: string[];
  /** 指向显式 ValidityEnvelope 对象的 ID 列表（P05 引入） */
  validityEnvelopeRefs: string[];
  /** 失效条件（可为空数组，但不可为 null，不变量 I5） */
  failsWhen: string[];

  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateMechanismProgramInput {
  id?: string;
  mechanismClassRef: string;
  name: string;
  description: string;
  inputStateRefs?: string[];
  contextInputRefs?: string[];
  preconditions?: string[];
  phases: MechanismProgramPhase[];
  emittedObservationSignals?: string[];
  outcomes?: string[];
  interventionPoints?: string[];
  validityEnvelope?: string[];
  validityEnvelopeRefs?: string[];
  failsWhen?: string[];
  createdBy?: string;
  status?: MechanismProgram['status'];
}

export function createMechanismProgram(input: CreateMechanismProgramInput): MechanismProgram {
  // 不变量 I1：phases 非空
  if (!input.phases || input.phases.length === 0) {
    throw new Error('MechanismProgram 不变量 I1：phases 不可为空');
  }

  // 不变量 I2：emittedObservationSignals 应覆盖所有 phase.expectedObservations 的并集
  const allPhaseObs = new Set(input.phases.flatMap(p => p.expectedObservations));
  const emitted = input.emittedObservationSignals ?? [...allPhaseObs];
  for (const obs of allPhaseObs) {
    if (!emitted.includes(obs)) {
      throw new Error(`MechanismProgram 不变量 I2：emittedObservationSignals 缺少 phase 中声明的 "${obs}"`);
    }
  }

  return {
    id:                      input.id ?? `MP_${crypto.randomBytes(6).toString('hex')}`,
    mechanismClassRef:       input.mechanismClassRef,
    name:                    input.name,
    description:             input.description,
    inputStateRefs:          input.inputStateRefs      ?? [],
    contextInputRefs:        input.contextInputRefs    ?? [],
    preconditions:           input.preconditions       ?? [],
    phases:                  input.phases,
    emittedObservationSignals: emitted,
    outcomes:                input.outcomes            ?? [],
    interventionPoints:      input.interventionPoints  ?? [],
    validityEnvelope:        input.validityEnvelope    ?? [],
    validityEnvelopeRefs:    input.validityEnvelopeRefs ?? [],
    failsWhen:               input.failsWhen           ?? [],
    createdAt:               new Date().toISOString(),
    createdBy:               input.createdBy           ?? 'system',
    status:                  input.status              ?? 'draft',
  };
}

// =============================================================================
// 运行时执行（Phase 推演引擎）
// =============================================================================

/** 执行时的世界状态快照 */
export interface ExecutionContext {
  /** 世界状态变量 key → value */
  stateVars: Record<string, unknown>;
}

/** 干预：在指定 phase 停止并覆盖部分状态变量 */
export interface ProgramIntervention {
  /** 在哪个 phase 名处停止（执行到该 phase 之前停止） */
  stopBeforePhase: string;
  /** 覆盖哪些状态变量 */
  stateOverrides?: Record<string, unknown>;
  /** 干预说明 */
  reason: string;
}

/** 单个 phase 的执行结果 */
export interface PhaseExecutionResult {
  phaseName: string;
  executed: boolean;
  stateChangesApplied: string[];
  observationsEmitted: string[];
  haltReason?: string;
}

/** 完整的 phase 执行轨迹 */
export interface PhasedTrajectory {
  programId: string;
  contextSnapshot: ExecutionContext;
  phaseResults: PhaseExecutionResult[];
  finalOutcome: string;
  completedPhases: number;
  totalPhases: number;
  wasInterrupted: boolean;
}

/**
 * 执行 MechanismProgram 的 phase 序列。
 *
 * - 无干预：顺序执行所有 phase，返回成功结局
 * - 有干预：在 stopBeforePhase 处停止，返回 interrupted 结局
 * - failsWhen：检测 stateVars 中满足失效条件的情况（格式 "key=value"）
 */
export function executePhasedProgram(
  program: MechanismProgram,
  context: ExecutionContext,
  intervention?: ProgramIntervention,
): PhasedTrajectory {
  // 应用干预的初始状态覆盖
  const activeContext: ExecutionContext = {
    stateVars: { ...context.stateVars, ...(intervention?.stateOverrides ?? {}) },
  };

  const phaseResults: PhaseExecutionResult[] = [];
  let wasInterrupted = false;
  let finalOutcome = program.outcomes.find(o => /confirm|success|complete/i.test(o))
    ?? program.outcomes[0]
    ?? 'completed';

  for (const phase of program.phases) {
    // 干预点：在该 phase 之前停止
    if (intervention && intervention.stopBeforePhase === phase.name) {
      phaseResults.push({
        phaseName: phase.name,
        executed: false,
        stateChangesApplied: [],
        observationsEmitted: [],
        haltReason: `intervention: ${intervention.reason}`,
      });
      wasInterrupted = true;
      finalOutcome = `interrupted_before_${phase.name}`;
      break;
    }

    // 检测 failsWhen 条件（格式 "key=value"）
    const failCondition = program.failsWhen.find(cond => {
      const eq = cond.indexOf('=');
      if (eq < 0) return false;
      const key = cond.slice(0, eq).trim();
      const val = cond.slice(eq + 1).trim();
      return String(activeContext.stateVars[key]) === val;
    });

    if (failCondition) {
      phaseResults.push({
        phaseName: phase.name,
        executed: false,
        stateChangesApplied: [],
        observationsEmitted: [],
        haltReason: `failsWhen: ${failCondition}`,
      });
      wasInterrupted = true;
      finalOutcome = program.outcomes.find(o => /reject|fail/i.test(o)) ?? 'failed';
      break;
    }

    phaseResults.push({
      phaseName: phase.name,
      executed: true,
      stateChangesApplied: [...phase.expectedStateChanges],
      observationsEmitted: [...phase.expectedObservations],
    });
  }

  return {
    programId: program.id,
    contextSnapshot: activeContext,
    phaseResults,
    finalOutcome,
    completedPhases: phaseResults.filter(r => r.executed).length,
    totalPhases: program.phases.length,
    wasInterrupted,
  };
}

// =============================================================================
// 默认 MechanismProgram（第一轮：所有 path_projection MechanismInstance 共享）
// =============================================================================

/** 固定 ID，方便 pipeline 幂等获取 */
export const DEFAULT_MECHANISM_PROGRAM_ID = 'MP_default_path_projection';

/**
 * 默认观测驱动路径投影程序（第一轮过渡模型）。
 * 语义："通过 Atom 路径投影触发的最小机制程序"
 */
export function createDefaultMechanismProgram(): MechanismProgram {
  return createMechanismProgram({
    id:               DEFAULT_MECHANISM_PROGRAM_ID,
    mechanismClassRef: DEFAULT_MECHANISM_CLASS_ID,
    name:             'default_path_projection',
    description:      '通过 AtomGraph 路径投影触发的默认机制程序（第一轮过渡模型）。不携带真实 phase 语义，占位用。',
    phases: [
      {
        name:                   'observation_phase',
        expectedStateChanges:   [],
        expectedObservations:   ['atomId', 'factIndex'],
        thresholdTriggers:      [],
      },
    ],
    emittedObservationSignals: ['atomId', 'factIndex'],
    outcomes:          ['mechanism_confirmed', 'mechanism_rejected'],
    interventionPoints: ['observation_phase'],
    validityEnvelope:  [],
    failsWhen:         [],
    createdBy:         'pipeline_system',
    status:            'current',
  });
}
