/**
 * E2E Scenario A: BrewCoffee
 * 覆盖层：v8 MechanismProgram + v10 ObserverModel + v11 FailureBoundaryArchive + ProofLineage + ConstitutionalLayer
 *
 * 试验场景：意式浓缩萃取流程（咖啡机）
 * 理论驱动的测试维度：
 *   1. 正常执行：3 phases 全部完成
 *   2. 反事实：断电情景（failsWhen 触发），程序中断于 heat_water
 *   3. 观察者盲区：技术员看不到 beanWeight 传感器信号（v10）
 *   4. 失败边界档案：记录断电边界 + 边界查询（v11）
 *   5. 证明谱系 + 宪法审计：诊断推导链通过 mandatory 约束（v11）
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createMechanismProgram, executePhasedProgram } from '../../core/mechanism-program.js';
import { inferCounterfactual } from '../../core/counterfactual-scenario.js';
import { createObserverModel, filterObservations } from '../../core/observer-model.js';
import {
  createFailureBoundaryArchive,
  appendFailureRecord,
  checkBoundaryViolation,
} from '../../core/failure-boundary-archive.js';
import { buildProofLineage } from '../../core/proof-lineage.js';
import { createDefaultConstitutionalLayer, auditSubject } from '../../core/constitutional-layer.js';
import { createDerivationTrace } from '../../core/derivation-trace.js';
import { makeStep, makeSupportLink } from './e2e-helpers.js';

// =============================================================================
// 场景夹具
// =============================================================================

/** 意式咖啡机萃取程序：heat_water → pressurize → extract */
const mpBrew = createMechanismProgram({
  mechanismClassRef: 'MC_BrewCoffee',
  name:              'BrewCoffee',
  description:       '意式浓缩萃取流程：热水→加压→萃取',
  phases: [
    {
      name:                   'heat_water',
      expectedStateChanges:   ['waterTemp:cold→hot'],
      expectedObservations:   ['waterTemp'],
    },
    {
      name:                   'pressurize',
      expectedStateChanges:   ['pumpActive:true'],
      expectedObservations:   ['pumpPressure'],
    },
    {
      name:                   'extract',
      expectedStateChanges:   ['espressoReady:true'],
      expectedObservations:   ['espressoVolume'],
    },
  ],
  outcomes:           ['brew_success', 'brew_failed'],
  failsWhen:          ['hasPower=false'],
  interventionPoints: ['heat_water', 'pressurize', 'extract'],
});

/** 技术员观察者（beanWeight 传感器故障 → 盲区） */
const technicianObserver = createObserverModel({
  name:                '咖啡机技术员',
  description:         '现场维修技术员，beanWeight 传感器离线',
  position:            '机器操作面板前',
  blindZoneSignalKeys: ['beanWeight'],
});

// =============================================================================
// 1. 正常执行
// =============================================================================

describe('Scenario A — BrewCoffee 正常执行', () => {
  const traj = executePhasedProgram(mpBrew, { stateVars: { hasPower: true } });

  it('3 个 phase 全部完成', () => {
    assert.equal(traj.completedPhases, 3);
    assert.equal(traj.totalPhases, 3);
    assert.equal(traj.wasInterrupted, false);
  });

  it('finalOutcome 为 brew_success', () => {
    assert.equal(traj.finalOutcome, 'brew_success');
  });

  it('每个 phase 各自发射预期信号', () => {
    const emitted = traj.phaseResults.flatMap(r => r.observationsEmitted);
    assert.ok(emitted.includes('waterTemp'),    'heat_water 应发射 waterTemp');
    assert.ok(emitted.includes('pumpPressure'), 'pressurize 应发射 pumpPressure');
    assert.ok(emitted.includes('espressoVolume'), 'extract 应发射 espressoVolume');
  });
});

// =============================================================================
// 2. 反事实：断电情景
// =============================================================================

describe('Scenario A — BrewCoffee 反事实（断电）', () => {
  // hasPower=false 写入 stateOverrides → failsWhen: ['hasPower=false'] 在 heat_water 触发
  const cfScenario = inferCounterfactual(
    mpBrew,
    { stateVars: { hasPower: true } },
    [{ targetRef: 'hasPower', modification: 'set', fromValue: true, toValue: false, rationale: '模拟断电' }],
    'EP_brew_001',
    'REC_brew_001',
  );

  it('反事实场景创建成功（CS_ 前缀）', () => {
    assert.ok(cfScenario.id.startsWith('CS_'));
    assert.equal(cfScenario.baseEpisodeId, 'EP_brew_001');
    assert.equal(cfScenario.baseReconstructionId, 'REC_brew_001');
  });

  it('程序因 failsWhen 中断，结局含 fail', () => {
    const outcome = cfScenario.predictedOutcome;
    const isFailed = outcome === 'brew_failed' || /fail|interrupt/i.test(outcome);
    assert.ok(isFailed, `期望失败结局，实际：${outcome}`);
  });

  it('预测轨迹结构完整：initial_condition + phases + outcome', () => {
    const t = cfScenario.predictedTrajectory;
    assert.ok(t.length >= 3, `至少 3 步，实际 ${t.length}`);
    assert.equal(t[0].kind, 'initial_condition');
    assert.equal(t[t.length - 1].kind, 'outcome');
  });

  it('divergencePoints 包含 hasPower（干预变量）', () => {
    assert.ok(cfScenario.divergencePoints.includes('hasPower'));
  });
});

