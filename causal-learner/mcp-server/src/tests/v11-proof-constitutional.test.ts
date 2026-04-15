/**
 * v11 ProofLineage + ConstitutionalLayer 测试
 * 覆盖：ProofLineage 从 DerivationTrace 反向重建、ConstitutionalLayer 约束审计
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProofLineage,
  buildProofLineage,
  traceToLineageNode,
} from '../core/proof-lineage.js';
import {
  createConstitutionalLayer,
  createDefaultConstitutionalLayer,
  auditSubject,
  STANDARD_CONSTRAINTS,
} from '../core/constitutional-layer.js';
import { createDerivationTrace } from '../core/derivation-trace.js';
import type { DerivationStep, SupportLink } from '../core/types.js';

// =============================================================================
// 测试夹具
// =============================================================================

let _stepNum = 0;
/** 完整的推导步骤（节点连续、可重放） */
function makeStep(fromId: string, toId: string, replayable = true): DerivationStep {
  return {
    stepNumber:      ++_stepNum,
    from:            { id: fromId, label: fromId, kind: 'claim' },
    relation:        'causes',
    to:              { id: toId,   label: toId,   kind: 'claim' },
    auditReplayable: replayable,
    llmInvolved:     false,
  };
}

/** 构建一条完整 DerivationTrace */
const completeTrace = createDerivationTrace({
  id:               'DT_001',
  episodeId:        'EP_001',
  contextKind:      'reconstruction',
  premiseClaimIds:  ['C_premise_A', 'C_premise_B'],
  conclusionClaimId: 'C_conclusion_1',
  proof: [
    makeStep('C_premise_A', 'C_middle_1'),
    makeStep('C_middle_1', 'C_conclusion_1'),
  ],
  supportLinks:     [{
    id: 'SL_001', observationRecordId: 'OR_001', claimId: 'C_conclusion_1',
    polarity: 'supports', weight: 0.9, sourceKind: 'pipeline',
    sourceRef: null, createdAt: new Date().toISOString(), createdBy: 'test',
  } as SupportLink],
  rejectedClaimIds: ['C_rejected_alt'],
  createdBy:        'test',
});

/** 构建一条不完整的推导链（步骤断裂） */
const brokenTrace = createDerivationTrace({
  id:               'DT_002',
  episodeId:        'EP_002',
  contextKind:      'inference',
  premiseClaimIds:  ['C_conclusion_1'],  // 接续前一条 trace 的结论
  conclusionClaimId: 'C_conclusion_2',
  proof: [
    makeStep('C_conclusion_1', 'C_middle_2'),
    makeStep('C_other',        'C_conclusion_2'),  // 断裂：C_other ≠ C_middle_2
  ],
  supportLinks:     [],
  rejectedClaimIds: [],
  createdBy:        'test',
});

/** 构建一条可重放率低的 trace */
const lowReplayTrace = createDerivationTrace({
  id:               'DT_003',
  episodeId:        'EP_003',
  contextKind:      'inference',
  premiseClaimIds:  ['C_raw'],
  conclusionClaimId: 'C_inferred',
  proof: [
    makeStep('C_raw', 'C_step1', false),  // 不可重放
    makeStep('C_step1', 'C_step2', false),  // 不可重放
    makeStep('C_step2', 'C_inferred', true),  // 可重放
  ],
  supportLinks:     [],
  rejectedClaimIds: [],
  createdBy:        'test',
});

// =============================================================================
// traceToLineageNode
// =============================================================================

describe('traceToLineageNode', () => {
  it('完整 trace → 节点完整性 complete', () => {
    const node = traceToLineageNode(completeTrace);
    assert.equal(node.traceId, 'DT_001');
    assert.equal(node.chainIntegrity, 'complete');
    assert.equal(node.replayabilityRatio, 1.0);
    assert.deepEqual(node.rejectedAlternatives, ['C_rejected_alt']);
  });

  it('断裂 trace → 节点完整性 broken', () => {
    const node = traceToLineageNode(brokenTrace);
    assert.equal(node.chainIntegrity, 'broken');
  });

  it('低可重放 trace → replayabilityRatio = 1/3', () => {
    const node = traceToLineageNode(lowReplayTrace);
    assert.ok(Math.abs(node.replayabilityRatio - 1 / 3) < 0.01);
  });

  it('无步骤的 trace → replayabilityRatio = 1.0（默认完全可重放）', () => {
    const emptyTrace = createDerivationTrace({
      id: 'DT_empty',
      premiseClaimIds: ['C_p'],
      conclusionClaimId: 'C_c',
    });
    const node = traceToLineageNode(emptyTrace);
    assert.equal(node.replayabilityRatio, 1.0);
  });
});

