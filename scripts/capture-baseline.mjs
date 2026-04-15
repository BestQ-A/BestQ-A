#!/usr/bin/env node
// ---
// kind: code
// implements: docs/current/artifact-contract.md
// also related: docs/current/metrics-contract.md
// ---
/**
 * BestQ-A Phase 0 baseline 捕获脚本
 *
 * 职责：在改任何代码之前，把"今天能跑出什么数"固化到
 *   .omx/baselines/<YYYY-MM-DD>/
 * 下的若干文件里。脚本必须对单步失败保持韧性：某步失败写进 summary
 * 的 "failed steps" 段落，继续跑下一步。
 *
 * 用法（从项目根）:  node scripts/capture-baseline.mjs
 *
 * 产物约束参考：
 *   docs/bestqa-roadmap.md Phase 0
 *   docs/current/artifact-contract.md
 *   docs/current/metrics-contract.md
 */

import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MCP_DIR = path.join(ROOT, 'causal-learner', 'mcp-server');
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const OUT_DIR = path.join(ROOT, '.omx', 'baselines', TODAY);

/** 步骤执行结果，汇总到 summary.md */
const steps = [];

/** 分类元数据：所有落盘产物必须以这些字段开头，才能被 contract-audit.mjs 识别为 instance。
 *  注意（2026-04-13 taxonomy review 修复）：
 *   - stats.json 的内容 schema 归 stats-snapshot-contract.md
 *   - summary.md / coverage-matrix.md 的内容 schema 归 run-summary-contract.md
 *   - capture-baseline.mjs 自身作为生成器依旧 implements artifact-contract.md（目录布局）。
 * TODO(2026-04-13): stats-snapshot-contract.md / run-summary-contract.md 由并行 agent 建立中。
 */
const STATS_STATS_INSTANCE_META_JSON = {
  $kind: 'instance',
  $conforms_to: 'docs/current/stats-snapshot-contract.md',
  $generated_by: 'causal-learner/mcp-server/scripts/dump-stats.mjs',
};
const MD_FRONTMATTER = [
  '---',
  'kind: instance',
  'conforms_to: docs/current/run-summary-contract.md',
  'generated_by: scripts/capture-baseline.mjs',
  `generated_at: ${TODAY}`,
  '---',
  '',
].join('\n');

function record(name, ok, detail = '') {
  steps.push({ name, ok, detail });
  const tag = ok ? 'OK  ' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}

/**
 * 运行 shell 命令，捕获合并后的 stdout/stderr。
 * 永不抛出；失败通过返回值里的 code 表达。
 */
