/**
 * test-v8-prediction-error-audit.mjs
 * 验收：PredictionError binding audit（§16 PE-1..PE-4）
 *
 * T1：合法 PredictionError 走真实 export → 不命中任何 PE-* 错误桶
 * T2：坏 causedByActionExecutionId → bad-prediction-error-action-ref
 * T3：坏 outcomeRecordId → bad-prediction-error-outcome-ref
 * T4：坏 basedOnCounterfactualId → bad-prediction-error-counterfactual-ref
 * T5：空 summary → empty-prediction-error-summary
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdir, readFile, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..'); // BestQ-A root

let pass = 0;
let fail = 0;

function check(label, condition, got) {
  if (condition) {
    console.log(`  ✅ ${label}${got !== undefined ? ` (got: ${got})` : ''}`);
    pass++;
  } else {
    console.log(`  ❌ ${label}${got !== undefined ? ` (got: ${got})` : ''}`);
    fail++;
  }
}

const auditUrl = pathToFileURL(path.join(ROOT, 'scripts', 'contract-audit.mjs')).href;
const { checkPredictionErrorBindings } = await import(auditUrl);

async function buildResults(dirs) {
  const results = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const files = await readdir(dir).catch(() => []);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const abs = path.join(dir, f);
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      try {
        const fm = JSON.parse(await readFile(abs, 'utf8'));
        results.push({ file: rel, fm, findings: [], kind: fm.$kind ?? null,
          legacyKind: null, describes: null, density: null, status: null });
      } catch { /* ignore */ }
    }
  }
  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// T1：合法 PredictionError 走最新 export（按 mtime 取最新含 prediction_errors 的）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: 合法 PredictionError governance pass（真实 export）');

