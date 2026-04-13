#!/usr/bin/env node
// 契约真值审计脚本 — 规格见 docs/current/contract-audit-contract.md（纯 ESM，无 npm 依赖）
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DOCS_DIR = path.join(ROOT, 'docs', 'current');
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const OUT_JSON = path.join(ARTIFACTS_DIR, 'contract-audit-latest.json');
const VALID_STATUS = new Set(['current', 'draft', 'mixed', 'reference']);
const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|md|json|ya?ml|py|sql)$/;
const BASENAME_FALLBACK_DIRS = [
  'causal-learner/mcp-server/src',
  'causal-learner/mcp-server/src/core',
  'causal-learner/mcp-server/src/tools',
  'scripts',
];

/** 解析 frontmatter：status / body / bodyStartLine。无 frontmatter 则 status=null. */
function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { status: null, body: text, bodyStartLine: 1 };
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i] === '---') { end = i; break; }
  if (end < 0) return { status: null, body: text, bodyStartLine: 1 };
  const fm = {};
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  const raw = fm.status || null;
  const status = raw ? raw.replace(/\s*\(.*\)\s*$/, '').trim() : null;
  return { status, body: lines.slice(end + 1).join('\n'), bodyStartLine: end + 2 };
}

/** 收集 <!-- audit-ignore: code[: target] --> 指令 */
function collectIgnores(text) {
  const ignores = new Set();
  for (const m of text.matchAll(/<!--\s*audit-ignore:\s*([\w-]+)(?::\s*([^>]+?))?\s*-->/g)) {
    const code = m[1].trim();
    const tgt = (m[2] || '').trim();
    ignores.add(tgt ? `${code}:${tgt}` : code);
  }
  return ignores;
}

/** mixed 合同：按章节标题关键字把每行映射为 'current' 或 'draft' */
function classifyMixedSegments(body) {
  const lines = body.split(/\r?\n/);
  const map = new Array(lines.length);
  let mode = 'current';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^##+\s/.test(l)) {
      const s = l.toLowerCase();
      if (/§\s*2b|目标|target|future|待建|计划/.test(s)) mode = 'draft';
      else if (/§\s*2a|现状|current|已实现/.test(s)) mode = 'current';
    }
    map[i] = mode;
  }
  return map;
}

/** 提取所有引用。跳过 fenced code block；md-link 时遮罩 inline-code 以避免误匹配。 */
function extractReferences(body, bodyStartLine) {
  const refs = [];
  const lines = body.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const masked = line.replace(/`[^`]*`/g, s => ' '.repeat(s.length));
    for (const m of masked.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
      let t = m[2].trim();
      if (/^https?:/i.test(t) || t.startsWith('#') || t.startsWith('mailto:')) continue;
      if (/[\s<>]/.test(t) || t === 'path' || t === '../relative/path') continue;
      const h = t.indexOf('#');
      if (h >= 0) t = t.slice(0, h);
      if (!t) continue;
      refs.push({ kind: 'path', target: t, line: bodyStartLine + i });
    }
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const plm = m[1].match(/^([^\s:]+\.(?:ts|tsx|js|mjs|cjs|md|json|ya?ml|py|sql)):(\d+)(?:[-–](\d+))?$/);
      if (plm) {
        refs.push({
          kind: 'pathline',
          target: plm[1],
          lineStart: +plm[2],
          lineEnd: plm[3] ? +plm[3] : +plm[2],
          line: bodyStartLine + i,
        });
      }
    }
  }
  return { refs, lines };
}

/** 提取反引号内的 `foo()` / `BarClass`，best-effort 用于 symbol-drift 检查 */
function extractSymbols(body, bodyStartLine) {
  const lines = body.split(/\r?\n/);
  const items = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const c = m[1];
      const fn = c.match(/^([a-zA-Z_][\w]*)\(\)$/);
      const cls = c.match(/^([A-Z][A-Za-z0-9]+)$/);
      const sym = fn ? fn[1] : (cls ? cls[1] : null);
      if (sym) items.push({ symbol: sym, line: bodyStartLine + i, idx: i });
    }
  }
  return { items, lines };
}

async function readFileInfo(abs) {
  try {
    const s = await stat(abs);
    if (!s.isFile()) return { exists: false };
    const text = await readFile(abs, 'utf8');
    return { exists: true, lineCount: text.split(/\r?\n/).length, text };
  } catch { return { exists: false }; }
}

/** 把一个引用 target 解析为真实文件：相对合同 → 相对仓根 → basename fallback（按 lineNeed 选配） */
async function resolveTarget(target, contractDir, lineNeed) {
  const tries = [path.resolve(contractDir, target), path.resolve(ROOT, target)];
  for (const a of tries) {
    const info = await readFileInfo(a);
    if (info.exists) return { abs: a, info };
  }
  const base = path.basename(target);
  let firstExisting = null;
  for (const d of BASENAME_FALLBACK_DIRS) {
    const a = path.resolve(ROOT, d, base);
    const info = await readFileInfo(a);
    if (!info.exists) continue;
    if (!firstExisting) firstExisting = { abs: a, info };
    if (!lineNeed || info.lineCount >= lineNeed) return { abs: a, info };
  }
  return firstExisting || { abs: null, info: { exists: false } };
}

async function auditContract(absFile) {
  const findings = [];
  const rel = path.relative(ROOT, absFile).replace(/\\/g, '/');
  const text = await readFile(absFile, 'utf8');
  const { status: rawStatus, body, bodyStartLine } = parseFrontmatter(text);
  const ignores = collectIgnores(text);

  let status = rawStatus;
  if (!status) {
    findings.push({
      file: rel, line: 1, code: 'missing-status', level: 'error',
      msg: '缺少 frontmatter `status:` 字段（current|draft|mixed|reference）',
    });
    status = 'draft';
  } else if (!VALID_STATUS.has(status)) {
    findings.push({
      file: rel, line: 1, code: 'bad-status', level: 'error',
      msg: `status 非法：${status}（应为 current|draft|mixed|reference）`,
    });
    status = 'draft';
  }
  if (status === 'reference') return { file: rel, status, findings };

  const segMap = status === 'mixed' ? classifyMixedSegments(body) : null;
  const contractDir = path.dirname(absFile);
  const { refs } = extractReferences(body, bodyStartLine);

  for (const ref of refs) {
    const seg = segMap ? (segMap[ref.line - bodyStartLine] || 'current') : status;
    const lineNeed = ref.kind === 'pathline' ? Math.max(ref.lineStart, ref.lineEnd) : 0;
    const { info } = await resolveTarget(ref.target, contractDir, lineNeed);
    if (!info.exists) {
      findings.push({
        file: rel, line: ref.line, code: 'missing-file',
        msg: `引用的文件不存在：${ref.target}`,
        level: seg === 'current' ? 'error' : 'warning',
      });
      continue;
    }
    if (ref.kind === 'pathline' && seg !== 'draft') {
      const maxL = Math.max(ref.lineStart, ref.lineEnd);
      if (ref.lineStart < 1 || maxL > info.lineCount) {
        findings.push({
          file: rel, line: ref.line, code: 'bad-line',
          msg: `${ref.target} 只有 ${info.lineCount} 行，引用 ${ref.lineStart}-${ref.lineEnd} 越界`,
          level: seg === 'current' ? 'error' : 'warning',
        });
      }
    }
  }

  // 规则 4：symbol-drift（best-effort warning，只对 current 段生效）
  if (status !== 'draft') {
    const { items, lines } = extractSymbols(body, bodyStartLine);
    for (const it of items) {
      const seg = segMap ? (segMap[it.idx] || 'current') : status;
      if (seg !== 'current') continue;
      const from = Math.max(0, it.idx - 3);
      const to = Math.min(lines.length - 1, it.idx + 3);
      const nearby = lines.slice(from, to + 1).join('\n');
      const fileHits = [
        ...nearby.matchAll(/`([^`]*\.ts)(?::\d+(?:[-–]\d+)?)?`/g),
        ...nearby.matchAll(/\(([^)]+\.ts)\)/g),
      ];
      let checked = false, found = false;
      for (const fm2 of fileHits) {
        const { info } = await resolveTarget(fm2[1].trim(), contractDir, 0);
        if (!info.exists) continue;
        checked = true;
        if (new RegExp(`\\b${it.symbol}\\b`).test(info.text)) { found = true; break; }
      }
      if (checked && !found
          && !ignores.has(`symbol-drift:${it.symbol}`)
          && !ignores.has('symbol-drift')) {
        findings.push({
          file: rel, line: it.line, code: 'symbol-drift',
          msg: `符号 \`${it.symbol}\` 在附近引用的 .ts 文件中未找到`,
          level: 'warning',
        });
      }
    }
  }
  return { file: rel, status, findings };
}

