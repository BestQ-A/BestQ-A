/**
 * SWE-bench integration tools for the Causal Learner
 * Provides tools for importing issues, recording fixes, and suggesting causes
 */

import { v4 as uuidv4 } from 'uuid';
import type { Observation, Event, Regulation, Fact } from '../core/index.js';
import { detectEvent, explainObservation, EffectIndex } from '../core/index.js';
import type { CausalStorage } from '../core/index.js';

/**
 * SWE-bench issue input
 */
export interface SweIssue {
  issueId: string;
  repo: string;
  title: string;
  description: string;
  errorLog?: string;
  stackTrace?: string;
  testFile?: string;
  failingTests?: string[];
  labels?: string[];
}

/**
 * Fix information
 */
export interface FixInfo {
  fixCommit: string;
  fixDescription: string;
  filesChanged?: string[];
  linesChanged?: number;
  testsPassed?: boolean;
}

/**
 * A cause suggestion with confidence score
 */
export interface CauseSuggestion {
  regulationId: string;
  description?: string;
  score: number;
  matchedPredicates: string[];
  suggestedFix?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Generate a new observation ID
 */
function newObservationId(): string {
  return 'obs_' + uuidv4().substring(0, 8);
}

/**
 * Extract facts from an error log
 */
function extractFactsFromErrorLog(errorLog: string): Fact[] {
  const facts: Fact[] = [];

  // Extract error type
  const errorTypeMatch = errorLog.match(/(\w+Error):/);
  if (errorTypeMatch) {
    facts.push({
      pred: 'error_type',
      value: errorTypeMatch[1],
    });
  }

  // Extract file references
  const fileMatches = errorLog.matchAll(/File ["\']([^"\']+)["\']/g);
  for (const match of fileMatches) {
    facts.push({
      pred: 'error_file',
      value: match[1],
    });
  }

  // Extract line numbers
  const lineMatches = errorLog.matchAll(/line (\d+)/gi);
  for (const match of lineMatches) {
    facts.push({
      pred: 'error_line',
      value: parseInt(match[1]),
    });
  }

  // Extract function/method names
  const funcMatches = errorLog.matchAll(/in (\w+)/g);
  for (const match of funcMatches) {
    facts.push({
      pred: 'error_function',
      value: match[1],
    });
  }

  // Check for common error patterns
  if (errorLog.includes('ImportError') || errorLog.includes('ModuleNotFoundError')) {
    facts.push({ pred: 'error_category', value: 'import_error' });
  }
  if (errorLog.includes('AttributeError')) {
    facts.push({ pred: 'error_category', value: 'attribute_error' });
  }
  if (errorLog.includes('TypeError')) {
    facts.push({ pred: 'error_category', value: 'type_error' });
  }
  if (errorLog.includes('ValueError')) {
    facts.push({ pred: 'error_category', value: 'value_error' });
  }
  if (errorLog.includes('KeyError')) {
    facts.push({ pred: 'error_category', value: 'key_error' });
  }
  if (errorLog.includes('IndexError')) {
    facts.push({ pred: 'error_category', value: 'index_error' });
  }
  if (errorLog.includes('AssertionError')) {
    facts.push({ pred: 'error_category', value: 'assertion_error' });
  }

  return facts;
}

/**
 * Extract facts from issue description
 */
function extractFactsFromDescription(description: string): Fact[] {
  const facts: Fact[] = [];

  // Check for keywords indicating issue type
  if (description.toLowerCase().includes('crash')) {
    facts.push({ pred: 'issue_type', value: 'crash' });
  }
  if (description.toLowerCase().includes('hang') || description.toLowerCase().includes('freeze')) {
    facts.push({ pred: 'issue_type', value: 'hang' });
  }
  if (description.toLowerCase().includes('memory') || description.toLowerCase().includes('leak')) {
    facts.push({ pred: 'issue_type', value: 'memory_issue' });
  }
  if (description.toLowerCase().includes('performance') || description.toLowerCase().includes('slow')) {
    facts.push({ pred: 'issue_type', value: 'performance' });
  }
  if (description.toLowerCase().includes('regression')) {
    facts.push({ pred: 'issue_type', value: 'regression' });
  }

  // Extract version references
  const versionMatches = description.matchAll(/v?(\d+\.\d+(?:\.\d+)?)/g);
  for (const match of versionMatches) {
    facts.push({
      pred: 'version_reference',
      value: match[1],
    });
  }

  // Extract file references
  const fileMatches = description.matchAll(/[\w\/]+\.(py|js|ts|java|cpp|c|h|go|rs)/g);
  for (const match of fileMatches) {
    facts.push({
      pred: 'referenced_file',
      value: match[0],
    });
  }

  return facts;
}

/**
 * Import a SWE-bench issue and create an Observation
 *
 * @param storage - The causal storage instance
 * @param issue - The SWE-bench issue to import
 * @returns The created observation
 */
export function importSweIssueTool(
  storage: CausalStorage,
  issue: SweIssue
): Observation {
  const facts: Fact[] = [
    { pred: 'issue_id', value: issue.issueId },
    { pred: 'repo', value: issue.repo },
    { pred: 'has_issue', value: true },
  ];

  // Extract facts from error log
  if (issue.errorLog) {
    facts.push(...extractFactsFromErrorLog(issue.errorLog));
  }

  // Extract facts from description
  facts.push(...extractFactsFromDescription(issue.description));

  // Add failing tests
  if (issue.failingTests && issue.failingTests.length > 0) {
    facts.push({ pred: 'has_failing_tests', value: true });
    facts.push({ pred: 'failing_test_count', value: issue.failingTests.length });
    for (const test of issue.failingTests.slice(0, 5)) {
      facts.push({ pred: 'failing_test', value: test });
    }
  }

  // Add test file reference
  if (issue.testFile) {
    facts.push({ pred: 'test_file', value: issue.testFile });
  }

  // Add labels
  if (issue.labels && issue.labels.length > 0) {
    for (const label of issue.labels) {
      facts.push({ pred: 'issue_label', value: label });
    }
  }

  // Create the observation
  const observation: Observation = {
    observationId: newObservationId(),
    timestamp: new Date().toISOString(),
    facts: facts,
    context: {
      source: 'swe-bench',
      repo: issue.repo,
      issueId: issue.issueId,
    },
    focusFacts: [{ pred: 'has_issue', value: true }],
    rawRefs: [issue.title, issue.description].filter(Boolean),
    metadata: {
      title: issue.title,
      description: issue.description.substring(0, 500),
      errorLog: issue.errorLog?.substring(0, 1000),
      stackTrace: issue.stackTrace?.substring(0, 1000),
    },
  };

  // Save the observation
  storage.saveObservation(observation);

  return observation;
}

/**
 * Record a successful fix and update regulations
 *
 * @param storage - The causal storage instance
 * @param eventId - The event ID that was fixed
 * @param fix - Information about the fix
 * @returns The updated or created regulation
 */
export function recordFixTool(
  storage: CausalStorage,
  eventId: string,
  fix: FixInfo
): Regulation | null {
  const event = storage.getEvent(eventId);
  if (!event) {
    return null;
  }

  // Find existing regulation that might have predicted this or create new one
  const regulations = storage.listRegulations({ limit: 1000 });
  let targetReg: Regulation | null = null;

  // Look for regulation that matches the event's unexplained aspects
  for (const reg of regulations) {
    const effMatch = reg.eff.some(eff =>
      event.unexplainedAspects.some(
        ua => ua.pred === eff.pred && ua.value === eff.value
      )
    );
    if (effMatch) {
      targetReg = reg;
      break;
    }
  }

  if (targetReg) {
    // Update existing regulation with evidence
    targetReg.supportN = (targetReg.supportN || 0) + 1;
    targetReg.explainedCount = (targetReg.explainedCount || 0) + 1;
    targetReg.lastUsed = new Date().toISOString();

    // Add fix information to metadata
    targetReg.metadata = targetReg.metadata || {};
    targetReg.metadata.fixes = targetReg.metadata.fixes || [];
    (targetReg.metadata.fixes as FixInfo[]).push(fix);

    // Promote status if enough evidence
    if ((targetReg.supportN || 0) >= 3 && targetReg.status === 'candidate') {
      targetReg.status = 'hypothesis';
    }
    if ((targetReg.supportN || 0) >= 10 && targetReg.status === 'hypothesis') {
      targetReg.status = 'confirmed';
    }

    storage.updateRegulation(targetReg);
  } else {
    // Create new regulation from the fix
    const newReg: Regulation = {
      regulationId: 'reg_' + uuidv4().substring(0, 8),
      status: 'candidate',
      pre: event.observation.facts.slice(0, 5), // Use observation facts as preconditions
      eff: event.unexplainedAspects.slice(0, 3),
      evidenceKind: 'quasi_experiment', // Fix is quasi-experimental evidence
      supportN: 1,
      counterexampleN: 0,
      explainedCount: 1,
      failedPredictions: 0,
      lastUsed: new Date().toISOString(),
      description: fix.fixDescription,
      origin: {
        source: 'fix_recording',
        eventId: eventId,
        fixCommit: fix.fixCommit,
        created: new Date().toISOString(),
      },
      metadata: {
        fixes: [fix],
        filesChanged: fix.filesChanged,
      },
      tags: ['from-fix'],
    };

    storage.saveRegulation(newReg);
    targetReg = newReg;
  }

  // Resolve the event
  storage.updateEventStatus(eventId, 'resolved');

  return targetReg;
}

/**
 * Suggest possible causes for an observation or event
 *
 * @param storage - The causal storage instance
 * @param obs - The observation to analyze
 * @returns Array of cause suggestions sorted by score
 */
export function suggestCausesTool(
  storage: CausalStorage,
  obs: Observation
): CauseSuggestion[] {
  const regulations = storage.listRegulations({ limit: 1000 })
    .filter(r => r.status !== 'retired');

  if (regulations.length === 0) {
    return [];
  }

  // Try to explain the observation
  const stories = explainObservation(obs, regulations, {
    topK: 10,
    beamSize: 30,
    maxDepth: 5,
    maxAssumptions: 5,
  });

  const suggestions: CauseSuggestion[] = [];

  // Convert stories to suggestions
  for (const story of stories) {
    for (const regId of story.regulationIds) {
      const reg = storage.getRegulation(regId);
      if (!reg) continue;

      // Find which predicates matched
      const matchedPreds: string[] = [];
      for (const pre of reg.pre) {
        const match = obs.facts.find(
          f => f.pred === pre.pred && f.value === pre.value
        );
        if (match) {
          matchedPreds.push(pre.pred);
        }
      }

      // Calculate confidence
      let confidence: 'high' | 'medium' | 'low' = 'low';
      const score = story.score || 0;
      if (score > -0.5) confidence = 'high';
      else if (score > -1.5) confidence = 'medium';

      // Generate suggested fix from regulation metadata
      let suggestedFix: string | undefined;
      if (reg.metadata?.fixes && Array.isArray(reg.metadata.fixes)) {
        const fixes = reg.metadata.fixes as FixInfo[];
        if (fixes.length > 0) {
          suggestedFix = fixes[0].fixDescription;
        }
      }

      suggestions.push({
        regulationId: regId,
        description: reg.description,
        score: score,
        matchedPredicates: matchedPreds,
        suggestedFix,
        confidence,
      });
    }
  }

  // Also check for partial matches with regulations
  const idx = new EffectIndex(regulations);
  for (const fact of obs.focusFacts || obs.facts) {
    const candidates = idx.candidates(fact);
    for (const reg of candidates) {
      // Skip if already in suggestions
      if (suggestions.some(s => s.regulationId === reg.regulationId)) {
        continue;
      }

      // Check precondition match
      const matchedPreds: string[] = [];
      for (const pre of reg.pre) {
        const match = obs.facts.find(
          f => f.pred === pre.pred && f.value === pre.value
        );
        if (match) {
          matchedPreds.push(pre.pred);
        }
      }

      // Only suggest if some preconditions match
      if (matchedPreds.length > 0) {
        const matchRatio = matchedPreds.length / reg.pre.length;
        const score = matchRatio * (reg.supportN || 1) / 10;

        suggestions.push({
          regulationId: reg.regulationId,
          description: reg.description,
          score: score,
          matchedPredicates: matchedPreds,
          confidence: matchRatio > 0.7 ? 'medium' : 'low',
        });
      }
    }
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);

  return suggestions.slice(0, 10);
}

/**
 * Analyze multiple SWE-bench issues and find common patterns
 *
 * @param storage - The causal storage instance
 * @param issues - Array of issues to analyze
 * @returns Analysis results with patterns found
 */
export function analyzeSweBatch(
  storage: CausalStorage,
  issues: SweIssue[]
): {
  observations: Observation[];
  patternsFound: { predicate: string; count: number }[];
  suggestedRegulations: Regulation[];
} {
  // Import all issues
  const observations = issues.map(issue => importSweIssueTool(storage, issue));

  // Count predicate occurrences
  const predCounts = new Map<string, number>();
  for (const obs of observations) {
    for (const fact of obs.facts) {
      const key = `${fact.pred}|${JSON.stringify(fact.value)}`;
      predCounts.set(key, (predCounts.get(key) || 0) + 1);
    }
  }

  // Find patterns (predicates appearing in multiple observations)
  const patternsFound = [...predCounts.entries()]
    .filter(([_, count]) => count >= 2)
    .map(([pred, count]) => ({
      predicate: pred.split('|')[0],
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Generate suggested regulations from common patterns
  const suggestedRegulations: Regulation[] = [];

  // Group observations by error category
  const byCategory = new Map<string, Observation[]>();
  for (const obs of observations) {
    const categoryFact = obs.facts.find(f => f.pred === 'error_category');
    if (categoryFact) {
      const category = String(categoryFact.value);
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(obs);
    }
  }

  // Create regulation for each category with enough samples
  for (const [category, categoryObs] of byCategory.entries()) {
    if (categoryObs.length >= 2) {
      // Find common facts
      const factCounts = new Map<string, { fact: Fact; count: number }>();
      for (const obs of categoryObs) {
        for (const fact of obs.facts) {
          const key = `${fact.pred}|${JSON.stringify(fact.value)}`;
          if (!factCounts.has(key)) {
            factCounts.set(key, { fact, count: 0 });
          }
          factCounts.get(key)!.count++;
        }
      }

      const commonFacts = [...factCounts.values()]
        .filter(({ count }) => count >= Math.ceil(categoryObs.length * 0.7))
        .map(({ fact }) => fact);

      if (commonFacts.length >= 2) {
        const reg: Regulation = {
          regulationId: 'reg_' + uuidv4().substring(0, 8),
          status: 'candidate',
          pre: commonFacts.slice(0, 4),
          eff: [{ pred: 'error_category', value: category }],
          evidenceKind: 'observational',
          supportN: categoryObs.length,
          description: `Pattern for ${category} errors`,
          origin: {
            source: 'batch_analysis',
            sampleSize: categoryObs.length,
          },
          tags: ['batch-induced', category],
        };
        suggestedRegulations.push(reg);
      }
    }
  }

  return {
    observations,
    patternsFound,
    suggestedRegulations,
  };
}
