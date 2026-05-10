/**
 * Core module exports for the Causal Learner MCP Server
 */

// Types
export type {
  Json,
  Fact,
  Evidence,
  Origin,
  ExplanationAttempt,
  FailureReason,
  Observation,
  Regulation,
  RegulationStatus,
  Story,
  Event,
  EventStatus,
  StorageStats,
  TestResult,
  // v7 §3.3 Conclusion（§10 条件 5）
  Conclusion,
  // v7 §3.2 Episode 支撑类型
  ObservationRecord,
  StateSnapshot,
  ActionExecution,
  Transition,
  OutcomeRecord,
  PredictionError,
  // v7 Claim Space
  Claim,
  SupportLink,
  // v7 DerivationTrace
  DerivationNodeKind,
  DerivationRelation,
  NodeRef,
  DerivationStep,
  DerivationTrace,
  // v7 Fidelity utility
  FidelityGrade,
} from './types.js';

export {
  factSignature,
  factToDict,
  factFromDict,
  evidenceToDict,
  evidenceFromDict,
  originToDict,
  originFromDict,
  explanationAttemptToDict,
  explanationAttemptFromDict,
  observationGoals,
  observationToDict,
  observationFromDict,
  regulationToDict,
  regulationFromDict,
  storyToAttempt,
  eventToDict,
  eventFromDict,
  // v7 Fidelity utility
  fidelityGrade,
} from './types.js';

// Unification
export type { Bindings } from './unify.js';

export {
  isVar,
  isWildcard,
  unifyArgs,
  unifyFact,
  substituteFact,
  factEntails,
  signaturePredValue,
  signatureFull,
  dedupFacts,
} from './unify.js';

// Explainer
export type { ExplainOptions } from './explainer.js';

export {
  DEFAULT_EXPLAIN_OPTIONS,
  ruleScore,
  explainObservation,
  EffectIndex,
} from './explainer.js';

// Detector
export type {
  DetectOptions,
  DetectResult,
} from './detector.js';

export {
  DEFAULT_DETECT_OPTIONS,
  detectEvent,
  processObservation,
} from './detector.js';

// Storage
export type {
  ListEventsOptions,
  ListRegulationsOptions,
} from './storage.js';

export {
  CausalStorage,
  SqliteCausalStorage,
  createStorage,
  createMemoryStorage,
  createFileStorage,
} from './storage.js';

// Dual-layer Storage (short-term + long-term)
export type {
  FlushResult,
  DualStorageStats,
  DualStorageOptions,
  LoadRelevantResult,
} from './dual-storage.js';

export {
  DualLayerStorage,
  createDualStorage,
} from './dual-storage.js';

// Inducer
export type { InduceOptions, ClusterStats } from './inducer.js';

export {
  DEFAULT_INDUCE_OPTIONS,
  clusterEvents,
  induceRegulation,
  induceFromEvents,
  analyzeCluster,
} from './inducer.js';

// Validator
export type {
  ValidationResult,
  ValidateOptions,
  EvidenceSummary,
} from './validator.js';

export {
  DEFAULT_VALIDATE_OPTIONS,
  PROMOTION_THRESHOLDS,
  validateCandidate,
  validateWithObservation,
  promoteOrDemote,
  getEvidenceSummary,
} from './validator.js';

// Keywords (Phase 1: Search engine approach)
export type {
  Keyword,
  Document,
} from './keywords.js';

export {
  extractKeywords,
  extractKeywordsWithTFIDF,
  keywordSimilarity,
  clusterByKeywords,
  discoverPredicatesFromCluster,
  extractErrorPatterns,
  extractHybridFeatures,
} from './keywords.js';

// Fuzzy Matcher (模糊匹配 - 参考 Sirchmunk RapidFuzz)
export type {
  FuzzyMatchResult,
  FuzzyMatchOptions,
  RelevanceScoreOptions,
} from './fuzzy-matcher.js';

export {
  levenshteinDistance,
  tokenSetRatio,
  FuzzyMatcher,
  calculateRelevanceScore,
  fuzzyMatchRegulations,
  fuzzyMatchEvents,
} from './fuzzy-matcher.js';

