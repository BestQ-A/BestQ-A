/**
 * ReasoningCard → causal-learner 入库
 *
 * 对应 docs/mvp-llm-reasoning-guard-plan.md W2 T2.3。
 *
 * 把 MiniMax 审查产出映射为 v7 backbone 合约对象并持久化：
 *   - raw.chain[]   → DerivationStep[] (NodeRef.kind='claim', relation='causes')
 *   - raw.chain[].evidence → SupportLink（如果是 file:line 形式）
 *   - 整条 DerivationTrace 写入 DerivationTraceStore
 *
 * 这是 v12 "证据承载世界模型" 的增长点——每次 pass/warn 审查 → ≥1 SupportLink + ≥1 DerivationTrace。
 */

import Database from 'better-sqlite3';
import { DerivationTraceStore } from './derivation-trace-store.js';
import type { DerivationTrace, DerivationStep, SupportLink, NodeRef } from './types.js';
import type { MinimaxReviewRaw } from './minimax-reviewer.js';

export interface IngestInput {
  cardId: string;
  patchDigest: string;
  raw: MinimaxReviewRaw;
  storePath: string; // SQLite DB 路径
}

export interface IngestResult {
  derivationTraceId: string;
  supportLinksAdded: number;
  derivationTraceStored: boolean;
  causalLearnerNodesAdded: number; // steps + supportLinks
}

function mkNodeRef(cardId: string, step: number, label: string): NodeRef {
  return {
    kind: 'claim',
    id: `claim_${cardId}_${step}`,
    label: label.slice(0, 120),
  };
}

function evidenceToSupportLink(
  cardId: string,
  stepNo: number,
  evidence: string,
  claimId: string,
  createdAt: string,
): SupportLink {
  // 即使 evidence 是 assumption，也创建 SupportLink — 持有"这是一个假设"本身就是可追溯的事实
  // 权重区分：具体 file:line → 0.7；assumption/unknown → 0.3
  const ev = (evidence || '').trim();
  const isAssumption = !ev || /^(assumption|unknown)$/i.test(ev);
  const obsId = `OR_mvp_${cardId}_${stepNo}`;
  return {
    id: `SL_${cardId}_${stepNo}`,
    observationRecordId: obsId,
    claimId,
    polarity: 'supports',
    weight: isAssumption ? 0.3 : 0.7,
    sourceKind: 'llm_binder',
    sourceRef: isAssumption ? 'assumption' : ev.slice(0, 200),
    createdAt,
    createdBy: 'minimax-coding-plan',
  };
}

export function ingestReasoningCard(input: IngestInput): IngestResult {
  const { cardId, patchDigest, raw, storePath } = input;
  const now = new Date().toISOString();

  // 构造 proof 步骤：每个 chain step → 一个 DerivationStep(claim→claim, relation='causes')
  const proof: DerivationStep[] = [];
  const supportLinks: SupportLink[] = [];

  let prevNode: NodeRef = mkNodeRef(cardId, 0, raw.goal || 'goal');

  raw.chain.forEach((c, i) => {
    const stepNo = i + 1;
    const currentNode = mkNodeRef(cardId, stepNo, c.claim);
    const step: DerivationStep = {
      stepNumber: stepNo,
      from: prevNode,
      relation: 'causes',
      to: currentNode,
      auditReplayable: c.confidence >= 0.8,
      replayMethod: c.confidence >= 0.8 ? 'logical_entailment' : undefined,
      llmInvolved: true,
      llmRole: 'proposer',
    };
    proof.push(step);

    const sl = evidenceToSupportLink(cardId, stepNo, c.evidence ?? '', currentNode.id, now);
    supportLinks.push(sl);

    prevNode = currentNode;
  });

  const allReplayable = proof.every((s) => s.auditReplayable);
  const trace: DerivationTrace = {
    id: `DT_${cardId}`,
    contextKind: 'inference',
    premiseClaimIds: proof.length > 0 ? [proof[0].from.id] : [],
    conclusionClaimId: proof.length > 0 ? proof[proof.length - 1].to.id : undefined,
    proof,
    supportLinks,
    rejectedClaimIds: [],
    totalSteps: proof.length,
    replayableSteps: proof.filter((s) => s.auditReplayable).length,
    chainIntegrity: allReplayable && proof.length > 0 ? 'complete' : 'broken',
    createdAt: now,
    createdBy: `mvp-reasoning-card:${patchDigest}`,
  };

  const store = new DerivationTraceStore(storePath);
  try {
    store.save(trace);
  } finally {
    // 显式关闭 — 否则 Node 退出时 UV async handle 触发 assertion（Windows exit code 3221226505）
    store.close();
  }

  return {
    derivationTraceId: trace.id,
    supportLinksAdded: supportLinks.length,
    derivationTraceStored: true,
    causalLearnerNodesAdded: proof.length + supportLinks.length,
  };
}

export interface IngestStats {
  totalTraces: number;
  totalSupportLinks: number;
  totalNodes: number;
}

export function readIngestStats(storePath: string): IngestStats {
  const db = new Database(storePath, { readonly: true });
  try {
    const total = (
      db.prepare('SELECT COUNT(*) as count FROM derivation_traces').get() as { count: number }
    ).count;
    const rows = db.prepare('SELECT data FROM derivation_traces').all() as Array<{ data: string }>;
    let slCount = 0;
    let stepCount = 0;
    for (const r of rows) {
      try {
        const t = JSON.parse(r.data) as DerivationTrace;
        slCount += t.supportLinks?.length ?? 0;
        stepCount += t.proof?.length ?? 0;
      } catch {
        /* skip malformed */
      }
    }
    return {
      totalTraces: total,
      totalSupportLinks: slCount,
      totalNodes: stepCount + slCount,
    };
  } finally {
    db.close();
  }
}
