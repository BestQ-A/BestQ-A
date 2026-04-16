/**
 * 知识组合引擎 — 从基本知识构建统一知识体系
 *
 * 核心理念（类比数学）：
 *   公理（level=0）：不需要证明的基本事实
 *     "空指针访问 → TypeError"
 *     "配置缺失 → 初始化失败"
 *
 *   定理（level=1+）：从公理/低层定理组合派生
 *     "配置缺失 → 初始化失败 → 服务崩溃"（链式组合 axiom_1 + axiom_2）
 *     "空指针 + 生产环境 → 500 错误 + 告警"（条件组合）
 *
 *   应用：遇到问题时，从高层定理开始匹配，沿 derivedFrom 链追溯到公理，
 *         形成完整的"来龙去脉"解释。
 *
 * 三种组合操作：
 *   1. 链式组合：A→B + B→C = A→C（因果链传递）
 *   2. 条件组合：A→C + B→C = (A∧B)→C（多因一果）
 *   3. 特化：A→B + context=prod = A∧prod→B（加条件约束）
 */

import type { Regulation, Fact } from './types.js';
import { signaturePredValue } from './unify.js';
import crypto from 'crypto';

// =============================================================================
// 知识层级
// =============================================================================

/**
 * 判断 regulation 是否为"当前公理"（暂时最基本的知识）
 * 公理 = 无 derivedFrom + 高信任度（support 多、无反例、存活时间长）
 * 注意：公理是暂时的，新证据可以推翻
 */
export function isAxiom(reg: Regulation): boolean {
  return (reg.level ?? 0) === 0 && (!reg.derivedFrom || reg.derivedFrom.length === 0);
}

/** 获取 regulation 的组合层级（未设置默认为 0） */
export function getLevel(reg: Regulation): number {
  return reg.level ?? 0;
}

/**
 * 计算知识的"历史信任度"——公理不是永恒的，是历史积累的信任
 *
 * 信任度 = f(support, counterexamples, age, refutation_survival)
 * 范围 [0, 1]，越高越接近"公理"状态
 *
 * 新发现的规律信任度低（~0.1），经过大量验证无反例的趋近 1.0
 * 但永远不会等于 1.0——因为未来可能被推翻
 */
export function computeTrust(reg: Regulation): number {
  const support = reg.supportN ?? 0;
  const counter = reg.counterexampleN ?? 0;

  // event 证据链：真实的历史观测支撑
  const confirmedEvents = reg.confirmedByEvents?.length ?? 0;
  const challengedEvents = reg.challengedByEvents?.length ?? 0;

  // 合并：统计 support + event 确认
  const totalSupport = support + confirmedEvents;
  const totalChallenge = counter + challengedEvents;
  const total = totalSupport + totalChallenge;

  // 无任何 event 支撑 = 猜测，不是知识
  if (total === 0) return 0.05;

  // 基础信任：成功率
  const successRate = totalSupport / total;

  // 样本量加权：样本越多越可信（对数增长，避免大数垄断）
  const sampleWeight = Math.min(1.0, Math.log2(total + 1) / 10);

  // 状态加权：confirmed > hypothesis > candidate
  const statusWeight = reg.status === 'confirmed' ? 1.0
    : reg.status === 'hypothesis' ? 0.7
    : reg.status === 'candidate' ? 0.4
    : 0.1; // retired

  // 组合层级惩罚：派生知识的信任度受限于其来源
  const levelPenalty = 1.0 / (1 + (reg.level ?? 0) * 0.1);

  return Math.min(0.99, successRate * sampleWeight * statusWeight * levelPenalty);
}

/**
 * 按信任度对 regulations 分层
 * 返回：{ axioms（信任>0.8）, theorems（0.3-0.8）, hypotheses（<0.3）}
 */
export function stratifyByTrust(regulations: Regulation[]): {
  axioms: Regulation[];
  theorems: Regulation[];
  hypotheses: Regulation[];
} {
  const axioms: Regulation[] = [];
  const theorems: Regulation[] = [];
  const hypotheses: Regulation[] = [];

  for (const reg of regulations) {
    const trust = computeTrust(reg);
    if (trust >= 0.8) axioms.push(reg);
    else if (trust >= 0.3) theorems.push(reg);
    else hypotheses.push(reg);
  }

  return { axioms, theorems, hypotheses };
}

