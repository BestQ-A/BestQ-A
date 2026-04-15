/**
 * v9 OntologyFederation 测试
 * 覆盖：OntologyModel 工厂 + 不变量、TranslationFunctor 翻译逻辑、ConflictSet CRUD
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOntologyModel } from '../core/ontology-model.js';
import {
  createTranslationFunctor,
  translateAtomRef,
} from '../core/translation-functor.js';
import {
  createConflictSet,
  appendConflictEntry,
  resolveConflictEntry,
} from '../core/conflict-set.js';
import { OntologyModelStore } from '../core/ontology-model-store.js';
import { ConflictSetStore } from '../core/conflict-set-store.js';

// =============================================================================
// 测试夹具
// =============================================================================

/** 医学本体（源） */
const medicalOntology = createOntologyModel({
  id: 'OM_medical',
  name: '医学本体',
  description: '以疾病、症状、治疗为核心概念的医学本体',
  version: '1.0.0',
  concepts: [
    { localId: 'Disease',   kind: 'entity',    label: '疾病' },
    { localId: 'Symptom',   kind: 'entity',    label: '症状' },
    { localId: 'Treatment', kind: 'entity',    label: '治疗' },
    { localId: 'causes',    kind: 'relation',  label: '导致' },
    { localId: 'severity',  kind: 'attribute', label: '严重程度' },
  ],
  applicabilityScope: ['临床诊断', '病历分析'],
  isCanonical: true,
});

/** 工程本体（目标） */
const engineeringOntology = createOntologyModel({
  id: 'OM_engineering',
  name: '工程本体',
  description: '以组件、故障、维修为核心概念的工程本体',
  version: '1.0.0',
  concepts: [
    { localId: 'Component', kind: 'entity',    label: '组件' },
    { localId: 'Failure',   kind: 'entity',    label: '故障' },
    { localId: 'Repair',    kind: 'entity',    label: '维修' },
    { localId: 'results_in', kind: 'relation', label: '导致' },
    { localId: 'severity',  kind: 'attribute', label: '严重程度' },
  ],
  applicabilityScope: ['设备维护', '故障分析'],
});

/** 医学 → 工程翻译函子 */
const med2engFunctor = createTranslationFunctor({
  id: 'TF_med_to_eng',
  name: '医学→工程翻译',
  sourceOntologyId: 'OM_medical',
  targetOntologyId: 'OM_engineering',
  mappings: [
    { sourceConceptId: 'Disease',   targetConceptId: 'Failure',    confidence: 0.85 },
    { sourceConceptId: 'Symptom',   targetConceptId: 'Failure',    confidence: 0.60 },
    { sourceConceptId: 'Treatment', targetConceptId: 'Repair',     confidence: 0.90 },
    { sourceConceptId: 'causes',    targetConceptId: 'results_in', confidence: 0.95 },
    { sourceConceptId: 'severity',  targetConceptId: 'severity',   confidence: 1.00 },
  ],
});

// =============================================================================
// OntologyModel 工厂 + 不变量
// =============================================================================

describe('OntologyModel', () => {
  it('正常创建并校验字段', () => {
    assert.equal(medicalOntology.id, 'OM_medical');
    assert.equal(medicalOntology.concepts.length, 5);
    assert.equal(medicalOntology.isCanonical, true);
    assert.equal(medicalOntology.status, 'draft');
  });

  it('不变量 I1：concepts 为空时抛出', () => {
    assert.throws(
      () => createOntologyModel({ name: 'empty', description: '', concepts: [] }),
      /不变量 1/
    );
  });

  it('不变量 I2：localId 重复时抛出', () => {
    assert.throws(
      () => createOntologyModel({
        name: 'dup',
        description: '',
        concepts: [
          { localId: 'X', kind: 'entity', label: 'X' },
          { localId: 'X', kind: 'entity', label: 'X dup' },
        ],
      }),
      /不变量 2/
    );
  });

  it('isCanonical 默认为 false', () => {
    assert.equal(engineeringOntology.isCanonical, false);
  });
});

// =============================================================================
// TranslationFunctor 工厂 + 翻译执行
// =============================================================================