function run(cmd, args, cwd) {
  try {
    const r = spawnSync(cmd, args, {
      cwd: cwd || ROOT,
      shell: true,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return {
      code: r.status ?? -1,
      out: (r.stdout || '') + (r.stderr || ''),
      err: r.error ? String(r.error) : '',
    };
  } catch (e) {
    return { code: -1, out: '', err: String(e) };
  }
}

async function safeWrite(rel, content) {
  const p = path.join(OUT_DIR, rel);
  await writeFile(p, content, 'utf8');
}

// --- Step 1: 准备目录 ---------------------------------------------------
async function stepMkdir() {
  try {
    await mkdir(OUT_DIR, { recursive: true });
    record('mkdir baseline dir', true, OUT_DIR);
    return true;
  } catch (e) {
    record('mkdir baseline dir', false, String(e));
    return false;
  }
}

// --- Step 2: git HEAD ---------------------------------------------------
async function stepCommit() {
  const r = run('git', ['rev-parse', '--short', 'HEAD']);
  const sha = (r.out || '').trim() || 'unknown';
  try {
    await safeWrite('commit.txt', sha + '\n');
    record('capture git HEAD', r.code === 0, sha);
  } catch (e) {
    record('capture git HEAD', false, String(e));
  }
  return sha;
}

// --- Step 3: build + tests ---------------------------------------------
async function stepBuildAndTest() {
  const log = [];
  const push = (title, r) => {
    log.push(`\n===== ${title} (code=${r.code}) =====\n${r.out}${r.err ? '\nERR: ' + r.err : ''}\n`);
  };

  // build
  const build = run('npm', ['run', 'build'], MCP_DIR);
  push('npm run build', build);
  record('mcp-server build', build.code === 0);

  // 运行 tests 目录下全部 test-*.mjs（只有 build 成功才跑）
  let testsOkCount = 0;
  let testsFailCount = 0;
  if (build.code === 0) {
    let testFiles = [];
    try {
      testFiles = (await readdir(path.join(MCP_DIR, 'tests')))
        .filter((f) => f.startsWith('test-') && f.endsWith('.mjs'))
        .sort();
    } catch (e) {
      log.push(`\n[tests discovery failed] ${e}\n`);
    }
    for (const f of testFiles) {
      const r = run('node', [path.join('tests', f)], MCP_DIR);
      push(`node tests/${f}`, r);
      if (r.code === 0) testsOkCount++;
      else testsFailCount++;
    }
    record(
      'mcp-server tests',
      testsFailCount === 0 && testsOkCount > 0,
      `${testsOkCount} ok / ${testsFailCount} fail`,
    );
  } else {
    record('mcp-server tests', false, 'skipped: build failed');
  }

  try {
    await safeWrite('tests.log', log.join('\n'));
  } catch (e) {
    record('write tests.log', false, String(e));
  }
  return { buildOk: build.code === 0, testsOkCount, testsFailCount };
}

// --- Step 4: stats 快照 -------------------------------------------------
async function stepStats(buildOk) {
  // 调用 causal-learner/mcp-server/scripts/dump-stats.mjs，
  // 它会实例化空 storage/graph/pipeline 并把 getStats 结果拼成 JSON 打到 stdout。
  // 单点失败由 dump-stats 内部捕获为 { error } 字段，这里只管 spawn + JSON.parse。
  if (!buildOk) {
    const payload = {
      ...STATS_INSTANCE_META_JSON,
      $generated_at: new Date().toISOString(),
      captured_at: new Date().toISOString(),
      error: 'skipped: mcp-server build failed, dist/ unavailable',
    };
    try {
      await safeWrite('stats.json', JSON.stringify(payload, null, 2) + '\n');
    } catch (_) {}
    record('stats snapshot', false, 'skipped: build failed');
    return { ok: false, fields: [], errors: ['build failed'] };
  }

  const r = run('node', [path.join('scripts', 'dump-stats.mjs')], MCP_DIR);
  let parsed = null;
  let parseErr = '';
  try {
    // stdout 里可能混入 npm 的 build 日志；只取最后一个 { 起到最后一个 } 的片段
    const start = r.out.indexOf('{');
    const end = r.out.lastIndexOf('}');
    if (start >= 0 && end > start) {
      parsed = JSON.parse(r.out.slice(start, end + 1));
    } else {
      throw new Error('no JSON object found in dump-stats output');
    }
  } catch (e) {
    parseErr = String(e);
  }

  if (!parsed) {
    const payload = {
      ...STATS_INSTANCE_META_JSON,
      $generated_at: new Date().toISOString(),
      captured_at: new Date().toISOString(),
      error: `dump-stats failed: code=${r.code} parse=${parseErr}`,
      raw_tail: (r.out || '').slice(-2000),
    };
    try {
      await safeWrite('stats.json', JSON.stringify(payload, null, 2) + '\n');
    } catch (_) {}
    record('stats snapshot', false, `dump-stats code=${r.code}`);
    return { ok: false, fields: [], errors: [parseErr || `exit ${r.code}`] };
  }

  try {
    // 若 dump-stats.mjs 已自带 $kind 就直接落盘；否则注入元数据以保证 instance 识别
    const payload = parsed && parsed.$kind === 'instance'
      ? parsed
      : { ...STATS_INSTANCE_META_JSON, $generated_at: new Date().toISOString(), ...parsed };
    await safeWrite('stats.json', JSON.stringify(payload, null, 2) + '\n');
  } catch (e) {
    record('stats snapshot', false, String(e));
    return { ok: false, fields: [], errors: [String(e)] };
  }

  // 分类：哪些字段是真数据，哪些 key 是 error
  const okFields = [];
  const errFields = [];
  for (const [k, v] of Object.entries(parsed)) {
    if (k === 'captured_at') continue;
    if (v && typeof v === 'object' && 'error' in v) errFields.push(k);
    else okFields.push(k);
  }
  const status = errFields.length === 0 ? 'OK' : okFields.length > 0 ? 'PARTIAL' : 'FAILED';
  record('stats snapshot', errFields.length === 0, `${status}: ${okFields.length} ok / ${errFields.length} error`);
  return { ok: errFields.length === 0, status, fields: okFields, errors: errFields };
}

// --- Step 5: coverage matrix -------------------------------------------
async function stepCoverage() {
  const lines = [
    MD_FRONTMATTER.replace(/\n$/, ''),
    '# Coverage Matrix',
    '',
    '> 扫描 `causal-learner/mcp-server/src/core/*.ts`，检查 tests/ 目录下是否有文本引用。',
    '> 这是极粗的"提及即覆盖"近似，不等价于行覆盖率。',
    '',
    '| source | referenced by tests | hits |',
    '|--------|--------------------|------|',
  ];
  try {
    const coreDir = path.join(MCP_DIR, 'src', 'core');
    const testDir = path.join(MCP_DIR, 'tests');
    const sources = (await readdir(coreDir)).filter((f) => f.endsWith('.ts')).sort();
    const testFiles = (await readdir(testDir)).filter((f) => f.endsWith('.mjs'));
    const testBlobs = await Promise.all(
      testFiles.map(async (f) => ({ f, text: await readFile(path.join(testDir, f), 'utf8') })),
    );
    for (const src of sources) {
      const base = src.replace(/\.ts$/, '');
      const hitters = testBlobs.filter((t) => t.text.includes(base)).map((t) => t.f);
      const mark = hitters.length > 0 ? 'yes' : 'no';
      lines.push(`| ${src} | ${mark} | ${hitters.join(', ') || '-'} |`);
    }
    await safeWrite('coverage-matrix.md', lines.join('\n') + '\n');
    record('coverage matrix', true, `${sources.length} source files scanned`);
  } catch (e) {
    try {
      await safeWrite('coverage-matrix.md', MD_FRONTMATTER + '# Coverage Matrix\n\nFAILED: ' + String(e) + '\n');
    } catch (_) {}
    record('coverage matrix', false, String(e));
  }
}

// --- Step 6: summary.md -------------------------------------------------
async function stepSummary(sha, tr, statsRes) {
  const failed = steps.filter((s) => !s.ok);
  const ok = steps.filter((s) => s.ok);
  const statsStatus = statsRes?.status ?? 'UNKNOWN';
  const lines = [
    MD_FRONTMATTER.replace(/\n$/, ''),
    `# Baseline ${TODAY}`,
    '',
    `- commit: \`${sha}\``,
    `- out: \`.omx/baselines/${TODAY}/\``,
    `- Stats capture status: **${statsStatus}** — ok=[${(statsRes?.fields ?? []).join(', ') || 'none'}] error=[${(statsRes?.errors ?? []).join(', ') || 'none'}]`,
    '',
    '## Conclusion',
    '',
    tr && tr.buildOk && tr.testsFailCount === 0 && tr.testsOkCount > 0
      ? `Build OK, ${tr.testsOkCount} test files passed. Baseline is reproducible for re-run.`
      : `Partial baseline. build=${tr?.buildOk ? 'ok' : 'fail'}, tests ok=${tr?.testsOkCount ?? 0} fail=${tr?.testsFailCount ?? 0}.`,
    '',
    '## Files',
    '',
    '- `commit.txt` — git HEAD short sha',
    '- `tests.log` — build + test 全量输出',
    '- `stats.json` — causal-learner stats 快照（真实字段：storageStats / dualStats / longtermStats / graphStats / pipelineStats，均基于空 :memory: 实例）',
    '- `coverage-matrix.md` — core/*.ts 与 tests 的粗粒度关联表',
    '- `summary.md` — 本文件',
    '',
    '## Steps',
    '',
    ...ok.map((s) => `- OK   ${s.name}${s.detail ? ' — ' + s.detail : ''}`),
    '',
    '## Failed Steps',
    '',
    failed.length === 0
      ? '- (none)'
      : failed.map((s) => `- FAIL ${s.name}${s.detail ? ' — ' + s.detail : ''}`).join('\n'),
    '',
    '## Captured',
    '',
    `- stats.json: ${statsStatus}`,
    `  - ok fields: ${(statsRes?.fields ?? []).join(', ') || '(none)'}`,
    `  - error fields: ${(statsRes?.errors ?? []).join(', ') || '(none)'}`,
    '  - 注：当前对空 :memory: 实例采集，所有计数为 0 属正常；字段结构真实来自 storage/dual-storage/atom-graph/pipeline.getStats()',
    '',
    '## Known Gaps',
    '',
    '- stats 采集目前面向空内存实例，只固化"结构 + 零值"，不反映真实长期库内容',
    '- 覆盖率是文本近似，不是行覆盖率',
    '- swebench-10.json 未生成（路线图 Phase 0 列的 swebench 快照尚未脚本化）',
    '',
  ];
  try {
    await safeWrite('summary.md', lines.join('\n'));
    console.log(`\nBaseline written to ${OUT_DIR}`);
  } catch (e) {
    console.error('FATAL: failed to write summary.md:', e);
  }
}

// --- main ---------------------------------------------------------------
(async () => {
  const mkOk = await stepMkdir();
  if (!mkOk) process.exit(1);
  const sha = await stepCommit();
  const tr = await stepBuildAndTest();
  const statsRes = await stepStats(tr.buildOk);
  await stepCoverage();
  await stepSummary(sha, tr, statsRes);
})();
