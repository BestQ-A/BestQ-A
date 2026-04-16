/**
 * 自然语言 → 因果 facts 解析工具
 *
 * 支持：
 * - 中英文混合自然语言（"改了 d_cp 到 3.8，精度降到 0.8px"）
 * - Markdown 表格批量解析
 * - 自动提取 cause / effect / direction / magnitude / affected_module
 */

import type { Fact } from '../core/index.js';

// ── 公共类型 ──────────────────────────────────────────────

/** 方向枚举 */
export type Direction = 'improved' | 'degraded' | 'fixed' | 'broken' | 'unknown';

/** 数值变化 */
export interface Magnitude {
  from?: number;
  to?: number;
  unit?: string;
  delta?: number;
}

/** 单条解析结果 */
export interface ParsedCausalFact {
  cause: Fact;
  effect: Fact;
  direction: Direction;
  magnitude?: Magnitude;
  affectedModule?: string;
}

/** 整体解析结果 */
export interface ParsedCausalFacts {
  items: ParsedCausalFact[];
  /** 原始文本 */
  rawText: string;
  /** 是否从表格解析 */
  fromTable: boolean;
}

// ── 正则模式库 ──────────────────────────────────────────────

// 中文：改了 X 到 Y / 把 X 改成 Y / 设 X 为 Y / 调 X 到 Y
const CN_CAUSE_PATTERNS: RegExp[] = [
  /(?:改了|把|将)\s*([A-Za-z_][\w.]*)\s*(?:到|改成|改为|设为|设成|调到|调为)\s*([\d.]+\s*\w*)/g,
  /(?:设|调)\s*([A-Za-z_][\w.]*)\s*(?:为|到)\s*([\d.]+\s*\w*)/g,
  /(?:加了|新增了?|添加了?|启用了?|开启了?)\s*([A-Za-z_][\w.]*)/g,
  /(?:删了|删除了?|移除了?|去掉了?|禁用了?|关闭了?)\s*([A-Za-z_][\w.]*)/g,
  /(?:升级了?|降级了?|更新了?)\s*([A-Za-z_][\w.]*)\s*(?:到|为|从\s*[\w.]+\s*到)\s*([\w.]+)/g,
];

// 英文：changed X to Y / set X to Y / added X / removed X
const EN_CAUSE_PATTERNS: RegExp[] = [
  /(?:changed?|set|updated?)\s+([A-Za-z_][\w.]*)\s+(?:to|=)\s*([\d.]+\s*\w*)/gi,
  /(?:added?|enabled?|turned\s+on)\s+([A-Za-z_][\w.]*)/gi,
  /(?:removed?|disabled?|turned\s+off|deleted?)\s+([A-Za-z_][\w.]*)/gi,
  /(?:upgraded?|downgraded?)\s+([A-Za-z_][\w.]*)\s+(?:to|from\s+[\w.]+\s+to)\s+([\w.]+)/gi,
];

// 中文效果
const CN_EFFECT_PATTERNS: RegExp[] = [
  /(?:精度|accuracy|loss|error|延迟|latency|性能|performance|速度|speed|fps|帧率|内存|memory|CPU)\s*(?:降到|降为|降了|掉到|跌到)\s*([\d.]+\s*\w*)/g,
  /(?:精度|accuracy|loss|error|延迟|latency|性能|performance|速度|speed|fps|帧率|内存|memory|CPU)\s*(?:升到|升为|提升到|涨到|上升到|提高到)\s*([\d.]+\s*\w*)/g,
  /(?:build|编译|构建)\s*(?:成功|通过|passed)/gi,
  /(?:build|编译|构建)\s*(?:失败|挂了|broken|failed)/gi,
  /(?:crash|崩溃|挂了|卡死|死循环|OOM|报错|异常|exception|error)/gi,
  /(?:修复了?|fix(?:ed)?|解决了?|resolved)\s+(.+?)(?:[，,。.;；]|$)/gi,
];