describe('TranslationFunctor', () => {
  it('正常创建并校验字段', () => {
    assert.equal(med2engFunctor.id, 'TF_med_to_eng');
    assert.equal(med2engFunctor.mappings.length, 5);
    assert.equal(med2engFunctor.sourceOntologyId, 'OM_medical');
    assert.equal(med2engFunctor.targetOntologyId, 'OM_engineering');
  });

  it('不变量 I1：mappings 为空时抛出', () => {
    assert.throws(
      () => createTranslationFunctor({
        name: 'empty',
        sourceOntologyId: 'A',
        targetOntologyId: 'B',
        mappings: [],
      }),
      /不变量 1/
    );
  });

  it('不变量 I2：源目标相同时抛出', () => {
    assert.throws(
      () => createTranslationFunctor({
        name: 'self',
        sourceOntologyId: 'A',
        targetOntologyId: 'A',
        mappings: [{ sourceConceptId: 'X', targetConceptId: 'X', confidence: 1 }],
      }),
      /不变量 2/
    );
  });

  it('不变量 I3：confidence 超出 [0,1] 时抛出', () => {
    assert.throws(
      () => createTranslationFunctor({
        name: 'bad',
        sourceOntologyId: 'A',
        targetOntologyId: 'B',
        mappings: [{ sourceConceptId: 'X', targetConceptId: 'Y', confidence: 1.5 }],
      }),
      /不变量 3/
    );
  });
});

describe('translateAtomRef', () => {
  it('Disease:flu → Failure:flu（带 instanceId）', () => {
    const result = translateAtomRef(
      med2engFunctor,
      'Disease:flu',
      medicalOntology,
      engineeringOntology
    );
    assert.equal(result.success, true);
    assert.equal(result.translatedRef, 'Failure:flu');
    assert.equal(result.appliedMapping?.confidence, 0.85);
  });

  it('Treatment（无 instanceId）→ Repair', () => {
    const result = translateAtomRef(
      med2engFunctor,
      'Treatment',
      medicalOntology,
      engineeringOntology
    );
    assert.equal(result.success, true);
    assert.equal(result.translatedRef, 'Repair');
  });

  it('severity → severity（同名属性，置信度 1.0）', () => {
    const result = translateAtomRef(
      med2engFunctor,
      'severity:high',
      medicalOntology,
      engineeringOntology
    );
    assert.equal(result.success, true);
    assert.equal(result.translatedRef, 'severity:high');
    assert.equal(result.appliedMapping?.confidence, 1.0);
  });

  it('多规则取置信度最高：Symptom(0.60) vs Disease(0.85) — 各自独立，Symptom → Failure', () => {
    const result = translateAtomRef(
      med2engFunctor,
      'Symptom:fever',
      medicalOntology,
      engineeringOntology
    );
    assert.equal(result.success, true);
    assert.equal(result.translatedRef, 'Failure:fever');
    assert.equal(result.appliedMapping?.confidence, 0.60);
  });

  it('源本体不存在的概念 → 翻译失败', () => {
    const result = translateAtomRef(
      med2engFunctor,
      'UnknownConcept:x',
      medicalOntology,
      engineeringOntology
    );
    assert.equal(result.success, false);
    assert.ok(result.failReason?.includes('不存在概念'));
  });

  it('无对应映射规则 → 翻译失败', () => {
    // engineeringOntology 有 Component 但 functor 没有针对它的规则
    const result = translateAtomRef(
      med2engFunctor,
      'Component:pump',
      engineeringOntology,  // 故意传工程本体作为源，functor 的 source 是 medical
      engineeringOntology
    );
    assert.equal(result.success, false);
  });
});

// =============================================================================
// ConflictSet CRUD
// =============================================================================

