#!/usr/bin/env node
// ---
// kind: code
// implements: docs/current/contract-audit-contract.md
// ---
// 契约真值审计脚本 — 规格见 docs/current/contract-audit-contract.md（纯 ESM，无 npm 依赖）
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DOCS_CURRENT = path.join(ROOT, 'docs', 'current');
const DOCS_DIR = path.join(ROOT, 'docs');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const CL_SCRIPTS_DIR = path.join(ROOT, 'causal-learner', 'mcp-server', 'scripts');
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const BASELINES_DIR = path.join(ROOT, '.omx', 'baselines');
const OUT_JSON = path.join(ARTIFACTS_DIR, 'contract-audit-latest.json');

// 顶层 docs/*.md 也参与分类审计（非 docs/current/ 的设计文档）
const TOP_DOCS_WHITELIST = new Set(['bestqa-roadmap.md', 'external-integration.md']);

const VALID_STATUS = new Set(['current', 'draft', 'mixed', 'reference']);
const NEW_KIND = new Set(['contract', 'instance', 'record', 'code', 'index']);
const LEGACY_KIND = new Set(['I', 'II']);
// describes 禁用连词：并列信号 → describes 必须是单句
const DESCRIBES_CONJ_CHARS = /[和及并]|同时|[，、]/;
const DESCRIBES_CONJ_EN = /\b(and|also)\b/i;
// 中文停用词（token 切分时剔除）
const STOPWORDS = new Set([
  'the','a','an','of','to','for','in','on','at','by','with','is','are',
  '的','了','和','与','或','在','是','为','对','从','到','及','并','同时',
]);
const BASENAME_FALLBACK_DIRS = [
  'causal-learner/mcp-server/src',
  'causal-learner/mcp-server/src/core',
  'causal-learner/mcp-server/src/tools',
  'scripts',
];
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** 去掉 UTF-8 BOM。 */
function stripBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

/** 剥单/双引号包裹（仅一层）。 */
function unquote(s) {
  if (typeof s !== 'string') return s;
  const m = s.match(/^"([^"]*)"$/) || s.match(/^'([^']*)'$/);
  return m ? m[1] : s;
}

/** Markdown frontmatter 提取器：返回 { fm, body, bodyStartLine }。 */
function parseMarkdownFrontmatter(text) {
  text = stripBom(text);
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { fm: {}, body: text, bodyStartLine: 1 };
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i] === '---') { end = i; break; }
  if (end < 0) return { fm: {}, body: text, bodyStartLine: 1 };
  const fm = {};
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^([a-zA-Z_$][\w$-]*):\s*(.*)$/);
    if (m) fm[m[1]] = unquote(m[2].trim());
  }
  return { fm, body: lines.slice(end + 1).join('\n'), bodyStartLine: end + 2 };
}

/** JS 注释伪 frontmatter 提取器：头部 `// ---` ... `// ---`。 */
function parseJsFrontmatter(text) {
  text = stripBom(text);
  const lines = text.split(/\r?\n/);
  let start = -1, end = -1;
  for (let i = 0; i < lines.length && i < 50; i++) {
    const l = lines[i].trim();
    if (l === '' || l.startsWith('#!')) continue;
    if (l === '// ---') { start = i; break; }
    if (!l.startsWith('//')) return { fm: {}, body: text, bodyStartLine: 1 };
  }
  if (start < 0) return { fm: {}, body: text, bodyStartLine: 1 };
  for (let i = start + 1; i < lines.length && i < 80; i++) {
    if (lines[i].trim() === '// ---') { end = i; break; }
  }
  if (end < 0) return { fm: {}, body: text, bodyStartLine: 1 };
  const fm = {};
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^\s*\/\/\s*([a-zA-Z_$][\w$-]*):\s*(.*)$/);
    if (m) fm[m[1]] = unquote(m[2].trim());
  }
  return { fm, body: lines.slice(end + 1).join('\n'), bodyStartLine: end + 2 };
}

/** JSON 根字段提取器：扫描 `$kind` `$conforms_to` `$generated_by` 等。 */
function parseJsonFrontmatter(text) {
  text = stripBom(text);
  let obj = null;
  try { obj = JSON.parse(text); }
  catch { return { fm: {}, body: text, bodyStartLine: 1, parseError: true }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { fm: {}, body: text, bodyStartLine: 1 };
  }
  const fm = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$') && (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number')) {
      fm[k.slice(1)] = v;
    }
  }
  return { fm, body: text, bodyStartLine: 1 };
}

/** 收集 <!-- audit-ignore: code[: target] --> 指令（仅 markdown）
 *  target 存在时同时加入裸 code 与 `code:target` 两种形式，方便下游按粒度消费 */
function collectIgnores(text) {
  const ignores = new Set();
  for (const m of text.matchAll(/<!--\s*audit-ignore:\s*([\w-]+)(?::\s*([^>]+?))?\s*-->/g)) {
    const code = m[1].trim();
    const tgt = (m[2] || '').trim();
    ignores.add(code);
    if (tgt) ignores.add(`${code}:${tgt}`);
  }
  return ignores;
}

/** mixed 合同按章节标题关键字把每行映射为 'current' 或 'draft' */
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

/** 提取所有引用。跳过 fenced code block；md-link 时遮罩 inline-code。 */
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
          kind: 'pathline', target: plm[1],
          lineStart: +plm[2], lineEnd: plm[3] ? +plm[3] : +plm[2],
          line: bodyStartLine + i,
        });
      }
    }
  }
  return { refs, lines };
}

/** 提取反引号内的 `foo()` / `BarClass`，用于 symbol-drift 检查 */
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

function codePointLength(s) { let n = 0; for (const _ of s) n++; return n; }

