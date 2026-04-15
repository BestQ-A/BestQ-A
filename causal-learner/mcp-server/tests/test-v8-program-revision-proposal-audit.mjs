/**
 * test-v8-program-revision-proposal-audit.mjs
 * 验收：ProgramRevisionProposal binding audit（§20 PRP-1~PRP-4）
 *
 * T1：合法 PRP 走真实 export → 不命中任何 PRP-x 错误桶
 * T2：PRP-1 basedOnPredictionErrorIds 断链 → bad-prp-prediction-error-ref
 * T3：PRP-2 targetRef 断链 → bad-prp-target-ref
 * T4：PRP-3 status 非法 → bad-prp-status
 * T5：PRP-4 rationale 为空 → empty-prp-rationale
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
const { checkProgramRevisionProposalBindings } = await import(auditUrl);

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
// T1：合法 PRP governance pass（真实 export）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: 合法 PRP governance pass（真实 export）');

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
      const prpDir = path.join(artifactsDir, d, 'program_revision_proposals');
      if (existsSync(prpDir)) { latestRun = path.join(artifactsDir, d); break; }
    }
    check('存在含 program_revision_proposals/ 的导出目录', latestRun !== null, latestRun ?? 'none');

    if (latestRun) {
      const prpDir = path.join(latestRun, 'program_revision_proposals');
      const prpFiles = (await readdir(prpDir)).filter(f => f.endsWith('.json'));
      check('至少一条 program_revision_proposals/*.json', prpFiles.length > 0, prpFiles.length);

      const subDirs = (await readdir(latestRun)).map(s => path.join(latestRun, s));
      const results = await buildResults(subDirs);
      await checkProgramRevisionProposalBindings(results);

      const prpResults = results.filter(r =>
        r.file.includes('program_revision_proposals/') && r.fm?.$kind === 'instance'
      );
      check('PRP 审计条目存在', prpResults.length > 0, prpResults.length);

      const PRP_CODES = [
        'bad-prp-prediction-error-ref', 'bad-prp-target-ref',
        'bad-prp-status', 'empty-prp-rationale',
      ];
      const anyPRPError = prpResults.some(r => r.findings.some(f => PRP_CODES.includes(f.code)));
      check('合法 PRP 不命中任何 PRP-x 错误桶', !anyPRPError);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Fixture 基础设施
// ──────────────────────────────────────────────────────────────────────────────
const FIXTURE_DIR = path.join(ROOT, 'artifacts', '_test_fixture_prp_audit');
await rm(FIXTURE_DIR, { recursive: true, force: true });
await mkdir(path.join(FIXTURE_DIR, 'program_revision_proposals'), { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'prediction_errors'),          { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'mechanism_programs'),         { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'observation_models'),         { recursive: true });

const VALID_PE_ID = 'PE_fixture_prp_audit_001';
const VALID_MP_ID = 'MP_fixture_prp_audit_001';
const VALID_OM_ID = 'OM_fixture_prp_audit_001';

// 写锚点：PredictionError
await writeFile(path.join(FIXTURE_DIR, 'prediction_errors', `${VALID_PE_ID}.json`),
  JSON.stringify({
    $kind: 'instance',
    $conforms_to: 'docs/current/prediction-error-contract.md',
    $generated_by: 'test-fixture',
    $generated_at: new Date().toISOString(),
    id: VALID_PE_ID,
    causedByActionExecutionId: 'AX_fixture_001',
    outcomeRecordId: 'ORC_fixture_001',
    errorKind: 'outcome',
    expectedSummary: 'expected A',
    actualSummary: 'actual B',
    deltaSummary: 'delta C',
    severity: 'medium',
    score: null,
    createdAt: new Date().toISOString(),
  }, null, 2));

// 写锚点：MechanismProgram
await writeFile(path.join(FIXTURE_DIR, 'mechanism_programs', `${VALID_MP_ID}.json`),
  JSON.stringify({
    $kind: 'instance',
    $conforms_to: 'docs/current/mechanism-program-contract.md',
    $generated_by: 'test-fixture',
    $generated_at: new Date().toISOString(),
    id: VALID_MP_ID,
  }, null, 2));

// 写锚点：ObservationModel
await writeFile(path.join(FIXTURE_DIR, 'observation_models', `${VALID_OM_ID}.json`),
  JSON.stringify({
    $kind: 'instance',
    $conforms_to: 'docs/current/observation-model-contract.md',
    $generated_by: 'test-fixture',
    $generated_at: new Date().toISOString(),
    id: VALID_OM_ID,
    outputSignals: [],
  }, null, 2));

/** 构造一个合法 PRP fixture，按需 override */
function makePRPObj(suffix, overrides = {}) {
  return {
    $kind: 'instance',
    $conforms_to: 'docs/current/program-revision-proposal-contract.md',
    $generated_by: 'test-fixture',
    $generated_at: new Date().toISOString(),
    id: `PRP_fixture_${suffix}`,
    basedOnPredictionErrorIds: [VALID_PE_ID],
    targetKind: 'mechanism_program',
    targetRef: VALID_MP_ID,
    proposedChangeKind: 'validity_narrowing',
    rationale: 'test rationale for fixture',
    status: 'proposed',
    createdAt: new Date().toISOString(),
    createdBy: 'test-fixture',
    ...overrides,
  };
}

