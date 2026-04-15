// ---
// kind: code
// implements: docs/current/reconstruction-contract.md
// ---
import crypto from 'crypto';

/** 重建步骤类型 */
export type ReconstructedStepKind =
  | 'initial_condition'
  | 'latent_phase'
  | 'observable'
  | 'intervention'
  | 'outcome';

/** 由 Ontology 回放生成的单步重建项 */
export interface ReconstructedStep {
  /** 步骤序号（严格递增） */
  step: number;
  /** 步骤类型 */
  kind: ReconstructedStepKind;
  /** 回放节点标识 */
  node_ref: string;
  /** 人类可读描述 */
  content: string;
  /** 来源来源：来自 Ontology 推断或 Episode 锚点 */
  source: 'ontology_derived' | 'episode_anchored';
}

/** Fidelity 评分 */
export interface FidelityScore {
  /** 0..1 */
  score: number;
  /** 评分方法标识 */
  method: string;
  matched_nodes: string[];
  missed_nodes: string[];
  extra_nodes: string[];
}

/**
 * v13 Minimal Sufficient Provenance — 追溯段节点
 * reconstruction-contract.md §2.3 ProvenanceSegment
 */
export interface ProvenanceSegment {
  /** 引用一个 reconstructed_timeline.step.node_ref 或外部 Claim ID */
  node_ref: string;
  /** 角色：前提 / 机制 / 约束 / 干预 */
  role: 'premise' | 'mechanism' | 'constraint' | 'intervention';
  /** 解释权重 [0.0, 1.0] */
  weight: number;
  /** 支撑该节点的证据（ObservationRecord / Claim / SupportLink ID） */
  evidenceRefs: string[];
}

/**
 * v13 Minimal Sufficient Provenance — 最小充分性说明
 * reconstruction-contract.md §2.3 MinimalityJustification
 */
export interface MinimalityJustification {
  /** 为何停止追溯 */
  kind: 'coverage_saturated' | 'budget_capped' | 'heuristic_cutoff';
  /** 人类可读解释 */
  rationale: string;
}

/**
 * v13 Minimal Sufficient Provenance — 追溯链中未闭合的证据空洞
 * reconstruction-contract.md §2.3 UnresolvedGap
 */
export interface UnresolvedGap {
  kind: 'missing_observation' | 'hypothesis_untested' | 'mechanism_proxy' | 'unknown';
  description: string;
  severity: 'low' | 'mid' | 'high';
}

/**
 * AcceptedReconstruction（v7 / reconstruction contract 最低层）
 *
 * 对齐 reconstruction-contract.md schema_version 3（2026-04-15 引入 v13 MSP 雏形）。
 * nearCauseSegment / midCauseSegment / deepCauseSegment / minimalityJustification /
 * unresolvedGaps 五字段为 v13 Minimal Sufficient Provenance 的 schema 侧雏形，
 * 第一轮以过渡态（空数组 / null）落地，不破坏既有调用。
 */
export interface AcceptedReconstruction {
  id: string;
  version: number;
  episode_id: string;
  selectedMechanismIds: string[];
  /** 本次重建使用的 MechanismInstance ID 列表（第一轮允许为空数组，待 pipeline 填充） */
  mechanism_instance_ids: string[];
  ontology_snapshot_ref: string;
  derivation_chain_id: string;
  traceId: string;
  majorChain: string[];
  reconstructed_timeline: ReconstructedStep[];
  fidelity: FidelityScore;
  created_at: string;
  created_by: string;
  supersedes: string | null;
  /** v13 MSP 近因段（当下切片上最直接的触发条件），第一轮允许为空数组 */
  nearCauseSegment: ProvenanceSegment[];
  /** v13 MSP 中因段（跨 Episode 的结构性成因），第一轮允许为空数组 */
  midCauseSegment: ProvenanceSegment[];
  /** v13 MSP 远因段（历史压缩态中的约束/律法层），第一轮允许为空数组 */
  deepCauseSegment: ProvenanceSegment[];
  /** v13 MSP 最小充分性说明；第一轮允许为 null（过渡态） */
  minimalityJustification: MinimalityJustification | null;
  /** v13 MSP 未闭合证据空洞列表 */
  unresolvedGaps: UnresolvedGap[];
}