/** 正文中链接/embed 的原始字符总长度。 */
function computeLinkBytes(body) {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  const buf = [];
  for (const l of lines) {
    if (/^\s*```/.test(l)) { inFence = !inFence; continue; }
    if (!inFence) buf.push(l);
  }
  const text = buf.join('\n');
  const marks = new Array(text.length).fill(false);
  let total = 0;
  for (const re of [/!\[\[[^\]]+\]\]/g, /\[\[[^\]]+\]\]/g, /!\[[^\]]*\]\([^)]+\)/g, /\[[^\]]*\]\([^)]+\)/g]) {
    for (const m of text.matchAll(re)) {
      const s = m.index, e = s + m[0].length;
      let overlap = false;
      for (let i = s; i < e; i++) if (marks[i]) { overlap = true; break; }
      if (overlap) continue;
      for (let i = s; i < e; i++) marks[i] = true;
      total += m[0].length;
    }
  }
  return { total: text.length, linkBytes: total };
}

function tokenize(s) {
  if (!s) return new Set();
  const tokens = new Set();
  for (const m of String(s).toLowerCase().matchAll(/[a-z][a-z0-9]*/g)) {
    if (!STOPWORDS.has(m[0])) tokens.add(m[0]);
  }
  for (const ch of String(s)) {
    if (/[\u4e00-\u9fff]/.test(ch) && !STOPWORDS.has(ch)) tokens.add(ch);
  }
  return tokens;
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

async function readFileInfo(abs) {
  try {
    const s = await stat(abs);
    if (!s.isFile()) return { exists: false };
    const text = await readFile(abs, 'utf8');
    return { exists: true, lineCount: text.split(/\r?\n/).length, text };
  } catch { return { exists: false }; }
}

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

/** git log --oneline -- <file> 的 commit 数；失败返回 null（不崩溃）。 */
async function gitCommitCount(absFile) {
  try {
    const { stdout } = await execFileP('git', ['log', '--oneline', '--', absFile], { cwd: ROOT });
    return stdout.split(/\r?\n/).filter(Boolean).length;
  } catch { return null; }
}

/** 归一化 kind：区分新值 / legacy / 非法。 */
function normalizeKind(rawKind) {
  if (rawKind === null || rawKind === undefined || rawKind === '') return { kind: null, legacy: false };
  const k = String(rawKind).trim();
  if (NEW_KIND.has(k)) return { kind: k, legacy: false };
  if (LEGACY_KIND.has(k)) return { kind: k, legacy: true };
  return { kind: k, legacy: false, invalid: true };
}

/** 对单个文件做分类 + 规则审计。format: 'md' | 'js' | 'json'。 */
async function auditFile(absFile, format) {
  const findings = [];
  const rel = path.relative(ROOT, absFile).replace(/\\/g, '/');
  let text;
  try { text = await readFile(absFile, 'utf8'); }
  catch (e) {
    return { file: rel, format, kind: null, legacyKind: null, describes: null, density: null, status: null, fm: {}, findings: [{ file: rel, line: 1, code: 'read-error', level: 'error', msg: `无法读取：${e.message}` }] };
  }

  let fm, body, bodyStartLine;
  if (format === 'md') {
    ({ fm, body, bodyStartLine } = parseMarkdownFrontmatter(text));
  } else if (format === 'js') {
    ({ fm, body, bodyStartLine } = parseJsFrontmatter(text));
  } else {
    const parsed = parseJsonFrontmatter(text);
    ({ fm, body, bodyStartLine } = parsed);
    if (parsed.parseError) {
      findings.push({ file: rel, line: 1, code: 'json-parse-error', level: 'error', msg: 'JSON 无法解析' });
    }
  }

  const ignores = format === 'md' ? collectIgnores(text) : new Set();

  // ── R5：kind 必填与合法 ──
  const rawKind = fm.kind;
  const norm = normalizeKind(rawKind);
  let kind = null;
  let legacyKind = null;

  if (!rawKind) {
    if (!ignores.has('missing-kind')) {
      findings.push({
        file: rel, line: 1, code: 'missing-kind', level: 'error',
        msg: `缺少 \`kind\` 字段（应为 ${[...NEW_KIND].join('|')}）`,
      });
    }
  } else if (norm.invalid) {
    findings.push({
      file: rel, line: 1, code: 'bad-kind', level: 'error',
      msg: `kind 非法：${rawKind}（应为 ${[...NEW_KIND].join('|')}，或旧值 I/II）`,
    });
  } else if (norm.legacy) {
    legacyKind = norm.kind;
    // R13：升级建议（warn）
    if (norm.kind === 'I') {
      findings.push({
        file: rel, line: 1, code: 'suggest-upgrade', level: 'warning',
        msg: 'kind: I 已废弃，请根据内容升级为 contract | record | code',
      });
    } else {
      findings.push({
        file: rel, line: 1, code: 'suggest-upgrade', level: 'warning',
        msg: "kind: II 已废弃，请改为 'index'",
      });
    }
    kind = norm.kind === 'I' ? 'contract' : 'index'; // 兼容期间按旧规则继续审计
  } else {
    kind = norm.kind;
  }

  const describes = fm.describes !== undefined ? String(fm.describes) : null;

  // ── R2 describes（contract / legacy-I 共用） ──
  if (kind === 'contract' || legacyKind === 'I') {
    if (describes === null || describes === '') {
      if (!ignores.has('missing-describes')) {
        findings.push({
          file: rel, line: 1, code: 'missing-describes', level: 'error',
          msg: 'kind: contract 必须有 `describes:` 字段',
        });
      }
    } else {
      if (codePointLength(describes) > 20 && !ignores.has('describes-too-long')) {
        findings.push({
          file: rel, line: 1, code: 'describes-too-long', level: 'warning',
          msg: `describes 超过 20 字：${codePointLength(describes)} 字`,
        });
      }
      if ((DESCRIBES_CONJ_CHARS.test(describes) || DESCRIBES_CONJ_EN.test(describes))
          && !ignores.has('describes-conjunction')) {
        findings.push({
          file: rel, line: 1, code: 'describes-conjunction', level: 'error',
          msg: `describes 含连词/并列信号：${describes}`,
        });
      }
    }
  }

  // ── R14：index 严格无 substance + R3 密度门槛 ──
  const { total, linkBytes } = format === 'md' ? computeLinkBytes(body) : { total: 0, linkBytes: 0 };
  const density = total > 0 ? linkBytes / total : 0;
  if ((kind === 'contract' || legacyKind === 'I') && density > 0.30 && !ignores.has('type1-too-many-refs')) {
    findings.push({
      file: rel, line: 1, code: 'type1-too-many-refs', level: 'warning',
      msg: `contract 引用密度过高 density=${(density * 100).toFixed(1)}%（>30% 可能应为 index）`,
    });
  }
  if (kind === 'index' || legacyKind === 'II') {
    if (describes && !ignores.has('type2-has-describes')) {
      findings.push({
        file: rel, line: 1, code: 'type2-has-describes', level: 'warning',
        msg: 'kind: index 不应填 describes',
      });
    }
    if (format === 'md' && density < 0.70 && !ignores.has('type2-too-much-substance')) {
      findings.push({
        file: rel, line: 1, code: 'type2-too-much-substance', level: 'warning',
        msg: `index 引用密度过低 density=${(density * 100).toFixed(1)}%（<70% 可能夹带 substance）`,
      });
    }
  }

  // ── R12：contract 建议有 schema_version ──
  if (kind === 'contract' && fm.schema_version === undefined && !ignores.has('missing-schema-version')) {
    findings.push({
      file: rel, line: 1, code: 'missing-schema-version', level: 'warning',
      msg: 'kind: contract 建议有 `schema_version:` 字段（int）',
    });
  }

  // ── R6/R7/R8：instance 绑定完备 + conforms_to 合法 + generated_by 存在 ──
  if (kind === 'instance') {
    const ct = fm.conforms_to;
    const gb = fm.generated_by;
    const ga = fm.generated_at;
    if (!ct) {
      findings.push({ file: rel, line: 1, code: 'missing-conforms-to', level: 'error', msg: 'kind: instance 必须有 `conforms_to`' });
    }
    if (!gb) {
      findings.push({ file: rel, line: 1, code: 'missing-generated-by', level: 'error', msg: 'kind: instance 必须有 `generated_by`' });
    }
    if (!ga) {
      findings.push({ file: rel, line: 1, code: 'missing-generated-at', level: 'error', msg: 'kind: instance 必须有 `generated_at`' });
    } else if (!ISO8601_RE.test(String(ga))) {
      findings.push({ file: rel, line: 1, code: 'bad-generated-at', level: 'error', msg: `generated_at 非 ISO 8601：${ga}` });
    }
    if (ct) {
      const abs = path.isAbsolute(String(ct)) ? String(ct) : path.resolve(ROOT, String(ct));
      const info = await readFileInfo(abs);
      if (!info.exists) {
        findings.push({ file: rel, line: 1, code: 'bad-conforms-to-target', level: 'error', msg: `conforms_to 不存在：${ct}` });
      } else {
        const { fm: tfm } = parseMarkdownFrontmatter(info.text);
        const tKind = normalizeKind(tfm.kind).kind;
        if (tKind !== 'contract') {
          findings.push({ file: rel, line: 1, code: 'bad-conforms-to-target', level: 'error', msg: `conforms_to 目标 kind=${tKind || '?'}，应为 contract：${ct}` });
        }
      }
    }
    if (gb) {
      const abs = path.isAbsolute(String(gb)) ? String(gb) : path.resolve(ROOT, String(gb));
      const info = await readFileInfo(abs);
      if (!info.exists) {
        findings.push({ file: rel, line: 1, code: 'bad-generated-by-target', level: 'error', msg: `generated_by 不存在：${gb}` });
      }
    }
  }

  // ── R9/R10：record 绑定 + 不可变弱检查 ──
  if (kind === 'record') {
    if (!fm.event) findings.push({ file: rel, line: 1, code: 'missing-event', level: 'error', msg: 'kind: record 必须有 `event`' });
    if (!fm.recorded_at) {
      findings.push({ file: rel, line: 1, code: 'missing-recorded-at', level: 'error', msg: 'kind: record 必须有 `recorded_at`' });
    } else if (!ISO8601_RE.test(String(fm.recorded_at))) {
      findings.push({ file: rel, line: 1, code: 'bad-recorded-at', level: 'error', msg: `recorded_at 非 ISO 8601：${fm.recorded_at}` });
    }
    const imm = fm.immutable;
    if (imm !== true && imm !== 'true') {
      findings.push({ file: rel, line: 1, code: 'missing-immutable', level: 'error', msg: 'kind: record 必须显式 `immutable: true`' });
    }
    const cnt = await gitCommitCount(absFile);
    if (cnt !== null && cnt > 1 && !ignores.has('record-mutated')) {
      findings.push({ file: rel, line: 1, code: 'record-mutated', level: 'warning', msg: `record 历史 commit 数=${cnt} > 1（应一次写入后不再变更）` });
    }
  }

  // ── R11：code.implements 严格校验（与 R7 conforms_to 同级） ──
  if (kind === 'code') {
    const impRaw = fm.implements;
    if (impRaw === undefined || impRaw === null || impRaw === '') {
      findings.push({ file: rel, line: 1, code: 'missing-implements', level: 'error', msg: 'kind: code 必须有 `implements` 字段（指向一个或多个 kind: contract 文件）' });
    } else {
      // 支持字符串或数组（YAML flow [a, b] / JSON array）
      let list;
      if (Array.isArray(impRaw)) list = impRaw.map(String);
      else {
        const s = String(impRaw).trim();
        const arr = s.match(/^\[(.*)\]$/);
        if (arr) list = arr[1].split(',').map(x => unquote(x.trim())).filter(Boolean);
        else list = [s];
      }
      for (const item of list) {
        if (!item) continue;
        const abs = path.isAbsolute(item) ? item : path.resolve(ROOT, item);
        const info = await readFileInfo(abs);
        if (!info.exists) {
          findings.push({ file: rel, line: 1, code: 'bad-implements-target', level: 'error', msg: `implements 目标不存在：${item}` });
          continue;
        }
        const { fm: tfm } = parseMarkdownFrontmatter(info.text);
        const tKind = normalizeKind(tfm.kind).kind;
        if (tKind !== 'contract') {
          findings.push({ file: rel, line: 1, code: 'implements-wrong-kind', level: 'error', msg: `implements 目标 kind=${tKind || '?'}，应为 contract：${item}` });
        }
      }
    }
  }

  // ── markdown 引用/行号/符号 drift（沿用旧规则） ──
  let status = null;
  if (format === 'md') {
    const rawStatus = fm.status ? String(fm.status).replace(/\s*\(.*\)\s*$/, '').trim() : null;
    status = rawStatus;
    // R1 收窄：仅 kind: contract 强制 status；record / instance / code / index 的 status 可选
    const statusRequired = (kind === 'contract' || kind === 'I' || kind === 'II' || kind === null);
    if (!status) {
      if (statusRequired) {
        findings.push({ file: rel, line: 1, code: 'missing-status', level: 'error', msg: '缺少 `status:` 字段' });
      }
      status = kind === 'record' ? 'reference' : 'draft';
    } else if (!VALID_STATUS.has(status)) {
      findings.push({ file: rel, line: 1, code: 'bad-status', level: 'error', msg: `status 非法：${status}` });
      status = 'draft';
    }

    if (status !== 'reference') {
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
            const { info } = await resolveTarget(fm2[1].trim(), path.dirname(absFile), 0);
            if (!info.exists) continue;
            checked = true;
            if (new RegExp(`\\b${it.symbol}\\b`).test(info.text)) { found = true; break; }
          }
          if (checked && !found && !ignores.has(`symbol-drift:${it.symbol}`) && !ignores.has('symbol-drift')) {
            findings.push({
              file: rel, line: it.line, code: 'symbol-drift',
              msg: `符号 \`${it.symbol}\` 在附近引用的 .ts 文件中未找到`,
              level: 'warning',
            });
          }
        }
      }
    }
  }

  return { file: rel, format, kind, legacyKind, describes, density: format === 'md' ? density : null, status, fm, findings };
}

