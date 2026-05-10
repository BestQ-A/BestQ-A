#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const sourcePath = join(root, 'tests', 'mvp-samples', 'eval-report.json');
const outPath = join(__dirname, 'layer1-baseline.json');

const report = JSON.parse(readFileSync(sourcePath, 'utf-8'));
const durable = report.durable_assets ?? {};
const metrics = report.metrics ?? {};

const checks = [
  metrics.hit_rate_pass === true,
  metrics.false_positive_pass === true,
  metrics.grading_accuracy_pass === true,
  Number(durable.derivation_traces_stored ?? 0) >= 1,
  Number(durable.total_nodes ?? 0) >= 50,
  Number(durable.min_support_links_per_card ?? 0) >= 1,
];

const nearThreshold = [
  [Number(metrics.hit_rate ?? 0), Number(metrics.hit_rate_target ?? 0)],
  [Number(metrics.false_positive_rate ?? 0), Number(metrics.false_positive_target ?? 0)],
  [Number(metrics.grading_accuracy ?? 0), Number(metrics.grading_accuracy_target ?? 0)],
].some(([actual, target]) => Math.abs(actual - target) < 1e-9);

const agentVerdict = checks.every(Boolean)
  ? (nearThreshold ? 'flaky' : 'regression_pass')
  : 'regression_fail';

mkdirSync(__dirname, { recursive: true });
writeFileSync(outPath, JSON.stringify({ ...report, agent_verdict: agentVerdict }, null, 2));
console.log(`Layer 1 written: ${outPath}`);
