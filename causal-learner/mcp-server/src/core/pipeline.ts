/**
 * CausalPipeline — BestQ-A 编排管道
 *
 * 将各独立模块连成一条完整的闭环管道：
 * classify → contextualize → constrain → explore → execute → compile
 *
 * - submit_observation: 摄入事实 → 分类 → 创建 Story → 探索 → 模板匹配
 * - record_fix: 解决 Story → compile 路径 → 记录证据 → 更新 RegulationView
 */

import { AtomGraph, AtomKind } from './atom-graph.js';
import type { Atom, ExploreResult, CompileResult, PathResult } from './atom-graph.js';
import { StoryStorage } from './story.js';
import type { Story, StoryPath, ContextScope } from './story.js';
import { EvidenceStore, recordSupport } from './evidence.js';
import { ProblemClassRegistry } from './problem-class.js';
import type { ClassifyResult } from './problem-class.js';
import { RegulationViewBuilder } from './regulation-view.js';
import type { RegulationView } from './regulation-view.js';
import { PatternEngine } from './pattern-template.js';
// getRefAlgebra 由 explore 内部使用，此处不直接调用但保留 import 以供将来扩展
import { getRefAlgebra } from './ref-algebra.js';
import { HypothesisStore } from './hypothesis.js';
import type { InterventionOutcome } from './hypothesis.js';
import { toEpisode, type Episode } from './story.js';
import type { AcceptedReconstruction } from './reconstruction.js';
import type { Conclusion, SupportLink, ObservationRecord } from './types.js';
import {
  createAcceptedReconstruction,
} from './reconstruction.js';
import type { MechanismInstance } from './mechanism-instance.js';
import {
  createMechanismInstance,
  acceptInstance,
  rejectInstance,
} from './mechanism-instance.js';
import type { OntologyDelta } from './ontology-delta.js';
import {
  buildRelationChange,
  createOntologyDelta,
  createOntologyDeltaNone,
} from './ontology-delta.js';
import { MechanismInstanceStore } from './mechanism-instance-store.js';
import type { MechanismInstanceStoreStats } from './mechanism-instance-store.js';
import { DerivationTraceStore } from './derivation-trace-store.js';
import type { DerivationTraceStoreStats } from './derivation-trace-store.js';
import { createDerivationTrace } from './derivation-trace.js';
import { EpisodeEventStore, createEpisodeEvent } from './episode-event-store.js';
import type { EpisodeEventStoreStats, EpisodeEventKind } from './episode-event-store.js';
import { SupportLinkStore } from './support-link-store.js';
import type { SupportLinkStoreStats } from './support-link-store.js';
import { ObservationRecordStore } from './observation-record-store.js';
import type { ObservationRecordStoreStats } from './observation-record-store.js';
import { ObservationModelStore } from './observation-model-store.js';
import type { ObservationModelStoreStats } from './observation-model-store.js';
import {
  createDefaultObservationModel,
  DEFAULT_OBSERVATION_MODEL_ID,
} from './observation-model.js';
import { MechanismProgramStore } from './mechanism-program-store.js';
import type { MechanismProgramStoreStats } from './mechanism-program-store.js';
import {
  createDefaultMechanismProgram,
  DEFAULT_MECHANISM_PROGRAM_ID,
} from './mechanism-program.js';
import { CounterfactualScenarioStore } from './counterfactual-scenario-store.js';
import type { CounterfactualScenarioStoreStats } from './counterfactual-scenario-store.js';
import { ExperimentDesignStore } from './experiment-design-store.js';
import type { ExperimentDesignStoreStats } from './experiment-design-store.js';
import type { ExperimentDesign } from './experiment-design.js';
import { ActionExecutionStore } from './action-execution-store.js';
import type { ActionExecutionStoreStats } from './action-execution-store.js';
import type { ActionExecution } from './types.js';
import { createActionExecutionFromExperimentDesign } from './action-execution.js';
import { OutcomeRecordStore } from './outcome-record-store.js';
import type { OutcomeRecordStoreStats } from './outcome-record-store.js';
import type { OutcomeRecord } from './types.js';
import { createOutcomeRecord } from './outcome-record.js';
import { PredictionErrorStore } from './prediction-error-store.js';
import type { PredictionErrorStoreStats } from './prediction-error-store.js';
import type { PredictionError } from './types.js';
import { createPredictionError } from './prediction-error.js';
import { StateSnapshotStore } from './state-snapshot-store.js';
import type { StateSnapshotStoreStats } from './state-snapshot-store.js';
import type { StateSnapshot } from './types.js';
import { createStateSnapshot } from './state-snapshot.js';
import { TransitionStore } from './transition-store.js';
import type { TransitionStoreStats } from './transition-store.js';
import type { Transition } from './types.js';
import { createTransition } from './transition.js';
import { MechanismClassStore } from './mechanism-class-store.js';
import {
  createDefaultMechanismClass,
  DEFAULT_MECHANISM_CLASS_ID,
  type MechanismClass,
} from './mechanism-class.js';
import { ProgramRevisionProposalStore } from './program-revision-proposal-store.js';
import type { ProgramRevisionProposalStoreStats } from './program-revision-proposal-store.js';
import type { ProgramRevisionProposal } from './program-revision-proposal.js';
import { createProgramRevisionProposal } from './program-revision-proposal.js';
import { ValidityEnvelopeStore } from './validity-envelope-store.js';
import type { ValidityEnvelopeStoreStats } from './validity-envelope-store.js';
import {
  createDefaultValidityEnvelope,
  DEFAULT_VALIDITY_ENVELOPE_ID,
} from './validity-envelope.js';
import { ReviewDecisionStore } from './review-decision-store.js';
import type { ReviewDecisionStoreStats } from './review-decision-store.js';
import { ReconstructionStore } from './reconstruction-store.js';
import { BranchPointStore } from './branch-point-store.js';
import { createBranchPoint, createFutureBranch, chooseBranch } from './branch-point.js';
import { buildProofLineage, type ProofLineage } from './proof-lineage.js';
import { PresentSliceStore } from './present-slice-store.js';
import type { PresentSliceStoreStats } from './present-slice-store.js';
import { buildPresentSliceFromPipeline } from './present-slice.js';
import type { PipelineSnapshot } from './present-slice.js';
import { HistoricalCompressionRecordStore } from './historical-compression-record-store.js';
import type { HistoricalCompressionRecordStoreStats } from './historical-compression-record-store.js';
import { createHistoricalCompressionRecord } from './historical-compression-record.js';
import { LineageCompileProposalStore } from './lineage-compile-proposal-store.js';
import type { LineageCompileProposalStoreStats } from './lineage-compile-proposal-store.js';
import { PrunedBranchRecordStore } from './pruned-branch-record-store.js';
import type { PrunedBranchRecordStoreStats } from './pruned-branch-record-store.js';
import {
  createPrunedBranchRecord,
  type PrunedBranchRecord,
  type CreatePrunedBranchRecordInput,
} from './pruned-branch-record.js';
import {
  createLineageCompileProposal,
  approveProposal as approveLineageProposal,
  applyProposal as applyLineageProposal,
} from './lineage-compile-proposal.js';
import type { ProposedRefChange } from './lineage-compile-proposal.js';
import { createDefaultConstitutionalLayer, auditSubject, type ConstitutionalAudit } from './constitutional-layer.js';
import type { ReconstructionStoreStats } from './reconstruction-store.js';
import { FailureBoundaryArchiveStore } from './failure-boundary-archive-store.js';
import {
  createFailureBoundaryArchive,
  appendFailureRecord,
  type FailureBoundaryArchive,
} from './failure-boundary-archive.js';
import crypto from 'crypto';

// =============================================================================
// 配置与接口
// =============================================================================

/** 管道配置 */
export interface PipelineConfig {
  /** AtomGraph 数据库路径 */
  graphDbPath: string;
  /** Story 数据库路径 */
  storyDbPath: string;
  /** Evidence 数据库路径 */
  evidenceDbPath: string;
  /** ProblemClass 数据库路径 */
  problemClassDbPath: string;
  /** PatternEngine 数据库路径 */
  patternDbPath: string;
  /** 自动分类，默认 true */
  autoClassify: boolean;
  /** 自动探索，默认 true */
  autoExplore: boolean;
  /** 自动注入种子数据，默认 true */
  seedDefaults: boolean;
  /** MechanismInstance 持久化数据库路径 */
  mechanismInstanceDbPath: string;
  /** DerivationTrace 持久化数据库路径 */
  derivationTraceDbPath: string;
  /** EpisodeEvent 持久化数据库路径 */
  episodeEventDbPath: string;
  /** SupportLink 持久化数据库路径 */
  supportLinksDbPath: string;
  /** ObservationRecord 持久化数据库路径 */
  observationRecordsDbPath: string;
  /** ObservationModel 持久化数据库路径 */
  observationModelsDbPath: string;
  /** MechanismProgram 持久化数据库路径 */
  mechanismProgramsDbPath: string;
  /** MechanismClass 持久化数据库路径 */
  mechanismClassesDbPath: string;
  /** CounterfactualScenario 持久化数据库路径 */
  counterfactualScenariosDbPath: string;
  /** ExperimentDesign 持久化数据库路径 */
  experimentDesignsDbPath: string;
  /** ActionExecution 持久化数据库路径 */
  actionExecutionDbPath: string;
  /** OutcomeRecord 持久化数据库路径 */
  outcomeRecordDbPath: string;
  /** PredictionError 持久化数据库路径 */
  predictionErrorDbPath: string;
  /** StateSnapshot 持久化数据库路径 */
  stateSnapshotDbPath: string;
  /** Transition 持久化数据库路径 */
  transitionDbPath: string;
  /** ProgramRevisionProposal 持久化数据库路径 */
  programRevisionProposalsDbPath: string;
  /** ValidityEnvelope 持久化数据库路径 */
  validityEnvelopesDbPath: string;
  /** ReviewDecision 持久化数据库路径 */
  reviewDecisionsDbPath: string;
  /** FailureBoundaryArchive 持久化数据库路径 */
  failureBoundaryArchiveDbPath: string;
  /** ReconstructionStore 持久化数据库路径 */
  reconstructionDbPath: string;
  /** BranchPoint 持久化数据库路径 */
  branchPointDbPath: string;
  /** PresentSlice 持久化数据库路径 */
  presentSliceDbPath: string;
  /** HistoricalCompressionRecord 持久化数据库路径 */
  historicalCompressionRecordDbPath: string;
  /** LineageCompileProposal 持久化数据库路径 */
  lineageCompileProposalDbPath: string;
  /** PrunedBranchRecord 持久化数据库路径（v13 G5：被剪掉的真实分支） */
  prunedBranchRecordDbPath: string;
}

