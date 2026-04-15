/**
 * test-v8-review-decision-audit.mjs
 * 验收：ReviewDecision binding audit（§22 RD-1~RD-4）
 *
 * T1：合法 RD 走真实 export → 不命中任何 RD-x 错误桶
 * T2：RD-1 proposalRef 断链 → bad-rd-proposal-ref
 * T3：RD-2 decision 非法值 → bad-rd-decision
 * T4：RD-3 decision=superseded 无 supersededByRef → bad-rd-superseded-ref
 * T5：RD-4 rationale 为空 → empty-rd-rationale
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
const { checkReviewDecisionBindings } = await import(auditUrl);

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
// T1：合法 RD governance pass（真实 export）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: 合法 RD governance pass（真实 export）');

{
  const artifactsDir = path.join(ROOT, 'artifacts');
  const artifactsExist = existsSync(artifactsDir);
  const entries = artifactsExist
    ? (await readdir(artifactsDir)).filter(d => /^\d{8}-v7e-/.test(d))
    : [];

  // T1 是端到端真实导出验证：若 CI / 干净环境下无 v7e 导出（artifacts/<date>-v7e-*/），
  // 优雅跳过 T1 而非 fail。后续 T2-Tn 走 fixture 路径不依赖该数据，仍能保证 RD 审计逻辑被覆盖。
  if (entries.length === 0) {
    console.log(`  ⏭  T1 跳过：未找到 \\d{8}-v7e-* 导出目录（端到端 fixture 缺失，T2+ fixture 测试仍会运行）`);
  } else {
    const withMtime = await Promise.all(
      entries.map(async d => ({ d, mtime: (await stat(path.join(artifactsDir, d))).mtimeMs }))
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);

    let latestRun = null;
    for (const { d } of withMtime) {
      const rdDir = path.join(artifactsDir, d, 'review_decisions');
      if (existsSync(rdDir)) { latestRun = path.join(artifactsDir, d); break; }
    }

    if (latestRun === null) {
      console.log(`  ⏭  T1 跳过：找到 v7e 导出目录但无 review_decisions/ 子目录`);
    } else {
      const rdDir = path.join(latestRun, 'review_decisions');
      const rdFiles = (await readdir(rdDir)).filter(f => f.endsWith('.json'));
      check('至少一条 review_decisions/*.json', rdFiles.length > 0, rdFiles.length);

      const subDirs = (await readdir(latestRun)).map(s => path.join(latestRun, s));
      const results = await buildResults(subDirs);
      await checkReviewDecisionBindings(results);

      const rdResults = results.filter(r =>
        r.file.includes('review_decisions/') && r.fm?.$kind === 'instance'
      );
      check('RD 审计条目存在', rdResults.length > 0, rdResults.length);

      const RD_CODES = [
        'bad-rd-proposal-ref', 'bad-rd-decision',
        'bad-rd-superseded-ref', 'empty-rd-rationale',
      ];
      const anyRDError = rdResults.some(r => r.findings.some(f => RD_CODES.includes(f.code)));
      check('合法 RD 不命中任何 RD-x 错误桶', !anyRDError);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Fixture 基础设施
// ──────────────────────────────────────────────────────────────────────────────
const FIXTURE_DIR = path.join(ROOT, 'artifacts', '_test_fixture_rd_audit');
await rm(FIXTURE_DIR, { recursive: true, force: true });
await mkdir(path.join(FIXTURE_DIR, 'review_decisions'),            { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'program_revision_proposals'), { recursive: true });

const VALID_PRP_ID = 'PRP_fixture_rd_audit_001';

// 写锚点：ProgramRevisionProposal
await writeFile(path.join(FIXTURE_DIR, 'program_revision_proposals', `${VALID_PRP_ID}.json`),
  JSON.stringify({
    $kind: 'instance',
    $conforms_to: 'docs/current/program-revision-proposal-contract.md',
    $generated_by: 'test-fixture',
    $generated_at: new Date().toISOString(),
    id: VALID_PRP_ID,
    basedOnPredictionErrorIds: ['PE_fixture_001'],
    targetKind: 'mechanism_program',
    targetRef: 'MP_fixture_001',
    proposedChangeKind: 'phase_adjustment',
    rationale: 'fixture prp rationale',
    status: 'accepted',
    createdAt: new Date().toISOString(),
    createdBy: 'test-fixture',
  }, null, 2));

/** 构造一个合法 RD fixture，按需 override */
function makeRDObj(suffix, overrides = {}) {
  return {
    $kind: 'instance',
    $conforms_to: 'docs/current/review-decision-contract.md',
    $generated_by: 'test-fixture',
    $generated_at: new Date().toISOString(),
    id: `RD_fixture_${suffix}`,
    proposalRef: VALID_PRP_ID,
    decision: 'accepted',
    supersededByRef: null,
    rationale: 'fixture rd rationale',
    generatedDeltaRef: 'OD_fixture_001',
    reviewedAt: new Date().toISOString(),
    reviewedBy: 'test-fixture',
    ...overrides,
  };
}

async function writeRD(suffix, overrides = {}) {
  const obj = makeRDObj(suffix, overrides);
  await writeFile(
    path.join(FIXTURE_DIR, 'review_decisions', `RD_fixture_${suffix}.json`),
    JSON.stringify(obj, null, 2)
  );
}

function allDirs() {
  return [
    path.join(FIXTURE_DIR, 'review_decisions'),
    path.join(FIXTURE_DIR, 'program_revision_proposals'),
  ];
}

async function auditRD(suffix) {
  const results = await buildResults(allDirs());
  await checkReviewDecisionBindings(results);
  const target = results.find(r => r.file.includes(`RD_fixture_${suffix}.json`));
  return target?.findings ?? [];
}

// ──────────────────────────────────────────────────────────────────────────────
// T2：RD-1 proposalRef 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: RD-1 proposalRef 断链');

await writeRD('t2_bad_prp', { proposalRef: 'PRP_NONEXISTENT_xyz' });
{
  const findings = await auditRD('t2_bad_prp');
  const codes = findings.map(f => f.code);
  check('命中 bad-rd-proposal-ref',
    codes.includes('bad-rd-proposal-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T2b：RD-1 proposalRef 为空
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2b: RD-1 proposalRef 为空');

await writeRD('t2b_empty_prp', { proposalRef: '' });
{
  const findings = await auditRD('t2b_empty_prp');
  const codes = findings.map(f => f.code);
  check('命中 bad-rd-proposal-ref（为空）',
    codes.includes('bad-rd-proposal-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：RD-2 decision 非法值
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: RD-2 decision 非法值');

await writeRD('t3_bad_decision', { decision: 'invalid_decision' });
{
  const findings = await auditRD('t3_bad_decision');
  const codes = findings.map(f => f.code);
  check('命中 bad-rd-decision',
    codes.includes('bad-rd-decision'), codes.join(',') || 'none');
  check('不误触 bad-rd-proposal-ref',
    !codes.includes('bad-rd-proposal-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：RD-3 decision=superseded 无 supersededByRef
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: RD-3 decision=superseded 无 supersededByRef');

await writeRD('t4_superseded_no_ref', {
  decision: 'superseded',
  supersededByRef: null,
  generatedDeltaRef: null,
});
{
  const findings = await auditRD('t4_superseded_no_ref');
  const codes = findings.map(f => f.code);
  check('命中 bad-rd-superseded-ref',
    codes.includes('bad-rd-superseded-ref'), codes.join(',') || 'none');
  check('不误触 bad-rd-decision（superseded 本身合法）',
    !codes.includes('bad-rd-decision'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：RD-4 rationale 为空
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: RD-4 rationale 为空');

await writeRD('t5_empty_rationale', { rationale: '   ' });
{
  const findings = await auditRD('t5_empty_rationale');
  const codes = findings.map(f => f.code);
  check('命中 empty-rd-rationale',
    codes.includes('empty-rd-rationale'), codes.join(',') || 'none');
  check('不误触其他 RD-x 错误桶',
    !codes.some(c => ['bad-rd-proposal-ref', 'bad-rd-decision', 'bad-rd-superseded-ref'].includes(c)),
    codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// 清理 fixture
// ──────────────────────────────────────────────────────────────────────────────
await rm(FIXTURE_DIR, { recursive: true, force: true });

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ ReviewDecision binding audit 验收全部通过！');
} else {
  console.log('\n❌ ReviewDecision binding audit 有失败项，请检查。');
  process.exit(1);
}
