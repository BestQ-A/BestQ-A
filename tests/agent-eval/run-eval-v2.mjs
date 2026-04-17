#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const dist = join(root, 'causal-learner', 'mcp-server', 'dist');
const sampleDir = join(__dirname, 'samples-v2');
const storePath = join(root, 'causal-learner', 'data', 'mvp-causal-learner-v2.sqlite');

const { reviewPatch, mapToReasoningCardFields } = await import(`file://${dist.replace(/\\/g, '/')}/core/minimax-reviewer.js`);
const { computeVerdict } = await import(`file://${dist.replace(/\\/g, '/')}/core/reasoning-card.js`);
const { ingestReasoningCard, readIngestStats } = await import(`file://${dist.replace(/\\/g, '/')}/core/reasoning-card-ingest.js`);

mkdirSync(dirname(storePath), { recursive: true });
if (existsSync(storePath)) unlinkSync(storePath);

const expectedVerdict = (sample) => {
  if (sample.verified_verdict === 'correct' || sample.verdict === 'correct') return new Set(['pass', 'warn']);
  if (sample.verdict === 'wrong' || sample.verdict === 'partial') return new Set(['warn', 'block']);
  return new Set(['pass', 'warn', 'block']);
};

const runOne = async (sample) => {
  try {
    const raw = await reviewPatch({
      predictedPatch: sample.predicted_patch,
      problemStatement: sample.problem_statement,
      contextSnippets: [],
    });
    const mapped = mapToReasoningCardFields(raw);
    const verdict = computeVerdict(mapped.issues, false);
    let ingest = { supportLinksAdded: 0, derivationTraceStored: false, causalLearnerNodesAdded: 0 };
    if (verdict !== 'block') {
      const patchDigest = createHash('sha256').update(sample.predicted_patch).digest('hex').slice(0, 16);
      const cardId = `RC_${patchDigest}_${sample.id}`;
      ingest = ingestReasoningCard({ cardId, patchDigest, raw, storePath });
    }
    return { ok: true, verdict, issues: mapped.issues, goal: mapped.goal, ingest };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
};

const files = readdirSync(sampleDir).filter((name) => /^S\d{3}\.json$/.test(name)).sort();
const results = [];
for (const file of files) {
  const sample = JSON.parse(readFileSync(join(sampleDir, file), 'utf-8'));
  process.stderr.write(`[${sample.id}] ${sample.instance_id} (${sample.verdict}, ${sample.repo})... `);
  const t0 = Date.now();
  const res = await runOne(sample);
  const ms = Date.now() - t0;
  if (!res.ok) {
    process.stderr.write(`ERROR ${res.error}\n`);
    results.push({
      id: sample.id,
      repo: sample.repo,
      instance_id: sample.instance_id,
      expected: sample.verdict,
      error: res.error,
      ms,
    });
    continue;
  }
  const expected = expectedVerdict(sample);
  const passExpectation = expected.has(res.verdict);
  process.stderr.write(`${res.verdict} (${res.issues.length} issues, ${ms}ms) ${passExpectation ? 'OK' : 'MISS'}\n`);
  results.push({
    id: sample.id,
    repo: sample.repo,
    instance_id: sample.instance_id,
    expected: sample.verdict,
    verdict: res.verdict,
    issues: res.issues.map((issue) => ({ severity: issue.severity, code: issue.code })),
    goal: res.goal,
    passExpectation,
    ingest: res.ingest,
    ms,
  });
}

const wrongOrPartial = results.filter((r) => r.expected === 'wrong' || r.expected === 'partial');
const correctOnly = results.filter((r) => r.expected === 'correct');
const gradingDenom = results.filter((r) => !r.error && r.expected !== 'correct_candidate');

const hitRate = wrongOrPartial.length
  ? wrongOrPartial.filter((r) => r.verdict && r.verdict !== 'pass').length / wrongOrPartial.length
  : 0;
const fpRate = correctOnly.length
  ? correctOnly.filter((r) => r.verdict === 'block').length / correctOnly.length
  : 0;
const gradingAccuracy = gradingDenom.length
  ? gradingDenom.filter((r) => r.passExpectation === true).length / gradingDenom.length
  : 0;

const persistedResults = results.filter((r) => r.ingest && r.ingest.derivationTraceStored);
const perCardSL = persistedResults.map((r) => r.ingest.supportLinksAdded);
const storeStats = readIngestStats(storePath);
const repoDistribution = results.reduce((acc, row) => {
  if (!row.repo) return acc;
  acc[row.repo] = (acc[row.repo] ?? 0) + 1;
  return acc;
}, {});
const baseline = JSON.parse(readFileSync(join(__dirname, 'layer1-baseline.json'), 'utf-8'));
const baselineMetrics = baseline.metrics ?? {};

const summary = {
  generated_at: new Date().toISOString(),
  total_samples: results.length,
  errors: results.filter((r) => r.error).length,
  repo_distribution: repoDistribution,
  repo_diversity: Object.keys(repoDistribution).length,
  durable_assets: {
    min_support_links_per_card: perCardSL.length ? Math.min(...perCardSL) : 0,
    derivation_traces_stored: storeStats.totalTraces,
    total_support_links: storeStats.totalSupportLinks,
    total_nodes: storeStats.totalNodes,
  },
  metrics: {
    hit_rate: Number(hitRate.toFixed(3)),
    hit_rate_target: 0.6,
    hit_rate_pass: hitRate >= 0.6,
    false_positive_rate: Number(fpRate.toFixed(3)),
    false_positive_target: 0.3,
    false_positive_pass: fpRate <= 0.3,
    grading_accuracy: Number(gradingAccuracy.toFixed(3)),
    grading_accuracy_target: 0.7,
    grading_accuracy_pass: gradingAccuracy >= 0.7,
  },
  baseline_comparison: {
    hit_rate_drop: Number((Number(baselineMetrics.hit_rate ?? 0) - hitRate).toFixed(3)),
    false_positive_delta: Number((fpRate - Number(baselineMetrics.false_positive_rate ?? 0)).toFixed(3)),
    grading_accuracy_drop: Number((Number(baselineMetrics.grading_accuracy ?? 0) - gradingAccuracy).toFixed(3)),
  },
  verdict_distribution: results.reduce((acc, row) => {
    const key = row.verdict ?? 'error';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {}),
  results,
};

const overfits = summary.baseline_comparison.hit_rate_drop > 0.2
  || summary.baseline_comparison.false_positive_delta > 0.2
  || summary.baseline_comparison.grading_accuracy_drop > 0.2;
summary.agent_verdict = summary.repo_diversity < 3
  ? 'sample_biased'
  : (summary.metrics.hit_rate_pass && summary.metrics.false_positive_pass && summary.metrics.grading_accuracy_pass && !overfits
      ? 'generalizes'
      : 'overfits');

const outPath = join(__dirname, 'layer2-generalization.json');
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`Layer 2 written: ${outPath}`);