/** 提交观测的输入 */
export interface ObservationInput {
  /** 原始问题描述 */
  rawInput: string;
  /** 结构化事实列表 */
  facts: Array<{ pred: string; value: unknown; args?: Record<string, unknown> }>;
  /** 上下文作用域 */
  context?: ContextScope;
  /** 操作者 ID */
  operator?: string;
}

/** 提交观测的完整结果 */
export interface ObservationResult {
  /** 摄入产生的 Atom 列表 */
  atoms: Atom[];
  /** 分类结果（autoClassify=true 时存在） */
  classification?: ClassifyResult;
  /** 创建的 Story */
  story: Story;
  /** 探索结果（autoExplore=true 时存在） */
  explore?: ExploreResult;
  /** 候选因果路径 */
  candidatePaths: StoryPath[];
  /** 模板匹配结果 */
  templateMatches?: Array<{ templateId: string; templateName: string; score: number }>;
  /** 人类可读建议 */
  suggestions: string[];
}

/** 记录修复的输入 */
export interface FixInput {
  /** 要解决的 Story ID */
  storyId: string;
  /** 修复描述 */
  fixDescription: string;
  /** 实际走的路径（Atom ID 有序列表） */
  chosenPathAtomIds?: string[];
  /** 试过但失败的路径 */
  failedPathAtomIds?: string[][];
  /** 上下文作用域 */
  context?: ContextScope;
  /** 操作者 ID */
  operator?: string;
  /** 干预结果，默认 'mechanism_confirmed' */
  interventionOutcome?: InterventionOutcome;
}

/** 记录修复的完整结果 */
export interface FixResult {
  /** 更新后的 Story */
  story: Story;
  /** Episode 兼容壳 */
  episode: Episode;
  /** Reconstruction 产物（v7 §10 条件 3） */
  reconstruction: AcceptedReconstruction;
  /** 最终结论（v7 §10 条件 5：主流程输出 Conclusion + Reconstruction） */
  conclusion: Conclusion;
  /**
   * MechanismInstance（mechanism-instance-contract.md §8 条件 1）
   * compile 成功时 status='accepted'；否则 status='candidate' 或 'rejected'
   */
  mechanismInstance: MechanismInstance;
  /** Ontology 更新或不更新说明（v7 §10 条件 4） */
  ontologyUpdate: OntologyDelta;
  /** 编译结果（有 chosenPathAtomIds 时存在） */
  compile?: CompileResult;
  /** 记录的证据条数 */
  evidenceCount: number;
  /** ConstitutionalLayer 审计结果（v11 宪法审计） */
  constitutionalAudit?: ConstitutionalAudit;
  /** 更新后的 Regulation 视图列表 */
  regulationViews: RegulationView[];
}

/** 管道统计 */
export interface PipelineStats {
  graph: { atomCount: number; refCount: number; shortcutCount: number };
  stories: { total: number; resolved: number; uncompiled: number };
  evidence: { total: number; supports: number; contradicts: number };
  problemClasses: number;
  templates: number;
  regulations: number;
  hypotheses: { total: number; open: number; validated: number; readyForCompile: number };
  mechanismInstances: MechanismInstanceStoreStats;
  derivationTraces: DerivationTraceStoreStats;
  episodeEvents: EpisodeEventStoreStats;
  supportLinks: SupportLinkStoreStats;
  observationRecords: ObservationRecordStoreStats;
  observationModels: ObservationModelStoreStats;
  mechanismPrograms: MechanismProgramStoreStats;
  counterfactualScenarios: CounterfactualScenarioStoreStats;
  experimentDesigns: ExperimentDesignStoreStats;
  actionExecutions: ActionExecutionStoreStats;
  outcomeRecords: OutcomeRecordStoreStats;
  predictionErrors: PredictionErrorStoreStats;
  stateSnapshots: StateSnapshotStoreStats;
  transitions: TransitionStoreStats;
  programRevisionProposals: ProgramRevisionProposalStoreStats;
  validityEnvelopes: ValidityEnvelopeStoreStats;
  reviewDecisions: ReviewDecisionStoreStats;
}

export interface ActionExecutionResult {
  design: ExperimentDesign;
  execution: ActionExecution;
  /** Compatibility alias for the test-facing target state name */
  actionExecution: ActionExecution;
  outcomeRecord: OutcomeRecord;
  predictionError: PredictionError;
  sourceEpisode: Episode;
  targetEpisode: Episode;
  /** Compatibility alias for the newly created episode */
  episode: Episode;
  /** source episode 最新快照（若 source 尚无 snapshot 则为 null） */
  sourceSnapshot: StateSnapshot | null;
  /** post-action target episode 状态快照 */
  targetSnapshot: StateSnapshot;
  /** 连接 sourceSnapshot → targetSnapshot 的转移边（sourceSnapshot 存在时才创建） */
  transition: Transition | null;
  /** 基于 PredictionError 生成的模型修正提名（目标可解析时存在） */
  programRevisionProposal: ProgramRevisionProposal | null;
}

// =============================================================================
// CausalPipeline 主类
// =============================================================================

export class CausalPipeline {
  /** 因果知识图谱 */
  readonly graph: AtomGraph;
  /** Story/Case 存储 */
  readonly stories: StoryStorage;
  /** 证据存储 */
  readonly evidence: EvidenceStore;
  /** 问题类注册表 */
  readonly problemClasses: ProblemClassRegistry;
  /** 模式模板引擎 */
  readonly patterns: PatternEngine;
  /** 假设存储（Hypothesis gate） */
  readonly hypotheses: HypothesisStore;
  /** MechanismInstance 持久化存储 */
  readonly mechanismInstances: MechanismInstanceStore;
  /** DerivationTrace 持久化存储 */
  readonly derivationTraces: DerivationTraceStore;
  /** EpisodeEvent 轻量 timeline 存储 */
  readonly episodeEvents: EpisodeEventStore;
  /** SupportLink 持久化存储 */
  readonly supportLinks: SupportLinkStore;
  /** ObservationRecord 持久化存储 */
  readonly observationRecords: ObservationRecordStore;
  /** ObservationModel 持久化存储 */
  readonly observationModels: ObservationModelStore;
  /** MechanismProgram 持久化存储 */
  readonly mechanismPrograms: MechanismProgramStore;
  /** MechanismClass 持久化存储 */
  readonly mechanismClasses: MechanismClassStore;
  /** CounterfactualScenario 持久化存储 */
  readonly counterfactualScenarios: CounterfactualScenarioStore;
  /** ExperimentDesign 持久化存储 */
  readonly experimentDesigns: ExperimentDesignStore;
  /** ActionExecution 持久化存储 */
  readonly actionExecutions: ActionExecutionStore;
  /** OutcomeRecord 持久化存储 */
  readonly outcomeRecords: OutcomeRecordStore;
  /** PredictionError 持久化存储 */
  readonly predictionErrors: PredictionErrorStore;
  /** StateSnapshot 持久化存储 */
  readonly stateSnapshots: StateSnapshotStore;
  /** Transition 持久化存储 */
  readonly transitions: TransitionStore;
  /** ProgramRevisionProposal 持久化存储 */
  readonly programRevisionProposals: ProgramRevisionProposalStore;
  /** ValidityEnvelope 持久化存储 */
  readonly validityEnvelopes: ValidityEnvelopeStore;
  /** ReviewDecision 持久化存储（P06 review lane） */
  readonly reviewDecisions: ReviewDecisionStore;
  /** v11 FailureBoundaryArchive 持久化存储 */
  readonly failureBoundaryArchives: FailureBoundaryArchiveStore;
  /** AcceptedReconstruction 持久化存储（HIGH 4 修复） */
  readonly reconstructions: ReconstructionStore;
  /** v13 BranchPoint 分叉治理存储 */
  readonly branchPoints: BranchPointStore;
  /** v13 PresentSlice 当前观测面存储 */
  readonly presentSlices: PresentSliceStore;
  /** v13 HistoricalCompressionRecord 历史压缩记录存储 */
  readonly historicalCompressionRecords: HistoricalCompressionRecordStore;
  /** v13 LineageCompileProposal 谱系编译提案存储 */
  readonly lineageCompileProposals: LineageCompileProposalStore;
  /** v13 PrunedBranchRecord 被剪掉的真实分支记录（G5） */
  readonly prunedBranchRecords: PrunedBranchRecordStore;

  private rvBuilder: RegulationViewBuilder;
  private config: PipelineConfig;

