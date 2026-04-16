/**
 * SWE-bench Lite 真实数据集加载器
 *
 * 从本地文件或远程 GitHub 加载 SWE-bench Lite 数据集，
 * 并转换为 benchmark runner 所需的 LabeledIssue 格式。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// LabeledIssue 与 runner 中定义一致，这里重新导出以供外部使用
import type { SweIssue } from '../tools/swebench.js';

export interface LabeledIssue extends SweIssue {
  expectedCategory: string;
}

// =============================================================================
// SWE-bench 原始 JSON schema
// =============================================================================

/** SWE-bench 数据集中单条实例的结构 */
export interface SWEBenchInstance {
  instance_id: string;
  repo: string;
  base_commit: string;
  problem_statement: string;
  hints_text: string;
  test_patch: string;
  patch: string;
  /** FAIL_TO_PASS / PASS_TO_PASS 测试列表（JSON 字符串） */
  FAIL_TO_PASS: string;
  PASS_TO_PASS: string;
  environment_setup_commit: string;
  version: string;
  created_at: string;
}

// =============================================================================
// 远程下载地址（多个备选）
// =============================================================================

const REMOTE_URLS = [
  // HuggingFace datasets API（JSON lines 格式，需要额外处理）
  'https://datasets-server.huggingface.co/rows?dataset=princeton-nlp%2FSWE-bench_Lite&config=default&split=test&offset=0&length=300',
  // 备选：原始 GitHub（可能路径有变）
  'https://raw.githubusercontent.com/princeton-nlp/SWE-bench/main/swe-bench-lite.json',
];

// =============================================================================
// 辅助：从 repo 名派生 error category
// =============================================================================

/**
 * 从 FAIL_TO_PASS test 路径 + problem_statement 推断 repo:module 级 category
 * 三种格式：
 *   pytest path: repo/module/tests/... → repo:module
 *   unittest:    test_name (module.tests.TestClass) → repo:module
 *   bare name:   test_func_name → 从 problem_statement 提取 lib.xxx
 */
function deriveModuleCategory(
  repo: string,
  failToPassJson: string,
  problemStatement: string
): string {
  const repoShort = repo.split('/')[1] || repo;
  const tests = parseTestList(failToPassJson);
  if (tests.length === 0) return repoShort + ':unknown';

  const first = tests[0];

  // 格式1: pytest path — repo/module/tests/... 或 lib/module/...
  const pyPath = first.match(/^([\w-]+)\/([\w-]+)/);
  if (pyPath) return repoShort + ':' + pyPath[2];

  // 格式2: tests/module/...
  const testPath = first.match(/^tests?\/([\w-]+)/);
  if (testPath) return repoShort + ':' + testPath[1];

  // 格式3: unittest — test_name (module.submod.tests.TestClass)
  const unittest = first.match(/\(([\w]+)\./);
  if (unittest) return repoShort + ':' + unittest[1];

  // 格式4: bare function — 从 problem_statement 提取 lib.module 引用
  const libImport = problemStatement.match(new RegExp(repoShort.replace('-', '.') + '\\.(\\w+)', 'i'));
  if (libImport) return repoShort + ':' + libImport[1];

  return repoShort + ':core';
}

/** 从 problem_statement 中提取简短的错误日志片段 */
function extractErrorSnippet(text: string): string | undefined {
  // 尝试提取 traceback 或 error 行
  const tracebackMatch = text.match(/Traceback[\s\S]{0,500}/);
  if (tracebackMatch) return tracebackMatch[0].substring(0, 500);

  const errorMatch = text.match(/(\w+Error:.{0,200})/);
  if (errorMatch) return errorMatch[0];

  return undefined;
}

/** 从 FAIL_TO_PASS JSON 字符串解析测试列表 */
function parseTestList(jsonStr: string): string[] {
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // 忽略解析失败
  }
  return [];
}

// =============================================================================
// 核心转换
// =============================================================================

/**
 * 从 FAIL_TO_PASS test 路径提取模块名（最有区分力的特征）
 * 例如 "astropy/modeling/tests/test_separable.py::test_separable" → "modeling"
 */