/** R4：跨文件 describes 重复真相检查。 */
function checkDuplicateTruth(results) {
  const entries = results
    .filter(r => (r.kind === 'contract' || r.legacyKind === 'I') && r.describes)
    .map(r => ({ r, tokens: tokenize(r.describes) }));
  const push = (a, b, sim, code, level, label) => {
    a.r.findings.push({ file: a.r.file, line: 1, code, level, msg: `describes 与 ${b.r.file} ${label}（Jaccard=${sim.toFixed(2)}）` });
    b.r.findings.push({ file: b.r.file, line: 1, code, level, msg: `describes 与 ${a.r.file} ${label}（Jaccard=${sim.toFixed(2)}）` });
  };
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const sim = jaccard(entries[i].tokens, entries[j].tokens);
      if (sim >= 0.7) push(entries[i], entries[j], sim, 'duplicate-truth-severe', 'error', '近乎重复');
      else if (sim >= 0.5) push(entries[i], entries[j], sim, 'duplicate-truth', 'warning', '相似');
    }
  }
}

/** 递归列目录匹配扩展名的文件。 */
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

async function collectTargets() {
  const targets = [];
  // 1. docs/current/*.md
  try {
    for (const f of await readdir(DOCS_CURRENT)) {
      if (f.endsWith('.md')) targets.push({ abs: path.join(DOCS_CURRENT, f), format: 'md' });
    }
  } catch {}
  // 2. 顶层 docs/*.md 白名单
  try {
    for (const f of await readdir(DOCS_DIR)) {
      if (TOP_DOCS_WHITELIST.has(f)) targets.push({ abs: path.join(DOCS_DIR, f), format: 'md' });
    }
  } catch {}
  // 3. scripts/*.mjs
  try {
    for (const f of await readdir(SCRIPTS_DIR)) {
      if (/\.(mjs|js)$/.test(f)) targets.push({ abs: path.join(SCRIPTS_DIR, f), format: 'js' });
    }
  } catch {}
  // 3b. causal-learner/mcp-server/scripts/*.mjs（新 taxonomy 纳入）
  try {
    for (const f of await readdir(CL_SCRIPTS_DIR)) {
      if (/\.(mjs|js)$/.test(f)) targets.push({ abs: path.join(CL_SCRIPTS_DIR, f), format: 'js' });
    }
  } catch {}
  // 4. artifacts/**/*.json（跳过自生成报告）
  for (const f of await listFilesRec(ARTIFACTS_DIR, ['.json'])) {
    if (path.basename(f) === 'contract-audit-latest.json') continue;
    targets.push({ abs: f, format: 'json' });
  }
  // 4b. artifacts/**/*.md（md 格式 instance，如 summary.md）
  for (const f of await listFilesRec(ARTIFACTS_DIR, ['.md'])) {
    targets.push({ abs: f, format: 'md' });
  }
  // 5. .omx/baselines/**/*.json
  for (const f of await listFilesRec(BASELINES_DIR, ['.json'])) {
    targets.push({ abs: f, format: 'json' });
  }
  // 5b. .omx/baselines/**/*.md（summary.md / coverage-matrix.md 等 md instance）
  for (const f of await listFilesRec(BASELINES_DIR, ['.md'])) {
    targets.push({ abs: f, format: 'md' });
  }
  return targets;
}

/** §10 v7 绑定 pass：五条跨文件绑定真值检查（在 main 聚合结果后调用）。 */
async function checkV7Bindings(results) {
  // 只看 kind=instance 且 format=json 的条目
  const instanceResults = results.filter(r => r.kind === 'instance' && r.format === 'json');

  // 从磁盘读取完整 JSON（支持 _parsedObj 注入，用于单元测试跳过磁盘读取）
  const getObj = async (r) => {
    if (r._parsedObj) return r._parsedObj;
    try {
      const text = await readFile(path.resolve(ROOT, r.file), 'utf8');
      return JSON.parse(stripBom(text));
    } catch { return null; }
  };

  // 按 conforms_to 分组，建立五个索引 Map<id, {file, obj, findingsRef}>
  const reconMap  = new Map();  // reconstruction-contract
  const deltaMap  = new Map();  // ontology-delta-contract
  const traceMap  = new Map();  // derivation-chain-contract
  const miMap     = new Map();  // mechanism-instance-contract
  const epMap     = new Map();  // v7-world-model-contract

  for (const r of instanceResults) {
    const ct  = String(r.fm.conforms_to || '');
    const obj = await getObj(r);
    if (!obj || typeof obj !== 'object') continue;
    const id = obj.id;
    if (!id) continue;
    const entry = { file: r.file, obj, findingsRef: r.findings };
    if      (ct.includes('reconstruction-contract'))     reconMap.set(id, entry);
    else if (ct.includes('ontology-delta-contract'))     deltaMap.set(id, entry);
    else if (ct.includes('derivation-chain-contract'))   traceMap.set(id, entry);
    else if (ct.includes('mechanism-instance-contract')) miMap.set(id, entry);
    else if (ct.includes('v7-world-model-contract'))     epMap.set(id, entry);
  }

  // V7-1：AcceptedReconstruction.mechanism_instance_ids 全部 resolvable
  for (const { file, obj, findingsRef } of reconMap.values()) {
    const ids = obj.mechanism_instance_ids;
    if (!Array.isArray(ids) || ids.length === 0) continue;
    for (const miId of ids) {
      if (!miMap.has(miId)) {
        findingsRef.push({ file, line: 1, code: 'bad-mechanism-instance-ref', level: 'error',
          msg: `mechanism_instance_ids 引用不存在：${miId}` });
      }
    }
  }

  // V7-2：Episode.ontologyDeltaId resolvable
  for (const { file, obj, findingsRef } of epMap.values()) {
    const deltaId = obj.ontologyDeltaId;
    if (!deltaId) continue;
    if (!deltaMap.has(deltaId)) {
      findingsRef.push({ file, line: 1, code: 'bad-ontology-delta-ref', level: 'error',
        msg: `ontologyDeltaId 引用不存在：${deltaId}` });
    }
  }

  // V7-3：reconstruction.traceId ↔ trace.reconstructionId 双向一致
  for (const { file, obj, findingsRef } of reconMap.values()) {
    const traceId = obj.traceId;
    if (!traceId) continue;
    const te = traceMap.get(traceId);
    if (!te) {
      findingsRef.push({ file, line: 1, code: 'trace-reconstruction-mismatch', level: 'error',
        msg: `traceId 引用不存在：${traceId}` });
    } else if (te.obj.reconstructionId !== obj.id) {
      findingsRef.push({ file, line: 1, code: 'trace-reconstruction-mismatch', level: 'error',
        msg: `traceId=${traceId} 的 trace.reconstructionId(${te.obj.reconstructionId}) ≠ reconstruction.id(${obj.id})` });
      te.findingsRef.push({ file: te.file, line: 1, code: 'trace-reconstruction-mismatch', level: 'error',
        msg: `reconstructionId(${te.obj.reconstructionId}) 与 reconstruction 文件(${file})不一致` });
    }
  }

  // V7-4：OntologyDelta.kind=none 时 no_update_reason 必须完整
  for (const { file, obj, findingsRef } of deltaMap.values()) {
    if (obj.kind !== 'none') continue;
    const nur = obj.no_update_reason;
    if (!nur || !nur.reason_kind || !nur.explanation) {
      findingsRef.push({ file, line: 1, code: 'missing-no-update-reason', level: 'error',
        msg: `kind=none 时 no_update_reason.reason_kind/explanation 缺失或为空` });
    }
  }

  // V7-5：MechanismInstance.status=accepted 时 claim_ids || support_link_refs 非空
  for (const { file, obj, findingsRef } of miMap.values()) {
    if (obj.status !== 'accepted') continue;
    const hasClaims  = Array.isArray(obj.claim_ids)         && obj.claim_ids.length > 0;
    const hasSupport = Array.isArray(obj.support_link_refs) && obj.support_link_refs.length > 0;
    if (!hasClaims && !hasSupport) {
      findingsRef.push({ file, line: 1, code: 'accepted-instance-without-support', level: 'error',
        msg: `status=accepted 但 claim_ids 与 support_link_refs 均为空` });
    }
  }
}

/** §11 ObservationModel binding pass：三条跨文件绑定真值检查（在 checkV7Bindings 之后调用）。
 *
 * 索引按 $conforms_to + 字段结构区分：
 *   omMap  ← conforms_to 含 'observation-model-contract'  且 obj.outputSignals 是数组
 *   orMap  ← conforms_to 含 'observation-model-contract'  且 obj.observationModelId 是字符串
 *   slMap  ← conforms_to 含 'support-link-contract'       且 obj.observationRecordId 存在
 */
