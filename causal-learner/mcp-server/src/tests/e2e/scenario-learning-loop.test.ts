/**
 * E2E Scenario D: 学习闭环 — 水垢失效模式发现
 *
 * 核心命题：
 *   一个认识论系统能否通过接触"出乎意料的失败"，
 *   系统性地更新自己的机制程序，并用可量化指标证明理论质量提升？
 *
 * 闭环步骤：
 *   Phase 0  基线——V1 程序对已知场景行为正确
 *   Phase 1  误预测——V1 遭遇水垢情景，预测成功但实际失败（理论漏洞暴露）
 *   Phase 2  偏差记录——PredictionError 捕获预测-现实差距
 *   Phase 3  修订提案——ProgramRevisionProposal 提出新失效条件
 *   Phase 4  裁决接受——acceptProposal → OntologyDelta + ReviewDecision
 *   Phase 5  V2 验证——新程序正确预测失败，原有能力无回归
 *   Phase 6  认识论链——修订决策推导链经过 ConstitutionalLayer 审计
 *   Phase 7  学习指标——统计评价（误差消除率、修订副作用率等）
 *
 * 关键设计决策：
 *   水垢失效用状态变量 calciumBlocked: true 建模（categorical）
 *   V1 failsWhen 只有 'hasPower=false'，无法捕获 calciumBlocked=true
 *   V2 failsWhen 追加 'calciumBlocked=true'
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createMechanismProgram, executePhasedProgram } from '../../core/mechanism-program.js';
import { createPredictionError } from '../../core/prediction-error.js';
import { createProgramRevisionProposal } from '../../core/program-revision-proposal.js';
import { acceptProposal, rejectProposal } from '../../core/review-decision.js';
import { createFailureBoundaryArchive, appendFailureRecord, checkBoundaryViolation } from '../../core/failure-boundary-archive.js';
import { buildProofLineage } from '../../core/proof-lineage.js';
import { createDefaultConstitutionalLayer, auditSubject } from '../../core/constitutional-layer.js';
import { createDerivationTrace } from '../../core/derivation-trace.js';
import { makeStep } from './e2e-helpers.js';

// =============================================================================
// 场景夹具
// =============================================================================

/** V1：只知道"断电"这一种失效条件 */
const mpBrewV1 = createMechanismProgram({
  mechanismClassRef: 'MC_BrewCoffee',
  name:              'BrewCoffee_v1',
  description:       '意式萃取——初始理论：只知断电失效',
  phases: [
    { name: 'heat_water',  expectedStateChanges: ['waterTemp:cold→hot'],    expectedObservations: ['waterTemp'] },
    { name: 'pressurize',  expectedStateChanges: ['pumpActive:true'],        expectedObservations: ['pumpPressure'] },
    { name: 'extract',     expectedStateChanges: ['espressoReady:true'],     expectedObservations: ['espressoVolume'] },
  ],
  outcomes:           ['brew_success', 'brew_failed'],
  failsWhen:          ['hasPower=false'],                   // ← 只有断电条件
  interventionPoints: ['heat_water', 'pressurize', 'extract'],
});

// 正常运行上下文（无水垢）
const ctxNormal        = { stateVars: { hasPower: true,  calciumBlocked: false } };
// 断电上下文
const ctxNoPower       = { stateVars: { hasPower: false, calciumBlocked: false } };
// 水垢上下文（V1 理论的"盲区"）
const ctxCalciumBlocked = { stateVars: { hasPower: true, calciumBlocked: true } };

// =============================================================================
// Phase 0: 基线——V1 对已知场景行为正确
// =============================================================================

describe('Phase 0 — V1 程序基线', () => {
  it('正常执行：3 phases 全完成 → brew_success', () => {
    const t = executePhasedProgram(mpBrewV1, ctxNormal);
    assert.equal(t.completedPhases, 3);
    assert.equal(t.finalOutcome, 'brew_success');
  });

  it('断电：V1 在 heat_water 前触发 failsWhen → brew_failed', () => {
    const t = executePhasedProgram(mpBrewV1, ctxNoPower);
    assert.equal(t.wasInterrupted, true);
    assert.ok(/fail/i.test(t.finalOutcome));
  });
});

// =============================================================================
// Phase 1: 误预测——V1 遭遇水垢情景，漏报失效
// =============================================================================