// =============================================================================
// createProofLineage
// =============================================================================

describe('createProofLineage', () => {
  it('正常创建并校验字段', () => {
    const node = traceToLineageNode(completeTrace);
    const lineage = createProofLineage({
      name: '测试谱系',
      conclusionClaimId: 'C_conclusion_1',
      nodes: [node],
    });
    assert.ok(lineage.id.startsWith('PL_'));
    assert.equal(lineage.conclusionClaimId, 'C_conclusion_1');
    assert.equal(lineage.completeness, 'complete');
    assert.equal(lineage.avgReplayabilityRatio, 1.0);
  });

  it('不变量 PL-I1：conclusionClaimId 为空时抛出', () => {
    const node = traceToLineageNode(completeTrace);
    assert.throws(
      () => createProofLineage({ name: 'test', conclusionClaimId: '', nodes: [node] }),
      /PL-I1/
    );
  });

  it('不变量 PL-I2：nodes 为空时抛出', () => {
    assert.throws(
      () => createProofLineage({ name: 'test', conclusionClaimId: 'C_x', nodes: [] }),
      /PL-I2/
    );
  });

  it('混合完整+断裂节点 → completeness = partial', () => {
    const lineage = createProofLineage({
      name: 'partial',
      conclusionClaimId: 'C_conclusion_2',
      nodes: [traceToLineageNode(completeTrace), traceToLineageNode(brokenTrace)],
    });
    assert.equal(lineage.completeness, 'partial');
  });

  it('全断裂节点 → completeness = broken', () => {
    const lineage = createProofLineage({
      name: 'broken',
      conclusionClaimId: 'C_conclusion_2',
      nodes: [traceToLineageNode(brokenTrace)],
    });
    assert.equal(lineage.completeness, 'broken');
  });

  it('rootPremiseClaimIds 正确排除中间节点', () => {
    // completeTrace: premises=[A, B] → conclusion=C_conclusion_1
    // brokenTrace:   premises=[C_conclusion_1] → conclusion=C_conclusion_2
    // 链接后根前提应为 [A, B]，C_conclusion_1 不应出现（它是中间结论）
    const lineage = createProofLineage({
      name: 'chained',
      conclusionClaimId: 'C_conclusion_2',
      nodes: [traceToLineageNode(completeTrace), traceToLineageNode(brokenTrace)],
    });
    assert.ok(lineage.rootPremiseClaimIds.includes('C_premise_A'));
    assert.ok(lineage.rootPremiseClaimIds.includes('C_premise_B'));
    assert.ok(!lineage.rootPremiseClaimIds.includes('C_conclusion_1'));
  });

  it('allRejectedAlternatives 汇总各节点的拒绝列表', () => {
    const lineage = createProofLineage({
      name: 'test',
      conclusionClaimId: 'C_conclusion_2',
      nodes: [traceToLineageNode(completeTrace), traceToLineageNode(brokenTrace)],
    });
    assert.ok(lineage.allRejectedAlternatives.includes('C_rejected_alt'));
  });
});

// =============================================================================
// buildProofLineage — 从 DerivationTrace 反向重建
// =============================================================================

describe('buildProofLineage', () => {
  it('单条 complete trace → lineage complete', () => {
    const lineage = buildProofLineage([completeTrace], '单 trace 谱系');
    assert.equal(lineage.completeness, 'complete');
    assert.equal(lineage.conclusionClaimId, 'C_conclusion_1');
    assert.equal(lineage.traceIds.length, 1);
  });

  it('多条 trace 链 → 最后一条的结论作为最终结论', () => {
    const lineage = buildProofLineage(
      [completeTrace, brokenTrace],
      '两条 trace 谱系'
    );
    assert.equal(lineage.conclusionClaimId, 'C_conclusion_2');
    assert.equal(lineage.traceIds.length, 2);
  });

  it('空 traces 数组时抛出', () => {
    assert.throws(
      () => buildProofLineage([], '空谱系'),
      /traces 不可为空/
    );
  });
});

// =============================================================================
// ConstitutionalLayer 工厂
// =============================================================================

describe('ConstitutionalLayer', () => {
  it('createConstitutionalLayer 正常创建', () => {
    const layer = createConstitutionalLayer({
      name: '测试宪法层',
      description: '',
      constraints: [STANDARD_CONSTRAINTS[0]],
    });
    assert.ok(layer.id.startsWith('CL_'));
    assert.equal(layer.constraints.length, 1);
  });

  it('不变量 CL-I1：constraints 为空时抛出', () => {
    assert.throws(
      () => createConstitutionalLayer({ name: 'empty', description: '', constraints: [] }),
      /CL-I1/
    );
  });

  it('createDefaultConstitutionalLayer 包含 5 条标准约束', () => {
    const layer = createDefaultConstitutionalLayer();
    assert.equal(layer.constraints.length, 5);
    assert.equal(layer.status, 'current');
  });
});

