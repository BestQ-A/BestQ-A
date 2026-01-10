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