async function main() {
  let files;
  try {
    files = (await readdir(DOCS_DIR))
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(DOCS_DIR, f));
  } catch (e) {
    console.error(`[contract-audit] 无法读取 ${DOCS_DIR}: ${e.message}`);
    process.exit(2);
  }
  const results = [];
  for (const f of files) results.push(await auditContract(f));

  const errors = [], warnings = [];
  let ok = 0, warn = 0, err = 0;
  for (const r of results) {
    const e = r.findings.filter(x => x.level === 'error');
    const w = r.findings.filter(x => x.level === 'warning');
    errors.push(...e); warnings.push(...w);
    if (e.length) err++; else if (w.length) warn++; else ok++;
  }

  const bar = '─'.repeat(68);
  console.log(bar);
  console.log(`契约真值审计报告  (${new Date().toISOString()})`);
  console.log(bar);
  console.log(`扫描合同：${results.length}  ✅ ${ok}  ⚠️  ${warn}  ❌ ${err}\n`);
  for (const r of results.sort((a, b) => a.file.localeCompare(b.file))) {
    const e = r.findings.filter(x => x.level === 'error').length;
    const w = r.findings.filter(x => x.level === 'warning').length;
    const icon = e ? '❌' : (w ? '⚠️ ' : '✅');
    console.log(`${icon} ${r.file}  [${r.status}]  errors=${e} warnings=${w}`);
    for (const f of r.findings) {
      const lv = f.level === 'error' ? 'ERR ' : 'WARN';
      console.log(`    ${lv} L${f.line} ${f.code}: ${f.msg}`);
    }
  }
  console.log(`\n${bar}`);
  console.log(`总计：errors=${errors.length}  warnings=${warnings.length}`);
  console.log(bar);

  try {
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    const payload = {
      timestamp: new Date().toISOString(),
      contracts_scanned: results.length,
      errors, warnings,
      summary: { ok, warn, err },
      results: results.map(r => ({
        file: r.file, status: r.status,
        errors: r.findings.filter(x => x.level === 'error').length,
        warnings: r.findings.filter(x => x.level === 'warning').length,
      })),
    };
    await writeFile(OUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`\n机器可读报告已写入：${path.relative(ROOT, OUT_JSON).replace(/\\/g, '/')}`);
  } catch (e) {
    console.error(`[contract-audit] 写入 ${OUT_JSON} 失败：${e.message}`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[contract-audit] 未捕获异常：', err);
  process.exit(2);
});
