import crypto from 'crypto';

// ============================================================
// MechanismClass — 动力学模板（Ontology Layer 核心对象）
// 描述某类现象如何在时间上分阶段展开，支撑 Episode 回放与重建
// ============================================================

/** 机制编译状态 */
export type MechanismCompilationStatus = 'candidate' | 'compiled' | 'deprecated';

/** 机制分期：描述某一时间段内预期的状态变化与可观测特征 */
export interface MechanismPhase {
  /** 阶段名称，例如 latent / trigger / propagation / observation / outcome */
  name: string;
  /** 该阶段预期发生的 StateVarClass 变化列表 */
  expected_state_changes: string[];
  /** 该阶段预期出现的 ObservationRecord 特征（observableSignatures 的子集） */
  expected_observations: string[];
}

/** MechanismClass — 可复用的动力学模板 */
export interface MechanismClass {
  /** 唯一标识，格式：MC_<名称slug>_<hex4> */
  id: string;
  /** 人类可读名称 */
  name: string;
  /** 对该机制类的自然语言描述 */
  description: string;

  // ---- 输入绑定 ----
  /** slot 名 → EntityClass / StateVarClass ID 的映射 */
  input_slots: Record<string, string>;

  // ---- 过程骨架 ----
  /** 有序分期列表（phases.length >= 1） */
  phases: MechanismPhase[];
  /** 触发前提（对应 Episode 开始时 StateSnapshot 的断言） */
  preconditions: string[];
  /** 应当出现的可观测特征（所有 phase.expected_observations 的超集） */
  observable_signatures: string[];
  /** 可被动作打断/修正的阶段名称（每项必须存在于 phases[*].name） */
  intervention_points: string[];
  /** 可能的终局，例如 success / failure / partial */
  outcomes: string[];

  // ---- 晋升元数据 ----
  /** 支持该机制类的 Episode ID 列表（多 Episode 门控） */
  supporting_episode_ids: string[];
  /** 编译状态 */
  compilation_status: MechanismCompilationStatus;

  // ---- MechanismProgram 关联位 ----
  /** 关联的 MechanismProgram ID 列表（bridge §C：一个 Class 可有多个 Program 版本） */
  mechanismProgramIds: string[];

  created_at: string;
  created_by: string;
}

/** 固定默认 MechanismClass（第一轮去 proxy 过渡用） */
export const DEFAULT_MECHANISM_CLASS_ID = 'MC_default_path_projection_0000';

// ============================================================
// 内部工具函数
// ============================================================

function nowIso(): string {
  return new Date().toISOString();
}

/** 将名称转为 slug（小写、非字母数字替换为下划线，去除首尾下划线） */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'mc';
}

/** 生成 4 字节十六进制后缀 */
function hex4(): string {
  return crypto.randomBytes(2).toString('hex');
}

// ============================================================
// 工厂函数
// ============================================================

interface CreateMechanismClassInput {
  id?: string;
  name: string;
  description: string;
  input_slots?: Record<string, string>;
  phases?: MechanismPhase[];
  preconditions?: string[];
  observable_signatures?: string[];
  intervention_points?: string[];
  outcomes?: string[];
  supporting_episode_ids?: string[];
  compilation_status?: MechanismCompilationStatus;
  mechanismProgramIds?: string[];
  created_by?: string;
  created_at?: string;
}

/**
 * 创建 MechanismClass 实例。
 * - 自动生成 ID：MC_<slug>_<hex4>
 * - compilation_status 默认 'candidate'
 */
export function createMechanismClass(input: CreateMechanismClassInput): MechanismClass {
  const id = input.id ?? `MC_${toSlug(input.name)}_${hex4()}`;

  return {
    id,
    name: input.name,
    description: input.description,
    input_slots: input.input_slots ?? {},
    phases: input.phases ?? [],
    preconditions: input.preconditions ?? [],
    observable_signatures: input.observable_signatures ?? [],
    intervention_points: input.intervention_points ?? [],
    outcomes: input.outcomes ?? [],
    supporting_episode_ids: input.supporting_episode_ids ?? [],
    compilation_status: input.compilation_status ?? 'candidate',
    mechanismProgramIds: input.mechanismProgramIds ?? [],
    created_at: input.created_at ?? nowIso(),
    created_by: input.created_by ?? 'system',
  };
}

/**
 * 默认观测驱动路径投影机制类（第一轮最小去 proxy）。
 * 语义仍然保守：它只是让主链第一次具备真实 MC_* 身份。
 */
export function createDefaultMechanismClass(): MechanismClass {
  return createMechanismClass({
    id: DEFAULT_MECHANISM_CLASS_ID,
    name: 'default_path_projection',
    description: '通过 AtomGraph 路径投影形成的默认机制类（第一轮去 proxy 过渡模型）。',
    input_slots: {
      slot_0: 'ObservationAtom',
    },
    phases: [
      {
        name: 'observation_phase',
        expected_state_changes: [],
        expected_observations: ['atomId', 'factIndex'],
      },
    ],
    preconditions: [],
    observable_signatures: ['atomId', 'factIndex'],
    intervention_points: ['observation_phase'],
    outcomes: ['mechanism_confirmed', 'mechanism_rejected'],
    supporting_episode_ids: [],
    compilation_status: 'candidate',
    mechanismProgramIds: [],
    created_by: 'pipeline_system',
  });
}