async function checkObservationModelBindings(results) {
  const instanceResults = results.filter(r => r.kind === 'instance' && r.format === 'json');

  const getObj = async (r) => {
    if (r._parsedObj) return r._parsedObj;
    try {
      const text = await readFile(path.resolve(ROOT, r.file), 'utf8');
      return JSON.parse(stripBom(text));
    } catch { return null; }
  };

  const omMap = new Map(); // ObservationModel:  id → {file, obj, findingsRef}
  const orMap = new Map(); // ObservationRecord: id → {file, obj, findingsRef}
  const slMap = new Map(); // SupportLink:       id → {file, obj, findingsRef}

  for (const r of instanceResults) {
    const ct  = String(r.fm.conforms_to || '');
    const obj = await getObj(r);
    if (!obj || typeof obj !== 'object') continue;
    const id = obj.id;
    if (!id) continue;
    const entry = { file: r.file, obj, findingsRef: r.findings };

    if (ct.includes('observation-model-contract')) {
      if (Array.isArray(obj.outputSignals)) {
        omMap.set(id, entry);                       // ObservationModel
      } else if (typeof obj.observationModelId === 'string') {
        orMap.set(id, entry);                       // ObservationRecord
      }
    } else if (ct.includes('support-link-contract')) {
      if (obj.observationRecordId !== undefined) slMap.set(id, entry);
    }
  }

  // OM-1：ObservationRecord.observationModelId 必须能 resolve 到 ObservationModel
  for (const { file, obj, findingsRef } of orMap.values()) {
    const omId = obj.observationModelId;
    if (!omId) {
      findingsRef.push({ file, line: 1, code: 'bad-observation-model-ref', level: 'error',
        msg: `ObservationRecord.observationModelId 缺失` });
    } else if (!omMap.has(omId)) {
      findingsRef.push({ file, line: 1, code: 'bad-observation-model-ref', level: 'error',
        msg: `ObservationRecord.observationModelId 引用不存在：${omId}` });
    }
  }

  // OM-2：SupportLink → ObservationRecord → ObservationModel 链不断
  for (const { file, obj, findingsRef } of slMap.values()) {
    const orId = obj.observationRecordId;
    if (!orId) {
      findingsRef.push({ file, line: 1, code: 'supportlink-observation-chain-broken', level: 'error',
        msg: `SupportLink.observationRecordId 缺失` });
      continue;
    }
    const orEntry = orMap.get(orId);
    if (!orEntry) {
      findingsRef.push({ file, line: 1, code: 'supportlink-observation-chain-broken', level: 'error',
        msg: `SupportLink → ObservationRecord 链断：observationRecordId 不存在 ${orId}` });
      continue;
    }
    const omId = orEntry.obj.observationModelId;
    if (!omId || !omMap.has(omId)) {
      findingsRef.push({ file, line: 1, code: 'supportlink-observation-chain-broken', level: 'error',
        msg: `SupportLink → ObservationRecord → ObservationModel 链断：observationModelId ${omId || '(missing)'} 不存在` });
    }
  }

  // OM-3：ObservationModel.status=current 时至少有一个 ObservationRecord 引用它
  for (const { file, obj, findingsRef } of omMap.values()) {
    if (obj.status !== 'current') continue;
    const hasRef = [...orMap.values()].some(e => e.obj.observationModelId === obj.id);
    if (!hasRef) {
      findingsRef.push({ file, line: 1, code: 'orphan-current-observation-model', level: 'warning',
        msg: `ObservationModel.status=current 但无 ObservationRecord 引用它（id=${obj.id}）` });
    }
  }
}

/** §12 Counterfactual binding pass：四条跨文件绑定真值检查（在 checkObservationModelBindings 之后调用）。
 *
 * 索引：
 *   cfMap  ← conforms_to 含 'counterfactual-scenario-contract'
 *   epMap2 ← conforms_to 含 'v7-world-model-contract'
 *   reconMap2 ← conforms_to 含 'reconstruction-contract'
 *   mpMap  ← conforms_to 含 'mechanism-program-contract'
 */
async function checkCounterfactualBindings(results) {
  const instanceResults = results.filter(r => r.kind === 'instance' && r.format === 'json');

  const getObj = async (r) => {
    if (r._parsedObj) return r._parsedObj;
    try {
      const text = await readFile(path.resolve(ROOT, r.file), 'utf8');
      return JSON.parse(stripBom(text));
    } catch { return null; }
  };

  const cfMap     = new Map(); // CounterfactualScenario: id → {file, obj, findingsRef}
  const epMap2    = new Map(); // Episode:                id → {file, obj, findingsRef}
  const reconMap2 = new Map(); // AcceptedReconstruction: id → {file, obj, findingsRef}
  const mpMap     = new Map(); // MechanismProgram:       id → {file, obj, findingsRef}

  for (const r of instanceResults) {
    const ct  = String(r.fm.conforms_to || '');
    const obj = await getObj(r);
    if (!obj || typeof obj !== 'object') continue;
    const id = obj.id;
    if (!id) continue;
    const entry = { file: r.file, obj, findingsRef: r.findings };

    if      (ct.includes('counterfactual-scenario-contract')) cfMap.set(id, entry);
    else if (ct.includes('v7-world-model-contract'))          epMap2.set(id, entry);
    else if (ct.includes('reconstruction-contract'))          reconMap2.set(id, entry);
    else if (ct.includes('mechanism-program-contract'))       mpMap.set(id, entry);
  }

  for (const { file, obj, findingsRef } of cfMap.values()) {
    // CF-1：baseEpisodeId 必须能 resolve 到 Episode
    if (!obj.baseEpisodeId) {
      findingsRef.push({ file, line: 1, code: 'bad-counterfactual-episode-ref', level: 'error',
        msg: `CounterfactualScenario.baseEpisodeId 缺失` });
    } else if (!epMap2.has(obj.baseEpisodeId)) {
      findingsRef.push({ file, line: 1, code: 'bad-counterfactual-episode-ref', level: 'error',
        msg: `CounterfactualScenario.baseEpisodeId 引用不存在：${obj.baseEpisodeId}` });
    }

    // CF-2：baseReconstructionId 必须能 resolve 到 AcceptedReconstruction
    if (!obj.baseReconstructionId) {
      findingsRef.push({ file, line: 1, code: 'bad-counterfactual-reconstruction-ref', level: 'error',
        msg: `CounterfactualScenario.baseReconstructionId 缺失` });
    } else if (!reconMap2.has(obj.baseReconstructionId)) {
      findingsRef.push({ file, line: 1, code: 'bad-counterfactual-reconstruction-ref', level: 'error',
        msg: `CounterfactualScenario.baseReconstructionId 引用不存在：${obj.baseReconstructionId}` });
    }

    // CF-3：mechanismProgramRefs 中的每个 ref 都必须能 resolve 到 MechanismProgram
    if (Array.isArray(obj.mechanismProgramRefs)) {
      for (const ref of obj.mechanismProgramRefs) {
        if (!mpMap.has(ref)) {
          findingsRef.push({ file, line: 1, code: 'bad-counterfactual-program-ref', level: 'error',
            msg: `CounterfactualScenario.mechanismProgramRefs 引用不存在：${ref}` });
        }
      }
    }

    // CF-4：modifiedAssumptions 必须是非空数组
    if (!Array.isArray(obj.modifiedAssumptions) || obj.modifiedAssumptions.length === 0) {
      findingsRef.push({ file, line: 1, code: 'empty-counterfactual-assumptions', level: 'error',
        msg: `CounterfactualScenario.modifiedAssumptions 为空或缺失` });
    }
  }
}

/** §13 ExperimentDesign binding pass：三条跨文件绑定真值检查（在 checkCounterfactualBindings 之后调用）。
 *
 * 索引：
 *   edMap      ← conforms_to 含 'experiment-design-contract'
 *   epMap3     ← conforms_to 含 'v7-world-model-contract'
 *   cfMap2     ← conforms_to 含 'counterfactual-scenario-contract'
 */
async function checkExperimentDesignBindings(results) {
  const instanceResults = results.filter(r => r.kind === 'instance' && r.format === 'json');

  const getObj = async (r) => {
    if (r._parsedObj) return r._parsedObj;
    try {
      const text = await readFile(path.resolve(ROOT, r.file), 'utf8');
      return JSON.parse(stripBom(text));
    } catch { return null; }
  };

  const edMap  = new Map(); // ExperimentDesign:        id → {file, obj, findingsRef}
  const epMap3 = new Map(); // Episode:                 id → {file, obj, findingsRef}
  const cfMap2 = new Map(); // CounterfactualScenario:  id → {file, obj, findingsRef}

  for (const r of instanceResults) {
    const ct = String(r.fm.conforms_to || '');
    const obj = await getObj(r);
    if (!obj || typeof obj !== 'object') continue;
    const id = obj.id;
    if (!id) continue;
    const entry = { file: r.file, obj, findingsRef: r.findings };

    if      (ct.includes('experiment-design-contract'))      edMap.set(id, entry);
    else if (ct.includes('v7-world-model-contract'))         epMap3.set(id, entry);
    else if (ct.includes('counterfactual-scenario-contract')) cfMap2.set(id, entry);
  }

  for (const { file, obj, findingsRef } of edMap.values()) {
    // ED-1：baseEpisodeId 必须能 resolve 到 Episode
    if (!obj.baseEpisodeId) {
      findingsRef.push({ file, line: 1, code: 'bad-experiment-design-episode-ref', level: 'error',
        msg: 'ExperimentDesign.baseEpisodeId 缺失' });
    } else if (!epMap3.has(obj.baseEpisodeId)) {
      findingsRef.push({ file, line: 1, code: 'bad-experiment-design-episode-ref', level: 'error',
        msg: `ExperimentDesign.baseEpisodeId 引用不存在：${obj.baseEpisodeId}` });
    }

    // ED-2：basedOnCounterfactualIds 中的每个 id 都必须能 resolve 到 CounterfactualScenario
    if (Array.isArray(obj.basedOnCounterfactualIds)) {
      for (const id of obj.basedOnCounterfactualIds) {
        if (!cfMap2.has(id)) {
          findingsRef.push({ file, line: 1, code: 'bad-experiment-design-counterfactual-ref', level: 'error',
            msg: `ExperimentDesign.basedOnCounterfactualIds 引用不存在：${id}` });
        }
      }
    }

    // ED-3：recommendedAction 必须属于 candidateMeasurements 或 candidateInterventions
    const candidates = [
      ...(Array.isArray(obj.candidateMeasurements) ? obj.candidateMeasurements : []),
      ...(Array.isArray(obj.candidateInterventions) ? obj.candidateInterventions : []),
    ];
    if (!obj.recommendedAction || !candidates.includes(obj.recommendedAction)) {
      findingsRef.push({ file, line: 1, code: 'recommended-action-outside-candidates', level: 'error',
        msg: `ExperimentDesign.recommendedAction 不在候选集合中：${obj.recommendedAction ?? '<missing>'}` });
    }
  }
}

