/**
 * test-v8-state-transition-audit.mjs
 * 验收：StateSnapshot / Transition binding audit（§17 SS-1~SS-2 / §18 TR-1~TR-3）
 *
 * T1：合法 StateSnapshot / Transition 走真实 export → 不命中任何 SS-x/TR-x 错误桶
 * T2：SS-1 bad episodeId → bad-state-snapshot-episode-ref
 * T3：SS-2 values = null → empty-state-snapshot-values
 * T4：TR-1 bad episodeId → bad-transition-episode-ref
 * T5：TR-2 bad snapshotRef / from==to → bad-transition-snapshot-ref / same-transition-endpoints
 * T6：TR-3 bad causedByActionId → bad-transition-action-ref
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
const { checkStateSnapshotBindings, checkTransitionBindings } = await import(auditUrl);

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
// T1：合法 StateSnapshot / Transition 走最新 export
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: 合法 StateSnapshot / Transition governance pass（真实 export）');

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
      const ssDir = path.join(artifactsDir, d, 'state_snapshots');
      if (existsSync(ssDir)) { latestRun = path.join(artifactsDir, d); break; }
    }
    check('存在含 state_snapshots/ 的导出目录', latestRun !== null, latestRun ?? 'none');

    if (latestRun) {
      const ssDir = path.join(latestRun, 'state_snapshots');
      const trDir = path.join(latestRun, 'transitions');
      const ssFiles = (await readdir(ssDir)).filter(f => f.endsWith('.json'));
      const trFiles = existsSync(trDir) ? (await readdir(trDir)).filter(f => f.endsWith('.json')) : [];

      check('至少一条 state_snapshots/*.json', ssFiles.length > 0, ssFiles.length);
      check('至少一条 transitions/*.json',     trFiles.length > 0, trFiles.length);

      const subDirs = (await readdir(latestRun)).map(s => path.join(latestRun, s));
      const results = await buildResults(subDirs);
      await checkStateSnapshotBindings(results);
      await checkTransitionBindings(results);

      const ssResults = results.filter(r =>
        r.file.includes('state_snapshots/') && r.fm?.$kind === 'instance'
      );
      const trResults = results.filter(r =>
        r.file.includes('transitions/') && r.fm?.$kind === 'instance'
      );

      check('StateSnapshot 审计条目存在', ssResults.length > 0, ssResults.length);
      check('Transition 审计条目存在',    trResults.length > 0, trResults.length);

      const SS_CODES = ['bad-state-snapshot-episode-ref', 'empty-state-snapshot-values'];
      const TR_CODES = ['bad-transition-episode-ref', 'bad-transition-snapshot-ref',
                        'same-transition-endpoints', 'bad-transition-action-ref'];

      const anySSError = ssResults.some(r => r.findings.some(f => SS_CODES.includes(f.code)));
      const anyTRError = trResults.some(r => r.findings.some(f => TR_CODES.includes(f.code)));

      check('合法 StateSnapshot 不命中任何 SS-* 错误桶', !anySSError);
      check('合法 Transition 不命中任何 TR-* 错误桶',    !anyTRError);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Fixture 基础设施
// ──────────────────────────────────────────────────────────────────────────────
const FIXTURE_DIR = path.join(ROOT, 'artifacts', '_test_fixture_ss_tr_audit');
await rm(FIXTURE_DIR, { recursive: true, force: true });
await mkdir(path.join(FIXTURE_DIR, 'state_snapshots'),  { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'transitions'),      { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'episodes'),         { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'action_executions'), { recursive: true });

const VALID_EP_ID = 'story_fixture_ss_001';
const VALID_SS_A  = 'SS_fixture_001';
const VALID_SS_B  = 'SS_fixture_002';
const VALID_AX_ID = 'AX_fixture_ss_001';

// 写基础锚点文件
await writeFile(path.join(FIXTURE_DIR, 'episodes', `${VALID_EP_ID}.json`),
  JSON.stringify({ $kind: 'instance', $conforms_to: 'docs/current/v7-world-model-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(), id: VALID_EP_ID }, null, 2));

await writeFile(path.join(FIXTURE_DIR, 'action_executions', `${VALID_AX_ID}.json`),
  JSON.stringify({ $kind: 'instance', $conforms_to: 'docs/current/action-execution-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(), id: VALID_AX_ID }, null, 2));

// 写两条合法 StateSnapshot（供 TR 引用）
for (const ssId of [VALID_SS_A, VALID_SS_B]) {
  await writeFile(path.join(FIXTURE_DIR, 'state_snapshots', `${ssId}.json`),
    JSON.stringify({ $kind: 'instance', $conforms_to: 'docs/current/state-snapshot-contract.md',
      $generated_by: 'test-fixture', $generated_at: new Date().toISOString(),
      id: ssId, episodeId: VALID_EP_ID, t: 0, values: { x: 1 },
      createdBy: 'test', createdAt: new Date().toISOString() }, null, 2));
}

async function writeSS(name, overrides) {
  const obj = {
    $kind: 'instance',
    $conforms_to: 'docs/current/state-snapshot-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(),
    id: `SS_${name}`,
    episodeId: VALID_EP_ID,
    t: 0,
    values: { x: 1 },
    createdBy: 'test',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  await writeFile(path.join(FIXTURE_DIR, 'state_snapshots', `SS_${name}.json`), JSON.stringify(obj, null, 2));
}

async function writeTR(name, overrides) {
  const obj = {
    $kind: 'instance',
    $conforms_to: 'docs/current/transition-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(),
    id: `TR_${name}`,
    episodeId: VALID_EP_ID,
    fromSnapshotId: VALID_SS_A,
    toSnapshotId: VALID_SS_B,
    causedByActionId: VALID_AX_ID,
    candidateMechanismIds: [],
    createdBy: 'test',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  await writeFile(path.join(FIXTURE_DIR, 'transitions', `TR_${name}.json`), JSON.stringify(obj, null, 2));
}

function allDirs() {
  return [
    path.join(FIXTURE_DIR, 'state_snapshots'),
    path.join(FIXTURE_DIR, 'transitions'),
    path.join(FIXTURE_DIR, 'episodes'),
    path.join(FIXTURE_DIR, 'action_executions'),
  ];
}

async function auditSS(name) {
  const results = await buildResults(allDirs());
  await checkStateSnapshotBindings(results);
  const target = results.find(r => r.file.includes(`SS_${name}.json`));
  return target?.findings ?? [];
}

async function auditTR(name) {
  const results = await buildResults(allDirs());
  await checkTransitionBindings(results);
  const target = results.find(r => r.file.includes(`TR_${name}.json`));
  return target?.findings ?? [];
}

// ──────────────────────────────────────────────────────────────────────────────
// T2：SS-1 episodeId 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: SS-1 episodeId 断链');

await writeSS('t2_bad_ep', { episodeId: 'story_NONEXISTENT_xyz' });
{
  const findings = await auditSS('t2_bad_ep');
  const codes = findings.map(f => f.code);
  check('命中 bad-state-snapshot-episode-ref', codes.includes('bad-state-snapshot-episode-ref'), codes.join(',') || 'none');
  check('不误触 empty-state-snapshot-values', !codes.includes('empty-state-snapshot-values'));
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：SS-2 values 为 null
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: SS-2 values 为 null');

await writeSS('t3_null_values', { values: null });
{
  const findings = await auditSS('t3_null_values');
  const codes = findings.map(f => f.code);
  check('命中 empty-state-snapshot-values', codes.includes('empty-state-snapshot-values'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：TR-1 episodeId 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: TR-1 episodeId 断链');

await writeTR('t4_bad_ep', { episodeId: 'story_NONEXISTENT_xyz' });
{
  const findings = await auditTR('t4_bad_ep');
  const codes = findings.map(f => f.code);
  check('命中 bad-transition-episode-ref', codes.includes('bad-transition-episode-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：TR-2 snapshot ref 断链 / from == to
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: TR-2 snapshotRef 断链 / from === to');

await writeTR('t5_bad_snap', { fromSnapshotId: 'SS_NONEXISTENT_xyz', toSnapshotId: 'SS_NONEXISTENT_yyy' });
{
  const findings = await auditTR('t5_bad_snap');
  const codes = findings.map(f => f.code);
  check('命中 bad-transition-snapshot-ref（ref 断链）', codes.includes('bad-transition-snapshot-ref'), codes.join(',') || 'none');
}

await writeTR('t5_same_ep', { fromSnapshotId: VALID_SS_A, toSnapshotId: VALID_SS_A });
{
  const findings = await auditTR('t5_same_ep');
  const codes = findings.map(f => f.code);
  check('命中 same-transition-endpoints（from===to）', codes.includes('same-transition-endpoints'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T6：TR-3 causedByActionId 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T6: TR-3 causedByActionId 断链');

await writeTR('t6_bad_action', { causedByActionId: 'AX_NONEXISTENT_xyz' });
{
  const findings = await auditTR('t6_bad_action');
  const codes = findings.map(f => f.code);
  check('命中 bad-transition-action-ref', codes.includes('bad-transition-action-ref'), codes.join(',') || 'none');
  check('不误触 snapshot 或 episode 错误桶',
    !codes.some(c => ['bad-transition-episode-ref', 'bad-transition-snapshot-ref', 'same-transition-endpoints'].includes(c)));
}

// ──────────────────────────────────────────────────────────────────────────────
// 清理 fixture
// ──────────────────────────────────────────────────────────────────────────────
await rm(FIXTURE_DIR, { recursive: true, force: true });

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ StateSnapshot / Transition binding audit 验收全部通过！');
} else {
  console.log('\n❌ StateSnapshot / Transition binding audit 有失败项，请检查。');
  process.exit(1);
}
