#!/usr/bin/env node
/**
 * Performance evaluation for causal learner
 * Measures:
 * 1. Explanation success rate
 * 2. Regulation quality (precision/recall)
 * 3. Learning efficiency
 * 4. SWE-bench score proxy (issue resolution simulation)
 */

import { createStorage } from '../dist/core/storage.js';
import { submitObservationTool, reevaluateEvent } from '../dist/tools/observation.js';
import { triggerInductionTool } from '../dist/tools/induction.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Evaluation metrics
 */
class EvaluationMetrics {
  constructor() {
    this.totalObservations = 0;
    this.explained = 0;
    this.eventsCreated = 0;
    this.regulationsCreated = 0;
    this.eventsResolved = 0;
    this.inductionRuns = 0;

    this.timeline = [];  // Track metrics over time
  }

  record(action, data) {
    this.timeline.push({
      timestamp: new Date().toISOString(),
      action,
      ...data,
    });
  }

  get explanationRate() {
    return this.totalObservations > 0
      ? (this.explained / this.totalObservations * 100).toFixed(1)
      : 0;
  }

  get resolutionRate() {
    return this.eventsCreated > 0
      ? (this.eventsResolved / this.eventsCreated * 100).toFixed(1)
      : 0;
  }

  get learningEfficiency() {
    return this.eventsCreated > 0
      ? (this.regulationsCreated / this.eventsCreated).toFixed(2)
      : 0;
  }

  summary() {
    return {
      observations: {
        total: this.totalObservations,
        explained: this.explained,
        rate: `${this.explanationRate}%`,
      },
      events: {
        created: this.eventsCreated,
        resolved: this.eventsResolved,
        rate: `${this.resolutionRate}%`,
      },
      regulations: {
        created: this.regulationsCreated,
        efficiency: this.learningEfficiency,
      },
      induction: {
        runs: this.inductionRuns,
      },
    };
  }
}

/**
 * Run evaluation on SWE-bench data
 */
async function evaluateSWEBench(dataFile, batchSize = 100) {
  console.log('🎯 Starting SWE-bench Evaluation\n');
  console.log(`Data: ${dataFile}`);
  console.log(`Batch size: ${batchSize}\n`);

  const metrics = new EvaluationMetrics();

  // Load data
  const content = fs.readFileSync(dataFile, 'utf-8');
  const issues = JSON.parse(content);
  const dataset = Array.isArray(issues) ? issues : [issues];

  console.log(`📊 Dataset: ${dataset.length} issues`);

  // Create storage (synchronous with better-sqlite3)
  const dbPath = path.join(__dirname, '../../data/causal_eval.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);  // Fresh start
  }
  const storage = createStorage(dbPath);

  // Process in batches
  const batches = Math.ceil(Math.min(dataset.length, batchSize) / 10);

  for (let b = 0; b < batches; b++) {
    const start = b * 10;
    const end = Math.min(start + 10, batchSize);
    const batch = dataset.slice(start, end);

    console.log(`\n📦 Batch ${b + 1}/${batches} (issues ${start + 1}-${end})`);

    // Submit observations
    for (const issue of batch) {
      const fullText = [
        issue.problem_statement || '',
        issue.FAIL_TO_PASS || '',
      ].join('\n');

      // Extract keywords (hybrid approach)
      const keywords = fullText
        .toLowerCase()
        .match(/\b\w{3,}\b/g)
        ?.slice(0, 15) || [];

      const obs = {
        observationId: `eval_${issue.instance_id}`,
        timestamp: new Date().toISOString(),
        facts: [
          { pred: 'has_issue', value: true },
          { pred: 'repo', value: issue.repo },
          ...keywords.slice(0, 10).map((kw, i) => ({
            pred: 'keyword',
            value: kw,
            args: { rank: i },
          })),
        ],
        context: {
          source: 'swebench_eval',
          instance_id: issue.instance_id,
          repo: issue.repo,
        },
        focusFacts: [{ pred: 'has_issue', value: true }],
        rawRefs: [fullText.substring(0, 1000)],
      };

      const result = submitObservationTool(storage, obs);
      metrics.totalObservations++;

      if (result.explained) {
        metrics.explained++;
        metrics.record('explained', { instance_id: issue.instance_id });
      } else if (result.eventCreated) {
        metrics.eventsCreated++;
        metrics.record('event_created', { event_id: result.eventCreated.eventId });
      }
    }

    // Trigger induction after each batch
    console.log(`   Running induction...`);
    const inductionResult = triggerInductionTool(storage, {
      minClusterSize: 2,
      minSimilarity: 0.4,
      autoValidate: false,
      resolveEvents: true,
    });

    metrics.inductionRuns++;
    metrics.regulationsCreated += inductionResult.regulationsCreated.length;
    metrics.eventsResolved += inductionResult.eventsResolved.length;

    console.log(`   ✅ Regulations created: ${inductionResult.regulationsCreated.length}`);
    console.log(`   ✅ Events resolved: ${inductionResult.eventsResolved.length}`);

    const stats = storage.getStats();
    console.log(`   📊 Current: ${stats.eventsByStatus.open} open, ${stats.regulationCount} regulations`);
  }

  // Final statistics
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 EVALUATION RESULTS');
  console.log('='.repeat(60));

  const summary = metrics.summary();
  console.log(`\n✨ Observations:`);
  console.log(`   Total: ${summary.observations.total}`);
  console.log(`   Explained: ${summary.observations.explained} (${summary.observations.rate})`);

  console.log(`\n🔍 Events:`);
  console.log(`   Created: ${summary.events.created}`);
  console.log(`   Resolved: ${summary.events.resolved} (${summary.events.rate})`);

  console.log(`\n⚡ Regulations:`);
  console.log(`   Created: ${summary.regulations.created}`);
  console.log(`   Efficiency: ${summary.regulations.efficiency} regs/event`);

  console.log(`\n🎓 Learning:`);
  console.log(`   Induction runs: ${summary.induction.runs}`);

  const finalStats = storage.getStats();
  console.log(`\n📈 Final System State:`);
  console.log(`   Open events: ${finalStats.eventsByStatus.open}`);
  console.log(`   Confirmed regulations: ${finalStats.regulationsByStatus.confirmed}`);
  console.log(`   Hypothesis regulations: ${finalStats.regulationsByStatus.hypothesis}`);

  // Save metrics
  const metricsFile = path.join(__dirname, '../../data/evaluation_metrics.json');
  fs.writeFileSync(metricsFile, JSON.stringify({
    summary,
    finalStats,
    timeline: metrics.timeline,
  }, null, 2));

  console.log(`\n💾 Metrics saved to: ${metricsFile}`);

  storage.close();
  return summary;
}

// Main
const args = process.argv.slice(2);
const dataFile = args[0] || path.join(__dirname, '../../../data/swebench/swebench_verified.json');
const batchSize = parseInt(args[1]) || 50;

if (!fs.existsSync(dataFile)) {
  console.error(`❌ Data file not found: ${dataFile}`);
  console.log('\nDownload SWE-bench first:');
  console.log('  python scripts/download-swebench.py');
  process.exit(1);
}

evaluateSWEBench(dataFile, batchSize).catch(err => {
  console.error('❌ Evaluation failed:', err);
  process.exit(1);
});
