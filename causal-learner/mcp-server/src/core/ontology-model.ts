/**
 * OntologyModel — v9 本体模型对象
 * implements: docs/current/ontology-federation-contract.md
 *
 * 一个 OntologyModel 代表一套完整的概念体系：
 * 描述实体类型、关系类型、属性类型，以及该本体的适用范围。
 * 不同 Agent/Observer 可持有不同 OntologyModel 描述同一世界。
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

/** 本体中的概念条目 */
export interface OntologyConcept {
  /** 本体内唯一标识 */
  localId: string;
  /** 概念类型：实体、关系、属性 */
  kind: 'entity' | 'relation' | 'attribute';
  /** 人类可读标签 */
  label: string;
  /** 概念描述 */
  description?: string;
  /** 父概念（本体内继承关系） */
  parentLocalId?: string;
}

/** 本体模型 */
export interface OntologyModel {
  id: string;
  name: string;
  description: string;
  /** 版本标识 */
  version: string;
  /** 该本体的概念集（不变量 1：至少一个概念） */
  concepts: OntologyConcept[];
  /** 适用范围描述（领域、上下文） */
  applicabilityScope: string[];
  /** 是否为权威本体（true = 用于仲裁冲突） */
  isCanonical: boolean;
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateOntologyModelInput {
  id?: string;
  name: string;
  description: string;
  version?: string;
  concepts: OntologyConcept[];
  applicabilityScope?: string[];
  isCanonical?: boolean;
  createdBy?: string;
  status?: OntologyModel['status'];
}

export function createOntologyModel(input: CreateOntologyModelInput): OntologyModel {
  // 不变量 1：concepts 非空
  if (!input.concepts || input.concepts.length === 0) {
    throw new Error('OntologyModel 不变量 1：concepts 不可为空');
  }

  // 不变量 2：localId 在 concepts 内唯一
  const ids = input.concepts.map(c => c.localId);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new Error('OntologyModel 不变量 2：concepts.localId 必须唯一');
  }

  return {
    id:                 input.id ?? `OM_${crypto.randomBytes(6).toString('hex')}`,
    name:               input.name,
    description:        input.description,
    version:            input.version ?? '1.0.0',
    concepts:           input.concepts,
    applicabilityScope: input.applicabilityScope ?? [],
    isCanonical:        input.isCanonical ?? false,
    createdAt:          new Date().toISOString(),
    createdBy:          input.createdBy ?? 'system',
    status:             input.status ?? 'draft',
  };
}