  constructor(config: Partial<PipelineConfig> = {}) {
    const resolved: PipelineConfig = {
      graphDbPath:             config.graphDbPath             ?? ':memory:',
      storyDbPath:             config.storyDbPath             ?? ':memory:',
      evidenceDbPath:          config.evidenceDbPath          ?? ':memory:',
      problemClassDbPath:      config.problemClassDbPath      ?? ':memory:',
      patternDbPath:           config.patternDbPath           ?? ':memory:',
      autoClassify:            config.autoClassify            ?? true,
      autoExplore:             config.autoExplore             ?? true,
      seedDefaults:            config.seedDefaults            ?? true,
      mechanismInstanceDbPath: config.mechanismInstanceDbPath ?? ':memory:',
      derivationTraceDbPath:   config.derivationTraceDbPath   ?? ':memory:',
      episodeEventDbPath:      config.episodeEventDbPath      ?? ':memory:',
      supportLinksDbPath:      config.supportLinksDbPath      ?? ':memory:',
      observationRecordsDbPath: config.observationRecordsDbPath ?? ':memory:',
      observationModelsDbPath:  config.observationModelsDbPath  ?? ':memory:',
      mechanismProgramsDbPath:  config.mechanismProgramsDbPath  ?? ':memory:',
      mechanismClassesDbPath:        config.mechanismClassesDbPath        ?? ':memory:',
      counterfactualScenariosDbPath: config.counterfactualScenariosDbPath ?? ':memory:',
      experimentDesignsDbPath:       config.experimentDesignsDbPath       ?? ':memory:',
      actionExecutionDbPath:    config.actionExecutionDbPath    ?? ':memory:',
      outcomeRecordDbPath:      config.outcomeRecordDbPath      ?? ':memory:',
      predictionErrorDbPath:    config.predictionErrorDbPath    ?? ':memory:',
      stateSnapshotDbPath:           config.stateSnapshotDbPath           ?? ':memory:',
      transitionDbPath:              config.transitionDbPath              ?? ':memory:',
      programRevisionProposalsDbPath: config.programRevisionProposalsDbPath ?? ':memory:',
      validityEnvelopesDbPath:        config.validityEnvelopesDbPath        ?? ':memory:',
      reviewDecisionsDbPath:          config.reviewDecisionsDbPath          ?? ':memory:',
      failureBoundaryArchiveDbPath:   config.failureBoundaryArchiveDbPath   ?? ':memory:',
      reconstructionDbPath:           config.reconstructionDbPath           ?? ':memory:',
      branchPointDbPath:              config.branchPointDbPath              ?? ':memory:',
      presentSliceDbPath:             config.presentSliceDbPath             ?? ':memory:',
      historicalCompressionRecordDbPath: config.historicalCompressionRecordDbPath ?? ':memory:',
      lineageCompileProposalDbPath:      config.lineageCompileProposalDbPath      ?? ':memory:',
      prunedBranchRecordDbPath:          config.prunedBranchRecordDbPath          ?? ':memory:',
    };
    this.config = resolved;

    this.graph         = new AtomGraph(resolved.graphDbPath);
    this.stories       = new StoryStorage(resolved.storyDbPath);
    this.evidence      = new EvidenceStore(resolved.evidenceDbPath);
    this.problemClasses = new ProblemClassRegistry(resolved.problemClassDbPath);
    this.patterns      = new PatternEngine(resolved.patternDbPath);
    const hypothesisDbPath = resolved.graphDbPath === ':memory:' ? ':memory:'
      : resolved.graphDbPath.replace('.db', '_hypotheses.db');
    this.hypotheses    = new HypothesisStore(hypothesisDbPath);
    // RegulationViewBuilder 直接读 AtomGraph 的 DB（只读视图，不建自己的表）
    this.rvBuilder            = new RegulationViewBuilder(this.graph.db);
    this.mechanismInstances   = new MechanismInstanceStore(resolved.mechanismInstanceDbPath);
    this.derivationTraces     = new DerivationTraceStore(resolved.derivationTraceDbPath);
    this.episodeEvents        = new EpisodeEventStore(resolved.episodeEventDbPath);
    this.supportLinks         = new SupportLinkStore(resolved.supportLinksDbPath);
    this.observationRecords   = new ObservationRecordStore(resolved.observationRecordsDbPath);
    this.observationModels    = new ObservationModelStore(resolved.observationModelsDbPath);
    // 幂等写入默认 ObservationModel（第一轮过渡模型，所有 submitObservation 路径共享）
    if (!this.observationModels.get(DEFAULT_OBSERVATION_MODEL_ID)) {
      this.observationModels.save(createDefaultObservationModel());
    }
    this.mechanismClasses     = new MechanismClassStore(resolved.mechanismClassesDbPath);
    if (!this.mechanismClasses.get(DEFAULT_MECHANISM_CLASS_ID)) {
      this.mechanismClasses.save(createDefaultMechanismClass());
    }
    this.mechanismPrograms    = new MechanismProgramStore(resolved.mechanismProgramsDbPath);
    // 幂等写入默认 MechanismProgram（第一轮过渡模型，所有 recordFix 路径共享）
    if (!this.mechanismPrograms.get(DEFAULT_MECHANISM_PROGRAM_ID)) {
      this.mechanismPrograms.save(createDefaultMechanismProgram());
    }
    const defaultMechanismClass = this.mechanismClasses.get(DEFAULT_MECHANISM_CLASS_ID);
    if (defaultMechanismClass && !defaultMechanismClass.mechanismProgramIds.includes(DEFAULT_MECHANISM_PROGRAM_ID)) {
      this.mechanismClasses.save({
        ...defaultMechanismClass,
        mechanismProgramIds: [...defaultMechanismClass.mechanismProgramIds, DEFAULT_MECHANISM_PROGRAM_ID],
      });
    }
    this.counterfactualScenarios = new CounterfactualScenarioStore(resolved.counterfactualScenariosDbPath);
    this.experimentDesigns    = new ExperimentDesignStore(resolved.experimentDesignsDbPath);
    this.actionExecutions     = new ActionExecutionStore(resolved.actionExecutionDbPath);
    this.outcomeRecords       = new OutcomeRecordStore(resolved.outcomeRecordDbPath);
    this.predictionErrors     = new PredictionErrorStore(resolved.predictionErrorDbPath);
    this.stateSnapshots       = new StateSnapshotStore(resolved.stateSnapshotDbPath);
    this.transitions          = new TransitionStore(resolved.transitionDbPath);
    this.programRevisionProposals = new ProgramRevisionProposalStore(resolved.programRevisionProposalsDbPath);
    this.validityEnvelopes = new ValidityEnvelopeStore(resolved.validityEnvelopesDbPath);
    // 幂等写入默认 ValidityEnvelope（与 DEFAULT_MECHANISM_PROGRAM_ID 绑定的 demo 级 VE）
    if (!this.validityEnvelopes.get(DEFAULT_VALIDITY_ENVELOPE_ID)) {
      this.validityEnvelopes.save(createDefaultValidityEnvelope(DEFAULT_MECHANISM_PROGRAM_ID));
    }
    this.reviewDecisions = new ReviewDecisionStore(resolved.reviewDecisionsDbPath);
    this.failureBoundaryArchives = new FailureBoundaryArchiveStore(resolved.failureBoundaryArchiveDbPath);
    this.reconstructions = new ReconstructionStore(resolved.reconstructionDbPath);
    this.branchPoints = new BranchPointStore(resolved.branchPointDbPath);
    this.presentSlices = new PresentSliceStore(resolved.presentSliceDbPath);
    this.historicalCompressionRecords = new HistoricalCompressionRecordStore(resolved.historicalCompressionRecordDbPath);
    this.lineageCompileProposals = new LineageCompileProposalStore(resolved.lineageCompileProposalDbPath);
    this.prunedBranchRecords = new PrunedBranchRecordStore(resolved.prunedBranchRecordDbPath);

    if (resolved.seedDefaults) {
      this.problemClasses.seedDefaults();
      this.patterns.seedDefaults();
    }
  }

  // ===========================================================================
  // submitObservation
  // ===========================================================================

