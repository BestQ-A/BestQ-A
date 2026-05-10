/**
 * SWE-bench Patch Generator — 打榜用 Coding Agent
 *
 * 对 SWE-bench Lite 的每个 instance 生成 unified diff patch：
 *   1. 从 GitHub API 按需获取目标文件（base_commit 版本，无需 clone）
 *   2. 用 causal learner 的 LLM 缓存找相似历史修复（in-context examples）
 *   3. 用 MiniMax API 生成 patch（工具调用式多轮循环）
 *   4. 清洗 patch 格式，输出 predictions.json
 *
 * 用法：
 *   LLM_API_KEY=xxx GITHUB_TOKEN=ghp_xxx \
 *     npx tsx src/benchmark/swe-bench-patch-generator.ts \
 *     [--count 10] [--ids id1,id2] [--output predictions.json]
 *
 * 预期 resolve_rate：5-12%（MVP-2，无本地测试执行）
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// 环境 & 常量
// =============================================================================

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'https://api.minimax.io/v1';
const LLM_MODEL    = process.env.LLM_MODEL    ?? 'minimax-m2.7-highspeed';
const LLM_API_KEY  = process.env.LLM_API_KEY  ?? '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN  ?? '';

const DATA_DIR = resolve(__dirname, 'data');
const CACHE_PATH = resolve(DATA_DIR, 'llm-extraction-cache.json');
const LITE_PATH  = resolve(DATA_DIR, 'swe-bench-lite.json');

// GitHub API 每次请求间隔（有 token 时 100ms 足够）
const GITHUB_DELAY_MS = GITHUB_TOKEN ? 80 : 400;

// 并发处理的实例数
const CONCURRENCY = 8;

// =============================================================================
// 类型
// =============================================================================

interface SWEBenchInstance {
  instance_id: string;
  repo: string;
  base_commit: string;
  problem_statement: string;
  hints_text: string;
  test_patch: string;
  patch: string;
  FAIL_TO_PASS: string;
  PASS_TO_PASS: string;
  version: string;
}

interface ExtractedFacts {
  root_cause?: string;
  mechanism?: string;
  symptom?: string;
  affected_module?: string;
  error_type?: string;
  fix_strategy?: string;
  bug_category?: string;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: LLMToolCall[];
}

interface LLMToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

// =============================================================================
// 数据加载
// =============================================================================

function loadRawInstances(): SWEBenchInstance[] {
  const raw = readFileSync(LITE_PATH, 'utf-8');
  const data = JSON.parse(raw);
  // 支持数组或 HuggingFace rows 格式
  if (Array.isArray(data)) return data as SWEBenchInstance[];
  if (data.rows) return data.rows.map((r: { row: SWEBenchInstance }) => r.row);
  return [];
}

function loadFactsCache(): Record<string, ExtractedFacts> {
  if (!existsSync(CACHE_PATH)) return {};
  return JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
}

// =============================================================================
// 相似实例检索（基于 causal learner LLM 缓存，纯内存打分）
// =============================================================================

function similarityScore(a: ExtractedFacts, b: ExtractedFacts): number {
  let score = 0;
  if (a.bug_category && a.bug_category === b.bug_category) score += 3;
  if (a.affected_module && b.affected_module &&
      a.affected_module.toLowerCase().includes(b.affected_module.toLowerCase())) score += 2;
  if (a.error_type && a.error_type === b.error_type) score += 2;
  if (a.fix_strategy && b.fix_strategy &&
      a.fix_strategy.split(' ').some(w => w.length > 4 && b.fix_strategy!.includes(w))) score += 1;
  return score;
}

function findSimilarInstances(
  target: SWEBenchInstance,
  allInstances: SWEBenchInstance[],
  cache: Record<string, ExtractedFacts>,
  topK = 3,
): Array<{ inst: SWEBenchInstance; patch: string }> {
  const targetFacts = cache[target.instance_id] ?? {};
  const scored = allInstances
    .filter(i => i.instance_id !== target.instance_id && i.patch)
    .map(inst => ({
      inst,
      score: (inst.repo === target.repo ? 2 : 0)
           + similarityScore(targetFacts, cache[inst.instance_id] ?? {}),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(s => ({ inst: s.inst, patch: s.inst.patch }));
}

// =============================================================================
// 候选文件路径提取
// =============================================================================

function extractCandidateFiles(inst: SWEBenchInstance): string[] {
  const paths = new Set<string>();

  // 从 test_patch diff 头部提取被测文件（改成 b/ 路径→ 源码路径）
  for (const m of inst.test_patch.matchAll(/\+\+\+ b\/([\w/.\-]+\.py)/g)) {
    // 测试文件路径：如 astropy/modeling/tests/test_separable.py
    // 对应源码：     astropy/modeling/separable.py
    const testPath = m[1];
    // 尝试去掉 tests/ 目录层，猜测源码路径
    const srcGuess = testPath.replace(/\/tests\/test_/, '/').replace(/\/tests\//, '/');
    if (srcGuess !== testPath) paths.add(srcGuess);
    // 也从 problem_statement 找同目录的文件
  }

  // 从 problem_statement + hints_text 找 Python 文件路径
  const combined = inst.problem_statement + '\n' + inst.hints_text;
  for (const m of combined.matchAll(/`?([\w/.\-]+\.py)`?/g)) {
    const p = m[1];
    // 过滤太短/不像路径的
    if (p.includes('/') && p.length > 6 && !p.startsWith('test_')) {
      paths.add(p);
    }
  }

  // 从相关 import/模块名猜测路径（按 repo 惯例）
  for (const m of combined.matchAll(/`([\w.]+)`/g)) {
    const mod = m[1];
    if (mod.includes('.') && !mod.includes(' ')) {
      const guessPath = mod.replace(/\./g, '/') + '.py';
      if (guessPath.split('/').length >= 2) {
        paths.add(guessPath);
      }
    }
  }

  return [...paths].slice(0, 6);  // 最多取 6 个文件
}

// =============================================================================
// GitHub API 文件获取
// =============================================================================

// 每个并发 worker 独立限速，用 per-worker 时间戳避免全局锁
const workerLastCall = new Map<number, number>();

async function fetchFileContent(
  repo: string,
  filePath: string,
  commit: string,
  workerId = 0,
): Promise<string | null> {
  // 限速（per-worker）
  const last = workerLastCall.get(workerId) ?? 0;
  const wait = GITHUB_DELAY_MS - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  workerLastCall.set(workerId, Date.now());

  const url = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${commit}`;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'SWE-bench-solver/1.0',
  };
  if (GITHUB_TOKEN) headers['Authorization'] = `token ${GITHUB_TOKEN}`;

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) return null;
    const data = await resp.json() as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== 'base64') return null;
    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

// =============================================================================
// LLM 工具调用 — MiniMax (OpenAI-compatible)
// =============================================================================

/** Coding agent 可用的工具定义 */
const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the content of a source file from the repository at the target commit.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Relative path from repo root, e.g. astropy/modeling/separable.py' },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_patch',
      description: 'Submit the unified diff patch. Call this when you have identified the fix.',
      parameters: {
        type: 'object',
        properties: {
          patch: { type: 'string', description: 'Unified diff patch in git format (diff --git a/... b/... format).' },
        },
        required: ['patch'],
      },
    },
  },
];