/** §14 ActionExecution binding pass：四条跨文件绑定真值检查（在 checkExperimentDesignBindings 之后调用）。
 *
 * 索引：
 *   axMap ← conforms_to 含 'action-execution-contract'
 *   edMap ← conforms_to 含 'experiment-design-contract'
 *   epMap ← conforms_to 含 'v7-world-model-contract'
 */
async function checkActionExecutionBindings(results) {
  const instanceResults = results.filter(r => r.kind === 'instance' && r.format === 'json');

  const getObj = async (r) => {
    if (r._parsedObj) return r._parsedObj;
    try {
      const text = await readFile(path.resolve(ROOT, r.file), 'utf8');
      return JSON.parse(stripBom(text));
    } catch { return null; }
  };

  const axMap = new Map();
  const edMap = new Map();
  const epMap = new Map();

  for (const r of instanceResults) {
    const ct = String(r.fm.conforms_to || '');
    const obj = await getObj(r);
    if (!obj || typeof obj !== 'object') continue;
    const id = obj.id;
    if (!id) continue;
    const entry = { file: r.file, obj, findingsRef: r.findings };

    if      (ct.includes('action-execution-contract'))  axMap.set(id, entry);
    else if (ct.includes('experiment-design-contract')) edMap.set(id, entry);
    else if (ct.includes('v7-world-model-contract'))    epMap.set(id, entry);
  }

  for (const { file, obj, findingsRef } of axMap.values()) {
    const design = obj.basedOnExperimentDesignId ? edMap.get(obj.basedOnExperimentDesignId) : null;

    // AX-1：basedOnExperimentDesignId 可解析
    if (!obj.basedOnExperimentDesignId) {
      findingsRef.push({ file, line: 1, code: 'bad-action-execution-design-ref', level: 'error',
        msg: 'ActionExecution.basedOnExperimentDesignId 缺失' });
    } else if (!design) {
      findingsRef.push({ file, line: 1, code: 'bad-action-execution-design-ref', level: 'error',
        msg: `ActionExecution.basedOnExperimentDesignId 引用不存在：${obj.basedOnExperimentDesignId}` });
    }

    // AX-2：sourceEpisodeId 可解析
    if (!obj.sourceEpisodeId) {
      findingsRef.push({ file, line: 1, code: 'bad-action-execution-source-episode-ref', level: 'error',
        msg: 'ActionExecution.sourceEpisodeId 缺失' });
    } else if (!epMap.has(obj.sourceEpisodeId)) {
      findingsRef.push({ file, line: 1, code: 'bad-action-execution-source-episode-ref', level: 'error',
        msg: `ActionExecution.sourceEpisodeId 引用不存在：${obj.sourceEpisodeId}` });
    }

    // AX-3：completed 时 targetEpisodeId 可解析
    if (obj.executionStatus === 'completed') {
      if (!obj.targetEpisodeId) {
        findingsRef.push({ file, line: 1, code: 'bad-action-execution-target-episode-ref', level: 'error',
          msg: 'ActionExecution.executionStatus=completed 但 targetEpisodeId 缺失' });
      } else if (!epMap.has(obj.targetEpisodeId)) {
        findingsRef.push({ file, line: 1, code: 'bad-action-execution-target-episode-ref', level: 'error',
          msg: `ActionExecution.targetEpisodeId 引用不存在：${obj.targetEpisodeId}` });
      }
    }

    // AX-4：actionRef === ExperimentDesign.recommendedAction
    if (design && obj.actionRef !== design.obj.recommendedAction) {
      findingsRef.push({ file, line: 1, code: 'action-execution-ref-mismatch', level: 'error',
        msg: `ActionExecution.actionRef 与 ExperimentDesign.recommendedAction 不一致：${obj.actionRef} !== ${design.obj.recommendedAction}` });
    }
  }
}

async function checkOutcomeRecordBindings(results) {
  const OUTCOME_RECORD_CONTRACT  = 'docs/current/outcome-record-contract.md';
  const ACTION_EXECUTION_CONTRACT = 'docs/current/action-execution-contract.md';
  const EPISODE_CONTRACT          = 'docs/current/v7-world-model-contract.md';

  const VALID_STATUSES = new Set(['success', 'failure', 'partial', 'abandoned']);

  // 建立索引
  const orcMap = new Map(); // id → { file, obj, findingsRef }
  const axMap  = new Map(); // id → { file, obj, findingsRef }
  const epMap  = new Map(); // id → { file, obj, findingsRef }

  for (const r of results) {
    if (!r.fm || r.fm.$kind !== 'instance') continue;
    const obj = r.fm;
    const id  = obj.id;
    if (!id) continue;
    if (obj.$conforms_to === OUTCOME_RECORD_CONTRACT) {
      orcMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    } else if (obj.$conforms_to === ACTION_EXECUTION_CONTRACT) {
      axMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    } else if (obj.$conforms_to === EPISODE_CONTRACT) {
      epMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    }
  }

  for (const { file, obj, findingsRef } of orcMap.values()) {
    // OR-1：episodeId 必须可解析
    if (!obj.episodeId || !epMap.has(obj.episodeId)) {
      findingsRef.push({ file, line: 1, code: 'bad-outcome-record-episode-ref', level: 'error',
        msg: `OutcomeRecord.episodeId 无法在 Episode 索引中解析：${obj.episodeId}` });
    }

    // OR-2：causedByActionExecutionId 如存在，必须可解析
    if (obj.causedByActionExecutionId && !axMap.has(obj.causedByActionExecutionId)) {
      findingsRef.push({ file, line: 1, code: 'bad-outcome-record-action-ref', level: 'error',
        msg: `OutcomeRecord.causedByActionExecutionId 无法在 ActionExecution 索引中解析：${obj.causedByActionExecutionId}` });
    }

    // OR-3：status 必须是合法枚举值
    if (!VALID_STATUSES.has(obj.status)) {
      findingsRef.push({ file, line: 1, code: 'bad-outcome-record-status', level: 'error',
        msg: `OutcomeRecord.status 非法枚举值：${obj.status}` });
    }

    // OR-4：summary 必须是非空字符串
    if (!obj.summary || typeof obj.summary !== 'string' || obj.summary.trim() === '') {
      findingsRef.push({ file, line: 1, code: 'empty-outcome-record-summary', level: 'error',
        msg: `OutcomeRecord.summary 为空或缺失` });
    }
  }
}

async function checkPredictionErrorBindings(results) {
  const PREDICTION_ERROR_CONTRACT    = 'docs/current/prediction-error-contract.md';
  const ACTION_EXECUTION_CONTRACT    = 'docs/current/action-execution-contract.md';
  const OUTCOME_RECORD_CONTRACT      = 'docs/current/outcome-record-contract.md';
  const COUNTERFACTUAL_CONTRACT      = 'docs/current/counterfactual-scenario-contract.md';

  // 建立索引
  const peMap  = new Map(); // id → { file, obj, findingsRef }
  const axMap  = new Map();
  const orcMap = new Map();
  const cfMap  = new Map();

  for (const r of results) {
    if (!r.fm || r.fm.$kind !== 'instance') continue;
    const obj = r.fm;
    const id  = obj.id;
    if (!id) continue;
    if (obj.$conforms_to === PREDICTION_ERROR_CONTRACT) {
      peMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    } else if (obj.$conforms_to === ACTION_EXECUTION_CONTRACT) {
      axMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    } else if (obj.$conforms_to === OUTCOME_RECORD_CONTRACT) {
      orcMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    } else if (obj.$conforms_to === COUNTERFACTUAL_CONTRACT) {
      cfMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    }
  }

  for (const { file, obj, findingsRef } of peMap.values()) {
    // PE-1：causedByActionExecutionId 必须可解析
    if (!obj.causedByActionExecutionId || !axMap.has(obj.causedByActionExecutionId)) {
      findingsRef.push({ file, line: 1, code: 'bad-prediction-error-action-ref', level: 'error',
        msg: `PredictionError.causedByActionExecutionId 无法在 ActionExecution 索引中解析：${obj.causedByActionExecutionId}` });
    }

    // PE-2：outcomeRecordId 必须可解析
    if (!obj.outcomeRecordId || !orcMap.has(obj.outcomeRecordId)) {
      findingsRef.push({ file, line: 1, code: 'bad-prediction-error-outcome-ref', level: 'error',
        msg: `PredictionError.outcomeRecordId 无法在 OutcomeRecord 索引中解析：${obj.outcomeRecordId}` });
    }

    // PE-3：basedOnCounterfactualId 如存在，必须可解析
    if (obj.basedOnCounterfactualId && !cfMap.has(obj.basedOnCounterfactualId)) {
      findingsRef.push({ file, line: 1, code: 'bad-prediction-error-counterfactual-ref', level: 'error',
        msg: `PredictionError.basedOnCounterfactualId 无法在 CounterfactualScenario 索引中解析：${obj.basedOnCounterfactualId}` });
    }

    // PE-4：expectedSummary / actualSummary / deltaSummary 必须都是非空字符串
    const summaryEmpty =
      !obj.expectedSummary || typeof obj.expectedSummary !== 'string' || obj.expectedSummary.trim() === '' ||
      !obj.actualSummary   || typeof obj.actualSummary   !== 'string' || obj.actualSummary.trim()   === '' ||
      !obj.deltaSummary    || typeof obj.deltaSummary    !== 'string' || obj.deltaSummary.trim()    === '';
    if (summaryEmpty) {
      findingsRef.push({ file, line: 1, code: 'empty-prediction-error-summary', level: 'error',
        msg: `PredictionError.expectedSummary / actualSummary / deltaSummary 中至少一项为空` });
    }
  }
}