  /**
   * 提交观测 — 完整管道：
   * 1. ingestFacts → Atoms
   * 2. ProblemClass.classify → 分类
   * 3. Story.create → 创建案例
   * 4. explore（图遍历，找候选路径）
   * 5. PatternTemplate.match → 模板匹配
   * 6. 生成建议
   */
  submitObservation(input: ObservationInput): ObservationResult {
    const suggestions: string[] = [];

    // Step 1: 摄入事实为 Atoms
    const contextRecord: Record<string, unknown> = {};
    if (input.context) {
      if (input.context.env)     contextRecord['env']     = input.context.env;
      if (input.context.stack)   contextRecord['stack']   = input.context.stack.join(',');
      if (input.context.project) contextRecord['project'] = input.context.project;
    }
    const atoms = this.graph.ingestFacts(input.facts, contextRecord);

    // Step 2: 自动分类
    const classification = this.config.autoClassify
      ? this.classifyBestEffort(input.rawInput, 'submitObservation')
      : undefined;
    if (classification) {
        suggestions.push(
          `问题分类: ${classification.problemClassId} (置信度 ${(classification.confidence * 100).toFixed(0)}%)`
        );
    }

    // Step 3: 创建 Story
    const story = this.stories.create({
      rawInput:           input.rawInput,
      problemClassId:     classification?.problemClassId,
      context:            input.context,
      observationAtomIds: atoms.map(a => a.id),
      operator:           input.operator ?? 'system',
    });

    // Step 3b: 为每个 observation atom 生成真实 ObservationRecord 并落盘
    // D1: observationRecordId 必须是真实 ObservationRecord.id，不得借用 Atom id
    // D2: observationModelId 锚定到默认 ObservationModel（第一轮过渡策略）
    const observationRecordIds: string[] = [];
    atoms.forEach((atom, idx) => {
      const rec: ObservationRecord = {
        id: `OR_${story.id}_${idx}`,
        episodeId: story.id,
        observationModelId: DEFAULT_OBSERVATION_MODEL_ID,
        t: idx,
        source: 'submitObservation',
        payload: {
          atomId: atom.id,
          factIndex: idx,
          rawInput: input.rawInput.slice(0, 120),
        },
      };
      this.observationRecords.save(rec);
      observationRecordIds.push(rec.id);
    });

    // Step 3c: 写入 observation_recorded 事件
    this.episodeEvents.append(createEpisodeEvent({
      episode_id: story.id,
      seq: this.episodeEvents.nextSeq(story.id),
      kind: 'observation_recorded',
      ref_id: story.id,
      payload: { atomCount: atoms.length, observationRecordIds },
    }));

    // Step 4: 探索（在图中找候选因果路径）
    let explore: ExploreResult | undefined;
    const candidatePaths: StoryPath[] = [];

    if (this.config.autoExplore && atoms.length > 0) {
      const factAtomIds = atoms
        .filter(a => a.kind === AtomKind.FACT)
        .map(a => a.id);

      if (factAtomIds.length > 0) {
        explore = this.graph.explore(factAtomIds, { maxDepth: 3, maxPaths: 10 });

        for (const p of explore.paths) {
          candidatePaths.push({
            atomIds:     p.atoms.map(a => a.id),
            totalWeight: p.totalWeight,
          });
        }

        if (explore.newTentativeRefs > 0) {
          suggestions.push(`创建了 ${explore.newTentativeRefs} 条新的探索边（tentative）`);
        }

        if (explore.shortcutHits > 0) {
          suggestions.push(`命中 ${explore.shortcutHits} 条快捷路径（髓鞘化缓存）`);
        }

        // 将候选路径写回 Story
        if (candidatePaths.length > 0) {
          this.stories.startExploring(story.id, candidatePaths);
        }
      }
    }

    // Step 5: 模板匹配
    let templateMatches: Array<{ templateId: string; templateName: string; score: number }> | undefined;
    if (atoms.length > 0) {
      const atomsForMatch = atoms.map(a => ({ id: a.id, kind: a.kind, content: a.content }));

      // 为 refChecker 构建闭包：检查图中是否存在指定类型的出边
      const refChecker = (from: string, to: string, kind: string): boolean => {
        const neighbors = this.graph.getNeighbors(from, { direction: 'outgoing' });
        return neighbors.some(n => n.atom.id === to && n.ref.kind === kind);
      };

      const matches = this.patterns.matchTemplates(atomsForMatch, refChecker, {
        minScore: 0.3,
        limit: 5,
      });

      if (matches.length > 0) {
        templateMatches = matches.map(m => ({
          templateId:   m.template.id,
          templateName: m.template.name,
          score:        m.instance.score,
        }));
        suggestions.push(
          `匹配到模板: ${matches[0].template.name} (${(matches[0].instance.score * 100).toFixed(0)}%)`
        );
      }
    }

    // Step 6: 生成动作建议
    if (candidatePaths.length > 0) {
      const best = candidatePaths[0];
      const lastAtomId = best.atomIds[best.atomIds.length - 1];
      if (lastAtomId) {
        const lastAtom = this.graph.getAtom(lastAtomId);
        if (lastAtom && lastAtom.kind === AtomKind.ACTION) {
          suggestions.push(`建议动作: ${lastAtom.content}`);
        }
      }
    }

    if (candidatePaths.length === 0 && atoms.length > 0) {
      suggestions.push('未找到已有解释路径，已创建 open Story 等待后续学习');
    }

    // Step 3d: 为新 Episode 创建初始状态快照
    const initialSnapshot = createStateSnapshot({
      episodeId: story.id,
      t: 0,
      values: {
        rawInput: input.rawInput.slice(0, 120),
        factCount: atoms.length,
        context: contextRecord,
      },
      createdBy: input.operator ?? 'pipeline_submit_observation',
    });
    this.stateSnapshots.save(initialSnapshot);

    return {
      atoms,
      classification,
      story,
      explore,
      candidatePaths,
      templateMatches,
      suggestions,
    };
  }

  // ===========================================================================
  // recordFix
  // ===========================================================================