async function writePRP(suffix, overrides = {}) {
  const obj = makePRPObj(suffix, overrides);
  await writeFile(
    path.join(FIXTURE_DIR, 'program_revision_proposals', `PRP_fixture_${suffix}.json`),
    JSON.stringify(obj, null, 2)
  );
}

function allDirs() {
  return [
    path.join(FIXTURE_DIR, 'program_revision_proposals'),
    path.join(FIXTURE_DIR, 'prediction_errors'),
    path.join(FIXTURE_DIR, 'mechanism_programs'),
    path.join(FIXTURE_DIR, 'observation_models'),
  ];
}

async function auditPRP(suffix) {
  const results = await buildResults(allDirs());
  await checkProgramRevisionProposalBindings(results);
  const target = results.find(r => r.file.includes(`PRP_fixture_${suffix}.json`));
  return target?.findings ?? [];
}

// ──────────────────────────────────────────────────────────────────────────────
// T2：PRP-1 basedOnPredictionErrorIds 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: PRP-1 basedOnPredictionErrorIds 断链');

await writePRP('t2_bad_pe', { basedOnPredictionErrorIds: ['PE_NONEXISTENT_xyz'] });
{
  const findings = await auditPRP('t2_bad_pe');
  const codes = findings.map(f => f.code);
  check('命中 bad-prp-prediction-error-ref',
    codes.includes('bad-prp-prediction-error-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：PRP-2 targetRef 断链（mechanism_program）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: PRP-2 targetRef 断链（mechanism_program）');

await writePRP('t3_bad_target', {
  targetKind: 'mechanism_program',
  targetRef: 'MP_NONEXISTENT_xyz',
});
{
  const findings = await auditPRP('t3_bad_target');
  const codes = findings.map(f => f.code);
  check('命中 bad-prp-target-ref',
    codes.includes('bad-prp-target-ref'), codes.join(',') || 'none');
  check('不误触 bad-prp-prediction-error-ref',
    !codes.includes('bad-prp-prediction-error-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T3b：PRP-2 targetRef 断链（observation_model）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3b: PRP-2 targetRef 断链（observation_model）');

await writePRP('t3b_bad_om', {
  targetKind: 'observation_model',
  targetRef: 'OM_NONEXISTENT_xyz',
});
{
  const findings = await auditPRP('t3b_bad_om');
  const codes = findings.map(f => f.code);
  check('命中 bad-prp-target-ref（observation_model）',
    codes.includes('bad-prp-target-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：PRP-3 status 非法
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: PRP-3 status 非法');

await writePRP('t4_bad_status', { status: 'invalid_status' });
{
  const findings = await auditPRP('t4_bad_status');
  const codes = findings.map(f => f.code);
  check('命中 bad-prp-status',
    codes.includes('bad-prp-status'), codes.join(',') || 'none');
  check('不误触 bad-prp-prediction-error-ref 或 bad-prp-target-ref',
    !codes.includes('bad-prp-prediction-error-ref') && !codes.includes('bad-prp-target-ref'),
    codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：PRP-4 rationale 为空
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: PRP-4 rationale 为空');

await writePRP('t5_empty_rationale', { rationale: '   ' });
{
  const findings = await auditPRP('t5_empty_rationale');
  const codes = findings.map(f => f.code);
  check('命中 empty-prp-rationale',
    codes.includes('empty-prp-rationale'), codes.join(',') || 'none');
  check('不误触其他 PRP-x 错误桶',
    !codes.some(c => ['bad-prp-prediction-error-ref', 'bad-prp-target-ref', 'bad-prp-status'].includes(c)),
    codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// 清理 fixture
// ──────────────────────────────────────────────────────────────────────────────
await rm(FIXTURE_DIR, { recursive: true, force: true });

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ ProgramRevisionProposal binding audit 验收全部通过！');
} else {
  console.log('\n❌ ProgramRevisionProposal binding audit 有失败项，请检查。');
  process.exit(1);
}
