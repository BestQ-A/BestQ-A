/**
 * Dual-Layer Storage for Causal Learner
 *
 * Architecture:
 * - Short-term DB (in-memory): Current session observations and learning
 * - Long-term DB (persistent): Accumulated knowledge across sessions
 *
 * Features:
 * - Test mode: Prevents flush to long-term (for evaluation)
 * - Smart caching: Load only relevant regulations based on current observation
 * - Train/test separation: Train on training set, evaluate on test set
 *
 * Workflow:
 * 1. New observations go to short-term
 * 2. loadRelevantKnowledge() fetches related regulations from long-term
 * 3. Induction creates candidate regulations in short-term
 * 4. On flush (if not in test mode), merge to long-term
 */

import { CausalStorage } from './storage.js';
import type {
  Observation,
  Event,
  Regulation,
  Evidence,
  StorageStats,
  EventStatus,
  RegulationStatus,
  Fact,
} from './types.js';
import type { ListEventsOptions, ListRegulationsOptions } from './storage.js';

export interface FlushResult {
  regulationsMerged: number;
  regulationsUpdated: number;
  eventsArchived: number;
  message: string;
}

export interface DualStorageStats extends StorageStats {
  shortTerm: StorageStats;
  longTerm: StorageStats;
  testMode: boolean;
  loadedRegulationIds: string[];
}

export interface DualStorageOptions {
  /** Test mode: prevents any flush to long-term DB */
  testMode?: boolean;
  /** Load all regulations at startup (legacy behavior) */
  loadAllAtStartup?: boolean;
  /** Maximum regulations to load in smart cache */
  maxCachedRegulations?: number;
}

export interface LoadRelevantResult {
  loaded: number;
  predicatesMatched: string[];
  regulationIds: string[];
  message: string;
}

/**
 * Dual-layer storage combining short-term (session) and long-term (persistent) databases
 */
export class DualLayerStorage {
  private shortTerm: CausalStorage;
  private longTerm: CausalStorage;
  private longTermPath: string;
  private options: DualStorageOptions;
  private loadedRegulationIds: Set<string> = new Set();

  constructor(longTermPath: string, options: DualStorageOptions = {}) {
    this.longTermPath = longTermPath;
    this.options = {
      testMode: options.testMode ?? false,
      loadAllAtStartup: options.loadAllAtStartup ?? false,
      maxCachedRegulations: options.maxCachedRegulations ?? 100,
    };

    // Short-term: in-memory for current session
    this.shortTerm = new CausalStorage(':memory:');
    // Long-term: persistent file storage
    this.longTerm = new CausalStorage(longTermPath);

    // Only load all at startup if explicitly requested (legacy behavior)
    if (this.options.loadAllAtStartup) {
      this.loadAllLongtermRegulations();
    }
  }

  // ===========================================================================
  // Test Mode Control
  // ===========================================================================

  /**
   * Enable or disable test mode
   * In test mode, flush operations are blocked to prevent test data pollution
   */
  setTestMode(enabled: boolean): void {
    this.options.testMode = enabled;
  }

  /**
   * Check if test mode is enabled
   */
  isTestMode(): boolean {
    return this.options.testMode ?? false;
  }

  // ===========================================================================
  // Smart Knowledge Loading (RAG-like)
  // ===========================================================================

  /**
   * Load regulations relevant to the given observation from long-term DB
   * Uses predicate matching to find related rules
   */
  loadRelevantKnowledge(observation: Observation): LoadRelevantResult {
    const predicates = new Set<string>();

    // Extract predicates from facts
    for (const fact of observation.facts) {
      predicates.add(fact.pred);
      // Also add pred=value pattern for more specific matching
      predicates.add(`${fact.pred}=${JSON.stringify(fact.value)}`);
    }

    // Extract from focus facts if present
    if (observation.focusFacts) {
      for (const fact of observation.focusFacts) {
        predicates.add(fact.pred);
        predicates.add(`${fact.pred}=${JSON.stringify(fact.value)}`);
      }
    }

    const matchedPredicates: string[] = [];
    const loadedIds: string[] = [];
    let totalLoaded = 0;

    // Search long-term DB for regulations matching these predicates
    for (const pred of predicates) {
      if (totalLoaded >= (this.options.maxCachedRegulations ?? 100)) break;

      // Search by effect predicate
      const regulations = this.longTerm.searchRegulationsByEffect(pred);

      for (const reg of regulations) {
        if (this.loadedRegulationIds.has(reg.regulationId)) continue;
        if (reg.status === 'retired') continue;
        if (totalLoaded >= (this.options.maxCachedRegulations ?? 100)) break;

        // Mark as from long-term and save to short-term
        if (!reg.metadata) reg.metadata = {};
        reg.metadata.fromLongterm = true;
        reg.metadata.loadedFor = pred;

        this.shortTerm.saveRegulation(reg);
        this.loadedRegulationIds.add(reg.regulationId);
        loadedIds.push(reg.regulationId);
        totalLoaded++;

        if (!matchedPredicates.includes(pred)) {
          matchedPredicates.push(pred);
        }
      }
    }

    return {
      loaded: totalLoaded,
      predicatesMatched: matchedPredicates,
      regulationIds: loadedIds,
      message: `Loaded ${totalLoaded} relevant regulations for ${matchedPredicates.length} predicates`,
    };
  }

