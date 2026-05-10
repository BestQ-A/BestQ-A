/**
 * MiniMax Reviewer — 双脑架构的审查端
 *
 * 对应 docs/mvp-llm-reasoning-guard-plan.md W1 T1.4。
 *
 * 职责：
 *   给定 LLM 产出的 patch + 上下文，调用 MiniMax coding-plan model
 *   **逆向推理**出推理链（近因/中因/远因），识别跳步/证据缺失/API 幻觉。
 *
 * 设计原则（v13 G3 最小充分追溯）：
 *   - Prompt 强制 MiniMax 产出结构化 JSON（goal / chain / supports / hypotheses / risks / issues）
 *   - 不让 MiniMax 自由文本胡说——JSON 是硬约束
 *   - MiniMax 不是裁决者（I4）——它只报告事实，verdict 由 grader.ts 独立判定
 *
 * 环境变量：
 *   MINIMAX_API_KEY      MiniMax API Key（必填）
 *   MINIMAX_API_HOST     默认 https://api.minimax.io
 *   MINIMAX_MODEL        默认 minimax-m2.7-highspeed
 */

import type { ReasoningCard, GradingIssue } from './reasoning-card.js';

const API_HOST = process.env.MINIMAX_API_HOST ?? 'https://api.minimax.io';
const API_KEY = process.env.MINIMAX_API_KEY ?? process.env.LLM_API_KEY ?? '';
const MODEL = process.env.MINIMAX_MODEL ?? 'minimax-m2.7-highspeed';

// =============================================================================
// Prompt：逆向推理
// =============================================================================

const REVIEWER_PROMPT = `You are a reverse-reasoning code reviewer. Given a code patch produced by another LLM, you must reconstruct the **minimal sufficient provenance** (v13 G3) the author must have used.

Output STRICT JSON (no markdown, no prose):
{
  "goal": "one-sentence statement of what the user wanted",
  "chain": [
    {"step": 1, "claim": "near-cause: what directly changed", "evidence": "file:line or 'assumption'", "confidence": 0.0-1.0},
    {"step": 2, "claim": "middle-cause: why this was triggered", "evidence": "...", "confidence": 0.0-1.0},
    {"step": 3, "claim": "far-cause: deeper structural reason", "evidence": "...", "confidence": 0.0-1.0}
  ],
  "hypotheses": [
    {"claim": "assumption the patch relies on", "confidence": 0.0-1.0}
  ],
  "risks": ["what breaks if a hypothesis is wrong"],
  "issues": [
    {"severity": "fatal|warn", "code": "BROKEN_CHAIN|PHANTOM_API|EMPTY_GOAL|NO_SUPPORT|LLM_SELF_AUDIT|LOW_CONFIDENCE_HYPOTHESIS|COARSE_CHAIN|UNDECLARED_RISK", "message": "short explanation", "stepNumber": 1}
  ]
}

Rules:
- If evidence is a guess, write "assumption" and set confidence < 0.5 — flag as LOW_CONFIDENCE_HYPOTHESIS.
- If the patch references an API you cannot verify, flag PHANTOM_API as fatal.
- If chain has < 2 steps, flag COARSE_CHAIN.
- If no supporting file:line exists for any step, flag NO_SUPPORT as fatal.
- You are NOT the final judge. Report facts only. Grader decides final verdict.`;

// =============================================================================
// 类型
// =============================================================================

export interface MinimaxReviewRaw {
  goal: string;
  chain: Array<{ step: number; claim: string; evidence: string; confidence: number }>;
  hypotheses: Array<{ claim: string; confidence: number }>;
  risks: string[];
  issues: GradingIssue[];
}

export interface MinimaxReviewInput {
  predictedPatch: string;
  problemStatement?: string;
  contextSnippets?: string[]; // 已读入的上下文文件内容
  metaRulesPrompt?: string; // W3 T3.4: 从 approved feedback 构造的元规律 prompt 片段
}

// =============================================================================
// MiniMax API 调用
// =============================================================================