// =============================================================================
// auditSubject — 对 DerivationTrace 审计
// =============================================================================

describe('auditSubject (DerivationTrace)', () => {
  const layer = createDefaultConstitutionalLayer();

  it('完整 trace 通过所有 mandatory 约束', () => {
    const audit = auditSubject(layer, completeTrace, 'DerivationTrace');
    assert.equal(audit.mandatoryPassed, true);
    assert.equal(audit.subjectId, 'DT_001');
  });

  it('完整 trace 通过可重放率约束（2/2 = 100%）', () => {
    const audit = auditSubject(layer, completeTrace, 'DerivationTrace');
    const replayResult = audit.results.find(r => r.constraintId === 'CC_replayability');
    assert.ok(replayResult?.passed);
  });

  it('低可重放 trace chainIntegrity=broken → mandatory CC_chain_integrity 失败', () => {
    // lowReplayTrace 有非可重放步骤 → chainIntegrity=broken → mandatory 失败
    const audit = auditSubject(layer, lowReplayTrace, 'DerivationTrace');
    const chainResult = audit.results.find(r => r.constraintId === 'CC_chain_integrity');
    assert.equal(chainResult?.passed, false);  // chain integrity fails
    const replayResult = audit.results.find(r => r.constraintId === 'CC_replayability');
    assert.equal(replayResult?.passed, false);  // aspirational also fails
  });

  it('断裂 trace mandatory 失败', () => {
    const audit = auditSubject(layer, brokenTrace, 'DerivationTrace');
    const chainResult = audit.results.find(r => r.constraintId === 'CC_chain_integrity');
    assert.equal(chainResult?.passed, false);
    assert.equal(audit.mandatoryPassed, false);
  });

  it('无结论的 trace CC_has_conclusion 失败', () => {
    const noConclusionTrace = createDerivationTrace({
      id: 'DT_no_conclusion',
      premiseClaimIds: ['C_p'],
      // conclusionClaimId 未设置
    });
    const audit = auditSubject(layer, noConclusionTrace, 'DerivationTrace');
    const conclusionResult = audit.results.find(r => r.constraintId === 'CC_has_conclusion');
    assert.equal(conclusionResult?.passed, false);
  });
});

// =============================================================================
// auditSubject — 对 ProofLineage 审计
// =============================================================================

describe('auditSubject (ProofLineage)', () => {
  const layer = createDefaultConstitutionalLayer();

  it('完整谱系通过所有 mandatory 约束', () => {
    const lineage = buildProofLineage([completeTrace], 'test');
    const audit = auditSubject(layer, lineage, 'ProofLineage');
    assert.equal(audit.mandatoryPassed, true);
    assert.equal(audit.subjectKind, 'ProofLineage');
  });

  it('断裂谱系 CC_chain_integrity mandatory 失败', () => {
    const lineage = buildProofLineage([brokenTrace], 'broken');
    const audit = auditSubject(layer, lineage, 'ProofLineage');
    const chainResult = audit.results.find(r => r.constraintId === 'CC_chain_integrity');
    assert.equal(chainResult?.passed, false);
    assert.equal(audit.mandatoryPassed, false);
  });

  it('passedCount + failedCount = constraints 总数', () => {
    const lineage = buildProofLineage([completeTrace], 'test');
    const audit = auditSubject(layer, lineage, 'ProofLineage');
    assert.equal(audit.passedCount + audit.failedCount, layer.constraints.length);
  });

  it('低可重放率谱系：aspirational 失败但 mandatory 通过', () => {
    // 手动构造一个 completeness=complete 但 avgReplayabilityRatio=0.3 的谱系
    const lineage = createProofLineage({
      name: 'low replayability lineage',
      conclusionClaimId: 'C_conclusion_low',
      nodes: [{
        traceId:              'DT_low',
        premiseClaimIds:      ['C_p'],
        conclusionClaimId:    'C_conclusion_low',
        chainIntegrity:       'complete',  // 链路完整
        replayabilityRatio:   0.3,         // 但可重放率低
        rejectedAlternatives: [],
      }],
    });
    const audit = auditSubject(layer, lineage, 'ProofLineage');
    assert.equal(audit.mandatoryPassed, true);  // 所有 mandatory 均通过
    const replayResult = audit.results.find(r => r.constraintId === 'CC_replayability');
    assert.equal(replayResult?.passed, false);  // aspirational 失败
  });
});