// =============================================================================
// 链式组合：A→B + B→C = A→C
// =============================================================================

/**
 * 检查两条 regulation 是否可以链式组合
 * 条件：reg1 的某个 eff 和 reg2 的某个 pre 有相同的 pred+value
 */
export function canChain(reg1: Regulation, reg2: Regulation): boolean {
  const eff1Sigs = new Set(reg1.eff.map(f => signaturePredValue(f)));
  return reg2.pre.some(p => eff1Sigs.has(signaturePredValue(p)));
}

/**
 * 链式组合：reg1 的 eff 连接 reg2 的 pre → 新的 regulation
 *
 * 例：reg1: [配置缺失] → [初始化失败]
 *     reg2: [初始化失败] → [服务崩溃]
 *     结果: [配置缺失] → [服务崩溃]  (derivedFrom: [reg1, reg2])
 */
export function chainCompose(reg1: Regulation, reg2: Regulation): Regulation | null {
  if (!canChain(reg1, reg2)) return null;

  // 找出 reg1.eff 和 reg2.pre 的交集（中间节点）
  const eff1Sigs = new Set(reg1.eff.map(f => signaturePredValue(f)));
  const bridgeFacts = reg2.pre.filter(p => eff1Sigs.has(signaturePredValue(p)));
  if (bridgeFacts.length === 0) return null;

  // 新 pre = reg1.pre + (reg2.pre 中不在 bridge 里的)
  const bridgeSigs = new Set(bridgeFacts.map(f => signaturePredValue(f)));
  const newPre = [
    ...reg1.pre,
    ...reg2.pre.filter(p => !bridgeSigs.has(signaturePredValue(p))),
  ];

  // 新 eff = reg2.eff（最终效果）
  const newEff = [...reg2.eff];

  // 层级 = max(两个来源) + 1
  const newLevel = Math.max(getLevel(reg1), getLevel(reg2)) + 1;

  // support = min（链的强度取决于最弱环节）
  const newSupport = Math.min(reg1.supportN ?? 0, reg2.supportN ?? 0);

  return {
    regulationId: `reg_chain_${crypto.randomBytes(4).toString('hex')}`,
    status: 'candidate',
    pre: dedup(newPre),
    eff: dedup(newEff),
    evidenceKind: 'observational',
    supportN: newSupport,
    counterexampleN: 0,
    explainedCount: 0,
    failedPredictions: 0,
    level: newLevel,
    derivedFrom: [reg1.regulationId, reg2.regulationId],
    description: `链式组合: [${reg1.description || reg1.regulationId}] → [${reg2.description || reg2.regulationId}]`,
    tags: ['composed', 'chain'],
  };
}

// =============================================================================
// 条件组合：A→C + B→C = (A∧B)→C
// =============================================================================

/**
 * 检查两条 regulation 是否可以条件组合（共享 eff）
 */
export function canMergeConditions(reg1: Regulation, reg2: Regulation): boolean {
  const eff1Sigs = new Set(reg1.eff.map(f => signaturePredValue(f)));
  return reg2.eff.some(e => eff1Sigs.has(signaturePredValue(e)));
}

/**
 * 条件组合：两条指向相同 eff 的 regulation 合并 pre
 *
 * 例：reg1: [空指针] → [500 错误]
 *     reg2: [超时] → [500 错误]
 *     结果: [空指针 ∨ 超时] → [500 错误]  (derivedFrom: [reg1, reg2])
 *     （语义：500 错误有两种可能原因）
 */
