/**
 * test-v8-supportlink-deep-audit.mjs
 * 验收：SupportLink deep binding audit（§21 SL-1~SL-4）
 *
 * T1：合法 SupportLink / MechanismInstance / DerivationTrace → 不命中任何 SL-x 错误桶
 * T2：SL-1 polarity 非法 → bad-support-link-polarity
 * T3：SL-2 weight 越界 → bad-support-link-weight
 * T4：SL-3 MechanismInstance.support_link_refs 断链 → bad-mechanism-instance-support-link-ref
 * T5：SL-4 DerivationTrace.supportLinks 内嵌元素 id 断链 → bad-derivation-trace-support-link
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
const { checkSupportLinkDeepBindings } = await import(auditUrl);

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
// T1：真实 export — 合法 SupportLink / MI / DT 不命中任何 SL-x 错误
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: 合法产物 SupportLink deep audit pass（真实 export）');

{
  const artifactsDir = path.join(ROOT, 'artifacts');
  const entries = (await readdir(artifactsDir)).filter(d => /^\d{8}-v7e-/.test(d));
  check('至少存在一个 v7e 导出目录', entries.length > 0, entries.length);

  if (entries.length > 0) {
    const withMtime = await Promise.all(
      entries.map(async d => ({ d, mtime: (await stat(path.join(artifactsDir, d))).mtimeMs }))
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);
    const latestRun = path.join(artifactsDir, withMtime[0].d);

    const subDirs = (await readdir(latestRun)).map(s => path.join(latestRun, s));
    const results = await buildResults(subDirs);
    await checkSupportLinkDeepBindings(results);

    const SL_CODES = [
      'bad-support-link-polarity', 'bad-support-link-weight',
      'bad-mechanism-instance-support-link-ref', 'bad-derivation-trace-support-link',
    ];
    const anyError = results.some(r => r.findings.some(f => SL_CODES.includes(f.code)));
    check('真实 export 不命中任何 SL-x 错误桶', !anyError);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Fixture 基础设施
// ──────────────────────────────────────────────────────────────────────────────
const FIXTURE_DIR = path.join(ROOT, 'artifacts', '_test_fixture_sl_deep_audit');
await rm(FIXTURE_DIR, { recursive: true, force: true });
await mkdir(path.join(FIXTURE_DIR, 'support_links'),         { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'mechanism_instances'),   { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'derivation_chains'),     { recursive: true });

const VALID_SL_ID = 'SL_fixture_deep_001';

/** 写一个合法 SupportLink */
async function writeSL(id, overrides = {}) {
  await writeFile(path.join(FIXTURE_DIR, 'support_links', `${id}.json`),
    JSON.stringify({
      $kind: 'instance',
      $conforms_to: 'docs/current/support-link-contract.md',
      $generated_by: 'test-fixture',
      $generated_at: new Date().toISOString(),
      id,
      observationRecordId: 'OR_fixture_001',
      claimId: 'CLM_fixture_001',
      polarity: 'supports',
      weight: 0.75,
      sourceKind: 'pipeline',
      sourceRef: null,
      createdAt: new Date().toISOString(),
      createdBy: 'test-fixture',
      ...overrides,
    }, null, 2));
}

/** 写一个合法 MechanismInstance（support_link_refs 可 override） */
async function writeMI(id, overrides = {}) {
  await writeFile(path.join(FIXTURE_DIR, 'mechanism_instances', `${id}.json`),
    JSON.stringify({
      $kind: 'instance',
      $conforms_to: 'docs/current/mechanism-instance-contract.md',
      $generated_by: 'test-fixture',
      $generated_at: new Date().toISOString(),
      id,
      support_link_refs: [],
      claim_ids: [],
      status: 'candidate',
      ...overrides,
    }, null, 2));
}

/** 写一个合法 DerivationTrace（supportLinks 可 override） */
async function writeDT(id, overrides = {}) {
  await writeFile(path.join(FIXTURE_DIR, 'derivation_chains', `${id}.json`),
    JSON.stringify({
      $kind: 'instance',
      $conforms_to: 'docs/current/derivation-chain-contract.md',
      $generated_by: 'test-fixture',
      $generated_at: new Date().toISOString(),
      id,
      supportLinks: [],
      ...overrides,
    }, null, 2));
}

function allDirs() {
  return [
    path.join(FIXTURE_DIR, 'support_links'),
    path.join(FIXTURE_DIR, 'mechanism_instances'),
    path.join(FIXTURE_DIR, 'derivation_chains'),
  ];
}

