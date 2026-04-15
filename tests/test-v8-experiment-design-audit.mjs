#!/usr/bin/env node
// ---
// kind: code
// implements: docs/current/contract-audit-contract.md
// ---
/**
 * test-v8-experiment-design-audit.mjs
 *
 * 覆盖 ExperimentDesign binding audit 第一轮：
 *   ED-1 baseEpisodeId 可解析
 *   ED-2 basedOnCounterfactualIds 全部可解析
 *   ED-3 recommendedAction 必须属于候选集合
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const { checkExperimentDesignBindings } = await import(
  pathToFileURL(path.join(ROOT, 'scripts', 'contract-audit.mjs')).href
);

let passed = 0;
let failed = 0;

function makeResult(file, conformsTo, parsedObj) {
  return {
    file,
    format: 'json',
    kind: 'instance',
    fm: { conforms_to: conformsTo },
    findings: [],
    _parsedObj: parsedObj,
  };
}

async function runTest(name, results, expectCodes) {
  for (const r of results) r.findings = [];
  await checkExperimentDesignBindings(results);

  const codes = results.flatMap(r => r.findings.map(f => f.code));
  const missing = expectCodes.filter(c => !codes.includes(c));
  const extra = codes.filter(c => !expectCodes.includes(c));

  if (missing.length === 0 && extra.length === 0) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    if (missing.length) console.log(`     缺少错误码: ${missing.join(', ')}`);
    if (extra.length) console.log(`     多余错误码: ${extra.join(', ')}`);
    failed++;
  }
}

console.log('\nExperimentDesign contract-audit §13 binding pass 单元测试\n');

await runTest(
  'ED-1: baseEpisodeId 缺失引用',
  [
    makeResult('experiment_designs/ed1.json', 'docs/current/experiment-design-contract.md', {
      id: 'ED_1',
      baseEpisodeId: 'ep_missing',
      basedOnCounterfactualIds: ['CS_ok'],
      candidateMeasurements: ['measure_latency'],
      candidateInterventions: [],
      recommendedAction: 'measure_latency',
    }),
    makeResult('counterfactual_scenarios/cs1.json', 'docs/current/counterfactual-scenario-contract.md', {
      id: 'CS_ok',
    }),
  ],
  ['bad-experiment-design-episode-ref']
);

await runTest(
  'ED-2: basedOnCounterfactualIds 中存在坏引用',
  [
    makeResult('experiment_designs/ed2.json', 'docs/current/experiment-design-contract.md', {
      id: 'ED_2',
      baseEpisodeId: 'ep_ok',
      basedOnCounterfactualIds: ['CS_ok', 'CS_missing'],
      candidateMeasurements: ['measure_error_rate'],
      candidateInterventions: [],
      recommendedAction: 'measure_error_rate',
    }),
    makeResult('episodes/ep1.json', 'docs/current/v7-world-model-contract.md', {
      id: 'ep_ok',
      ontologyDeltaId: 'OD_ok',
    }),
    makeResult('counterfactual_scenarios/cs2.json', 'docs/current/counterfactual-scenario-contract.md', {
      id: 'CS_ok',
    }),
  ],
  ['bad-experiment-design-counterfactual-ref']
);

await runTest(
  'ED-3: recommendedAction 不在候选集合中',
  [
    makeResult('experiment_designs/ed3.json', 'docs/current/experiment-design-contract.md', {
      id: 'ED_3',
      baseEpisodeId: 'ep_ok',
      basedOnCounterfactualIds: ['CS_ok'],
      candidateMeasurements: ['measure_p99'],
      candidateInterventions: ['enable_cache'],
      recommendedAction: 'restart_service',
    }),
    makeResult('episodes/ep2.json', 'docs/current/v7-world-model-contract.md', {
      id: 'ep_ok',
      ontologyDeltaId: 'OD_ok',
    }),
    makeResult('counterfactual_scenarios/cs3.json', 'docs/current/counterfactual-scenario-contract.md', {
      id: 'CS_ok',
    }),
  ],
  ['recommended-action-outside-candidates']
);

await runTest(
  'ED-1/2/3: 全部绑定合法时不报错',
  [
    makeResult('experiment_designs/ed4.json', 'docs/current/experiment-design-contract.md', {
      id: 'ED_4',
      baseEpisodeId: 'ep_ok',
      basedOnCounterfactualIds: ['CS_a', 'CS_b'],
      candidateMeasurements: ['measure_latency', 'measure_error_rate'],
      candidateInterventions: ['set_retry_interval_500ms'],
      recommendedAction: 'set_retry_interval_500ms',
    }),
    makeResult('episodes/ep3.json', 'docs/current/v7-world-model-contract.md', {
      id: 'ep_ok',
      ontologyDeltaId: 'OD_ok',
    }),
    makeResult('counterfactual_scenarios/cf_a.json', 'docs/current/counterfactual-scenario-contract.md', {
      id: 'CS_a',
    }),
    makeResult('counterfactual_scenarios/cf_b.json', 'docs/current/counterfactual-scenario-contract.md', {
      id: 'CS_b',
    }),
  ],
  []
);

await runTest(
  'ED-3: recommendedAction 缺失也应报错',
  [
    makeResult('experiment_designs/ed5.json', 'docs/current/experiment-design-contract.md', {
      id: 'ED_5',
      baseEpisodeId: 'ep_ok',
      basedOnCounterfactualIds: ['CS_ok'],
      candidateMeasurements: ['measure_cpu'],
      candidateInterventions: [],
    }),
    makeResult('episodes/ep4.json', 'docs/current/v7-world-model-contract.md', {
      id: 'ep_ok',
      ontologyDeltaId: 'OD_ok',
    }),
    makeResult('counterfactual_scenarios/cf_c.json', 'docs/current/counterfactual-scenario-contract.md', {
      id: 'CS_ok',
    }),
  ],
  ['recommended-action-outside-candidates']
);

console.log(`\n结果：${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