  /**
   * 记录修复 — 完整管道（含 Hypothesis gate）：
   * 1. 创建修复 Atom
   * 2. 创建 Hypothesis → validate → canPromote 门控
   * 3. compile（仅当 canPromote 通过）
   * 4. Evidence 绑定精确 compiledRefIds（仅 compile 成功）
   * 5. Story resolve（compile 成功 → success，否则 → partial）
   * 6. myelinate + RegulationView.buildAll
   */
  recordFix(input: FixInput): FixResult {
    const outcome: InterventionOutcome = input.interventionOutcome ?? 'mechanism_confirmed';
    const fallbackTime = new Date().toISOString();
    const existingStory = this.stories.get(input.storyId);
    if (existingStory?.status === 'resolved') {
      throw new Error(`Story 已 resolved，不能再次 recordFix: ${input.storyId}`);
    }

    const storySnapshot: Story = existingStory ?? {
      id: input.storyId,
      rawInput: input.fixDescription,
      context: input.context ?? {},
      observationAtomIds: [],
      candidatePaths: [],
      executedSkillIds: [],
      status: 'open',
      operator: input.operator ?? 'system',
      createdAt: fallbackTime,
      updatedAt: fallbackTime,
    };

    // ─── EpisodeEvent 辅助 ────────────────────────────────────────────────
    const episodeEventIds: string[] = [];
    const appendEv = (kind: EpisodeEventKind, refId?: string, payload: Record<string, unknown> = {}): string => {
      const ev = createEpisodeEvent({
        episode_id: input.storyId,
        seq: this.episodeEvents.nextSeq(input.storyId),
        kind,
        ref_id: refId,
        payload,
      });
      this.episodeEvents.append(ev);
      return ev.id;
    };

    // Step 1: 创建修复 Atom（ACTION 类型）
    const fixAtom = this.graph.addAtom(input.fixDescription, AtomKind.ACTION);

    // Step 2: 如果提供了正确路径，走 Hypothesis gate
    let compile: CompileResult | undefined;
    let evidenceCount = 0;
    let hypothesisId: string | undefined;
    let pathWithFix: string[] | undefined;

    if (input.chosenPathAtomIds && input.chosenPathAtomIds.length >= 2) {
      // 确保修复 Atom 在路径中
      pathWithFix = input.chosenPathAtomIds.includes(fixAtom.id)
        ? input.chosenPathAtomIds
        : [...input.chosenPathAtomIds, fixAtom.id];

      // Step 2a: 创建 Hypothesis（暂存候选推断）
      // 取路径首尾作为 claim
      const firstAtomId = pathWithFix[0];
      const lastAtomId  = pathWithFix[pathWithFix.length - 1];
      const hypothesis  = this.hypotheses.create({
        claim:            { fromAtomId: firstAtomId, toAtomId: lastAtomId, kind: 'causes' },
        forceUpperBound:  'contributory',
        evidencePolicy:   'revalidate',
        storyId:          input.storyId,
        sourceDescription: input.fixDescription,
      });
      hypothesisId = hypothesis.id;
      episodeEventIds.push(appendEv('hypothesis_created', hypothesis.id, { claim: hypothesis.claim }));

      // Step 2b: Validate hypothesis（提供 outcome；此时尚无 compiled evidence，传空列表）
      this.hypotheses.validate(hypothesis.id, [], outcome);
      episodeEventIds.push(appendEv('hypothesis_validated', hypothesis.id, { outcome }));

      // Step 2c: 检查 canPromote
      const promoteCheck = this.hypotheses.canPromote(hypothesis.id);

      if (promoteCheck.allowed) {
        // Step 2d: compile（路径合法性由 compile 内部的 RefAlgebra 检查保证）
        compile = this.graph.compile(
          { atomIds: pathWithFix },
          input.failedPathAtomIds?.map(ids => ({ atomIds: ids }))
        );

        // Step 2e: 只有 compile 真正写入了才记录 Evidence
        if (compile.compiledRefs > 0) {
          for (const refId of compile.compiledRefIds) {
            try {
              recordSupport(this.evidence, refId, 'fix', input.storyId, 0.85, input.context);
              evidenceCount++;
            } catch (error) {
              this.warnBestEffortFailure('recordFix.evidence', error, { refId, storyId: input.storyId });
            }
          }
          episodeEventIds.push(appendEv('compile_applied', `compile:${input.storyId}`, { compiledRefs: compile.compiledRefs }));

          // v13: compile 成功 → 创建 LineageCompileProposal 记录本次编译
          try {
            const proposedChanges: ProposedRefChange[] = compile.compiledRefIds.map(refId => ({
              refId,
              changeKind: 'add' as const,
              beforeValue: null,
              afterValue: 'compiled',
            }));
            // 获取最新 PresentSlice（刚在 Step 9 创建，此处可能尚未写入，用 fallback）
            const latestSlices = this.presentSlices.listAll(1);
            const targetSliceId = latestSlices.length > 0 ? latestSlices[0].id : `pending_slice_${input.storyId}`;
            // 获取已剪除分支引用
            const prunedBranchRefs = (input.failedPathAtomIds ?? []).map(
              (_, idx) => `pruned_path_${input.storyId}_${idx}`
            );

            let proposal = createLineageCompileProposal({
              targetPresentSliceId: targetSliceId,
              proposedLineageId: `lineage_${input.storyId}`,
              supportingEpisodes: [input.storyId],
              prunedBranchRefs,
              proposedChanges,
              justification: input.fixDescription,
              reconstructionId: undefined, // reconstruction 尚未创建，后续回填
              createdBy: input.operator ?? 'pipeline_recordfix',
            });
            // compile 已通过 hypothesis 门控，直接 approve + apply
            const syntheticReviewId = `RD_auto_${input.storyId}_${crypto.randomBytes(4).toString('hex')}`;
            proposal = approveLineageProposal(proposal, syntheticReviewId);
            proposal = applyLineageProposal(proposal);
            this.lineageCompileProposals.save(proposal);
            episodeEventIds.push(appendEv('lineage_compile_proposal_applied', proposal.id, { status: proposal.status }));
          } catch (error) {
            this.warnBestEffortFailure('recordFix.lineageCompileProposal', error, { storyId: input.storyId });
          }
        } else {
          episodeEventIds.push(appendEv('compile_blocked', undefined, { reason: 'compiledRefs=0' }));
        }
      } else {
        // canPromote 未通过 → compile 保持 undefined，story 将标记 partial
        episodeEventIds.push(appendEv('compile_blocked', undefined, { reason: 'canPromote_failed' }));
      }
    }

    // Step 3: 创建并裁决 MechanismInstance（D2：先于 Reconstruction 创建）
    // source_kind='path_projection'：当前为过渡态，路径 Atom 作为 slot 绑定代理
    const miBindings: Record<string, string> = {};
    const pathForBindings = pathWithFix ?? storySnapshot.observationAtomIds;
    pathForBindings.forEach((atomId, i) => { miBindings[`slot_${i}`] = atomId; });

    const mechanismClassRef = this.ensurePathProjectionMechanismClass(input.storyId).id;

    const rawMechanismInstance = createMechanismInstance({
      episode_id: input.storyId,
      mechanism_class_ref: mechanismClassRef,
      mechanism_program_ref: DEFAULT_MECHANISM_PROGRAM_ID,
      bindings: Object.keys(miBindings).length > 0 ? miBindings : { slot_0: fixAtom.id },
      source_kind: 'path_projection',
      source_ref: compile ? `compile:${input.storyId}` : null,
      claim_ids: hypothesisId ? [hypothesisId] : [],
      created_by: 'pipeline_s4',
    });
    episodeEventIds.push(appendEv('mechanism_instance_created', rawMechanismInstance.id, { mechanism_class_ref: mechanismClassRef }));

    // Step 3b: 如果 accepted 路径存在且有 hypothesisId，生成最小 SupportLink
    // 语义：ObservationRecord → Claim（真实 ObservationRecord id，不借用 Atom id）
    const generatedSupportLinks: SupportLink[] = [];
    if (compile && compile.compiledRefs > 0 && hypothesisId) {
      // 优先从 ObservationRecordStore 取已落盘的真实 record
      const obsRecords = this.observationRecords.listByEpisode(input.storyId);
      const firstObsRecord = obsRecords[0];
      if (firstObsRecord) {
        const sl: SupportLink = {
          id: `SL_${input.storyId}_${crypto.randomBytes(4).toString('hex')}`,
          observationRecordId: firstObsRecord.id,   // 真实 ObservationRecord.id
          claimId: hypothesisId,
          polarity: 'supports',
          weight: 0.7,
          sourceKind: 'pipeline',
          sourceRef: `compile:${input.storyId}`,
          createdAt: new Date().toISOString(),
          createdBy: 'pipeline_recordfix',
        };
        this.supportLinks.save(sl);
        generatedSupportLinks.push(sl);
      }
    }

    const mechanismInstance: MechanismInstance = compile && compile.compiledRefs > 0
      ? acceptInstance(rawMechanismInstance, {
          claim_ids: hypothesisId ? [hypothesisId] : [],
          // support_link_refs 必须引用真实 SupportLink.id，不得混入 compiledRefIds
          support_link_refs: generatedSupportLinks.map(sl => sl.id),
        })
      : rejectInstance(rawMechanismInstance, compile
          ? '路径 compile 成功但 compiledRefs=0'
          : (hypothesisId ? 'canPromote 门控未通过' : '无有效路径'));
    episodeEventIds.push(appendEv(
      mechanismInstance.status === 'accepted' ? 'mechanism_instance_accepted' : 'mechanism_instance_rejected',
      mechanismInstance.id,
      { status: mechanismInstance.status }
    ));

    // 落盘 MechanismInstance
    this.mechanismInstances.save(mechanismInstance);

    // Step 4: 创建 AcceptedReconstruction（D2：用 mechanismInstance.id 写入）
    // 预生成 traceId，供 reconstruction 和 DerivationTrace 双向互链
    const preTraceId = `DT_${input.storyId}_${crypto.randomBytes(4).toString('hex')}`;
    // ─── 预计算因果分段所需的 majorChain ────────────────────────────
    // majorChain 由 createAcceptedReconstruction 内部从 chosenPathAtomIds 派生，
    // 此处提前镜像同样逻辑以便分段赋值
    const effectivePathIds = pathWithFix ?? storySnapshot.observationAtomIds;
    const majorChainPreview = effectivePathIds.length > 0 ? effectivePathIds : ['episode_initial'];

    // ─── 从 majorChain 派生三层因果分段（nearCauseSegment / midCauseSegment / deepCauseSegment）
    // 分段策略：
    //   - deepCauseSegment:  majorChain 首元素（根因 / 初始条件）
    //   - nearCauseSegment:  majorChain 末尾 1~2 个元素（直接触发修复的节点）
    //   - midCauseSegment:   majorChain 中间部分（链长度 >= 3 时存在）
    const toSegment = (nodeRef: string, role: 'premise' | 'mechanism' | 'constraint' | 'intervention'): import('./reconstruction.js').ProvenanceSegment => ({
      node_ref: nodeRef,
      role,
      weight: 1.0,
      evidenceRefs: [],
    });

    let nearCauseSegment: import('./reconstruction.js').ProvenanceSegment[] = [];
    let midCauseSegment: import('./reconstruction.js').ProvenanceSegment[] = [];
    let deepCauseSegment: import('./reconstruction.js').ProvenanceSegment[] = [];

    if (majorChainPreview.length === 1) {
      // 链长度 1：唯一节点既是近因也是远因
      nearCauseSegment = [toSegment(majorChainPreview[0], 'intervention')];
    } else if (majorChainPreview.length === 2) {
      // 链长度 2：首节点为远因，尾节点为近因
      deepCauseSegment = [toSegment(majorChainPreview[0], 'premise')];
      nearCauseSegment = [toSegment(majorChainPreview[1], 'intervention')];
    } else {
      // 链长度 >= 3：首节点为远因，尾部 1~2 个为近因，中间为中因
      deepCauseSegment = [toSegment(majorChainPreview[0], 'premise')];
      // 近因：取最后 2 个（或最后 1 个，取决于中间是否还有剩余）
      const nearCount = majorChainPreview.length >= 4 ? 2 : 1;
      const nearStart = majorChainPreview.length - nearCount;
      nearCauseSegment = majorChainPreview.slice(nearStart).map(id => toSegment(id, 'intervention'));
      // 中因：去掉首尾后的中间段
      midCauseSegment = majorChainPreview.slice(1, nearStart).map(id => toSegment(id, 'mechanism'));
    }

    // ─── 预计算 fidelity 以派生 unresolvedGaps ─────────────────────────
    // fidelity.missed_nodes 在 createAcceptedReconstruction 内部计算，
    // 此处镜像 scoreFidelity 的逻辑提前获取 missed_nodes
    const expectedNodes = new Set(effectivePathIds.length > 0 ? effectivePathIds : storySnapshot.observationAtomIds);
    const actualNodes = new Set(majorChainPreview);
    const missedNodes = [...expectedNodes].filter(n => !actualNodes.has(n));

    const unresolvedGaps: import('./reconstruction.js').UnresolvedGap[] = missedNodes.map(nodeId => ({
      kind: 'missing_observation' as const,
      description: `fidelity 未覆盖节点: ${nodeId}`,
      severity: 'mid' as const,
    }));

    // ─── minimalityJustification ──────────────────────────────────────
    const minimalityJustification: import('./reconstruction.js').MinimalityJustification | null =
      missedNodes.length === 0
        ? { kind: 'coverage_saturated', rationale: '所有 majorChain 节点均被 fidelity 匹配覆盖，无遗漏' }
        : { kind: 'heuristic_cutoff', rationale: `majorChain 存在 ${missedNodes.length} 个未覆盖节点，当前链为启发式截断` };

    const reconstruction = createAcceptedReconstruction({
      episodeId: input.storyId,
      chosenPathAtomIds: effectivePathIds,
      observationAtomIds: storySnapshot.observationAtomIds,
      derivationChainId: hypothesisId ? `DC_${input.storyId}_${hypothesisId}` : undefined,
      traceId: preTraceId,
      selectedMechanismIds: [mechanismInstance.mechanism_class_ref],
      ontologySnapshotRef: 'ontology_current',
      // P1：只在 accepted 时写入，rejected 路径不得绑定被否决的 bridge 对象
      mechanismInstanceIds: mechanismInstance.status === 'accepted' ? [mechanismInstance.id] : [],
      // v13 Minimal Sufficient Provenance — 从 majorChain + fidelity 派生
      nearCauseSegment,
      midCauseSegment,
      deepCauseSegment,
      minimalityJustification,
      unresolvedGaps,
    });

    // 创建并落盘 DerivationTrace（与 reconstruction 双向互链）
    const trace = createDerivationTrace({
      id: preTraceId,
      episodeId: input.storyId,
      reconstructionId: reconstruction.id,
      contextKind: 'reconstruction',
      // 从 majorChain 派生 premise claims（首节点 + hypothesis），确保 CC_has_premises 通过
      premiseClaimIds: [
        ...reconstruction.majorChain.slice(0, 1),
        ...(hypothesisId ? [hypothesisId] : []),
      ],
      // 从 Story 解决描述派生 conclusion，确保 CC_has_conclusion 通过
      conclusionClaimId: `conclusion_${input.storyId}`,
      rejectedClaimIds: mechanismInstance.status === 'rejected' ? [mechanismInstance.id] : [],
      createdBy: 'pipeline_recordfix_shell',
      supportLinks: generatedSupportLinks,
    });
    this.derivationTraces.save(trace);
    // v11: 从 DerivationTrace 构建 ProofLineage（证明谱系）
    let proofLineage: ProofLineage | undefined;
    try {
      proofLineage = buildProofLineage(
        [trace],
        `ProofLineage for ${input.storyId}`,
        { createdBy: input.operator ?? 'pipeline_recordfix' }
      );
    } catch {
      // trace 可能缺少 conclusionClaimId，best-effort
    }
    episodeEventIds.push(appendEv('reconstruction_written', reconstruction.id, { traceId: preTraceId, fidelityScore: reconstruction.fidelity.score }));
    // HIGH 4 修复：持久化 AcceptedReconstruction，使其成为可查询的治理对象
    this.reconstructions.save(reconstruction);
    // v13: 回填 LineageCompileProposal 的 reconstructionId（创建时 reconstruction 尚不存在）
    if (compile && compile.compiledRefs > 0) {
      try {
        const appliedProposals = this.lineageCompileProposals.listByStatus('applied', 1);
        const lastProposal = appliedProposals.find(p => p.justification === input.fixDescription);
        if (lastProposal && !lastProposal.reconstructionId) {
          this.lineageCompileProposals.save({ ...lastProposal, reconstructionId: reconstruction.id });
        }
      } catch (error) {
        this.warnBestEffortFailure('recordFix.lineageCompileProposal.backfill', error, { storyId: input.storyId });
      }
    }
    // v11 ConstitutionalLayer：对 DerivationTrace 执行宪法审计
    let constitutionalAudit: ConstitutionalAudit | undefined;
    try {
      const constitutionalLayer = createDefaultConstitutionalLayer();
      constitutionalAudit = auditSubject(constitutionalLayer, trace, 'DerivationTrace');
      if (!constitutionalAudit.mandatoryPassed) {
        this.warnBestEffortFailure('recordFix.constitutionalAudit',
          new Error(`宪法审计未通过: ${constitutionalAudit.failedCount} 条约束失败`),
          { storyId: input.storyId, results: constitutionalAudit.results.filter(r => !r.passed) });
      }
    } catch (error) {
      this.warnBestEffortFailure('recordFix.constitutionalAudit', error, { storyId: input.storyId });
    }

    // MEDIUM 6/7 修复：从 candidatePaths + chosenPath + failedPaths 派生 BranchPoint 分叉治理
    // v13 G5 追加：记住本次生成的 pruned future branches，Step 9c 据此派生 PBR
    const derivedPrunedBranches: Array<{ futureBranch: import('./branch-point.js').FutureBranch; branchPointLocation: string }> = [];
    if (storySnapshot.candidatePaths.length > 0 || (input.failedPathAtomIds && input.failedPathAtomIds.length > 0)) {
      try {
        const allPaths = storySnapshot.candidatePaths;
        const bp = createBranchPoint({
          episodeId: input.storyId,
          locationDescription: `recordFix 分叉: ${allPaths.length} 条候选路径`,
          candidateCount: allPaths.length + (input.failedPathAtomIds?.length ?? 0),
          createdBy: input.operator ?? 'pipeline_recordfix',
        });

        // 为 chosenPath 创建 chosen branch
        const chosenPathIds = pathWithFix ?? storySnapshot.observationAtomIds;
        const chosenBranch = createFutureBranch({
          branchPointId: bp.id,
          pathAtomIds: chosenPathIds,
          predictedOutcome: input.fixDescription,
          score: reconstruction.fidelity.score,
          status: 'chosen',
        });

        // 为 failedPaths 创建 pruned branches
        const prunedBranches = (input.failedPathAtomIds ?? []).map(failedPath =>
          createFutureBranch({
            branchPointId: bp.id,
            pathAtomIds: failedPath,
            score: 0,
            status: 'pruned',
            pruneReason: 'compile 验证失败或被操作者排除',
          })
        );

        // 持久化
        const finalBp = { ...bp, chosenBranchId: chosenBranch.id };
        this.branchPoints.saveBranchPoint(finalBp);
        this.branchPoints.saveFutureBranch(chosenBranch);
        for (const pb of prunedBranches) {
          this.branchPoints.saveFutureBranch(pb);
          derivedPrunedBranches.push({ futureBranch: pb, branchPointLocation: finalBp.locationDescription });
        }
      } catch (error) {
        this.warnBestEffortFailure('recordFix.branchPoint', error, { storyId: input.storyId });
      }
    }

    // Step 5: 生成 OntologyDelta（D1：所有路径均返回 OntologyDelta，不再用独立 NoUpdateReason）
    let ontologyUpdate: OntologyDelta;
    if (compile && compile.compiledRefs > 0 && pathWithFix && pathWithFix.length >= 2) {
      const changes = pathWithFix.slice(0, -1).map((fromAtomId, index) =>
        buildRelationChange(fromAtomId, pathWithFix![index + 1], input.storyId)
      );
      ontologyUpdate = createOntologyDelta(
        input.storyId,
        reconstruction,
        [hypothesisId ?? fixAtom.id],
        changes
      );
    } else {
      const reasonKind =
        input.chosenPathAtomIds && input.chosenPathAtomIds.length >= 2
          ? (hypothesisId ? 'pending_more_evidence' : 'episode_inconclusive')
          : (reconstruction.fidelity.score >= 0.9 ? 'ontology_sufficient' : 'episode_inconclusive');

      ontologyUpdate = createOntologyDeltaNone(
        input.storyId,
        reconstruction,
        hypothesisId ? [hypothesisId] : [],
        {
          reason_kind: reasonKind,
          explanation: reasonKind === 'ontology_sufficient'
            ? '当前 Ontology 已能充分解释该 Episode。'
            : reasonKind === 'pending_more_evidence'
              ? '已生成 Reconstruction，但现有证据不足以安全提交 OntologyDelta。'
              : '当前 Episode 的证据链仍不足以生成稳定的 Ontology 更新。',
          follow_up: reasonKind === 'pending_more_evidence'
            ? '补充更多已接受的 claim 或更明确的证据再重试。'
            : null,
        }
      );
    }

    episodeEventIds.push(appendEv('ontology_delta_written', ontologyUpdate.id, { kind: ontologyUpdate.kind }));

    // Step 6: 根据 compile 结果决定 Story 状态
    let story: Story;
    if (compile && compile.compiledRefs > 0) {
      // compile 成功 → resolve + markCompiled + myelinate
      story = (this.stories.resolve(input.storyId, 'success', input.fixDescription)
                ?? this.stories.get(input.storyId)
                ?? storySnapshot) as Story;
      this.stories.markCompiled(input.storyId);
      try {
        this.graph.myelinate({ minUseCount: 3, minWeight: 0.6 });
      } catch (error) {
        this.warnBestEffortFailure('recordFix.myelinate', error, { storyId: input.storyId });
      }
    } else if (input.chosenPathAtomIds && input.chosenPathAtomIds.length >= 2) {
      // 提供了路径但 compile 被拒绝（canPromote 门控未通过或路径不合法）
      story = (this.stories.get(input.storyId) ?? storySnapshot) as Story;
    } else {
      // 没有提供路径 → 仅记录修复描述，直接 resolve
      story = (this.stories.resolve(input.storyId, 'success', input.fixDescription)
                ?? this.stories.get(input.storyId)
                ?? storySnapshot) as Story;
    }

    episodeEventIds.push(appendEv('outcome_recorded', story.id, { outcome: story.outcome, status: story.status }));

    // Step 6b: v11 FailureBoundaryArchive — 记录失败路径为一等公民
    if (input.failedPathAtomIds && input.failedPathAtomIds.length > 0) {
      try {
        // 获取或创建当前 episode 的失败档案
        let archive = this.failureBoundaryArchives.get(`FBA_${input.storyId}`)
          ?? createFailureBoundaryArchive({
            id: `FBA_${input.storyId}`,
            name: `失败边界: ${input.storyId}`,
            description: `Episode ${input.storyId} 中尝试但失败的因果路径`,
            createdBy: input.operator ?? 'pipeline_recordfix',
            status: 'current',
          });

        for (const failedPath of input.failedPathAtomIds) {
          archive = appendFailureRecord(archive, {
            episodeRef: input.storyId,
            mechanismRef: mechanismInstance.id,
            description: `失败路径: [${failedPath.join(' → ')}]`,
            costs: [{ kind: 'epistemic', description: '路径无法解释观测，已被剪除' }],
            boundaryConditions: failedPath.map(atomId => ({
              variableRef: atomId,
              direction: 'equal' as const,
              description: `节点 ${atomId} 在此路径中未通过 compile 验证`,
            })),
            recordedBy: input.operator ?? 'pipeline_recordfix',
          });
        }

        this.failureBoundaryArchives.save(archive);
        episodeEventIds.push(appendEv('failure_boundary_recorded', input.storyId, {
          archiveId: archive.id,
          failedPathCount: input.failedPathAtomIds.length,
        }));
      } catch (error) {
        this.warnBestEffortFailure('recordFix.failureBoundary', error, { storyId: input.storyId });
      }
    }

    // Step 7: 生成 Regulation 视图 + Episode
    const regulationViews = this.rvBuilder.buildAll({ minWeight: 0.3 });
    // 全量查询：含 submitObservation 阶段写入的 observation_recorded
    const allEpisodeEventIds = this.episodeEvents.getByEpisode(input.storyId).map(e => e.id);
    // 从 ObservationRecordStore 查真实落盘 ID（submitObservation 阶段已写入）
    const episodeObsRecordIds = this.observationRecords.listByEpisode(input.storyId).map(r => r.id);
    const episode: Episode = {
      ...toEpisode(story),
      acceptedReconstructionId: reconstruction.id,
      ontologyDeltaId: ontologyUpdate.id,  // D1：所有路径均有 id
      episodeEventIds: allEpisodeEventIds,
      observationRecordIds: episodeObsRecordIds,
    };

    // Step 8: 生成 Conclusion（v7 §10 条件 5）
    const conclusion: Conclusion = {
      answer: story.outcomeNotes ?? input.fixDescription,
      confidence: reconstruction.fidelity.score,
      recommendedActions: compile && compile.compiledRefs > 0
        ? [`编译路径已落盘，${compile.compiledRefs} 条 Ref 可供后续重建使用`]
        : undefined,
    };

    // Step 9: 构建并持久化 PresentSlice（v13 当前观测面快照）
    try {
      const snapshot: PipelineSnapshot = {
        name: `recordFix:${input.storyId}`,
        episodeIds: [input.storyId],
        reconstructionIds: [reconstruction.id],
        reconstructionFidelities: [reconstruction.fidelity.score],
        activeRegulationIds: regulationViews.map(rv => rv.id),
        activeBranchPointIds: this.branchPoints.getByEpisode(input.storyId).map(bp => bp.id),
        stateSnapshotIds: this.stateSnapshots.listByEpisode(input.storyId).map(s => s.id),
        activeConstraints: reconstruction.unresolvedGaps?.map(g => g.description) ?? [],
        visibleOutcomes: conclusion.recommendedActions ?? [],
        inferredLatentStates: [],
        unresolvedUnknowns: reconstruction.unresolvedGaps?.map(g => g.description) ?? [],
        createdBy: input.operator ?? 'pipeline_recordfix',
      };
      const presentSlice = buildPresentSliceFromPipeline(snapshot);
      this.presentSlices.save(presentSlice);

      // Step 9b: 创建 HistoricalCompressionRecord — 记录从 episode 到 PresentSlice 的压缩行为
      try {
        const allObsAtomIds = new Set(storySnapshot.observationAtomIds);
        const majorChainSet = new Set(reconstruction.majorChain);
        const discardedAtomIds = [...allObsAtomIds].filter(id => !majorChainSet.has(id));

        const hcr = createHistoricalCompressionRecord({
          name: `压缩: episode ${input.storyId} → PresentSlice ${presentSlice.id}`,
          sourceEpisodeIds: [input.storyId],
          targetPresentSliceId: presentSlice.id,
          retainedAtomIds: reconstruction.majorChain,
          discardedAtomIds,
          // compressionRatio 自动计算（sourceCount / retainedCount）
          lossDescription: discardedAtomIds.length > 0
            ? `丢弃 ${discardedAtomIds.length} 个观测节点，保留 ${reconstruction.majorChain.length} 个主链节点`
            : '无信息损失，所有观测节点均在主链中',
          reversible: true, // 可通过 reconstruction 反查原始 episode
          createdBy: input.operator ?? 'pipeline_recordfix',
        });
        this.historicalCompressionRecords.save(hcr);
      } catch (hcrError) {
        this.warnBestEffortFailure('recordFix.historicalCompressionRecord', hcrError, { storyId: input.storyId });
      }

      // Step 9c: v13 G5 — 为本次 recordFix 派生的 pruned future branches 自动生成 PrunedBranchRecord
      // 每一条被剪分支都绑定到刚 save 的 PresentSlice，保持 lineage 可追溯
      try {
        for (const { futureBranch, branchPointLocation } of derivedPrunedBranches) {
          const pathPreview = futureBranch.pathAtomIds.slice(0, 3).join(' → ');
          const truncated = futureBranch.pathAtomIds.length > 3 ? '…' : '';
          const pbr = createPrunedBranchRecord({
            branchDescription: `被剪分支 @ ${branchPointLocation}: ${pathPreview}${truncated}`,
            prunedBy: ['failure'],
            presentSliceRef: presentSlice.id,
            definingEpisodeIds: [input.storyId],
            evidenceAtomIds: futureBranch.pathAtomIds,
            rationale: futureBranch.pruneReason ?? 'compile 验证失败或被操作者排除',
            prunedByActor: input.operator ?? 'pipeline_recordfix',
          });
          this.prunedBranchRecords.save(pbr);
        }
      } catch (pbrError) {
        this.warnBestEffortFailure('recordFix.prunedBranchRecord', pbrError, { storyId: input.storyId });
      }
    } catch (error) {
      this.warnBestEffortFailure('recordFix.presentSlice', error, { storyId: input.storyId });
    }

    return {
      story,
      episode,
      reconstruction,
      conclusion,
      mechanismInstance,
      ontologyUpdate,
      compile,
      evidenceCount,
      regulationViews,
      constitutionalAudit,
    };
  }