// Knowledge Cluster (知识聚类 - 参考 Sirchmunk KnowledgeCluster)
export {
  ClusterLifecycle,
  AbstractionLevel,
  KnowledgeClusterStorage,
  buildClusterFromRegulations,
  buildClusterFromEvidence,
} from './knowledge-cluster.js';

export type {
  EvidenceRef,
  WeakSemanticEdge,
  ClusterConstraint,
  KnowledgeCluster,
} from './knowledge-cluster.js';

// Monte Carlo Sampler (蒙特卡洛证据采样 - 参考 Sirchmunk MonteCarloEvidenceSampling)
export type {
  SampleWindow,
  RoiResult,
  SamplerConfig,
  ScorerFn,
} from './monte-carlo-sampler.js';

export {
  MonteCarloSampler,
  keywordScorer,
} from './monte-carlo-sampler.js';

// AtomGraph (v5 真相层 - 卡片盒知识图谱 + 双模式引擎)
export {
  AtomKind,
  RefKind,
  AtomGraph,
} from './atom-graph.js';

export type {
  RefMode,
  Atom,
  Ref,
  Shortcut,
  PathResult,
  ExploreResult,
  CompileResult,
  GraphStats,
} from './atom-graph.js';

// ReAct Search Agent (ReAct 搜索代理 - 参考 Sirchmunk ReActSearchAgent)
export type {
  ToolSchema,
  ToolResult,
  SearchTool,
  ReActConfig,
  ReasonerFn,
} from './react-search.js';

export {
  createSearchContext,
  ToolRegistry,
  RegulationSearchTool,
  EventSearchTool,
  KnowledgeQueryTool,
  CausalAnalysisTool,
  ReActSearchAgent,
  parseToolCall,
  extractAnswer,
  buildToolDescriptions,
  ruleBasedReasoner,
} from './react-search.js';

// Story / Case (学习样本 + ContextScope 工具)
export type {
  ContextScope,
  StoryPath,
  StoryStatus,
  InitialConditions,
  Episode,
  Story as CaseStory,
} from './story.js';

export {
  scopeContains,
  scopeOverlaps,
  scopeMerge,
  scopeToJson,
  scopeFromJson,
  StoryStorage,
  toEpisode,
} from './story.js';

// Reconstruction / Ontology Update (v7 compatible derivation-space objects)
export type {
  ReconstructedStepKind,
  ReconstructedStep,
  FidelityScore,
  AcceptedReconstruction,
  // v13 Minimal Sufficient Provenance 雏形（schema v3）
  ProvenanceSegment,
  MinimalityJustification,
  UnresolvedGap,
} from './reconstruction.js';

// DerivationTrace (v7 §3.3 推导链 — 原 DerivationChain)
export {
  findChainBreak,
  computeChainIntegrity,
  createDerivationTrace,
} from './derivation-trace.js';

export {
  createAcceptedReconstruction,
} from './reconstruction.js';

export type {
  OntologyChangeAction,
  OntologyChange,
  FidelityRegressionCheck,
  RegressionDetail,
  OntologyDeltaKind,
  OntologyDelta,
  NoUpdateReasonPayload,
} from './ontology-delta.js';

export {
  createRegressionCheck,
  createOntologyDelta,
  createOntologyDeltaNone,
  buildRelationChange,
  createOntologyDeltaFromReviewAccept,
  createOntologyDeltaFromReviewReject,
} from './ontology-delta.js';

// Evidence (一等证据系统 - append-only)
export type {
  EvidenceSourceType,
  EvidenceRecord,
  EvidenceSummary as EvidenceStoreSummary,
} from './evidence.js';

export {
  EvidenceStore,
  recordSupport,
  recordContradiction,
  isEvidenceHealthy,
} from './evidence.js';

// ProblemClass + Strategy (问题路由器 + 理解协议)
export type {
  SubgraphConstraint,
  ProblemClass,
  ClassifyResult,
  StrategyStep,
  Strategy,
} from './problem-class.js';

export {
  ProblemClassRegistry,
} from './problem-class.js';

// Skill (可执行技能绑定层 - ACTION Atom → Skill 执行契约)
export type {
  SkillParam,
  SkillExecutionResult,
  Skill,
} from './skill.js';

export {
  SkillRegistry,
} from './skill.js';