async function checkStateSnapshotBindings(results) {
  const STATE_SNAPSHOT_CONTRACT = 'docs/current/state-snapshot-contract.md';
  const EPISODE_CONTRACT        = 'docs/current/v7-world-model-contract.md';

  const ssMap = new Map();
  const epMap = new Map();

  for (const r of results) {
    if (!r.fm || r.fm.$kind !== 'instance') continue;
    const obj = r.fm;
    const id  = obj.id;
    if (!id) continue;
    if (obj.$conforms_to === STATE_SNAPSHOT_CONTRACT) {
      ssMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    } else if (obj.$conforms_to === EPISODE_CONTRACT) {
      epMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    }
  }

  for (const { file, obj, findingsRef } of ssMap.values()) {
    // SS-1：episodeId 必须在 Episode 索引中存在
    if (!obj.episodeId || !epMap.has(obj.episodeId)) {
      findingsRef.push({ file, line: 1, code: 'bad-state-snapshot-episode-ref', level: 'error',
        msg: `StateSnapshot.episodeId 无法在 Episode 索引中解析：${obj.episodeId}` });
    }

    // SS-2：values 必须存在且不可为 null
    if (obj.values === null || obj.values === undefined) {
      findingsRef.push({ file, line: 1, code: 'empty-state-snapshot-values', level: 'error',
        msg: `StateSnapshot.values 不可为 null` });
    }
  }
}

async function checkTransitionBindings(results) {
  const TRANSITION_CONTRACT     = 'docs/current/transition-contract.md';
  const STATE_SNAPSHOT_CONTRACT = 'docs/current/state-snapshot-contract.md';
  const EPISODE_CONTRACT        = 'docs/current/v7-world-model-contract.md';
  const ACTION_EXECUTION_CONTRACT = 'docs/current/action-execution-contract.md';

  const trMap = new Map();
  const ssMap = new Map();
  const epMap = new Map();
  const axMap = new Map();

  for (const r of results) {
    if (!r.fm || r.fm.$kind !== 'instance') continue;
    const obj = r.fm;
    const id  = obj.id;
    if (!id) continue;
    if (obj.$conforms_to === TRANSITION_CONTRACT) {
      trMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    } else if (obj.$conforms_to === STATE_SNAPSHOT_CONTRACT) {
      ssMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    } else if (obj.$conforms_to === EPISODE_CONTRACT) {
      epMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    } else if (obj.$conforms_to === ACTION_EXECUTION_CONTRACT) {
      axMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    }
  }

  for (const { file, obj, findingsRef } of trMap.values()) {
    // TR-1：episodeId 必须在 Episode 索引中存在
    if (!obj.episodeId || !epMap.has(obj.episodeId)) {
      findingsRef.push({ file, line: 1, code: 'bad-transition-episode-ref', level: 'error',
        msg: `Transition.episodeId 无法在 Episode 索引中解析：${obj.episodeId}` });
    }

    // TR-2：fromSnapshotId / toSnapshotId 必须都能 resolve，且不得相同
    const fromOk = obj.fromSnapshotId && ssMap.has(obj.fromSnapshotId);
    const toOk   = obj.toSnapshotId   && ssMap.has(obj.toSnapshotId);
    if (!fromOk || !toOk) {
      findingsRef.push({ file, line: 1, code: 'bad-transition-snapshot-ref', level: 'error',
        msg: `Transition.fromSnapshotId 或 toSnapshotId 无法在 StateSnapshot 索引中解析：${obj.fromSnapshotId} / ${obj.toSnapshotId}` });
    }
    if (obj.fromSnapshotId && obj.fromSnapshotId === obj.toSnapshotId) {
      findingsRef.push({ file, line: 1, code: 'same-transition-endpoints', level: 'error',
        msg: `Transition.fromSnapshotId === toSnapshotId：${obj.fromSnapshotId}` });
    }

    // TR-3：causedByActionId 若存在，必须在 ActionExecution 索引中存在
    if (obj.causedByActionId && !axMap.has(obj.causedByActionId)) {
      findingsRef.push({ file, line: 1, code: 'bad-transition-action-ref', level: 'error',
        msg: `Transition.causedByActionId 无法在 ActionExecution 索引中解析：${obj.causedByActionId}` });
    }
  }
}

/** §19 MechanismClass binding pass：五条结构合法性与最小关联真值检查（在 checkTransitionBindings 之后调用）。
 *
 * 索引：
 *   mcMap ← conforms_to 含 'mechanism-class-contract'
 *   mpMap ← conforms_to 含 'mechanism-program-contract'
 */
async function checkMechanismClassBindings(results) {
  const MECHANISM_CLASS_CONTRACT   = 'docs/current/mechanism-class-contract.md';
  const MECHANISM_PROGRAM_CONTRACT = 'docs/current/mechanism-program-contract.md';

  const mcMap = new Map(); // MechanismClass: id → { file, obj, findingsRef }
  const mpMap = new Map(); // MechanismProgram: id → { file, obj, findingsRef }

  for (const r of results) {
    if (!r.fm || r.fm.$kind !== 'instance') continue;
    const obj = r.fm;
    const id  = obj.id;
    if (!id) continue;
    if (obj.$conforms_to === MECHANISM_CLASS_CONTRACT) {
      mcMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    } else if (obj.$conforms_to === MECHANISM_PROGRAM_CONTRACT) {
      mpMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    }
  }

  for (const { file, obj, findingsRef } of mcMap.values()) {
    // MC-1：id 格式必须符合 MC_<slug>_<hex4>
    if (!obj.id || !/^MC_[a-z0-9_]{1,32}_[0-9a-f]{4}$/.test(obj.id)) {
      findingsRef.push({ file, line: 1, code: 'bad-mechanism-class-id', level: 'error',
        msg: `MechanismClass.id 不符合 MC_<slug>_<hex4> 格式：${obj.id}` });
    }

    // MC-2：compilation_status=compiled 时 supporting_episode_ids.length >= 2
    if (obj.compilation_status === 'compiled') {
      const eps = Array.isArray(obj.supporting_episode_ids) ? obj.supporting_episode_ids : [];
      if (eps.length < 2) {
        findingsRef.push({ file, line: 1, code: 'compiled-mechanism-without-support', level: 'error',
          msg: `MechanismClass.compilation_status=compiled 但 supporting_episode_ids 数量不足（当前 ${eps.length}，需要 >= 2）` });
      }
    }

    // MC-3：observable_signatures 必须覆盖所有 phases[*].expected_observations
    if (Array.isArray(obj.phases) && Array.isArray(obj.observable_signatures)) {
      const sigSet = new Set(obj.observable_signatures);
      for (const phase of obj.phases) {
        const obs = Array.isArray(phase.expected_observations) ? phase.expected_observations : [];
        for (const o of obs) {
          if (!sigSet.has(o)) {
            findingsRef.push({ file, line: 1, code: 'mechanism-observation-signature-gap', level: 'error',
              msg: `MechanismClass.observable_signatures 缺少来自 phase "${phase.name}" 的观测特征 "${o}"` });
          }
        }
      }
    }

    // MC-4：intervention_points 中的每个名称必须存在于 phases[*].name
    if (Array.isArray(obj.phases) && Array.isArray(obj.intervention_points)) {
      const phaseNames = new Set(obj.phases.map(p => p.name));
      for (const point of obj.intervention_points) {
        if (!phaseNames.has(point)) {
          findingsRef.push({ file, line: 1, code: 'mechanism-intervention-point-missing', level: 'error',
            msg: `MechanismClass.intervention_points 中的 "${point}" 不对应任何 phase.name` });
        }
      }
    }

    // MC-5：mechanismProgramIds 中的每个 id 必须能 resolve 到 MechanismProgram
    if (Array.isArray(obj.mechanismProgramIds)) {
      for (const mpId of obj.mechanismProgramIds) {
        if (!mpMap.has(mpId)) {
          findingsRef.push({ file, line: 1, code: 'bad-mechanism-program-ref', level: 'error',
            msg: `MechanismClass.mechanismProgramIds 引用不存在：${mpId}` });
        }
      }
    }
  }
}

/** §20 ProgramRevisionProposal binding pass：四条跨文件绑定真值检查（在 checkMechanismClassBindings 之后调用）。
 *
 * 索引：
 *   prpMap ← conforms_to = 'docs/current/program-revision-proposal-contract.md'
 *   peMap  ← conforms_to = 'docs/current/prediction-error-contract.md'
 *   mpMap  ← conforms_to = 'docs/current/mechanism-program-contract.md'
 *   omMap  ← conforms_to = 'docs/current/observation-model-contract.md'
 */