  // ===========================================================================
  // search
  // ===========================================================================

  /**
   * 智能搜索 — 先分类，再在图中探索候选路径，最后匹配 Regulation 视图
   */
  search(
    query: string,
    context?: ContextScope
  ): {
    classification?: ClassifyResult;
    paths: PathResult[];
    regulations: RegulationView[];
    suggestions: string[];
  } {
    const suggestions: string[] = [];

    // Step 1: 分类
    const classification = this.classifyBestEffort(query, 'search');

    // Step 2: 在图中搜索相关 Atoms（fact + concept 类型）
    const atoms   = this.graph.findAtoms(query, undefined, 10);
    const factIds = atoms
      .filter(a => a.kind === AtomKind.FACT || a.kind === AtomKind.CONCEPT)
      .map(a => a.id);

    // Step 3: explore
    let paths: PathResult[] = [];
    if (factIds.length > 0) {
      const result = this.graph.explore(factIds, { maxDepth: 3, maxPaths: 10 });
      paths = result.paths;
    }

    // Step 4: Regulation 视图搜索
    const regulations = this.rvBuilder.search(query, 5);

    // Step 5: 生成建议
    if (classification) {
      suggestions.push(`问题类型: ${classification.problemClassId}`);
    }
    if (paths.length > 0) {
      suggestions.push(`找到 ${paths.length} 条因果路径`);
    }
    if (regulations.length > 0) {
      suggestions.push(`匹配 ${regulations.length} 条因果规律`);
    }
    if (paths.length === 0 && regulations.length === 0) {
      suggestions.push('暂无匹配的因果路径或规律，继续积累观测数据');
    }

    return { classification, paths, regulations, suggestions };
  }

