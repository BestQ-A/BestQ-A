/**
 * 知识组合引擎测试 — 验证从公理到定理的组合推导
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { Regulation } from '../core/types.js';
import {
  isAxiom, getLevel, canChain, chainCompose,
  canMergeConditions, mergeConditions,
  traceKnowledge, renderKnowledgeTrace, discoverCompositions,
  computeTrust, stratifyByTrust,
} from '../core/knowledge-composition.js';

// 构造公理
const axiom1: Regulation = {
  regulationId: 'axiom_null_ptr',
  status: 'confirmed',
  pre: [{ pred: 'condition', value: 'null_pointer_access' }],
  eff: [{ pred: 'error_type', value: 'TypeError' }],
  level: 0,
  supportN: 50,
  description: '空指针访问导致 TypeError',
};

const axiom2: Regulation = {
  regulationId: 'axiom_config_missing',
  status: 'confirmed',
  pre: [{ pred: 'condition', value: 'config_file_missing' }],
  eff: [{ pred: 'state', value: 'init_failure' }],
  level: 0,
  supportN: 30,
  description: '配置缺失导致初始化失败',
};

const axiom3: Regulation = {
  regulationId: 'axiom_init_fail_crash',
  status: 'confirmed',
  pre: [{ pred: 'state', value: 'init_failure' }],
  eff: [{ pred: 'symptom', value: 'service_crash' }],
  level: 0,
  supportN: 40,
  description: '初始化失败导致服务崩溃',
};

const axiom4: Regulation = {
  regulationId: 'axiom_timeout_crash',
  status: 'confirmed',
  pre: [{ pred: 'condition', value: 'db_timeout' }],
  eff: [{ pred: 'symptom', value: 'service_crash' }],
  level: 0,
  supportN: 20,
  description: '数据库超时导致服务崩溃',
};

describe('知识组合引擎', () => {
  it('isAxiom 正确识别公理和定理', () => {
    assert.ok(isAxiom(axiom1));
    assert.ok(isAxiom(axiom2));

    const theorem: Regulation = {
      ...axiom1,
      regulationId: 'theorem_1',
      level: 1,
      derivedFrom: ['axiom_null_ptr'],
    };
    assert.ok(!isAxiom(theorem));
  });

  it('链式组合：配置缺失→初始化失败→服务崩溃', () => {
    assert.ok(canChain(axiom2, axiom3), '应可链式组合');

    const composed = chainCompose(axiom2, axiom3);
    assert.ok(composed, '组合应成功');

    // pre 应为 axiom2 的 pre（配置缺失）
    assert.ok(composed!.pre.some(f => f.value === 'config_file_missing'));
    // eff 应为 axiom3 的 eff（服务崩溃）
    assert.ok(composed!.eff.some(f => f.value === 'service_crash'));
    // 中间节点（init_failure）不应出现在 pre 或 eff 中
    assert.ok(!composed!.pre.some(f => f.value === 'init_failure'));
    // level = max(0, 0) + 1 = 1
    assert.strictEqual(composed!.level, 1);
    // derivedFrom 引用两条公理
    assert.deepStrictEqual(composed!.derivedFrom, ['axiom_config_missing', 'axiom_init_fail_crash']);

    console.log('链式组合结果:');
    console.log(`  pre: ${composed!.pre.map(f => `${f.pred}=${f.value}`).join(' ∧ ')}`);
    console.log(`  eff: ${composed!.eff.map(f => `${f.pred}=${f.value}`).join(' ∧ ')}`);
    console.log(`  level: ${composed!.level}, derivedFrom: ${composed!.derivedFrom}`);
  });

  it('条件组合：两种原因→同一结果', () => {
    assert.ok(canMergeConditions(axiom3, axiom4), '应可条件组合（共享 service_crash）');

    const merged = mergeConditions(axiom3, axiom4);
    assert.ok(merged, '合并应成功');

    // eff 应为共同的 service_crash
    assert.ok(merged!.eff.some(f => f.value === 'service_crash'));
    // pre 应包含两种原因
    assert.ok(merged!.pre.some(f => f.value === 'init_failure'));
    assert.ok(merged!.pre.some(f => f.value === 'db_timeout'));
    // support = 40 + 20 = 60
    assert.strictEqual(merged!.supportN, 60);
  });

  it('不可组合的 regulation 返回 null', () => {
    assert.ok(!canChain(axiom1, axiom4), '无共享节点不可链式组合');
    assert.strictEqual(chainCompose(axiom1, axiom4), null);
  });

  it('知识追溯：从定理到公理的完整链', () => {
    // 先组合出定理
    const theorem = chainCompose(axiom2, axiom3)!;
    assert.ok(theorem);

    // 构建 lookup
    const all = new Map<string, Regulation>();
    all.set(axiom2.regulationId, axiom2);
    all.set(axiom3.regulationId, axiom3);
    all.set(theorem.regulationId, theorem);

    const trace = traceKnowledge(theorem.regulationId, id => all.get(id) ?? null);
    assert.ok(trace);
    assert.strictEqual(trace!.level, 1);
    assert.strictEqual(trace!.children.length, 2);
    assert.ok(trace!.children.every(c => c.level === 0), '子节点应为公理（level=0）');

    const rendered = renderKnowledgeTrace(trace!);
    console.log('\n知识追溯:');
    console.log(rendered);
    assert.ok(rendered.includes('[公理]'), '应包含公理标记');
    assert.ok(rendered.includes('[L1]'), '应包含 L1 标记');
  });

  it('自动发现组合', () => {
    const allRegs = [axiom1, axiom2, axiom3, axiom4];
    const discovered = discoverCompositions(allRegs);

    assert.ok(discovered.length > 0, '应发现至少一条组合');
    // axiom2→axiom3 应被发现
    const hasChain = discovered.some(d =>
      d.derivedFrom?.includes('axiom_config_missing') &&
      d.derivedFrom?.includes('axiom_init_fail_crash')
    );
    assert.ok(hasChain, '应发现 配置缺失→初始化失败→服务崩溃 链');

    console.log(`\n自动发现 ${discovered.length} 条组合知识:`);
    for (const d of discovered) {
      console.log(`  ${d.description} (level=${d.level})`);
    }
  });

  it('computeTrust 消费 confirmedByEvents — 事件证据链提升信任度', () => {
    const withEvents: Regulation = {
      ...axiom1,
      regulationId: 'test_with_events',
      supportN: 10,
      confirmedByEvents: ['e1', 'e2', 'e3'],
      challengedByEvents: [],
      status: 'confirmed',
    };
    const withoutEvents: Regulation = {
      ...axiom1,
      regulationId: 'test_without_events',
      supportN: 3,
      confirmedByEvents: [],
      challengedByEvents: [],
      status: 'confirmed',
    };
    const noData: Regulation = {
      ...axiom1,
      regulationId: 'test_no_data',
      supportN: 0,
      confirmedByEvents: [],
      challengedByEvents: [],
      status: 'confirmed',
    };

    const trustWith = computeTrust(withEvents);
    const trustWithout = computeTrust(withoutEvents);
    const trustNone = computeTrust(noData);

    // 事件越多支撑越强，信任度越高
    assert.ok(trustWith > trustWithout, `有事件证据(${trustWith.toFixed(3)}) 应 > 无事件证据(${trustWithout.toFixed(3)})`);
    assert.ok(trustWithout > trustNone, `有 support(${trustWithout.toFixed(3)}) 应 > 无数据(${trustNone.toFixed(3)})`);
    // 无数据退化为最低猜测值 0.05
    assert.strictEqual(trustNone, 0.05);
    // 有反例会压低信任度
    const withChallenge: Regulation = {
      ...withEvents,
      regulationId: 'test_with_challenge',
      challengedByEvents: ['c1', 'c2', 'c3', 'c4', 'c5'],
    };
    assert.ok(computeTrust(withChallenge) < trustWith, '有挑战事件应降低信任度');

    console.log(`\ncomputeTrust 结果:`);
    console.log(`  有事件(support=10, confirmed=3): ${trustWith.toFixed(3)}`);
    console.log(`  无事件(support=3): ${trustWithout.toFixed(3)}`);
    console.log(`  无数据(support=0): ${trustNone.toFixed(3)}`);
    console.log(`  有挑战事件(confirmed=3, challenged=5): ${computeTrust(withChallenge).toFixed(3)}`);
  });

  it('stratifyByTrust 正确分层', () => {
    // 高信任度：support 极大 + 大量 confirmedByEvents（需 total>=255 才能 >=0.8）
    const highTrust: Regulation = {
      ...axiom1,
      regulationId: 'high_trust',
      supportN: 200,
      confirmedByEvents: Array.from({ length: 100 }, (_, i) => `e${i}`),
      challengedByEvents: [],
      status: 'confirmed',
    };
    // 中等信任度：axiom1～axiom4 的 supportN=20-50，无 confirmedByEvents → trust ∈ [0.3,0.8)
    // 低信任度：无数据
    const zeroTrust: Regulation = {
      ...axiom1,
      regulationId: 'zero_trust',
      supportN: 0,
      confirmedByEvents: [],
      challengedByEvents: [],
      status: 'confirmed',
    };

    const allRegs = [axiom1, axiom2, axiom3, axiom4, highTrust, zeroTrust];
    const { axioms, theorems, hypotheses } = stratifyByTrust(allRegs);

    // 总数守恒
    assert.strictEqual(axioms.length + theorems.length + hypotheses.length, allRegs.length);

    // zeroTrust 信任度=0.05 → hypotheses
    assert.ok(hypotheses.some(r => r.regulationId === 'zero_trust'), 'zeroTrust 应在 hypotheses');

    // highTrust 信任度应为最高层（axioms 或 theorems 均可接受，取决于样本量阈值）
    const highTrustVal = computeTrust(highTrust);
    assert.ok(highTrustVal >= 0.3, `highTrust 信任度 ${highTrustVal.toFixed(3)} 应 >= 0.3`);

    // axiom1～4 有 supportN，信任度 > 0.05 → 不在 hypotheses
    for (const ax of [axiom1, axiom2, axiom3, axiom4]) {
      assert.ok(
        !hypotheses.some(r => r.regulationId === ax.regulationId),
        `${ax.regulationId} 有 support，不应在 hypotheses`
      );
    }

    console.log('\nstratifyByTrust 分层结果:');
    console.log(`  axioms (trust>=0.8): ${axioms.map(r => r.regulationId).join(', ') || '无'}`);
    console.log(`  theorems (0.3-0.8): ${theorems.map(r => r.regulationId).join(', ') || '无'}`);
    console.log(`  hypotheses (<0.3): ${hypotheses.map(r => r.regulationId).join(', ') || '无'}`);
    for (const r of allRegs) {
      console.log(`    ${r.regulationId}: trust=${computeTrust(r).toFixed(3)}`);
    }
  });
});