// 英文效果
const EN_EFFECT_PATTERNS: RegExp[] = [
  /(?:accuracy|precision|loss|error|latency|performance|speed|fps|memory|CPU)\s+(?:dropped?|decreased?|fell?|went\s+down)\s+(?:to\s+)?([\d.]+\s*\w*)/gi,
  /(?:accuracy|precision|loss|error|latency|performance|speed|fps|memory|CPU)\s+(?:increased?|improved?|rose?|went\s+up)\s+(?:to\s+)?([\d.]+\s*\w*)/gi,
  /(?:build|compile)\s+(?:succeeded|passed|green)/gi,
  /(?:build|compile)\s+(?:failed|broken|red)/gi,
  /(?:crash(?:ed)?|OOM|exception|error|timeout|deadlock)/gi,
  /(?:fix(?:ed)?|resolved?|solved?)\s+(.+?)(?:[,.]|$)/gi,
];

// 文件路径 / 模块名
const MODULE_PATTERN = /(?:(?:[\w-]+\/)+[\w.-]+\.\w+|(?:[\w-]+\.){1,5}[\w-]+(?:\.(?:ts|js|py|rs|go|java|c|cpp|h|hpp))?)/g;

// 数值 + 单位
const NUMBER_UNIT_PATTERN = /([\d.]+)\s*(%|px|ms|s|fps|MB|GB|KB|hz|Hz)/g;

// ── 核心解析 ──────────────────────────────────────────────

/** 提取数值和单位 */
function extractMagnitude(text: string): Magnitude | undefined {
  const matches = [...text.matchAll(NUMBER_UNIT_PATTERN)];
  if (matches.length === 0) {
    // 尝试无单位数字
    const bare = [...text.matchAll(/([\d.]+)/g)];
    if (bare.length >= 2) {
      const from = parseFloat(bare[0][1]);
      const to = parseFloat(bare[1][1]);
      return { from, to, delta: to - from };
    }
    if (bare.length === 1) {
      return { to: parseFloat(bare[0][1]) };
    }
    return undefined;
  }
  if (matches.length >= 2) {
    const from = parseFloat(matches[0][1]);
    const to = parseFloat(matches[1][1]);
    return { from, to, unit: matches[1][2], delta: to - from };
  }
  return { to: parseFloat(matches[0][1]), unit: matches[0][2] };
}

/** 推断方向 */
function inferDirection(text: string): Direction {
  const degradeHints = /降|掉|跌|下降|drop|decrease|fell|degrad|worse|lower|crash|fail|broken|挂|崩|报错|error|exception/i;
  const improveHints = /升|提升|涨|提高|improve|increase|better|higher|faster|fix|修复|解决|resolve|pass|成功|green/i;
  const fixHints = /fix(?:ed)?|修复了?|解决了?|resolved?/i;
  const breakHints = /crash|崩溃|broken|fail(?:ed)?|挂了|OOM|死/i;

  if (fixHints.test(text)) return 'fixed';
  if (breakHints.test(text)) return 'broken';
  if (degradeHints.test(text)) return 'degraded';
  if (improveHints.test(text)) return 'improved';
  return 'unknown';
}

/** 提取模块名 */
function extractModule(text: string): string | undefined {
  const matches = text.match(MODULE_PATTERN);
  if (matches && matches.length > 0) {
    // 过滤常见非模块名的误匹配
    const filtered = matches.filter((m) => m.length > 3 && !/^\d+\.\d+$/.test(m));
    return filtered[0];
  }
  return undefined;
}