  // ===========================================================================
  // executeExperimentDesign
  // ===========================================================================

  /**
   * 最小执行闭环：
   * ExperimentDesign.recommendedAction
   *   → ActionExecution
   *   → new Episode
   */
  executeExperimentDesign(
    input:
      | string
      | {
          experimentDesign: ExperimentDesign;
          createdBy?: string;
          operator?: string;
          outcomeSummary?: string;
        },
    opts: {
      operator?: string;
      outcomeSummary?: string;
    } = {}
  ): ActionExecutionResult {
    const inlineDesign = typeof input === 'object' && input !== null ? input.experimentDesign : undefined;
    const operator =
      typeof input === 'object' && input !== null
        ? input.operator ?? input.createdBy ?? opts.operator
        : opts.operator;
    const outcomeSummary =
      typeof input === 'object' && input !== null
        ? input.outcomeSummary ?? opts.outcomeSummary
        : opts.outcomeSummary;

    const design = inlineDesign ?? this.experimentDesigns.get(input as string);
    if (!design) {
      throw new Error(`ExperimentDesign 不存在：${typeof input === 'string' ? input : '<inline>'}`);
    }

    if (!inlineDesign) {
      this.experimentDesigns.save(design);
    } else if (!this.experimentDesigns.get(design.id)) {
      this.experimentDesigns.save(design);
    }

    const sourceStory = this.stories.get(design.baseEpisodeId);
    if (!sourceStory) {
      throw new Error(`source Episode 不存在：${design.baseEpisodeId}`);
    }

    const targetStory = this.stories.create({
      rawInput: `ActionExecution: ${design.recommendedAction}`,
      context: sourceStory.context,
      observationAtomIds: [],
      operator: operator ?? 'pipeline_action_execution',
    });

    const execution = createActionExecutionFromExperimentDesign(design, {
      targetEpisodeId: targetStory.id,
      observedOutcomeSummary: outcomeSummary ?? `Executed ${design.recommendedAction}`,
      createdBy: operator ?? 'pipeline_action_execution',
    });
    const outcomeRecord = createOutcomeRecord({
      episodeId: targetStory.id,
      causedByActionExecutionId: execution.id,
      status: 'partial',
      summary: execution.observedOutcomeSummary ?? `Executed ${design.recommendedAction}`,
      observedSignals: [],
      sideEffects: [],
      evidenceRefs: [],
      recordedBy: operator ?? 'pipeline_action_execution',
    });

    // 优先从真实 CounterfactualScenario.predictedOutcome 取 expectedSummary
    const cfId = design.basedOnCounterfactualIds?.[0];
    const cf = cfId ? this.counterfactualScenarios.get(cfId) : null;
    const expectedSummary =
      cf?.predictedOutcome && cf.predictedOutcome.trim() !== ''
        ? cf.predictedOutcome
        : 'missing counterfactual predictedOutcome';
    const actualSummary = outcomeRecord.summary;
    const predictionError = createPredictionError({
      basedOnCounterfactualId: design.basedOnCounterfactualIds?.[0],
      causedByActionExecutionId: execution.id,
      outcomeRecordId: outcomeRecord.id,
      errorKind: 'outcome',
      expectedSummary,
      actualSummary,
      deltaSummary: `expected: ${expectedSummary}; actual: ${actualSummary}`,
      severity: 'low',
      score: null,
      recordedBy: operator ?? 'pipeline_action_execution',
    });

    this.actionExecutions.save(execution);
    this.outcomeRecords.save(outcomeRecord);
    this.predictionErrors.save(predictionError);
    this.stories.recordExecution(sourceStory.id, execution.id);
    this.stories.resolve(targetStory.id, 'partial', execution.observedOutcomeSummary);

    // Slice 4: post-action snapshot + transition
    const sourceSnapshot = this.stateSnapshots.getLatestByEpisode(sourceStory.id);
    const targetSnapshot = createStateSnapshot({
      episodeId: targetStory.id,
      t: 1,
      values: {
        actionRef: design.recommendedAction,
        executionStatus: execution.executionStatus,
        outcomeSummary: outcomeRecord.summary,
      },
      createdBy: operator ?? 'pipeline_action_execution',
    });
    this.stateSnapshots.save(targetSnapshot);

    let transition: Transition | null = null;
    if (sourceSnapshot) {
      transition = createTransition({
        episodeId: targetStory.id,
        fromSnapshotId: sourceSnapshot.id,
        toSnapshotId: targetSnapshot.id,
        causedByActionId: execution.id,
        candidateMechanismIds: [],
        createdBy: operator ?? 'pipeline_action_execution',
      });
      this.transitions.save(transition);
    }

    const resolvedSourceEpisode = toEpisode(this.stories.get(sourceStory.id) ?? sourceStory);
    const resolvedTargetEpisode = {
      ...toEpisode(this.stories.get(targetStory.id) ?? targetStory),
      outcomeRecordId: outcomeRecord.id,
    };

    // 最小规则：PredictionError → ProgramRevisionProposal
    let programRevisionProposal: ProgramRevisionProposal | null = null;
    {
      const ek = predictionError.errorKind;
      if (ek === 'observation') {
        // 确认目标 ObservationModel 可 resolve
        if (this.observationModels.get(DEFAULT_OBSERVATION_MODEL_ID)) {
          programRevisionProposal = createProgramRevisionProposal({
            basedOnPredictionErrorIds: [predictionError.id],
            targetKind: 'observation_model',
            targetRef: DEFAULT_OBSERVATION_MODEL_ID,
            proposedChangeKind: 'observation_mapping_adjustment',
            rationale: `observation 偏差（${predictionError.id}）提示观测映射需调整`,
            createdBy: operator ?? 'pipeline_action_execution',
          });
          this.programRevisionProposals.save(programRevisionProposal);
        }
      } else if (ek === 'transition' || ek === 'outcome') {
        // 确认目标 MechanismProgram 可 resolve
        if (this.mechanismPrograms.get(DEFAULT_MECHANISM_PROGRAM_ID)) {
          programRevisionProposal = createProgramRevisionProposal({
            basedOnPredictionErrorIds: [predictionError.id],
            targetKind: 'mechanism_program',
            targetRef: DEFAULT_MECHANISM_PROGRAM_ID,
            proposedChangeKind: 'validity_narrowing',
            rationale: `${ek} 偏差（${predictionError.id}）提示机制程序有效域需收窄`,
            createdBy: operator ?? 'pipeline_action_execution',
          });
          this.programRevisionProposals.save(programRevisionProposal);
        }
      }
      // context / unknown → 不生成 proposal
    }

    return {
      design,
      execution,
      actionExecution: execution,
      outcomeRecord,
      predictionError,
      sourceEpisode: resolvedSourceEpisode,
      targetEpisode: resolvedTargetEpisode,
      episode: resolvedTargetEpisode,
      sourceSnapshot,
      targetSnapshot,
      transition,
      programRevisionProposal,
    };
  }

