/**
 * LLM-assisted Fact Extraction
 *
 * 用本地/远程 LLM 从 SWE-bench problem_statement 提取结构化因果 facts，
 * 替代 regex 垃圾提取。提取结果缓存到磁盘避免重复调用。
 *
 * 环境变量：
 *   LLM_BASE_URL  默认 http://127.0.0.1:1234/v1
 *   LLM_MODEL     默认 google/gemma-4-26b-a4b
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Fact } from '../core/types.js';

const BASE_URL = process.env.LLM_BASE_URL ?? 'https://api.minimax.io/v1';
const MODEL = process.env.LLM_MODEL ?? 'minimax-m2.7-highspeed';
const API_KEY = process.env.LLM_API_KEY ?? '';

// =============================================================================
// 提取 prompt
// =============================================================================

const EXTRACTION_PROMPT = `Extract bug facts as JSON. Fields: root_cause, mechanism, symptom, affected_module, error_type (Python exception or "none"), fix_strategy, severity (low/medium/high/critical), bug_category (logic_error/type_error/missing_validation/wrong_default/api_change/regression/edge_case/other). Use "unknown" if unclear. Output ONLY JSON.`;

// =============================================================================
// LLM 调用
// =============================================================================

interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
      reasoning_content?: string;
    };
  }>;
}

async function callLLM(problemStatement: string): Promise<string> {
  // context 65K tokens，input 截断 4000 chars（~1000 tokens），留足 output 空间
  const truncated = problemStatement.substring(0, 4000);

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: truncated },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as LLMResponse;
  const msg = data.choices?.[0]?.message;
  let content = msg?.content || '';
  const reasoning = (msg as any)?.reasoning_content || '';

  // thinking model 处理：
  // 1. Gemma-4: content 为空，回复在 reasoning_content
  // 2. MiniMax: content 含 <think>...</think> + JSON
  if (content.includes('<think>')) {
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  if (!content && reasoning) {
    const jsonMatch = reasoning.match(/\{[^{}]*"root_cause"[^{}]*\}/g);
    if (jsonMatch) return jsonMatch[jsonMatch.length - 1];
  }
  return content;
}

// =============================================================================
// 结构化解析
// =============================================================================

export interface ExtractedFacts {
  root_cause: string;
  mechanism: string;
  symptom: string;
  affected_module: string;
  error_type: string;
  fix_strategy: string;
  severity: string;
  bug_category: string;
}

const DEFAULT_EXTRACTED: ExtractedFacts = {
  root_cause: 'unknown',
  mechanism: 'unknown',
  symptom: 'unknown',
  affected_module: 'unknown',
  error_type: 'unknown',
  fix_strategy: 'unknown',
  severity: 'medium',
  bug_category: 'other',
};

function parseExtraction(raw: string): ExtractedFacts {
  try {
    // 从回复中提取 JSON（可能被 markdown 包裹）
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ...DEFAULT_EXTRACTED };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      root_cause: parsed.root_cause ?? 'unknown',
      mechanism: parsed.mechanism ?? 'unknown',
      symptom: parsed.symptom ?? 'unknown',
      affected_module: parsed.affected_module ?? 'unknown',
      error_type: parsed.error_type ?? 'unknown',
      fix_strategy: parsed.fix_strategy ?? 'unknown',
      severity: parsed.severity ?? 'medium',
      bug_category: parsed.bug_category ?? 'other',
    };
  } catch {
    return { ...DEFAULT_EXTRACTED };
  }
}

// =============================================================================
// 缓存
// =============================================================================

const thisDir = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(thisDir, 'data', 'llm-extraction-cache.json');

type Cache = Record<string, ExtractedFacts>;

function loadCache(): Cache {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(cache: Cache): void {
  const dir = dirname(CACHE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

// =============================================================================
// 主入口
// =============================================================================

/**
 * 对单个 issue 提取结构化因果 facts（带缓存）
 */
export async function extractFactsWithLLM(
  issueId: string,
  problemStatement: string
): Promise<ExtractedFacts> {
  const cache = loadCache();
  if (cache[issueId]) return cache[issueId];

  const raw = await callLLM(problemStatement);
  const extracted = parseExtraction(raw);

  cache[issueId] = extracted;
  saveCache(cache);

  return extracted;
}

/**
 * 批量提取（带进度回调）
 */
export async function batchExtract(
  issues: Array<{ issueId: string; problemStatement: string }>,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, ExtractedFacts>> {
  const results = new Map<string, ExtractedFacts>();
  const cache = loadCache();
  let done = 0;

  for (const issue of issues) {
    if (cache[issue.issueId]) {
      results.set(issue.issueId, cache[issue.issueId]);
      done++;
      onProgress?.(done, issues.length);
      continue;
    }

    try {
      const raw = await callLLM(issue.problemStatement);
      const extracted = parseExtraction(raw);
      cache[issue.issueId] = extracted;
      results.set(issue.issueId, extracted);
    } catch (error) {
      console.error(`[llm-extract] ${issue.issueId} 失败:`, (error as Error).message);
      results.set(issue.issueId, { ...DEFAULT_EXTRACTED });
    }

    done++;
    onProgress?.(done, issues.length);

    // 每 10 条保存一次缓存
    if (done % 10 === 0) saveCache(cache);
  }

  saveCache(cache);
  return results;
}

/**
 * 将 ExtractedFacts 转为引擎可用的 Fact[]
 */
export function extractedToFacts(extracted: ExtractedFacts, repo: string): Fact[] {
  const facts: Fact[] = [
    { pred: 'repo', value: repo },
    { pred: 'has_issue', value: true },
    { pred: 'source', value: 'swe-bench' },
  ];

  if (extracted.root_cause !== 'unknown') {
    facts.push({ pred: 'root_cause', value: extracted.root_cause });
  }
  if (extracted.mechanism !== 'unknown') {
    facts.push({ pred: 'mechanism', value: extracted.mechanism });
  }
  if (extracted.symptom !== 'unknown') {
    facts.push({ pred: 'symptom', value: extracted.symptom });
  }
  if (extracted.affected_module !== 'unknown') {
    facts.push({ pred: 'affected_module', value: extracted.affected_module });
  }
  if (extracted.error_type !== 'unknown' && extracted.error_type !== 'none') {
    facts.push({ pred: 'error_type', value: extracted.error_type });
  }
  if (extracted.bug_category !== 'other') {
    facts.push({ pred: 'bug_category', value: extracted.bug_category });
  }
  if (extracted.severity !== 'medium') {
    facts.push({ pred: 'severity', value: extracted.severity });
  }

  return facts;
}

// =============================================================================
// CLI 测试
// =============================================================================

if (process.argv[1]?.includes('llm-fact-extractor')) {
  const testStatement = process.argv[2] ?? `
QuerySet.filter() raises TypeError when passed None value.
When calling MyModel.objects.filter(field=None), it throws:
TypeError: argument of type 'NoneType' is not iterable
File "django/db/models/query.py", line 234
The issue is that the filter method doesn't check for None before iterating.
  `;

  console.log(`[llm-fact-extractor] model=${MODEL} base=${BASE_URL}`);
  console.log('[llm-fact-extractor] 提取中...');

  extractFactsWithLLM('test-001', testStatement).then(result => {
    console.log('\n提取结果:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n转为 Facts:');
    const facts = extractedToFacts(result, 'django/django');
    for (const f of facts) {
      console.log(`  ${f.pred} = ${JSON.stringify(f.value)}`);
    }
  });
}
