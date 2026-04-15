#!/usr/bin/env node
// ---
// kind: code
// implements: docs/current/contract-audit-contract.md
// ---
/**
 * test-v7-contract-audit.mjs — §10 v7 绑定 pass 单元测试
 *
 * 使用 _parsedObj 注入跳过磁盘读取，直接测试 checkV7Bindings 的错误路径。
 * 无外部依赖，直接 node 运行。
 *
 * 用法：node tests/test-v7-contract-audit.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// 从 contract-audit.mjs 导入 checkV7Bindings
const { checkV7Bindings } = await import(
  pathToFileURL(path.join(ROOT, 'scripts', 'contract-audit.mjs')).href
);

// ─── 测试工具 ──────────────────────────────────────────────────────────────

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
  // 重置 findings
  for (const r of results) r.findings = [];
  await checkV7Bindings(results);

  const allFindings = results.flatMap(r => r.findings);
  const codes = allFindings.map(f => f.code);

  const missing = expectCodes.filter(c => !codes.includes(c));
  const extra   = codes.filter(c => !expectCodes.includes(c));

  if (missing.length === 0 && extra.length === 0) {
    console.log(`  ✅  ${name}`);
    passed++;
  } else {
    console.log(`  ❌  ${name}`);
    if (missing.length) console.log(`       缺少错误码：${missing.join(', ')}`);
    if (extra.length)   console.log(`       多余错误码：${extra.join(', ')}`);
    failed++;
  }
}

// ─── 测试用例 ──────────────────────────────────────────────────────────────

console.log('\nv7 contract-audit §10 binding pass 单元测试\n');

// T1：mechanism_instance_ids 引用不存在 → bad-mechanism-instance-ref
await runTest(
  'V7-1: mechanism_instance_ids 缺失引用',
  [
    makeResult('reconstructions/r1.json', 'docs/current/reconstruction-contract.md', {
      id: 'R1', mechanism_instance_ids: ['MI_missing'],
    }),
    // 故意不放对应 MI
  ],
  ['bad-mechanism-instance-ref'],
);

// T2：mechanism_instance_ids 有对应 MI → 不报错
await runTest(
  'V7-1: mechanism_instance_ids 引用存在（不报错）',
  [
    makeResult('reconstructions/r2.json', 'docs/current/reconstruction-contract.md', {
      id: 'R2', mechanism_instance_ids: ['MI_ok'],
    }),
    makeResult('mechanism_instances/mi1.json', 'docs/current/mechanism-instance-contract.md', {
      id: 'MI_ok', status: 'pending',
    }),
  ],
  [],
);

// T3：episode.ontologyDeltaId 缺失引用 → bad-ontology-delta-ref
await runTest(
  'V7-2: episode.ontologyDeltaId 缺失引用',
  [
    makeResult('episodes/ep1.json', 'docs/current/v7-world-model-contract.md', {
      id: 'ep1', ontologyDeltaId: 'OD_ghost',
    }),
    // 故意不放对应 delta
  ],
  ['bad-ontology-delta-ref'],
);

// T4：trace / reconstruction 双向错配 → trace-reconstruction-mismatch
await runTest(
  'V7-3: trace.reconstructionId 与 reconstruction.id 不一致',
  [
    makeResult('reconstructions/rA.json', 'docs/current/reconstruction-contract.md', {
      id: 'RA', traceId: 'DT_1', mechanism_instance_ids: [],
    }),
    makeResult('derivation_chains/dt1.json', 'docs/current/derivation-chain-contract.md', {
      id: 'DT_1', reconstructionId: 'RB', // ← 故意错配
    }),
  ],
  ['trace-reconstruction-mismatch', 'trace-reconstruction-mismatch'], // 两边都报
);

// T5：traceId 指向不存在的 trace → trace-reconstruction-mismatch
await runTest(
  'V7-3: traceId 指向不存在的 trace',
  [
    makeResult('reconstructions/rC.json', 'docs/current/reconstruction-contract.md', {
      id: 'RC', traceId: 'DT_missing', mechanism_instance_ids: [],
    }),
  ],
  ['trace-reconstruction-mismatch'],
);

// T6：kind=none 缺 no_update_reason → missing-no-update-reason
await runTest(
  'V7-4: kind=none 缺 no_update_reason',
  [
    makeResult('ontology_deltas/od1.json', 'docs/current/ontology-delta-contract.md', {
      id: 'OD1', kind: 'none',
      // no_update_reason 故意缺失
    }),
  ],
  ['missing-no-update-reason'],
);

// T7：kind=none 但 explanation 为空 → missing-no-update-reason
await runTest(
  'V7-4: kind=none 但 explanation 为空',
  [
    makeResult('ontology_deltas/od2.json', 'docs/current/ontology-delta-contract.md', {
      id: 'OD2', kind: 'none',
      no_update_reason: { reason_kind: 'ontology_sufficient', explanation: '' },
    }),
  ],
  ['missing-no-update-reason'],
);

// T8：kind=none + 完整 no_update_reason → 不报错
await runTest(
  'V7-4: kind=none + 完整 no_update_reason（不报错）',
  [
    makeResult('ontology_deltas/od3.json', 'docs/current/ontology-delta-contract.md', {
      id: 'OD3', kind: 'none',
      no_update_reason: { reason_kind: 'ontology_sufficient', explanation: '已足够', follow_up: null },
    }),
  ],
  [],
);

// T9：status=accepted 无 claim_ids 且无 support_link_refs → accepted-instance-without-support
await runTest(
  'V7-5: accepted MI 无任何支撑',
  [
    makeResult('mechanism_instances/mi_empty.json', 'docs/current/mechanism-instance-contract.md', {
      id: 'MI_empty', status: 'accepted', claim_ids: [], support_link_refs: [],
    }),
  ],
  ['accepted-instance-without-support'],
);

// T10：status=accepted + claim_ids 非空 → 不报错
await runTest(
  'V7-5: accepted MI + claim_ids 非空（不报错）',
  [
    makeResult('mechanism_instances/mi_ok.json', 'docs/current/mechanism-instance-contract.md', {
      id: 'MI_ok2', status: 'accepted', claim_ids: ['hyp_001'], support_link_refs: [],
    }),
  ],
  [],
);

// T11：status=rejected → V7-5 不触发
await runTest(
  'V7-5: rejected MI 不触发检查',
  [
    makeResult('mechanism_instances/mi_rej.json', 'docs/current/mechanism-instance-contract.md', {
      id: 'MI_rej', status: 'rejected', claim_ids: [], support_link_refs: [],
    }),
  ],
  [],
);

// ─── 汇总 ──────────────────────────────────────────────────────────────────

console.log(`\n结果：${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
