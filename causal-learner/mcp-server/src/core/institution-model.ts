/**
 * InstitutionModel — v10 制度模型
 * implements: docs/current/participatory-world-contract.md
 *
 * InstitutionModel 描述参与者所处的制度约束和角色分配。
 * 制度约束限制哪些动作合法，角色分配决定哪些 Agent 有权观测或干预。
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

/** 制度规则 */
export interface InstitutionRule {
  id: string;
  /** 规则描述 */
  description: string;
  /** 受约束的动作类型 */
  constrainedActionKind: string;
  /** 允许执行该动作的角色列表（空数组 = 所有角色均可） */
  allowedRoles: string[];
  /** 禁止执行该动作的角色列表 */
  forbiddenRoles: string[];
  /** 规则优先级（数字越大越优先） */
  priority: number;
}

/** 角色分配条目 */
export interface RoleAssignment {
  /** Agent / Observer ref */
  agentRef: string;
  /** 分配的角色 */
  role: string;
  /** 有效期（ISO 8601，可选） */
  validUntil?: string;
}

/** 制度模型 */
export interface InstitutionModel {
  id: string;
  name: string;
  description: string;
  /** 制度规则集（不变量 I1：至少一条规则） */
  rules: InstitutionRule[];
  /** 角色分配列表（可为空） */
  roleAssignments: RoleAssignment[];
  /** 制度所属的本体 ID（可选，v9 联邦上下文） */
  ontologyId?: string;
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

/** 权限检查结果 */
export interface PermissionCheckResult {
  allowed: boolean;
  /** 命中的规则（allowed=false 时为禁止规则） */
  matchedRule: InstitutionRule | null;
  reason: string;
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateInstitutionModelInput {
  id?: string;
  name: string;
  description: string;
  rules: InstitutionRule[];
  roleAssignments?: RoleAssignment[];
  ontologyId?: string;
  createdBy?: string;
  status?: InstitutionModel['status'];
}

export function createInstitutionModel(
  input: CreateInstitutionModelInput
): InstitutionModel {
  // 不变量 I1：rules 非空
  if (!input.rules || input.rules.length === 0) {
    throw new Error('InstitutionModel 不变量 I1：rules 不可为空');
  }

  return {
    id:              input.id ?? `IM_${crypto.randomBytes(6).toString('hex')}`,
    name:            input.name,
    description:     input.description,
    rules:           input.rules,
    roleAssignments: input.roleAssignments ?? [],
    ontologyId:      input.ontologyId,
    createdAt:       new Date().toISOString(),
    createdBy:       input.createdBy ?? 'system',
    status:          input.status ?? 'draft',
  };
}

// =============================================================================
// 权限检查
// =============================================================================

/**
 * 检查某个 Agent 是否有权执行特定动作类型。
 * 逻辑：
 * 1. 从 roleAssignments 中找到该 Agent 的角色列表
 * 2. 在 rules 中找所有 constrainedActionKind 匹配的规则，按 priority 降序排序
 * 3. 若某条规则的 forbiddenRoles 包含该 Agent 的任意角色 → 拒绝
 * 4. 若某条规则的 allowedRoles 非空且包含该 Agent 的任意角色 → 允许
 * 5. 若某条规则的 allowedRoles 为空（所有角色均可） → 允许
 * 6. 无匹配规则 → 默认允许（开放世界假设）
 *
 * @param institution   InstitutionModel
 * @param agentRef      Agent ref
 * @param actionKind    动作类型
 * @returns PermissionCheckResult
 */
export function checkRolePermission(
  institution: InstitutionModel,
  agentRef: string,
  actionKind: string
): PermissionCheckResult {
  // 找出该 Agent 的所有角色
  const agentRoles = institution.roleAssignments
    .filter(ra => ra.agentRef === agentRef)
    .map(ra => ra.role);

  // 找到匹配 actionKind 的规则，priority 降序
  const matchingRules = institution.rules
    .filter(r => r.constrainedActionKind === actionKind)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of matchingRules) {
    // 检查禁止列表（优先于允许列表）
    const isForbidden = rule.forbiddenRoles.some(fr => agentRoles.includes(fr));
    if (isForbidden) {
      return {
        allowed: false,
        matchedRule: rule,
        reason: `Agent "${agentRef}" 的角色被规则 "${rule.id}" 禁止执行 "${actionKind}"`,
      };
    }

    // 检查允许列表
    if (rule.allowedRoles.length === 0) {
      // 所有角色均可
      return {
        allowed: true,
        matchedRule: rule,
        reason: `规则 "${rule.id}" 允许所有角色执行 "${actionKind}"`,
      };
    }
    const isAllowed = rule.allowedRoles.some(ar => agentRoles.includes(ar));
    if (isAllowed) {
      return {
        allowed: true,
        matchedRule: rule,
        reason: `Agent "${agentRef}" 的角色满足规则 "${rule.id}" 的允许条件`,
      };
    }
    // allowedRoles 非空但 agent 角色不在其中 → 此规则明确拒绝
    return {
      allowed: false,
      matchedRule: rule,
      reason: `Agent "${agentRef}" 的角色不在规则 "${rule.id}" 的允许角色列表中`,
    };
  }

  // 无匹配规则 → 默认允许
  return {
    allowed: true,
    matchedRule: null,
    reason: `无约束规则匹配 "${actionKind}"，默认允许`,
  };
}
