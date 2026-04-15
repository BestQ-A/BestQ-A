/**
 * test-v8-outcome-record-audit.mjs
 * 验收：OutcomeRecord binding audit（§15 OR-1..OR-4）
 *
 * T1：合法 OutcomeRecord 走真实 export → 不命中任何 OR-* 错误桶
 * T2：坏 episodeId → bad-outcome-record-episode-ref
 * T3：坏 causedByActionExecutionId → bad-outcome-record-action-ref
 * T4：非法 status → bad-outcome-record-status
 * T5：空 summary → empty-outcome-record-summary
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

// 用 pathToFileURL 确保 Windows 路径可以 import
const auditUrl = pathToFileURL(path.join(ROOT, 'scripts', 'contract-audit.mjs')).href;
const { checkOutcomeRecordBindings } = await import(auditUrl);

// ──────────────────────────────────────────────────────────────────────────────
// 工具：从目录构建 results 数组并运行 checkOutcomeRecordBindings
// ──────────────────────────────────────────────────────────────────────────────
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
// T1：合法 OutcomeRecord 走最新 export（按 mtime 排序取最新含 outcome_records 的）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: 合法 OutcomeRecord governance pass（真实 export）');

{
  const artifactsDir = path.join(ROOT, 'artifacts');
  const entries = (await readdir(artifactsDir)).filter(d => /^\d{8}-v7e-/.test(d));
  check('至少存在一个 v7e 导出目录', entries.length > 0, entries.length);

  if (entries.length > 0) {
    // 按目录 mtime 降序取最新
    const withMtime = await Promise.all(
      entries.map(async d => ({ d, mtime: (await stat(path.join(artifactsDir, d))).mtimeMs }))
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);

    // 找第一个含 outcome_records/ 的运行目录
    let latestRun = null;
    for (const { d } of withMtime) {
      const orcDir = path.join(artifactsDir, d, 'outcome_records');
      if (existsSync(orcDir)) { latestRun = path.join(artifactsDir, d); break; }
    }
    check('存在含 outcome_records/ 的导出目录', latestRun !== null, latestRun ?? 'none');

    if (latestRun) {
      const orcDir = path.join(latestRun, 'outcome_records');
      const jsonFiles = (await readdir(orcDir)).filter(f => f.endsWith('.json'));
      check('至少一条 outcome_records/*.json', jsonFiles.length > 0, jsonFiles.length);

      if (jsonFiles.length > 0) {
        // 加载整个 latestRun（需要 episodes + action_executions 作为索引）
        const subDirs = (await readdir(latestRun)).map(s => path.join(latestRun, s));
        const results = await buildResults(subDirs);
        await checkOutcomeRecordBindings(results);

        const orcResults = results.filter(r =>
          r.file.includes('outcome_records/') && r.fm?.$kind === 'instance'
        );
        check('OutcomeRecord 审计条目存在', orcResults.length > 0, orcResults.length);

        const anyORError = orcResults.some(r =>
          r.findings.some(f => [
            'bad-outcome-record-episode-ref', 'bad-outcome-record-action-ref',
            'bad-outcome-record-status', 'empty-outcome-record-summary',
          ].includes(f.code))
        );
        check('合法 OutcomeRecord 不命中任何 OR-* 错误桶', !anyORError);
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 构造 fixture 目录（T2–T5）
// ──────────────────────────────────────────────────────────────────────────────
const FIXTURE_DIR = path.join(ROOT, 'artifacts', '_test_fixture_orc_audit');
await rm(FIXTURE_DIR, { recursive: true, force: true });
await mkdir(path.join(FIXTURE_DIR, 'outcome_records'), { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'episodes'), { recursive: true });
await mkdir(path.join(FIXTURE_DIR, 'action_executions'), { recursive: true });

const VALID_EP_ID = 'ep_fixture_orc_001';
const VALID_AX_ID = 'AX_fixture_orc_001';

await writeFile(
  path.join(FIXTURE_DIR, 'episodes', `${VALID_EP_ID}.json`),
  JSON.stringify({
    $kind: 'instance',
    $conforms_to: 'docs/current/v7-world-model-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(),
    id: VALID_EP_ID,
  }, null, 2)
);
await writeFile(
  path.join(FIXTURE_DIR, 'action_executions', `${VALID_AX_ID}.json`),
  JSON.stringify({
    $kind: 'instance',
    $conforms_to: 'docs/current/action-execution-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(),
    id: VALID_AX_ID,
  }, null, 2)
);

async function writeORC(name, overrides) {
  const obj = {
    $kind: 'instance',
    $conforms_to: 'docs/current/outcome-record-contract.md',
    $generated_by: 'test-fixture', $generated_at: new Date().toISOString(),
    id: `ORC_${name}`,
    episodeId: VALID_EP_ID,
    causedByActionExecutionId: VALID_AX_ID,
    status: 'partial',
    summary: 'test fixture summary',
    observedSignals: [], sideEffects: [], evidenceRefs: [],
    recordedAt: new Date().toISOString(), recordedBy: 'test',
    ...overrides,
  };
  await writeFile(
    path.join(FIXTURE_DIR, 'outcome_records', `ORC_${name}.json`),
    JSON.stringify(obj, null, 2)
  );
}

async function auditFixture(name) {
  const results = await buildResults([
    path.join(FIXTURE_DIR, 'outcome_records'),
    path.join(FIXTURE_DIR, 'episodes'),
    path.join(FIXTURE_DIR, 'action_executions'),
  ]);
  await checkOutcomeRecordBindings(results);
  const target = results.find(r => r.file.includes(`ORC_${name}.json`));
  return target?.findings ?? [];
}

// ──────────────────────────────────────────────────────────────────────────────
// T2：OR-1 episodeId 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: OR-1 episodeId 断链');

await writeORC('t2_bad_episode', { episodeId: 'ep_NONEXISTENT_xyz' });
{
  const findings = await auditFixture('t2_bad_episode');
  const codes = findings.map(f => f.code);
  check('命中 bad-outcome-record-episode-ref', codes.includes('bad-outcome-record-episode-ref'), codes.join(',') || 'none');
  check('不误触其他 OR 错误桶',
    !codes.some(c => ['bad-outcome-record-action-ref', 'bad-outcome-record-status', 'empty-outcome-record-summary'].includes(c)));
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：OR-2 causedByActionExecutionId 断链
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: OR-2 causedByActionExecutionId 断链');

await writeORC('t3_bad_action', { causedByActionExecutionId: 'AX_NONEXISTENT_xyz' });
{
  const findings = await auditFixture('t3_bad_action');
  const codes = findings.map(f => f.code);
  check('命中 bad-outcome-record-action-ref', codes.includes('bad-outcome-record-action-ref'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：OR-3 status 非法
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: OR-3 status 非法枚举');

await writeORC('t4_bad_status', { status: 'unknown_invalid_value' });
{
  const findings = await auditFixture('t4_bad_status');
  const codes = findings.map(f => f.code);
  check('命中 bad-outcome-record-status', codes.includes('bad-outcome-record-status'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：OR-4 summary 为空
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: OR-4 summary 为空');

await writeORC('t5_empty_summary', { summary: '   ' });
{
  const findings = await auditFixture('t5_empty_summary');
  const codes = findings.map(f => f.code);
  check('命中 empty-outcome-record-summary', codes.includes('empty-outcome-record-summary'), codes.join(',') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// 清理 fixture
// ──────────────────────────────────────────────────────────────────────────────
await rm(FIXTURE_DIR, { recursive: true, force: true });

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ OutcomeRecord binding audit 验收全部通过！');
} else {
  console.log('\n❌ OutcomeRecord binding audit 有失败项，请检查。');
  process.exit(1);
}
