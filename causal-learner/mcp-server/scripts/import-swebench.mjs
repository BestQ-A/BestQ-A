#!/usr/bin/env node
/**
 * Import SWE-bench data into causal learner
 * Uses keyword-based approach for initial phase
 */

import { createStorage } from '../dist/core/storage.js';
import { extractHybridFeatures } from '../dist/core/keywords.js';
import { submitObservationTool } from '../dist/tools/observation.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Convert SWE-bench issue to observation using keyword extraction
 */
function issueToObservation(issue, index) {
  // Combine problem statement and error info
  const fullText = [
    issue.problem_statement || '',
    issue.FAIL_TO_PASS || '',
    issue.PASS_TO_PASS || '',
  ].join('\n');

  // Extract keywords and patterns (Phase 1 approach)
  const { keywords, patterns, combined } = extractHybridFeatures(fullText, 20);

  // Create facts from keywords (treating each keyword as a potential predicate)
  const facts = [];

  // Add pattern facts (structured)
  for (const pattern of patterns) {
    const [pred, value] = pattern.split(':');
    facts.push({ pred, value: value || true });
  }

  // Add keyword facts (free-form, for clustering)
  for (let i = 0; i < Math.min(keywords.length, 10); i++) {
    facts.push({
      pred: 'keyword',
      value: keywords[i],
      args: { rank: i, source: 'tfidf' },
    });
  }

  // Add basic facts
  facts.push({ pred: 'has_issue', value: true });
  facts.push({ pred: 'repo', value: issue.repo });

  if (issue.test_patch) {
    facts.push({ pred: 'has_test_patch', value: true });
  }

  return {
    observationId: `swe_${issue.instance_id}`,
    timestamp: new Date().toISOString(),
    facts,
    context: {
      source: 'swebench',
      repo: issue.repo,
      instance_id: issue.instance_id,
      base_commit: issue.base_commit,
      version: issue.version,
    },
    focusFacts: [{ pred: 'has_issue', value: true }],
    rawRefs: [
      issue.problem_statement?.substring(0, 1000),
      fullText.substring(0, 2000),
    ].filter(Boolean),
    metadata: {
      instance_id: issue.instance_id,
      keywords: combined,
      hints_text: issue.hints_text,
    },
  };
}

async function importSWEBench(jsonFile, limit = 50) {
  console.log(`📥 Importing SWE-bench data from: ${jsonFile}`);
  console.log(`   Limit: ${limit} issues\n`);

  // Load JSON file
  let data;
  try {
    const content = fs.readFileSync(jsonFile, 'utf-8');
    data = JSON.parse(content);
  } catch (err) {
    console.error(`❌ Failed to load ${jsonFile}:`, err.message);
    return;
  }

  // Handle both array and JSONL format
  const issues = Array.isArray(data) ? data : [data];
  const toProcess = issues.slice(0, limit);

  console.log(`📊 Found ${issues.length} issues, processing ${toProcess.length}`);

  // Initialize storage
  const dbPath = path.join(__dirname, '../../data/causal.db');
  const storage = await createStorage(dbPath);

  // Import each issue
  let created = 0;
  let explained = 0;

  for (const [index, issue] of toProcess.entries()) {
    const obs = issueToObservation(issue, index);
    const result = submitObservationTool(storage, obs);

    if (result.explained) {
      explained++;
    } else if (result.eventCreated) {
      created++;
    }

    if ((index + 1) % 10 === 0) {
      console.log(`   Processed ${index + 1}/${toProcess.length}...`);
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   Total processed: ${toProcess.length}`);
  console.log(`   Events created: ${created}`);
  console.log(`   Explained: ${explained}`);

  // Get final stats
  const stats = storage.getStats();
  console.log(`\n📊 Final statistics:`);
  console.log(`   Observations: ${stats.observationCount}`);
  console.log(`   Events (open): ${stats.eventsByStatus.open}`);
  console.log(`   Regulations: ${stats.regulationCount}`);

  storage.close();
}

// Main
const args = process.argv.slice(2);
const jsonFile = args[0] || path.join(__dirname, '../../../data/swebench/swebench_verified.json');
const limit = parseInt(args[1]) || 50;

if (!fs.existsSync(jsonFile)) {
  console.error(`❌ File not found: ${jsonFile}`);
  console.log('\nPlease download SWE-bench first:');
  console.log('  cd causal-learner');
  console.log('  python scripts/download-swebench.py');
  process.exit(1);
}

importSWEBench(jsonFile, limit).catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
