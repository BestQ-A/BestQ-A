/**
 * v11 治理对象直接测试
 * 覆盖 Kilo 审计指出的缺口：ReconstructionStore、BranchPointStore、ConstitutionalLayer
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import { ReconstructionStore } from '../core/reconstruction-store.js';
import { BranchPointStore } from '../core/branch-point-store.js';
import { createBranchPoint, createFutureBranch, chooseBranch } from '../core/branch-point.js';
import { createDefaultConstitutionalLayer, auditSubject } from '../core/constitutional-layer.js';
import { CausalPipeline } from '../core/pipeline.js';

describe('ReconstructionStore 直接测试', () => {
  it('save + get 往返一致', () => {
    const store = new ReconstructionStore(':memory:');
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const obs = pipeline.submitObservation({
      rawInput: 'reconstruction store test',
      facts: [{ pred: 'error', value: 'store_test' }],
    });
    const result = pipeline.recordFix({
      storyId: obs.story.id,
      fixDescription: 'store test fix',
    });

    store.save(result.reconstruction);
    const loaded = store.get(result.reconstruction.id);
    assert.ok(loaded, 'reconstruction 应可查询');
    assert.strictEqual(loaded!.id, result.reconstruction.id);
    assert.strictEqual(loaded!.episode_id, obs.story.id);
    assert.ok(loaded!.fidelity.score >= 0);

    store.close();
    pipeline.close();
  });

  it('getByEpisode 按 episode 查询', () => {
    const store = new ReconstructionStore(':memory:');
    const pipeline = new CausalPipeline({ seedDefaults: false });

    const obs1 = pipeline.submitObservation({
      rawInput: 'episode query test 1',
      facts: [{ pred: 'error', value: 'eq1' }],
    });
    const r1 = pipeline.recordFix({ storyId: obs1.story.id, fixDescription: 'fix 1' });
    store.save(r1.reconstruction);

    const obs2 = pipeline.submitObservation({
      rawInput: 'episode query test 2',
      facts: [{ pred: 'error', value: 'eq2' }],
    });
    const r2 = pipeline.recordFix({ storyId: obs2.story.id, fixDescription: 'fix 2' });
    store.save(r2.reconstruction);

    const byEp1 = store.getByEpisode(obs1.story.id);
    assert.strictEqual(byEp1.length, 1);
    assert.strictEqual(byEp1[0].id, r1.reconstruction.id);

    assert.strictEqual(store.getStats().totalCount, 2);

    store.close();
    pipeline.close();
  });
});

describe('BranchPointStore 直接测试', () => {
  it('saveBranchPoint + saveFutureBranch + getBranches', () => {
    const store = new BranchPointStore(':memory:');

    const bp = createBranchPoint({
      episodeId: 'ep_test',
      locationDescription: '测试分叉',
      candidateCount: 3,
      controllableFactors: ['hasPower'],
    });
    store.saveBranchPoint(bp);

    const fb1 = createFutureBranch({
      branchPointId: bp.id,
      pathAtomIds: ['a1', 'a2'],
      score: 0.9,
      status: 'chosen',
    });
    const fb2 = createFutureBranch({
      branchPointId: bp.id,
      pathAtomIds: ['a1', 'a3'],
      score: 0.3,
      status: 'pruned',
      pruneReason: '路径无法解释观测',
    });
    store.saveFutureBranch(fb1);
    store.saveFutureBranch(fb2);

    const loaded = store.getBranchPoint(bp.id);
    assert.ok(loaded);
    assert.strictEqual(loaded!.episodeId, 'ep_test');

    const branches = store.getBranches(bp.id);
    assert.strictEqual(branches.length, 2);

    const pruned = store.getPrunedBranches();
    assert.strictEqual(pruned.length, 1);
    assert.strictEqual(pruned[0].status, 'pruned');

    const stats = store.getStats();
    assert.strictEqual(stats.branchPointCount, 1);
    assert.strictEqual(stats.futureBranchCount, 2);

    store.close();
  });

  it('chooseBranch 选择一条，剪除其余', () => {
    const bp = createBranchPoint({
      episodeId: 'ep_choose',
      locationDescription: '选择测试',
      candidateCount: 2,
    });

    const b1 = createFutureBranch({ branchPointId: bp.id, pathAtomIds: ['x'], score: 0.8 });
    const b2 = createFutureBranch({ branchPointId: bp.id, pathAtomIds: ['y'], score: 0.4 });

    const { branchPoint, branches } = chooseBranch(bp, [b1, b2], b1.id);
    assert.strictEqual(branchPoint.chosenBranchId, b1.id);
    assert.strictEqual(branches.find(b => b.id === b1.id)!.status, 'chosen');
    assert.strictEqual(branches.find(b => b.id === b2.id)!.status, 'pruned');
  });
});

describe('ConstitutionalLayer 审计通过（mandatory 约束修复验证）', () => {
  it('recordFix 产生的 DerivationTrace 通过全部 mandatory 约束', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const obs = pipeline.submitObservation({
      rawInput: 'constitutional test',
      facts: [{ pred: 'error', value: 'const_test' }],
    });

    const result = pipeline.recordFix({
      storyId: obs.story.id,
      fixDescription: 'constitutional fix',
    });

    // 从 pipeline 获取 trace（getByReconstruction 返回单个对象或 null）
    const trace = pipeline.derivationTraces.getByReconstruction(result.reconstruction.id);
    assert.ok(trace, 'reconstruction 应有关联 trace');

    // 执行宪法审计
    const layer = createDefaultConstitutionalLayer();
    const audit = auditSubject(layer, trace, 'DerivationTrace');

    // mandatory 约束必须全部通过
    const mandatoryResults = audit.results.filter(r => r.kind === 'mandatory');
    for (const r of mandatoryResults) {
      assert.ok(r.passed, `mandatory 约束 ${r.constraintName} 应通过: ${r.evidence}`);
    }
    assert.ok(audit.mandatoryPassed, 'mandatoryPassed 应为 true');

    pipeline.close();
  });
});
