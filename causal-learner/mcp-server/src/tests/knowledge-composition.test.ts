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
});
