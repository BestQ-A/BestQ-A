import crypto from 'crypto';

// =============================================================================
// MechanismInstance — Episode × MechanismClass 桥接对象
// implements: docs/current/mechanism-instance-contract.md
// v7 §3 — 把抽象机制类绑定到具体 Episode 的中间层
// =============================================================================

/** 实例生命周期状态 */
export type MechanismInstanceStatus =
  | 'candidate'   // 刚创建，尚未裁决
  | 'accepted'    // 通过路径选择与证据门控
  | 'rejected'    // 被证据或路径裁决否定
  | 'superseded'; // 被更强绑定实例取代（历史保留）

/** 实例来源类型 */
export type MechanismInstanceSourceKind =
  | 'pattern_instance' // 来自 PatternInstance 绑定
  | 'path_projection'  // 来自 AtomGraph 路径投影（过渡态，不得作为最终 current 语义）
  | 'manual';          // 人工录入

/**
 * MechanismInstance — MechanismClass 在某个 Episode 中的一次具体绑定结果。
 *
 * 不是 MechanismClass（抽象模板），不是 PatternTemplate（结构图），
 * 而是"这次 Episode 里，这个机制是如何被具体绑定和裁决的"。
 *
 * 禁止流转：rejected→accepted, accepted→candidate, superseded→accepted
 */
export interface MechanismInstance {
  /** 唯一 ID，格式 MI_<episode_id短串>_<hex4> */
  id: string;

  /** 指向 MechanismClass（允许 proxy:* 前缀表示过渡态） */
  mechanism_class_ref: string;

  /** 指向 MechanismProgram（bridge §D：draft 阶段允许为空；由程序对象实例化时应填写） */
  mechanism_program_ref?: string;

  /** 指向 Episode */
  episode_id: string;

  /**
   * 槽位绑定映射：slot/phase/role → 本 Episode 内具体对象 ID
   * 非空（I5 不变量：空绑定退化为空壳）
   */
  bindings: Record<string, string>;

  /** 来源类型 */
  source_kind: MechanismInstanceSourceKind;

  /** 来源引用（PatternInstance ID / 路径 hash / 手动笔记 ref） */
  source_ref: string | null;

  /** 关联 Claim ID 列表（accepted 时至少含一个，I2 不变量） */
  claim_ids: string[];

  /** 关联 SupportLink / RefuteLink ID 列表 */
  support_link_refs: string[];

  /** 生命周期状态 */
  status: MechanismInstanceStatus;

  /** rejected 时记录拒绝原因；其他状态为 null */
  rejection_reason?: string | null;

  /** status='superseded' 时必填，指向取代本实例的新实例 ID（I4 不变量） */
  superseded_by: string | null;

  created_at: string;
  /** "pipeline_s3" | "pipeline_s4" | "human_review" */
  created_by: string;
}

// =============================================================================
// 工厂与状态转移函数
// =============================================================================

interface CreateMechanismInstanceInput {
  episode_id: string;
  mechanism_class_ref: string;
  mechanism_program_ref?: string;
  bindings: Record<string, string>;
  source_kind?: MechanismInstanceSourceKind;
  source_ref?: string | null;
  claim_ids?: string[];
  support_link_refs?: string[];
  created_by?: string;
  created_at?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newInstanceId(episode_id: string): string {
  const short = episode_id.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '');
  return `MI_${short}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 创建处于 candidate 状态的 MechanismInstance。
 * 调用方负责后续通过 acceptInstance / rejectInstance 完成裁决。
 */
export function createMechanismInstance(input: CreateMechanismInstanceInput): MechanismInstance {
  if (Object.keys(input.bindings).length === 0) {
    throw new Error('createMechanismInstance: bindings must not be empty (I5 invariant)');
  }
  return {
    id: newInstanceId(input.episode_id),
    mechanism_class_ref: input.mechanism_class_ref,
    mechanism_program_ref: input.mechanism_program_ref,
    episode_id: input.episode_id,
    bindings: { ...input.bindings },
    source_kind: input.source_kind ?? 'path_projection',
    source_ref: input.source_ref ?? null,
    claim_ids: [...(input.claim_ids ?? [])],
    support_link_refs: [...(input.support_link_refs ?? [])],
    status: 'candidate',
    rejection_reason: null,
    superseded_by: null,
    created_at: input.created_at ?? nowIso(),
    created_by: input.created_by ?? 'pipeline_s3',
  };
}

/**
 * candidate → accepted
 * 可同时更新 claim_ids / support_link_refs（满足 I2：accepted 至少关联一个 Claim）
 */
export function acceptInstance(
  instance: MechanismInstance,
  opts?: { claim_ids?: string[]; support_link_refs?: string[] }
): MechanismInstance {
  if (instance.status !== 'candidate') {
    throw new Error(`acceptInstance: can only transition from 'candidate', got status='${instance.status}'`);
  }
  const claim_ids = opts?.claim_ids ?? instance.claim_ids;
  const support_link_refs = opts?.support_link_refs ?? instance.support_link_refs;
  if (claim_ids.length === 0 && support_link_refs.length === 0) {
    throw new Error('acceptInstance: MechanismInstance must have at least one claim_id or support_link_ref');
  }
  return {
    ...instance,
    status: 'accepted',
    claim_ids,
    support_link_refs,
  };
}

/**
 * candidate → rejected
 * @param reason 必填说明（证据反驳 / 路径非法 / invariant 违反等）
 */
export function rejectInstance(
  instance: MechanismInstance,
  reason: string
): MechanismInstance {
  if (instance.status !== 'candidate') {
    throw new Error(`rejectInstance: can only transition from 'candidate', got status='${instance.status}'`);
  }
  return {
    ...instance,
    status: 'rejected',
    superseded_by: null,
    rejection_reason: reason,
  };
}

/**
 * accepted → superseded（满足 I4：必须提供 newInstanceId）
 * @param replacedByInstanceId 取代本实例的新 MechanismInstance ID
 */
export function supersedeInstance(
  instance: MechanismInstance,
  replacedByInstanceId: string
): MechanismInstance {
  if (instance.status !== 'accepted') {
    throw new Error(`supersedeInstance: can only transition from 'accepted', got status='${instance.status}'`);
  }
  return {
    ...instance,
    status: 'superseded',
    superseded_by: replacedByInstanceId,
  };
}