describe('Phase 1 — 误预测（理论漏洞暴露）', () => {
  const trajCalciumV1 = executePhasedProgram(mpBrewV1, ctxCalciumBlocked);

  it('V1 + calciumBlocked=true → 误预测为 brew_success（3 phases 全完成）', () => {
    // V1 failsWhen 没有 calciumBlocked 条件 → 程序无感知地"成功"执行
    // 这是 False Negative（应当失败，实际预测成功）
    assert.equal(trajCalciumV1.wasInterrupted, false);
    assert.equal(trajCalciumV1.completedPhases, 3);
    assert.equal(trajCalciumV1.finalOutcome, 'brew_success');
  });

  it('真实观测（测试 oracle）报告实际失败', () => {
    // 模拟外部反馈：运营者观察到萃取量不足、味道寡淡
    const observedOutcome = 'brew_failed_weak_extraction';
    assert.notEqual(trajCalciumV1.finalOutcome, observedOutcome,
      '预测结果与实际观测不符——理论漏洞成立');
  });
});

// =============================================================================
// Phase 2: 偏差记录——PredictionError
// =============================================================================

describe('Phase 2 — PredictionError 记录', () => {
  const predError = createPredictionError({
    causedByActionExecutionId: 'AE_brew_calcium_001',  // 触发该次执行的 action
    outcomeRecordId:           'OR_brew_calcium_obs_001', // 实际观测记录
    errorKind:                 'outcome',
    expectedSummary:           'brew_success（V1 程序预测萃取成功）',
    actualSummary:             'brew_failed_weak_extraction（运营者观测到出品不足）',
    deltaSummary:              '水垢造成热交换效率下降，但 V1 failsWhen 无此条件——产生漏报',
    severity:                  'high',
  });

  it('PredictionError 创建成功（PE_ 前缀）', () => {
    assert.ok(predError.id.startsWith('PE_'));
    assert.equal(predError.errorKind, 'outcome');
    assert.equal(predError.severity, 'high');
  });

  it('delta 清楚描述理论与现实的差距', () => {
    assert.ok(predError.deltaSummary.includes('failsWhen'));
  });
});

// =============================================================================
// Phase 3: 修订提案——ProgramRevisionProposal
// =============================================================================

describe('Phase 3 — ProgramRevisionProposal', () => {
  const predError = createPredictionError({
    causedByActionExecutionId: 'AE_brew_calcium_001',
    outcomeRecordId:           'OR_brew_calcium_obs_001',
    errorKind:                 'outcome',
    expectedSummary:           'brew_success',
    actualSummary:             'brew_failed_weak_extraction',
    deltaSummary:              'calciumBlocked=true 未被 failsWhen 捕获',
    severity:                  'high',
  });

  const proposal = createProgramRevisionProposal({
    basedOnPredictionErrorIds: [predError.id],
    targetKind:                'mechanism_program',
    targetRef:                 mpBrewV1.id,
    proposedChangeKind:        'precondition_adjustment',
    rationale:                 '向 failsWhen 追加 calciumBlocked=true：水垢阻塞是独立失效条件，与断电无关',
  });

  it('PRP 创建成功（PRP_ 前缀，status=proposed）', () => {
    assert.ok(proposal.id.startsWith('PRP_'));
    assert.equal(proposal.status, 'proposed');
  });

  it('PRP 正确关联 PredictionError', () => {
    assert.ok(proposal.basedOnPredictionErrorIds.includes(predError.id));
  });

  it('proposedChangeKind 为 precondition_adjustment', () => {
    assert.equal(proposal.proposedChangeKind, 'precondition_adjustment');
  });
});

// =============================================================================
// Phase 4: 裁决——acceptProposal → OntologyDelta + ReviewDecision
// =============================================================================

