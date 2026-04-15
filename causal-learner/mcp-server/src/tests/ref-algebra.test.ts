/**
 * ref-algebra.test.ts
 * 迁移自 test-v6-algebra.mjs 的 RefAlgebra + PatternEngine 测试
 * 使用 Node.js 内置 node:test + node:assert
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { getRefAlgebra, canCompose, isPathLegal, refFamily } from '../core/ref-algebra.js';
import { PatternEngine } from '../core/pattern-template.js';

describe('RefAlgebra', () => {
  const alg = getRefAlgebra();

  it('族群分类正确', () => {
    assert.strictEqual(refFamily('causes'), 'explanatory');
    assert.strictEqual(refFamily('indicates'), 'evidential');
    assert.strictEqual(refFamily('fixes'), 'interventional');
    assert.strictEqual(refFamily('is_a'), 'structural');
  });

  it('合法复合规则通过', () => {
    assert.strictEqual(canCompose('causes', 'causes'), true);
    assert.strictEqual(canCompose('fixes', 'causes'), true);
    assert.strictEqual(canCompose('is_a', 'causes'), true);
  });

  it('禁止复合规则被拦截（核心安全约束）', () => {
    assert.strictEqual(canCompose('indicates', 'causes'), false);
    assert.strictEqual(canCompose('cooccurs', 'causes'), false);
    assert.strictEqual(canCompose('part_of', 'causes'), false);
    assert.strictEqual(canCompose('indicates', 'fixes'), false);
  });

  it('路径合法性验证', () => {
    assert.strictEqual(isPathLegal(['causes', 'causes', 'causes']), true);
    assert.strictEqual(isPathLegal(['indicates', 'causes']), false);
    assert.strictEqual(isPathLegal(['is_a', 'causes', 'causes']), true);
  });

  it('RefForce 默认值正确', () => {
    assert.strictEqual(alg.getSpec('causes')?.defaultForce, 'contributory');
    assert.strictEqual(alg.getSpec('requires')?.defaultForce, 'necessary');
    assert.strictEqual(alg.getSpec('indicates')?.defaultForce, 'analogical');
  });

  it('EvidencePolicy 传递正确', () => {
    const r1 = alg.compose('causes', 'causes');
    assert.ok(r1.allowed && r1.evidencePolicy === 'inherit');

    const r2 = alg.compose('is_a', 'causes');
    assert.ok(r2.allowed && r2.evidencePolicy === 'revalidate');

    const r3 = alg.compose('indicates', 'indicates');
    assert.ok(r3.allowed && r3.evidencePolicy === 'discard');
  });

  it('proof-carrying validation 完整', () => {
    const rich = alg.validatePathRich(['causes', 'causes']);
    assert.ok(rich.valid);
    assert.strictEqual(rich.proof.length, 2);
    assert.ok(rich.resultForce != null);
    assert.ok(rich.evidencePolicy != null);

    const richFail = alg.validatePathRich(['indicates', 'causes']);
    assert.ok(!richFail.valid);
    assert.ok(richFail.proof.length >= 1);
  });

  it('mode 降级单调性：不会意外升级', () => {
    // direct ∘ direct → direct
    const r1 = alg.compose('causes', 'causes');
    assert.ok(r1.allowed && r1.mode === 'direct');

    // inherit ∘ direct → inherit
    const r2 = alg.compose('is_a', 'causes');
    assert.ok(r2.allowed && r2.mode === 'inherit');

    // weak ∘ weak → weak
    const r3 = alg.compose('indicates', 'indicates');
    assert.ok(r3.allowed && r3.mode === 'weak');

    // candidate 路径: similar_to ∘ causes
    const r4 = alg.compose('similar_to', 'causes');
    assert.ok(r4.allowed && r4.mode === 'candidate');

    // 路径降级: is_a(direct) → causes(direct) 复合结果是 inherit
    // 再继续 causes∘causes = direct, 路径整体 mode 应为 inherit
    const path = alg.validatePathRich(['is_a', 'causes', 'causes']);
    assert.ok(path.valid);
    assert.strictEqual(path.resultMode, 'inherit');
  });
});

describe('PatternEngine', () => {
  it('种子模板、匹配、不变量检查', () => {
    const pe = new PatternEngine(':memory:');
    pe.seedDefaults();

    const templates = pe.listTemplates();
    assert.ok(templates.length >= 3, `种子模板数量: ${templates.length}`);

    const diag = pe.getTemplate('PT_diagnostic');
    assert.ok(diag != null);
    assert.strictEqual(diag.slots.length, 4);
    assert.strictEqual(diag.arrows.length, 3);
    assert.ok((diag.invariantChecks?.length ?? 0) >= 2);

    const atoms = [
      { id: 'a1', kind: 'fact', content: 'timeout error' },
      { id: 'a2', kind: 'concept', content: 'connection pool exhausted' },
      { id: 'a3', kind: 'fact', content: 'API 500 error' },
      { id: 'a4', kind: 'action', content: 'increase pool size' },
    ];
    const refs = new Set(['a1|a2|indicates', 'a2|a3|causes', 'a4|a2|fixes']);
    const checker = (from: string, to: string, kind: string) => refs.has(`${from}|${to}|${kind}`);

    const matches = pe.matchTemplates(atoms, checker);
    assert.ok(matches.length > 0);
    assert.strictEqual(matches[0].template.id, 'PT_diagnostic');
    assert.ok(matches[0].instance.score > 0.5);

    const goodBindings = { Symptom: 'a1', Mechanism: 'a2', Failure: 'a3', Action: 'a4' };
    const good = pe.canCompile(diag, goodBindings, checker);
    assert.ok(good.allowed, '合法绑定通过');

    const badBindings = { Symptom: 'a1', Mechanism: 'a2', Failure: 'a1' };
    const bad = pe.canCompile(diag, badBindings, checker);
    assert.ok(!bad.allowed, 'Symptom==Failure 被阻止');

    pe.close();
  });
});
