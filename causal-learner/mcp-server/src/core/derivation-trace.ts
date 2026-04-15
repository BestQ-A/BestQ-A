import crypto from 'crypto';

import type {
  DerivationTrace,
  DerivationStep,
  SupportLink,
} from './types.js';

// =============================================================================
// DerivationTrace 工厂
// implements: docs/current/derivation-chain-contract.md
// v7 §3.3 — 推导链对象（v6 名称: DerivationChain）
// =============================================================================

interface DerivationTraceInput {
  /** 可选显式 ID，供 pipeline 预生成后跨对象互链（默认自动生成） */
  id?: string;
  episodeId?: string;
  reconstructionId?: string;
  contextKind?: 'reconstruction' | 'inference';
  premiseClaimIds?: string[];
  conclusionClaimId?: string;
  proof?: DerivationStep[];
  supportLinks?: SupportLink[];
  rejectedClaimIds?: string[];
  createdBy?: string;
  createdAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newTraceId(episodeId?: string): string {
  const prefix = episodeId ? `DT_${episodeId}` : 'DT';
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * 验证推导链连续性：proof[i].to.id 必须等于 proof[i+1].from.id
 * 返回第一个断裂位置（-1 表示链完整）
 */
export function findChainBreak(proof: DerivationStep[]): number {
  for (let i = 0; i < proof.length - 1; i++) {
    if (proof[i].to.id !== proof[i + 1].from.id) {
      return i;
    }
  }
  return -1;
}

/**
 * 推导链完整性判断：
 * - 所有步骤均可重放（auditReplayable=true）
 * - 步骤间节点连续（proof[i].to == proof[i+1].from）
 */
export function computeChainIntegrity(proof: DerivationStep[]): 'complete' | 'broken' {
  if (proof.length === 0) return 'complete';
  const allReplayable = proof.every((s) => s.auditReplayable);
  const continuous = findChainBreak(proof) === -1;
  return allReplayable && continuous ? 'complete' : 'broken';
}

/**
 * 创建 DerivationTrace 对象。
 *
 * 自动计算：totalSteps, replayableSteps, chainIntegrity。
 * 调用方负责提供 proof 步骤和 supportLinks。
 */
export function createDerivationTrace(input: DerivationTraceInput): DerivationTrace {
  const proof = input.proof ?? [];
  const supportLinks = input.supportLinks ?? [];
  const rejectedClaimIds = unique(input.rejectedClaimIds ?? []);
  const premiseClaimIds = unique(input.premiseClaimIds ?? []);

  const totalSteps = proof.length;
  const replayableSteps = proof.filter((s) => s.auditReplayable).length;
  const chainIntegrity = computeChainIntegrity(proof);

  return {
    id: input.id ?? newTraceId(input.episodeId),
    contextKind: input.contextKind ?? 'reconstruction',
    episodeId: input.episodeId,
    reconstructionId: input.reconstructionId,
    premiseClaimIds,
    conclusionClaimId: input.conclusionClaimId,
    proof,
    supportLinks,
    rejectedClaimIds,
    totalSteps,
    replayableSteps,
    chainIntegrity,
    createdAt: input.createdAt ?? nowIso(),
    createdBy: input.createdBy ?? 'pipeline_s5',
  };
}