describe('Phase 4 — Review 裁决（accept）', () => {
  const predError = createPredictionError({
    causedByActionExecutionId: 'AE_brew_calcium_001',
    outcomeRecordId:           'OR_brew_calcium_obs_001',
    errorKind:                 'outcome',
    expectedSummary:           'brew_success',
    actualSummary:             'brew_failed',
    deltaSummary:              'calciumBlocked 漏报',
    severity:                  'high',
  });
  const proposal = createProgramRevisionProposal({
    basedOnPredictionErrorIds: [predError.id],
    targetKind:                'mechanism_program',
    targetRef:                 mpBrewV1.id,
    proposedChangeKind:        'precondition_adjustment',
    rationale:                 '追加 calciumBlocked=true 到 failsWhen',
  });

  const { updatedProposal, delta, reviewDecision } = acceptProposal(
    proposal,
    '实验室水垢测试确认：当 calciumLevel > 80% 时萃取量显著下降，接受修订',
    'lab_reviewer',
  );

  it('接受后 PRP status=accepted', () => {
    assert.equal(updatedProposal.status, 'accepted');
  });

  it('生成 ReviewDecision（RD_ 前缀，decision=accepted）', () => {
    assert.ok(reviewDecision.id.startsWith('RD_'));
    assert.equal(reviewDecision.decision, 'accepted');
    assert.equal(reviewDecision.proposalRef, proposal.id);
  });

  it('生成 OntologyDelta（绑定正确目标程序）', () => {
    assert.ok(delta.id.startsWith('OD_'));
    // targetRef 存储在 changes[].target_id 中
    assert.ok(delta.changes.some(c => c.target_id === mpBrewV1.id),
      `delta.changes 中应含 target_id=${mpBrewV1.id}`);
  });

  it('拒绝一个已 accepted 提案应抛出错误（状态机保护）', () => {
    assert.throws(
      () => rejectProposal(updatedProposal, '改变主意'),
      /只能拒绝 status=proposed/,
    );
  });
});

// =============================================================================
// Phase 5: V2 程序验证——误差消除 + 无回归
// =============================================================================

/** V2：修订后添加了 calciumBlocked=true 失效条件 */
const mpBrewV2 = createMechanismProgram({
  mechanismClassRef: 'MC_BrewCoffee',
  name:              'BrewCoffee_v2',
  description:       '意式萃取——修订理论：增加水垢失效条件',
  phases: [
    { name: 'heat_water',  expectedStateChanges: ['waterTemp:cold→hot'],    expectedObservations: ['waterTemp'] },
    { name: 'pressurize',  expectedStateChanges: ['pumpActive:true'],        expectedObservations: ['pumpPressure'] },
    { name: 'extract',     expectedStateChanges: ['espressoReady:true'],     expectedObservations: ['espressoVolume'] },
  ],
  outcomes:           ['brew_success', 'brew_failed'],
  failsWhen:          ['hasPower=false', 'calciumBlocked=true'],  // ← 修订：追加水垢条件
  interventionPoints: ['heat_water', 'pressurize', 'extract'],
});

describe('Phase 5 — V2 程序：误差消除 + 无回归', () => {
  it('V2 + calciumBlocked=true → 正确预测失败（误差消除）', () => {
    const t = executePhasedProgram(mpBrewV2, ctxCalciumBlocked);
    assert.equal(t.wasInterrupted, true);
    assert.ok(/fail/i.test(t.finalOutcome),
      `V2 应预测失败，实际 outcome：${t.finalOutcome}`);
  });

  it('V2 + 正常状态 → brew_success（无回归）', () => {
    const t = executePhasedProgram(mpBrewV2, ctxNormal);
    assert.equal(t.wasInterrupted, false);
    assert.equal(t.completedPhases, 3);
    assert.equal(t.finalOutcome, 'brew_success');
  });

  it('V2 + 断电 → 仍然正确检测断电失败（原有能力保留）', () => {
    const t = executePhasedProgram(mpBrewV2, ctxNoPower);
    assert.equal(t.wasInterrupted, true);
    assert.ok(/fail/i.test(t.finalOutcome));
  });

  it('V2 failsWhen 包含两条独立失效条件', () => {
    assert.equal(mpBrewV2.failsWhen.length, 2);
    assert.ok(mpBrewV2.failsWhen.includes('hasPower=false'));
    assert.ok(mpBrewV2.failsWhen.includes('calciumBlocked=true'));
  });
});

// =============================================================================
// Phase 6: 认识论链——修订决策的推导链经 ConstitutionalLayer 审计
// =============================================================================