async function auditFile(relPath) {
  const results = await buildResults(allDirs());
  await checkSupportLinkDeepBindings(results);
  return results.find(r => r.file.includes(relPath))?.findings ?? [];
}

// 写基础合法锚点
await writeSL(VALID_SL_ID);

// ──────────────────────────────────────────────────────────────────────────────
// T2：SL-1 polarity 非法
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: SL-1 SupportLink.polarity 非法');

await writeSL('SL_fixture_t2_bad_polarity', { id: 'SL_fixture_t2_bad_polarity', polarity: 'maybe' });
{
  const findings = await auditFile('SL_fixture_t2_bad_polarity.json');
  const codes = findings.map(f => f.code);
  check('命中 bad-support-link-polarity',
    codes.includes('bad-support-link-polarity'), codes.join(',') || 'none');
  check('不误触 bad-support-link-weight',
    !codes.includes('bad-support-link-weight'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：SL-2 weight 越界
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: SL-2 SupportLink.weight 越界');

await writeSL('SL_fixture_t3_bad_weight', { id: 'SL_fixture_t3_bad_weight', weight: 1.5 });
{
  const findings = await auditFile('SL_fixture_t3_bad_weight.json');
  const codes = findings.map(f => f.code);
  check('命中 bad-support-link-weight',
    codes.includes('bad-support-link-weight'), codes.join(',') || 'none');
  check('不误触 bad-support-link-polarity',
    !codes.includes('bad-support-link-polarity'), codes.join(',') || 'none');
}

// weight = -0.1 也应报错
await writeSL('SL_fixture_t3b_neg_weight', { id: 'SL_fixture_t3b_neg_weight', weight: -0.1 });
{
  const findings = await auditFile('SL_fixture_t3b_neg_weight.json');
  const codes = findings.map(f => f.code);
  check('weight 负数也命中 bad-support-link-weight',
    codes.includes('bad-support-link-weight'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：SL-3 MechanismInstance.support_link_refs 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: SL-3 MechanismInstance.support_link_refs 断链');

await writeMI('MI_fixture_t4_bad_ref', {
  id: 'MI_fixture_t4_bad_ref',
  support_link_refs: ['SL_NONEXISTENT_xyz'],
});
{
  const findings = await auditFile('MI_fixture_t4_bad_ref.json');
  const codes = findings.map(f => f.code);
  check('命中 bad-mechanism-instance-support-link-ref',
    codes.includes('bad-mechanism-instance-support-link-ref'), codes.join(',') || 'none');
}

// 合法 ref → 不触发
await writeMI('MI_fixture_t4_valid_ref', {
  id: 'MI_fixture_t4_valid_ref',
  support_link_refs: [VALID_SL_ID],
});
{
  const findings = await auditFile('MI_fixture_t4_valid_ref.json');
  const codes = findings.map(f => f.code);
  check('合法 support_link_refs 不触发 bad-mechanism-instance-support-link-ref',
    !codes.includes('bad-mechanism-instance-support-link-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：SL-4 DerivationTrace.supportLinks 内嵌元素 id 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: SL-4 DerivationTrace.supportLinks 内嵌元素 id 断链');

await writeDT('DT_fixture_t5_bad_link', {
  id: 'DT_fixture_t5_bad_link',
  supportLinks: [{ id: 'SL_NONEXISTENT_embed', observationRecordId: 'OR_x', claimId: 'CLM_x' }],
});
{
  const findings = await auditFile('DT_fixture_t5_bad_link.json');
  const codes = findings.map(f => f.code);
  check('命中 bad-derivation-trace-support-link',
    codes.includes('bad-derivation-trace-support-link'), codes.join(',') || 'none');
}

// 合法内嵌（id 存在于 slMap）→ 不触发
await writeDT('DT_fixture_t5_valid_link', {
  id: 'DT_fixture_t5_valid_link',
  supportLinks: [{ id: VALID_SL_ID, observationRecordId: 'OR_fixture_001', claimId: 'CLM_fixture_001' }],
});
{
  const findings = await auditFile('DT_fixture_t5_valid_link.json');
  const codes = findings.map(f => f.code);
  check('合法内嵌 supportLinks 不触发 bad-derivation-trace-support-link',
    !codes.includes('bad-derivation-trace-support-link'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// 清理 fixture
// ──────────────────────────────────────────────────────────────────────────────
await rm(FIXTURE_DIR, { recursive: true, force: true });

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ SupportLink deep binding audit 验收全部通过！');
} else {
  console.log('\n❌ SupportLink deep binding audit 有失败项，请检查。');
  process.exit(1);
}