function extractModuleFromTests(tests: string[]): string | undefined {
  if (tests.length === 0) return undefined;
  const first = tests[0];
  // 匹配 repo/module/tests/ 或 repo/module/子模块/tests/ 模式
  const match = first.match(/^[\w-]+\/([\w-]+)\//);
  if (match) return match[1];
  // 匹配 tests/module/ 模式
  const match2 = first.match(/^tests?\/([\w-]+)\//);
  if (match2) return match2[1];
  return undefined;
}

/**
 * 从 problem_statement 提取关键动词/名词作为语义标签
 * 用高频 SWE-bench 关键词匹配
 */
function extractSemanticTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  const patterns: [string, RegExp][] = [
    ['regression', /regress/],
    ['crash', /crash|segfault|core dump/],
    ['hang', /hang|infinite loop|deadlock/],
    ['wrong_result', /wrong|incorrect|unexpected result/],
    ['missing_feature', /missing|not supported|not implemented/],
    ['deprecation', /deprecat/],
    ['performance', /slow|performance|timeout/],
    ['compatibility', /compat|backward|breaking change/],
    ['documentation', /doc|docstring|help text/],
  ];
  for (const [tag, re] of patterns) {
    if (re.test(lower)) tags.push(tag);
  }
  return tags;
}

/** 将 SWE-bench 原始实例转为 LabeledIssue（增强特征提取） */
export function convertToLabeledIssues(instances: SWEBenchInstance[]): LabeledIssue[] {
  return instances.map((inst): LabeledIssue => {
    const failingTests = parseTestList(inst.FAIL_TO_PASS);
    // 主 category 用 repo 级别（12 类，每类 10-50 样本，归纳可学）
    // 模块信息作为辅助 label 进入 facts，不作为 category
    const category = inst.repo.split('/')[1] || inst.repo;
    const moduleCategory = deriveModuleCategory(inst.repo, inst.FAIL_TO_PASS, inst.problem_statement);
    const errorLog = extractErrorSnippet(inst.problem_statement);
    const module = extractModuleFromTests(failingTests);
    const semanticTags = extractSemanticTags(inst.problem_statement);

    // 构造更丰富的 labels：swe-bench + category + module + semantic tags
    const labels = ['swe-bench', category];
    labels.push(`module_cat:${moduleCategory}`);
    if (module) labels.push(`module:${module}`);
    for (const tag of semanticTags) labels.push(`semantic:${tag}`);

    return {
      issueId: inst.instance_id,
      repo: inst.repo,
      title: inst.instance_id.replace(/__/g, ' ').replace(/-/g, ' '),
      description: inst.problem_statement.substring(0, 2000),
      errorLog,
      failingTests: failingTests.length > 0 ? failingTests : undefined,
      labels,
      expectedCategory: category,
    };
  });
}

// =============================================================================
// 加载逻辑
// =============================================================================

/** 本地缓存文件路径 */
function localCachePath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, 'data', 'swe-bench-lite.json');
}

/** 从本地文件读取 */
function loadFromLocal(): SWEBenchInstance[] | null {
  const filePath = localCachePath();
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    // 兼容两种格式：
    // 1. 直接数组 [{ instance_id, ... }, ...]
    // 2. HuggingFace datasets API 格式 { rows: [{ row: { ... } }] }
    if (Array.isArray(parsed)) {
      return parsed as SWEBenchInstance[];
    }
    if (parsed.rows && Array.isArray(parsed.rows)) {
      return parsed.rows.map((r: { row: SWEBenchInstance }) => r.row);
    }

    console.warn('[swe-bench-data] 本地文件格式未识别，跳过');
    return null;
  } catch (e) {
    console.warn('[swe-bench-data] 读取本地缓存失败:', e);
    return null;
  }
}

/** 从远程下载并缓存到本地 */
async function loadFromRemote(): Promise<SWEBenchInstance[] | null> {
  for (const url of REMOTE_URLS) {
    try {
      console.log(`[swe-bench-data] 尝试从 ${url} 下载...`);
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        console.warn(`[swe-bench-data] HTTP ${resp.status}，尝试下一个源`);
        continue;
      }

      const parsed = await resp.json();
      let instances: SWEBenchInstance[];

      // HuggingFace datasets API 返回 { rows: [{ row: { ... } }] }
      if (parsed.rows && Array.isArray(parsed.rows)) {
        instances = parsed.rows.map((r: { row: SWEBenchInstance }) => r.row);
      } else if (Array.isArray(parsed)) {
        instances = parsed;
      } else {
        console.warn('[swe-bench-data] 响应格式未识别，尝试下一个源');
        continue;
      }

      if (instances.length === 0) {
        console.warn('[swe-bench-data] 获得 0 条实例，尝试下一个源');
        continue;
      }

      // 缓存到本地
      try {
        const cachePath = localCachePath();
        const cacheDir = dirname(cachePath);
        if (!existsSync(cacheDir)) {
          mkdirSync(cacheDir, { recursive: true });
        }
        writeFileSync(cachePath, JSON.stringify(instances, null, 2), 'utf-8');
        console.log(`[swe-bench-data] 已缓存 ${instances.length} 条到 ${cachePath}`);
      } catch (e) {
        console.warn('[swe-bench-data] 缓存写入失败（不影响使用）:', e);
      }

      return instances;
    } catch (e) {
      console.warn(`[swe-bench-data] 从 ${url} 下载失败:`, e);
      continue;
    }
  }

  return null;
}

/**
 * 加载 SWE-bench Lite 数据集
 *
 * 优先级：本地缓存 > 远程下载 > 返回 null（由调用方降级到内置数据集）
 */
export async function loadSWEBenchLite(): Promise<LabeledIssue[] | null> {
  // 1. 尝试本地
  const localInstances = loadFromLocal();
  if (localInstances && localInstances.length > 0) {
    console.log(`[swe-bench-data] 从本地缓存加载 ${localInstances.length} 条实例`);
    return convertToLabeledIssues(localInstances);
  }

  // 2. 尝试远程
  const remoteInstances = await loadFromRemote();
  if (remoteInstances && remoteInstances.length > 0) {
    console.log(`[swe-bench-data] 从远程加载 ${remoteInstances.length} 条实例`);
    return convertToLabeledIssues(remoteInstances);
  }

  // 3. 都失败
  console.warn('[swe-bench-data] 无法加载真实数据集，将降级到内置数据');
  return null;
}