interface ChatResponse {
  choices: Array<{ message: { content: string; reasoning_content?: string } }>;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 5): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, init);
      // 5xx / 429 也重试
      if ((r.status >= 500 || r.status === 429) && i < attempts - 1) {
        lastErr = new Error(`HTTP ${r.status}`);
      } else {
        return r;
      }
    } catch (err) {
      lastErr = err;
      // 打到 stderr 供 agent-eval 排查瞬时抖动（Layer 2 S030 fetch failed 案例）
      console.error(`[minimax-reviewer] attempt ${i + 1}/${attempts} failed: ${(err as Error).message}`);
    }
    // 指数退避：1s, 3s, 7s, 15s, 31s（总耗 ~57s 覆盖常见瞬时抖动窗口）
    const delay = 1000 * (2 ** i + 1) - 1000;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }
  throw lastErr ?? new Error('fetchWithRetry failed');
}

async function callMinimax(userMessage: string): Promise<string> {
  if (!API_KEY) {
    throw new Error('MINIMAX_API_KEY (or LLM_API_KEY) is not set');
  }
  const resp = await fetchWithRetry(`${API_HOST}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: REVIEWER_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`MiniMax API error: ${resp.status} ${resp.statusText} ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as ChatResponse;
  const msg = data.choices?.[0]?.message;
  let content = msg?.content ?? '';
  if (content.includes('<think>')) {
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  if (!content && msg?.reasoning_content) {
    const m = msg.reasoning_content.match(/\{[\s\S]*\}/);
    if (m) content = m[0];
  }
  return content;
}

function findBalancedJsonObject(text: string): string | null {
  // 查找第一个平衡的 {...} 子串，兼容字符串里的嵌套括号和转义
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start !== -1) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractJson(raw: string): any {
  // 容错：去掉 markdown fence 与 <think> 包裹
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*$/g, '')
    .replace(/```/g, '')
    .trim();
  // 尝试直接解析
  try { return JSON.parse(cleaned); } catch {}
  // 尝试提取平衡括号的 JSON 对象
  const balanced = findBalancedJsonObject(cleaned);
  if (balanced) {
    try { return JSON.parse(balanced); } catch {}
    // 修补常见错误：末尾多余逗号
    const fixed = balanced.replace(/,(\s*[}\]])/g, '$1');
    try { return JSON.parse(fixed); } catch {}
  }
  throw new Error(`MiniMax returned non-JSON: ${raw.slice(0, 200)}`);
}

// =============================================================================
// 主入口
// =============================================================================

export async function reviewPatch(input: MinimaxReviewInput): Promise<MinimaxReviewRaw> {
  const parts: string[] = [];
  if (input.metaRulesPrompt && input.metaRulesPrompt.trim()) {
    // 元规律优先展示——让 MiniMax 在看 patch 前先看历史教训
    parts.push(input.metaRulesPrompt.slice(0, 2000));
  }
  if (input.problemStatement) {
    parts.push(`# Problem Statement\n${input.problemStatement.slice(0, 3000)}`);
  }
  if (input.contextSnippets && input.contextSnippets.length > 0) {
    parts.push(`# Context Files\n${input.contextSnippets.join('\n---\n').slice(0, 6000)}`);
  }
  parts.push(`# Patch to Review\n${input.predictedPatch.slice(0, 8000)}`);

  const userMsg = parts.join('\n\n');
  const raw = await callMinimax(userMsg);
  const parsed = extractJson(raw) as MinimaxReviewRaw;

  // 基本 schema 校验
  if (!parsed.goal || !Array.isArray(parsed.chain)) {
    throw new Error('MiniMax output missing required fields');
  }
  return {
    goal: String(parsed.goal),
    chain: parsed.chain ?? [],
    hypotheses: parsed.hypotheses ?? [],
    risks: parsed.risks ?? [],
    issues: parsed.issues ?? [],
  };
}

/**
 * 将 MiniMax 原始审查结果映射到 ReasoningCard 的核心字段。
 * 映射关系（v12/v13 对齐）：
 *   chain[i] → DerivationStep (relation='causes', NodeRef.kind='claim')
 *   evidence(file:line) → SupportLink
 *   hypotheses → Hypothesis
 *   issues → GradingIssue (已同构)
 *
 * 完整映射在 W2 T2.3 入库环节完成，此处仅返回 raw 供 CLI 打印。
 */
export function mapToReasoningCardFields(raw: MinimaxReviewRaw): Pick<
  ReasoningCard,
  'goal' | 'risks' | 'issues'
> {
  return {
    goal: raw.goal,
    risks: raw.risks,
    issues: raw.issues,
  };
}