// RegulationView (Regulation 降级为 compiled Ref 的只读投影)
export type {
  RegulationView,
  LegacyRegulation,
} from './regulation-view.js';

export {
  RegulationViewBuilder,
} from './regulation-view.js';

// RefAlgebra (v6 关系代数 - 态射签名、族群、复合规则)
export type {
  RefFamily,
  ComposeResult,
  RefTypeSpec,
  ComposeRule,
} from './ref-algebra.js';

export {
  RefAlgebra,
  getRefAlgebra,
  canCompose,
  isPathLegal,
  refFamily,
} from './ref-algebra.js';

// PatternTemplate (v6 小范畴模板 - 模式匹配、实例化、涌现)
export type {
  PatternSlot,
  PatternArrow,
  PatternTemplate,
  PatternInstance,
} from './pattern-template.js';

export {
  PatternEngine,
} from './pattern-template.js';

// Pipeline (编排管道 - 将所有模块连成闭环)
export type {
  PipelineConfig,
  ObservationInput,
  ObservationResult,
  FixInput,
  FixResult,
  ActionExecutionResult,
  PipelineStats,
} from './pipeline.js';

export {
  CausalPipeline,
} from './pipeline.js';

// Hypothesis (一等假设对象 - evidential→explanatory 跨层产物)
export type {
  InterventionOutcome,
  HypothesisStatus,
  HypothesisDerivation,
  HypothesisScope,
  Hypothesis,
} from './hypothesis.js';

export {
  HypothesisStore,
} from './hypothesis.js';

// MechanismClass (v7 本体层动力学模板)
export type {
  MechanismCompilationStatus,
  MechanismPhase,
  MechanismClass,
  ValidationResult as MechanismValidationResult,
  PromoteSuccess,
  PromoteNoPromotion,
  PromoteResult,
  DeprecateSuccess,
  DeprecateNoOp,
  DeprecateResult,
} from './mechanism-class.js';

export {
  createMechanismClass,
  createDefaultMechanismClass,
  DEFAULT_MECHANISM_CLASS_ID,
  promoteMechanismClass,
  deprecateMechanismClass,
  validateMechanismClass,
} from './mechanism-class.js';

export type {
  MechanismClassStoreStats,
} from './mechanism-class-store.js';

export {
  MechanismClassStore,
} from './mechanism-class-store.js';

// MechanismInstance (v7 经历层绑定实例 — MechanismClass × Episode)
export type {
  MechanismInstanceStatus,
  MechanismInstanceSourceKind,
  MechanismInstance,
} from './mechanism-instance.js';

export {
  createMechanismInstance,
  acceptInstance,
  rejectInstance,
  supersedeInstance,
} from './mechanism-instance.js';

// MechanismInstanceStore (SQLite 持久化层)
export type {
  MechanismInstanceStoreStats,
} from './mechanism-instance-store.js';

export {
  MechanismInstanceStore,
} from './mechanism-instance-store.js';

// DerivationTraceStore (SQLite 持久化层)
export type {
  DerivationTraceStoreStats,
} from './derivation-trace-store.js';

export {
  DerivationTraceStore,
} from './derivation-trace-store.js';

// EpisodeEventStore (Episode 轻量 timeline 持久化层)
export type {
  EpisodeEventKind,
  EpisodeEvent,
  EpisodeEventStoreStats,
} from './episode-event-store.js';

export {
  createEpisodeEvent,
  EpisodeEventStore,
} from './episode-event-store.js';

// SupportLinkStore (v7 证据边持久化层 — ObservationRecord → Claim)
export type {
  SupportLinkStoreStats,
} from './support-link-store.js';

export {
  SupportLinkStore,
} from './support-link-store.js';

// ObservationRecordStore (v7 观测记录持久化层 — SupportLink 起点锚定)
export type {
  ObservationRecordStoreStats,
} from './observation-record-store.js';

export {
  ObservationRecordStore,
} from './observation-record-store.js';

// ObservationModel + ObservationModelStore (v8 观测投影模型 — ObservationRecord 上游来源)
export type {
  ObservationSignalSpec,
  ObservationModel,
  CreateObservationModelInput,
} from './observation-model.js';

