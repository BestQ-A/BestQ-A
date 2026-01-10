/**
 * Observation submission tool for the Causal Learner
 * Handles submitting observations, attempting explanations, and creating events
 */

import type { Observation, Story, Event } from '../core/index.js';
import { detectEvent, CausalStorage } from '../core/index.js';

/**
 * Result of submitting an observation
 */
export interface SubmitObservationResult {
  explained: boolean;
  story?: Story;
  eventCreated?: Event;
  regulationsUsed?: string[];
  message: string;
}

/**
 * Options for submitting an observation
 */
export interface SubmitObservationOptions {
  minScore?: number;
  maxAssumptions?: number;
  updateEvidence?: boolean;
}

/**
 * Submit an observation to the causal learner
 *
 * Flow:
 * 1. Try to explain the observation using existing regulations
 * 2. If explanation fails, create an Event
 * 3. Save to storage
 *
 * @param storage - The causal storage instance
 * @param obs - The observation to submit
 * @param options - Optional configuration
 * @returns Result indicating whether explained or event created
 */
export function submitObservationTool(
  storage: CausalStorage,
  obs: Observation,
  options?: SubmitObservationOptions
): SubmitObservationResult {
  // Get all active regulations
  const regulations = storage.getActiveRegulations();

  // Save the observation for history
  storage.saveObservation(obs);

  // Try to detect if this is an event (unexplainable observation)
  const detectResult = detectEvent(obs, regulations, {
    minScore: options?.minScore,
    maxAssumptions: options?.maxAssumptions,
  });

  if (detectResult.explained && detectResult.bestStory) {
    // Successfully explained - update evidence if requested
    if (options?.updateEvidence !== false) {
      for (const regId of detectResult.bestStory.regulationIds) {
        storage.incrementExplainedCount(regId);
      }
    }

    return {
      explained: true,
      story: detectResult.bestStory,
      regulationsUsed: detectResult.bestStory.regulationIds,
      message: `Observation explained using ${detectResult.bestStory.regulationIds.length} regulation(s)`,
    };
  }

  // Not explained - create and save event
  if (detectResult.event) {
    storage.saveEvent(detectResult.event);
    return {
      explained: false,
      eventCreated: detectResult.event,
      story: detectResult.bestStory,
      message: `Created event ${detectResult.event.eventId}: observation could not be fully explained`,
    };
  }

  // Edge case: no explanation and no event created
  return {
    explained: false,
    message: 'Observation could not be processed',
  };
}

/**
 * Batch submit multiple observations
 *
 * @param storage - The causal storage instance
 * @param observations - Array of observations to submit
 * @param options - Optional configuration
 * @returns Array of results for each observation
 */
export function batchSubmitObservations(
  storage: CausalStorage,
  observations: Observation[],
  options?: SubmitObservationOptions
): SubmitObservationResult[] {
  return observations.map(obs => submitObservationTool(storage, obs, options));
}

/**
 * Re-evaluate an existing event against current regulations
 * Used when new regulations are added to see if old events can now be explained
 *
 * @param storage - The causal storage instance
 * @param eventId - The event ID to re-evaluate
 * @returns Result indicating whether now explained
 */
export function reevaluateEvent(
  storage: CausalStorage,
  eventId: string
): SubmitObservationResult & { eventResolved: boolean } {
  const event = storage.getEvent(eventId);
  if (!event) {
    return {
      explained: false,
      eventResolved: false,
      message: `Event ${eventId} not found`,
    };
  }

  if (event.status !== 'open' && event.status !== 'clustered') {
    return {
      explained: false,
      eventResolved: false,
      message: `Event ${eventId} is not open (status: ${event.status})`,
    };
  }

  // Get current regulations
  const regulations = storage.getActiveRegulations();

  // Try to explain the event's observation
  const detectResult = detectEvent(event.observation, regulations);

  if (detectResult.explained && detectResult.bestStory) {
    // Now explained - resolve the event
    storage.updateEventStatus(eventId, 'resolved');

    // Update evidence
    for (const regId of detectResult.bestStory.regulationIds) {
      storage.incrementExplainedCount(regId);
    }

    return {
      explained: true,
      eventResolved: true,
      story: detectResult.bestStory,
      regulationsUsed: detectResult.bestStory.regulationIds,
      message: `Event ${eventId} can now be explained and has been resolved`,
    };
  }

  return {
    explained: false,
    eventResolved: false,
    story: detectResult.bestStory,
    message: `Event ${eventId} still cannot be explained`,
  };
}
