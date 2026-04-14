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
  PromoteSuccess,
  PromoteNoPromotion,
  PromoteResult,
  ValidationResult as MechanismValidationResult,
} from './mechanism-class.js';

export {
  createMechanismClass,
  promoteMechanismClass,
  validateMechanismClass,
} from './mechanism-class.js';

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