export {
  createObservationModel,
  createDefaultObservationModel,
  DEFAULT_OBSERVATION_MODEL_ID,
} from './observation-model.js';

export type {
  ObservationModelStoreStats,
} from './observation-model-store.js';

export {
  ObservationModelStore,
} from './observation-model-store.js';

// MechanismProgram + MechanismProgramStore (v7 机制程序对象 — MechanismClass 到 MechanismInstance 的桥)
export type {
  MechanismProgramPhase,
  MechanismProgram,
  CreateMechanismProgramInput,
} from './mechanism-program.js';

export {
  createMechanismProgram,
  createDefaultMechanismProgram,
  DEFAULT_MECHANISM_PROGRAM_ID,
} from './mechanism-program.js';

export type {
  MechanismProgramStoreStats,
} from './mechanism-program-store.js';

export {
  MechanismProgramStore,
} from './mechanism-program-store.js';
// CounterfactualScenario + CounterfactualScenarioStore (v8 反事实场景对象)
export type {
  CounterfactualAssumption,
  PredictedStep,
  CounterfactualScenario,
  CreateCounterfactualScenarioInput,
} from './counterfactual-scenario.js';

export {
  createCounterfactualScenario,
} from './counterfactual-scenario.js';

export type {
  CounterfactualScenarioStoreStats,
} from './counterfactual-scenario-store.js';

export {
  CounterfactualScenarioStore,
} from './counterfactual-scenario-store.js';

// ExperimentDesign + ExperimentDesignStore (v8 实验设计对象)
export type {
  ExperimentDesign,
  CreateExperimentDesignInput,
} from './experiment-design.js';

export {
  createExperimentDesign,
} from './experiment-design.js';

export type {
  ExperimentDesignStoreStats,
} from './experiment-design-store.js';

export {
  ExperimentDesignStore,
} from './experiment-design-store.js';

// ActionExecution + ActionExecutionStore (v8 最小执行桥)
export type {
  CreateActionExecutionInput,
} from './action-execution.js';

export {
  createActionExecution,
  createActionExecutionFromExperimentDesign,
} from './action-execution.js';

export type {
  ActionExecutionStoreStats,
} from './action-execution-store.js';

export {
  ActionExecutionStore,
} from './action-execution-store.js';

// OutcomeRecord + OutcomeRecordStore (v8 最小反馈对象)
export type {
  CreateOutcomeRecordInput,
} from './outcome-record.js';

export {
  createOutcomeRecord,
} from './outcome-record.js';

export type {
  OutcomeRecordStoreStats,
} from './outcome-record-store.js';

export {
  OutcomeRecordStore,
} from './outcome-record-store.js';

// PredictionError + PredictionErrorStore (v8 最小偏差对象)
export type {
  CreatePredictionErrorInput,
} from './prediction-error.js';

export {
  createPredictionError,
} from './prediction-error.js';

export type {
  PredictionErrorStoreStats,
} from './prediction-error-store.js';

export {
  PredictionErrorStore,
} from './prediction-error-store.js';

// StateSnapshot + StateSnapshotStore (v8 状态快照)
export type {
  CreateStateSnapshotInput,
} from './state-snapshot.js';

export {
  createStateSnapshot,
} from './state-snapshot.js';

export type {
  StateSnapshotStoreStats,
} from './state-snapshot-store.js';

export {
  StateSnapshotStore,
} from './state-snapshot-store.js';

// Transition + TransitionStore (v8 状态转移边)
export type {
  CreateTransitionInput,
} from './transition.js';

export {
  createTransition,
} from './transition.js';

export type {
  TransitionStoreStats,
} from './transition-store.js';

export {
  TransitionStore,
} from './transition-store.js';

// ProgramRevisionProposal + ProgramRevisionProposalStore (v8 偏差驱动模型修正提名)
export type {
  ProgramRevisionProposal,
  CreateProgramRevisionProposalInput,
} from './program-revision-proposal.js';

export {
  createProgramRevisionProposal,
  assertValidProgramRevisionProposal,
} from './program-revision-proposal.js';

export type {
  ProgramRevisionProposalStoreStats,
} from './program-revision-proposal-store.js';

export {
  ProgramRevisionProposalStore,
} from './program-revision-proposal-store.js';

