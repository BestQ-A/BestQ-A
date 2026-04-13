import crypto from 'crypto';

import type { FidelityScore } from './reconstruction.js';

// =============================================================================
// 接口定义
// =============================================================================

/**
 * MechanismInstance — MechanismClass × Episode 的绑定积
 *
 * 描述：在某次具体的 Episode 里，MechanismClass 的各 slot 绑定到了哪些实体/状态/动作。
 * 是 candidate→compiled 链路的中间承载对象。
 */
export interface MechanismInstance {
  /** 实例唯一 ID，格式：MI_<episodeId短串>_<hex4> */
  id: string;

  /** 所属 Episode ID */
  episode_id: string;

  /** 对应的 MechanismClass ID */
  mechanism_class_id: string;

  /**
   * 槽位绑定映射：MechanismClass.inputSlots 的 slot 名 → Episode 中实体/状态/动作 ID
   * 例：{ "trigger_entity": "atom_abc123", "state_var": "sv_001" }
   */
  bindings: Record<string, string>;

  /** 生命周期状态 */
  status: 'candidate' | 'accepted' | 'rejected';

  // ---- 四维评分向量（evaluate 后填充） ----

  /** 解释了多少相关 ObservationRecord（0..1） */
  coverage: number;

  /** 被多少 ObservationRecord 直接反驳（0..1，越低越好） */
  contradiction: number;

  /**
   * 回放误差：MechanismClass.phases 与 Episode.timeline 的对齐误差（0..1，越低越好）
   * 0 = 完全对齐，1 = 完全不对齐
   */
  replay_error: number;

  /** 上下文匹配分：MechanismClass 预设上下文与 Episode.context 的匹配度（0..1） */
  scope_fit: number;

  /** 拒绝原因（status='rejected' 时必须非空） */
  rejection_reason?: string;

  /** 创建时间（ISO 8601） */
  created_at: string;

  /** 创建来源标识 */
  created_by: string;
}

/**
 * EvaluationScores — evaluate 时传入的四维评分输入
 */
export interface EvaluationScores {
  /** 覆盖率（0..1） */
  coverage: number;
  /** 反驳率（0..1，越低越好） */
  contradiction: number;
  /** 回放误差（0..1，越低越好） */
  replay_error: number;
  /** 上下文匹配分（0..1） */
  scope_fit: number;
}

// =============================================================================
// 接受阈值常量
// =============================================================================

/** 默认晋升为 accepted 的阈值 */
const THRESHOLD = {
  replay_error_max: 0.3,
  coverage_min: 0.6,
  contradiction_max: 0.2,
  scope_fit_min: 0.3,
} as const;

// =============================================================================
// 工具函数
// =============================================================================

function nowIso(): string {
  return new Date().toISOString();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * 生成 MI ID。
 * 格式：MI_<episodeId 前 8 字符>_<4 字节随机 hex>
 */
function generateMechanismInstanceId(episodeId: string): string {
  const shortEpisode = episodeId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const hex4 = crypto.randomBytes(4).toString('hex');
  return `MI_${shortEpisode}_${hex4}`;
}

// =============================================================================
// 工厂函数
// =============================================================================

/**
 * createMechanismInstance — 创建初始 candidate 实例
 *
 * @param episodeId       所属 Episode ID
 * @param mechanismClassId 对应的 MechanismClass ID
 * @param bindings        slot 名 → 实体/状态/动作 ID 映射
 * @param createdBy       创建来源（默认 'pipeline_s7'）
 */
export function createMechanismInstance(
  episodeId: string,
  mechanismClassId: string,
  bindings: Record<string, string>,
  createdBy = 'pipeline_s7',
): MechanismInstance {
  return {
    id: generateMechanismInstanceId(episodeId),
    episode_id: episodeId,
    mechanism_class_id: mechanismClassId,
    bindings: { ...bindings },
    status: 'candidate',
    coverage: 0,
    contradiction: 0,
    replay_error: 0,
    scope_fit: 0,
    created_at: nowIso(),
    created_by: createdBy,
  };
}

// =============================================================================
// 评分函数
// =============================================================================

/**
 * evaluateMechanismInstance — 填充四维评分，返回新实例（不可变更新）
 *
 * 所有传入分数都会被 clamp 到 [0, 1]。
 * 调用后 status 仍为 'candidate'，需再调用 acceptInstance() 决定晋升。
 *
 * @param instance 待评分实例
 * @param scores   四维评分输入
 */
export function evaluateMechanismInstance(
  instance: MechanismInstance,
  scores: EvaluationScores,
): MechanismInstance {
  return {
    ...instance,
    coverage: clamp01(scores.coverage),
    contradiction: clamp01(scores.contradiction),
    replay_error: clamp01(scores.replay_error),
    scope_fit: clamp01(scores.scope_fit),
  };
}

// =============================================================================
// 状态转移函数
// =============================================================================

/**
 * acceptInstance — 按默认阈值决定 accepted / rejected，返回新实例
 *
 * 晋升条件（全部满足才 accepted）：
 * - replay_error < 0.3
 * - coverage > 0.6
 * - contradiction < 0.2
 * - scope_fit > 0.3
 *
 * @param instance 已完成 evaluate 的实例
 */
export function acceptInstance(instance: MechanismInstance): MechanismInstance {
  const failures: string[] = [];

  if (instance.replay_error >= THRESHOLD.replay_error_max) {
    failures.push(`replay_error=${instance.replay_error.toFixed(3)} >= ${THRESHOLD.replay_error_max}`);
  }
  if (instance.coverage <= THRESHOLD.coverage_min) {
    failures.push(`coverage=${instance.coverage.toFixed(3)} <= ${THRESHOLD.coverage_min}`);
  }
  if (instance.contradiction >= THRESHOLD.contradiction_max) {
    failures.push(`contradiction=${instance.contradiction.toFixed(3)} >= ${THRESHOLD.contradiction_max}`);
  }
  if (instance.scope_fit <= THRESHOLD.scope_fit_min) {
    failures.push(`scope_fit=${instance.scope_fit.toFixed(3)} <= ${THRESHOLD.scope_fit_min}`);
  }

  if (failures.length === 0) {
    return { ...instance, status: 'accepted', rejection_reason: undefined };
  }

  return {
    ...instance,
    status: 'rejected',
    rejection_reason: failures.join('; '),
  };
}

// =============================================================================
// 兼容旧系统的 FidelityScore 派生
// =============================================================================

/**
 * deriveFidelityScore — 从四维评分派生兼容旧系统的 FidelityScore
 *
 * 计算公式（合约 §5）：
 *   score = coverage × (1 - contradiction) × (1 - replay_error) × scope_fit
 *
 * matched_nodes / missed_nodes / extra_nodes 无法从四维评分直接恢复，
 * 调用方可在此基础上补充具体节点列表。
 *
 * @param instance     已完成 evaluate 的 MechanismInstance
 * @param matchedNodes 可选：已匹配节点列表（默认空数组）
 * @param missedNodes  可选：缺失节点列表（默认空数组）
 * @param extraNodes   可选：多余节点列表（默认空数组）
 */
export function deriveFidelityScore(
  instance: MechanismInstance,
  matchedNodes: string[] = [],
  missedNodes: string[] = [],
  extraNodes: string[] = [],
): FidelityScore {
  const score = clamp01(
    instance.coverage *
    (1 - instance.contradiction) *
    (1 - instance.replay_error) *
    instance.scope_fit,
  );

  return {
    score,
    method: 'mechanism_instance_derived',
    matched_nodes: matchedNodes,
    missed_nodes: missedNodes,
    extra_nodes: extraNodes,
  };
}