// =============================================================================
// 3. v10 观察者盲区过滤
// =============================================================================

describe('Scenario A — 观察者盲区过滤（v10 ObserverModel）', () => {
  const signals = { waterTemp: 90, pumpPressure: 9.5, espressoVolume: 30, beanWeight: 18 };

  it('beanWeight 进入 removedKeys', () => {
    const f = filterObservations(technicianObserver, signals);
    assert.ok(f.removedKeys.includes('beanWeight'));
  });

  it('过滤后只剩 3 个信号', () => {
    const f = filterObservations(technicianObserver, signals);
    assert.equal(Object.keys(f.filtered).length, 3);
  });

  it('非盲区信号值保持不变', () => {
    const f = filterObservations(technicianObserver, signals);
    assert.equal(f.filtered['waterTemp'],    90);
    assert.equal(f.filtered['pumpPressure'], 9.5);
    assert.equal(f.filtered['espressoVolume'], 30);
  });

  it('original 信号完整保留（pure function）', () => {
    const f = filterObservations(technicianObserver, signals);
    assert.equal(f.original['beanWeight'], 18);
  });
});

// =============================================================================
// 4. v11 FailureBoundaryArchive
// =============================================================================

describe('Scenario A — 失败边界档案（v11）', () => {
  const archive = createFailureBoundaryArchive({ name: '咖啡机失败档案', description: '记录萃取失败边界' });

  it('append-only：写入断电记录后原档案不变', () => {
    const updated = appendFailureRecord(archive, {
      episodeRef:  'EP_brew_001',
      mechanismRef: mpBrew.id,
      description: '断电导致萃取中止',
      costs: [{ kind: 'resource', magnitude: 1, unit: 'shot', description: '损失一份咖啡原料' }],
      boundaryConditions: [{ variableRef: 'hasPower', direction: 'equal', thresholdValue: 0, description: '电源=false 时失败' }],
    });
    assert.equal(updated.records.length, 1);
    assert.equal(archive.records.length, 0, '原档案不可变');
  });

  it('边界检查：waterTemp=98 > 95 → 命中高温边界', () => {
    const arch = appendFailureRecord(archive, {
      episodeRef:  'EP_brew_002',
      description: '水温过高焦糊',
      costs: [{ kind: 'resource', description: '损失咖啡豆' }],
      boundaryConditions: [{ variableRef: 'waterTemp', direction: 'above', thresholdValue: 95, description: '超过 95°C 会焦糊' }],
    });
    const violations = checkBoundaryViolation(arch, 'waterTemp', 98);
    assert.equal(violations.length, 1);
  });

  it('边界检查：waterTemp=88 ≤ 95 → 不命中', () => {
    const arch = appendFailureRecord(archive, {
      episodeRef:  'EP_brew_003',
      description: '水温边界测试',
      costs: [{ kind: 'resource', description: '测试' }],
      boundaryConditions: [{ variableRef: 'waterTemp', direction: 'above', thresholdValue: 95, description: '' }],
    });
    const violations = checkBoundaryViolation(arch, 'waterTemp', 88);
    assert.equal(violations.length, 0);
  });
});

// =============================================================================
// 5. v11 ProofLineage + ConstitutionalLayer
// =============================================================================

describe('Scenario A — 证明谱系 + 宪法审计（v11）', () => {
  // 咖啡机断电诊断推导链
  const diagTrace = createDerivationTrace({
    id:               'DT_brew_diag_001',
    episodeId:        'EP_brew_001',
    contextKind:      'reconstruction',
    premiseClaimIds:  ['C_no_power_light', 'C_pump_silent'],
    conclusionClaimId: 'C_power_failure_root_cause',
    proof: [
      makeStep('C_no_power_light',  'C_electrical_issue'),
      makeStep('C_electrical_issue', 'C_power_failure_root_cause'),
    ],
    supportLinks: [
      makeSupportLink('SL_brew_001', 'OR_brew_001', 'C_power_failure_root_cause'),
    ],
    rejectedClaimIds: ['C_pump_failure', 'C_heating_element_failure'],
  });

  it('ProofLineage 从诊断 trace 构建成功（PL_ 前缀）', () => {
    const lineage = buildProofLineage([diagTrace], '咖啡机断电诊断谱系');
    assert.ok(lineage.id.startsWith('PL_'));
    assert.equal(lineage.conclusionClaimId, 'C_power_failure_root_cause');
    assert.equal(lineage.completeness, 'complete');
  });

  it('宪法审计：完整诊断链通过所有 mandatory 约束', () => {
    const lineage = buildProofLineage([diagTrace], '咖啡机断电诊断谱系');
    const layer  = createDefaultConstitutionalLayer();
    const audit  = auditSubject(layer, lineage, 'ProofLineage');
    assert.equal(audit.mandatoryPassed, true);
  });

  it('passedCount + failedCount = 5（全部标准约束）', () => {
    const lineage = buildProofLineage([diagTrace], '谱系');
    const layer  = createDefaultConstitutionalLayer();
    const audit  = auditSubject(layer, lineage, 'ProofLineage');
    assert.equal(audit.passedCount + audit.failedCount, 5);
  });

  it('allRejectedAlternatives 包含泵故障和加热元件故障', () => {
    const lineage = buildProofLineage([diagTrace], '谱系');
    assert.ok(lineage.allRejectedAlternatives.includes('C_pump_failure'));
    assert.ok(lineage.allRejectedAlternatives.includes('C_heating_element_failure'));
  });
});