// ValidityEnvelope + ValidityEnvelopeStore (P05 MechanismProgram 有效域对象)
export type {
  ValidityConfidenceBand,
  ValidityEnvelopeStatus,
  ValidityEnvelope,
  CreateValidityEnvelopeInput,
} from './validity-envelope.js';

export {
  createValidityEnvelope,
  assertValidValidityEnvelope,
  DEFAULT_VALIDITY_ENVELOPE_ID,
  createDefaultValidityEnvelope,
} from './validity-envelope.js';

export type {
  ValidityEnvelopeStoreStats,
} from './validity-envelope-store.js';

export {
  ValidityEnvelopeStore,
} from './validity-envelope-store.js';

// ReviewDecision + ReviewDecisionStore (P06 PRP review lane 裁决对象)
export type {
  ReviewDecisionKind,
  ReviewDecision,
  CreateReviewDecisionInput,
  AcceptResult,
  RejectResult,
  SupersedeResult,
} from './review-decision.js';

export {
  createReviewDecision,
  assertValidReviewDecision,
  acceptProposal,
  rejectProposal,
  supersedeProposal,
} from './review-decision.js';

export type {
  ReviewDecisionStoreStats,
} from './review-decision-store.js';

export {
  ReviewDecisionStore,
} from './review-decision-store.js';

// =============================================================================
// v8 运行时扩展（executePhasedProgram / inferCounterfactual）
// =============================================================================

export type {
  ExecutionContext,
  ProgramIntervention,
  PhaseExecutionResult,
  PhasedTrajectory,
} from './mechanism-program.js';

export {
  executePhasedProgram,
} from './mechanism-program.js';

export {
  inferCounterfactual,
} from './counterfactual-scenario.js';

// =============================================================================
// v9 OntologyFederation
// =============================================================================

export type {
  OntologyConcept,
  OntologyModel,
  CreateOntologyModelInput,
} from './ontology-model.js';

export {
  createOntologyModel,
} from './ontology-model.js';

export type {
  ConceptMapping,
  TranslationResult,
  TranslationFunctor,
  CreateTranslationFunctorInput,
} from './translation-functor.js';

export {
  createTranslationFunctor,
  translateAtomRef,
} from './translation-functor.js';

export type {
  ConflictKind,
  ConflictEntry,
  ConflictSet,
  CreateConflictSetInput,
} from './conflict-set.js';

export {
  createConflictSet,
  appendConflictEntry,
  resolveConflictEntry,
} from './conflict-set.js';

// =============================================================================
// v10 ParticipativeWorld
// =============================================================================

export type {
  InstrumentBias,
  ObserverModel,
  FilteredObservation,
  CreateObserverModelInput,
} from './observer-model.js';

export {
  createObserverModel,
  filterObservations,
  applyInstrumentBias,
} from './observer-model.js';

export type {
  InstitutionRule,
  RoleAssignment,
  InstitutionModel,
  PermissionCheckResult,
  CreateInstitutionModelInput,
} from './institution-model.js';

export {
  createInstitutionModel,
  checkRolePermission,
} from './institution-model.js';

// =============================================================================
// v11 CivilizationMemory
// =============================================================================

export type {
  FailureCost,
  BoundaryCondition,
  FailureRecord,
  FailureBoundaryArchive,
  CreateFailureBoundaryArchiveInput,
  AppendFailureRecordInput,
} from './failure-boundary-archive.js';

export {
  createFailureBoundaryArchive,
  appendFailureRecord,
  queryRecordsByCostKind,
  queryRecordsByVariable,
  checkBoundaryViolation,
} from './failure-boundary-archive.js';

export type {
  CounterexampleSeverity,
  CounterexampleEntry,
  CounterexampleCommons,
  CreateCounterexampleCommonsInput,
  AppendCounterexampleInput,
} from './counterexample-commons.js';

export {
  createCounterexampleCommons,
  appendCounterexample,
  markCounterexampleAbsorbed,
  searchActiveCounterexamples,
  searchBySeverity,
} from './counterexample-commons.js';

// =============================================================================
// v11 ReflexiveCivilizationEngine
// =============================================================================

export type {
  LineageNode,
  LineageCompleteness,
  ProofLineage,
  CreateProofLineageInput,
} from './proof-lineage.js';

