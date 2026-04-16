/**
 * 诊断推理引擎 — 因果学习系统的核心交互能力
 *
 * 不是等用户给完所有信息再匹配，而是：
 * 1. 根据已知信息识别候选解释
 * 2. 找出每个候选解释缺少的关键信息
 * 3. 生成针对性的追问
 * 4. 随着信息补充逐步收敛到最佳解释
 * 5. 基于解释提出改进建议
 *
 * 类比：医生问诊，不是一次性做所有检查，而是根据症状逐步缩小范围
 */

import type { CausalStorage } from '../core/storage.js';
import type { Observation, Fact, Regulation, Event } from '../core/types.js';
import { explainObservation, EffectIndex } from '../core/explainer.js';
import type { ProvenanceStep } from '../core/explainer.js';
import { signaturePredValue } from '../core/unify.js';

// =============================================================================
// 类型定义
// =============================================================================

/** 单个候选解释 */
export interface CandidateExplanation {
  /** 匹配的 regulation ID */
  regulationId: string;
  /** regulation 描述 */
  description: string;
  /** 已满足的前提条件 */
  satisfiedPre: Fact[];
  /** 缺失的前提条件（需要追问的） */
  missingPre: Fact[];
  /** 当前置信度 [0, 1] */
  confidence: number;
  /** 如果补齐 missingPre，预计置信度提升到多少 */
  confidenceIfComplete: number;
  /** 该解释的因果链（如果有 provenance） */
  causalChain: string[];
}

/** 诊断引擎生成的追问 */
export interface DiagnosticQuestion {
  /** 问题 ID（用于关联回答） */
  questionId: string;
  /** 追问的自然语言表述 */
  question: string;
  /** 对应的 fact predicate（回答后填入哪个 pred） */
  targetPred: string;
  /** 期望的值选项（如果可枚举） */
  expectedValues?: string[];
  /** 追问的优先级（越高越应该先问） */
  priority: number;
  /** 追问原因：哪个候选解释需要这个信息 */
  rationale: string;
}

/** 完整诊断结果 */
export interface DiagnosticResult {
  /** 当前阶段：gathering（收集信息）| converged（已收敛）| insufficient（信息不足以诊断） */
  stage: 'gathering' | 'converged' | 'insufficient';
  /** 候选解释列表（按置信度排序） */
  candidates: CandidateExplanation[];
  /** 需要追问的问题列表（按优先级排序） */
  questions: DiagnosticQuestion[];
  /** 最佳解释（stage=converged 时有值） */
  bestExplanation: CandidateExplanation | null;
  /** 改进建议（stage=converged 时有值） */
  recommendations: string[];
  /** 诊断摘要 */
  summary: string;
}

// =============================================================================
// 核心诊断逻辑
// =============================================================================

let questionCounter = 0;
function nextQuestionId(): string {
  return `Q_${++questionCounter}`;
}

/**
 * 从已知 facts 和 regulations 中找候选解释，识别信息缺口
 */