{
  const artifactsDir = path.join(ROOT, 'artifacts');
  const entries = (await readdir(artifactsDir)).filter(d => /^\d{8}-v7e-/.test(d));
  check('至少存在一个 v7e 导出目录', entries.length > 0, entries.length);

  if (entries.length > 0) {
    const withMtime = await Promise.all(
      entries.map(async d => ({ d, mtime: (await stat(path.join(artifactsDir, d))).mtimeMs }))
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);

    let latestRun = null;
    for (const { d } of withMtime) {
      const peDir = path.join(artifactsDir, d, 'prediction_errors');
      if (existsSync(peDir)) { latestRun = path.join(artifactsDir, d); break; }
    }
    check('存在含 prediction_errors/ 的导出目录', latestRun !== null, latestRun ?? 'none');

    if (latestRun) {
      const peDir = path.join(latestRun, 'prediction_errors');
      const jsonFiles = (await readdir(peDir)).filter(f => f.endsWith('.json'));
      check('至少一条 prediction_errors/*.json', jsonFiles.length > 0, jsonFiles.length);

      if (jsonFiles.length > 0) {
        const subDirs = (await readdir(latestRun)).map(s => path.join(latestRun, s));
        const results = await buildResults(subDirs);
        await checkPredictionErrorBindings(results);

        const peResults = results.filter(r =>
          r.file.includes('prediction_errors/') && r.fm?.$kind === 'instance'
        );
        check('PredictionError 审计条目存在', peResults.length > 0, peResults.length);

        const anyPEError = peResults.some(r =>
          r.findings.some(f => [
            'bad-prediction-error-action-ref', 'bad-prediction-error-outcome-ref',
            'bad-prediction-error-counterfactual-ref', 'empty-prediction-error-summary',
          ].includes(f.code))
        );
        check('合法 PredictionError 不命中任何 PE-* 错误桶', !anyPEError);
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 构造 fixture（T2–T5）
// ──────────────────────────────────────────────────────────────────────────────
const FIXTURE_DIR = path.join(ROOT, 'artifacts', '_test_fixture_pe_audit');
await rm(FIXTURE_DIR, { recursive: true, force: true });
await mkdir(path.join(FIXTURE_DIR, 'prediction_errors'),     { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'action_executions'),     { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'outcome_records'),       { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'counterfactual_scenarios'), { recursive: true });

const VALID_AX_ID  = 'AX_fixture_pe_001';
const VALID_ORC_ID = 'ORC_fixture_pe_001';
const VALID_CF_ID  = 'CS_fixture_pe_001';

await writeFile(path.join(FIXTURE_DIR, 'action_executions', `${VALID_AX_ID}.json`),
  JSON.stringify({ $kind: 'instance', $conforms_to: 'docs/current/action-execution-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(), id: VALID_AX_ID }, null, 2));
await writeFile(path.join(FIXTURE_DIR, 'outcome_records', `${VALID_ORC_ID}.json`),
  JSON.stringify({ $kind: 'instance', $conforms_to: 'docs/current/outcome-record-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(), id: VALID_ORC_ID }, null, 2));
await writeFile(path.join(FIXTURE_DIR, 'counterfactual_scenarios', `${VALID_CF_ID}.json`),
  JSON.stringify({ $kind: 'instance', $conforms_to: 'docs/current/counterfactual-scenario-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(), id: VALID_CF_ID }, null, 2));

async function writePE(name, overrides) {
  const obj = {
    $kind: 'instance',
    $conforms_to: 'docs/current/prediction-error-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(),
    id: `PE_${name}`,
    causedByActionExecutionId: VALID_AX_ID,
    outcomeRecordId: VALID_ORC_ID,
    basedOnCounterfactualId: VALID_CF_ID,
    errorKind: 'outcome',
    expectedSummary: 'expected something',
    actualSummary: 'actual something',
    deltaSummary: 'delta something',
    severity: 'low',
    score: null,
    recordedAt: new Date().toISOString(),
    recordedBy: 'test',
    ...overrides,
  };
  await writeFile(path.join(FIXTURE_DIR, 'prediction_errors', `PE_${name}.json`), JSON.stringify(obj, null, 2));
}

async function auditFixture(name) {
  const results = await buildResults([
    path.join(FIXTURE_DIR, 'prediction_errors'),
    path.join(FIXTURE_DIR, 'action_executions'),
    path.join(FIXTURE_DIR, 'outcome_records'),
    path.join(FIXTURE_DIR, 'counterfactual_scenarios'),
  ]);
  await checkPredictionErrorBindings(results);
  const target = results.find(r => r.file.includes(`PE_${name}.json`));
  return target?.findings ?? [];
}

// ──────────────────────────────────────────────────────────────────────────────
// T2：PE-1 causedByActionExecutionId 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: PE-1 causedByActionExecutionId 断链');

await writePE('t2_bad_action', { causedByActionExecutionId: 'AX_NONEXISTENT_xyz' });
{
  const findings = await auditFixture('t2_bad_action');
  const codes = findings.map(f => f.code);
  check('命中 bad-prediction-error-action-ref', codes.includes('bad-prediction-error-action-ref'), codes.join(',') || 'none');
  check('不误触其他 PE 错误桶',
    !codes.some(c => ['bad-prediction-error-outcome-ref', 'bad-prediction-error-counterfactual-ref', 'empty-prediction-error-summary'].includes(c)));
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：PE-2 outcomeRecordId 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: PE-2 outcomeRecordId 断链');

await writePE('t3_bad_outcome', { outcomeRecordId: 'ORC_NONEXISTENT_xyz' });
{
  const findings = await auditFixture('t3_bad_outcome');
  const codes = findings.map(f => f.code);
  check('命中 bad-prediction-error-outcome-ref', codes.includes('bad-prediction-error-outcome-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：PE-3 basedOnCounterfactualId 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: PE-3 basedOnCounterfactualId 断链');

await writePE('t4_bad_cf', { basedOnCounterfactualId: 'CS_NONEXISTENT_xyz' });
{
  const findings = await auditFixture('t4_bad_cf');
  const codes = findings.map(f => f.code);
  check('命中 bad-prediction-error-counterfactual-ref', codes.includes('bad-prediction-error-counterfactual-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：PE-4 summary 为空
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: PE-4 summary 为空');

await writePE('t5_empty_summary', { expectedSummary: '   ' });
{
  const findings = await auditFixture('t5_empty_summary');
  const codes = findings.map(f => f.code);
  check('命中 empty-prediction-error-summary', codes.includes('empty-prediction-error-summary'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// 清理 fixture
// ──────────────────────────────────────────────────────────────────────────────
await rm(FIXTURE_DIR, { recursive: true, force: true });

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ PredictionError binding audit 验收全部通过！');
} else {
  console.log('\n❌ PredictionError binding audit 有失败项，请检查。');
  process.exit(1);
}
