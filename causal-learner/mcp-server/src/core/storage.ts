/**
 * SQLite storage layer for the Causal Learner system
 *
 * Uses better-sqlite3 for native SQLite operations (5-10x faster than sql.js).
 * Stores observations, events, and regulations with JSON fields for complex structures.
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type {
  Observation,
  Event,
  Regulation,
  Evidence,
  StorageStats,
  EventStatus,
  RegulationStatus,
  Json,
} from './types.js';
import {
  observationToDict,
  observationFromDict,
  eventToDict,
  eventFromDict,
  regulationToDict,
  regulationFromDict,
} from './types.js';

/**
 * Options for listing events
 */
export interface ListEventsOptions {
  status?: EventStatus;
  limit?: number;
  offset?: number;
}

/**
 * Options for listing regulations
 */
export interface ListRegulationsOptions {
  status?: RegulationStatus;
  limit?: number;
  offset?: number;
}

/**
 * SQLite storage class for causal learning data
 * Uses better-sqlite3 for synchronous, high-performance operations
 */
export class CausalStorage {
  private db: DatabaseType;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;

    // Ensure directory exists for file-based databases
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Create database connection (synchronous)
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent performance
    this.db.pragma('journal_mode = WAL');

    // Initialize schema
    this.initSchema();
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    this.db.exec(`
      -- Observations table
      CREATE TABLE IF NOT EXISTS observations (
        observation_id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Events table
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        cluster_id TEXT,
        observation_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Regulations table
      CREATE TABLE IF NOT EXISTS regulations (
        regulation_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'hypothesis',
        description TEXT,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
      CREATE INDEX IF NOT EXISTS idx_events_cluster ON events(cluster_id);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_regulations_status ON regulations(status);
      CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp);
    `);
  }

  // ===========================================================================
  // Observations
  // ===========================================================================

  /**
   * Save an observation to the database
   */
  saveObservation(obs: Observation): void {
    const data = JSON.stringify(observationToDict(obs));
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO observations (observation_id, timestamp, data) VALUES (?, ?, ?)`
    );
    stmt.run(obs.observationId, obs.timestamp, data);
  }

  /**
   * Get an observation by ID
   */
  getObservation(id: string): Observation | null {
    const stmt = this.db.prepare(
      `SELECT data FROM observations WHERE observation_id = ?`
    );
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return null;
    return observationFromDict(JSON.parse(row.data) as Json);
  }

  /**
   * List observations with optional limit
   */
  listObservations(limit = 100, offset = 0): Observation[] {
    const stmt = this.db.prepare(
      `SELECT data FROM observations ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    );
    const rows = stmt.all(limit, offset) as { data: string }[];
    return rows.map((row) => observationFromDict(JSON.parse(row.data) as Json));
  }

  /**
   * Delete an observation by ID
   */
  deleteObservation(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM observations WHERE observation_id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Save an event to the database
   */
  saveEvent(event: Event): void {
    const data = JSON.stringify(eventToDict(event));
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO events
        (event_id, timestamp, status, cluster_id, observation_id, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    stmt.run(
      event.eventId,
      event.timestamp,
      event.status || 'open',
      event.clusterId || null,
      event.observation.observationId,
      data
    );
  }

  /**
   * Get an event by ID
   */
  getEvent(id: string): Event | null {
    const stmt = this.db.prepare(`SELECT data FROM events WHERE event_id = ?`);
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return null;
    return eventFromDict(JSON.parse(row.data) as Json);
  }

  /**
   * List events with optional status filter
   */
  listEvents(options?: ListEventsOptions): Event[] {
    const { status, limit = 100, offset = 0 } = options || {};

    let sql = 'SELECT data FROM events';
    const params: (string | number)[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as { data: string }[];
    return rows.map((row) => eventFromDict(JSON.parse(row.data) as Json));
  }

  /**
   * Update event status
   */
  updateEventStatus(
    id: string,
    status: EventStatus,
    clusterId?: string
  ): boolean {
    const event = this.getEvent(id);
    if (!event) return false;

    event.status = status;
    if (clusterId !== undefined) {
      event.clusterId = clusterId;
    }

    this.saveEvent(event);
    return true;
  }

  /**
   * Get events by cluster ID
   */
  getEventsByCluster(clusterId: string): Event[] {
    const stmt = this.db.prepare(
      `SELECT data FROM events WHERE cluster_id = ? ORDER BY timestamp DESC`
    );
    const rows = stmt.all(clusterId) as { data: string }[];
    return rows.map((row) => eventFromDict(JSON.parse(row.data) as Json));
  }

  /**
   * Delete an event by ID
   */
  deleteEvent(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM events WHERE event_id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ===========================================================================
  // Regulations
  // ===========================================================================

  /**
   * Save a regulation to the database
   */
  saveRegulation(reg: Regulation): void {
    const data = JSON.stringify(regulationToDict(reg));
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO regulations
        (regulation_id, status, description, data, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    );
    stmt.run(reg.regulationId, reg.status, reg.description || null, data);
  }

  /**
   * Get a regulation by ID
   */
  getRegulation(id: string): Regulation | null {
    const stmt = this.db.prepare(
      `SELECT data FROM regulations WHERE regulation_id = ?`
    );
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return null;
    return regulationFromDict(JSON.parse(row.data) as Json);
  }

  /**
   * List regulations with optional status filter
   */
  listRegulations(options?: ListRegulationsOptions): Regulation[] {
    const { status, limit = 100, offset = 0 } = options || {};

    let sql = 'SELECT data FROM regulations';
    const params: (string | number)[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as { data: string }[];
    return rows.map((row) => regulationFromDict(JSON.parse(row.data) as Json));
  }

  /**
   * Update a regulation (alias for saveRegulation for compatibility)
   */
  updateRegulation(reg: Regulation): void {
    this.saveRegulation(reg);
  }

  /**
   * Update regulation evidence
   */
  updateRegulationEvidence(id: string, evidence: Partial<Evidence>): boolean {
    const reg = this.getRegulation(id);
    if (!reg) return false;

    if (evidence.kind !== undefined) reg.evidenceKind = evidence.kind;
    if (evidence.supportN !== undefined) reg.supportN = evidence.supportN;
    if (evidence.counterexampleN !== undefined)
      reg.counterexampleN = evidence.counterexampleN;
    if (evidence.explainedCount !== undefined)
      reg.explainedCount = evidence.explainedCount;
    if (evidence.failedPredictions !== undefined)
      reg.failedPredictions = evidence.failedPredictions;
    if (evidence.lastUsed !== undefined) reg.lastUsed = evidence.lastUsed;

    this.saveRegulation(reg);
    return true;
  }

  /**
   * Update regulation status
   */
  updateRegulationStatus(id: string, status: RegulationStatus): boolean {
    const reg = this.getRegulation(id);
    if (!reg) return false;

    reg.status = status;
    this.saveRegulation(reg);
    return true;
  }

  /**
   * Increment explained count for a regulation
   */
  incrementExplainedCount(id: string): boolean {
    const reg = this.getRegulation(id);
    if (!reg) return false;

    reg.explainedCount = (reg.explainedCount || 0) + 1;
    reg.lastUsed = new Date().toISOString();
    this.saveRegulation(reg);
    return true;
  }

  /**
   * Increment failed predictions for a regulation
   */
  incrementFailedPredictions(id: string): boolean {
    const reg = this.getRegulation(id);
    if (!reg) return false;

    reg.failedPredictions = (reg.failedPredictions || 0) + 1;
    this.saveRegulation(reg);
    return true;
  }

  /**
   * Delete a regulation by ID
   */
  deleteRegulation(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM regulations WHERE regulation_id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ===========================================================================
  // Batch Operations (optimized with transactions)
  // ===========================================================================

  /**
   * Save multiple observations in a transaction
   */
  saveObservationsBatch(observations: Observation[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO observations (observation_id, timestamp, data) VALUES (?, ?, ?)`
    );

    const insertMany = this.db.transaction((items: Observation[]) => {
      for (const obs of items) {
        const data = JSON.stringify(observationToDict(obs));
        stmt.run(obs.observationId, obs.timestamp, data);
      }
    });

    insertMany(observations);
  }

  /**
   * Save multiple events in a transaction
   */
  saveEventsBatch(events: Event[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO events
        (event_id, timestamp, status, cluster_id, observation_id, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    );

    const insertMany = this.db.transaction((items: Event[]) => {
      for (const event of items) {
        const data = JSON.stringify(eventToDict(event));
        stmt.run(
          event.eventId,
          event.timestamp,
          event.status || 'open',
          event.clusterId || null,
          event.observation.observationId,
          data
        );
      }
    });

    insertMany(events);
  }

  /**
   * Save multiple regulations in a transaction
   */
  saveRegulationsBatch(regulations: Regulation[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO regulations
        (regulation_id, status, description, data, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    );

    const insertMany = this.db.transaction((items: Regulation[]) => {
      for (const reg of items) {
        const data = JSON.stringify(regulationToDict(reg));
        stmt.run(reg.regulationId, reg.status, reg.description || null, data);
      }
    });

    insertMany(regulations);
  }

  // ===========================================================================
  // Statistics & Utilities
  // ===========================================================================

  /**
   * Get storage statistics
   */
  getStats(): StorageStats {
    const obsCount = this.db.prepare('SELECT COUNT(*) as count FROM observations').get() as { count: number };
    const eventCount = this.db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
    const regCount = this.db.prepare('SELECT COUNT(*) as count FROM regulations').get() as { count: number };

    const eventStatusRows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM events GROUP BY status'
    ).all() as { status: EventStatus; count: number }[];

    const eventsByStatus: Record<EventStatus, number> = {
      open: 0,
      clustered: 0,
      resolved: 0,
      archived: 0,
    };
    for (const row of eventStatusRows) {
      eventsByStatus[row.status] = row.count;
    }

    const regStatusRows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM regulations GROUP BY status'
    ).all() as { status: RegulationStatus; count: number }[];

    const regulationsByStatus: Record<RegulationStatus, number> = {
      candidate: 0,
      hypothesis: 0,
      confirmed: 0,
      retired: 0,
    };
    for (const row of regStatusRows) {
      regulationsByStatus[row.status] = row.count;
    }

    return {
      observationCount: obsCount.count,
      eventCount: eventCount.count,
      regulationCount: regCount.count,
      eventsByStatus,
      regulationsByStatus,
    };
  }

  /**
   * Search regulations by predicate in effects
   */
  searchRegulationsByEffect(pred: string): Regulation[] {
    const stmt = this.db.prepare(
      `SELECT data FROM regulations WHERE data LIKE ?`
    );
    const rows = stmt.all(`%"${pred}"%`) as { data: string }[];
    return rows.map((row) => regulationFromDict(JSON.parse(row.data) as Json));
  }

  /**
   * Search regulations by predicate in preconditions
   */
  searchRegulationsByPre(pred: string): Regulation[] {
    return this.searchRegulationsByEffect(pred); // Same implementation
  }

  /**
   * Get active (non-retired) regulations
   */
  getActiveRegulations(): Regulation[] {
    const stmt = this.db.prepare(
      `SELECT data FROM regulations WHERE status != 'retired' ORDER BY updated_at DESC`
    );
    const rows = stmt.all() as { data: string }[];
    return rows.map((row) => regulationFromDict(JSON.parse(row.data) as Json));
  }

  /**
   * Get open events (not resolved or archived)
   */
  getOpenEvents(): Event[] {
    const stmt = this.db.prepare(
      `SELECT data FROM events WHERE status IN ('open', 'clustered') ORDER BY timestamp DESC`
    );
    const rows = stmt.all() as { data: string }[];
    return rows.map((row) => eventFromDict(JSON.parse(row.data) as Json));
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Export all data as JSON
   */
  exportAll(): {
    observations: Json[];
    events: Json[];
    regulations: Json[];
  } {
    const observations = this.db.prepare('SELECT data FROM observations').all() as { data: string }[];
    const events = this.db.prepare('SELECT data FROM events').all() as { data: string }[];
    const regulations = this.db.prepare('SELECT data FROM regulations').all() as { data: string }[];

    return {
      observations: observations.map((r) => JSON.parse(r.data) as Json),
      events: events.map((r) => JSON.parse(r.data) as Json),
      regulations: regulations.map((r) => JSON.parse(r.data) as Json),
    };
  }

  /**
   * Import data from JSON
   */
  importData(data: {
    observations?: Json[];
    events?: Json[];
    regulations?: Json[];
  }): void {
    const importAll = this.db.transaction(() => {
      if (data.observations) {
        for (const obs of data.observations) {
          this.saveObservation(observationFromDict(obs));
        }
      }
      if (data.events) {
        for (const evt of data.events) {
          this.saveEvent(eventFromDict(evt));
        }
      }
      if (data.regulations) {
        for (const reg of data.regulations) {
          this.saveRegulation(regulationFromDict(reg));
        }
      }
    });

    importAll();
  }
}

/**
 * Create an in-memory storage instance (useful for testing)
 */
export function createMemoryStorage(): CausalStorage {
  return new CausalStorage(':memory:');
}

/**
 * Create a file-based storage instance
 */
export function createFileStorage(dbPath: string): CausalStorage {
  return new CausalStorage(dbPath);
}

/**
 * Create a storage instance (auto-detects memory vs file based on path)
 */
export function createStorage(dbPath?: string): CausalStorage {
  if (!dbPath || dbPath === ':memory:') {
    return createMemoryStorage();
  }
  return createFileStorage(dbPath);
}

// Export the class with an alias for compatibility
export { CausalStorage as SqliteCausalStorage };