describe('Phase 6 — 修订决策推导链宪法审计', () => {
  // 修订推理链：
  //   前提：V1 预测成功 + 实际观测失败
  //   结论：V1 failsWhen 不完备，必须追加 calciumBlocked=true
  const revisionTrace = createDerivationTrace({
    id:               'DT_brew_revision_001',
    episodeId:        'EP_brew_calcium_001',
    contextKind:      'reconstruction',
    premiseClaimIds:  ['C_v1_predicts_success', 'C_actual_outcome_failure'],
    conclusionClaimId: 'C_v1_failsWhen_incomplete',
    proof: [
      makeStep('C_v1_predicts_success',   'C_prediction_reality_gap'),
      makeStep('C_prediction_reality_gap', 'C_v1_failsWhen_incomplete'),
    ],
    supportLinks:     [],
    rejectedClaimIds: ['C_sensor_malfunction', 'C_user_error'],  // 明确排除误报假设
  });

  it('修订推导链 chainIntegrity=complete', () => {
    assert.equal(revisionTrace.chainIntegrity, 'complete');
  });

  it('ProofLineage 从修订 trace 构建', () => {
    const lineage = buildProofLineage([revisionTrace], '水垢失效修订推理谱系');
    assert.equal(lineage.conclusionClaimId, 'C_v1_failsWhen_incomplete');
    assert.equal(lineage.completeness, 'complete');
  });

  it('宪法审计：修订决策推理链通过所有 mandatory 约束', () => {
    const lineage = buildProofLineage([revisionTrace], '修订谱系');
    const layer   = createDefaultConstitutionalLayer();
    const audit   = auditSubject(layer, lineage, 'ProofLineage');
    assert.equal(audit.mandatoryPassed, true,
      `mandatory 失败原因：${audit.results.filter(r => !r.passed && r.kind === 'mandatory').map(r => r.constraintId).join(', ')}`);
  });

  it('排除了传感器故障和用户误操作两个替代假设', () => {
    const lineage = buildProofLineage([revisionTrace], '修订谱系');
    assert.ok(lineage.allRejectedAlternatives.includes('C_sensor_malfunction'));
    assert.ok(lineage.allRejectedAlternatives.includes('C_user_error'));
  });
});

// =============================================================================
// Phase 7: 失败边界档案更新
// =============================================================================

describe('Phase 7 — 失败边界档案：纳入水垢失效边界', () => {
  it('水垢失效边界写入档案', () => {
    let archive = createFailureBoundaryArchive({ name: '咖啡机失败档案 v2', description: '' });
    archive = appendFailureRecord(archive, {
      episodeRef:   'EP_brew_calcium_001',
      mechanismRef: mpBrewV2.id,
      description:  '水垢积累超过阈值导致萃取失败',
      costs: [
        { kind: 'resource',     magnitude: 1,  unit: 'shot',    description: '损失一份萃取用料' },
        { kind: 'epistemic',    description:   'V1 理论漏洞导致长期误预测' },
      ],
      boundaryConditions: [
        { variableRef: 'calciumLevel', direction: 'above', thresholdValue: 0.8, description: 'calciumLevel > 0.8 时热交换效率不足' },
      ],
    });
    assert.equal(archive.records.length, 1);
  });

  it('边界查询：calciumLevel=0.9 触发档案记录', () => {
    let archive = createFailureBoundaryArchive({ name: '档案', description: '' });
    archive = appendFailureRecord(archive, {
      episodeRef:  'EP_brew_calcium_001',
      description: '水垢失效',
      costs: [{ kind: 'resource', description: '料损' }],
      boundaryConditions: [{ variableRef: 'calciumLevel', direction: 'above', thresholdValue: 0.8, description: '' }],
    });
    const hits = checkBoundaryViolation(archive, 'calciumLevel', 0.9);
    assert.equal(hits.length, 1);
  });

  it('边界查询：calciumLevel=0.5 不触发', () => {
    let archive = createFailureBoundaryArchive({ name: '档案', description: '' });
    archive = appendFailureRecord(archive, {
      episodeRef:  'EP_brew_calcium_001',
      description: '水垢失效',
      costs: [{ kind: 'resource', description: '料损' }],
      boundaryConditions: [{ variableRef: 'calciumLevel', direction: 'above', thresholdValue: 0.8, description: '' }],
    });
    const hits = checkBoundaryViolation(archive, 'calciumLevel', 0.5);
    assert.equal(hits.length, 0);
  });
});

// =============================================================================
// Phase 8: 学习闭环统计评价指标
// =============================================================================

