/**
 * refutation.ts 反驳测试模块的单元测试
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Observation, Regulation, Fact } from '../core/types.js';
import { refuteRegulation } from '../core/refutation.js';
import type { RefutationResult } from '../core/refutation.js';

// =============================================================================
// 测试数据工厂
// =============================================================================

function makeFact(pred: string, value: unknown, args?: Record<string, unknown>): Fact {
  return { pred, value, args };
}

function makeObs(id: string, facts: Fact[]): Observation {
  return {
    observationId: id,
    timestamp: new Date().toISOString(),
    facts,
  };
}

function makeReg(id: string, pre: Fact[], eff: Fact[], supportN = 5): Regulation {
  return {
    regulationId: id,
    status: 'candidate',
    pre,
    eff,
    supportN,
    counterexampleN: 0,
    explainedCount: supportN,
    failedPredictions: 0,
  };
}

// =============================================================================
// 测试用例
// =============================================================================

describe('refuteRegulation', () => {
  it('返回正确结构', () => {
    const reg = makeReg('r1', [makeFact('a', true)], [makeFact('b', true)]);
    const obs = [makeObs('o1', [makeFact('a', true), makeFact('b', true)])];
    const result = refuteRegulation(reg, obs);

    assert.equal(result.regulationId, 'r1');
    assert.equal(result.tests.length, 3);
    assert.equal(typeof result.overallConfidence, 'number');
    assert.equal(typeof result.passed, 'boolean');
    assert.ok(result.overallConfidence >= 0 && result.overallConfidence <= 1);
  });

  it('三种测试类型齐全', () => {
    const reg = makeReg('r2', [makeFact('x', 1)], [makeFact('y', 2)]);
    const obs = [makeObs('o1', [makeFact('x', 1), makeFact('y', 2)])];
    const result = refuteRegulation(reg, obs);

    const types = result.tests.map(t => t.type).sort();
    assert.deepEqual(types, ['permutation', 'placebo', 'subset']);
  });

  it('每个 test 有 description 和 detail', () => {
    const reg = makeReg('r3', [makeFact('p', 'v')], [makeFact('e', 'w')]);
    const obs = [makeObs('o1', [makeFact('p', 'v')])];
    const result = refuteRegulation(reg, obs);

    for (const t of result.tests) {
      assert.ok(t.description.length > 0, `${t.type} 应有 description`);
      assert.ok(t.detail.length > 0, `${t.type} 应有 detail`);
    }
  });

  it('overallConfidence = passedCount / 3', () => {
    const reg = makeReg('r4', [makeFact('a', true)], [makeFact('b', true)]);
    const obs = [makeObs('o1', [makeFact('a', true)])];
    const result = refuteRegulation(reg, obs);

    const passedCount = result.tests.filter(t => t.passed).length;
    assert.equal(result.overallConfidence, passedCount / 3);
  });

  it('passed = overallConfidence > 0.5', () => {
    const reg = makeReg('r5', [makeFact('a', 1)], [makeFact('b', 2)]);
    const obs = [makeObs('o1', [makeFact('a', 1)])];
    const result = refuteRegulation(reg, obs);

    assert.equal(result.passed, result.overallConfidence > 0.5);
  });

  it('相同 seed 产生确定性结果', () => {
    const reg = makeReg('r6', [makeFact('a', 1)], [makeFact('b', 2)]);
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObs(`o${i}`, [
        makeFact('a', i % 3 === 0 ? 1 : 0),
        makeFact('b', 2),
        makeFact('c', i % 2),
      ])
    );

    const r1 = refuteRegulation(reg, obs, { seed: 123 });
    const r2 = refuteRegulation(reg, obs, { seed: 123 });
    assert.deepEqual(r1, r2);
  });

  it('不同 seed 可能产生不同结果', () => {
    const reg = makeReg('r7', [makeFact('a', 1)], [makeFact('b', 2)]);
    const obs = Array.from({ length: 20 }, (_, i) =>
      makeObs(`o${i}`, [
        makeFact('a', i % 4 === 0 ? 1 : i % 4),
        makeFact('b', 2),
        makeFact('c', i % 3),
      ])
    );

    const r1 = refuteRegulation(reg, obs, { seed: 1 });
    const r2 = refuteRegulation(reg, obs, { seed: 9999 });
    // 至少 detail 字符串应不同（因为采样不同）
    const details1 = r1.tests.map(t => t.detail).join('|');
    const details2 = r2.tests.map(t => t.detail).join('|');
    // 不强制不同（极小概率相同），但结构必须相同
    assert.equal(r1.tests.length, r2.tests.length);
  });
});

describe('Placebo test', () => {
  it('强因果 regulation 应通过 placebo 测试', () => {
    // pre value='alpha' 只在 6 条观测出现；其余 30 条观测的 value 各不相同
    // → placebo 替换后几乎不可能命中同样大小的 group → support 大幅下降
    const pre = [makeFact('a', 'alpha')];
    const eff = [makeFact('b', true)];
    const reg = makeReg('strong', pre, eff);

    const supporting = Array.from({ length: 6 }, (_, i) =>
      makeObs(`s${i}`, [makeFact('a', 'alpha'), makeFact('b', true)])
    );
    // 每条非匹配观测使用唯一 value → 任何单个替换值最多匹配 1 条
    const nonsupporting = Array.from({ length: 30 }, (_, i) =>
      makeObs(`n${i}`, [makeFact('a', `other_${i}`), makeFact('b', false)])
    );
    const allObs = [...supporting, ...nonsupporting];

    const result = refuteRegulation(reg, allObs);
    const placebo = result.tests.find(t => t.type === 'placebo')!;
    assert.ok(placebo.passed, `强因果 regulation 应通过 placebo: ${placebo.detail}`);
  });

  it('虚假 regulation（所有观测都满足 pre）应失败', () => {
    const pre = [makeFact('a', true)];
    const eff = [makeFact('b', true)];
    const reg = makeReg('spurious', pre, eff);

    // 所有观测的 a 都为 true → placebo 无法替换为不同值 → 保留原值 → 不会失败
    // 但如果有其他值可替换就不同了
    const allObs = Array.from({ length: 10 }, (_, i) =>
      makeObs(`o${i}`, [makeFact('a', true), makeFact('b', true)])
    );

    const result = refuteRegulation(reg, allObs);
    const placebo = result.tests.find(t => t.type === 'placebo')!;
    // 只有 value=true，没有其他候选值，placebo 无法替换 → support 不变 → 测试失败
    assert.ok(!placebo.passed, `无多样性观测下 placebo 应失败: ${placebo.detail}`);
  });
});

describe('Subset test', () => {
  it('观测不足时默认通过', () => {
    const reg = makeReg('r_small', [makeFact('a', 1)], [makeFact('b', 2)]);
    const obs = [
      makeObs('o1', [makeFact('a', 1)]),
      makeObs('o2', [makeFact('a', 1)]),
    ];

    const result = refuteRegulation(reg, obs);
    const subset = result.tests.find(t => t.type === 'subset')!;
    assert.ok(subset.passed, `不足 3 条观测应默认通过: ${subset.detail}`);
  });

  it('稳定 regulation 在子集上应通过', () => {
    const pre = [makeFact('a', 1)];
    const eff = [makeFact('b', 2)];
    const reg = makeReg('stable', pre, eff);

    // 所有观测都满足 pre → 比率始终 1.0
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObs(`o${i}`, [makeFact('a', 1), makeFact('b', 2)])
    );

    const result = refuteRegulation(reg, obs);
    const subset = result.tests.find(t => t.type === 'subset')!;
    assert.ok(subset.passed, `稳定 regulation 应通过子集测试: ${subset.detail}`);
  });
});

describe('Permutation test', () => {
  it('强因果 regulation 应通过 permutation 测试', () => {
    // pre value='X' 在 36 条观测中只有 6 条，其余 30 条各不相同
    // → 打乱后命中 'X' 的概率 ≈ 6/31 ≈ 0.19 → 平均 support 远低于原始
    const pre = [makeFact('a', 'X')];
    const eff = [makeFact('b', true)];
    const reg = makeReg('strong_perm', pre, eff);

    const obs = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeObs(`t${i}`, [makeFact('a', 'X'), makeFact('b', true)])
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        makeObs(`f${i}`, [makeFact('a', `val_${i}`), makeFact('b', false)])
      ),
    ];

    const result = refuteRegulation(reg, obs);
    const perm = result.tests.find(t => t.type === 'permutation')!;
    assert.ok(perm.passed, `强因果 regulation 应通过 permutation: ${perm.detail}`);
  });

  it('空 pre 的 regulation 在 permutation 中 support 不变', () => {
    const reg = makeReg('empty_pre', [], [makeFact('b', true)]);
    const obs = Array.from({ length: 5 }, (_, i) =>
      makeObs(`o${i}`, [makeFact('a', i), makeFact('b', true)])
    );

    const result = refuteRegulation(reg, obs);
    const perm = result.tests.find(t => t.type === 'permutation')!;
    // 空 pre → 所有观测都满足 → 打乱后也都满足 → ratio = 1.0 → 测试失败
    assert.ok(!perm.passed, `空 pre regulation permutation 应失败: ${perm.detail}`);
  });
});

describe('综合场景', () => {
  it('强因果场景应整体通过', () => {
    const pre = [makeFact('error_type', 'null_pointer')];
    const eff = [makeFact('crash', true)];
    const reg = makeReg('causal', pre, eff, 8);

    // 高 value 多样性：null_pointer 8 条，其余 30 条各有唯一 error_type
    // → placebo/permutation 替换后命中概率极低
    const obs = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeObs(`match${i}`, [
          makeFact('error_type', 'null_pointer'),
          makeFact('crash', true),
        ])
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        makeObs(`other${i}`, [
          makeFact('error_type', `err_${i}`),
          makeFact('crash', false),
        ])
      ),
    ];

    const result = refuteRegulation(reg, obs);
    assert.ok(result.passed, `强因果场景应整体通过: confidence=${result.overallConfidence}`);
    assert.ok(result.overallConfidence > 0.5);
  });

  it('零观测不崩溃', () => {
    const reg = makeReg('r_empty', [makeFact('a', 1)], [makeFact('b', 2)]);
    const result = refuteRegulation(reg, []);
    assert.equal(result.regulationId, 'r_empty');
    assert.equal(result.tests.length, 3);
  });

  it('单条观测不崩溃', () => {
    const reg = makeReg('r_one', [makeFact('a', 1)], [makeFact('b', 2)]);
    const obs = [makeObs('o1', [makeFact('a', 1), makeFact('b', 2)])];
    const result = refuteRegulation(reg, obs);
    assert.equal(result.tests.length, 3);
  });

  it('多 pred 多 value 的复杂 regulation', () => {
    const pre = [
      makeFact('os', 'linux'),
      makeFact('gpu', 'nvidia'),
      makeFact('driver', '535'),
    ];
    const eff = [makeFact('render_fail', true)];
    const reg = makeReg('complex', pre, eff, 8);

    const obs = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeObs(`m${i}`, [
          makeFact('os', 'linux'),
          makeFact('gpu', 'nvidia'),
          makeFact('driver', '535'),
          makeFact('render_fail', true),
        ])
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        makeObs(`d${i}`, [
          makeFact('os', 'windows'),
          makeFact('gpu', 'amd'),
          makeFact('driver', '23.12'),
          makeFact('render_fail', false),
        ])
      ),
    ];

    const result = refuteRegulation(reg, obs);
    assert.ok(result.passed, `复杂多 pred regulation 应通过: confidence=${result.overallConfidence}`);
  });
});