function findCandidates(
  knownFacts: Fact[],
  regulations: Regulation[],
  context?: Record<string, unknown>
): CandidateExplanation[] {
  const candidates: CandidateExplanation[] = [];
  const knownSigs = new Set(knownFacts.map(f => signaturePredValue(f)));

  for (const reg of regulations) {
    if (reg.status === 'retired') continue;

    // 检查 eff 是否与已知 facts 相关（至少一个 eff 的 pred 在已知 facts 中出现）
    const effRelevant = reg.eff.some(e =>
      knownFacts.some(f => f.pred === e.pred)
    );
    // 或者 pre 部分匹配
    const satisfiedPre: Fact[] = [];
    const missingPre: Fact[] = [];
    for (const pre of reg.pre) {
      if (knownSigs.has(signaturePredValue(pre))) {
        satisfiedPre.push(pre);
      } else {
        // 宽松匹配：pred 相同但 value 不同也算"部分相关"
        const partialMatch = knownFacts.some(f => f.pred === pre.pred);
        if (partialMatch) {
          satisfiedPre.push(pre);
        } else {
          missingPre.push(pre);
        }
      }
    }

    const totalPre = reg.pre.length || 1;
    const satisfiedRatio = satisfiedPre.length / totalPre;

    // 至少有一个 pre 匹配，或者 eff 相关
    if (satisfiedRatio > 0 || effRelevant) {
      // 置信度 = 已满足前提比例 × regulation 本身的可信度
      const regCredibility = reg.supportN
        ? reg.supportN / (reg.supportN + (reg.counterexampleN || 0) + 1)
        : 0.3;
      const confidence = satisfiedRatio * regCredibility;
      const confidenceIfComplete = regCredibility;

      // 因果链描述
      const causalChain = [
        ...satisfiedPre.map(f => `${f.pred}=${JSON.stringify(f.value)}`),
        '→',
        ...reg.eff.map(f => `${f.pred}=${JSON.stringify(f.value)}`),
      ];

      candidates.push({
        regulationId: reg.regulationId,
        description: reg.description || `${reg.pre.map(f => f.pred).join('+')} → ${reg.eff.map(f => f.pred).join('+')}`,
        satisfiedPre,
        missingPre,
        confidence,
        confidenceIfComplete,
        causalChain,
      });
    }
  }

  // 按置信度排序
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

/**
 * 从候选解释的 missingPre 中生成追问列表
 */
function generateQuestions(candidates: CandidateExplanation[]): DiagnosticQuestion[] {
  const questions: DiagnosticQuestion[] = [];
  const askedPreds = new Set<string>();

  for (const candidate of candidates) {
    for (const missing of candidate.missingPre) {
      if (askedPreds.has(missing.pred)) continue;
      askedPreds.add(missing.pred);

      // 计算优先级：候选置信度越高 + 缺失的 pre 越少 → 优先级越高
      const priority = candidate.confidence * (1 / (candidate.missingPre.length || 1));

      // 生成自然语言问题
      const question = generateNaturalQuestion(missing, candidate);

      questions.push({
        questionId: nextQuestionId(),
        question,
        targetPred: missing.pred,
        expectedValues: typeof missing.value === 'string' ? [missing.value] : undefined,
        priority,
        rationale: `确认后可能匹配规律: ${candidate.description}`,
      });
    }
  }

  questions.sort((a, b) => b.priority - a.priority);
  return questions;
}

/**
 * 将 missing fact 转为自然语言追问
 */
function generateNaturalQuestion(missing: Fact, candidate: CandidateExplanation): string {
  const pred = missing.pred;
  const value = missing.value;

  // 常见 predicate 的自然语言映射
  const predQuestions: Record<string, string> = {
    'error_type': '错误类型是什么？（如 TypeError、ValueError 等）',
    'error_file': '错误发生在哪个文件？',
    'error_line': '错误在第几行？',
    'affected_module': '受影响的模块/组件是哪个？',
    'symptom': '具体的错误表现是什么？',
    'trigger': '什么操作触发了这个问题？',
    'env': '运行环境是什么？（如 production、staging、local）',
    'root_cause': '你怀疑的根本原因是什么？',
    'severity': '问题严重程度？（low/medium/high/critical）',
    'repo': '这是哪个项目/仓库的问题？',
    'direction': '这个变化是改善还是退化？',
    'magnitude': '变化的幅度是多少？',
    'cause': '做了什么改动导致的？',
    'effect': '产生了什么效果？',
  };

  if (predQuestions[pred]) {
    return predQuestions[pred];
  }

  // 通用追问
  if (value !== undefined && value !== null) {
    return `请确认 ${pred} 是否为 ${JSON.stringify(value)}？`;
  }
  return `${pred} 的值是什么？`;
}

/**
 * 基于最佳解释生成改进建议
 */
function generateRecommendations(
  best: CandidateExplanation,
  regulation: Regulation | null,
  historicalFixes: Event[]
): string[] {
  const recs: string[] = [];

  // 基于 regulation 的 eff（效果）推断修复方向
  if (regulation) {
    for (const eff of regulation.eff) {
      if (eff.pred === 'root_cause' && typeof eff.value === 'string') {
        recs.push(`根因: ${eff.value}`);
      }
      if (eff.pred === 'fix_strategy' && typeof eff.value === 'string') {
        recs.push(`建议修复: ${eff.value}`);
      }
      if (eff.pred === 'bug_category' && typeof eff.value === 'string') {
        recs.push(`问题分类: ${eff.value}，参考该类问题的通用修复策略`);
      }
    }

    // 从 regulation 的 origin 中提取历史修复信息
    const origin = regulation.origin as Record<string, unknown> | undefined;
    if (origin?.fixCommit) {
      recs.push(`历史修复参考: ${origin.fixCommit}`);
    }
  }

  // 基于历史类似事件的修复
  for (const evt of historicalFixes.slice(0, 3)) {
    if (evt.status === 'resolved' && evt.context) {
      const ctx = evt.context as Record<string, unknown>;
      if (ctx.fixDescription) {
        recs.push(`历史案例 ${evt.eventId}: ${ctx.fixDescription}`);
      }
    }
  }

  // 通用建议
  if (best.missingPre.length > 0) {
    recs.push(`注意: 还有 ${best.missingPre.length} 个前提条件未确认，诊断可能不完整`);
  }

  if (recs.length === 0) {
    recs.push('建议: 补充更多信息后重新诊断，或用 /learn-from-debug 记录修复过程帮助引擎学习');
  }

  return recs;
}

// =============================================================================
// 主入口
// =============================================================================

/**
 * 诊断推理主函数
 *
 * @param storage v7-v8 存储
 * @param knownFacts 当前已知的 facts
 * @param context 上下文
 * @returns 诊断结果（候选解释 + 追问 + 建议）
 */
export function diagnose(
  storage: CausalStorage,
  knownFacts: Fact[],
  context?: Record<string, unknown>
): DiagnosticResult {
  const regulations = storage.listRegulations({ limit: 500 })
    .filter(r => r.status !== 'retired');

  if (regulations.length === 0) {
    return {
      stage: 'insufficient',
      candidates: [],
      questions: [],
      bestExplanation: null,
      recommendations: ['引擎知识库为空。请先用 /learn-natural 或 /learn-from-debug 录入实验/debug 经验。'],
      summary: '知识库为空，无法诊断。',
    };
  }

  // 找候选解释
  const candidates = findCandidates(knownFacts, regulations, context);

  if (candidates.length === 0) {
    return {
      stage: 'insufficient',
      candidates: [],
      questions: generateQuestionsFromScratch(regulations),
      bestExplanation: null,
      recommendations: ['当前信息不足以匹配任何已知规律。请补充以上问题的回答。'],
      summary: '未匹配到已知规律，需要更多信息。',
    };
  }

  // 检查是否收敛：最佳候选的置信度 > 0.6 且 missingPre 为空
  const best = candidates[0];
  const converged = best.confidence > 0.6 && best.missingPre.length === 0;

  if (converged) {
    // 已收敛，生成改进建议
    const reg = storage.getRegulation(best.regulationId);
    const historicalEvents = storage.listEvents({ status: 'resolved', limit: 10 });

    return {
      stage: 'converged',
      candidates: candidates.slice(0, 5),
      questions: [],
      bestExplanation: best,
      recommendations: generateRecommendations(best, reg, historicalEvents),
      summary: `诊断收敛: ${best.description} (置信度 ${(best.confidence * 100).toFixed(0)}%)`,
    };
  }

  // 未收敛，生成追问
  const questions = generateQuestions(candidates.slice(0, 5));

  return {
    stage: 'gathering',
    candidates: candidates.slice(0, 5),
    questions: questions.slice(0, 5),
    bestExplanation: null,
    recommendations: [],
    summary: `${candidates.length} 个候选解释，最高置信度 ${(best.confidence * 100).toFixed(0)}%。需要补充 ${questions.length} 项信息。`,
  };
}

/**
 * 从零开始时生成通用追问（没有任何候选匹配时）
 */
function generateQuestionsFromScratch(regulations: Regulation[]): DiagnosticQuestion[] {
  // 统计 regulations 中最常出现的 pre preds
  const predFreq = new Map<string, number>();
  for (const reg of regulations) {
    for (const pre of reg.pre) {
      predFreq.set(pre.pred, (predFreq.get(pre.pred) || 0) + 1);
    }
  }

  const sorted = [...predFreq.entries()].sort((a, b) => b[1] - a[1]);

  return sorted.slice(0, 5).map(([pred, freq]) => ({
    questionId: nextQuestionId(),
    question: generateNaturalQuestion({ pred, value: undefined, args: {} }, { missingPre: [], satisfiedPre: [], confidence: 0, confidenceIfComplete: 0, regulationId: '', description: '', causalChain: [] }),
    targetPred: pred,
    priority: freq,
    rationale: `${freq} 条规律需要此信息`,
  }));
}

/**
 * 更新诊断：用户回答了追问后，用新 facts 重新诊断
 */
export function updateDiagnosis(
  storage: CausalStorage,
  previousFacts: Fact[],
  newFacts: Fact[],
  context?: Record<string, unknown>
): DiagnosticResult {
  const allFacts = [...previousFacts, ...newFacts];
  return diagnose(storage, allFacts, context);
}
