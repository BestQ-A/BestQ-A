/**
 * Core types for the Causal Learner system
 *
 * This module defines the fundamental data structures for causal learning:
 * - Facts: predicates with arguments and values
 * - Observations: collections of facts with context
 * - Regulations: causal rules with preconditions and effects
 * - Events: unexplained observations requiring explanation
 * - Stories: explanatory chains of regulations
 */

export type Json = Record<string, unknown>;

// =============================================================================
// Fact
// =============================================================================

/**
 * A predicate fact: pred(args) == value
 *
 * - pred: predicate name (string)
 * - args: dict of arguments (values can be concrete, variables like '?x', or wildcard '*')
 * - value: typically bool, but can be string/number/enum
 */
export interface Fact {
  pred: string;
  value: unknown;
  args?: Record<string, unknown>;
}

/**
 * Create a signature string for a fact (for deduplication/matching)
 */
export function factSignature(f: Fact, includeArgs = true): string {
  if (includeArgs) {
    const sortedArgs = Object.entries(f.args || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${JSON.stringify(v)}`)
      .join(',');
    return `${f.pred}|${sortedArgs}|${JSON.stringify(f.value)}`;
  }
  return `${f.pred}|${JSON.stringify(f.value)}`;
}

/**
 * Convert fact to dict representation (snake_case for JSON serialization)
 */
export function factToDict(f: Fact): Json {
  const d: Json = { pred: f.pred, value: f.value };
  if (f.args && Object.keys(f.args).length > 0) {
    d.args = { ...f.args };
  }
  return d;
}

/**
 * Create a Fact from a dict
 */
export function factFromDict(d: Json): Fact {
  return {
    pred: d.pred as string,
    value: d.value,
    args: { ...((d.args as Record<string, unknown>) || {}) },
  };
}

// =============================================================================
// Evidence
// =============================================================================

/**
 * Evidence supporting or refuting a regulation
 */
export interface Evidence {
  kind: 'observational' | 'intervention' | 'quasi_experiment';
  supportN: number;
  counterexampleN: number;
  explainedCount: number;
  failedPredictions: number;
  lastUsed?: string;
}

/**
 * Convert Evidence to dict representation
 */
export function evidenceToDict(e: Evidence): Json {
  const result: Json = {
    kind: e.kind,
    support_n: e.supportN,
    counterexample_n: e.counterexampleN,
    explained_count: e.explainedCount,
    failed_predictions: e.failedPredictions,
  };
  if (e.lastUsed) {
    result.last_used = e.lastUsed;
  }
  return result;
}

/**
 * Create Evidence from dict
 */
export function evidenceFromDict(d: Json): Evidence {
  return {
    kind: (d.kind as Evidence['kind']) || 'observational',
    supportN: Number(d.support_n || 0),
    counterexampleN: Number(d.counterexample_n || 0),
    explainedCount: Number(d.explained_count || 0),
    failedPredictions: Number(d.failed_predictions || 0),
    lastUsed: d.last_used as string | undefined,
  };
}

// =============================================================================
// Origin
// =============================================================================

/**
 * Origin information for a regulation (how it was induced)
 */
export interface Origin {
  inducedFromEvents?: string[];
  inducedAt?: string;
  inducedMethod?: string;
  source?: string;
  created?: string;
  clusterId?: string;
  eventId?: string;
  eventIds?: string[];
  fixCommit?: string;
  sampleSize?: number;
}

/**
 * Convert Origin to dict
 */
export function originToDict(o: Origin): Json {
  const result: Json = {};
  if (o.inducedFromEvents && o.inducedFromEvents.length > 0) {
    result.induced_from_events = [...o.inducedFromEvents];
  }
  if (o.inducedAt) {
    result.induced_at = o.inducedAt;
  }
  if (o.inducedMethod) {
    result.induced_method = o.inducedMethod;
  }
  if (o.source) {
    result.source = o.source;
  }
  if (o.created) {
    result.created = o.created;
  }
  if (o.clusterId) {
    result.cluster_id = o.clusterId;
  }
  if (o.eventId) {
    result.event_id = o.eventId;
  }
  if (o.eventIds && o.eventIds.length > 0) {
    result.event_ids = [...o.eventIds];
  }
  if (o.fixCommit) {
    result.fix_commit = o.fixCommit;
  }
  if (o.sampleSize !== undefined) {
    result.sample_size = o.sampleSize;
  }
  return result;
}

/**
 * Create Origin from dict
 */
export function originFromDict(d: Json): Origin {
  return {
    inducedFromEvents: d.induced_from_events as string[] | undefined,
    inducedAt: d.induced_at as string | undefined,
    inducedMethod: d.induced_method as string | undefined,
    source: d.source as string | undefined,
    created: d.created as string | undefined,
    clusterId: d.cluster_id as string | undefined,
    eventId: d.event_id as string | undefined,
    eventIds: d.event_ids as string[] | undefined,
    fixCommit: d.fix_commit as string | undefined,
    sampleSize: d.sample_size as number | undefined,
  };
}

// =============================================================================
// ExplanationAttempt
// =============================================================================

/**
 * Failure reason for an explanation attempt
 */
export type FailureReason =
  | 'low_score'
  | 'pre_not_satisfied'
  | 'no_covering_rule'
  | 'conflict'
  | 'unknown';

/**
 * An attempt to explain an event using a regulation
 */
export interface ExplanationAttempt {
  regulationId: string;
  score: number;
  failureReason: FailureReason;
  missingPres?: Fact[];
  assumptions?: Fact[];
  uncoveredGoals?: Fact[];
  usedRules?: string[];
  storyline?: string[];
  notes?: string;
}

/**
 * Convert ExplanationAttempt to dict
 */
export function explanationAttemptToDict(e: ExplanationAttempt): Json {
  const result: Json = {
    regulation_id: e.regulationId,
    score: e.score,
    failure_reason: e.failureReason,
  };
  if (e.usedRules && e.usedRules.length > 0) {
    result.used_rules = [...e.usedRules];
  }
  if (e.missingPres && e.missingPres.length > 0) {
    result.missing_pres = e.missingPres.map(factToDict);
  }
  if (e.assumptions && e.assumptions.length > 0) {
    result.assumptions = e.assumptions.map(factToDict);
  }
  if (e.uncoveredGoals && e.uncoveredGoals.length > 0) {
    result.uncovered_goals = e.uncoveredGoals.map(factToDict);
  }
  if (e.storyline && e.storyline.length > 0) {
    result.storyline = [...e.storyline];
  }
  if (e.notes) {
    result.notes = e.notes;
  }
  return result;
}

/**
 * Create ExplanationAttempt from dict
 */
export function explanationAttemptFromDict(d: Json): ExplanationAttempt {
  return {
    regulationId: d.regulation_id as string,
    score: Number(d.score || 0),
    failureReason: (d.failure_reason as FailureReason) || 'unknown',
    usedRules: d.used_rules as string[] | undefined,
    missingPres: d.missing_pres
      ? (d.missing_pres as Json[]).map(factFromDict)
      : undefined,
    assumptions: d.assumptions
      ? (d.assumptions as Json[]).map(factFromDict)
      : undefined,
    uncoveredGoals: d.uncovered_goals
      ? (d.uncovered_goals as Json[]).map(factFromDict)
      : undefined,
    storyline: d.storyline as string[] | undefined,
    notes: d.notes as string | undefined,
  };
}


// =============================================================================
// Observation
// =============================================================================

/**
 * An observation containing facts and context
 */
export interface Observation {
  observationId: string;
  timestamp: string;
  facts: Fact[];
  context?: Record<string, unknown>;
  focusFacts?: Fact[];
  rawRefs?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Get the goals (facts to explain) from an observation
 */
export function observationGoals(obs: Observation): Fact[] {
  return obs.focusFacts !== undefined ? obs.focusFacts : obs.facts;
}

/**
 * Convert observation to dict
 */
export function observationToDict(obs: Observation): Json {
  const result: Json = {
    observation_id: obs.observationId,
    timestamp: obs.timestamp,
    context: obs.context || {},
    facts: obs.facts.map(factToDict),
  };
  if (obs.focusFacts !== undefined) {
    result.focus_facts = obs.focusFacts.map(factToDict);
  }
  if (obs.rawRefs && obs.rawRefs.length > 0) {
    result.raw_refs = [...obs.rawRefs];
  }
  if (obs.metadata && Object.keys(obs.metadata).length > 0) {
    result.metadata = { ...obs.metadata };
  }
  return result;
}

/**
 * Create Observation from dict
 */
export function observationFromDict(d: Json): Observation {
  const focusFactsRaw = d.focus_facts as Json[] | undefined;
  return {
    observationId: d.observation_id as string,
    timestamp: d.timestamp as string,
    context: { ...((d.context as Record<string, unknown>) || {}) },
    facts: ((d.facts as Json[]) || []).map(factFromDict),
    focusFacts: focusFactsRaw ? focusFactsRaw.map(factFromDict) : undefined,
    rawRefs: [...((d.raw_refs as string[]) || [])],
    metadata: { ...((d.metadata as Record<string, unknown>) || {}) },
  };
}

// =============================================================================
// Regulation
// =============================================================================

/**
 * Regulation status type
 */
export type RegulationStatus =
  | 'candidate'
  | 'hypothesis'
  | 'confirmed'
  | 'retired';

/**
 * A causal regulation (rule): pre -> eff
 */
export interface Regulation {
  regulationId: string;
  status: RegulationStatus;
  pre: Fact[];
  eff: Fact[];
  evidenceKind?: 'observational' | 'intervention' | 'quasi_experiment';
  supportN?: number;
  counterexampleN?: number;
  explainedCount?: number;
  failedPredictions?: number;
  lastUsed?: string;
  scope?: Record<string, unknown>;
  description?: string;
  cost?: number;
  risk?: number;
  origin?: Origin;
  nextTests?: Record<string, unknown>[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Convert regulation to dict
 */
export function regulationToDict(r: Regulation): Json {
  const result: Json = {
    regulation_id: r.regulationId,
    status: r.status,
    pattern: {
      pre: r.pre.map(factToDict),
      eff: r.eff.map(factToDict),
    },
    origin: r.origin ? originToDict(r.origin) : {},
    evidence: {
      kind: r.evidenceKind || 'observational',
      explained_count: r.explainedCount || 0,
      failed_predictions: r.failedPredictions || 0,
      support_n: r.supportN || 0,
      counterexample_n: r.counterexampleN || 0,
    },
    cost: r.cost ?? 1.0,
    risk: r.risk ?? 1.0,
  };

  if (r.description) result.description = r.description;
  if (r.scope && Object.keys(r.scope).length > 0) result.scope = { ...r.scope };
  if (r.lastUsed) (result.evidence as Json).last_used = r.lastUsed;
  if (r.nextTests && r.nextTests.length > 0)
    result.next_tests = [...r.nextTests];
  if (r.tags && r.tags.length > 0) result.tags = [...r.tags];
  if (r.metadata && Object.keys(r.metadata).length > 0)
    result.metadata = { ...r.metadata };

  return result;
}

/**
 * Create Regulation from dict
 */
export function regulationFromDict(d: Json): Regulation {
  const pat = (d.pattern as Json) || {};
  const ev = (d.evidence as Json) || {};
  const originRaw = d.origin as Json | undefined;

  return {
    regulationId: d.regulation_id as string,
    status: (d.status as RegulationStatus) || 'hypothesis',
    description: (d.description as string) || '',
    pre: ((pat.pre as Json[]) || []).map(factFromDict),
    eff: ((pat.eff as Json[]) || []).map(factFromDict),
    evidenceKind: (ev.kind as Regulation['evidenceKind']) || 'observational',
    supportN: Number(ev.support_n || 0),
    counterexampleN: Number(ev.counterexample_n || 0),
    explainedCount: Number(ev.explained_count || 0),
    failedPredictions: Number(ev.failed_predictions || 0),
    lastUsed: ev.last_used as string | undefined,
    scope: { ...((d.scope as Record<string, unknown>) || {}) },
    origin:
      originRaw && Object.keys(originRaw).length > 0
        ? originFromDict(originRaw)
        : undefined,
    cost: Number(d.cost ?? 1.0),
    risk: Number(d.risk ?? 1.0),
    nextTests: [...((d.next_tests as Record<string, unknown>[]) || [])],
    tags: [...((d.tags as string[]) || [])],
    metadata: { ...((d.metadata as Record<string, unknown>) || {}) },
  };
}


// =============================================================================
// Story
// =============================================================================

/**
 * An explanatory storyline: a chain of regulations plus missing preconditions (assumptions)
 */
export interface Story {
  regulationIds: string[];
  assumptions?: Fact[];
  score?: number;
  notes?: string;
}

/**
 * Convert story to an attempt record
 */
export function storyToAttempt(
  story: Story,
  regulationId: string,
  failureReason: FailureReason,
  missingPres: Fact[],
  uncoveredGoals: Fact[]
): Json {
  const result: Json = {
    regulation_id: regulationId,
    score: story.score || 0,
    failure_reason: failureReason,
    used_rules: [...story.regulationIds],
    missing_pres: missingPres.map(factToDict),
    assumptions: (story.assumptions || []).map(factToDict),
    uncovered_goals: uncoveredGoals.map(factToDict),
    storyline: [...story.regulationIds],
  };
  if (story.notes) result.notes = story.notes;
  return result;
}

// =============================================================================
// Event
// =============================================================================

/**
 * Event status type
 */
export type EventStatus = 'open' | 'clustered' | 'resolved' | 'archived';

/**
 * An unexplained event requiring explanation
 */
export interface Event {
  eventId: string;
  timestamp: string;
  observation: Observation;
  attemptedExplanations: ExplanationAttempt[];
  unexplainedAspects: Fact[];
  context?: Record<string, unknown>;
  status?: EventStatus;
  clusterId?: string;
  tags?: string[];
  notes?: string;
}

/**
 * Convert event to dict
 */
export function eventToDict(e: Event): Json {
  const result: Json = {
    event_id: e.eventId,
    timestamp: e.timestamp,
    status: e.status || 'open',
    context: e.context || {},
    observation: observationToDict(e.observation),
    attempted_explanations: e.attemptedExplanations.map(
      explanationAttemptToDict
    ),
    unexplained_aspects: e.unexplainedAspects.map(factToDict),
  };
  if (e.clusterId) result.cluster_id = e.clusterId;
  if (e.tags && e.tags.length > 0) result.tags = [...e.tags];
  if (e.notes) result.notes = e.notes;
  return result;
}

/**
 * Create Event from dict
 */
export function eventFromDict(d: Json): Event {
  const obsRaw = d.observation;
  if (typeof obsRaw !== 'object' || obsRaw === null) {
    throw new Error('Event.fromDict expects embedded observation object');
  }

  const attemptsRaw = (d.attempted_explanations as Json[]) || [];

  return {
    eventId: d.event_id as string,
    timestamp: d.timestamp as string,
    status: (d.status as EventStatus) || 'open',
    clusterId: d.cluster_id as string | undefined,
    context: { ...((d.context as Record<string, unknown>) || {}) },
    observation: observationFromDict(obsRaw as Json),
    attemptedExplanations: attemptsRaw.map(explanationAttemptFromDict),
    unexplainedAspects: ((d.unexplained_aspects as Json[]) || []).map(
      factFromDict
    ),
    tags: [...((d.tags as string[]) || [])],
    notes: (d.notes as string) || '',
  };
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Storage statistics
 */
export interface StorageStats {
  observationCount: number;
  eventCount: number;
  regulationCount: number;
  eventsByStatus: Record<EventStatus, number>;
  regulationsByStatus: Record<RegulationStatus, number>;
}

/**
 * Test result for validation
 */
export interface TestResult {
  testId: string;
  regulationId: string;
  timestamp: string;
  testType: 'probe' | 'intervention';
  outcome: 'support' | 'refute' | 'inconclusive';
  observationId?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}