export {
  createProofLineage,
  traceToLineageNode,
  buildProofLineage,
} from './proof-lineage.js';

export type {
  ConstraintKind,
  ConstraintCheckResult,
  ConstitutionalConstraint,
  ConstitutionalLayer,
  ConstitutionalAudit,
  CreateConstitutionalLayerInput,
} from './constitutional-layer.js';

export {
  createConstitutionalLayer,
  createDefaultConstitutionalLayer,
  STANDARD_CONSTRAINTS,
  auditSubject,
} from './constitutional-layer.js';

// =============================================================================
// v13 PresentSlice（当前观测面 — lineage-centered 桥接对象）
// =============================================================================

export type {
  PresentSlice,
  CreatePresentSliceInput,
  PipelineSnapshot,
} from './present-slice.js';

export {
  createPresentSlice,
  buildPresentSliceFromPipeline,
} from './present-slice.js';

export type {
  PresentSliceStoreStats,
} from './present-slice-store.js';

export {
  PresentSliceStore,
} from './present-slice-store.js';

// =============================================================================
// v13 PrunedBranchRecord（被剪掉的真实分支 — Failure as Pruned Possibility Space）
// =============================================================================

export type {
  PrunedBranchRecord,
  PruneReason,
  CreatePrunedBranchRecordInput,
} from './pruned-branch-record.js';

export {
  createPrunedBranchRecord,
  assertValidPrunedBranchRecord,
} from './pruned-branch-record.js';

export type {
  PrunedBranchRecordStoreStats,
} from './pruned-branch-record-store.js';

export {
  PrunedBranchRecordStore,
} from './pruned-branch-record-store.js';

// =============================================================================
// v13 HistoricalCompressionRecord（历史压缩行为的显式记录）
// =============================================================================

export type {
  HistoricalCompressionRecord,
  CreateHistoricalCompressionRecordInput,
} from './historical-compression-record.js';

export {
  createHistoricalCompressionRecord,
  assertValidCompressionRecord,
} from './historical-compression-record.js';

export type {
  HistoricalCompressionRecordStoreStats,
} from './historical-compression-record-store.js';

export {
  HistoricalCompressionRecordStore,
} from './historical-compression-record-store.js';

// =============================================================================
// v13 LineageCompileProposal（谱系编译提案 — Institutional Compile Layer）
// =============================================================================

export type {
  LineageCompileProposalStatus,
  ProposedRefChange,
  LineageCompileProposal,
  CreateLineageCompileProposalInput,
} from './lineage-compile-proposal.js';

export {
  createLineageCompileProposal,
  assertValidLineageCompileProposal,
  transitionProposalStatus,
  challengeProposal,
  approveProposal,
  rejectProposal as rejectLineageProposal,
  applyProposal,
  rollbackProposal,
} from './lineage-compile-proposal.js';

export type {
  LineageCompileProposalStoreStats,
} from './lineage-compile-proposal-store.js';

export {
  LineageCompileProposalStore,
} from './lineage-compile-proposal-store.js';

// =============================================================================
// Refutation（DoWhy 风格反驳测试 — regulation 归纳后自动验证）
// =============================================================================

export type {
  RefutationTest,
  RefutationResult,
  RefutationOptions,
} from './refutation.js';

export {
  refuteRegulation,
} from './refutation.js';

// =============================================================================
// Provenance Semiring（Scallop 风格 top-k probability semiring）
// =============================================================================

export type {
  ProvenanceSemiring,
  ProvenanceTag,
  TopKProofs,
  ScoredStory,
  ScoredExplainOptions,
} from './provenance-semiring.js';

export {
  BooleanSemiring,
  ProbabilitySemiring,
  TopKSemiring,
  scoredExplain,
  createBooleanSemiring,
  createProbabilitySemiring,
  createTopKSemiring,
} from './provenance-semiring.js';

// =============================================================================
// Local Embedding（Transformers.js — 完全本地，无需 API key）
// =============================================================================

export {
  LocalEmbedding,
  warmupEmbeddings,
  EMBEDDING_MODELS,
} from './embedding.js';

export type {
  EmbeddingModelName,
  EmbeddingResult,
} from './embedding.js';
