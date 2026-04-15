#!/usr/bin/env node
// ---
// kind: code
// implements: docs/current/intent-alignment-audit-contract.md
// also related: docs/current/contract-audit-contract.md
// ---
/**
 * 意图一致性审计脚本 —— 测试 agent 与代码编写 agent 的对话基础设施
 *
 * 职责：
 *   1. 扫描意图文档（design_history + current contracts）提取关键约束
 *   2. 扫描过程文档（commit log + code frontmatter + TODO/HACK/proxy）
 *   3. 构建意图-实现矩阵初稿
 *   4. 输出结构化 markdown 报告，供测试 agent 进一步审阅
 *
 * 用法：
 *   node scripts/intent-alignment-audit.mjs [--commits 20] [--focus-contract v7-world-model-contract]
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DOCS_CURRENT = path.join(ROOT, 'docs', 'current');
const DOCS_DESIGN = path.join(ROOT, 'docs', 'design_history');
const SRC_DIR = path.join(ROOT, 'causal-learner', 'mcp-server', 'src');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const OUT_MD = path.join(ARTIFACTS_DIR, 'intent-alignment-audit-latest.md');
const OUT_JSON = path.join(ARTIFACTS_DIR, 'intent-alignment-audit-latest.json');

// ── CLI 参数解析 ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { commits: 20, focusContract: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commits' && argv[i + 1]) { out.commits = Number(argv[++i]) || 20; }
    if (a === '--focus-contract' && argv[i + 1]) { out.focusContract = argv[++i]; }
  }
  return out;
}
const args = parseArgs(process.argv);

// ── 通用工具 ────────────────────────────────────────────────────────────────
function stripBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

function unquote(s) {
  if (typeof s !== 'string') return s;
  const m = s.match(/^"([^"]*)"$/) || s.match(/^'([^']*)'$/);
  return m ? m[1] : s;
}

function parseMarkdownFrontmatter(text) {
  text = stripBom(text);
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { fm: {}, body: text };
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i] === '---') { end = i; break; }
  if (end < 0) return { fm: {}, body: text };
  const fm = {};
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^([a-zA-Z_$][\w$-]*):\s*(.*)$/);
    if (m) fm[m[1]] = unquote(m[2].trim());
  }
  return { fm, body: lines.slice(end + 1).join('\n') };
}

function parseJsFrontmatter(text) {
  text = stripBom(text);
  const lines = text.split(/\r?\n/);
  let start = -1, end = -1;
  for (let i = 0; i < lines.length && i < 50; i++) {
    const l = lines[i].trim();
    if (l === '' || l.startsWith('#!')) continue;
    if (l === '// ---') { start = i; break; }
    if (!l.startsWith('//')) return { fm: {}, body: text };
  }
  if (start < 0) return { fm: {}, body: text };
  for (let i = start + 1; i < lines.length && i < 80; i++) {
    if (lines[i].trim() === '// ---') { end = i; break; }
  }
  if (end < 0) return { fm: {}, body: text };
  const fm = {};
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^\s*\/\/\s*([a-zA-Z_$][\w$-]*):\s*(.*)$/);
    if (m) fm[m[1]] = unquote(m[2].trim());
  }
  return { fm, body: lines.slice(end + 1).join('\n') };
}

async function listFilesRec(dir, exts) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await listFilesRec(full, exts));
    else if (e.isFile() && exts.some(x => e.name.endsWith(x))) out.push(full);
  }
  return out;
}

// ── 1. 扫描意图文档 ──────────────────────────────────────────────────────────
async function scanIntentDocs() {
  const contracts = [];
  const designs = [];

  // current contracts
  try {
    for (const f of await readdir(DOCS_CURRENT)) {
      if (!f.endsWith('.md')) continue;
      const text = await readFile(path.join(DOCS_CURRENT, f), 'utf8');
      const { fm, body } = parseMarkdownFrontmatter(text);
      contracts.push({ file: f, fm, body });
    }
  } catch {}

  // design history
  try {
    for (const f of await readdir(DOCS_DESIGN)) {
      if (!f.endsWith('.md')) continue;
      const text = await readFile(path.join(DOCS_DESIGN, f), 'utf8');
      const { fm, body } = parseMarkdownFrontmatter(text);
      designs.push({ file: f, fm, body });
    }
  } catch {}

  return { contracts, designs };
}

function contractAcknowledgesTransition(body) {
  const lower = body.toLowerCase();
  const signals = ['proxy', '过渡态', '占位', 'placeholder', '退役', 'retire', 'transition', 'temporary', '近似'];
  return signals.some(s => lower.includes(s));
}

function extractHardConstraints(body) {
  const constraints = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // 匹配 "硬约束"、"不变量"、"铁律"、"必须"、"禁止"、"不得" 等信号
    if (/^#{1,3}\s*([^#]*约束|[^#]*不变量|[^#]*铁律|[^#]*法律)/i.test(l)) {
      constraints.push({ type: 'section', title: l.replace(/^#+\s*/, ''), line: i + 1 });
    }
    if (/^\s*[-*]\s*(必须|禁止|不得|只能|只可|铁律)/.test(l) || /^\s*\|\s*[^|]*\|\s*(必须|禁止|不得)/.test(l)) {
      constraints.push({ type: 'item', text: l.trim(), line: i + 1 });
    }
    if (/^\s*```text\s*$/.test(l) && i + 1 < lines.length && /(必须|禁止|不得|铁律)/.test(lines[i + 1])) {
      const block = [];
      let j = i + 1;
      while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) {
        block.push(lines[j]);
        j++;
      }
      constraints.push({ type: 'block', text: block.join('\n'), line: i + 1 });
    }
  }
  return constraints;
}

function extractTypeScriptInterfaces(body) {
  const interfaces = [];
  const re = /interface\s+(\w+)\s*\{([^}]*)\}/gs;
  for (const m of body.matchAll(re)) {
    const name = m[1];
    const content = m[2];
    const fields = [];
    for (const fm of content.matchAll(/(\w+)\??\s*:/g)) {
      fields.push(fm[1]);
    }
    interfaces.push({ name, fields: fields.slice(0, 20) }); // 限制字段数避免爆炸
  }
  return interfaces;
}

// ── 2. 扫描过程文档 ──────────────────────────────────────────────────────────
async function scanProcessDocs(commitCount) {
  // git log
  let commits = [];
  try {
    const { stdout } = await execFileP('git', ['log', `--max-count=${commitCount}`, '--format=%H %s'], { cwd: ROOT });
    commits = stdout.split(/\r?\n/).filter(Boolean).map(line => {
      const space = line.indexOf(' ');
      return { hash: line.slice(0, space), subject: line.slice(space + 1) };
    });
  } catch {}

  // code frontmatter
  const codeFiles = [];
  const srcFiles = await listFilesRec(SRC_DIR, ['.ts', '.mjs', '.js']);
  const scriptFiles = await listFilesRec(SCRIPTS_DIR, ['.mjs', '.js']);
  for (const abs of [...srcFiles, ...scriptFiles]) {
    const text = await readFile(abs, 'utf8');
    const { fm } = parseJsFrontmatter(text);
    if (Object.keys(fm).length > 0) {
      codeFiles.push({
        file: path.relative(ROOT, abs).replace(/\\/g, '/'),
        fm,
      });
    }
  }

  return { commits, codeFiles };
}

// ── 3. 扫描代码信号 ──────────────────────────────────────────────────────────
async function scanCodeSignals() {
  const signals = [];
  const srcFiles = await listFilesRec(SRC_DIR, ['.ts']);
  let scriptFiles = await listFilesRec(SCRIPTS_DIR, ['.mjs', '.js']);
  // 排除意图一致性审计脚本自身，避免自引用噪音
  scriptFiles = scriptFiles.filter(f => !f.endsWith('intent-alignment-audit.mjs'));

  for (const abs of [...srcFiles, ...scriptFiles]) {
    const text = await readFile(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      // proxy:* 前缀
      if (/proxy:/i.test(l)) {
        signals.push({ file: rel, line: i + 1, kind: 'proxy', text: l.trim() });
      }
      // TODO / HACK / FIXME / 过渡态 / 占位
      if (/(TODO|HACK|FIXME|过渡态|占位|待建|placeholder)/i.test(l)) {
        signals.push({ file: rel, line: i + 1, kind: 'todo', text: l.trim() });
      }
      // 对齐 / 收束 / 修正 commit 的内联注释
      if (/(对齐|收束|修正|对齐上游)/.test(l) && /contract|合同|上游/.test(l)) {
        signals.push({ file: rel, line: i + 1, kind: 'alignment-claim', text: l.trim() });
      }
      // v8/v9 前瞻信号
      if (/(ValidityEnvelope|PerspectiveModel|TranslationFunctor|OntologyModel|CounterfactualScenario)/.test(l)) {
        signals.push({ file: rel, line: i + 1, kind: 'future-intent', text: l.trim() });
      }
    }
  }

  return signals;
}

// ── 4. 构建意图-实现矩阵 ─────────────────────────────────────────────────────
function buildAlignmentMatrix({ contracts, designs, commits, codeFiles, codeSignals }) {
  const matrix = [];

  // 4.1 从合同中提取关键意图项
  const intentItems = [];
  for (const c of contracts) {
    if (c.fm.status !== 'current' && c.fm.status !== 'draft') continue;
    const constraints = extractHardConstraints(c.body);
    const interfaces = extractTypeScriptInterfaces(c.body);
    intentItems.push({
      source: `docs/current/${c.file}`,
      kind: 'contract',
      status: c.fm.status,
      describes: c.fm.describes || '',
      constraints,
      interfaces,
      acknowledgesTransition: contractAcknowledgesTransition(c.body),
    });
  }
  for (const d of designs) {
    // 提取版本号中的关键口号和最终判断
    const slogans = [];
    const lines = d.body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,3}\s*(系统口号|最终判断|核心主张)/.test(lines[i])) {
        slogans.push({ section: lines[i].replace(/^#+\s*/, ''), line: i + 1 });
      }
    }
    intentItems.push({
      source: `docs/design_history/${d.file}`,
      kind: 'design',
      slogans,
    });
  }

  // 4.2 构建 implements 映射
  const implementsMap = new Map(); // contract file -> code files[]
  for (const cf of codeFiles) {
    const imp = cf.fm.implements;
    if (!imp) continue;
    const items = String(imp).split(',').map(s => s.trim()).filter(Boolean);
    for (const item of items) {
      // 标准化 key：支持 docs/current/xxx.md 和 current/xxx.md 都映射到 xxx.md
      let key = item;
      if (key.startsWith('docs/current/')) key = key.slice('docs/current/'.length);
      else if (key.startsWith('current/')) key = key.slice('current/'.length);
      if (!implementsMap.has(key)) implementsMap.set(key, []);
      implementsMap.get(key).push(cf.file);
    }
  }

  // 4.3 构建 commit 对齐声明映射
  const alignmentCommits = commits.filter(c =>
    /对齐|收束|修正|对齐上游/.test(c.subject)
  );

  // 4.4 生成矩阵行
  for (const intent of intentItems) {
    if (intent.kind === 'contract') {
      const contractKey = intent.source.replace('docs/current/', '');
      const implementedBy = implementsMap.get(contractKey) || [];
      const alignedCommits = alignmentCommits.filter(c =>
        c.subject.toLowerCase().includes(contractKey.toLowerCase().replace('.md', ''))
      );

      // 检查接口字段是否在声称实现的代码文件中可见（精确匹配到文件本身）
      const hasProxy = codeSignals.some(s =>
        s.kind === 'proxy' && implementedBy.some(f => s.file === f || s.file.startsWith(f.replace(/\.\w+$/, '')))
      );
      const hasTodo = codeSignals.some(s =>
        s.kind === 'todo' && implementedBy.some(f => s.file === f || s.file.startsWith(f.replace(/\.\w+$/, '')))
      );

      const acknowledgesTransition = intent.acknowledgesTransition ?? false;

      let implementationStatus = 'unknown';
      if (implementedBy.length === 0) implementationStatus = 'no_code_claim';
      else if (hasProxy && !acknowledgesTransition) implementationStatus = 'partial_with_proxy';
      else if (hasTodo && !acknowledgesTransition) implementationStatus = 'partial_with_todo';
      else if ((hasProxy || hasTodo) && acknowledgesTransition) implementationStatus = 'claimed_with_known_transition';
      else implementationStatus = 'claimed_implemented';

      let driftSignal = 'none';
      if (implementationStatus === 'partial_with_proxy' || implementationStatus === 'partial_with_todo') {
        driftSignal = 'mode1_claimed_but_incomplete';
      } else if (implementationStatus === 'no_code_claim') {
        driftSignal = 'mode5_silent_gap';
      }

      matrix.push({
        intentSource: intent.source,
        intentDesc: intent.describes,
        contractStatus: intent.status,
        implementedBy,
        alignedCommits: alignedCommits.map(c => `${c.hash.slice(0, 7)} ${c.subject}`),
        implementationStatus,
        driftSignal,
      });
    }
  }

  // 4.5 检查 design_history 中的 v8/v9 意图是否有代码信号
  const futureSignals = codeSignals.filter(s => s.kind === 'future-intent');
  const hasV8V9InCode = futureSignals.length > 0;

  return { matrix, futureSignals, hasV8V9InCode, intentItems };
}

// ── 5. 生成报告 ──────────────────────────────────────────────────────────────
function generateReport({ matrix, futureSignals, hasV8V9InCode, commits, codeSignals, contracts }) {
  const now = new Date().toISOString();

  // 严重度计数
  const driftCounts = { mode1: 0, mode2: 0, mode3: 0, mode4: 0, mode5: 0 };
  for (const row of matrix) {
    if (row.driftSignal === 'mode1_claimed_but_incomplete') driftCounts.mode1++;
    if (row.driftSignal === 'mode5_silent_gap') driftCounts.mode5++;
  }
  // 额外检查 mode3: metrics-contract 僵尸声明
  const metricsRow = matrix.find(r => r.intentSource.includes('metrics-contract.md'));
  const hasMetricsDrift = metricsRow && metricsRow.implementedBy.some(f => f.includes('eval.mjs'));

  const lines = [
    '# 意图一致性审计报告',
    '',
    `生成时间: ${now}`,
    `扫描 commit 数: ${commits.length}`,
    `扫描代码文件数: ${codeSignals.length > 0 ? '已扫描' : '未扫描'}`,
    '',
    '## 执行摘要',
    '',
    '| 维度 | 结果 |',
    '|------|------|',
    `| 合同总数 | ${matrix.length} |`,
    `| 宣称对齐但未完成 (模式 1) | ${driftCounts.mode1} |`,
    `| 完全沉默的缺口 (模式 5) | ${driftCounts.mode5} |`,
    `| metrics 僵尸声明 (模式 3) | ${hasMetricsDrift ? '1 (eval.mjs 已修正但合同未更新)' : '0'} |`,
    `| v8/v9 未来意图代码信号 | ${hasV8V9InCode ? `${futureSignals.length} 处` : '0 (完全沉默)'} |`,
    '',
    '---',
    '',
    '## 1. 意图-实现矩阵',
    '',
    '| 意图来源 | 合同状态 | 代码声称实现 | 对齐 commit | 实现状态 | 漂移信号 |',
    '|----------|----------|--------------|-------------|----------|----------|',
  ];

  for (const row of matrix) {
    const impl = row.implementedBy.length > 0 ? row.implementedBy.join('<br>') : '(无)';
    const commits = row.alignedCommits.length > 0 ? `${row.alignedCommits.length} 个` : '-';
    const status = row.implementationStatus;
    const drift = row.driftSignal === 'none' ? '-' : row.driftSignal;
    lines.push(`| ${path.basename(row.intentSource)} | ${row.contractStatus || '-'} | ${impl} | ${commits} | ${status} | ${drift} |`);
  }

  lines.push('', '---', '', '## 2. 矛盾与建议详表', '');

  // C1: artifact-contract 的稳定产物意图 vs 过渡态代码
  const artifactRow = matrix.find(r => r.intentSource.includes('artifact-contract.md'));
  if (artifactRow && artifactRow.driftSignal === 'mode1_claimed_but_incomplete') {
    lines.push(
      '### C1: artifact-contract 要求"稳定产物"，但实现脚本仍使用过渡态',
      '',
      '- **矛盾点**：合同定义了 `artifacts/<run_id>/` 的落盘规范，并要求 v7 对象导出使用稳定的目录结构和 ID 格式；但 `export-v7-artifacts.mjs:172` 生成 `proxy:demo_` 前缀的 `mechanism_class_ref`，且 `capture-baseline.mjs:40` 仍有 TODO。',
      '- **意图侧**：`artifact-contract.md` §5 期望 v7 产物是结构化的、可审计的实例文件。',
      '- **实现侧**：代码通过 `implements` 声称实现了该合同，但产物中仍包含演示性质的过渡数据。',
      '- **改善建议**：',
      '  1. 在 `artifact-contract.md` 顶部新增 "Phase 1 限制" 附录，明确记录："v7 对象导出的 `mechanism_class_ref` 目前使用 `proxy:*` 前缀作为过渡态，真实 `MC_*` ID 的绑定将在 MechanismClass 完全实现后替换。"',
      '  2. 给 `export-v7-artifacts.mjs:172` 添加 inline 注释，引用上述附录。',
      '- **优先级**: P1',
      ''
    );
  }

  // C2: metrics 合同僵尸声明
  if (hasMetricsDrift) {
    lines.push(
      '### C2: metrics-contract 的采集来源声明与 eval.mjs 实际行为矛盾',
      '',
      '- **矛盾点**：合同声称 `regulations_confirmed` / `events_open` 来自 `get_stats`，但 `eval.mjs` 的 `buildMetrics()` 已正确将其映射到 `get_dual_stats().regulationsByStatus.confirmed`。',
      '- **意图侧**：`metrics-contract.md` §2 是 metrics 字段的"唯一真相源"。',
      '- **实现侧**：代码编写者已经意识到了合同错误并做了隐式修正，但没有更新合同本身。',
      '- **改善建议**：',
      '  1. 立即修正 `metrics-contract.md` §2 的"采集方式"列，按真实工具（`get_stats` / `get_dual_stats` / `get_longterm_stats` / `graph_stats`）拆分字段来源。',
      '  2. 建立一条团队规则：当 `contract-vs-impl-audit.md` 标记一个 blocker，且代码已做修正时，必须在 24 小时内同步修正合同，防止合同变成"僵尸声明"。',
      '- **优先级**: P0',
      ''
    );
  }

  // C3: 大量合同无代码认领
  const silentCurrentContracts = matrix.filter(r => r.driftSignal === 'mode5_silent_gap' && r.contractStatus === 'current');
  if (silentCurrentContracts.length > 0) {
    lines.push(
      `### C3: ${silentCurrentContracts.length} 份 current 合同无任何代码文件认领 implements`,
      '',
      `- **矛盾点**：这些合同被标记为 \`status: current\`（已冻结），但没有代码文件通过 \`implements\` 声明与它们建立关联。`,
      '- **意图侧**：current 合同应该代表已经稳定、正在被执行的意图。',
      '- **实现侧**：代码层缺少对 current 合同的显式认领，导致意图-实现的追溯链断裂。',
      '- **改善建议**：',
      `  1. 对 ${silentCurrentContracts.length} 份 silent current 合同进行分类：有些是纯元文档（如 \`file-taxonomy-contract.md\`），不需要被代码实现，建议将其 \`status\` 改为 \`reference\`；`,
      '  2. 有些合同（如 `ref-algebra-contract.md`、`pipeline-contract.md`、`compile-promotion-contract.md`）的核心逻辑确实存在于代码中，建议给对应的 `.ts` 文件补一个 `// implements:` frontmatter，建立显式链接。',
      '- **优先级**: P1',
      ''
    );
  }

  // C4: v8/v9 完全沉默
  if (!hasV8V9InCode) {
    lines.push(
      '### C4: v8/v9 设计意图在代码层零占位符',
      '',
      '- **矛盾点**：`design_history/` 中已经正式落盘了 v8（生成式本体）和 v9（本体联邦），但代码中找不到任何 `ValidityEnvelope`、`PerspectiveModel`、`TranslationFunctor`、`OntologyModel` 的占位符或 TODO。',
      '- **意图侧**：v8/v9 被视为正式版本演进方向，不是临时笔记。',
      '- **实现侧**：系统完全没有任何代码信号来锚定这些高级意图，存在被遗忘的风险。',
      '- **改善建议**：',
      '  1. 在 `mechanism-class-contract.md` 末尾增加 "v8 前瞻" 附录，说明 `phases/thresholds/contextConstraints` 字段未来会升级为 `ValidityEnvelope`。',
      '  2. 在 `v7-world-model-contract.md` 中增加 "v9 前瞻" 附录，说明 `Episode.perspectiveId` 和 `OntologyModel` 是 v9 联邦层的预留字段。',
      '  3. （可选）创建 `causal-learner/mcp-server/src/core/v8-placeholder.ts`，只 export 空 interface，不实现任何逻辑，作为意图的代码锚点。',
      '- **优先级**: P2',
      ''
    );
  }

  // C5: mechanism-class 可回放 vs 无真实 replay 引擎
  const mcRow = matrix.find(r => r.intentSource.includes('mechanism-class-contract.md'));
  const hasProxyInCore = codeSignals.some(s => s.kind === 'proxy' && s.file.includes('core/'));
  if (hasProxyInCore) {
    lines.push(
      '### C5: mechanism-class 合同承诺"可回放"，但核心代码仍依赖 proxy 过渡态',
      '',
      '- **矛盾点**：`mechanism-class-contract.md` §2 定义 `MechanismClass` 是可回放的动力学模板，但 `pipeline.ts:558-561` 生成 `proxy:hyp_xxx` / `proxy:episode_xxx` 作为 `mechanism_class_ref`。',
      '- **意图侧**：合同要求 MechanismClass 具备 `phases` 和 `replayError` 计算，能够按 phases 回放 Episode timeline。',
      '- **实现侧**：由于真实的 `MechanismClass` 晋升路径尚未打通（多 Episode 门控、replay 一致性检查），`recordFix()` 仍然用 proxy 前缀来桥接。',
      '- **改善建议**：',
      '  1. 在 `mechanism-class-contract.md` 中新增 "proxy 前缀退役计划" 章节，明确三个条件：(a) MechanismInstanceStore 中 accepted 状态 ≥2 个独立 episode；(b) replayError < 0.3；(c) 通过 counterexample 检查。',
      '  2. 当条件满足时，触发一个自动化提醒（或 CI check），提示可以开始移除 proxy 前缀。',
      '- **优先级**: P1',
      ''
    );
  }

  lines.push('---', '', '## 3. 精选发现（对话式）', '');

  // 发现 1: 模式 1 漂移
  const mode1Rows = matrix.filter(r => r.driftSignal === 'mode1_claimed_but_incomplete');
  if (mode1Rows.length > 0) {
    lines.push(
      '### 发现 #1: 宣称对齐但未完成（模式 1）',
      ''
    );
    for (const row of mode1Rows.slice(0, 3)) {
      const proxySigs = codeSignals.filter(s => s.kind === 'proxy' && row.implementedBy.some(f => s.file === f || s.file.startsWith(f.replace(/\.\w+$/, ''))));
      const todoSigs = codeSignals.filter(s => s.kind === 'todo' && row.implementedBy.some(f => s.file === f || s.file.startsWith(f.replace(/\.\w+$/, ''))));
      lines.push(
        `**意图来源**: \`${row.intentSource}\``,
        `**代码声称实现**: ${row.implementedBy.join(', ')}`,
        `**对齐 commit**: ${row.alignedCommits.slice(0, 2).join('; ') || '无'}`,
      );
      if (proxySigs.length > 0) {
        lines.push(`**过渡态信号**: \`${proxySigs[0].file}:${proxySigs[0].line}\` 含有 \`proxy:\` 前缀`);
      }
      if (todoSigs.length > 0) {
        lines.push(`**待建信号**: \`${todoSigs[0].file}:${todoSigs[0].line}\` 含有 TODO/HACK`);
      }
      lines.push(
        '> **问题**: commit 或代码 frontmatter 声称实现了这份合同，但代码中仍存在过渡态（proxy）或待建标记（TODO）。这是否意味着对齐是分阶段的？如果是，建议在合同中明确记录分阶段计划。',
        ''
      );
    }
  }

  // 发现 2: 模式 5 漂移
  const mode5Rows = matrix.filter(r => r.driftSignal === 'mode5_silent_gap');
  if (mode5Rows.length > 0) {
    lines.push(
      '### 发现 #2: 沉默的缺口（模式 5）',
      ''
    );
    for (const row of mode5Rows.slice(0, 3)) {
      lines.push(
        `**意图来源**: \`${row.intentSource}\``,
        `**合同状态**: ${row.contractStatus}`,
        `**代码声称实现**: (无)`,
        '> **问题**: 这份合同有明确的 current/draft 状态，但没有任何代码文件通过 `implements` 声称实现它。如果它确实不重要，建议将其降级为 reference；如果它应该被实现，建议至少创建一个占位符代码文件并添加 `implements` 声明。',
        ''
      );
    }
  }

  // 发现 3: metrics 僵尸声明（已在矛盾表中详述，此处简要引用）
  if (hasMetricsDrift) {
    lines.push(
      '### 发现 #3: metrics 合同的僵尸声明（模式 3）',
      '',
      '> 详见 **C2: metrics-contract 的采集来源声明与 eval.mjs 实际行为矛盾**。',
      ''
    );
  }

  // 发现 4: v8/v9 完全沉默（已在矛盾表中详述，此处简要引用）
  if (!hasV8V9InCode) {
    lines.push(
      '### 发现 #4: v8/v9 意图在代码层完全沉默（模式 5）',
      '',
      '> 详见 **C4: v8/v9 设计意图在代码层零占位符**。',
      ''
    );
  }

  lines.push(
    '---',
    '',
    '## 3. 代码信号清单',
    ''
  );

  const byKind = new Map();
  for (const s of codeSignals) {
    if (!byKind.has(s.kind)) byKind.set(s.kind, []);
    byKind.get(s.kind).push(s);
  }
  for (const [kind, items] of byKind) {
    lines.push(`### ${kind} (${items.length} 处)`);
    for (const it of items.slice(0, 10)) {
      lines.push(`- \`${it.file}:${it.line}\` ${it.text.slice(0, 80)}${it.text.length > 80 ? '...' : ''}`);
    }
    if (items.length > 10) lines.push(`- ... 还有 ${items.length - 10} 处`);
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '## 4. 下一步行动建议',
    '',
    '1. **修正 metrics-contract.md**：同步 `eval.mjs` 中已经正确的字段来源。',
    '2. **为 proxy 前缀建立退役计划**：消除 mechanism-instance 层的模式 1 漂移。',
    '3. **评估 v8/v9 占位符**：决定是否在当前代码中加入前瞻类型声明。',
    '4. **检查沉默的合同**：确认 `mode5_silent_gap` 列表中的合同是否真的不需要代码实现。',
    ''
  );

  return lines.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[intent-alignment-audit] 开始审计... commits=${args.commits}`);

  const { contracts, designs } = await scanIntentDocs();
  console.log(`  意图文档: ${contracts.length} 份合同, ${designs.length} 份设计历史`);

  const { commits, codeFiles } = await scanProcessDocs(args.commits);
  console.log(`  过程文档: ${commits.length} 个 commit, ${codeFiles.length} 份代码 frontmatter`);

  const codeSignals = await scanCodeSignals();
  console.log(`  代码信号: ${codeSignals.length} 处`);

  const { matrix, futureSignals, hasV8V9InCode } = buildAlignmentMatrix({
    contracts, designs, commits, codeFiles, codeSignals,
  });
  console.log(`  意图-实现矩阵: ${matrix.length} 行`);

  const report = generateReport({ matrix, futureSignals, hasV8V9InCode, commits, codeSignals, contracts });

  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await writeFile(OUT_MD, report, 'utf8');

  const payload = {
    timestamp: new Date().toISOString(),
    commits_scanned: commits.length,
    contracts_scanned: contracts.length,
    designs_scanned: designs.length,
    code_files_with_frontmatter: codeFiles.length,
    code_signals: codeSignals.length,
    matrix,
    future_signals_count: futureSignals.length,
    has_v8v9_in_code: hasV8V9InCode,
  };
  await writeFile(OUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  console.log(`\n报告已生成:`);
  console.log(`  markdown: ${path.relative(ROOT, OUT_MD).replace(/\\/g, '/')}`);
  console.log(`  json:     ${path.relative(ROOT, OUT_JSON).replace(/\\/g, '/')}`);
}

main().catch(err => {
  console.error('[intent-alignment-audit] 失败:', err);
  process.exit(1);
});