async function checkProgramRevisionProposalBindings(results) {
  const PRP_CONTRACT = 'docs/current/program-revision-proposal-contract.md';
  const PE_CONTRACT  = 'docs/current/prediction-error-contract.md';
  const MP_CONTRACT  = 'docs/current/mechanism-program-contract.md';
  const OM_CONTRACT  = 'docs/current/observation-model-contract.md';

  const VALID_STATUSES = new Set(['proposed', 'accepted', 'rejected', 'superseded']);

  const prpMap = new Map();
  const peMap  = new Map();
  const mpMap  = new Map();
  const omMap  = new Map();

  for (const r of results) {
    if (!r.fm || r.fm.$kind !== 'instance') continue;
    const obj = r.fm;
    const id  = obj.id;
    if (!id) continue;
    if      (obj.$conforms_to === PRP_CONTRACT) prpMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    else if (obj.$conforms_to === PE_CONTRACT)  peMap.set(id,  { file: r.file, obj, findingsRef: r.findings });
    else if (obj.$conforms_to === MP_CONTRACT)  mpMap.set(id,  { file: r.file, obj, findingsRef: r.findings });
    else if (obj.$conforms_to === OM_CONTRACT)  omMap.set(id,  { file: r.file, obj, findingsRef: r.findings });
  }

  for (const { file, obj, findingsRef } of prpMap.values()) {
    // PRP-1：basedOnPredictionErrorIds 全部可解析
    if (!Array.isArray(obj.basedOnPredictionErrorIds) || obj.basedOnPredictionErrorIds.length < 1) {
      findingsRef.push({ file, line: 1, code: 'bad-prp-prediction-error-ref', level: 'error',
        msg: `ProgramRevisionProposal.basedOnPredictionErrorIds 缺失或为空` });
    } else {
      for (const peId of obj.basedOnPredictionErrorIds) {
        if (!peMap.has(peId)) {
          findingsRef.push({ file, line: 1, code: 'bad-prp-prediction-error-ref', level: 'error',
            msg: `ProgramRevisionProposal.basedOnPredictionErrorIds 引用不存在：${peId}` });
        }
      }
    }

    // PRP-2：targetRef 能按 targetKind resolve 到真实对象
    if (!obj.targetRef || String(obj.targetRef).trim() === '') {
      findingsRef.push({ file, line: 1, code: 'bad-prp-target-ref', level: 'error',
        msg: `ProgramRevisionProposal.targetRef 缺失` });
    } else if (obj.targetKind === 'mechanism_program' && !mpMap.has(obj.targetRef)) {
      findingsRef.push({ file, line: 1, code: 'bad-prp-target-ref', level: 'error',
        msg: `ProgramRevisionProposal.targetRef 指向 mechanism_program 但不存在：${obj.targetRef}` });
    } else if (obj.targetKind === 'observation_model' && !omMap.has(obj.targetRef)) {
      findingsRef.push({ file, line: 1, code: 'bad-prp-target-ref', level: 'error',
        msg: `ProgramRevisionProposal.targetRef 指向 observation_model 但不存在：${obj.targetRef}` });
    }

    // PRP-3：status 必须是合法值
    if (!obj.status || !VALID_STATUSES.has(obj.status)) {
      findingsRef.push({ file, line: 1, code: 'bad-prp-status', level: 'error',
        msg: `ProgramRevisionProposal.status 非法：${obj.status ?? '<missing>'}` });
    }

    // PRP-4：rationale 非空
    if (!obj.rationale || String(obj.rationale).trim() === '') {
      findingsRef.push({ file, line: 1, code: 'empty-prp-rationale', level: 'error',
        msg: `ProgramRevisionProposal.rationale 为空` });
    }
  }
}

/**
 * §21 SupportLink deep binding pass
 *
 * 索引：
 *   slMap ← conforms_to 含 'support-link-contract'          （standalone SL 文件）
 *   miMap ← conforms_to 含 'mechanism-instance-contract'
 *   dtMap ← conforms_to 含 'derivation-chain-contract'
 */
async function checkSupportLinkDeepBindings(results) {
  const VALID_POLARITY = new Set(['supports', 'contradicts']);

  const slMap = new Map();
  const miMap = new Map();
  const dtMap = new Map();

  for (const r of results) {
    if (!r.fm || r.fm.$kind !== 'instance') continue;
    const obj = r.fm;
    const id  = obj.id;
    if (!id) continue;
    const ct = String(obj.$conforms_to ?? '');
    if      (ct.includes('support-link-contract'))       slMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    else if (ct.includes('mechanism-instance-contract')) miMap.set(id, { file: r.file, obj, findingsRef: r.findings });
    else if (ct.includes('derivation-chain-contract'))   dtMap.set(id, { file: r.file, obj, findingsRef: r.findings });
  }

  // SL-1：polarity 合法性
  // SL-2：weight [0,1] 合法性
  for (const { file, obj, findingsRef } of slMap.values()) {
    if (!obj.polarity || !VALID_POLARITY.has(obj.polarity)) {
      findingsRef.push({ file, line: 1, code: 'bad-support-link-polarity', level: 'error',
        msg: `SupportLink.polarity 非法：${obj.polarity ?? '<missing>'}` });
    }
    const w = obj.weight;
    if (w === null || w === undefined || typeof w !== 'number' || w < 0 || w > 1) {
      findingsRef.push({ file, line: 1, code: 'bad-support-link-weight', level: 'error',
        msg: `SupportLink.weight 非法：${w ?? '<missing>'}（必须为 [0,1] 区间数值）` });
    }
  }

  // SL-3：MechanismInstance.support_link_refs 全部可解析
  for (const { file, obj, findingsRef } of miMap.values()) {
    const refs = obj.support_link_refs;
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      if (!slMap.has(ref)) {
        findingsRef.push({ file, line: 1, code: 'bad-mechanism-instance-support-link-ref', level: 'error',
          msg: `MechanismInstance.support_link_refs 引用不存在：${ref}` });
      }
    }
  }

  // SL-4：DerivationTrace.supportLinks 内嵌对象 id 必须在 slMap
  for (const { file, obj, findingsRef } of dtMap.values()) {
    const links = obj.supportLinks;
    if (!Array.isArray(links)) continue;
    for (const link of links) {
      if (!link || typeof link !== 'object') {
        findingsRef.push({ file, line: 1, code: 'bad-derivation-trace-support-link', level: 'error',
          msg: `DerivationTrace.supportLinks 包含非对象元素` });
        continue;
      }
      if (!link.id || !slMap.has(link.id)) {
        findingsRef.push({ file, line: 1, code: 'bad-derivation-trace-support-link', level: 'error',
          msg: `DerivationTrace.supportLinks 内嵌元素 id 不在 SupportLink 索引：${link.id ?? '<missing>'}` });
      }
    }
  }
}

