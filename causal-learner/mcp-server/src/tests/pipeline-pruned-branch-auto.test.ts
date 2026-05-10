/**
 * Pipeline × 自动派生 PrunedBranchRecord（v13 G5 闭环）
 * contract: docs/current/pruned-branch-record-contract.md
 *
 * 验证 recordFix 在 pipeline Step 6.5 派生 BranchPoint + pruned FutureBranch 后，
 * Step 9c 会自动为每条 pruned future branch 派生 PBR，绑定到同次 Step 9 生成的
 * PresentSlice。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import { CausalPipeline } from '../core/pipeline.js';
import { AtomKind, RefKind } from '../core/atom-graph.js';

function seedCompileReadyStory(pipeline: CausalPipeline): { storyId: string; chosenPath: string[]; failedPath1: string[]; failedPath2: string[] } {
  const obs = pipeline.submitObservation({
    rawInput: 'auto-PBR observation',
    facts: [{ pred: 'symptom', value: 'crash' }],
  });
  const sourceAtomId = obs.story.observationAtomIds[0];
  assert.ok(sourceAtomId);

  // chosen path: source → fix
  const fixAtom = pipeline.graph.addAtom('auto-pbr fix', AtomKind.ACTION);
  pipeline.graph.addRef(sourceAtomId, fixAtom.id, RefKind.FIXES, {
    weight: 0.9, mode: 'tentative', provenance: 'manual',
  });

  // 两条失败路径：用两个独立 atom 代表被剪分支
  const failed1A = pipeline.graph.addAtom('failed alt path 1', AtomKind.ACTION);
  const failed2A = pipeline.graph.addAtom('failed alt path 2', AtomKind.ACTION);

  return {
    storyId: obs.story.id,
    chosenPath: [sourceAtomId, fixAtom.id],
    failedPath1: [sourceAtomId, failed1A.id],
    failedPath2: [sourceAtomId, failed2A.id],
  };
}

describe('Pipeline × 自动派生 PrunedBranchRecord (v13 G5 闭环)', () => {
  it('recordFix 带 failedPathAtomIds 会为每条被剪分支自动派生 PBR', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const { storyId, chosenPath, failedPath1, failedPath2 } = seedCompileReadyStory(pipeline);

    const before = pipeline.prunedBranchRecords.getStats().totalCount;
    assert.strictEqual(before, 0);

    pipeline.recordFix({
      storyId,
      fixDescription: 'auto-trigger PBR 闭环验证',
      chosenPathAtomIds: chosenPath,
      failedPathAtomIds: [failedPath1, failedPath2],
      operator: 'test_auto_pbr',
    });

    const after = pipeline.prunedBranchRecords.getStats().totalCount;
    assert.strictEqual(after, 2, '两条 failedPath 应当派生出 2 条 PBR');

    pipeline.close();
  });

  it('自动派生的 PBR 正确绑定到本次 recordFix 生成的 PresentSlice', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const { storyId, chosenPath, failedPath1 } = seedCompileReadyStory(pipeline);

    pipeline.recordFix({
      storyId,
      fixDescription: '绑定 presentSliceRef 验证',
      chosenPathAtomIds: chosenPath,
      failedPathAtomIds: [failedPath1],
      operator: 'test_bind',
    });

    const pbrs = pipeline.prunedBranchRecords.getStats().totalCount > 0
      ? pipeline.prunedBranchRecords.getByEpisodeId(storyId)
      : [];
    assert.strictEqual(pbrs.length, 1);
    const pbr = pbrs[0];

    // presentSliceRef 必须指向本次 recordFix 生成的 PresentSlice
    const relatedSlice = pipeline.presentSlices.get(pbr.presentSliceRef);
    assert.ok(relatedSlice, 'PBR.presentSliceRef 应能反查到 PresentSlice');
    assert.ok(relatedSlice!.episodeIds.includes(storyId));

    // evidenceAtomIds 应包含 failedPath 的 atom
    assert.deepStrictEqual(pbr.evidenceAtomIds, failedPath1);
    // definingEpisodeIds 绑定 storyId
    assert.deepStrictEqual(pbr.definingEpisodeIds, [storyId]);
    // prunedBy 默认 failure
    assert.deepStrictEqual(pbr.prunedBy, ['failure']);
    // actor 透传 operator
    assert.strictEqual(pbr.prunedByActor, 'test_bind');

    pipeline.close();
  });

  it('recordFix 无 failedPathAtomIds 时不派生 PBR', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const { storyId, chosenPath } = seedCompileReadyStory(pipeline);

    pipeline.recordFix({
      storyId,
      fixDescription: '无失败分支',
      chosenPathAtomIds: chosenPath,
      operator: 'test_no_failed',
    });

    assert.strictEqual(pipeline.prunedBranchRecords.getStats().totalCount, 0);
    pipeline.close();
  });

  it('两次 recordFix（不同 story）各自派生独立 PBR，互不串流', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const seed1 = seedCompileReadyStory(pipeline);
    const seed2 = seedCompileReadyStory(pipeline);

    pipeline.recordFix({
      storyId: seed1.storyId,
      fixDescription: 'fix 1',
      chosenPathAtomIds: seed1.chosenPath,
      failedPathAtomIds: [seed1.failedPath1],
    });
    pipeline.recordFix({
      storyId: seed2.storyId,
      fixDescription: 'fix 2',
      chosenPathAtomIds: seed2.chosenPath,
      failedPathAtomIds: [seed2.failedPath1, seed2.failedPath2],
    });

    const stats = pipeline.prunedBranchRecords.getStats();
    assert.strictEqual(stats.totalCount, 3);

    const byStory1 = pipeline.prunedBranchRecords.getByEpisodeId(seed1.storyId);
    const byStory2 = pipeline.prunedBranchRecords.getByEpisodeId(seed2.storyId);
    assert.strictEqual(byStory1.length, 1);
    assert.strictEqual(byStory2.length, 2);

    pipeline.close();
  });
});
