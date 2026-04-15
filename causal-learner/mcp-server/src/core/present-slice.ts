/**
 * PresentSlice — v13 当前观测面的显式对象化
 * implements: docs/design_history/v13_historical_generative_ontology.md §7.1
 *
 * PresentSlice 不是整个 Episode，而是：
 * - 在当前时刻真正需要解释的状态压缩面
 * - 之后一切 provenance tracing 的起点
 * - 压缩了历史 Episode 的 lineage，声明"这个当下是什么"
 *
 * 语义中心：从"五模块并列"走向"lineage-centered"的桥接对象。
 * 本文件只建对象和工厂函数，不接入 pipeline.ts。
 */

import crypto from 'crypto';

// =============================================================================
// PresentSlice 接口
// =============================================================================

/** 当前观测面 — v13 核心桥接对象 */
export interface PresentSlice {
  /** 唯一标识 */
  id: string;
  /** 人类可读名称（描述这个当下切片的含义） */
  name: string;
  /** 构成此 slice 的 Episode ID 列表（历史来源） */
  episodeIds: string[];
  /** 来源重建 ID 列表（provenance 指向 AcceptedReconstruction） */
  reconstructionIds: string[];
  /** 当前活跃的因果规律 ID 列表（从 Regulation/MechanismClass 提取） */
  activeRegulationIds: string[];
  /** 当前活跃的分叉点 ID 列表（从 BranchPoint 提取） */
  activeBranchPointIds: string[];
  /** 压缩说明 — 人类可读，描述从 Episode lineage 压缩到当前态的过程 */
  compressionSummary: string;
  /** 综合保真度 [0.0, 1.0] — 聚合各 Reconstruction 的 fidelity */
  fidelityScore: number;
  /** 状态快照 ID 列表（v13 §7.1 stateSnapshotIds） */
  stateSnapshotIds: string[];
  /** 当前活跃约束（v13 §7.1 activeConstraints） */
  activeConstraints: string[];
  /** 可见结果（v13 §7.1 visibleOutcomes） */
  visibleOutcomes: string[];
  /** 推断的潜在状态（v13 §7.1 inferredLatentStates） */
  inferredLatentStates: string[];
  /** 未解决的未知项（v13 §7.1 unresolvedUnknowns） */
  unresolvedUnknowns: string[];
  /** 创建时间 */
  createdAt: string;
  /** 创建者标识 */
  createdBy: string;
}

// =============================================================================
// 创建输入
// =============================================================================

export interface CreatePresentSliceInput {
  name: string;
  episodeIds: string[];
  reconstructionIds?: string[];
  activeRegulationIds?: string[];
  activeBranchPointIds?: string[];
  compressionSummary?: string;
  fidelityScore?: number;
  stateSnapshotIds?: string[];
  activeConstraints?: string[];
  visibleOutcomes?: string[];
  inferredLatentStates?: string[];
  unresolvedUnknowns?: string[];
  createdBy?: string;
  createdAt?: string;
}

// =============================================================================
// 工厂函数
// =============================================================================

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** 创建 PresentSlice 实例 */
export function createPresentSlice(input: CreatePresentSliceInput): PresentSlice {
  return {
    id: `PS_${crypto.randomBytes(6).toString('hex')}`,
    name: input.name,
    episodeIds: input.episodeIds,
    reconstructionIds: input.reconstructionIds ?? [],
    activeRegulationIds: input.activeRegulationIds ?? [],
    activeBranchPointIds: input.activeBranchPointIds ?? [],
    compressionSummary: input.compressionSummary ?? '',
    fidelityScore: clamp01(input.fidelityScore ?? 0),
    stateSnapshotIds: input.stateSnapshotIds ?? [],
    activeConstraints: input.activeConstraints ?? [],
    visibleOutcomes: input.visibleOutcomes ?? [],
    inferredLatentStates: input.inferredLatentStates ?? [],
    unresolvedUnknowns: input.unresolvedUnknowns ?? [],
    createdAt: input.createdAt ?? new Date().toISOString(),
    createdBy: input.createdBy ?? 'system',
  };
}

// =============================================================================
// Pipeline 构建器（从 CausalPipeline 实例提取当前态）
// =============================================================================

/**
 * buildPresentSliceFromPipeline 的输入 — 从 pipeline 各 store 中提取的快照数据。
 *
 * 设计选择：不直接依赖 CausalPipeline 类型（避免循环依赖），
 * 而是接受一个扁平的数据快照，由调用方从 pipeline 实例中提取。
 */
export interface PipelineSnapshot {
  /** slice 名称 */
  name: string;
  /** Episode ID 列表 */
  episodeIds: string[];
  /** AcceptedReconstruction ID 列表 */
  reconstructionIds: string[];
  /** 各 Reconstruction 的 fidelity score */
  reconstructionFidelities: number[];
  /** 当前活跃的 Regulation / MechanismClass ID 列表 */
  activeRegulationIds: string[];
  /** 当前活跃的 BranchPoint ID 列表 */
  activeBranchPointIds: string[];
  /** StateSnapshot ID 列表 */
  stateSnapshotIds?: string[];
  /** 活跃约束 */
  activeConstraints?: string[];
  /** 可见结果 */
  visibleOutcomes?: string[];
  /** 推断的潜在状态 */
  inferredLatentStates?: string[];
  /** 未解决的未知项 */
  unresolvedUnknowns?: string[];
  /** 创建者标识 */
  createdBy?: string;
}

/**
 * 从 pipeline 快照构建 PresentSlice。
 *
 * fidelityScore 取所有 Reconstruction fidelity 的加权平均（等权），
 * 若无 Reconstruction 则为 0。
 * compressionSummary 自动生成，描述压缩来源。
 */
export function buildPresentSliceFromPipeline(snapshot: PipelineSnapshot): PresentSlice {
  const fidelities = snapshot.reconstructionFidelities;
  const avgFidelity = fidelities.length > 0
    ? fidelities.reduce((sum, f) => sum + f, 0) / fidelities.length
    : 0;

  const compressionSummary = [
    `压缩自 ${snapshot.episodeIds.length} 个 Episode`,
    `${snapshot.reconstructionIds.length} 个 Reconstruction`,
    `${snapshot.activeRegulationIds.length} 条活跃规律`,
    `${snapshot.activeBranchPointIds.length} 个分叉点`,
  ].join('，');

  return createPresentSlice({
    name: snapshot.name,
    episodeIds: snapshot.episodeIds,
    reconstructionIds: snapshot.reconstructionIds,
    activeRegulationIds: snapshot.activeRegulationIds,
    activeBranchPointIds: snapshot.activeBranchPointIds,
    compressionSummary,
    fidelityScore: avgFidelity,
    stateSnapshotIds: snapshot.stateSnapshotIds,
    activeConstraints: snapshot.activeConstraints,
    visibleOutcomes: snapshot.visibleOutcomes,
    inferredLatentStates: snapshot.inferredLatentStates,
    unresolvedUnknowns: snapshot.unresolvedUnknowns,
    createdBy: snapshot.createdBy ?? 'pipeline',
  });
}
