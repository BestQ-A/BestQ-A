/**
 * ConstitutionalLayer — v11 宪法层（基本求真约束规则集）
 * implements: docs/current/v11-world-model-contract.md
 *
 * ConstitutionalLayer 定义最基本的认识论约束：
 * 任何声称为"知识"的对象都必须满足这些约束。
 * 类比法律中的宪法：优先级最高，不可豁免。
 */

import crypto from 'crypto';
import type { DerivationTrace } from './types.js';
import type { ProofLineage } from './proof-lineage.js';

// =============================================================================
// 类型定义
// =============================================================================

/** 约束类型 */
export type ConstraintKind = 'mandatory' | 'aspirational';

/** 约束检查结果 */
export interface ConstraintCheckResult {
  constraintId: string;
  constraintName: string;
  passed: boolean;
  kind: ConstraintKind;
  evidence: string;
}

/** 单条宪法约束 */
export interface ConstitutionalConstraint {
  id: string;
  name: string;
  description: string;
  kind: ConstraintKind;
  /** 检查函数：接受 DerivationTrace 或 ProofLineage，返回 {passed, evidence} */
  check: (subject: DerivationTrace | ProofLineage) => { passed: boolean; evidence: string };
}

/** 宪法层 */
export interface ConstitutionalLayer {
  id: string;
  name: string;
  description: string;
  /** 约束规则集（不变量 CL-I1：至少一条） */
  constraints: ConstitutionalConstraint[];
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

/** 完整审计报告 */
export interface ConstitutionalAudit {
  subjectId: string;
  subjectKind: 'DerivationTrace' | 'ProofLineage';
  results: ConstraintCheckResult[];
  /** 全部 mandatory 约束是否通过 */
  mandatoryPassed: boolean;
  /** 通过的约束数 */
  passedCount: number;
  /** 失败的约束数 */
  failedCount: number;
  auditedAt: string;
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateConstitutionalLayerInput {
  id?: string;
  name: string;
  description: string;
  constraints: ConstitutionalConstraint[];
  createdBy?: string;
  status?: ConstitutionalLayer['status'];
}

export function createConstitutionalLayer(
  input: CreateConstitutionalLayerInput
): ConstitutionalLayer {
  // 不变量 CL-I1：constraints 非空
  if (!input.constraints || input.constraints.length === 0) {
    throw new Error('ConstitutionalLayer 不变量 CL-I1：constraints 不可为空');
  }

  return {
    id:          input.id ?? `CL_${crypto.randomBytes(6).toString('hex')}`,
    name:        input.name,
    description: input.description,
    constraints: input.constraints,
    createdAt:   new Date().toISOString(),
    createdBy:   input.createdBy ?? 'system',
    status:      input.status ?? 'draft',
  };
}

// =============================================================================
// 标准宪法约束集
// =============================================================================

/**
 * 内置的基本求真约束规则。
 * 可直接用于构建 defaultConstitutionalLayer。
 */
export const STANDARD_CONSTRAINTS: ConstitutionalConstraint[] = [
  {
    id:          'CC_chain_integrity',
    name:        '推导链完整性',
    description: 'DerivationTrace 的 chainIntegrity 必须为 complete',
    kind:        'mandatory',
    check: (subject) => {
      if ('chainIntegrity' in subject) {
        const trace = subject as DerivationTrace;
        return {
          passed:   trace.chainIntegrity === 'complete',
          evidence: `chainIntegrity = "${trace.chainIntegrity}"`,
        };
      }
      // ProofLineage
      const lineage = subject as ProofLineage;
      return {
        passed:   lineage.completeness === 'complete',
        evidence: `ProofLineage.completeness = "${lineage.completeness}"`,
      };
    },
  },
  {
    id:          'CC_has_premises',
    name:        '前提非空',
    description: '推导链或证明谱系必须有至少一条前提',
    kind:        'mandatory',
    check: (subject) => {
      if ('premiseClaimIds' in subject && !('nodes' in subject)) {
        const trace = subject as DerivationTrace;
        return {
          passed:   trace.premiseClaimIds.length > 0,
          evidence: `premiseClaimIds.length = ${trace.premiseClaimIds.length}`,
        };
      }
      const lineage = subject as ProofLineage;
      return {
        passed:   lineage.rootPremiseClaimIds.length > 0,
        evidence: `rootPremiseClaimIds.length = ${lineage.rootPremiseClaimIds.length}`,
      };
    },
  },
  {
    id:          'CC_has_conclusion',
    name:        '结论非空',
    description: 'DerivationTrace 必须有明确结论 claim ID',
    kind:        'mandatory',
    check: (subject) => {
      if ('conclusionClaimId' in subject && !('nodes' in subject)) {
        const trace = subject as DerivationTrace;
        const hasConclusion = !!trace.conclusionClaimId;
        return {
          passed:   hasConclusion,
          evidence: `conclusionClaimId = ${trace.conclusionClaimId ?? 'undefined'}`,
        };
      }
      const lineage = subject as ProofLineage;
      return {
        passed:   !!lineage.conclusionClaimId,
        evidence: `conclusionClaimId = "${lineage.conclusionClaimId}"`,
      };
    },
  },
  {
    id:          'CC_replayability',
    name:        '可重放率 ≥ 50%',
    description: '推导链的可重放步骤应占总步骤至少 50%（aspirational）',
    kind:        'aspirational',
    check: (subject) => {
      if ('replayableSteps' in subject) {
        const trace = subject as DerivationTrace;
        const ratio = trace.totalSteps > 0
          ? trace.replayableSteps / trace.totalSteps
          : 1.0;
        return {
          passed:   ratio >= 0.5,
          evidence: `replayableSteps=${trace.replayableSteps} / totalSteps=${trace.totalSteps} = ${ratio.toFixed(2)}`,
        };
      }
      const lineage = subject as ProofLineage;
      return {
        passed:   lineage.avgReplayabilityRatio >= 0.5,
        evidence: `avgReplayabilityRatio = ${lineage.avgReplayabilityRatio.toFixed(2)}`,
      };
    },
  },
  {
    id:          'CC_explicit_rejections',
    name:        '替代假设须显式拒绝',
    description: '如有支撑链接（supportLinks），则 rejectedClaimIds 不应为空（aspirational）',
    kind:        'aspirational',
    check: (subject) => {
      if ('supportLinks' in subject) {
        const trace = subject as DerivationTrace;
        if (trace.supportLinks.length === 0) {
          // 无支撑链接则此约束不适用
          return { passed: true, evidence: '无 supportLinks，约束不适用' };
        }
        return {
          passed:   trace.rejectedClaimIds.length > 0,
          evidence: `supportLinks=${trace.supportLinks.length}, rejectedClaimIds=${trace.rejectedClaimIds.length}`,
        };
      }
      const lineage = subject as ProofLineage;
      return {
        passed:   lineage.allRejectedAlternatives.length > 0 || lineage.nodes.every(n => n.rejectedAlternatives.length === 0),
        evidence: `allRejectedAlternatives.length = ${lineage.allRejectedAlternatives.length}`,
      };
    },
  },
];

/** 默认宪法层（包含所有标准约束） */
export function createDefaultConstitutionalLayer(): ConstitutionalLayer {
  return createConstitutionalLayer({
    id:          'CL_default',
    name:        '默认求真宪法层',
    description: 'v11 基本认识论约束：链路完整性、前提非空、结论非空、可重放率、显式拒绝',
    constraints: STANDARD_CONSTRAINTS,
    createdBy:   'system',
    status:      'current',
  });
}

// =============================================================================
// 审计执行
// =============================================================================

/**
 * 对 DerivationTrace 或 ProofLineage 执行宪法审计。
 * 返回完整 ConstitutionalAudit 报告。
 */
export function auditSubject(
  layer: ConstitutionalLayer,
  subject: DerivationTrace | ProofLineage,
  subjectKind: 'DerivationTrace' | 'ProofLineage'
): ConstitutionalAudit {
  const results: ConstraintCheckResult[] = layer.constraints.map(constraint => {
    const { passed, evidence } = constraint.check(subject);
    return {
      constraintId:   constraint.id,
      constraintName: constraint.name,
      passed,
      kind:           constraint.kind,
      evidence,
    };
  });

  const mandatoryPassed = results
    .filter(r => r.kind === 'mandatory')
    .every(r => r.passed);

  return {
    subjectId:     subject.id,
    subjectKind,
    results,
    mandatoryPassed,
    passedCount:   results.filter(r => r.passed).length,
    failedCount:   results.filter(r => !r.passed).length,
    auditedAt:     new Date().toISOString(),
  };
}