  /**
   * Load all regulations from long-term (legacy behavior)
   */
  private loadAllLongtermRegulations(): void {
    const regulations = this.longTerm.listRegulations({ limit: 10000 });
    for (const reg of regulations) {
      if (reg.status !== 'retired') {
        if (!reg.metadata) reg.metadata = {};
        reg.metadata.fromLongterm = true;
        this.shortTerm.saveRegulation(reg);
        this.loadedRegulationIds.add(reg.regulationId);
      }
    }
  }

  /**
   * Get IDs of regulations currently loaded from long-term
   */
  getLoadedRegulationIds(): string[] {
    return Array.from(this.loadedRegulationIds);
  }

  /**
   * Clear loaded regulations cache (for fresh queries)
   */
  clearLoadedCache(): void {
    // Remove regulations marked as from long-term
    const regs = this.shortTerm.listRegulations({ limit: 10000 });
    for (const reg of regs) {
      if (reg.metadata?.fromLongterm) {
        this.shortTerm.deleteRegulation(reg.regulationId);
      }
    }
    this.loadedRegulationIds.clear();
  }

  // ===========================================================================
  // Observations - Always go to short-term
  // ===========================================================================

  saveObservation(obs: Observation): void {
    this.shortTerm.saveObservation(obs);
  }

  getObservation(id: string): Observation | null {
    return this.shortTerm.getObservation(id);
  }

  listObservations(limit = 100, offset = 0): Observation[] {
    return this.shortTerm.listObservations(limit, offset);
  }

  deleteObservation(id: string): boolean {
    return this.shortTerm.deleteObservation(id);
  }

  // ===========================================================================
  // Events - Short-term for current session
  // ===========================================================================

  saveEvent(event: Event): void {
    this.shortTerm.saveEvent(event);
  }

  getEvent(id: string): Event | null {
    const shortTermEvent = this.shortTerm.getEvent(id);
    if (shortTermEvent) return shortTermEvent;
    return this.longTerm.getEvent(id);
  }

  listEvents(options?: ListEventsOptions): Event[] {
    return this.shortTerm.listEvents(options);
  }

  updateEventStatus(id: string, status: EventStatus, clusterId?: string): boolean {
    return this.shortTerm.updateEventStatus(id, status, clusterId);
  }

  getEventsByCluster(clusterId: string): Event[] {
    return this.shortTerm.getEventsByCluster(clusterId);
  }

  deleteEvent(id: string): boolean {
    return this.shortTerm.deleteEvent(id);
  }

  getOpenEvents(): Event[] {
    return this.shortTerm.getOpenEvents();
  }

  // ===========================================================================
  // Regulations - Short-term with long-term fallback
  // ===========================================================================

  saveRegulation(reg: Regulation): void {
    this.shortTerm.saveRegulation(reg);
  }

  getRegulation(id: string): Regulation | null {
    const shortTermReg = this.shortTerm.getRegulation(id);
    if (shortTermReg) return shortTermReg;
    return this.longTerm.getRegulation(id);
  }

  listRegulations(options?: ListRegulationsOptions): Regulation[] {
    return this.shortTerm.listRegulations(options);
  }

  updateRegulation(reg: Regulation): void {
    this.shortTerm.updateRegulation(reg);
  }

  updateRegulationEvidence(id: string, evidence: Partial<Evidence>): boolean {
    return this.shortTerm.updateRegulationEvidence(id, evidence);
  }

  updateRegulationStatus(id: string, status: RegulationStatus): boolean {
    return this.shortTerm.updateRegulationStatus(id, status);
  }

  incrementExplainedCount(id: string): boolean {
    return this.shortTerm.incrementExplainedCount(id);
  }

  incrementFailedPredictions(id: string): boolean {
    return this.shortTerm.incrementFailedPredictions(id);
  }

  deleteRegulation(id: string): boolean {
    const shortDeleted = this.shortTerm.deleteRegulation(id);
    // Only delete from long-term if not in test mode
    if (!this.options.testMode) {
      this.longTerm.deleteRegulation(id);
    }
    this.loadedRegulationIds.delete(id);
    return shortDeleted;
  }

  getActiveRegulations(): Regulation[] {
    return this.shortTerm.getActiveRegulations();
  }

  searchRegulationsByEffect(pred: string): Regulation[] {
    return this.shortTerm.searchRegulationsByEffect(pred);
  }

