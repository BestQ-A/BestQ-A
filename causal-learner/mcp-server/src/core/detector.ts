/**
 * Event detector for the Causal Learner
 * Detects when observations cannot be explained and creates Events
 */

import { v4 as uuidv4 } from 'uuid';
import type { Event, Fact, Json, Observation, Regulation, Story, ExplanationAttempt as TypesExplanationAttempt, FailureReason } from './types.js';
import { factToDict, observationGoals } from './types.js';
import { explainObservation, EffectIndex, ExplainOptions, DEFAULT_EXPLAIN_OPTIONS } from './explainer.js';

/**
 * Options for event detection
 */
export interface DetectOptions {
  minScore: number;
  maxAssumptions: number;
  keepTopAttempts: number;
  explainOptions: ExplainOptions;
}

/**
 * Default detection options
 */
export const DEFAULT_DETECT_OPTIONS: DetectOptions = {
  minScore: -2.2,  // log-space; closer to 0 is better
  maxAssumptions: 0,  // 0 = strict: no missing pres allowed for explained
  keepTopAttempts: 3,
  explainOptions: { ...DEFAULT_EXPLAIN_OPTIONS, topK: 5, beamSize: 20, maxDepth: 8, maxAssumptions: 10 },
};

/**
 * Result of event detection
 */
export interface DetectResult {
  explained: boolean;
  bestStory?: Story;
  attempts: TypesExplanationAttempt[];
  event?: Event;
}

// Re-export the ExplanationAttempt type for external use
export type { TypesExplanationAttempt as ExplanationAttempt };

/**
 * Generate ISO timestamp
 */
function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Generate new event ID
 */
function newEventId(): string {
  return 'evt_' + uuidv4().substring(0, 8);
}

/**
 * Check if regulation scope matches observation context
 */
function scopeGate(rule: Regulation, obsContext: Record<string, unknown> | undefined): boolean {
  const ctx = obsContext || {};
  const scope = rule.scope || {};
  for (const [k, v] of Object.entries(scope)) {
    if (ctx[k] !== v) {
      return false;
    }
  }
  return true;
}

/**
 * Find goal facts that have no regulation that can produce them
 */
function unexplainedGoalFacts(
  obs: Observation,
  regulations: Regulation[]
): Fact[] {
  const goals = observationGoals(obs);
  const idx = new EffectIndex(regulations);
  const unexplained: Fact[] = [];

  for (const g of goals) {
    const cands = idx.candidates(g).filter((r) => scopeGate(r, obs.context));
    if (cands.length === 0) {
      unexplained.push(g);
    }
  }

  return unexplained;
}

/**
 * Detect whether an observation can be explained by existing regulations.
 * If not, create an Event.
 */
export function detectEvent(
  obs: Observation,
  regulations: Regulation[],
  options?: Partial<DetectOptions>
): DetectResult {
  const opts = { ...DEFAULT_DETECT_OPTIONS, ...options };
  
  // Try to explain the observation
  const stories = explainObservation(obs, regulations, opts.explainOptions);
  const best = stories.length > 0 ? stories[0] : undefined;

  // Check if explanation is satisfactory
  if (
    best &&
    (best.score || 0) >= opts.minScore &&
    (best.assumptions?.length || 0) <= opts.maxAssumptions
  ) {
    // Explained successfully
    return {
      explained: true,
      bestStory: best,
      attempts: [],
    };
  }

  // Not explained - create an event
  const unexplained = unexplainedGoalFacts(obs, regulations);
  const attempts: TypesExplanationAttempt[] = [];

  const topStories = stories.slice(0, opts.keepTopAttempts);
  for (const s of topStories) {
    let failureReason: FailureReason = 'unknown';

    if ((s.score || 0) < opts.minScore) {
      failureReason = 'low_score';
    } else if (s.assumptions && s.assumptions.length > 0) {
      failureReason = 'pre_not_satisfied';
    } else if (s.regulationIds.length === 0) {
      failureReason = 'no_covering_rule';
    }

    const regulationId = s.regulationIds.length > 0 ? s.regulationIds[0] : 'none';

    attempts.push({
      regulationId,
      score: s.score || 0,
      failureReason,
      usedRules: [...s.regulationIds],
      missingPres: s.assumptions || [],
      assumptions: s.assumptions || [],
      uncoveredGoals: unexplained,
      storyline: [...s.regulationIds],
    });
  }

  // Create the event
  const event: Event = {
    eventId: newEventId(),
    timestamp: nowIso(),
    observation: obs,
    attemptedExplanations: attempts,
    unexplainedAspects: unexplained.length > 0 ? unexplained : observationGoals(obs),
    context: { ...(obs.context || {}) },
    status: 'open',
  };

  return {
    explained: false,
    bestStory: best,
    attempts,
    event,
  };
}

/**
 * Process an observation: try to explain it, update evidence if explained,
 * or create an Event if not explained.
 */
export function processObservation(
  obs: Observation,
  regulations: Regulation[],
  options?: Partial<DetectOptions>
): { status: 'explained' | 'event_created'; event?: Event } {
  const result = detectEvent(obs, regulations, options);

  if (result.explained && result.bestStory) {
    // Update evidence for used regulations
    const ridSet = new Set(result.bestStory.regulationIds);
    for (const r of regulations) {
      if (ridSet.has(r.regulationId)) {
        r.supportN = (r.supportN || 0) + 1;
        r.explainedCount = (r.explainedCount || 0) + 1;
        r.lastUsed = obs.timestamp;
      }
    }
    return { status: 'explained' };
  }

  return { status: 'event_created', event: result.event };
}