/** 从正则组提取 cause fact */
function extractCauseFact(text: string): Fact {
  // 尝试所有 cause 模式
  const allPatterns = [...CN_CAUSE_PATTERNS, ...EN_CAUSE_PATTERNS];
  for (const pattern of allPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const paramName = match[1]?.trim();
      const paramValue = match[2]?.trim();
      if (paramName && paramValue) {
        const numVal = parseFloat(paramValue);
        return {
          pred: `param_changed:${paramName}`,
          value: isNaN(numVal) ? paramValue : numVal,
          args: { parameter: paramName, newValue: isNaN(numVal) ? paramValue : numVal },
        };
      }
      if (paramName) {
        // 加了/删了 类型，无 value
        const isRemoval = /删|移除|去掉|禁用|关闭|remove|disable|delete|turn.+off/i.test(text);
        return {
          pred: isRemoval ? `param_removed:${paramName}` : `param_added:${paramName}`,
          value: !isRemoval,
          args: { parameter: paramName },
        };
      }
    }
  }

  // 兜底：整句作为 cause
  return {
    pred: 'change',
    value: text.trim().slice(0, 200),
  };
}

/** 从正则组提取 effect fact */
function extractEffectFact(text: string): Fact {
  const allPatterns = [...CN_EFFECT_PATTERNS, ...EN_EFFECT_PATTERNS];
  for (const pattern of allPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const metricName = match[0].split(/\s+/)[0]?.toLowerCase() || 'metric';
      const val = match[1]?.trim();
      if (val) {
        const numVal = parseFloat(val);
        return {
          pred: `effect:${metricName}`,
          value: isNaN(numVal) ? val : numVal,
          args: { metric: metricName, observedValue: isNaN(numVal) ? val : numVal },
        };
      }
      // 布尔效果（build 成功 / crash 等）
      return {
        pred: `effect:${metricName}`,
        value: match[0].trim(),
      };
    }
  }

  // 兜底
  return {
    pred: 'effect',
    value: text.trim().slice(0, 200),
  };
}

// ── 按分隔符拆分 cause / effect ─────────────────────────────

/** 中英文因果分隔符 */
const CAUSE_EFFECT_SPLITTERS = /[，,]\s*(?:导致|结果|然后|之后|后来|所以|因此|hence|then|so|resulting|caused|led\s+to|→|->)/i;
const SIMPLE_SPLITTER = /[，,；;]\s*/;

function splitCauseEffect(text: string): { causeText: string; effectText: string } {
  // 先尝试显式因果连接词
  const ceMatch = text.split(CAUSE_EFFECT_SPLITTERS);
  if (ceMatch.length >= 2) {
    return { causeText: ceMatch[0].trim(), effectText: ceMatch.slice(1).join('，').trim() };
  }
  // 尝试简单逗号分割（第一个子句为 cause，其余为 effect）
  const parts = text.split(SIMPLE_SPLITTER).filter((p) => p.trim().length > 0);
  if (parts.length >= 2) {
    return { causeText: parts[0].trim(), effectText: parts.slice(1).join('，').trim() };
  }
  return { causeText: text, effectText: text };
}

// ── 公共 API ──────────────────────────────────────────────

/**
 * 从自然语言解析因果 facts
 *
 * 支持：
 * - 单句（"改了 d_cp 到 3.8，精度降到 0.8px"）
 * - 多行（每行一条观测）
 * - Markdown 表格（自动检测 `|` 分隔）
 */
export function parseNaturalLanguage(text: string): ParsedCausalFacts {
  const trimmed = text.trim();

  // 检测 Markdown 表格
  if (isMarkdownTable(trimmed)) {
    return parseMarkdownTable(trimmed);
  }

  // 多行模式：每行一条
  const lines = trimmed.split(/\n/).filter((l) => l.trim().length > 0);
  const items: ParsedCausalFact[] = [];

  for (const line of lines) {
    const { causeText, effectText } = splitCauseEffect(line);
    const cause = extractCauseFact(causeText);
    const effect = extractEffectFact(effectText);
    const direction = inferDirection(line);
    const magnitude = extractMagnitude(line);
    const affectedModule = extractModule(line);

    items.push({ cause, effect, direction, magnitude, affectedModule });
  }

  return { items, rawText: text, fromTable: false };
}

// ── Markdown 表格解析 ──────────────────────────────────────