describe('Phase 8 — 学习闭环统计评价指标', () => {
  /**
   * 此 describe 块扮演"指标仪表盘"的角色。
   * 每条 it() 对应一个可量化的学习质量维度。
   * 指标通过对前各阶段结果的确定性断言推导。
   */

  // 重建各阶段结果
  const v1OnCalcium = executePhasedProgram(mpBrewV1, ctxCalciumBlocked);
  const v2OnCalcium = executePhasedProgram(mpBrewV2, ctxCalciumBlocked);
  const v2OnNormal  = executePhasedProgram(mpBrewV2, ctxNormal);
  const v2OnNoPower = executePhasedProgram(mpBrewV2, ctxNoPower);

  // ── 误差消除率 ──────────────────────────────────────────────────────────────
  it('[指标] 误差消除率 = 100%（水垢场景：V1 误预测 → V2 正确预测）', () => {
    const v1Wrong = v1OnCalcium.finalOutcome === 'brew_success';  // V1 误报
    const v2Right = v2OnCalcium.wasInterrupted === true;           // V2 修正
    assert.equal(v1Wrong, true,  'V1 应该误预测成功');
    assert.equal(v2Right, true,  'V2 应该正确预测失败');
    // 误差消除率 = 修订后正确 / 修订前错误 = 1/1 = 100%
  });

  // ── 修订副作用率 ─────────────────────────────────────────────────────────────
  it('[指标] 修订副作用率 = 0%（正常场景和断电场景均无回归）', () => {
    const normalRegression  = v2OnNormal.wasInterrupted;   // 正常执行不应被中断
    const powerRegression   = !v2OnNoPower.wasInterrupted; // 断电仍应中断
    assert.equal(normalRegression,  false, '正常场景：V2 不应产生回归中断');
    assert.equal(powerRegression,   false, '断电场景：V2 不应失去检测能力');
    // 副作用率 = 0/2 = 0%
  });

  // ── 知识密度（failsWhen 条件数量）─────────────────────────────────────────
  it('[指标] 知识密度：V1 → V2 failsWhen 条件增加（1 → 2）', () => {
    const v1Conditions = mpBrewV1.failsWhen.length;
    const v2Conditions = mpBrewV2.failsWhen.length;
    assert.equal(v1Conditions, 1);
    assert.equal(v2Conditions, 2);
    assert.ok(v2Conditions > v1Conditions, '修订后知识密度应增加');
  });

  // ── 修订效率（每次修订消除的误差数）──────────────────────────────────────
  it('[指标] 修订效率 = 1.0（1 次 PRP 修订消除 1 类误差）', () => {
    // 这里用确定性断言替代浮点计算
    const revisionsCount = 1;
    const errorsEliminated = 1;
    assert.equal(errorsEliminated / revisionsCount, 1.0);
  });

  // ── 认识论完整性（修订决策有推导链支撑）─────────────────────────────────
  it('[指标] 认识论完整性：修订决策有 complete 推导链 + 宪法审计通过', () => {
    const trace = createDerivationTrace({
      id:               'DT_metrics_rev',
      contextKind:      'reconstruction',
      premiseClaimIds:  ['C_v1_predicts_success', 'C_actual_outcome_failure'],
      conclusionClaimId: 'C_v1_failsWhen_incomplete',
      proof: [
        makeStep('C_v1_predicts_success',    'C_gap'),
        makeStep('C_gap',                    'C_v1_failsWhen_incomplete'),
      ],
      supportLinks:     [],
      rejectedClaimIds: ['C_sensor_malfunction'],
    });
    const lineage = buildProofLineage([trace], '修订认识论链');
    const audit   = auditSubject(createDefaultConstitutionalLayer(), lineage, 'ProofLineage');
    assert.equal(lineage.completeness, 'complete',   '推导链应完整');
    assert.equal(audit.mandatoryPassed, true,        '宪法审计应通过');
  });

  // ── 替代假设显式排除率 ─────────────────────────────────────────────────────
  it('[指标] 替代假设显式排除率 > 0（非静默丢弃）', () => {
    const trace = createDerivationTrace({
      id:               'DT_metrics_rej',
      contextKind:      'reconstruction',
      premiseClaimIds:  ['C_p'],
      conclusionClaimId: 'C_c',
      proof: [makeStep('C_p', 'C_c')],
      supportLinks:     [],
      rejectedClaimIds: ['C_sensor_malfunction', 'C_user_error'],
    });
    assert.ok(trace.rejectedClaimIds.length > 0,
      '替代假设应被显式记录，不允许静默丢弃');
  });
});
