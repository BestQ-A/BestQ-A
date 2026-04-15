/**
 * v8 运行时函数测试
 * 覆盖 executePhasedProgram、inferCounterfactual、computeInformationGain、selectOptimalExperiment
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMechanismProgram,
  executePhasedProgram,
  type ExecutionContext,
} from '../core/mechanism-program.js';
import { inferCounterfactual } from '../core/counterfactual-scenario.js';
import {
  computeInformationGain,
  selectOptimalExperiment,
  type HypothesisPredictor,
} from '../core/experiment-design.js';

// =============================================================================
// 测试用 MechanismProgram：BrewCoffee
// =============================================================================

function makeBrewCoffeeProgram() {
  return createMechanismProgram({
    mechanismClassRef: 'MC_brew_coffee',
    name: 'BrewCoffee',
    description: '咖啡机世界：heat → press → extract',
    inputStateRefs: ['hasPower', 'waterLevel', 'beanLevel'],
    phases: [
      {
        name: 'heat',
        expectedStateChanges: ['temperature=high'],
        expectedObservations: ['temperature'],
      },
      {
        name: 'press',
        expectedStateChanges: ['pressure=high'],
        expectedObservations: ['pressure'],
      },
      {
        name: 'extract',
        expectedStateChanges: ['cup.fillLevel=full'],
        expectedObservations: ['cup.fillLevel'],
      },
    ],
    outcomes: ['coffee_brewed', 'brew_failed'],
    interventionPoints: ['heat', 'press'],
    failsWhen: ['hasPower=false'],
  });
}

const baseContext: ExecutionContext = {
  stateVars: { hasPower: true, waterLevel: 'full', beanLevel: 'full' },
};

// =============================================================================
// executePhasedProgram 测试
// =============================================================================

describe('executePhasedProgram', () => {
  it('正常路径：所有 phase 执行完毕', () => {
    const program = makeBrewCoffeeProgram();
    const result = executePhasedProgram(program, baseContext);

    assert.equal(result.wasInterrupted, false);
    assert.equal(result.completedPhases, 3);
    assert.equal(result.totalPhases, 3);
    assert.equal(result.finalOutcome, 'coffee_brewed');
    assert.deepEqual(
      result.phaseResults.map(r => r.phaseName),
      ['heat', 'press', 'extract'],
    );
    assert.ok(result.phaseResults.every(r => r.executed));
  });

  it('干预路径：stopBeforePhase=press 时轨迹在 press 前中止', () => {
    const program = makeBrewCoffeeProgram();
    const result = executePhasedProgram(program, baseContext, {
      stopBeforePhase: 'press',
      reason: 'pump_disabled',
    });

    assert.equal(result.wasInterrupted, true);
    assert.equal(result.completedPhases, 1); // 只有 heat 完成
    assert.ok(result.finalOutcome.includes('interrupted'));
    assert.equal(result.phaseResults[0].executed, true);  // heat 执行了
    assert.equal(result.phaseResults[1].executed, false); // press 被拦截
  });

  it('failsWhen 路径：hasPower=false 时第一个 phase 中止', () => {
    const program = makeBrewCoffeeProgram();
    const noPowerCtx: ExecutionContext = {
      stateVars: { hasPower: false, waterLevel: 'full', beanLevel: 'full' },
    };
    const result = executePhasedProgram(program, noPowerCtx);

    assert.equal(result.wasInterrupted, true);
    assert.equal(result.completedPhases, 0);
    assert.ok(result.finalOutcome === 'brew_failed' || /fail/i.test(result.finalOutcome));
  });

  it('stateOverrides 被合并到执行上下文', () => {
    const program = makeBrewCoffeeProgram();
    const result = executePhasedProgram(program, baseContext, {
      stopBeforePhase: 'extract',
      stateOverrides: { waterLevel: 'empty' },
      reason: 'water_drained',
    });

    assert.equal(result.contextSnapshot.stateVars['waterLevel'], 'empty');
  });
});

// =============================================================================
// inferCounterfactual 测试
// =============================================================================

describe('inferCounterfactual', () => {
  it('hasPower=false 干预：轨迹停在 heat phase 之前', () => {
    const program = makeBrewCoffeeProgram();
    const cs = inferCounterfactual(
      program,
      baseContext,
      [{ targetRef: 'hasPower', modification: 'set', fromValue: true, toValue: false, rationale: '电源关闭' }],
      'ep_001',
      'rec_001',
    );

    assert.equal(cs.status, 'current');
    assert.ok(cs.predictedTrajectory.length >= 2);
    // 结局应该是 failed
    const outcomeStep = cs.predictedTrajectory.find(s => s.kind === 'outcome');
    assert.ok(outcomeStep);
    assert.ok(/fail/i.test(outcomeStep!.content));
    assert.equal(cs.divergencePoints.includes('hasPower'), true);
  });

  it('干预点 press：轨迹在 press 前中断', () => {
    const program = makeBrewCoffeeProgram();
    const cs = inferCounterfactual(
      program,
      baseContext,
      [{ targetRef: 'press', modification: 'set', fromValue: 'normal', toValue: 'disabled', rationale: '泵故障' }],
      'ep_002',
      'rec_002',
    );

    const outcomeStep = cs.predictedTrajectory.find(s => s.kind === 'outcome');
    assert.ok(outcomeStep);
    assert.ok(/interrupt/i.test(outcomeStep!.content));
  });

  it('predictedObservationSignals 只包含已执行 phase 的信号', () => {
    const program = makeBrewCoffeeProgram();
    // 正常执行：所有 phase 信号都应出现
    const cs = inferCounterfactual(
      program,
      baseContext,
      [{ targetRef: 'dummy', modification: 'set', fromValue: 0, toValue: 1 }],
      'ep_003',
      'rec_003',
    );
    // heat + press + extract 各自的 observation
    assert.ok(cs.predictedObservationSignals.includes('temperature'));
    assert.ok(cs.predictedObservationSignals.includes('pressure'));
    assert.ok(cs.predictedObservationSignals.includes('cup.fillLevel'));
  });
});

// =============================================================================
// computeInformationGain 测试
// =============================================================================

describe('computeInformationGain', () => {
  it('单一假设：增益为 0', () => {
    const h: HypothesisPredictor[] = [{ hypothesisId: 'MC_A', predictedSignals: ['temperature'] }];
    assert.equal(computeInformationGain(h), 0);
  });

  it('完全相同的预测：增益为 0', () => {
    const h: HypothesisPredictor[] = [
      { hypothesisId: 'MC_A', predictedSignals: ['temperature', 'pressure'] },
      { hypothesisId: 'MC_B', predictedSignals: ['temperature', 'pressure'] },
    ];
    assert.equal(computeInformationGain(h), 0);
  });

  it('完全不同的预测：增益为 1', () => {
    const h: HypothesisPredictor[] = [
      { hypothesisId: 'MC_PumpFailure', predictedSignals: ['temperature'] },
      { hypothesisId: 'MC_HeaterFailure', predictedSignals: ['pressure'] },
    ];
    assert.equal(computeInformationGain(h), 1);
  });

  it('部分区分：增益在 (0, 1)', () => {
    const h: HypothesisPredictor[] = [
      { hypothesisId: 'MC_A', predictedSignals: ['temperature', 'pressure'] },
      { hypothesisId: 'MC_B', predictedSignals: ['temperature'] },
      { hypothesisId: 'MC_C', predictedSignals: ['temperature', 'pressure'] },
    ];
    const gain = computeInformationGain(h);
    assert.ok(gain > 0 && gain < 1, `expected 0 < gain < 1, got ${gain}`);
  });
});

// =============================================================================
// selectOptimalExperiment 测试
// =============================================================================

describe('selectOptimalExperiment', () => {
  it('MC_PumpFailure vs MC_HeaterFailure：measure_pressure 区分力更高', () => {
    const actionPredictors: Record<string, HypothesisPredictor[]> = {
      measure_temperature: [
        { hypothesisId: 'MC_PumpFailure', predictedSignals: ['temperature_low'] },
        { hypothesisId: 'MC_HeaterFailure', predictedSignals: ['temperature_low'] },
      ],
      measure_pressure: [
        { hypothesisId: 'MC_PumpFailure', predictedSignals: ['pressure_low'] },
        { hypothesisId: 'MC_HeaterFailure', predictedSignals: ['pressure_normal'] },
      ],
    };

    const result = selectOptimalExperiment(actionPredictors);
    assert.equal(result.bestAction, 'measure_pressure');
    assert.ok(result.informationGain > 0);
    assert.equal(result.discriminatingPower['measure_temperature'], 0);
    assert.equal(result.discriminatingPower['measure_pressure'], 1);
  });

  it('空候选集：返回空字符串', () => {
    const result = selectOptimalExperiment({});
    assert.equal(result.bestAction, '');
    assert.equal(result.informationGain, 0);
  });
});
