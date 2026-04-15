/**
 * test-v8-mechanism-class-audit.mjs
 * 验收：MechanismClass binding audit（§19 MC-1~MC-5）
 *
 * T1：合法 MechanismClass 走真实 export → 不命中任何 MC-x 错误桶
 * T2：MC-1 bad id → bad-mechanism-class-id
 * T3：MC-2 compiled 但 supporting_episode_ids 不足 → compiled-mechanism-without-support
 * T4：MC-3 observable_signatures 未覆盖 phase observations → mechanism-observation-signature-gap
 * T5：MC-4 intervention_points 名称不存在 → mechanism-intervention-point-missing
 * T6：MC-5 mechanismProgramIds 断链 → bad-mechanism-program-ref
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
const { checkMechanismClassBindings } = await import(auditUrl);

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
// T1：合法 MechanismClass governance pass（真实 export）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: 合法 MechanismClass governance pass（真实 export）');

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
      const mcDir = path.join(artifactsDir, d, 'mechanism_classes');
      if (existsSync(mcDir)) { latestRun = path.join(artifactsDir, d); break; }
    }
    check('存在含 mechanism_classes/ 的导出目录', latestRun !== null, latestRun ?? 'none');

    if (latestRun) {
      const mcDir = path.join(latestRun, 'mechanism_classes');
      const mcFiles = (await readdir(mcDir)).filter(f => f.endsWith('.json'));
      check('至少一条 mechanism_classes/*.json', mcFiles.length > 0, mcFiles.length);

      const subDirs = (await readdir(latestRun)).map(s => path.join(latestRun, s));
      const results = await buildResults(subDirs);
      await checkMechanismClassBindings(results);

      const mcResults = results.filter(r =>
        r.file.includes('mechanism_classes/') && r.fm?.$kind === 'instance'
      );
      check('MechanismClass 审计条目存在', mcResults.length > 0, mcResults.length);

      const MC_CODES = [
        'bad-mechanism-class-id', 'compiled-mechanism-without-support',
        'mechanism-observation-signature-gap', 'mechanism-intervention-point-missing',
        'bad-mechanism-program-ref',
      ];
      const anyMCError = mcResults.some(r => r.findings.some(f => MC_CODES.includes(f.code)));
      check('合法 MechanismClass 不命中任何 MC-x 错误桶', !anyMCError);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Fixture 基础设施
// ──────────────────────────────────────────────────────────────────────────────
const FIXTURE_DIR = path.join(ROOT, 'artifacts', '_test_fixture_mc_audit');
await rm(FIXTURE_DIR, { recursive: true, force: true });
await mkdir(path.join(FIXTURE_DIR, 'mechanism_classes'),  { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'mechanism_programs'), { recursive: true });

const VALID_MP_ID = 'MP_fixture_mc_001';

// 写基础 MechanismProgram 锚点
await writeFile(path.join(FIXTURE_DIR, 'mechanism_programs', `${VALID_MP_ID}.json`),
  JSON.stringify({
    $kind: 'instance', $conforms_to: 'docs/current/mechanism-program-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(),
    id: VALID_MP_ID,
  }, null, 2));

/** 构造一个合法 MechanismClass fixture，按需 override */
function makeMCObj(name, overrides = {}) {
  return {
    $kind: 'instance',
    $conforms_to: 'docs/current/mechanism-class-contract.md',
    $generated_by: 'test-fixture',
    $generated_at: new Date().toISOString(),
    id: `MC_${name}_00ab`,
    name,
    description: 'test fixture',
    input_slots: {},
    phases: [{ name: 'phase_one', expected_state_changes: [], expected_observations: ['sig_a'] }],
    preconditions: [],
    observable_signatures: ['sig_a'],
    intervention_points: ['phase_one'],
    outcomes: ['success'],
    supporting_episode_ids: [],
    compilation_status: 'candidate',
    mechanismProgramIds: [VALID_MP_ID],
    created_at: new Date().toISOString(),
    created_by: 'test-fixture',
    ...overrides,
  };
}

async function writeMC(name, overrides = {}) {
  const obj = makeMCObj(name, overrides);
  await writeFile(
    path.join(FIXTURE_DIR, 'mechanism_classes', `MC_${name}_00ab.json`),
    JSON.stringify(obj, null, 2)
  );
}

function allDirs() {
  return [
    path.join(FIXTURE_DIR, 'mechanism_classes'),
    path.join(FIXTURE_DIR, 'mechanism_programs'),
  ];
}

async function auditMC(name) {
  const results = await buildResults(allDirs());
  await checkMechanismClassBindings(results);
  const target = results.find(r => r.file.includes(`MC_${name}_00ab.json`));
  return target?.findings ?? [];
}

// ──────────────────────────────────────────────────────────────────────────────
// T2：MC-1 id 格式非法
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: MC-1 id 格式非法');

await writeMC('t2_bad_id', { id: 'BAD_id_format' });
{
  const findings = await auditMC('t2_bad_id');
  const codes = findings.map(f => f.code);
  check('命中 bad-mechanism-class-id', codes.includes('bad-mechanism-class-id'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：MC-2 compiled 但 supporting_episode_ids 不足
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: MC-2 compiled 但 supporting_episode_ids 不足');

await writeMC('t3_compiled_nosupport', {
  compilation_status: 'compiled',
  supporting_episode_ids: ['ep_only_one'],
});
{
  const findings = await auditMC('t3_compiled_nosupport');
  const codes = findings.map(f => f.code);
  check('命中 compiled-mechanism-without-support',
    codes.includes('compiled-mechanism-without-support'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：MC-3 observable_signatures 未覆盖 phase observations
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: MC-3 observable_signatures 未覆盖 phase observations');

await writeMC('t4_sig_gap', {
  phases: [{ name: 'phase_one', expected_state_changes: [], expected_observations: ['sig_a', 'sig_missing'] }],
  observable_signatures: ['sig_a'], // 缺少 sig_missing
});
{
  const findings = await auditMC('t4_sig_gap');
  const codes = findings.map(f => f.code);
  check('命中 mechanism-observation-signature-gap',
    codes.includes('mechanism-observation-signature-gap'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：MC-4 intervention_points 名称不存在
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: MC-4 intervention_points 名称不存在');

await writeMC('t5_bad_intervention', {
  intervention_points: ['phase_one', 'nonexistent_phase'],
});
{
  const findings = await auditMC('t5_bad_intervention');
  const codes = findings.map(f => f.code);
  check('命中 mechanism-intervention-point-missing',
    codes.includes('mechanism-intervention-point-missing'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T6：MC-5 mechanismProgramIds 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T6: MC-5 mechanismProgramIds 断链');

await writeMC('t6_bad_program', { mechanismProgramIds: ['MP_NONEXISTENT_xyz'] });
{
  const findings = await auditMC('t6_bad_program');
  const codes = findings.map(f => f.code);
  check('命中 bad-mechanism-program-ref',
    codes.includes('bad-mechanism-program-ref'), codes.join(',') || 'none');
  check('不误触其他 MC-x 错误桶',
    !codes.some(c => [
      'bad-mechanism-class-id', 'compiled-mechanism-without-support',
      'mechanism-observation-signature-gap', 'mechanism-intervention-point-missing',
    ].includes(c)));
}

// ──────────────────────────────────────────────────────────────────────────────
// 清理 fixture
// ──────────────────────────────────────────────────────────────────────────────
await rm(FIXTURE_DIR, { recursive: true, force: true });

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ MechanismClass binding audit 验收全部通过！');
} else {
  console.log('\n❌ MechanismClass binding audit 有失败项，请检查。');
  process.exit(1);
}
