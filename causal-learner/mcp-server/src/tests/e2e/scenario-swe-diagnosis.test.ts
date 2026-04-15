/**
 * E2E Scenario B: SWE Bug Diagnosis
 * 覆盖层：v7 DerivationTrace + v11 ProofLineage + ConstitutionalLayer + CounterexampleCommons + FailureBoundaryArchive
 *
 * 试验场景：软件工程 NullPointerException 根因诊断
 * 理论驱动的测试维度：
 *   1. 推导链：stack trace → null token → missing expiry check（两条 trace 链接）
 *   2. 宪法审计：完整链路通过 mandatory 约束，替代假设被显式拒绝
 *   3. 反例公共知识库：误报假设写入 CounterexampleCommons
 *   4. 失败代价档案：重复 bug 的认识论代价记录
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDerivationTrace } from '../../core/derivation-trace.js';
import { buildProofLineage } from '../../core/proof-lineage.js';
import { createDefaultConstitutionalLayer, auditSubject } from '../../core/constitutional-layer.js';
import {
  createCounterexampleCommons,
  appendCounterexample,
  searchActiveCounterexamples,
} from '../../core/counterexample-commons.js';
import {
  createFailureBoundaryArchive,
  appendFailureRecord,
  queryRecordsByCostKind,
} from '../../core/failure-boundary-archive.js';
import { makeStep, makeSupportLink } from './e2e-helpers.js';

// =============================================================================
// 推导链夹具
// =============================================================================

// Trace 1：stack trace → null token
const trace1 = createDerivationTrace({
  id:               'DT_swe_001',
  episodeId:        'EP_swe_npe_001',
  contextKind:      'reconstruction',
  premiseClaimIds:  ['C_npe_stack_trace', 'C_auth_module_context'],
  conclusionClaimId: 'C_null_token',
  proof: [
    makeStep('C_npe_stack_trace',     'C_auth_getToken_null'),
    makeStep('C_auth_getToken_null',  'C_null_token'),
  ],
  supportLinks: [makeSupportLink('SL_swe_001', 'OR_swe_001', 'C_null_token')],
  rejectedClaimIds: ['C_memory_leak', 'C_race_condition'],
});

// Trace 2：null token → missing expiry check
const trace2 = createDerivationTrace({
  id:               'DT_swe_002',
  episodeId:        'EP_swe_npe_001',
  contextKind:      'reconstruction',
  premiseClaimIds:  ['C_null_token'],
  conclusionClaimId: 'C_missing_expiry_check',
  proof: [
    makeStep('C_null_token',              'C_session_validation_gap'),
    makeStep('C_session_validation_gap',  'C_missing_expiry_check'),
  ],
  supportLinks: [makeSupportLink('SL_swe_002', 'OR_swe_002', 'C_missing_expiry_check')],
  rejectedClaimIds: ['C_config_error'],
});

// =============================================================================
// 1. 单条 trace 审计
// =============================================================================

describe('Scenario B — 单条 DerivationTrace 审计', () => {
  const layer = createDefaultConstitutionalLayer();

  it('trace1 通过所有 mandatory 约束', () => {
    const audit = auditSubject(layer, trace1, 'DerivationTrace');
    assert.equal(audit.mandatoryPassed, true);
  });

  it('trace1 有 rejectedClaimIds → CC_explicit_rejections aspirational 通过', () => {
    const audit = auditSubject(layer, trace1, 'DerivationTrace');
    const r = audit.results.find(x => x.constraintId === 'CC_explicit_rejections');
    assert.ok(r?.passed, '有 rejectedClaimIds 时应通过');
  });

  it('trace2 通过所有 mandatory 约束', () => {
    const audit = auditSubject(layer, trace2, 'DerivationTrace');
    assert.equal(audit.mandatoryPassed, true);
  });
});

// =============================================================================
// 2. 两条 trace 组合 ProofLineage
// =============================================================================

describe('Scenario B — 两条 trace 组合 ProofLineage', () => {
  const lineage = buildProofLineage([trace1, trace2], 'NPE 根因诊断谱系');
  const layer   = createDefaultConstitutionalLayer();

  it('最终结论为 C_missing_expiry_check', () => {
    assert.equal(lineage.conclusionClaimId, 'C_missing_expiry_check');
  });

  it('traceIds 包含两条 trace', () => {
    assert.equal(lineage.traceIds.length, 2);
    assert.ok(lineage.traceIds.includes('DT_swe_001'));
    assert.ok(lineage.traceIds.includes('DT_swe_002'));
  });

  it('rootPremiseClaimIds 包含原始前提，C_null_token 被排除（是中间结论）', () => {
    assert.ok(lineage.rootPremiseClaimIds.includes('C_npe_stack_trace'));
    assert.ok(lineage.rootPremiseClaimIds.includes('C_auth_module_context'));
    assert.ok(!lineage.rootPremiseClaimIds.includes('C_null_token'),
      'C_null_token 是 trace1 的结论，不应出现在根前提中');
  });

  it('谱系完整性 complete（两条 trace 均 complete）', () => {
    assert.equal(lineage.completeness, 'complete');
  });

  it('宪法审计通过所有 mandatory 约束', () => {
    const audit = auditSubject(layer, lineage, 'ProofLineage');
    assert.equal(audit.mandatoryPassed, true);
    assert.equal(audit.subjectKind, 'ProofLineage');
  });

  it('allRejectedAlternatives 汇总两条 trace 的拒绝列表', () => {
    assert.ok(lineage.allRejectedAlternatives.includes('C_memory_leak'));
    assert.ok(lineage.allRejectedAlternatives.includes('C_race_condition'));
    assert.ok(lineage.allRejectedAlternatives.includes('C_config_error'));
  });

  it('avgReplayabilityRatio = 1.0（所有步骤 auditReplayable=true）', () => {
    assert.equal(lineage.avgReplayabilityRatio, 1.0);
  });
});

// =============================================================================
// 3. CounterexampleCommons：记录误报
// =============================================================================

describe('Scenario B — 误报反例（v11 CounterexampleCommons）', () => {
  it('race_condition 误报写入 commons', () => {
    let commons = createCounterexampleCommons({ name: 'SWE 误报反例库', description: '' });
    commons = appendCounterexample(commons, {
      refutedClaimRef:  'C_race_condition',
      description:      '在单线程+互斥锁上下文中，race_condition 假设被证伪',
      evidenceRefs:     ['OR_swe_001', 'OR_swe_003'],
      triggerContext:   'single-threaded auth service with mutex',
      severity:         'moderate',
    });
    assert.equal(commons.entries.length, 1);
    assert.equal(commons.entries[0].absorbed, false);
  });

  it('searchActiveCounterexamples 命中 C_memory_leak', () => {
    let commons = createCounterexampleCommons({ name: '反例库', description: '' });
    commons = appendCounterexample(commons, {
      refutedClaimRef: 'C_memory_leak',
      description:     '堆内存监控数据显示无泄漏',
      evidenceRefs:    ['OR_swe_heap_01'],
      triggerContext:  'production heap monitor',
      severity:        'critical',
    });
    const found = searchActiveCounterexamples(commons, 'C_memory_leak');
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'critical');
  });

  it('evidenceRefs 为空 → 抛出 CE-I1 不变量错误', () => {
    const commons = createCounterexampleCommons({ name: '反例库', description: '' });
    assert.throws(
      () => appendCounterexample(commons, {
        refutedClaimRef: 'C_x',
        description:     '无证据反例',
        evidenceRefs:    [],
        triggerContext:  'test',
        severity:        'minor',
      }),
      /CE-I1/,
    );
  });
});

// =============================================================================
// 4. FailureBoundaryArchive：历史代价记录
// =============================================================================

describe('Scenario B — 历史失败代价档案（v11）', () => {
  it('写入两条认识论/声誉代价记录', () => {
    let archive = createFailureBoundaryArchive({ name: 'SWE 失败档案', description: '' });
    archive = appendFailureRecord(archive, {
      episodeRef:  'EP_swe_npe_001',
      description: 'NPE 导致用户登出',
      costs: [{ kind: 'epistemic', description: '诊断链断裂，知识丢失' }],
      boundaryConditions: [{ variableRef: 'token_ttl', direction: 'below', thresholdValue: 0, description: 'token 过期' }],
    });
    archive = appendFailureRecord(archive, {
      episodeRef:  'EP_swe_npe_002',
      description: '相同 NPE 再次触发',
      costs: [{ kind: 'reputational', description: '客户反馈差评' }],
      boundaryConditions: [{ variableRef: 'token_ttl', direction: 'equal', thresholdValue: 0, description: 'token 恰好过期' }],
    });
    assert.equal(archive.records.length, 2);
  });

  it('queryRecordsByCostKind 按代价类型过滤', () => {
    let archive = createFailureBoundaryArchive({ name: '档案', description: '' });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_1',
      description: '认识论代价',
      costs: [{ kind: 'epistemic', description: '知识丢失' }],
      boundaryConditions: [{ variableRef: 'x', direction: 'above', thresholdValue: 0, description: '' }],
    });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_2',
      description: '时间代价',
      costs: [{ kind: 'time', magnitude: 4, unit: 'hours', description: '修复耗时 4h' }],
      boundaryConditions: [{ variableRef: 'y', direction: 'below', thresholdValue: 10, description: '' }],
    });
    assert.equal(queryRecordsByCostKind(archive, 'epistemic').length, 1);
    assert.equal(queryRecordsByCostKind(archive, 'time').length, 1);
    assert.equal(queryRecordsByCostKind(archive, 'safety').length, 0);
  });

  it('FR-I1：costs 为空 → 抛出不变量错误', () => {
    const archive = createFailureBoundaryArchive({ name: '档案', description: '' });
    assert.throws(
      () => appendFailureRecord(archive, {
        episodeRef: 'EP_x',
        description: '无代价记录',
        costs: [],
        boundaryConditions: [{ variableRef: 'x', direction: 'above', thresholdValue: 0, description: '' }],
      }),
      /FR-I1/,
    );
  });

  it('FR-I2：boundaryConditions 为空 → 抛出不变量错误', () => {
    const archive = createFailureBoundaryArchive({ name: '档案', description: '' });
    assert.throws(
      () => appendFailureRecord(archive, {
        episodeRef:         'EP_y',
        description:        '无边界条件记录',
        costs:              [{ kind: 'epistemic', description: '知识丢失' }],
        boundaryConditions: [],
      }),
      /FR-I2/,
    );
  });
});
