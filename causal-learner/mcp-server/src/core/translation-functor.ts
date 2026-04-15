/**
 * TranslationFunctor — v9 跨本体翻译函子
 * implements: docs/current/ontology-federation-contract.md
 *
 * TranslationFunctor 在两个 OntologyModel 之间映射 Atom（概念实例）。
 * 若映射不完整则返回 null，冲突记录到 ConflictSet。
 */

import crypto from 'crypto';
import type { OntologyModel, OntologyConcept } from './ontology-model.js';

// =============================================================================
// 类型定义
// =============================================================================

/** 单条概念映射规则 */
export interface ConceptMapping {
  /** 源本体的 localId */
  sourceConceptId: string;
  /** 目标本体的 localId */
  targetConceptId: string;
  /** 映射置信度 [0, 1] */
  confidence: number;
  /** 映射说明 */
  rationale?: string;
}

/** 翻译结果 */
export interface TranslationResult {
  /** 原始 Atom ref */
  sourceRef: string;
  /** 翻译后的 Atom ref（null = 无法映射） */
  translatedRef: string | null;
  /** 实际使用的映射规则 */
  appliedMapping: ConceptMapping | null;
  /** 翻译是否成功 */
  success: boolean;
  /** 失败原因（成功时为 undefined） */
  failReason?: string;
}

/** 翻译函子 */
export interface TranslationFunctor {
  id: string;
  name: string;
  /** 源本体 ID */
  sourceOntologyId: string;
  /** 目标本体 ID */
  targetOntologyId: string;
  /** 映射规则集（不变量 1：至少一条） */
  mappings: ConceptMapping[];
  /** 默认行为：映射失败时是否报错（false = 返回 null） */
  strictMode: boolean;
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateTranslationFunctorInput {
  id?: string;
  name: string;
  sourceOntologyId: string;
  targetOntologyId: string;
  mappings: ConceptMapping[];
  strictMode?: boolean;
  createdBy?: string;
  status?: TranslationFunctor['status'];
}

export function createTranslationFunctor(
  input: CreateTranslationFunctorInput
): TranslationFunctor {
  // 不变量 1：mappings 非空
  if (!input.mappings || input.mappings.length === 0) {
    throw new Error('TranslationFunctor 不变量 1：mappings 不可为空');
  }
  // 不变量 2：源本体和目标本体不能相同
  if (input.sourceOntologyId === input.targetOntologyId) {
    throw new Error('TranslationFunctor 不变量 2：sourceOntologyId 与 targetOntologyId 不可相同');
  }
  // 不变量 3：confidence 必须在 [0,1]
  for (const m of input.mappings) {
    if (m.confidence < 0 || m.confidence > 1) {
      throw new Error(
        `TranslationFunctor 不变量 3：mapping "${m.sourceConceptId}" → "${m.targetConceptId}" 的 confidence 必须在 [0,1]`
      );
    }
  }

  return {
    id:                input.id ?? `TF_${crypto.randomBytes(6).toString('hex')}`,
    name:              input.name,
    sourceOntologyId:  input.sourceOntologyId,
    targetOntologyId:  input.targetOntologyId,
    mappings:          input.mappings,
    strictMode:        input.strictMode ?? false,
    createdAt:         new Date().toISOString(),
    createdBy:         input.createdBy ?? 'system',
    status:            input.status ?? 'draft',
  };
}

// =============================================================================
// 翻译执行
// =============================================================================

/**
 * 将一个 Atom ref（格式：`<conceptLocalId>:<instanceId>`）从源本体翻译到目标本体。
 *
 * @param functor  翻译函子
 * @param sourceRef  源 Atom ref（格式 `conceptLocalId:instanceId` 或纯 conceptLocalId）
 * @param sourceOntology  源 OntologyModel（用于验证 conceptLocalId 是否存在）
 * @param targetOntology  目标 OntologyModel（用于验证 targetConceptId 是否存在）
 * @returns TranslationResult
 */
export function translateAtomRef(
  functor: TranslationFunctor,
  sourceRef: string,
  sourceOntology: OntologyModel,
  targetOntology: OntologyModel
): TranslationResult {
  // 解析 sourceRef
  const [conceptLocalId, instanceId] = sourceRef.includes(':')
    ? sourceRef.split(':', 2)
    : [sourceRef, undefined];

  // 验证源概念存在
  const sourceConcept: OntologyConcept | undefined = sourceOntology.concepts.find(
    c => c.localId === conceptLocalId
  );
  if (!sourceConcept) {
    return {
      sourceRef,
      translatedRef: null,
      appliedMapping: null,
      success: false,
      failReason: `源本体 "${sourceOntology.id}" 中不存在概念 "${conceptLocalId}"`,
    };
  }

  // 查找映射规则（取置信度最高的）
  const candidates = functor.mappings
    .filter(m => m.sourceConceptId === conceptLocalId)
    .sort((a, b) => b.confidence - a.confidence);

  const mapping = candidates[0] ?? null;

  if (!mapping) {
    return {
      sourceRef,
      translatedRef: null,
      appliedMapping: null,
      success: false,
      failReason: `翻译函子中无 "${conceptLocalId}" 的映射规则`,
    };
  }

  // 验证目标概念存在
  const targetConcept: OntologyConcept | undefined = targetOntology.concepts.find(
    c => c.localId === mapping.targetConceptId
  );
  if (!targetConcept) {
    return {
      sourceRef,
      translatedRef: null,
      appliedMapping: mapping,
      success: false,
      failReason: `目标本体 "${targetOntology.id}" 中不存在概念 "${mapping.targetConceptId}"`,
    };
  }

  const translatedRef = instanceId
    ? `${mapping.targetConceptId}:${instanceId}`
    : mapping.targetConceptId;

  return {
    sourceRef,
    translatedRef,
    appliedMapping: mapping,
    success: true,
  };
}
