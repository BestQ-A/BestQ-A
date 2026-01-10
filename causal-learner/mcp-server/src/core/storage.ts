/**
 * SQLite storage layer for the Causal Learner system
 *
 * Uses sql.js for pure JavaScript SQLite operations.
 * Stores observations, events, and regulations with JSON fields for complex structures.
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
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
 */
export class CausalStorage {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private initialized: boolean = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Initialize the database (must be called before use)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (this.dbPath !== ':memory:' && fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initSchema();
    this.initialized = true;
  }

  /**
   * Ensure database is initialized
   */
  private ensureInit(): void {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    this.ensureInit();
    this.db!.run(`
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

  /**
   * Save database to file
   */
  save(): void {
    if (this.dbPath !== ':memory:' && this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  // ===========================================================================
  // Observations
  // ===========================================================================

  /**
   * Save an observation to the database
   */
  saveObservation(obs: Observation): void {
    this.ensureInit();
    const data = JSON.stringify(observationToDict(obs));
    this.db!.run(
      `INSERT OR REPLACE INTO observations (observation_id, timestamp, data) VALUES (?, ?, ?)`,
      [obs.observationId, obs.timestamp, data]
    );
    this.save();
  }

  /**
   * Get an observation by ID
   */
  getObservation(id: string): Observation | null {
    this.ensureInit();
    const result = this.db!.exec(
      `SELECT data FROM observations WHERE observation_id = ?`,
      [id]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    return observationFromDict(JSON.parse(result[0].values[0][0] as string) as Json);
  }

  /**
   * List observations with optional limit
   */
  listObservations(limit = 100, offset = 0): Observation[] {
    this.ensureInit();
    const result = this.db!.exec(
      `SELECT data FROM observations ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    if (result.length === 0) return [];
    return result[0].values.map((row: unknown[]) =>
      observationFromDict(JSON.parse(row[0] as string) as Json)
    );
  }

  /**
   * Delete an observation by ID
   */
  deleteObservation(id: string): boolean {
    this.ensureInit();
    this.db!.run(`DELETE FROM observations WHERE observation_id = ?`, [id]);
    this.save();
    return this.db!.getRowsModified() > 0;
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Save an event to the database
   */
  saveEvent(event: Event): void {
    this.ensureInit();
    const data = JSON.stringify(eventToDict(event));
    this.db!.run(
      `INSERT OR REPLACE INTO events
        (event_id, timestamp, status, cluster_id, observation_id, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        event.eventId,
        event.timestamp,
        event.status || 'open',
        event.clusterId || null,
        event.observation.observationId,
        data,
      ]
    );
    this.save();
  }

  /**
   * Get an event by ID
   */
  getEvent(id: string): Event | null {
    this.ensureInit();
    const result = this.db!.exec(
      `SELECT data FROM events WHERE event_id = ?`,
      [id]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    return eventFromDict(JSON.parse(result[0].values[0][0] as string) as Json);
  }

  /**
   * List events with optional status filter
   */
  listEvents(options?: ListEventsOptions): Event[] {
    this.ensureInit();
    const { status, limit = 100, offset = 0 } = options || {};

    let sql = 'SELECT data FROM events';
    const params: (string | number)[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = this.db!.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map((row: unknown[]) =>
      eventFromDict(JSON.parse(row[0] as string) as Json)
    );
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
    this.ensureInit();
    const result = this.db!.exec(
      `SELECT data FROM events WHERE cluster_id = ? ORDER BY timestamp DESC`,
      [clusterId]
    );
    if (result.length === 0) return [];
    return result[0].values.map((row: unknown[]) =>
      eventFromDict(JSON.parse(row[0] as string) as Json)
    );
  }

  /**
   * Delete an event by ID
   */
  deleteEvent(id: string): boolean {
    this.ensureInit();
    this.db!.run(`DELETE FROM events WHERE event_id = ?`, [id]);
    this.save();
    return this.db!.getRowsModified() > 0;
  }

  // ===========================================================================
  // Regulations
  // ===========================================================================

  /**
   * Save a regulation to the database
   */
  saveRegulation(reg: Regulation): void {
    this.ensureInit();
    const data = JSON.stringify(regulationToDict(reg));
    this.db!.run(
      `INSERT OR REPLACE INTO regulations
        (regulation_id, status, description, data, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [reg.regulationId, reg.status, reg.description || null, data]
    );
    this.save();
  }

  /**
   * Get a regulation by ID
   */
  getRegulation(id: string): Regulation | null {
    this.ensureInit();
    const result = this.db!.exec(
      `SELECT data FROM regulations WHERE regulation_id = ?`,
      [id]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    return regulationFromDict(JSON.parse(result[0].values[0][0] as string) as Json);
  }

  /**
   * List regulations with optional status filter
   */
  listRegulations(options?: ListRegulationsOptions): Regulation[] {
    this.ensureInit();
    const { status, limit = 100, offset = 0 } = options || {};

    let sql = 'SELECT data FROM regulations';
    const params: (string | number)[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = this.db!.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map((row: unknown[]) =>
      regulationFromDict(JSON.parse(row[0] as string) as Json)
    );
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
    this.ensureInit();
    this.db!.run(`DELETE FROM regulations WHERE regulation_id = ?`, [id]);
    this.save();
    return this.db!.getRowsModified() > 0;
  }

  // ===========================================================================
  // Statistics & Utilities
  // ===========================================================================

  /**
   * Get storage statistics
   */
  getStats(): StorageStats {
    this.ensureInit();

    const obsCount = this.db!.exec('SELECT COUNT(*) as count FROM observations');
    const eventCount = this.db!.exec('SELECT COUNT(*) as count FROM events');
    const regCount = this.db!.exec('SELECT COUNT(*) as count FROM regulations');

    const eventStatusRows = this.db!.exec(
      'SELECT status, COUNT(*) as count FROM events GROUP BY status'
    );
    const eventsByStatus: Record<EventStatus, number> = {
      open: 0,
      clustered: 0,
      resolved: 0,
      archived: 0,
    };
    if (eventStatusRows.length > 0) {
      for (const row of eventStatusRows[0].values) {
        eventsByStatus[row[0] as EventStatus] = row[1] as number;
      }
    }

    const regStatusRows = this.db!.exec(
      'SELECT status, COUNT(*) as count FROM regulations GROUP BY status'
    );
    const regulationsByStatus: Record<RegulationStatus, number> = {
      candidate: 0,
      hypothesis: 0,
      confirmed: 0,
      retired: 0,
    };
    if (regStatusRows.length > 0) {
      for (const row of regStatusRows[0].values) {
        regulationsByStatus[row[0] as RegulationStatus] = row[1] as number;
      }
    }

    return {
      observationCount: obsCount.length > 0 ? (obsCount[0].values[0][0] as number) : 0,
      eventCount: eventCount.length > 0 ? (eventCount[0].values[0][0] as number) : 0,
      regulationCount: regCount.length > 0 ? (regCount[0].values[0][0] as number) : 0,
      eventsByStatus,
      regulationsByStatus,
    };
  }

  /**
   * Search regulations by predicate in effects
   */
  searchRegulationsByEffect(pred: string): Regulation[] {
    this.ensureInit();
    const result = this.db!.exec(
      `SELECT data FROM regulations WHERE data LIKE ?`,
      [`%"${pred}"%`]
    );
    if (result.length === 0) return [];
    return result[0].values.map((row: unknown[]) =>
      regulationFromDict(JSON.parse(row[0] as string) as Json)
    );
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
    this.ensureInit();
    const result = this.db!.exec(
      `SELECT data FROM regulations WHERE status != 'retired' ORDER BY updated_at DESC`
    );
    if (result.length === 0) return [];
    return result[0].values.map((row: unknown[]) =>
      regulationFromDict(JSON.parse(row[0] as string) as Json)
    );
  }

  /**
   * Get open events (not resolved or archived)
   */
  getOpenEvents(): Event[] {
    this.ensureInit();
    const result = this.db!.exec(
      `SELECT data FROM events WHERE status IN ('open', 'clustered') ORDER BY timestamp DESC`
    );
    if (result.length === 0) return [];
    return result[0].values.map((row: unknown[]) =>
      eventFromDict(JSON.parse(row[0] as string) as Json)
    );
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  /**
   * Export all data as JSON
   */
  exportAll(): {
    observations: Json[];
    events: Json[];
    regulations: Json[];
  } {
    this.ensureInit();
    const observations = this.db!.exec('SELECT data FROM observations');
    const events = this.db!.exec('SELECT data FROM events');
    const regulations = this.db!.exec('SELECT data FROM regulations');

    return {
      observations: observations.length > 0
        ? observations[0].values.map((r: unknown[]) => JSON.parse(r[0] as string) as Json)
        : [],
      events: events.length > 0
        ? events[0].values.map((r: unknown[]) => JSON.parse(r[0] as string) as Json)
        : [],
      regulations: regulations.length > 0
        ? regulations[0].values.map((r: unknown[]) => JSON.parse(r[0] as string) as Json)
        : [],
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
  }
}

/**
 * Create an in-memory storage instance (useful for testing)
 */
export async function createMemoryStorage(): Promise<CausalStorage> {
  const storage = new CausalStorage(':memory:');
  await storage.init();
  return storage;
}

/**
 * Create a file-based storage instance
 */
export async function createFileStorage(dbPath: string): Promise<CausalStorage> {
  const storage = new CausalStorage(dbPath);
  await storage.init();
  return storage;
}

/**
 * Create a storage instance (auto-detects memory vs file based on path)
 */
export async function createStorage(dbPath?: string): Promise<CausalStorage> {
  if (!dbPath || dbPath === ':memory:') {
    return createMemoryStorage();
  }
  return createFileStorage(dbPath);
}

// Export the class with an alias for compatibility
export { CausalStorage as SqliteCausalStorage };
