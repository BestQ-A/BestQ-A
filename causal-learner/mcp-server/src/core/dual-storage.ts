/**
 * Dual-Layer Storage for Causal Learner
 *
 * Architecture:
 * - Short-term DB (in-memory): Current session observations and learning
 * - Long-term DB (persistent): Accumulated knowledge across sessions
 *
 * Workflow:
 * 1. New observations go to short-term
 * 2. Induction creates candidate regulations in short-term
 * 3. On flush (PreCompact hook or manual), merge to long-term:
 *    - Promote validated regulations
 *    - Update evidence counts
 *    - Archive resolved events
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
}

/**
 * Dual-layer storage combining short-term (session) and long-term (persistent) databases
 */
export class DualLayerStorage {
  private shortTerm: CausalStorage;
  private longTerm: CausalStorage;
  private longTermPath: string;

  constructor(longTermPath: string) {
    this.longTermPath = longTermPath;
    // Short-term: in-memory for current session
    this.shortTerm = new CausalStorage(':memory:');
    // Long-term: persistent file storage
    this.longTerm = new CausalStorage(longTermPath);

    // Load confirmed regulations from long-term into short-term for quick access
    this.loadLongtermRegulations();
  }

  /**
   * Load confirmed/hypothesis regulations from long-term to short-term
   * This allows the session to use previously learned knowledge
   */
  private loadLongtermRegulations(): void {
    const regulations = this.longTerm.listRegulations({ limit: 1000 });
    for (const reg of regulations) {
      // Only load non-retired regulations
      if (reg.status !== 'retired') {
        // Mark as coming from long-term
        if (!reg.metadata) reg.metadata = {};
        reg.metadata.fromLongterm = true;
        this.shortTerm.saveRegulation(reg);
      }
    }
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
    // First check short-term
    const shortTermEvent = this.shortTerm.getEvent(id);
    if (shortTermEvent) return shortTermEvent;
    // Fall back to long-term (for historical queries)
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
    // First check short-term
    const shortTermReg = this.shortTerm.getRegulation(id);
    if (shortTermReg) return shortTermReg;
    // Fall back to long-term
    return this.longTerm.getRegulation(id);
  }

  listRegulations(options?: ListRegulationsOptions): Regulation[] {
    // Return short-term regulations (which includes loaded long-term ones)
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
    // Delete from both
    const shortDeleted = this.shortTerm.deleteRegulation(id);
    const longDeleted = this.longTerm.deleteRegulation(id);
    return shortDeleted || longDeleted;
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
  // Statistics - Combined view
  // ===========================================================================

  getStats(): StorageStats {
    const shortStats = this.shortTerm.getStats();
    return shortStats; // Short-term contains the active working set
  }

  getDualStats(): DualStorageStats {
    const shortStats = this.shortTerm.getStats();
    const longStats = this.longTerm.getStats();

    return {
      // Combined totals
      observationCount: shortStats.observationCount,
      eventCount: shortStats.eventCount,
      regulationCount: shortStats.regulationCount,
      eventsByStatus: shortStats.eventsByStatus,
      regulationsByStatus: shortStats.regulationsByStatus,
      // Breakdown
      shortTerm: shortStats,
      longTerm: longStats,
    };
  }

  // ===========================================================================
  // Flush Operations - Merge short-term learning to long-term
  // ===========================================================================

  /**
   * Flush short-term learning to long-term storage
   *
   * Strategy:
   * 1. Merge regulations that have been validated (hypothesis/confirmed)
   * 2. Update evidence counts for existing regulations
   * 3. Archive resolved events to long-term
   * 4. Clear temporary data from short-term
   */
  flushToLongterm(): FlushResult {
    let regulationsMerged = 0;
    let regulationsUpdated = 0;
    let eventsArchived = 0;

    // 1. Process regulations
    const shortTermRegs = this.shortTerm.listRegulations({ limit: 10000 });
    for (const reg of shortTermRegs) {
      // Skip retired regulations
      if (reg.status === 'retired') continue;

      // Check if regulation came from long-term originally
      const isFromLongterm = reg.metadata?.fromLongterm === true;

      if (isFromLongterm) {
        // Update existing long-term regulation with new evidence
        const existingReg = this.longTerm.getRegulation(reg.regulationId);
        if (existingReg) {
          // Merge evidence counts
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

          // Promote status if upgraded
          if (this.shouldPromoteStatus(existingReg.status, reg.status)) {
            existingReg.status = reg.status;
          }

          existingReg.lastUsed = reg.lastUsed || existingReg.lastUsed;
          this.longTerm.saveRegulation(existingReg);
          regulationsUpdated++;
        }
      } else {
        // New regulation - only save if it has enough evidence
        if (reg.status === 'hypothesis' || reg.status === 'confirmed') {
          // Clean metadata before saving to long-term
          if (reg.metadata) {
            delete reg.metadata.fromLongterm;
          }
          this.longTerm.saveRegulation(reg);
          regulationsMerged++;
        } else if (reg.status === 'candidate' && (reg.supportN || 0) >= 3) {
          // Promote candidates with enough support
          reg.status = 'hypothesis';
          if (reg.metadata) {
            delete reg.metadata.fromLongterm;
          }
          this.longTerm.saveRegulation(reg);
          regulationsMerged++;
        }
      }
    }

    // 2. Archive resolved events
    const resolvedEvents = this.shortTerm.listEvents({ status: 'resolved', limit: 10000 });
    for (const event of resolvedEvents) {
      event.status = 'archived';
      this.longTerm.saveEvent(event);
      eventsArchived++;
    }

    // 3. Clear short-term (but keep open events for continuity)
    // Don't clear - let the session continue working

    return {
      regulationsMerged,
      regulationsUpdated,
      eventsArchived,
      message: `Flushed to long-term: ${regulationsMerged} new regulations, ${regulationsUpdated} updated, ${eventsArchived} events archived`,
    };
  }

  /**
   * Determine if status should be promoted
   */
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
   * Reset short-term storage (start fresh session)
   */
  resetShortTerm(): void {
    this.shortTerm.close();
    this.shortTerm = new CausalStorage(':memory:');
    this.loadLongtermRegulations();
  }

  /**
   * Get long-term statistics only
   */
  getLongtermStats(): StorageStats {
    return this.longTerm.getStats();
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
export function createDualStorage(longTermPath: string): DualLayerStorage {
  return new DualLayerStorage(longTermPath);
}
