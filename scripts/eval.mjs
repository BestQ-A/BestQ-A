#!/usr/bin/env node
// ---
// kind: code
// implements: docs/current/artifact-contract.md
// also related: docs/current/metrics-contract.md
// also related: docs/current/stats-snapshot-contract.md
// also related: docs/current/run-summary-contract.md
// ---
// TODO(2026-04-13): stats-snapshot-contract.md / run-summary-contract.md 由并行 agent 建立中；
// 本脚本产出的 stats_before.json / stats_after.json / summary.md 已按新 contract 绑定。
/**
 * BestQ-A Phase 1 评测入口脚本 (scripts/eval.mjs)
 *
 * 职责（闭合 metrics-contract.md §6 的 MET-04 / MET-05 两条 Open Issue）：
 *   1. 生成合规的 run_id 目录 artifacts/<YYYYMMDD-NNN>/
 *   2. 前后各调一次 causal-learner/mcp-server/scripts/dump-stats.mjs
 *      快照四类 stats（storageStats / dualStats / longtermStats / graphStats / pipelineStats）
 *   3. 运行 Phase 1 占位 workload：causal-learner/mcp-server/tests/test-basic.mjs
 *   4. 按 metrics-contract.md §2 字段字典严格顺序映射字段，写 metrics.json
 *   5. 生成 verification_report.json / summary.md / run.log
 *   6. 任一步失败仍落盘剩余文件，未采集字段写 null（遵守 artifact-contract.md §3 失败语义）
 *
 * 用法（从项目根）:
 *   node scripts/eval.mjs [--dataset placeholder] [--n-instances 0] [--phase phase1] [--out-dir artifacts]
 *
 * 约束：纯 ESM，Node 20+，无外部依赖，Windows 友好。
 */

import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const MCP_DIR = path.join(ROOT, 'causal-learner', 'mcp-server');

