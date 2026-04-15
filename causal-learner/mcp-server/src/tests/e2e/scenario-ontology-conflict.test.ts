/**
 * E2E Scenario C: Ontology Conflict
 * 覆盖层：v9 OntologyFederation + TranslationFunctor + ConflictSet + v10 InstitutionModel + v11
 *
 * 试验场景：临床本体 vs 工程系统本体之间的跨域翻译与冲突检测
 * 理论驱动的测试维度：
 *   1. 两个本体各自内部不变量（concepts 非空、localId 唯一）
 *   2. TranslationFunctor：部分概念可翻译，diagnosis/treatment 无映射
 *   3. ConflictSet：收集无法翻译的概念冲突，支持解决标记
 *   4. InstitutionModel：制度权限检查（allowedRoles / forbiddenRoles）
 *   5. CounterexampleCommons：翻译失败反例
 *   6. ProofLineage + 宪法审计：跨域推理链
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createOntologyModel } from '../../core/ontology-model.js';
import { createTranslationFunctor, translateAtomRef } from '../../core/translation-functor.js';
import { createConflictSet, appendConflictEntry, resolveConflictEntry } from '../../core/conflict-set.js';
import { createInstitutionModel, checkRolePermission } from '../../core/institution-model.js';
import { createCounterexampleCommons, appendCounterexample, searchBySeverity } from '../../core/counterexample-commons.js';
import { buildProofLineage } from '../../core/proof-lineage.js';
import { createDefaultConstitutionalLayer, auditSubject } from '../../core/constitutional-layer.js';
import { createDerivationTrace } from '../../core/derivation-trace.js';
import { makeStep } from './e2e-helpers.js';

// =============================================================================
// 本体夹具
// =============================================================================

const medicalOntology = createOntologyModel({
  name:        '临床本体 v1',
  description: '临床决策支持系统的概念体系',
  concepts: [
    { localId: 'patient',    kind: 'entity',    label: '患者',    description: '接受医疗服务的个体' },
    { localId: 'vital_sign', kind: 'attribute', label: '生命体征', description: '体温/脉搏/血压等' },
    { localId: 'diagnosis',  kind: 'relation',  label: '诊断关系', description: '医生→患者的诊断行为' },
    { localId: 'treatment',  kind: 'relation',  label: '治疗关系', description: '医生→患者的治疗行为' },
  ],
});

const engineeringOntology = createOntologyModel({
  name:        '工程系统本体 v1',
  description: '分布式工程系统的概念体系',
  concepts: [
    { localId: 'agent',      kind: 'entity',    label: '智能体',   description: '系统中的自主执行单元' },
    { localId: 'state_var',  kind: 'attribute', label: '状态变量', description: '可观测的系统状态' },
    { localId: 'transition', kind: 'relation',  label: '状态转移', description: '状态变化边' },
  ],
});

// patient→agent, vital_sign→state_var；diagnosis / treatment 无映射
const functor = createTranslationFunctor({
  name:             '临床→工程翻译函子',
  sourceOntologyId: medicalOntology.id,
  targetOntologyId: engineeringOntology.id,
  mappings: [
    { sourceConceptId: 'patient',    targetConceptId: 'agent',     confidence: 0.85 },
    { sourceConceptId: 'vital_sign', targetConceptId: 'state_var', confidence: 0.72 },
  ],
  strictMode: false,
});

// =============================================================================
// 1. OntologyModel 内部不变量
// =============================================================================

describe('Scenario C — OntologyModel 不变量', () => {
  it('临床本体创建成功（OM_ 前缀）', () => {
    assert.ok(medicalOntology.id.startsWith('OM_'));
    assert.equal(medicalOntology.concepts.length, 4);
  });

  it('concepts 为空 → 抛出 OntologyModel 不变量 1', () => {
    assert.throws(
      () => createOntologyModel({ name: '空本体', description: '', concepts: [] }),
      /不变量 1/,
    );
  });

  it('localId 重复 → 抛出 OntologyModel 不变量 2', () => {
    assert.throws(
      () => createOntologyModel({
        name:     '重复本体',
        description: '',
        concepts: [
          { localId: 'dup', kind: 'entity', label: 'A' },
          { localId: 'dup', kind: 'entity', label: 'B' },
        ],
      }),
      /不变量 2/,
    );
  });
});

// =============================================================================
// 2. TranslationFunctor 翻译
// =============================================================================

describe('Scenario C — TranslationFunctor 跨本体翻译', () => {
  it('patient:P001 → agent:P001（置信度 0.85）', () => {
    const r = translateAtomRef(functor, 'patient:P001', medicalOntology, engineeringOntology);
    assert.equal(r.success, true);
    assert.equal(r.translatedRef, 'agent:P001');
    assert.ok((r.appliedMapping?.confidence ?? 0) >= 0.8);
  });

  it('vital_sign:V001 → state_var:V001', () => {
    const r = translateAtomRef(functor, 'vital_sign:V001', medicalOntology, engineeringOntology);
    assert.equal(r.success, true);
    assert.equal(r.translatedRef, 'state_var:V001');
  });

  it('diagnosis:D001 → null（无映射规则）', () => {
    const r = translateAtomRef(functor, 'diagnosis:D001', medicalOntology, engineeringOntology);
    assert.equal(r.success, false);
    assert.equal(r.translatedRef, null);
    assert.ok(r.failReason?.includes('映射规则'));
  });

  it('treatment:T001 → null（无映射规则）', () => {
    const r = translateAtomRef(functor, 'treatment:T001', medicalOntology, engineeringOntology);
    assert.equal(r.success, false);
    assert.equal(r.translatedRef, null);
  });

  it('不存在的概念 → 源本体校验失败', () => {
    const r = translateAtomRef(functor, 'unknown_concept:X', medicalOntology, engineeringOntology);
    assert.equal(r.success, false);
    assert.ok(r.failReason?.includes('不存在'));
  });

  it('TranslationFunctor 不变量：源目标本体不能相同', () => {
    assert.throws(
      () => createTranslationFunctor({
        name:             '自环函子',
        sourceOntologyId: 'OM_same',
        targetOntologyId: 'OM_same',
        mappings: [{ sourceConceptId: 'a', targetConceptId: 'b', confidence: 0.5 }],
      }),
      /不变量 2/,
    );
  });
});

// =============================================================================
// 3. ConflictSet 冲突收集与解决
// =============================================================================

describe('Scenario C — ConflictSet 冲突收集', () => {
  it('diagnosis 无映射 → 写入 concept_absent 冲突', () => {
    let cs = createConflictSet({ name: '临床-工程冲突集', translationFunctorId: functor.id });
    cs = appendConflictEntry(cs, {
      entityRef:    'diagnosis:D001',
      ontologyAId:  medicalOntology.id,
      descriptionA: JSON.stringify({ kind: 'relation', label: '诊断关系' }),
      ontologyBId:  engineeringOntology.id,
      descriptionB: '(absent)',
      kind:         'concept_absent',
      explanation:  '工程本体中无与 diagnosis 对应的关系概念',
    });
    assert.equal(cs.entries.length, 1);
    assert.equal(cs.entries[0].kind, 'concept_absent');
    assert.equal(cs.entries[0].resolved, false);
  });

  it('treatment 再写入一条冲突 → 共 2 条', () => {
    let cs = createConflictSet({ name: '冲突集', translationFunctorId: functor.id });
    cs = appendConflictEntry(cs, {
      entityRef: 'diagnosis:D001', ontologyAId: medicalOntology.id,
      descriptionA: '{}', ontologyBId: engineeringOntology.id, descriptionB: '(absent)',
      kind: 'concept_absent', explanation: 'diagnosis 缺失',
    });
    cs = appendConflictEntry(cs, {
      entityRef: 'treatment:T001', ontologyAId: medicalOntology.id,
      descriptionA: '{}', ontologyBId: engineeringOntology.id, descriptionB: '(absent)',
      kind: 'concept_absent', explanation: 'treatment 缺失',
    });
    assert.equal(cs.entries.length, 2);
  });

  it('resolveConflictEntry：解决第一条，第二条不受影响', () => {
    let cs = createConflictSet({ name: '冲突集', translationFunctorId: functor.id });
    cs = appendConflictEntry(cs, {
      entityRef: 'diagnosis:D001', ontologyAId: medicalOntology.id,
      descriptionA: '{}', ontologyBId: engineeringOntology.id, descriptionB: '(absent)',
      kind: 'concept_absent', explanation: 'diagnosis',
    });
    cs = appendConflictEntry(cs, {
      entityRef: 'treatment:T001', ontologyAId: medicalOntology.id,
      descriptionA: '{}', ontologyBId: engineeringOntology.id, descriptionB: '(absent)',
      kind: 'concept_absent', explanation: 'treatment',
    });
    const firstId = cs.entries[0].id;
    cs = resolveConflictEntry(cs, firstId, '手动映射 diagnosis → transition，已更新函子');
    assert.equal(cs.entries[0].resolved, true);
    assert.ok(cs.entries[0].resolution?.includes('transition'));
    assert.equal(cs.entries[1].resolved, false, '其他条目不受影响');
  });
});

// =============================================================================
// 4. InstitutionModel 制度权限检查
// =============================================================================

describe('Scenario C — InstitutionModel 制度权限（v10）', () => {
  const institution = createInstitutionModel({
    name:        '医疗数据治理制度',
    description: '规定谁可以读写临床数据',
    rules: [
      {
        id:                    'R001',
        description:           '只有临床医生可以修改诊断数据',
        constrainedActionKind: 'modify_diagnosis',
        allowedRoles:          ['clinician'],
        forbiddenRoles:        ['data_scientist'],
        priority:              10,
      },
      {
        id:                    'R002',
        description:           '所有角色可读取生命体征',
        constrainedActionKind: 'read_vital_sign',
        allowedRoles:          [],
        forbiddenRoles:        [],
        priority:              1,
      },
    ],
    roleAssignments: [
      { agentRef: 'agent:Dr_Smith', role: 'clinician'      },
      { agentRef: 'agent:DS_Alice', role: 'data_scientist' },
    ],
  });

  it('临床医生有权修改诊断数据', () => {
    const r = checkRolePermission(institution, 'agent:Dr_Smith', 'modify_diagnosis');
    assert.equal(r.allowed, true);
  });

  it('数据科学家不允许修改诊断数据（forbiddenRoles 命中）', () => {
    const r = checkRolePermission(institution, 'agent:DS_Alice', 'modify_diagnosis');
    assert.equal(r.allowed, false);
    assert.ok(r.reason.includes('DS_Alice') || r.reason.includes('禁止'));
  });

  it('所有角色可读取生命体征（allowedRoles 为空 = 全部允许）', () => {
    assert.equal(checkRolePermission(institution, 'agent:Dr_Smith', 'read_vital_sign').allowed, true);
    assert.equal(checkRolePermission(institution, 'agent:DS_Alice', 'read_vital_sign').allowed, true);
  });

  it('无制度规则的动作默认允许（开放世界假设）', () => {
    const r = checkRolePermission(institution, 'agent:DS_Alice', 'train_model');
    assert.equal(r.allowed, true);
    assert.equal(r.matchedRule, null);
  });

  it('InstitutionModel 不变量 I1：rules 为空 → 抛出错误', () => {
    assert.throws(
      () => createInstitutionModel({ name: '空制度', description: '', rules: [] }),
      /I1/,
    );
  });
});

// =============================================================================
// 5. CounterexampleCommons：翻译失败反例
// =============================================================================

describe('Scenario C — 翻译失败反例（v11）', () => {
  it('diagnosis 翻译失败写入 critical 反例', () => {
    let commons = createCounterexampleCommons({ name: '本体翻译反例库', description: '' });
    commons = appendCounterexample(commons, {
      refutedClaimRef: '临床本体可完整映射到工程本体',
      description:     'diagnosis 概念在工程本体中无对应，翻译函子不完备',
      evidenceRefs:    ['translation_result:diagnosis:D001'],
      triggerContext:  'cross-ontology translation between medical and engineering domains',
      severity:        'critical',
    });
    const criticals = searchBySeverity(commons, 'critical');
    assert.equal(criticals.length, 1);
    assert.ok(criticals[0].description.includes('diagnosis'));
  });
});

// =============================================================================
// 6. ProofLineage + 宪法审计：跨本体推理链
// =============================================================================

describe('Scenario C — 跨本体推理链宪法审计（v11）', () => {
  it('翻译不完备推导链通过 mandatory 约束', () => {
    const crossTrace = createDerivationTrace({
      id:               'DT_cross_001',
      contextKind:      'inference',
      premiseClaimIds:  ['C_diagnosis_in_medical', 'C_diagnosis_absent_in_engineering'],
      conclusionClaimId: 'C_ontology_translation_incomplete',
      proof: [
        makeStep('C_diagnosis_in_medical',          'C_no_mapping_found'),
        makeStep('C_no_mapping_found',              'C_ontology_translation_incomplete'),
      ],
      supportLinks:     [],
      rejectedClaimIds: ['C_translation_succeeded'],
    });

    const lineage = buildProofLineage([crossTrace], '跨本体翻译不完备证明谱系');
    const layer   = createDefaultConstitutionalLayer();
    const audit   = auditSubject(layer, lineage, 'ProofLineage');

    assert.equal(audit.mandatoryPassed, true);
    assert.equal(lineage.conclusionClaimId, 'C_ontology_translation_incomplete');
    assert.equal(lineage.completeness, 'complete');
  });
});
