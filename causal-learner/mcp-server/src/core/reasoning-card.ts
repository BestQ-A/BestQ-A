/**
 * MVP 推理链卡片 (ReasoningCard)
 *
 * 对应 docs/mvp-llm-reasoning-guard-plan.md §4 核心对象。
 *
 * 设计原则：**不造新对象**，仅包装 v7 backbone 既有合约：
 *   - DerivationTrace (derivation-chain-contract.md)
 *   - SupportLink (support-link-contract.md)
 *   - Hypothesis (hypothesis-contract.md)
 *   - ObservationRecord (observation-model-contract.md)
 *
 * ReasoningCard = 一次 LLM patch 审查的**最小充分追溯**（v13 G3）记录。
 * 由 MiniMax coding-plan model 逆向推理生成，不由 Claude 自填。
 */

import type { DerivationTrace, SupportLink, ObservationRecord } from './types.js';
import type { Hypothesis } from './hypothesis.js';

/**
 * 分级判定结果（Q3-c 分级拦截）
 */
export type GradingVerdict =
  | 'pass' // 推理链完整、证据充分
  | 'warn' // 非致命问题：假设未标置信度、推理链略粗
  | 'block'; // 致命问题：引用不存在的 API / 推理链断裂 / 完全空卡片

export interface GradingIssue {
  severity: 'fatal' | 'warn';
  code: string; // 例如 'MISSING_EVIDENCE', 'BROKEN_CHAIN', 'PHANTOM_API'
  message: string;
  stepNumber?: number; // 如指向 DerivationTrace.proof 的某一步
  nodeRef?: string; // 如指向具体 NodeRef.id
}

/**
 * ReasoningCard：MVP 的核心产出。
 *
 * 每次 `bestqa check <patch>` 调用产生一张卡片，无论 pass/warn/block。
 * pass/warn 的卡片入 causal-learner，成为耐久资产（v12）。
 * block 的卡片也落盘（审计用），但不入图谱。
 */
export interface ReasoningCard {
  // ===== 身份 =====
  id: string; // 格式 "RC_<patch_hash>_<seq>"
  createdAt: string; // ISO8601
  createdBy: 'minimax-coding-plan' | 'human' | 'cli-smoke'; // 生成者
  schemaVersion: 1;

  // ===== 输入快照 =====
  input: {
    patchDigest: string; // patch 内容 hash，用于去重
    problemStatement?: string; // 可选，来自 SWE-bench 等
    contextFiles?: string[]; // 审查时提供的上下文文件路径
    predictedPatch: string; // 被审查的 patch 原文
  };

  // ===== 审查产出（v13 G3 最小充分追溯） =====
  goal: string; // "用户想要什么" — 一句话陈述
  derivationTrace: DerivationTrace; // 推理链：近因 → 中因 → 远因 → 修改点
  supportLinks: SupportLink[]; // 证据链：每步绑定 ObservationRecord
  hypotheses: Hypothesis[]; // 假设集合（含置信度）
  risks: string[]; // 风险：假设错了会影响什么

  // ===== 分级判定（Q3-c） =====
  verdict: GradingVerdict;
  issues: GradingIssue[];
  forceOverridden: boolean; // 是否通过 --force 逃生阀放行

  // ===== 耐久资产追踪（v12） =====
  persistence: {
    supportLinksAdded: number; // 入库新增 SupportLink 数
    derivationTraceStored: boolean; // DerivationTrace 是否落 causal-learner
    causalLearnerNodesAdded: number; // 净增节点数
  };

  // ===== 反向元评价（W3 新增，W1 占位） =====
  metaFeedback?: MetaFeedback[];
}

/**
 * 反向元评价反馈。
 *
 * 由 Claude 或人工在使用后提交，指出 MiniMax 这次审查的漏报/误报。
 * 走 pending → 甲方 weekly review → approved → 入 causal-learner 三阶段。
 */
export interface MetaFeedback {
  id: string;
  feedbackType: 'false_negative' | 'false_positive' | 'overreach' | 'insight';
  submittedBy: 'claude' | 'human';
  submittedAt: string;
  targetIssueCode?: string; // 指向 ReasoningCard.issues[].code
  argument: string; // 反馈论证
  evidence: string[]; // 支撑反馈的证据（如实际修复 commit、F2P 测试结果）
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
}

/**
 * 分级判定硬性规则（Q3-c）
 *
 * fatal：块提交，除非 --force
 * warn：标红但放行
 * pass：通过
 *
 * 具体规则清单对应 W2 T2.1 将落地的 reasoning-card-grading-contract.md
 */
export const FATAL_CODES = [
  'BROKEN_CHAIN', // DerivationTrace.chainIntegrity === 'broken'
  'PHANTOM_API', // SupportLink 指向不存在的 symbol
  'EMPTY_GOAL', // goal 为空或 < 10 字符
  'NO_SUPPORT', // supportLinks.length === 0 且 proof.length > 0
  'LLM_SELF_AUDIT', // 违反 derivation-chain I4：LLM 不自审
] as const;

export const WARN_CODES = [
  'LOW_CONFIDENCE_HYPOTHESIS', // hypothesis.confidence < 0.5 且未标记 assumption
  'COARSE_CHAIN', // proof.length < 2（跳步嫌疑）
  'UNDECLARED_RISK', // risks.length === 0
] as const;

export type FatalCode = (typeof FATAL_CODES)[number];
export type WarnCode = (typeof WARN_CODES)[number];

/**
 * 计算最终 verdict。
 * force=true 时把 fatal 降级为 warn（逃生阀）。
 */
export function computeVerdict(issues: GradingIssue[], force: boolean): GradingVerdict {
  if (issues.length === 0) return 'pass';
  const hasFatal = issues.some((i) => i.severity === 'fatal');
  if (hasFatal) return force ? 'warn' : 'block';
  return 'warn';
}
