#!/usr/bin/env node
/**
 * W2 T2.5: 测试集批量 runner
 *
 * 对每个 S###.json 调用 MiniMax reviewer，收集 verdict + issues，
 * 对比人工 verdict（wrong/correct_candidate/partial），计算三项指标：
 *   - 命中率 (hit_rate)          ≥ 70%：对 wrong 样本，MiniMax 应返回 warn 或 block
 *   - 误报率 (false_positive)    ≤ 20%：对 correct_candidate 样本，MiniMax 不应返回 block
 *   - 分级准确 (grading_accuracy) ≥ 80%：verdict 与预期档位一致
 *
 * 耐久资产指标（v12）：
 *   - 每次 pass/warn 产生 ≥1 SupportLink（W2 T2.3 入库后才真正落地）
 *   - 三周后 causal-learner 净增 ≥50 节点（W3 末尾统计）
 *
 * 环境变量：需要 LLM_API_KEY（从 .env 读入），或 BESTQA_SKIP_MINIMAX=1 跑 dry-run。
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', '..', 'causal-learner', 'mcp-server', 'dist');

// 动态 import 核心模块
const { reviewPatch, mapToReasoningCardFields } = await import(
  `file://${DIST.replace(/\\/g, '/')}/core/minimax-reviewer.js`
);
const { computeVerdict } = await import(
  `file://${DIST.replace(/\\/g, '/')}/core/reasoning-card.js`
);
const { ingestReasoningCard, readIngestStats } = await import(
  `file://${DIST.replace(/\\/g, '/')}/core/reasoning-card-ingest.js`
);

import { createHash } from 'node:crypto';
const STORE_PATH = join(__dirname, '..', '..', 'causal-learner', 'data', 'mvp-causal-learner.sqlite');
// 清空旧 DB 以获得本次净增数据
import { existsSync as _exists, unlinkSync as _unlink, mkdirSync as _mkdir } from 'node:fs';
_mkdir(dirname(STORE_PATH), { recursive: true });
if (_exists(STORE_PATH)) _unlink(STORE_PATH);

const sampleFiles = readdirSync(__dirname)
  .filter((f) => /^S\d{3}\.json$/.test(f))
  .sort();

const effectiveVerdict = (sample) => sample.verified_verdict || sample.verdict;

const expectedVerdict = (sample) => {
  const v = effectiveVerdict(sample);
  // correct → 应 pass 或 warn（不应 block）
  // wrong / partial / correct_candidate(未核对的) → 应 warn 或 block
  if (v === 'correct') return new Set(['pass', 'warn']);
  if (v === 'wrong' || v === 'partial') return new Set(['warn', 'block']);
  // correct_candidate 未核对：两端都接受（不计入硬指标）
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
      ingest = ingestReasoningCard({ cardId, patchDigest, raw, storePath: STORE_PATH });
    }
    return { ok: true, verdict, issues: mapped.issues, goal: mapped.goal, raw, ingest };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
};

const results = [];
for (const fname of sampleFiles) {
  const sample = JSON.parse(readFileSync(join(__dirname, fname), 'utf-8'));
  const eff = effectiveVerdict(sample);
  process.stderr.write(`[${sample.id}] ${sample.instance_id} (${eff})... `);
  const t0 = Date.now();
  const res = await runOne(sample);
  const dt = Date.now() - t0;
  if (!res.ok) {
    process.stderr.write(`ERROR ${res.error}\n`);
    results.push({ id: sample.id, instance_id: sample.instance_id, expected: eff, error: res.error });
    continue;
  }
  const expected = expectedVerdict(sample);
  const passExpectation = expected.has(res.verdict);
  process.stderr.write(`${res.verdict} (${res.issues.length} issues, ${dt}ms) ${passExpectation ? 'OK' : 'MISS'}\n`);
  results.push({
    id: sample.id,
    instance_id: sample.instance_id,
    expected: eff,
    verdict: res.verdict,
    issues: res.issues.map((i) => ({ severity: i.severity, code: i.code })),
    goal: res.goal,
    passExpectation,
    ingest: res.ingest,
    ms: dt,
  });
}

// 指标计算
const wrongOrPartial = results.filter((r) => r.expected === 'wrong' || r.expected === 'partial');
const correctOnly = results.filter((r) => r.expected === 'correct');
const nonError = results.filter((r) => !r.error);

const hits = wrongOrPartial.filter((r) => r.verdict && r.verdict !== 'pass').length;
const hitRate = wrongOrPartial.length ? hits / wrongOrPartial.length : 0;

const falsePositives = correctOnly.filter((r) => r.verdict === 'block').length;
const fpRate = correctOnly.length ? falsePositives / correctOnly.length : 0;

// 分级准确性只计算非 error、非 correct_candidate 样本
const gradingDenom = results.filter((r) => !r.error && r.expected !== 'correct_candidate');
const gradingCorrect = gradingDenom.filter((r) => r.passExpectation === true).length;
const gradingAcc = gradingDenom.length ? gradingCorrect / gradingDenom.length : 0;

// 耐久资产统计（v12）— 仅 pass/warn 会入库，block 不入库按设计
const persistedResults = results.filter((r) => r.ingest && r.ingest.derivationTraceStored);
const perCardSL = persistedResults.map((r) => r.ingest.supportLinksAdded);
const minSL = perCardSL.length ? Math.min(...perCardSL) : 0;
const totalIngestedNodes = persistedResults.reduce((acc, r) => acc + (r.ingest?.causalLearnerNodesAdded ?? 0), 0);
const storeStats = readIngestStats(STORE_PATH);

const summary = {
  generated_at: new Date().toISOString(),
  total_samples: results.length,
  errors: results.filter((r) => r.error).length,
  durable_assets: {
    min_support_links_per_card: minSL,
    min_support_links_target: 1,
    min_support_links_pass: minSL >= 1,
    derivation_traces_stored: storeStats.totalTraces,
    total_support_links: storeStats.totalSupportLinks,
    total_nodes: storeStats.totalNodes,
    total_nodes_target_3wks: 50,
    total_nodes_pass: storeStats.totalNodes >= 50,
  },
  metrics: {
    hit_rate: Number(hitRate.toFixed(3)),
    hit_rate_target: 0.7,
    hit_rate_pass: hitRate >= 0.7,
    false_positive_rate: Number(fpRate.toFixed(3)),
    false_positive_target: 0.2,
    false_positive_pass: fpRate <= 0.2,
    grading_accuracy: Number(gradingAcc.toFixed(3)),
    grading_accuracy_target: 0.8,
    grading_accuracy_pass: gradingAcc >= 0.8,
  },
  buckets: {
    wrong_or_partial: wrongOrPartial.length,
    correct: correctOnly.length,
  },
  verdict_distribution: results.reduce((acc, r) => {
    const k = r.verdict ?? 'error';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {}),
  results,
};

const outPath = join(__dirname, 'eval-report.json');
writeFileSync(outPath, JSON.stringify(summary, null, 2));

console.log('\n=== MVP W2 T2.5 Eval Report ===');
console.log(`Samples:        ${summary.total_samples}  (errors: ${summary.errors})`);
console.log(`Hit rate:       ${summary.metrics.hit_rate} (target ≥0.7) ${summary.metrics.hit_rate_pass ? '✓' : '✗'}`);
console.log(`FP rate:        ${summary.metrics.false_positive_rate} (target ≤0.2) ${summary.metrics.false_positive_pass ? '✓' : '✗'}`);
console.log(`Grading acc:    ${summary.metrics.grading_accuracy} (target ≥0.8) ${summary.metrics.grading_accuracy_pass ? '✓' : '✗'}`);
console.log(`Verdicts:       ${JSON.stringify(summary.verdict_distribution)}`);
console.log('--- Durable Assets (v12) ---');
console.log(`  Traces stored:        ${summary.durable_assets.derivation_traces_stored}`);
console.log(`  SupportLinks total:   ${summary.durable_assets.total_support_links}`);
console.log(`  Nodes total:          ${summary.durable_assets.total_nodes} (target ≥50 by W3 end) ${summary.durable_assets.total_nodes_pass ? '✓' : '(in progress)'}`);
console.log(`  Min SL per card:      ${summary.durable_assets.min_support_links_per_card} (target ≥1) ${summary.durable_assets.min_support_links_pass ? '✓' : '✗'}`);
console.log(`Report written: ${outPath}`);

const allPass = summary.metrics.hit_rate_pass && summary.metrics.false_positive_pass && summary.metrics.grading_accuracy_pass;
process.exit(allPass ? 0 : 1);