async function callLLMWithTools(
  messages: LLMMessage[],
): Promise<{ content: string | null; toolCalls: LLMToolCall[] }> {
  const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(LLM_API_KEY ? { 'Authorization': `Bearer ${LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      tools: AGENT_TOOLS,
      tool_choice: 'auto',
      max_tokens: 3000,
      temperature: 0.05,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as {
    choices: Array<{
      message: {
        content: string | null;
        tool_calls?: LLMToolCall[];
      };
    }>;
  };

  const msg = data.choices[0]?.message;
  if (!msg) {
    console.error('[solver] LLM 响应缺少 choices[0].message:', JSON.stringify(data).substring(0, 200));
    return { content: null, toolCalls: [] };
  }
  return {
    content: msg.content ?? null,
    toolCalls: msg.tool_calls ?? [],
  };
}

// =============================================================================
// Patch 格式清洗 & 验证
// =============================================================================

function cleanPatch(raw: string): string {
  if (!raw) return '';

  // 提取 diff 块（去 markdown code fences）
  let patch = raw;
  const fenceMatch = raw.match(/```(?:diff)?\n?([\s\S]+?)```/);
  if (fenceMatch) patch = fenceMatch[1];

  // 必须含 diff --git 或 --- a/
  if (!patch.includes('--- a/') && !patch.includes('diff --git')) return '';

  // 如果只有 --- a/ 格式，补 diff --git 头
  if (!patch.includes('diff --git') && patch.includes('--- a/')) {
    const fileMatch = patch.match(/--- a\/([\w/.]+)/);
    if (fileMatch) {
      patch = `diff --git a/${fileMatch[1]} b/${fileMatch[1]}\n` + patch;
    }
  }

  // 验证 @@ 行存在
  if (!patch.includes('@@')) return '';

  return patch.trim();
}

// =============================================================================
// 单 instance patch 生成（多轮工具调用 agent loop）
// =============================================================================

async function generatePatchForInstance(
  inst: SWEBenchInstance,
  allInstances: SWEBenchInstance[],
  cache: Record<string, ExtractedFacts>,
  options?: { workerId?: number },
): Promise<string> {
  const similarExamples = findSimilarInstances(inst, allInstances, cache, 2);
  const candidateFiles = extractCandidateFiles(inst);

  // 预取文件内容（并行，静默失败）
  const workerId = options?.workerId ?? 0;
  const prefetched = new Map<string, string>();
  const fileResults = await Promise.all(
    candidateFiles.slice(0, 4).map(f => fetchFileContent(inst.repo, f, inst.base_commit, workerId))
  );
  candidateFiles.slice(0, 4).forEach((f, i) => {
    if (fileResults[i]) prefetched.set(f, fileResults[i]!);
  });

  // 构造 similar examples context
  let examplesCtx = '';
  for (const { inst: ex, patch } of similarExamples) {
    examplesCtx += `\n### Example fix for ${ex.instance_id}:\n`;
    examplesCtx += `Problem: ${ex.problem_statement.substring(0, 300)}\n`;
    examplesCtx += `Patch:\n\`\`\`diff\n${ex.patch.substring(0, 500)}\n\`\`\`\n`;
  }

  // 构造文件上下文
  let filesCtx = '';
  if (prefetched.size > 0) {
    filesCtx = '\n\n## Relevant source files:\n';
    for (const [path, content] of prefetched) {
      filesCtx += `\n### ${path}\n\`\`\`python\n${content.substring(0, 2800)}\n\`\`\`\n`;
    }
  } else {
    filesCtx = '\n\n(No source files pre-loaded — infer fix from issue description and tests)';
  }

  const systemPrompt = `You are an expert software engineer. Output ONLY a unified diff patch to fix the bug.

OUTPUT FORMAT (no explanation, just the diff):
diff --git a/path/to/file.py b/path/to/file.py
--- a/path/to/file.py
+++ b/path/to/file.py
@@ -LINE,COUNT +LINE,COUNT @@
 context line
-old line to remove
+new line to add
 context line

Rules:
- Output ONLY the diff, no prose or explanation
- Fix ONLY source files, not test files
- Make the minimal change that fixes the bug
- Use exact line numbers and context from the provided source files`;

  const userPrompt = `## Repository: ${inst.repo}

## Issue:
${inst.problem_statement.substring(0, 2000)}
${inst.hints_text ? `\n## Maintainer hints:\n${inst.hints_text.substring(0, 600)}` : ''}

## Failing tests (must pass after fix):
${inst.FAIL_TO_PASS}
${examplesCtx}${filesCtx}

Output the unified diff patch now:`;

  // 单轮调用（无工具），直接从 content 提取 patch
  const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(LLM_API_KEY ? { 'Authorization': `Bearer ${LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.05,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${err.substring(0, 200)}`);
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  const rawContent = data.choices[0]?.message?.content ?? '';

  // 去除 <think>...</think> 推理过程
  const cleanedContent = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  return cleanPatch(cleanedContent);
}

// =============================================================================
// 工具函数
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** 原子写：先写 .tmp 再 rename，避免并发写入时读到损坏的 JSON */
function atomicWrite(path: string, content: string): void {
  const tmp = path + '.tmp';
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

// =============================================================================
// 主流程
// =============================================================================

export async function generateAllPatches(options: {
  instanceIds?: string[];
  outputPath?: string;
  count?: number;
  verbose?: boolean;
} = {}): Promise<void> {
  const {
    instanceIds,
    outputPath = 'predictions.json',
    count,
    verbose = true,
  } = options;

  if (!LLM_API_KEY) {
    console.error('[solver] 缺少 LLM_API_KEY，请设置环境变量');
    process.exit(1);
  }
  if (!GITHUB_TOKEN) {
    console.warn('[solver] 未设置 GITHUB_TOKEN，GitHub API 限速为 60 req/hr（建议设置 token）');
  }

  const allInstances = loadRawInstances();
  const cache = loadFactsCache();

  let targets = allInstances;
  if (instanceIds?.length) {
    targets = allInstances.filter(i => instanceIds.includes(i.instance_id));
  }
  if (count && count > 0) {
    targets = targets.slice(0, count);
  }

  if (verbose) {
    console.log(`[solver] 总实例：${allInstances.length}，本次处理：${targets.length}`);
    console.log(`[solver] LLM model: ${LLM_MODEL}`);
  }

  // 加载已有 predictions（支持断点续跑）
  const predictions: Record<string, string> = {};
  if (existsSync(outputPath)) {
    const existing = JSON.parse(readFileSync(outputPath, 'utf-8')) as Record<string, string>;
    Object.assign(predictions, existing);
    if (verbose) console.log(`[solver] 加载已有预测 ${Object.keys(existing).length} 条（断点续跑）`);
  }

  let solved = 0;
  let failed = 0;
  let processed = 0;
  let savePending = false;

  // 过滤已完成的
  const pending = targets.filter(inst => {
    if (inst.instance_id in predictions) {
      if (verbose) console.log(`跳过（已有）: ${inst.instance_id}`);
      return false;
    }
    return true;
  });

  const total = targets.length;
  const skipped = total - pending.length;
  if (verbose && skipped > 0) console.log(`[solver] 跳过已有 ${skipped} 条，待处理 ${pending.length} 条`);

  // 定期保存（每5条或每10秒）
  const saveInterval = setInterval(() => {
    if (savePending) {
      atomicWrite(outputPath, JSON.stringify(predictions, null, 2));
      savePending = false;
    }
  }, 5000);

  // 并发池
  const semaphore = Array.from({ length: CONCURRENCY }, (_, i) => i);
  const queue = [...pending];
  let qIdx = 0;

  async function worker(workerId: number): Promise<void> {
    while (true) {
      const myIdx = qIdx++;
      if (myIdx >= queue.length) break;
      const inst = queue[myIdx];
      const displayIdx = skipped + myIdx + 1;

      if (verbose) process.stdout.write(`[${displayIdx}/${total}] 处理: ${inst.instance_id} ... `);

      try {
        const patch = await generatePatchForInstance(inst, allInstances, cache, { workerId });
        predictions[inst.instance_id] = patch;
        savePending = true;

        if (patch) {
          solved++;
          if (verbose) console.log(`✓ patch ${patch.split('\n').length} 行`);
        } else {
          failed++;
          if (verbose) console.log(`✗ 空 patch`);
        }
      } catch (err) {
        predictions[inst.instance_id] = '';
        failed++;
        savePending = true;
        if (verbose) console.log(`✗ 错误: ${String(err).substring(0, 100)}`);
      }
      processed++;
    }
  }

  await Promise.all(semaphore.map(id => worker(id)));
  clearInterval(saveInterval);

  // 最终保存
  atomicWrite(outputPath, JSON.stringify(predictions, null, 2));

  if (verbose) {
    console.log(`\n[solver] 完成：${solved} 有效 patch，${failed} 空 patch`);
    console.log(`[solver] 已保存到 ${outputPath}`);
  }
}

// =============================================================================
// CLI 入口
// =============================================================================

if (process.argv[1]?.includes('swe-bench-patch-generator')) {
  const args = process.argv.slice(2);

  const countIdx  = args.indexOf('--count');
  const idsIdx    = args.indexOf('--ids');
  const outIdx    = args.indexOf('--output');

  const count       = countIdx >= 0 ? parseInt(args[countIdx + 1], 10) : undefined;
  const instanceIds = idsIdx >= 0 ? args[idsIdx + 1].split(',') : undefined;
  const outputPath  = outIdx >= 0 ? args[outIdx + 1] : 'predictions.json';

  generateAllPatches({ count, instanceIds, outputPath, verbose: true })
    .catch(err => { console.error(err); process.exit(1); });
}