export function mergeConditions(reg1: Regulation, reg2: Regulation): Regulation | null {
  if (!canMergeConditions(reg1, reg2)) return null;

  // 共同的 eff
  const eff1Sigs = new Set(reg1.eff.map(f => signaturePredValue(f)));
  const commonEff = reg2.eff.filter(e => eff1Sigs.has(signaturePredValue(e)));
  if (commonEff.length === 0) return null;

  const newLevel = Math.max(getLevel(reg1), getLevel(reg2)) + 1;
  const newSupport = (reg1.supportN ?? 0) + (reg2.supportN ?? 0);

  return {
    regulationId: `reg_merge_${crypto.randomBytes(4).toString('hex')}`,
    status: 'candidate',
    pre: dedup([...reg1.pre, ...reg2.pre]),
    eff: commonEff,
    evidenceKind: 'observational',
    supportN: newSupport,
    counterexampleN: 0,
    explainedCount: 0,
    failedPredictions: 0,
    level: newLevel,
    derivedFrom: [reg1.regulationId, reg2.regulationId],
    description: `条件合并: [${reg1.description || reg1.regulationId}] ∨ [${reg2.description || reg2.regulationId}]`,
    tags: ['composed', 'merge'],
  };
}

// =============================================================================
// 知识追溯：从高层定理到公理的完整链
// =============================================================================

/** 知识追溯节点 */
export interface KnowledgeTraceNode {
  regulationId: string;
  level: number;
  description: string;
  pre: Fact[];
  eff: Fact[];
  children: KnowledgeTraceNode[];
}

/**
 * 从一条 regulation 追溯其完整的知识来源树
 * 递归展开 derivedFrom，直到到达公理（level=0）
 */
export function traceKnowledge(
  regId: string,
  lookup: (id: string) => Regulation | null,
  maxDepth = 10
): KnowledgeTraceNode | null {
  const reg = lookup(regId);
  if (!reg) return null;

  const children: KnowledgeTraceNode[] = [];
  if (reg.derivedFrom && reg.derivedFrom.length > 0 && maxDepth > 0) {
    for (const parentId of reg.derivedFrom) {
      const child = traceKnowledge(parentId, lookup, maxDepth - 1);
      if (child) children.push(child);
    }
  }

  return {
    regulationId: reg.regulationId,
    level: getLevel(reg),
    description: reg.description || '',
    pre: reg.pre,
    eff: reg.eff,
    children,
  };
}

/**
 * 将知识追溯树渲染为人类可读的"来龙去脉"文本
 */
export function renderKnowledgeTrace(node: KnowledgeTraceNode, indent = 0): string {
  const prefix = '  '.repeat(indent);
  const levelTag = node.level === 0 ? '[公理]' : `[L${node.level}]`;
  const preSummary = node.pre.map(f => `${f.pred}=${JSON.stringify(f.value)}`).join(' ∧ ');
  const effSummary = node.eff.map(f => `${f.pred}=${JSON.stringify(f.value)}`).join(' ∧ ');

  let text = `${prefix}${levelTag} ${preSummary} → ${effSummary}`;
  if (node.description) text += `  // ${node.description}`;
  text += '\n';

  for (const child of node.children) {
    text += `${prefix}  ↑ 因为:\n`;
    text += renderKnowledgeTrace(child, indent + 2);
  }

  return text;
}

// =============================================================================
// 自动组合发现
// =============================================================================

/**
 * 扫描所有 regulations，自动发现可组合的对并生成派生知识
 * 返回新发现的组合 regulation 列表
 */
export function discoverCompositions(
  regulations: Regulation[],
  maxNew = 20
): Regulation[] {
  const newRegs: Regulation[] = [];
  const existingSigs = new Set(
    regulations.map(r => {
      const pre = r.pre.map(f => signaturePredValue(f)).sort().join('+');
      const eff = r.eff.map(f => signaturePredValue(f)).sort().join('+');
      return `${pre}→${eff}`;
    })
  );

  // 链式组合
  for (const r1 of regulations) {
    for (const r2 of regulations) {
      if (r1.regulationId === r2.regulationId) continue;
      if (newRegs.length >= maxNew) break;

      const composed = chainCompose(r1, r2);
      if (composed) {
        const sig = composed.pre.map(f => signaturePredValue(f)).sort().join('+')
          + '→' + composed.eff.map(f => signaturePredValue(f)).sort().join('+');
        if (!existingSigs.has(sig)) {
          existingSigs.add(sig);
          newRegs.push(composed);
        }
      }
    }
    if (newRegs.length >= maxNew) break;
  }

  return newRegs;
}

// =============================================================================
// 辅助
// =============================================================================

function dedup(facts: Fact[]): Fact[] {
  const seen = new Set<string>();
  return facts.filter(f => {
    const sig = signaturePredValue(f);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}