  searchRegulationsByPre(pred: string): Regulation[] {
    return this.shortTerm.searchRegulationsByPre(pred);
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  saveObservationsBatch(observations: Observation[]): void {
    this.shortTerm.saveObservationsBatch(observations);
  }

  saveEventsBatch(events: Event[]): void {
    this.shortTerm.saveEventsBatch(events);
  }

  saveRegulationsBatch(regulations: Regulation[]): void {
    this.shortTerm.saveRegulationsBatch(regulations);
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  getStats(): StorageStats {
    return this.shortTerm.getStats();
  }

  getDualStats(): DualStorageStats {
    const shortStats = this.shortTerm.getStats();
    const longStats = this.longTerm.getStats();

    return {
      observationCount: shortStats.observationCount,
      eventCount: shortStats.eventCount,
      regulationCount: shortStats.regulationCount,
      eventsByStatus: shortStats.eventsByStatus,
      regulationsByStatus: shortStats.regulationsByStatus,
      shortTerm: shortStats,
      longTerm: longStats,
      testMode: this.options.testMode ?? false,
      loadedRegulationIds: Array.from(this.loadedRegulationIds),
    };
  }

  getLongtermStats(): StorageStats {
    return this.longTerm.getStats();
  }

  // ===========================================================================
  // Flush Operations
  // ===========================================================================

  /**
   * Flush short-term learning to long-term storage
   * Blocked in test mode to prevent test data pollution
   */
  flushToLongterm(): FlushResult {
    // Block flush in test mode
    if (this.options.testMode) {
      return {
        regulationsMerged: 0,
        regulationsUpdated: 0,
        eventsArchived: 0,
        message: 'Flush blocked: test mode is enabled. Disable test mode to flush.',
      };
    }

    let regulationsMerged = 0;
    let regulationsUpdated = 0;
    let eventsArchived = 0;

    // Process regulations
    const shortTermRegs = this.shortTerm.listRegulations({ limit: 10000 });
    for (const reg of shortTermRegs) {
      if (reg.status === 'retired') continue;

      const isFromLongterm = reg.metadata?.fromLongterm === true;

      if (isFromLongterm) {
        // Update existing long-term regulation
        const existingReg = this.longTerm.getRegulation(reg.regulationId);
        if (existingReg) {
          existingReg.supportN = Math.max(existingReg.supportN || 0, reg.supportN || 0);
          existingReg.explainedCount = (existingReg.explainedCount || 0) +
            ((reg.explainedCount || 0) - (existingReg.explainedCount || 0));
          existingReg.counterexampleN = Math.max(
            existingReg.counterexampleN || 0,
            reg.counterexampleN || 0
          );
          existingReg.failedPredictions = Math.max(
            existingReg.failedPredictions || 0,
            reg.failedPredictions || 0
          );

          if (this.shouldPromoteStatus(existingReg.status, reg.status)) {
            existingReg.status = reg.status;
          }

          existingReg.lastUsed = reg.lastUsed || existingReg.lastUsed;
          this.longTerm.saveRegulation(existingReg);
          regulationsUpdated++;
        }
      } else {
        // New regulation
        if (reg.status === 'hypothesis' || reg.status === 'confirmed') {
          if (reg.metadata) delete reg.metadata.fromLongterm;
          this.longTerm.saveRegulation(reg);
          regulationsMerged++;
        } else if (reg.status === 'candidate' && (reg.supportN || 0) >= 3) {
          reg.status = 'hypothesis';
          if (reg.metadata) delete reg.metadata.fromLongterm;
          this.longTerm.saveRegulation(reg);
          regulationsMerged++;
        }
      }
    }

    // Archive resolved events
    const resolvedEvents = this.shortTerm.listEvents({ status: 'resolved', limit: 10000 });
    for (const event of resolvedEvents) {
      event.status = 'archived';
      this.longTerm.saveEvent(event);
      eventsArchived++;
    }

    return {
      regulationsMerged,
      regulationsUpdated,
      eventsArchived,
      message: `Flushed to long-term: ${regulationsMerged} new regulations, ${regulationsUpdated} updated, ${eventsArchived} events archived`,
    };
  }

  private shouldPromoteStatus(current: RegulationStatus, proposed: RegulationStatus): boolean {
    const statusRank: Record<RegulationStatus, number> = {
      retired: 0,
      candidate: 1,
      hypothesis: 2,
      confirmed: 3,
    };
    return statusRank[proposed] > statusRank[current];
  }

  /**
   * Reset short-term storage
   * In test mode: clears everything
   * Normal mode: reloads based on loadAllAtStartup setting
   */
  resetShortTerm(): void {
    this.shortTerm.close();
    this.shortTerm = new CausalStorage(':memory:');
    this.loadedRegulationIds.clear();

    if (this.options.loadAllAtStartup && !this.options.testMode) {
      this.loadAllLongtermRegulations();
    }
  }

  /**
   * Export all data
   */
  exportAll(): {
    shortTerm: ReturnType<CausalStorage['exportAll']>;
    longTerm: ReturnType<CausalStorage['exportAll']>;
  } {
    return {
      shortTerm: this.shortTerm.exportAll(),
      longTerm: this.longTerm.exportAll(),
    };
  }

  /**
   * Close both database connections
   */
  close(): void {
    this.shortTerm.close();
    this.longTerm.close();
  }
}

/**
 * Create a dual-layer storage instance
 */
export function createDualStorage(longTermPath: string, options?: DualStorageOptions): DualLayerStorage {
  return new DualLayerStorage(longTermPath, options);
}