// ---- 1. 极简 argv 解析 -------------------------------------------------
function parseArgs(argv) {
  const out = {
    dataset: 'placeholder',
    'n-instances': 0,
    phase: 'phase1',
    'out-dir': 'artifacts',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = val;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const DATASET = String(args.dataset);
const N_INSTANCES = Number(args['n-instances']) || 0;
const PHASE = String(args.phase);
const OUT_DIR_REL = String(args['out-dir']);
const OUT_DIR = path.isAbsolute(OUT_DIR_REL) ? OUT_DIR_REL : path.join(ROOT, OUT_DIR_REL);

// ---- 2. 通用工具 -------------------------------------------------------
const logBuf = [];
function logLine(s) {
  const line = `[${new Date().toISOString()}] ${s}`;
  logBuf.push(line);
  console.log(line);
}

function run(cmd, cmdArgs, cwd) {
  try {
    const r = spawnSync(cmd, cmdArgs, {
      cwd: cwd || ROOT,
      shell: true,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return {
      code: r.status ?? -1,
      out: r.stdout || '',
      err: r.stderr || '',
      error: r.error ? String(r.error) : '',
    };
  } catch (e) {
    return { code: -1, out: '', err: '', error: String(e) };
  }
}

// ---- 3. run_id 生成：YYYYMMDD-NNN ---------------------------------------
function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

async function nextRunId(outDir) {
  const stamp = todayStamp();
  let max = 0;
  try {
    const entries = await readdir(outDir);
    for (const e of entries) {
      const m = /^(\d{8})-(\d{3})$/.exec(e);
      if (m && m[1] === stamp) {
        const n = parseInt(m[2], 10);
        if (n > max) max = n;
      }
    }
  } catch {
    // 目录不存在；后面会创建
  }
  const next = String(max + 1).padStart(3, '0');
  return `${stamp}-${next}`;
}

// ---- 4. stats 快照：spawn dump-stats.mjs 并 JSON.parse -----------------
function snapshotStats(tag) {
  logLine(`[stats:${tag}] spawn dump-stats.mjs`);
  const r = run('node', [path.join('scripts', 'dump-stats.mjs')], MCP_DIR);
  logBuf.push(`\n===== dump-stats ${tag} (code=${r.code}) =====`);
  if (r.out) logBuf.push(r.out);
  if (r.err) logBuf.push('STDERR: ' + r.err);
  if (r.error) logBuf.push('ERROR: ' + r.error);

  if (r.code !== 0 && !r.out) {
    return { ok: false, data: null, reason: `exit=${r.code} ${r.error}` };
  }
  try {
    const start = r.out.indexOf('{');
    const end = r.out.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('no JSON object found in dump-stats output');
    const parsed = JSON.parse(r.out.slice(start, end + 1));
    return { ok: true, data: parsed, reason: '' };
  } catch (e) {
    return { ok: false, data: null, reason: `parse error: ${e}` };
  }
}

// ---- 5. 字段映射：stats → metrics.json ---------------------------------
function pickNum(obj, keyPath) {
  try {
    let cur = obj;
    for (const k of keyPath) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[k];
    }
    return typeof cur === 'number' ? cur : null;
  } catch {
    return null;
  }
}

/**
 * 按 metrics-contract.md §2 字段字典的严格顺序组装 metrics.json。
 * 所有已采集字段从 statsAfter 取；未采集的 TBD 字段一律写 null。
 * 返回 { metrics, mappingErrors }。
 */
function buildMetrics({ runId, commit, durationSec, statsAfter }) {
  const mappingErrors = [];
  const s = statsAfter || {};

  const get = (fieldName, keyPath) => {
    const v = pickNum(s, keyPath);
    if (v === null) mappingErrors.push(`${fieldName} <- ${keyPath.join('.')}`);
    return v;
  };

  // 严格按合同 §2 表格顺序（$* 分类元数据字段放最前，供 contract-audit.mjs 识别为 instance）
  const metrics = {
    $kind: 'instance',
    $conforms_to: 'docs/current/metrics-contract.md',
    $generated_by: 'scripts/eval.mjs',
    $generated_at: new Date().toISOString(),
    run_id: runId,
    commit: commit,
    phase: PHASE,
    dataset: DATASET,
    n_instances: N_INSTANCES,
    solve_rate: null, // Phase 1 无 SWE-bench harness
    duration_sec: durationSec,

    // dualStats.regulationsByStatus.*
    regulations_candidate: get('regulations_candidate', ['dualStats', 'regulationsByStatus', 'candidate']),
    regulations_hypothesis: get('regulations_hypothesis', ['dualStats', 'regulationsByStatus', 'hypothesis']),
    regulations_confirmed: get('regulations_confirmed', ['dualStats', 'regulationsByStatus', 'confirmed']),
    regulations_retired: get('regulations_retired', ['dualStats', 'regulationsByStatus', 'retired']),

    // dualStats.eventsByStatus.*
    events_open: get('events_open', ['dualStats', 'eventsByStatus', 'open']),
    events_clustered: get('events_clustered', ['dualStats', 'eventsByStatus', 'clustered']),
    events_resolved: get('events_resolved', ['dualStats', 'eventsByStatus', 'resolved']),
    events_archived: get('events_archived', ['dualStats', 'eventsByStatus', 'archived']),

    // pipelineStats.hypotheses.*
    hypotheses_open: get('hypotheses_open', ['pipelineStats', 'hypotheses', 'open']),
    hypotheses_ready_for_compile: get('hypotheses_ready_for_compile', ['pipelineStats', 'hypotheses', 'readyForCompile']),

    // pipelineStats.evidence.*
    evidence_supports: get('evidence_supports', ['pipelineStats', 'evidence', 'supports']),
    evidence_contradicts: get('evidence_contradicts', ['pipelineStats', 'evidence', 'contradicts']),

    // pipelineStats.graph.*
    atom_count: get('atom_count', ['pipelineStats', 'graph', 'atomCount']),
    ref_count: get('ref_count', ['pipelineStats', 'graph', 'refCount']),
    shortcut_count: get('shortcut_count', ['pipelineStats', 'graph', 'shortcutCount']),

    // pipelineStats.stories.*
    stories_total: get('stories_total', ['pipelineStats', 'stories', 'total']),
    stories_resolved: get('stories_resolved', ['pipelineStats', 'stories', 'resolved']),
    stories_uncompiled: get('stories_uncompiled', ['pipelineStats', 'stories', 'uncompiled']),

    // TBD 字段（Phase 1 占位 null，严格保留 key 位置）
    mean_tree_depth: null, // TBD (Phase 1) — BestQA prompt formatter 未实现
    context_chars_p50: null, // TBD (Phase 1)
    context_chars_p95: null, // TBD (Phase 1)
    kb_nodes_total: null, // TBD (Phase 2) — knowledge-ingest.ts 未实现
    kb_compile_duration_sec: null, // TBD (Phase 2)
    hit_rate_by_layer: null, // TBD (Phase 3)
    memory_hit_rate: null, // TBD (Phase 3)
    lesson_count: null, // TBD (Phase 3)
    review_queue_length: null, // TBD (Phase 4)
  };

  return { metrics, mappingErrors };
}

// ---- 6. summary.md 拼装 ------------------------------------------------
function deltaLine(label, before, after) {
  const b = pickNum(before || {}, []) === null ? before : before;
  // 更简单：外部传路径
  return { label, b, a: after };
}

function buildSummary({ runId, commit, metrics, statsBefore, statsAfter, vr, failedSteps }) {
  const regBefore = statsBefore?.dualStats?.regulationsByStatus ?? null;
  const regAfter = statsAfter?.dualStats?.regulationsByStatus ?? null;
  const evBefore = statsBefore?.dualStats?.eventsByStatus ?? null;
  const evAfter = statsAfter?.dualStats?.eventsByStatus ?? null;

  const fmtBucket = (name, before, after) => {
    if (!before && !after) return `- ${name}: (unavailable)`;
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const parts = [];
    for (const k of keys) {
      const b = before?.[k] ?? '-';
      const a = after?.[k] ?? '-';
      parts.push(`${k}: ${b}→${a}`);
    }
    return `- ${name}: ${parts.join(', ')}`;
  };

  const nonNull = Object.entries(metrics).filter(([, v]) => v !== null).length;
  const nullCount = Object.entries(metrics).filter(([, v]) => v === null).length;

  const lines = [
    `# Eval ${runId}`,
    '',
    `- commit: \`${commit}\``,
    `- phase: ${metrics.phase}`,
    `- dataset: ${metrics.dataset}`,
    `- n_instances: ${metrics.n_instances}`,
    `- duration_sec: ${metrics.duration_sec}`,
    '',
    '## Conclusion',
    '',
    failedSteps.length === 0
      ? `Run completed. ${nonNull} fields captured, ${nullCount} fields null (TBD or Phase-gated).`
      : `Partial run: ${failedSteps.length} step(s) failed. ${nonNull} fields captured, ${nullCount} fields null.`,
    '',
    '## Key deltas (dualStats)',
    '',
    fmtBucket('regulationsByStatus', regBefore, regAfter),
    fmtBucket('eventsByStatus', evBefore, evAfter),
    '',
    '## Verification',
    '',
    `- build: ${vr.build}`,
    `- test_basic: ${vr.test_basic}`,
    `- stats_before: ${vr.stats_before}`,
    `- stats_after: ${vr.stats_after}`,
    `- field_mapping_errors: ${vr.field_mapping_errors.length}`,
    '',
    '## Failed steps',
    '',
    failedSteps.length === 0 ? '- (none)' : failedSteps.map((s) => `- ${s}`).join('\n'),
    '',
    '## Files',
    '',
    '- `metrics.json` — 机器可读度量（字段见 metrics-contract.md §2）',
    '- `verification_report.json` — 各步骤状态 + 字段映射错误',
    '- `stats_before.json` — 运行前 causal-learner 四类 stats 快照',
    '- `stats_after.json` — 运行后快照',
    '- `run.log` — 完整 stdout/stderr',
    '- `summary.md` — 本文件',
    '- `reconstructions/` — AcceptedReconstruction JSON（reconstruction-contract.md §5）',
    '- `derivation_traces/` — DerivationTrace JSON（derivation-chain-contract.md §5）',
    '- `ontology_deltas/` — OntologyDelta / NoUpdateReason JSON（ontology-delta-contract.md §6）',
    '',
  ];
  return lines.join('\n');
}

// ---- 7. main -----------------------------------------------------------
(async () => {
  const startedAt = Date.now();
  const vr = {
    build: 'skipped',
    test_basic: 'skipped',
    stats_before: 'skipped',
    stats_after: 'skipped',
    field_mapping_errors: [],
  };
  const failedSteps = [];

  // 7.1 创建 out-dir / run_id 目录
  await mkdir(OUT_DIR, { recursive: true });
  const runId = await nextRunId(OUT_DIR);
  const runDir = path.join(OUT_DIR, runId);
  await mkdir(runDir, { recursive: true });

  // 7.1.1 v7 Derivation Space 三类 artifact 子目录（满足合约落盘路径门控条件）
  //   reconstructions/  ← reconstruction-contract.md §5
  //   derivation_traces/ ← derivation-chain-contract.md §5
  //   ontology_deltas/  ← ontology-delta-contract.md §6
  const reconstructionsDir  = path.join(runDir, 'reconstructions');
  const derivationTracesDir = path.join(runDir, 'derivation_traces');
  const ontologyDeltasDir   = path.join(runDir, 'ontology_deltas');
  await Promise.all([
    mkdir(reconstructionsDir,  { recursive: true }),
    mkdir(derivationTracesDir, { recursive: true }),
    mkdir(ontologyDeltasDir,   { recursive: true }),
  ]);

  logLine(`run_id=${runId} runDir=${runDir}`);
  logLine(`dataset=${DATASET} n_instances=${N_INSTANCES} phase=${PHASE}`);

  // 7.2 git commit
  const gitRes = run('git', ['rev-parse', '--short', 'HEAD']);
  const commit = (gitRes.out || '').trim() || 'unknown';
  logLine(`commit=${commit}`);

  // 7.3 build（dump-stats 会自动按需 build，但显式跑一次可以填充 vr.build）
  logLine('[build] npm run build (causal-learner/mcp-server)');
  const buildRes = run('npm', ['run', 'build'], MCP_DIR);
  logBuf.push(`\n===== npm run build (code=${buildRes.code}) =====`);
  if (buildRes.out) logBuf.push(buildRes.out);
  if (buildRes.err) logBuf.push('STDERR: ' + buildRes.err);
  vr.build = buildRes.code === 0 ? 'ok' : 'fail';
  if (buildRes.code !== 0) failedSteps.push('build');

  // 7.4 stats_before
  const before = snapshotStats('before');
  vr.stats_before = before.ok ? 'ok' : 'fail';
  if (!before.ok) failedSteps.push(`stats_before: ${before.reason}`);
  await writeFile(
    path.join(runDir, 'stats_before.json'),
    JSON.stringify(
      before.ok
        ? before.data
        : {
            $kind: 'instance',
            $conforms_to: 'docs/current/stats-snapshot-contract.md',
            $generated_by: 'causal-learner/mcp-server/scripts/dump-stats.mjs',
            $generated_at: new Date().toISOString(),
            error: before.reason,
            captured_at: new Date().toISOString(),
          },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  // 7.5 core workload：Phase 1 占位 = test-basic.mjs
  logLine('[workload] node tests/test-basic.mjs (Phase 1 placeholder)');
  const testRes = run('node', [path.join('tests', 'test-basic.mjs')], MCP_DIR);
  logBuf.push(`\n===== node tests/test-basic.mjs (code=${testRes.code}) =====`);
  if (testRes.out) logBuf.push(testRes.out);
  if (testRes.err) logBuf.push('STDERR: ' + testRes.err);
  vr.test_basic = testRes.code === 0 ? 'ok' : 'fail';
  if (testRes.code !== 0) failedSteps.push('test_basic');

  // 7.6 stats_after
  const after = snapshotStats('after');
  vr.stats_after = after.ok ? 'ok' : 'fail';
  if (!after.ok) failedSteps.push(`stats_after: ${after.reason}`);
  await writeFile(
    path.join(runDir, 'stats_after.json'),
    JSON.stringify(
      after.ok
        ? after.data
        : {
            $kind: 'instance',
            $conforms_to: 'docs/current/stats-snapshot-contract.md',
            $generated_by: 'causal-learner/mcp-server/scripts/dump-stats.mjs',
            $generated_at: new Date().toISOString(),
            error: after.reason,
            captured_at: new Date().toISOString(),
          },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  // 7.7 duration
  const durationSec = Number(((Date.now() - startedAt) / 1000).toFixed(3));

  // 7.8 metrics.json
  const { metrics, mappingErrors } = buildMetrics({
    runId,
    commit,
    durationSec,
    statsAfter: after.ok ? after.data : null,
  });
  vr.field_mapping_errors = mappingErrors;
  await writeFile(path.join(runDir, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n', 'utf8');

  // 7.9 verification_report.json
  const vrOut = { $kind: 'instance', $conforms_to: 'docs/current/artifact-contract.md', $generated_by: 'scripts/eval.mjs', $generated_at: new Date().toISOString(), ...vr };
  await writeFile(path.join(runDir, 'verification_report.json'), JSON.stringify(vrOut, null, 2) + '\n', 'utf8');

  // 7.10 run.log
  await writeFile(path.join(runDir, 'run.log'), logBuf.join('\n') + '\n', 'utf8');

  // 7.11 summary.md
  const summary = buildSummary({
    runId,
    commit,
    metrics,
    statsBefore: before.ok ? before.data : null,
    statsAfter: after.ok ? after.data : null,
    vr,
    failedSteps,
  });
  // 2026-04-13 taxonomy review 修复：summary.md 的内容 schema 归 run-summary-contract.md，
  // 而非 artifact-contract.md（后者仅定义目录布局）。
  const summaryFm = `---\nkind: instance\nconforms_to: docs/current/run-summary-contract.md\ngenerated_by: scripts/eval.mjs\ngenerated_at: ${new Date().toISOString().slice(0, 10)}\n---\n\n`;
  await writeFile(path.join(runDir, 'summary.md'), summaryFm + summary, 'utf8');

  // 7.12 控制台小结
  const nonNull = Object.entries(metrics).filter(([, v]) => v !== null).length;
  const nullCnt = Object.entries(metrics).filter(([, v]) => v === null).length;
  console.log('');
  console.log(`Eval done: ${runDir}`);
  console.log(`  fields: ${nonNull} non-null / ${nullCnt} null`);
  console.log(`  failed steps: ${failedSteps.length}`);
  process.exit(failedSteps.length === 0 ? 0 : 0); // 失败也 0 退出：失败语义靠 verification_report 体现
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
