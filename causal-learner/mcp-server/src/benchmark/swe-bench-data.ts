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

/** 从 repo 名称和 problem_statement 内容推断 category */
function deriveCategory(repo: string, problemStatement: string): string {
  const lower = problemStatement.toLowerCase();

  // 按错误关键词优先匹配
  if (lower.includes('typeerror')) return 'type_error';
  if (lower.includes('importerror') || lower.includes('modulenotfounderror')) return 'import_error';
  if (lower.includes('attributeerror')) return 'attribute_error';
  if (lower.includes('keyerror')) return 'key_error';
  if (lower.includes('valueerror')) return 'value_error';
  if (lower.includes('indexerror')) return 'index_error';
  if (lower.includes('assertionerror') || lower.includes('asserterror')) return 'assertion_error';
  if (lower.includes('syntaxerror')) return 'syntax_error';
  if (lower.includes('runtimeerror')) return 'runtime_error';
  if (lower.includes('overflowerror') || lower.includes('recursionerror')) return 'overflow_error';
  if (lower.includes('oserror') || lower.includes('filenotfounderror') || lower.includes('permissionerror')) return 'os_error';
  if (lower.includes('notimplementederror')) return 'not_implemented_error';

  // 按 repo 名大类兜底
  const repoLower = repo.toLowerCase();
  if (repoLower.includes('django')) return 'django_issue';
  if (repoLower.includes('flask')) return 'flask_issue';
  if (repoLower.includes('requests')) return 'requests_issue';
  if (repoLower.includes('scikit') || repoLower.includes('sklearn')) return 'sklearn_issue';
  if (repoLower.includes('sympy')) return 'sympy_issue';
  if (repoLower.includes('matplotlib')) return 'matplotlib_issue';
  if (repoLower.includes('sphinx')) return 'sphinx_issue';
  if (repoLower.includes('astropy')) return 'astropy_issue';
  if (repoLower.includes('pytest')) return 'pytest_issue';
  if (repoLower.includes('xarray')) return 'xarray_issue';
  if (repoLower.includes('pandas')) return 'pandas_issue';
  if (repoLower.includes('pylint')) return 'pylint_issue';

  return 'unknown';
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

/** 将 SWE-bench 原始实例转为 LabeledIssue */
export function convertToLabeledIssues(instances: SWEBenchInstance[]): LabeledIssue[] {
  return instances.map((inst): LabeledIssue => {
    const failingTests = parseTestList(inst.FAIL_TO_PASS);
    const category = deriveCategory(inst.repo, inst.problem_statement);
    const errorLog = extractErrorSnippet(inst.problem_statement);

    return {
      issueId: inst.instance_id,
      repo: inst.repo,
      title: inst.instance_id.replace(/__/g, ' ').replace(/-/g, ' '),
      description: inst.problem_statement.substring(0, 2000),
      errorLog,
      failingTests: failingTests.length > 0 ? failingTests : undefined,
      labels: ['swe-bench', category],
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