async function main() {
  const targets = await collectTargets();
  const results = [];
  for (const t of targets) {
    try { results.push(await auditFile(t.abs, t.format)); }
    catch (e) {
      const rel = path.relative(ROOT, t.abs).replace(/\\/g, '/');
      results.push({ file: rel, format: t.format, kind: null, legacyKind: null, describes: null, density: null, status: null, fm: {}, findings: [{ file: rel, line: 1, code: 'audit-exception', level: 'error', msg: e.message }] });
    }
  }

  checkDuplicateTruth(results);
  await checkV7Bindings(results);
  await checkObservationModelBindings(results);
  await checkCounterfactualBindings(results);
  await checkExperimentDesignBindings(results);
  await checkActionExecutionBindings(results);
  await checkOutcomeRecordBindings(results);
  await checkPredictionErrorBindings(results);
  await checkStateSnapshotBindings(results);
  await checkTransitionBindings(results);
  await checkMechanismClassBindings(results);
  await checkProgramRevisionProposalBindings(results);
  await checkSupportLinkDeepBindings(results);

  // kind 分布
  const kindDist = { contract: 0, instance: 0, record: 0, code: 0, index: 0, legacy_I: 0, legacy_II: 0, missing: 0 };
  for (const r of results) {
    if (r.legacyKind === 'I') kindDist.legacy_I++;
    else if (r.legacyKind === 'II') kindDist.legacy_II++;
    else if (r.kind && NEW_KIND.has(r.kind)) kindDist[r.kind]++;
    else kindDist.missing++;
  }

  // binding errors 聚合
  const bindingErrors = {
    missing_conforms_to: [], bad_conforms_to_target: [],
    missing_generated_by: [], bad_generated_by_target: [],
    missing_generated_at: [], bad_generated_at: [],
    missing_event: [], missing_recorded_at: [], bad_recorded_at: [],
    missing_immutable: [], record_mutated: [],
    missing_implements: [], bad_implements_target: [], implements_wrong_kind: [],
    missing_schema_version: [],
    // v7 binding pass（§10）
    bad_mechanism_instance_ref: [],
    bad_ontology_delta_ref: [],
    trace_reconstruction_mismatch: [],
    missing_no_update_reason: [],
    accepted_instance_without_support: [],
    // ObservationModel binding pass（§11）
    bad_observation_model_ref: [],
    supportlink_observation_chain_broken: [],
    orphan_current_observation_model: [],
    // Counterfactual binding pass（§12）
    bad_counterfactual_episode_ref: [],
    bad_counterfactual_reconstruction_ref: [],
    bad_counterfactual_program_ref: [],
    empty_counterfactual_assumptions: [],
    // ExperimentDesign binding pass（§13）
    bad_experiment_design_episode_ref: [],
    bad_experiment_design_counterfactual_ref: [],
    recommended_action_outside_candidates: [],
    // ActionExecution binding pass（§14）
    bad_action_execution_design_ref: [],
    bad_action_execution_source_episode_ref: [],
    bad_action_execution_target_episode_ref: [],
    action_execution_ref_mismatch: [],
    // OutcomeRecord binding pass（§15）
    bad_outcome_record_episode_ref: [],
    bad_outcome_record_action_ref: [],
    bad_outcome_record_status: [],
    empty_outcome_record_summary: [],
    // PredictionError binding pass（§16）
    bad_prediction_error_action_ref: [],
    bad_prediction_error_outcome_ref: [],
    bad_prediction_error_counterfactual_ref: [],
    empty_prediction_error_summary: [],
    // StateSnapshot binding pass（§17）
    bad_state_snapshot_episode_ref: [],
    empty_state_snapshot_values: [],
    // Transition binding pass（§18）
    bad_transition_episode_ref: [],
    bad_transition_snapshot_ref: [],
    same_transition_endpoints: [],
    bad_transition_action_ref: [],
    // MechanismClass binding pass（§19）
    bad_mechanism_class_id: [],
    compiled_mechanism_without_support: [],
    mechanism_observation_signature_gap: [],
    mechanism_intervention_point_missing: [],
    bad_mechanism_program_ref: [],
    // ProgramRevisionProposal binding pass（§20）
    bad_prp_prediction_error_ref: [],
    bad_prp_target_ref: [],
    bad_prp_status: [],
    empty_prp_rationale: [],
    // SupportLink deep binding pass（§21）
    bad_support_link_polarity: [],
    bad_support_link_weight: [],
    bad_mechanism_instance_support_link_ref: [],
    bad_derivation_trace_support_link: [],
  };
  const codeToBucket = {
    'missing-conforms-to': 'missing_conforms_to',
    'bad-conforms-to-target': 'bad_conforms_to_target',
    'missing-generated-by': 'missing_generated_by',
    'bad-generated-by-target': 'bad_generated_by_target',
    'missing-generated-at': 'missing_generated_at',
    'bad-generated-at': 'bad_generated_at',
    'missing-event': 'missing_event',
    'missing-recorded-at': 'missing_recorded_at',
    'bad-recorded-at': 'bad_recorded_at',
    'missing-immutable': 'missing_immutable',
    'record-mutated': 'record_mutated',
    'missing-implements': 'missing_implements',
    'bad-implements-target': 'bad_implements_target',
    'implements-wrong-kind': 'implements_wrong_kind',
    'missing-schema-version': 'missing_schema_version',
    // v7 binding pass（§10）
    'bad-mechanism-instance-ref':       'bad_mechanism_instance_ref',
    'bad-ontology-delta-ref':           'bad_ontology_delta_ref',
    'trace-reconstruction-mismatch':    'trace_reconstruction_mismatch',
    'missing-no-update-reason':         'missing_no_update_reason',
    'accepted-instance-without-support': 'accepted_instance_without_support',
    // ObservationModel binding pass（§11）
    'bad-observation-model-ref':                'bad_observation_model_ref',
    'supportlink-observation-chain-broken':     'supportlink_observation_chain_broken',
    'orphan-current-observation-model':         'orphan_current_observation_model',
    // Counterfactual binding pass（§12）
    'bad-counterfactual-episode-ref':           'bad_counterfactual_episode_ref',
    'bad-counterfactual-reconstruction-ref':    'bad_counterfactual_reconstruction_ref',
    'bad-counterfactual-program-ref':           'bad_counterfactual_program_ref',
    'empty-counterfactual-assumptions':         'empty_counterfactual_assumptions',
    // ExperimentDesign binding pass（§13）
    'bad-experiment-design-episode-ref':        'bad_experiment_design_episode_ref',
    'bad-experiment-design-counterfactual-ref': 'bad_experiment_design_counterfactual_ref',
    'recommended-action-outside-candidates':    'recommended_action_outside_candidates',
    // ActionExecution binding pass（§14）
    'bad-action-execution-design-ref':          'bad_action_execution_design_ref',
    'bad-action-execution-source-episode-ref':  'bad_action_execution_source_episode_ref',
    'bad-action-execution-target-episode-ref':  'bad_action_execution_target_episode_ref',
    'action-execution-ref-mismatch':            'action_execution_ref_mismatch',
    // OutcomeRecord binding pass（§15）
    'bad-outcome-record-episode-ref':   'bad_outcome_record_episode_ref',
    'bad-outcome-record-action-ref':    'bad_outcome_record_action_ref',
    'bad-outcome-record-status':        'bad_outcome_record_status',
    'empty-outcome-record-summary':     'empty_outcome_record_summary',
    // PredictionError binding pass（§16）
    'bad-prediction-error-action-ref':          'bad_prediction_error_action_ref',
    'bad-prediction-error-outcome-ref':         'bad_prediction_error_outcome_ref',
    'bad-prediction-error-counterfactual-ref':  'bad_prediction_error_counterfactual_ref',
    'empty-prediction-error-summary':           'empty_prediction_error_summary',
    // StateSnapshot binding pass（§17）
    'bad-state-snapshot-episode-ref':           'bad_state_snapshot_episode_ref',
    'empty-state-snapshot-values':              'empty_state_snapshot_values',
    // Transition binding pass（§18）
    'bad-transition-episode-ref':               'bad_transition_episode_ref',
    'bad-transition-snapshot-ref':              'bad_transition_snapshot_ref',
    'same-transition-endpoints':                'same_transition_endpoints',
    'bad-transition-action-ref':                'bad_transition_action_ref',
    // MechanismClass binding pass（§19）
    'bad-mechanism-class-id':                   'bad_mechanism_class_id',
    'compiled-mechanism-without-support':       'compiled_mechanism_without_support',
    'mechanism-observation-signature-gap':      'mechanism_observation_signature_gap',
    'mechanism-intervention-point-missing':     'mechanism_intervention_point_missing',
    'bad-mechanism-program-ref':                'bad_mechanism_program_ref',
    // ProgramRevisionProposal binding pass（§20）
    'bad-prp-prediction-error-ref':  'bad_prp_prediction_error_ref',
    'bad-prp-target-ref':            'bad_prp_target_ref',
    'bad-prp-status':                'bad_prp_status',
    'empty-prp-rationale':           'empty_prp_rationale',
    // SupportLink deep binding pass（§21）
    'bad-support-link-polarity':                  'bad_support_link_polarity',
    'bad-support-link-weight':                    'bad_support_link_weight',
    'bad-mechanism-instance-support-link-ref':    'bad_mechanism_instance_support_link_ref',
    'bad-derivation-trace-support-link':          'bad_derivation_trace_support_link',
  };
  for (const r of results) {
    for (const f of r.findings) {
      const b = codeToBucket[f.code];
      if (b && !bindingErrors[b].includes(r.file)) bindingErrors[b].push(r.file);
    }
  }

  const densityDistribution = results
    .filter(r => typeof r.density === 'number')
    .map(r => ({ file: r.file, kind: r.kind, density: Number(r.density.toFixed(4)) }));

  const errors = [], warnings = [];
  let ok = 0, warn = 0, err = 0;
  for (const r of results) {
    const e = r.findings.filter(x => x.level === 'error');
    const w = r.findings.filter(x => x.level === 'warning');
    errors.push(...e); warnings.push(...w);
    if (e.length) err++; else if (w.length) warn++; else ok++;
  }

  const bar = '─'.repeat(72);
  console.log(bar);
  console.log(`契约真值审计报告（五类 MECE）  (${new Date().toISOString()})`);
  console.log(bar);
  console.log(`扫描文件：${results.length}  ✅ ${ok}  ⚠️  ${warn}  ❌ ${err}`);
  console.log('Kind distribution:');
  console.log(`  contract=${kindDist.contract}  instance=${kindDist.instance}  record=${kindDist.record}  code=${kindDist.code}  index=${kindDist.index}`);
  console.log(`  legacy_I=${kindDist.legacy_I}  legacy_II=${kindDist.legacy_II}  missing=${kindDist.missing}\n`);

  for (const r of results.sort((a, b) => a.file.localeCompare(b.file))) {
    const e = r.findings.filter(x => x.level === 'error').length;
    const w = r.findings.filter(x => x.level === 'warning').length;
    const icon = e ? '❌' : (w ? '⚠️ ' : '✅');
    const kindTag = r.kind ? `kind=${r.kind}` : (r.legacyKind ? `kind=${r.legacyKind}(legacy)` : 'kind=?');
    const densTag = typeof r.density === 'number' && r.density > 0 ? ` density=${(r.density * 100).toFixed(0)}%` : '';
    const statusTag = r.status ? ` [${r.status}]` : '';
    console.log(`${icon} ${r.file}${statusTag} ${kindTag}${densTag}  errors=${e} warnings=${w}`);
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
      files_scanned: results.length,
      errors, warnings,
      summary: { ok, warn, err },
      kind_distribution: kindDist,
      binding_errors: bindingErrors,
      density_distribution: densityDistribution,
      results: results.map(r => ({
        file: r.file, format: r.format,
        status: r.status ?? null,
        kind: r.kind ?? null,
        legacy_kind: r.legacyKind ?? null,
        describes: r.describes ?? null,
        density: typeof r.density === 'number' ? Number(r.density.toFixed(4)) : null,
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

export { checkV7Bindings, checkObservationModelBindings, checkCounterfactualBindings, checkExperimentDesignBindings, checkActionExecutionBindings, checkOutcomeRecordBindings, checkPredictionErrorBindings, checkStateSnapshotBindings, checkTransitionBindings, checkMechanismClassBindings, checkProgramRevisionProposalBindings, checkSupportLinkDeepBindings };

const _IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (_IS_MAIN) {
  main().catch(err => {
    console.error('[contract-audit] 未捕获异常：', err);
    process.exit(2);
  });
}