describe('ConflictSet', () => {
  it('createConflictSet：初始 entries 为空', () => {
    const cs = createConflictSet({
      name: '医学-工程冲突集',
      translationFunctorId: 'TF_med_to_eng',
    });
    assert.equal(cs.entries.length, 0);
    assert.ok(cs.id.startsWith('CS_'));
  });

  it('appendConflictEntry：追加冲突条目', () => {
    const cs = createConflictSet({
      name: '测试冲突集',
      translationFunctorId: 'TF_med_to_eng',
    });
    const cs2 = appendConflictEntry(cs, {
      entityRef: 'Disease:flu',
      ontologyAId: 'OM_medical',
      descriptionA: JSON.stringify({ type: 'Disease', label: '流感' }),
      ontologyBId: 'OM_engineering',
      descriptionB: JSON.stringify({ type: 'Component', label: '组件' }),
      kind: 'type_mismatch',
      explanation: '医学本体将 flu 视为疾病，工程本体无直接对应',
    });
    assert.equal(cs2.entries.length, 1);
    assert.equal(cs2.entries[0].resolved, false);
    assert.equal(cs2.entries[0].kind, 'type_mismatch');
  });

  it('appendConflictEntry 是 immutable update（原 cs 不变）', () => {
    const cs = createConflictSet({ name: 'cs', translationFunctorId: 'TF_x' });
    const cs2 = appendConflictEntry(cs, {
      entityRef: 'A',
      ontologyAId: 'O1',
      descriptionA: '{}',
      ontologyBId: 'O2',
      descriptionB: '{}',
      kind: 'concept_absent',
      explanation: 'test',
    });
    assert.equal(cs.entries.length, 0);  // 原对象不变
    assert.equal(cs2.entries.length, 1);
  });

  it('resolveConflictEntry：标记已解决', () => {
    let cs = createConflictSet({ name: 'cs', translationFunctorId: 'TF_x' });
    cs = appendConflictEntry(cs, {
      entityRef: 'X',
      ontologyAId: 'O1',
      descriptionA: '{}',
      ontologyBId: 'O2',
      descriptionB: '{}',
      kind: 'attribute_clash',
      explanation: '属性值不一致',
    });
    const entryId = cs.entries[0].id;
    const cs3 = resolveConflictEntry(cs, entryId, '以 OM_medical 为权威本体');
    assert.equal(cs3.entries[0].resolved, true);
    assert.equal(cs3.entries[0].resolution, '以 OM_medical 为权威本体');
  });
});

// =============================================================================
// OntologyModelStore 持久化
// =============================================================================

describe('OntologyModelStore', () => {
  it('save + get 往返一致', () => {
    const store = new OntologyModelStore(':memory:');
    store.save(medicalOntology);
    const retrieved = store.get('OM_medical');
    assert.ok(retrieved !== null);
    assert.equal(retrieved.name, '医学本体');
    assert.equal(retrieved.concepts.length, 5);
    store.close();
  });

  it('listAll 返回已保存对象', () => {
    const store = new OntologyModelStore(':memory:');
    store.save(medicalOntology);
    store.save(engineeringOntology);
    const all = store.listAll();
    assert.equal(all.length, 2);
    store.close();
  });

  it('listCanonical 只返回 isCanonical=true 的对象', () => {
    const store = new OntologyModelStore(':memory:');
    store.save(medicalOntology);      // isCanonical: true
    store.save(engineeringOntology);  // isCanonical: false
    const canonical = store.listCanonical();
    assert.equal(canonical.length, 1);
    assert.equal(canonical[0].id, 'OM_medical');
    store.close();
  });

  it('get 不存在 ID 返回 null', () => {
    const store = new OntologyModelStore(':memory:');
    assert.equal(store.get('OM_nonexistent'), null);
    store.close();
  });
});

// =============================================================================
// ConflictSetStore 持久化
// =============================================================================

describe('ConflictSetStore', () => {
  it('save + get 往返一致', () => {
    const store = new ConflictSetStore(':memory:');
    let cs = createConflictSet({
      id: 'CS_test',
      name: '测试集',
      translationFunctorId: 'TF_med_to_eng',
    });
    cs = appendConflictEntry(cs, {
      entityRef: 'Disease:flu',
      ontologyAId: 'OM_medical',
      descriptionA: '{}',
      ontologyBId: 'OM_engineering',
      descriptionB: '{}',
      kind: 'type_mismatch',
      explanation: 'test',
    });
    store.save(cs);
    const retrieved = store.get('CS_test');
    assert.ok(retrieved !== null);
    assert.equal(retrieved.entries.length, 1);
    store.close();
  });

  it('listByFunctor 按 functorId 过滤', () => {
    const store = new ConflictSetStore(':memory:');
    const cs1 = createConflictSet({ id: 'CS_a', name: 'a', translationFunctorId: 'TF_1' });
    const cs2 = createConflictSet({ id: 'CS_b', name: 'b', translationFunctorId: 'TF_2' });
    store.save(cs1);
    store.save(cs2);
    const result = store.listByFunctor('TF_1');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'CS_a');
    store.close();
  });
});