interface ReconstructionInput {
  episodeId: string;
  chosenPathAtomIds: string[];
  observationAtomIds: string[];
  version?: number;
  derivationChainId?: string;
  traceId?: string;
  createdBy?: string;
  selectedMechanismIds?: string[];
  mechanismInstanceIds?: string[];
  ontologySnapshotRef?: string;
  createdAt?: string;
  // v13 MSP 雏形字段（均可选，未传则由 createAcceptedReconstruction 默认填空/null）
  nearCauseSegment?: ProvenanceSegment[];
  midCauseSegment?: ProvenanceSegment[];
  deepCauseSegment?: ProvenanceSegment[];
  minimalityJustification?: MinimalityJustification | null;
  unresolvedGaps?: UnresolvedGap[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function inferStepKind(index: number, totalSteps: number, nodeId: string): ReconstructedStepKind {
  if (index === 0) return 'initial_condition';
  if (index === totalSteps - 1) return 'outcome';
  if (nodeId.includes('action_') || nodeId.includes('fix_')) return 'intervention';
  return totalSteps > 3 ? 'latent_phase' : 'observable';
}

function deriveTimeline(
  chosenPathAtomIds: string[],
  observationAtomIds: string[]
): ReconstructedStep[] {
  const nodes = chosenPathAtomIds.length > 0
    ? chosenPathAtomIds
    : (observationAtomIds.length > 0
      ? observationAtomIds
      : ['episode_initial']);
  const totalSteps = Math.max(1, nodes.length);

  return nodes.map((node_ref, index) => ({
    step: index,
    kind: inferStepKind(index, totalSteps, node_ref),
    node_ref,
    content: index === 0
      ? `初始锚点: ${node_ref}`
      : index === nodes.length - 1
        ? `结果收敛: ${node_ref}`
        : `重建过程节点: ${node_ref}`,
    source: index === 0 ? 'episode_anchored' : 'ontology_derived',
  }));
}

function scoreFidelity(expected: string[], actual: string[]): FidelityScore {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const matched = unique([...expectedSet].filter((node) => actualSet.has(node)));
  const missed = unique([...expectedSet].filter((node) => !actualSet.has(node)));
  const extra = unique([...actualSet].filter((node) => !expectedSet.has(node)));
  const score = clamp01(
    matched.length / Math.max(1, matched.length + missed.length)
  );

  return {
    score,
    method: 'key_node_coverage',
    matched_nodes: matched,
    missed_nodes: missed,
    extra_nodes: extra,
  };
}

function deriveReconstructionId(episodeId: string, version: number): string {
  return `RC_${episodeId}_${version}`;
}

function deriveDerivationChainId(episodeId: string): string {
  return `DC_${episodeId}_${crypto.randomBytes(4).toString('hex')}`;
}

export function createAcceptedReconstruction(input: ReconstructionInput): AcceptedReconstruction {
  const version = input.version ?? 1;
  const created_at = input.createdAt ?? nowIso();
  const created_by = input.createdBy ?? 'pipeline_recordfix_shell';
  const derivation_chain_id = input.derivationChainId ?? deriveDerivationChainId(input.episodeId);
  // selectedMechanismIds 必须由调用方显式传入（mechanism_class_ref），不得回退到 path/atom/episodeId
  const selectedMechanismIds = input.selectedMechanismIds && input.selectedMechanismIds.length > 0
    ? unique(input.selectedMechanismIds)
    : [];

  const reconstructed_timeline = deriveTimeline(input.chosenPathAtomIds, input.observationAtomIds);
  const majorChain = unique(reconstructed_timeline.map((step) => step.node_ref));
  const fidelity = scoreFidelity(
    input.chosenPathAtomIds.length > 0 ? input.chosenPathAtomIds : input.observationAtomIds,
    majorChain
  );

  return {
    id: deriveReconstructionId(input.episodeId, version),
    version,
    episode_id: input.episodeId,
    selectedMechanismIds,
    mechanism_instance_ids: input.mechanismInstanceIds ?? [],
    ontology_snapshot_ref: input.ontologySnapshotRef ?? 'ontology_current',
    derivation_chain_id,
    traceId: input.traceId ?? derivation_chain_id,
    majorChain,
    reconstructed_timeline,
    fidelity,
    created_at,
    created_by,
    supersedes: null,
    // v13 MSP 雏形字段：第一轮以过渡态（空数组 / null）落地
    // 未来由 pipeline.recordFix 从 SupportLink + MechanismInstance + MechanismClass 链路填充
    nearCauseSegment: input.nearCauseSegment ?? [],
    midCauseSegment: input.midCauseSegment ?? [],
    deepCauseSegment: input.deepCauseSegment ?? [],
    minimalityJustification: input.minimalityJustification ?? null,
    unresolvedGaps: input.unresolvedGaps ?? [],
  };
}