// ============================================================
// 晋升函数
// ============================================================

/** 晋升成功结果 */
export interface PromoteSuccess {
  promoted: true;
  mechanism: MechanismClass;
}

/** 晋升失败结果 */
export interface PromoteNoPromotion {
  promoted: false;
  reason: string;
}

export type PromoteResult = PromoteSuccess | PromoteNoPromotion;

/**
 * 尝试将 MechanismClass 从 candidate 晋升为 compiled。
 *
 * 门槛（本函数可检验的静态条件）：
 * 1. phases 非空
 * 2. supporting_episode_ids.length >= 2
 * 3. mechanismProgramIds.length >= 1（至少绑定一个 MechanismProgram）
 *
 * 返回新对象，不修改原对象。
 */
export function promoteMechanismClass(mc: MechanismClass): PromoteResult {
  if (mc.phases.length === 0) {
    return { promoted: false, reason: 'phases 为空，无法晋升' };
  }

  if (mc.supporting_episode_ids.length < 2) {
    return {
      promoted: false,
      reason: `supporting_episode_ids 数量不足（当前 ${mc.supporting_episode_ids.length}，需要 >= 2）`,
    };
  }

  if (mc.mechanismProgramIds.length < 1) {
    return {
      promoted: false,
      reason: 'mechanismProgramIds 为空，晋升为 compiled 需至少绑定一个 MechanismProgram',
    };
  }

  const promoted: MechanismClass = { ...mc, compilation_status: 'compiled' };
  return { promoted: true, mechanism: promoted };
}

/** 废弃结果 */
export interface DeprecateSuccess {
  deprecated: true;
  mechanism: MechanismClass;
}

export interface DeprecateNoOp {
  deprecated: false;
  reason: string;
}

export type DeprecateResult = DeprecateSuccess | DeprecateNoOp;

/**
 * 将 MechanismClass 从 compiled 标记为 deprecated。
 *
 * 只有 `compilation_status='compiled'` 的对象可以被废弃。
 * candidate 直接丢弃，不走 deprecated 路径。
 *
 * 返回新对象，不修改原对象。
 */
export function deprecateMechanismClass(mc: MechanismClass): DeprecateResult {
  if (mc.compilation_status !== 'compiled') {
    return {
      deprecated: false,
      reason: `只有 compiled 状态可废弃，当前为 '${mc.compilation_status}'`,
    };
  }
  const deprecated: MechanismClass = { ...mc, compilation_status: 'deprecated' };
  return { deprecated: true, mechanism: deprecated };
}

// ============================================================
// 验证函数
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 验证 MechanismClass 所有不变量：
 * 1. phases.length >= 1
 * 2. observable_signatures 是所有 phase.expected_observations 的超集
 * 3. intervention_points 中的每个名称必须对应某个 phase.name
 * 4. compilationStatus = 'compiled' 时 supporting_episode_ids.length >= 2
 * 5. ID 格式符合 MC_<slug>_<hex4>
 * 6. compilationStatus = 'compiled' 时 mechanismProgramIds.length >= 1
 */
export function validateMechanismClass(mc: MechanismClass): ValidationResult {
  const errors: string[] = [];

  // 不变量 1：phases 非空
  if (mc.phases.length < 1) {
    errors.push('不变量 1 违反：phases 必须非空（phases.length >= 1）');
  }

  // 不变量 2：observable_signatures 是所有 phase.expected_observations 的超集
  const sigSet = new Set(mc.observable_signatures);
  for (const phase of mc.phases) {
    for (const obs of phase.expected_observations) {
      if (!sigSet.has(obs)) {
        errors.push(
          `不变量 2 违反：observable_signatures 缺少来自 phase "${phase.name}" 的观测特征 "${obs}"`
        );
      }
    }
  }

  // 不变量 3：intervention_points 中的每个名称必须对应某个 phase.name
  const phaseNames = new Set(mc.phases.map((p) => p.name));
  for (const point of mc.intervention_points) {
    if (!phaseNames.has(point)) {
      errors.push(
        `不变量 3 违反：intervention_points 中的 "${point}" 不对应任何 phase.name`
      );
    }
  }

  // 不变量 4：compiled 状态要求 supporting_episode_ids.length >= 2
  if (mc.compilation_status === 'compiled' && mc.supporting_episode_ids.length < 2) {
    errors.push(
      `不变量 4 违反：compilation_status='compiled' 时 supporting_episode_ids.length 必须 >= 2，当前为 ${mc.supporting_episode_ids.length}`
    );
  }

  // 不变量 5：ID 格式 MC_<slug>_<hex4>
  if (!/^MC_[a-z0-9_]{1,32}_[0-9a-f]{4}$/.test(mc.id)) {
    errors.push(`不变量 5 违反：ID "${mc.id}" 不符合格式 MC_<slug>_<hex4>`);
  }

  // 不变量 6：compiled 状态要求 mechanismProgramIds.length >= 1
  if (mc.compilation_status === 'compiled' && mc.mechanismProgramIds.length < 1) {
    errors.push(
      '不变量 6 违反：compilation_status=\'compiled\' 时 mechanismProgramIds 必须非空（需至少绑定一个 MechanismProgram）'
    );
  }

  return { valid: errors.length === 0, errors };
}
