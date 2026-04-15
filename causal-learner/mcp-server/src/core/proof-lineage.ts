/**
 * ProofLineage — v11 证明谱系
 * implements: docs/current/v11-world-model-contract.md
 *
 * ProofLineage 从一条或多条 DerivationTrace 链路出发，
 * 生成完整的从前提到结论的可追溯证明谱系。
 *
 * 与 DerivationTrace 的区别：
 * - DerivationTrace：单次推导过程的记录（步骤 + 支撑链接）
 * - ProofLineage：多条 DerivationTrace 组合而成的"证明血统"
 *   — 关注前提→结论的谱系可追溯性，而非单次推导的逐步记录
 */

import crypto from 'crypto';
import type { DerivationTrace } from './types.js';

// =============================================================================
// 类型定义
// =============================================================================

/** 谱系节点（对应一条 DerivationTrace 的摘要） */
export interface LineageNode {
  /** DerivationTrace ID */
  traceId: string;
  /** 该 trace 的前提 claim IDs */
  premiseClaimIds: string[];
  /** 该 trace 的结论 claim ID */
  conclusionClaimId: string | undefined;
  /** 该 trace 的链路完整性 */
  chainIntegrity: 'complete' | 'broken';
  /** 该 trace 的可重放率 [0,1] */
  replayabilityRatio: number;
  /** 该 trace 中被拒绝的替代假设 */
  rejectedAlternatives: string[];
}

/** 证明谱系完整性状态 */
export type LineageCompleteness = 'complete' | 'partial' | 'broken';

/** 证明谱系 */
export interface ProofLineage {
  id: string;
  name: string;
  /** 最终结论 claim ID（不变量 PL-I1：非空） */
  conclusionClaimId: string;
  /** 所有根前提 claim IDs（从所有 trace 中汇总） */
  rootPremiseClaimIds: string[];
  /** 组成谱系的节点列表（按推导顺序，不变量 PL-I2：非空） */
  nodes: LineageNode[];
  /** 引用的 DerivationTrace IDs */
  traceIds: string[];
  /** 谱系完整性（综合所有节点） */
  completeness: LineageCompleteness;
  /** 平均可重放率 */
  avgReplayabilityRatio: number;
  /** 被排除的替代假设（所有节点的并集） */
  allRejectedAlternatives: string[];
  createdAt: string;
  createdBy: string;
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateProofLineageInput {
  id?: string;
  name: string;
  conclusionClaimId: string;
  nodes: LineageNode[];
  createdBy?: string;
}

export function createProofLineage(input: CreateProofLineageInput): ProofLineage {
  // 不变量 PL-I1：conclusionClaimId 非空
  if (!input.conclusionClaimId || input.conclusionClaimId.trim() === '') {
    throw new Error('ProofLineage 不变量 PL-I1：conclusionClaimId 不可为空');
  }
  // 不变量 PL-I2：nodes 非空
  if (!input.nodes || input.nodes.length === 0) {
    throw new Error('ProofLineage 不变量 PL-I2：nodes 不可为空');
  }

  // 汇总根前提（所有 node 的 premiseClaimIds 并集，去掉已被某节点作为结论的 ID）
  const allConclusions = new Set(
    input.nodes
      .map(n => n.conclusionClaimId)
      .filter((id): id is string => id !== undefined)
  );
  const rootPremises = Array.from(
    new Set(
      input.nodes
        .flatMap(n => n.premiseClaimIds)
        .filter(id => !allConclusions.has(id))
    )
  );

  // 计算完整性
  const brokenCount = input.nodes.filter(n => n.chainIntegrity === 'broken').length;
  let completeness: LineageCompleteness;
  if (brokenCount === 0) completeness = 'complete';
  else if (brokenCount === input.nodes.length) completeness = 'broken';
  else completeness = 'partial';

  // 计算平均可重放率
  const avgReplayabilityRatio =
    input.nodes.reduce((sum, n) => sum + n.replayabilityRatio, 0) / input.nodes.length;

  // 汇总所有被拒绝的替代假设
  const allRejectedAlternatives = Array.from(
    new Set(input.nodes.flatMap(n => n.rejectedAlternatives))
  );

  return {
    id:                       input.id ?? `PL_${crypto.randomBytes(6).toString('hex')}`,
    name:                     input.name,
    conclusionClaimId:        input.conclusionClaimId,
    rootPremiseClaimIds:      rootPremises,
    nodes:                    input.nodes,
    traceIds:                 input.nodes.map(n => n.traceId),
    completeness,
    avgReplayabilityRatio,
    allRejectedAlternatives,
    createdAt:                new Date().toISOString(),
    createdBy:                input.createdBy ?? 'system',
  };
}

// =============================================================================
// 从 DerivationTrace 反向重建 ProofLineage
// =============================================================================

/**
 * 将单条 DerivationTrace 转换为 LineageNode。
 */
export function traceToLineageNode(trace: DerivationTrace): LineageNode {
  const replayabilityRatio =
    trace.totalSteps > 0
      ? trace.replayableSteps / trace.totalSteps
      : 1.0; // 无步骤 = 完全可重放

  return {
    traceId:              trace.id,
    premiseClaimIds:      [...trace.premiseClaimIds],
    conclusionClaimId:    trace.conclusionClaimId,
    chainIntegrity:       trace.chainIntegrity,
    replayabilityRatio,
    rejectedAlternatives: [...trace.rejectedClaimIds],
  };
}

/**
 * 从一条或多条 DerivationTrace 反向重建 ProofLineage。
 *
 * @param traces  按推导顺序排列的 DerivationTrace 列表（不变量：非空）
 * @param name    谱系名称
 * @param options 附加选项
 */
export function buildProofLineage(
  traces: DerivationTrace[],
  name: string,
  options?: { id?: string; createdBy?: string }
): ProofLineage {
  if (!traces || traces.length === 0) {
    throw new Error('buildProofLineage：traces 不可为空');
  }

  const nodes = traces.map(traceToLineageNode);

  // 最终结论取最后一条 trace 的 conclusionClaimId
  const lastTrace = traces[traces.length - 1];
  const conclusionClaimId = lastTrace.conclusionClaimId ?? `UNKNOWN_${lastTrace.id}`;

  return createProofLineage({
    id:               options?.id,
    name,
    conclusionClaimId,
    nodes,
    createdBy:        options?.createdBy,
  });
}