/** 检测是否是 Markdown 表格 */
function isMarkdownTable(text: string): boolean {
  const lines = text.split(/\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 3) return false;
  // 至少前 2 行含 |，且第 2 行是分隔行 (---|----|---)
  const hasHeaderPipe = lines[0].includes('|');
  const isSeparator = /^\s*\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?\s*$/.test(lines[1]);
  return hasHeaderPipe && isSeparator;
}

// 列名 → 角色的启发式匹配
const PARAM_COLUMN_HINTS = /param|参数|variable|变量|change|修改|cause|原因|input|配置|config/i;
const EFFECT_COLUMN_HINTS = /effect|结果|result|output|metric|指标|精度|accuracy|loss|error|影响|outcome/i;
const MODULE_COLUMN_HINTS = /module|模块|file|文件|component|组件|path|路径/i;

/**
 * 解析 Markdown 表格为因果 facts
 *
 * 自动检测列角色：参数列、效果列、模块列
 */
export function parseMarkdownTable(text: string): ParsedCausalFacts {
  const lines = text.split(/\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 3) {
    return { items: [], rawText: text, fromTable: true };
  }

  // 解析表头
  const headers = parseMdRow(lines[0]);
  // 跳过分隔行 (lines[1])
  const dataLines = lines.slice(2);

  // 检测列角色
  let paramColIdx = -1;
  let effectColIdx = -1;
  let moduleColIdx = -1;

  headers.forEach((h, i) => {
    if (PARAM_COLUMN_HINTS.test(h)) paramColIdx = i;
    else if (EFFECT_COLUMN_HINTS.test(h)) effectColIdx = i;
    else if (MODULE_COLUMN_HINTS.test(h)) moduleColIdx = i;
  });

  // 兜底：第一列 = 参数，第二列 = 效果
  if (paramColIdx === -1) paramColIdx = 0;
  if (effectColIdx === -1) effectColIdx = Math.min(1, headers.length - 1);

  const items: ParsedCausalFact[] = [];

  for (const line of dataLines) {
    const cells = parseMdRow(line);
    if (cells.length === 0) continue;

    const paramText = cells[paramColIdx] || '';
    const effectText = cells[effectColIdx] || '';
    const moduleText = moduleColIdx >= 0 ? cells[moduleColIdx] : undefined;

    const cause = extractCauseFact(paramText);
    const effect = extractEffectFact(effectText);
    const combinedText = `${paramText} ${effectText}`;
    const direction = inferDirection(combinedText);
    const magnitude = extractMagnitude(combinedText);
    const affectedModule = moduleText?.trim() || extractModule(combinedText);

    items.push({ cause, effect, direction, magnitude, affectedModule });
  }

  return { items, rawText: text, fromTable: true };
}

/** 解析 Markdown 表格行 */
function parseMdRow(line: string): string[] {
  return line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
}

// ── 转换为 ObservationInput facts ────────────────────────────

/**
 * 将解析结果转换为引擎可提交的 facts 列表
 *
 * 每条 ParsedCausalFact 展开为 cause fact + effect fact + 元 facts（direction、magnitude、module）
 */
export function toObservationFacts(parsed: ParsedCausalFact): Fact[] {
  const facts: Fact[] = [parsed.cause, parsed.effect];

  // 方向 fact
  if (parsed.direction !== 'unknown') {
    facts.push({
      pred: 'direction',
      value: parsed.direction,
    });
  }

  // 数值变化 fact
  if (parsed.magnitude) {
    facts.push({
      pred: 'magnitude',
      value: parsed.magnitude.delta ?? parsed.magnitude.to ?? 0,
      args: {
        ...(parsed.magnitude.from !== undefined ? { from: parsed.magnitude.from } : {}),
        ...(parsed.magnitude.to !== undefined ? { to: parsed.magnitude.to } : {}),
        ...(parsed.magnitude.unit ? { unit: parsed.magnitude.unit } : {}),
      },
    });
  }

  // 模块 fact
  if (parsed.affectedModule) {
    facts.push({
      pred: 'affected_module',
      value: parsed.affectedModule,
    });
  }

  return facts;
}
