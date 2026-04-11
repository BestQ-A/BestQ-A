#!/usr/bin/env node
/**
 * SWE-bench Evaluation with Causal Learner MCP
 *
 * This script prepares the evaluation setup for testing Claude Code + MCP
 * on SWE-bench without test set pollution.
 *
 * Evaluation Design:
 * 1. Train long-term DB on training set (80% of data)
 * 2. For each test issue:
 *    a. Use MCP to get suggestions (suggest_causes, load_relevant_knowledge)
 *    b. Let Claude Code generate a patch
 *    c. (Manually) Run SWE-bench tests to verify
 *
 * Usage:
 *   node scripts/swebench-evaluate.mjs --prepare     # Prepare clean long-term DB
 *   node scripts/swebench-evaluate.mjs --export-test # Export test set for evaluation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

// Dynamic imports
const { createDualStorage } = await import(path.join(distPath, 'core', 'index.js'));
const { submitObservationTool } = await import(path.join(distPath, 'tools', 'observation.js'));
const { triggerInductionTool } = await import(path.join(distPath, 'tools', 'induction.js'));
const { recordFixTool } = await import(path.join(distPath, 'tools', 'swebench.js'));

// Paths
const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'swebench', 'swebench_verified.json');
const EVAL_DB_PATH = path.join(__dirname, '..', '..', 'data', 'eval-longterm.db');
const TEST_SET_PATH = path.join(__dirname, '..', '..', 'data', 'swebench-test-set.json');
const TRAIN_SET_PATH = path.join(__dirname, '..', '..', 'data', 'swebench-train-set.json');

// Config
const TRAIN_RATIO = 0.8;
const SEED = 42;

function seededRandom(seed) {
  let state = seed;
  return function() {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function shuffleArray(array, random) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function loadJsonl(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}

function sweToObservation(entry) {
  const [org, repoName] = entry.repo.split('/');
  const facts = [
    { pred: 'repo_org', value: org },
    { pred: 'repo_name', value: repoName },
  ];
  const focusFacts = [];

  if (entry.FAIL_TO_PASS) {
    facts.push({ pred: 'has_failing_tests', value: true });
    focusFacts.push({ pred: 'test_failure', value: org });
  }

  const descLower = (entry.problem_statement || '').toLowerCase();

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
  }
  if (descLower.includes('valueerror')) {
    facts.push({ pred: 'error_type', value: 'ValueError' });
  }

  if (descLower.includes('regression')) {
    facts.push({ pred: 'issue_category', value: 'regression' });
    focusFacts.push({ pred: 'regression', value: org });
  }

  if (focusFacts.length === 0) {
    focusFacts.push({ pred: 'needs_resolution', value: org });
  }

  return {
    observationId: 'obs_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
    timestamp: new Date().toISOString(),
    facts,
    context: { source: 'swe-bench', repo: entry.repo },
    focusFacts,
    metadata: { instance_id: entry.instance_id },
  };
}

async function prepareCleanDB() {
  console.log('=== Preparing Clean Long-term DB for Evaluation ===\n');

  // Remove existing eval DB
  if (fs.existsSync(EVAL_DB_PATH)) {
    fs.unlinkSync(EVAL_DB_PATH);
    console.log('Removed existing eval DB');
  }

  // Load and split data
  console.log('Loading SWE-bench data...');
  const data = loadJsonl(DATA_PATH);
  console.log(`Total entries: ${data.length}`);

  const random = seededRandom(SEED);
  const shuffled = shuffleArray(data, random);
  const splitIndex = Math.floor(shuffled.length * TRAIN_RATIO);
  const trainData = shuffled.slice(0, splitIndex);
  const testData = shuffled.slice(splitIndex);

  console.log(`Train set: ${trainData.length} samples`);
  console.log(`Test set: ${testData.length} samples`);

  // Save train/test splits for reproducibility
  fs.writeFileSync(TRAIN_SET_PATH, JSON.stringify(trainData, null, 2));
  fs.writeFileSync(TEST_SET_PATH, JSON.stringify(testData, null, 2));
  console.log(`\nSaved train set to: ${TRAIN_SET_PATH}`);
  console.log(`Saved test set to: ${TEST_SET_PATH}`);

  // Initialize storage
  const storage = createDualStorage(EVAL_DB_PATH);
  storage.setTestMode(false);  // Training mode

  // Import training data
  console.log('\n--- Training Phase ---');
  let events = 0;
  const eventFixPairs = [];

  for (const entry of trainData) {
    const obs = sweToObservation(entry);
    const result = submitObservationTool(storage, obs, {
      minScore: -3.0,
      maxAssumptions: 2,
      updateEvidence: true,
    });

    if (!result.explained && result.eventCreated) {
      events++;
      eventFixPairs.push({ eventId: result.eventCreated.eventId, entry });
    }
  }
  console.log(`Created ${events} events from training data`);

  // Run induction
  console.log('\nRunning induction...');
  const inductionResult = triggerInductionTool(storage, {
    minClusterSize: 2,
    minSimilarity: 0.3,
    maxRegulationsPerCluster: 5,
    autoValidate: true,
    resolveEvents: true,
  });
  console.log(`Clusters found: ${inductionResult.clustersFound}`);
  console.log(`Regulations created: ${inductionResult.regulationsCreated?.length || 0}`);

  // Record fixes
  console.log('\nRecording fixes...');
  let fixes = 0;
  for (const { eventId, entry } of eventFixPairs) {
    const event = storage.getEvent(eventId);
    if (event && event.status === 'open' && entry.patch) {
      const filesChanged = entry.patch.match(/diff --git a\/(.+?) b\//g)?.map(m =>
        m.replace('diff --git a/', '').replace(' b/', '')
      ) || [];

      try {
        recordFixTool(storage, eventId, {
          fixCommit: entry.base_commit,
          fixDescription: `Fix: ${entry.instance_id}`,
          filesChanged,
          testsPassed: true,
        });
        fixes++;
      } catch (e) {}
    }
  }
  console.log(`Recorded ${fixes} fixes`);

  // Flush to long-term
  console.log('\nFlushing to long-term storage...');
  const flushResult = storage.flushToLongterm();
  console.log(`Regulations merged: ${flushResult.regulationsMerged}`);
  console.log(`Events archived: ${flushResult.eventsArchived}`);

  // Final stats
  const stats = storage.getDualStats();
  console.log('\n=== Final Statistics ===');
  console.log(`Long-term regulations: ${stats.longTerm.regulationCount}`);
  console.log(`Long-term events (archived): ${stats.longTerm.eventCount}`);

  storage.close();

  console.log('\n=== Preparation Complete ===');
  console.log(`Clean long-term DB: ${EVAL_DB_PATH}`);
  console.log(`Test set (${testData.length} issues): ${TEST_SET_PATH}`);
  console.log('\nNext steps:');
  console.log('1. Configure MCP to use this DB:');
  console.log(`   CAUSAL_LONGTERM_DB_PATH="${EVAL_DB_PATH}"`);
  console.log('2. Run evaluation with: node scripts/swebench-evaluate.mjs --export-test');
  console.log('3. Use Claude Code to solve each test issue with MCP assistance');
}

async function exportTestSet() {
  console.log('=== Exporting Test Set for Evaluation ===\n');

  if (!fs.existsSync(TEST_SET_PATH)) {
    console.error('Test set not found. Run with --prepare first.');
    process.exit(1);
  }

  const testData = JSON.parse(fs.readFileSync(TEST_SET_PATH, 'utf-8'));
  console.log(`Test set size: ${testData.length} issues\n`);

  // Export in a format suitable for evaluation
  const evalFormat = testData.map((entry, idx) => ({
    id: idx + 1,
    instance_id: entry.instance_id,
    repo: entry.repo,
    problem_statement: entry.problem_statement?.substring(0, 500) + '...',
    fail_to_pass: entry.FAIL_TO_PASS,
    // Note: patch is NOT included to prevent data leakage
  }));

  const evalPath = path.join(__dirname, '..', '..', 'data', 'swebench-eval-issues.json');
  fs.writeFileSync(evalPath, JSON.stringify(evalFormat, null, 2));

  console.log(`Exported ${evalFormat.length} issues to: ${evalPath}`);
  console.log('\nSample issue:');
  console.log(JSON.stringify(evalFormat[0], null, 2));

  console.log('\n=== Evaluation Protocol ===');
  console.log(`
For each issue in the test set:

1. Start fresh Claude Code session with MCP configured
2. Give Claude the issue description (NOT the patch!)
3. Let Claude use MCP tools:
   - suggest_causes: Get possible causes based on learned patterns
   - load_relevant_knowledge: Load relevant regulations
4. Claude generates a patch
5. Run SWE-bench tests to verify

Expected baseline (Opus 4.5 without MCP): ~80.9%
Hypothesis: MCP should help with issues matching learned patterns
  `);
}

// Main
const args = process.argv.slice(2);
if (args.includes('--prepare')) {
  await prepareCleanDB();
} else if (args.includes('--export-test')) {
  await exportTestSet();
} else {
  console.log(`
SWE-bench Evaluation with Causal Learner MCP

Usage:
  node scripts/swebench-evaluate.mjs --prepare      Prepare clean long-term DB from training set
  node scripts/swebench-evaluate.mjs --export-test  Export test set for evaluation

Evaluation Flow:
  1. --prepare: Creates long-term DB from 80% training data (NO test data)
  2. --export-test: Exports 20% test issues (without patches)
  3. Manual: Run Claude Code on each test issue with MCP
  4. Manual: Verify with SWE-bench test harness
  `);
}