  // ===========================================================================
  // getStats
  // ===========================================================================

  /**
   * 获取管道整体统计信息
   */
  getStats(): PipelineStats {
    const gs  = this.graph.getStats();
    const ss  = this.stories.getStats();
    const es  = this.evidence.getStats();
    const ps  = this.problemClasses.getStats();
    const pts = this.patterns.getStats();
    const rv  = this.rvBuilder.buildAll();
    const hs  = this.hypotheses.getStats();

    return {
      graph: {
        atomCount:     gs.atomCount,
        refCount:      gs.refCount,
        shortcutCount: gs.shortcutCount,
      },
      stories: {
        total:      ss.total,
        resolved:   ss.byStatus?.['resolved'] ?? 0,
        uncompiled: ss.uncompiledCount,
      },
      evidence: {
        total:       es.total,
        supports:    es.byVerdict?.supports    ?? 0,
        contradicts: es.byVerdict?.contradicts ?? 0,
      },
      problemClasses: ps.problemClassCount,
      templates:      pts.templateCount,
      regulations:    rv.length,
      hypotheses: {
        total:           hs.total,
        open:            hs.byStatus?.['open']      ?? 0,
        validated:       hs.byStatus?.['validated'] ?? 0,
        readyForCompile: hs.readyForCompile,
      },
      mechanismInstances: this.mechanismInstances.getStats(),
      derivationTraces:   this.derivationTraces.getStats(),
      episodeEvents:      this.episodeEvents.getStats(),
      supportLinks:       this.supportLinks.getStats(),
      observationRecords: this.observationRecords.getStats(),
      observationModels:  this.observationModels.getStats(),
      mechanismPrograms:       this.mechanismPrograms.getStats(),
      counterfactualScenarios: this.counterfactualScenarios.getStats(),
      experimentDesigns:       this.experimentDesigns.getStats(),
      actionExecutions:   this.actionExecutions.getStats(),
      outcomeRecords:     this.outcomeRecords.getStats(),
      predictionErrors:   this.predictionErrors.getStats(),
      stateSnapshots:          this.stateSnapshots.getStats(),
      transitions:             this.transitions.getStats(),
      programRevisionProposals: this.programRevisionProposals.getStats(),
      validityEnvelopes:        this.validityEnvelopes.getStats(),
      reviewDecisions:          this.reviewDecisions.getStats(),
    };
  }

  // ===========================================================================
  // v13 G5: 记录被剪掉的真实分支
  // ===========================================================================

  /**
   * 记录一条被剪掉的真实分支（PrunedBranchRecord）
   *
   * v13 G5：失败不是目的，而是被剪掉的可能性空间。
   * 每当一条分支因 failure / institution / design / physics 被 possibility space
   * 剪掉，调用方应显式登记一条 PBR，保留"它曾经真实存在"的审计痕迹。
   *
   * 最小上游依赖：必须绑定到剪枝发生时的 PresentSlice ID，保证 lineage 可追溯。
   *
   * @param input 分支描述 + 剪枝理由 + PresentSliceRef 等（见 CreatePrunedBranchRecordInput）
   * @returns 已持久化的 PrunedBranchRecord
   */
  recordPrunedBranch(
    input: CreatePrunedBranchRecordInput,
  ): { prunedBranchRecord: PrunedBranchRecord } {
    const record = createPrunedBranchRecord(input);
    this.prunedBranchRecords.save(record);
    return { prunedBranchRecord: record };
  }

  // ===========================================================================
  // close
  // ===========================================================================

  /**
   * 关闭所有数据库连接
   */
  close(): void {
    this.graph.close();
    this.stories.close();
    this.evidence.close();
    this.problemClasses.close();
    this.patterns.close();
    this.hypotheses.close();
    this.mechanismInstances.close();
    this.derivationTraces.close();
    this.episodeEvents.close();
    this.supportLinks.close();
    this.observationRecords.close();
    this.observationModels.close();
    this.mechanismClasses.close();
    this.mechanismPrograms.close();
    this.counterfactualScenarios.close();
    this.experimentDesigns.close();
    this.actionExecutions.close();
    this.outcomeRecords.close();
    this.predictionErrors.close();
    this.stateSnapshots.close();
    this.transitions.close();
    this.programRevisionProposals.close();
    this.validityEnvelopes.close();
    this.reviewDecisions.close();
    this.failureBoundaryArchives.close();
    this.reconstructions.close();
    this.branchPoints.close();
    this.presentSlices.close();
    this.historicalCompressionRecords.close();
    this.lineageCompileProposals.close();
    this.prunedBranchRecords.close();
    // rvBuilder 不拥有独立 DB 连接，无需单独关闭
  }

  /**
   * 第一轮最小去 proxy：统一锚到真实默认 MechanismClass。
   * 只维护主链身份与最小 supporting_episode_ids，不扩展 promotion/merge 语义。
   */
  private ensurePathProjectionMechanismClass(episodeId: string): MechanismClass {
    const base = this.mechanismClasses.get(DEFAULT_MECHANISM_CLASS_ID) ?? createDefaultMechanismClass();
    const mechanismClass = base.supporting_episode_ids.includes(episodeId)
      ? base
      : {
          ...base,
          supporting_episode_ids: [...base.supporting_episode_ids, episodeId],
        };

    const withProgramRef = mechanismClass.mechanismProgramIds.includes(DEFAULT_MECHANISM_PROGRAM_ID)
      ? mechanismClass
      : {
          ...mechanismClass,
          mechanismProgramIds: [...mechanismClass.mechanismProgramIds, DEFAULT_MECHANISM_PROGRAM_ID],
        };

    this.mechanismClasses.save(withProgramRef);
    return this.mechanismClasses.get(DEFAULT_MECHANISM_CLASS_ID) ?? withProgramRef;
  }

  private classifyBestEffort(input: string, phase: 'submitObservation' | 'search'): ClassifyResult | undefined {
    try {
      const results = this.problemClasses.classify(input);
      return results.length > 0 ? results[0] : undefined;
    } catch (error) {
      this.warnBestEffortFailure(`${phase}.classify`, error, { input });
      return undefined;
    }
  }

  private warnBestEffortFailure(step: string, error: unknown, details: Record<string, unknown> = {}): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[CausalPipeline] ${step} best-effort 失败: ${message}`, details);
  }
}
