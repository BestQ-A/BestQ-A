#!/usr/bin/env node
/**
 * SWE-bench Train/Test Separation Script
 *
 * Usage:
 *   node scripts/swebench-train-test.mjs [options]
 *
 * Options:
 *   --train-ratio 0.8     Ratio of data for training (default: 0.8)
 *   --data-path PATH      Path to swebench_verified.json
 *   --longterm-db PATH    Path to long-term database
 *   --seed 42             Random seed for reproducible splits
 *   --train-only          Only run training phase
 *   --test-only           Only run testing phase (requires existing long-term DB)
 *   --verbose             Show detailed output
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import from compiled dist
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

// Dynamic import of core modules
const { createDualStorage } = await import(path.join(distPath, 'core', 'index.js'));
const { importSweIssueTool, recordFixTool } = await import(path.join(distPath, 'tools', 'swebench.js'));
const { triggerInductionTool } = await import(path.join(distPath, 'tools', 'induction.js'));
const { submitObservationTool } = await import(path.join(distPath, 'tools', 'observation.js'));

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    trainRatio: 0.8,
    dataPath: path.join(__dirname, '..', '..', 'data', 'swebench', 'swebench_verified.json'),
    longtermDbPath: path.join(__dirname, '..', '..', 'data', 'longterm-train.db'),
    seed: 42,
    trainOnly: false,
    testOnly: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--train-ratio':
        options.trainRatio = parseFloat(args[++i]);
        break;
      case '--data-path':
        options.dataPath = args[++i];
        break;
      case '--longterm-db':
        options.longtermDbPath = args[++i];
        break;
      case '--seed':
        options.seed = parseInt(args[++i]);
        break;
      case '--train-only':
        options.trainOnly = true;
        break;
      case '--test-only':
        options.testOnly = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
SWE-bench Train/Test Separation Script

Usage:
  node scripts/swebench-train-test.mjs [options]

Options:
  --train-ratio 0.8     Ratio of data for training (default: 0.8)
  --data-path PATH      Path to swebench_verified.json
  --longterm-db PATH    Path to long-term database
  --seed 42             Random seed for reproducible splits
  --train-only          Only run training phase
  --test-only           Only run testing phase (requires existing long-term DB)
  --verbose             Show detailed output
        `);
        process.exit(0);
    }
  }

  return options;
}

// Seeded random for reproducible splits
function seededRandom(seed) {
  let state = seed;
  return function() {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Shuffle array with seed
function shuffleArray(array, random) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Load JSONL data
function loadJsonl(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  return lines.map(line => JSON.parse(line));
}

// Convert SWE-bench entry to SweIssue format
function sweToIssue(entry) {
  return {
    issueId: entry.instance_id,
    repo: entry.repo,
    title: entry.problem_statement?.substring(0, 100) || entry.instance_id,
    description: entry.problem_statement || '',
    errorLog: entry.FAIL_TO_PASS || '',
    stackTrace: '',
    testFile: '',
    failingTests: typeof entry.FAIL_TO_PASS === 'string'
      ? entry.FAIL_TO_PASS.split(',').map(s => s.trim())
      : [],
    labels: [entry.repo.split('/')[0], entry.difficulty || 'unknown'],
  };
}

// Convert SWE-bench entry to Observation format for submitObservationTool
function sweToObservation(entry) {
  const issue = sweToIssue(entry);
  const facts = [];

  // Add repo organization (more generalizable than full repo)
  const [org, repoName] = issue.repo.split('/');
  facts.push({ pred: 'repo_org', value: org });
  facts.push({ pred: 'repo_name', value: repoName });

  // Focus fact: test_failure is what we want to explain
  const focusFacts = [];

  // Extract error information from FAIL_TO_PASS
  if (entry.FAIL_TO_PASS) {
    facts.push({ pred: 'has_failing_tests', value: true });

    // Parse test info
    const failToPass = entry.FAIL_TO_PASS;
    if (failToPass.includes('test_')) {
      facts.push({ pred: 'test_pattern', value: 'unit_test' });
    }

    // Add test failure as focus fact - needs explanation
    focusFacts.push({ pred: 'test_failure', value: org });
  }

  // Extract from problem statement
  const desc = entry.problem_statement || '';
  const descLower = desc.toLowerCase();

  // Error types as facts
  if (descLower.includes('typeerror')) {
    facts.push({ pred: 'error_type', value: 'TypeError' });
    focusFacts.push({ pred: 'type_error', value: org });
  }
  if (descLower.includes('attributeerror')) {
    facts.push({ pred: 'error_type', value: 'AttributeError' });
    focusFacts.push({ pred: 'attribute_error', value: org });
  }
  if (descLower.includes('keyerror')) {
    facts.push({ pred: 'error_type', value: 'KeyError' });
    focusFacts.push({ pred: 'key_error', value: org });
  }
  if (descLower.includes('valueerror')) {
    facts.push({ pred: 'error_type', value: 'ValueError' });
    focusFacts.push({ pred: 'value_error', value: org });
  }
  if (descLower.includes('indexerror')) {
    facts.push({ pred: 'error_type', value: 'IndexError' });
    focusFacts.push({ pred: 'index_error', value: org });
  }

  // Issue categories
  if (descLower.includes('bug') || descLower.includes('fix')) {
    facts.push({ pred: 'issue_category', value: 'bug' });
  }
  if (descLower.includes('regression')) {
    facts.push({ pred: 'issue_category', value: 'regression' });
    focusFacts.push({ pred: 'regression', value: org });
  }
  if (descLower.includes('crash') || descLower.includes('segfault')) {
    facts.push({ pred: 'issue_category', value: 'crash' });
    focusFacts.push({ pred: 'crash', value: org });
  }
  if (descLower.includes('deprecat')) {
    facts.push({ pred: 'issue_category', value: 'deprecation' });
  }

  // Domain hints
  if (descLower.includes('numpy') || descLower.includes('array')) {
    facts.push({ pred: 'domain', value: 'numeric' });
  }
  if (descLower.includes('pandas') || descLower.includes('dataframe')) {
    facts.push({ pred: 'domain', value: 'dataframe' });
  }
  if (descLower.includes('matplotlib') || descLower.includes('plot')) {
    facts.push({ pred: 'domain', value: 'visualization' });
  }
  if (descLower.includes('django') || descLower.includes('flask')) {
    facts.push({ pred: 'domain', value: 'web' });
  }

  // Ensure at least one focus fact
  if (focusFacts.length === 0) {
    focusFacts.push({ pred: 'needs_resolution', value: org });
  }

  return {
    observationId: 'obs_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
    timestamp: new Date().toISOString(),
    facts: facts,
    context: { source: 'swe-bench', repo: issue.repo },
    focusFacts: focusFacts,
    metadata: {
      title: issue.title,
      instance_id: entry.instance_id,
    },
  };
}

// Training phase
async function trainPhase(storage, trainData, options) {
  console.log('\n=== TRAINING PHASE ===');
  console.log(`Training on ${trainData.length} samples...`);

  // Disable test mode for training
  storage.setTestMode(false);

  let imported = 0;
  let eventsCreated = 0;
  const eventFixPairs = [];  // Store event-fix pairs for later

  for (const entry of trainData) {
    try {
      const observation = sweToObservation(entry);
      // Use submitObservationTool which calls processObservation and creates events
      const result = submitObservationTool(storage, observation, {
        minScore: -3.0,  // Lower threshold to create more events initially
        maxAssumptions: 2,
        updateEvidence: true,
      });
      imported++;

      // Check if event was created (observation was NOT explained)
      if (!result.explained && result.eventCreated) {
        eventsCreated++;
        // Store entry for later fix recording
        eventFixPairs.push({ eventId: result.eventCreated.eventId, entry });
      }

      if (options.verbose && imported % 50 === 0) {
        console.log(`  Imported ${imported}/${trainData.length}, events: ${eventsCreated}...`);
      }
    } catch (error) {
      if (options.verbose) {
        console.error(`  Error importing ${entry.instance_id}:`, error.message);
      }
    }
  }

  console.log(`Imported ${imported} issues, created ${eventsCreated} events`);

  // Trigger induction to learn regulations
  console.log('\nRunning induction to learn regulations...');
  const inductionResult = triggerInductionTool(storage, {
    minClusterSize: 2,
    minSimilarity: 0.3,
    maxRegulationsPerCluster: 5,
    autoValidate: true,
    resolveEvents: true,
  });

  console.log(`Induction result:`, JSON.stringify(inductionResult, null, 2));

  // Now record fixes for remaining open events (this will create regulations from fixes)
  console.log('\nRecording fixes for unresolved events...');
  let fixesRecorded = 0;
  for (const { eventId, entry } of eventFixPairs) {
    try {
      const event = storage.getEvent(eventId);
      if (event && event.status === 'open') {
        if (entry.patch) {
          const filesChanged = entry.patch.match(/diff --git a\/(.+?) b\//g)?.map(m =>
            m.replace('diff --git a/', '').replace(' b/', '')
          ) || [];

          recordFixTool(storage, eventId, {
            fixCommit: entry.base_commit,
            fixDescription: `Fix for ${entry.instance_id}`,
            filesChanged,
            linesChanged: (entry.patch.match(/\n/g) || []).length,
            testsPassed: true,
          });
          fixesRecorded++;
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }
  console.log(`Recorded ${fixesRecorded} fixes`);

  // Flush to long-term storage
  console.log('\nFlushing to long-term storage...');
  const flushResult = storage.flushToLongterm();
  console.log(`Flush result:`, JSON.stringify(flushResult, null, 2));

  return {
    imported,
    eventsCreated,
    inductionResult,
    fixesRecorded,
    flushResult,
  };
}

// Testing phase
async function testPhase(storage, testData, options) {
  console.log('\n=== TESTING PHASE ===');
  console.log(`Testing on ${testData.length} samples...`);

  // Enable test mode to prevent polluting long-term DB
  storage.setTestMode(true);

  // Reset short-term storage
  storage.resetShortTerm();

  let tested = 0;
  let explained = 0;
  let unexplained = 0;
  let totalRegulationsLoaded = 0;
  const results = [];

  for (const entry of testData) {
    try {
      const observation = sweToObservation(entry);

      // First, load relevant knowledge from long-term DB based on observation
      const loadResult = storage.loadRelevantKnowledge(observation);
      totalRegulationsLoaded += loadResult.loaded;

      // Submit observation using submitObservationTool
      const result = submitObservationTool(storage, observation, {
        minScore: -2.0,
        maxAssumptions: 3,
        updateEvidence: false,  // Don't update evidence in test mode
      });
      tested++;

      // Use result.explained to determine if observation was explained
      if (result.explained) {
        explained++;
      } else {
        unexplained++;
      }

      results.push({
        instanceId: entry.instance_id,
        repo: entry.repo,
        explained: result.explained,
        regulationsLoaded: loadResult.loaded,
        bestStoryScore: result.story?.score,
      });

      if (options.verbose && tested % 20 === 0) {
        console.log(`  Tested ${tested}/${testData.length}, explained: ${explained}, unexplained: ${unexplained}`);
      }
    } catch (error) {
      if (options.verbose) {
        console.error(`  Error testing ${entry.instance_id}:`, error.message);
      }
    }
  }

  console.log(`\nTotal regulations loaded from long-term: ${totalRegulationsLoaded}`);

  const explainRate = (explained / tested * 100).toFixed(2);

  console.log(`\nTest Results:`);
  console.log(`  Total tested: ${tested}`);
  console.log(`  Explained: ${explained} (${explainRate}%)`);
  console.log(`  Unexplained: ${unexplained}`);

  return {
    tested,
    explained,
    unexplained,
    explainRate: parseFloat(explainRate),
    results,
  };
}

// Main function
async function main() {
  const options = parseArgs();

  console.log('SWE-bench Train/Test Separation');
  console.log('================================');
  console.log(`Data path: ${options.dataPath}`);
  console.log(`Long-term DB: ${options.longtermDbPath}`);
  console.log(`Train ratio: ${options.trainRatio}`);
  console.log(`Seed: ${options.seed}`);

  // Load data
  console.log('\nLoading data...');
  const data = loadJsonl(options.dataPath);
  console.log(`Loaded ${data.length} entries`);

  // Split data
  const random = seededRandom(options.seed);
  const shuffled = shuffleArray(data, random);
  const splitIndex = Math.floor(shuffled.length * options.trainRatio);
  const trainData = shuffled.slice(0, splitIndex);
  const testData = shuffled.slice(splitIndex);

  console.log(`Train set: ${trainData.length} samples`);
  console.log(`Test set: ${testData.length} samples`);

  // Initialize dual storage
  const storage = createDualStorage(options.longtermDbPath);

  let trainResult = null;
  let testResult = null;

  try {
    // Training phase
    if (!options.testOnly) {
      trainResult = await trainPhase(storage, trainData, options);
    }

    // Testing phase
    if (!options.trainOnly) {
      testResult = await testPhase(storage, testData, options);
    }

    // Final summary
    console.log('\n=== FINAL SUMMARY ===');

    const dualStats = storage.getDualStats();
    console.log('\nStorage Statistics:');
    console.log(`  Short-term regulations: ${dualStats.shortTerm.regulationCount}`);
    console.log(`  Long-term regulations: ${dualStats.longTerm.regulationCount}`);
    console.log(`  Test mode: ${dualStats.testMode}`);

    if (trainResult) {
      console.log('\nTraining:');
      console.log(`  Imported: ${trainResult.imported}`);
      console.log(`  Events created: ${trainResult.eventsCreated}`);
      console.log(`  Regulations merged: ${trainResult.flushResult.regulationsMerged}`);
    }

    if (testResult) {
      console.log('\nTesting:');
      console.log(`  Tested: ${testResult.tested}`);
      console.log(`  Explain rate: ${testResult.explainRate}%`);
    }

    // Save results
    const resultsPath = path.join(path.dirname(options.longtermDbPath), 'train-test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
      options,
      trainResult,
      testResult,
      dualStats,
      timestamp: new Date().toISOString(),
    }, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);

  } finally {
    storage.close();
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
