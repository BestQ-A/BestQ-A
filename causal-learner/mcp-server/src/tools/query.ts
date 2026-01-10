/**
 * Query tools for the Causal Learner
 * Provides tools for listing and getting events, regulations, and statistics
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Event,
  Regulation,
  Fact,
  EventStatus,
  RegulationStatus,
  StorageStats,
} from '../core/index.js';
import { CausalStorage } from '../core/index.js';

/**
 * List events with optional filtering
 *
 * @param storage - The causal storage instance
 * @param status - Optional status filter
 * @param limit - Maximum number of events to return
 * @returns Array of events
 */
export function listEventsTool(
  storage: CausalStorage,
  status?: EventStatus,
  limit: number = 100
): Event[] {
  return storage.listEvents({ status, limit });
}

/**
 * Get a single event by ID
 *
 * @param storage - The causal storage instance
 * @param eventId - The event ID to retrieve
 * @returns The event or null if not found
 */
export function getEventTool(
  storage: CausalStorage,
  eventId: string
): Event | null {
  return storage.getEvent(eventId);
}

/**
 * List regulations with optional filtering
 *
 * @param storage - The causal storage instance
 * @param status - Optional status filter
 * @param limit - Maximum number of regulations to return
 * @returns Array of regulations
 */
export function listRegulationsTool(
  storage: CausalStorage,
  status?: RegulationStatus,
  limit: number = 100
): Regulation[] {
  return storage.listRegulations({ status, limit });
}

/**
 * Get a single regulation by ID
 *
 * @param storage - The causal storage instance
 * @param regulationId - The regulation ID to retrieve
 * @returns The regulation or null if not found
 */
export function getRegulationTool(
  storage: CausalStorage,
  regulationId: string
): Regulation | null {
  return storage.getRegulation(regulationId);
}

/**
 * Input for adding a new regulation
 */
export interface AddRegulationInput {
  pre: Fact[];
  eff: Fact[];
  description?: string;
  status?: RegulationStatus;
  evidenceKind?: 'observational' | 'intervention' | 'quasi_experiment';
  scope?: Record<string, unknown>;
  tags?: string[];
}

/**
 * Generate a new regulation ID
 */
function newRegulationId(): string {
  return 'reg_' + uuidv4().substring(0, 8);
}

/**
 * Add a new regulation to the storage
 *
 * @param storage - The causal storage instance
 * @param input - The regulation input
 * @returns The created regulation
 */
export function addRegulationTool(
  storage: CausalStorage,
  input: AddRegulationInput
): Regulation {
  const regulation: Regulation = {
    regulationId: newRegulationId(),
    status: input.status || 'candidate',
    pre: input.pre,
    eff: input.eff,
    description: input.description,
    evidenceKind: input.evidenceKind || 'observational',
    supportN: 0,
    counterexampleN: 0,
    explainedCount: 0,
    failedPredictions: 0,
    scope: input.scope,
    tags: input.tags,
    origin: {
      source: 'manual',
      created: new Date().toISOString(),
    },
  };

  storage.saveRegulation(regulation);
  return regulation;
}

/**
 * Update an existing regulation
 *
 * @param storage - The causal storage instance
 * @param regulationId - The regulation ID to update
 * @param updates - Partial regulation updates
 * @returns The updated regulation or null if not found
 */
export function updateRegulationTool(
  storage: CausalStorage,
  regulationId: string,
  updates: Partial<Omit<Regulation, 'regulationId'>>
): Regulation | null {
  const existing = storage.getRegulation(regulationId);
  if (!existing) return null;

  const updated: Regulation = {
    ...existing,
    ...updates,
    regulationId: existing.regulationId, // Ensure ID is not changed
  };

  storage.saveRegulation(updated);
  return updated;
}

/**
 * Delete a regulation
 *
 * @param storage - The causal storage instance
 * @param regulationId - The regulation ID to delete
 * @returns true if deleted, false if not found
 */
export function deleteRegulationTool(
  storage: CausalStorage,
  regulationId: string
): boolean {
  return storage.deleteRegulation(regulationId);
}

/**
 * Update event status
 *
 * @param storage - The causal storage instance
 * @param eventId - The event ID to update
 * @param status - The new status
 * @param clusterId - Optional cluster ID for clustered events
 * @returns true if updated, false if not found
 */
export function updateEventStatusTool(
  storage: CausalStorage,
  eventId: string,
  status: EventStatus,
  clusterId?: string
): boolean {
  return storage.updateEventStatus(eventId, status, clusterId);
}

/**
 * Get storage statistics
 *
 * @param storage - The causal storage instance
 * @returns Statistics about events and regulations
 */
export function getStatsTool(storage: CausalStorage): StorageStats {
  return storage.getStats();
}

/**
 * Search events by predicate pattern in unexplained aspects
 *
 * @param storage - The causal storage instance
 * @param predPattern - Predicate pattern to search for
 * @param limit - Maximum number of results
 * @returns Array of matching events
 */
export function searchEventsByPredicate(
  storage: CausalStorage,
  predPattern: string,
  limit: number = 50
): Event[] {
  const allEvents = storage.listEvents({ limit: 1000 });
  const pattern = predPattern.toLowerCase();

  return allEvents
    .filter(event =>
      event.unexplainedAspects.some(fact =>
        fact.pred.toLowerCase().includes(pattern)
      )
    )
    .slice(0, limit);
}

/**
 * Search regulations by predicate pattern in pre or eff
 *
 * @param storage - The causal storage instance
 * @param predPattern - Predicate pattern to search for
 * @param limit - Maximum number of results
 * @returns Array of matching regulations
 */
export function searchRegulationsByPredicate(
  storage: CausalStorage,
  predPattern: string,
  limit: number = 50
): Regulation[] {
  const allRegs = storage.listRegulations({ limit: 1000 });
  const pattern = predPattern.toLowerCase();

  return allRegs
    .filter(reg =>
      reg.pre.some(fact => fact.pred.toLowerCase().includes(pattern)) ||
      reg.eff.some(fact => fact.pred.toLowerCase().includes(pattern))
    )
    .slice(0, limit);
}

/**
 * Get regulations that can produce a given effect
 *
 * @param storage - The causal storage instance
 * @param effectPred - The predicate to search for in effects
 * @param effectValue - Optional value to match
 * @returns Array of regulations that can produce the effect
 */
export function getRegulationsForEffect(
  storage: CausalStorage,
  effectPred: string,
  effectValue?: unknown
): Regulation[] {
  // Use the built-in search if just matching predicate
  if (effectValue === undefined) {
    return storage.searchRegulationsByEffect(effectPred);
  }

  // Otherwise, filter manually
  const candidates = storage.searchRegulationsByEffect(effectPred);
  return candidates.filter(reg =>
    reg.eff.some(fact =>
      fact.pred === effectPred && fact.value === effectValue
    )
  );
}

/**
 * Get regulations that require a given precondition
 *
 * @param storage - The causal storage instance
 * @param prePred - The predicate to search for in preconditions
 * @param preValue - Optional value to match
 * @returns Array of regulations that require the precondition
 */
export function getRegulationsWithPrecondition(
  storage: CausalStorage,
  prePred: string,
  preValue?: unknown
): Regulation[] {
  // Use the built-in search if just matching predicate
  if (preValue === undefined) {
    return storage.searchRegulationsByPre(prePred);
  }

  // Otherwise, filter manually
  const candidates = storage.searchRegulationsByPre(prePred);
  return candidates.filter(reg =>
    reg.pre.some(fact =>
      fact.pred === prePred && fact.value === preValue
    )
  );
}
