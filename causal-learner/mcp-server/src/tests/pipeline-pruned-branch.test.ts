/**
 * Pipeline × PrunedBranchRecord 集成测试
 * contract: docs/current/pruned-branch-record-contract.md
 *
 * 验证 pipeline.recordPrunedBranch(input) 会：
 *   1. 创建 PBR 并持久化到 prunedBranchRecords
 *   2. 可通过 getByPresentSliceRef 反查
 *   3. 校验不变量 PBR-1/2/3（空 branchDescription / 空 prunedBy / 空 presentSliceRef 抛出）
 *   4. close() 后连接释放
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import { CausalPipeline } from '../core/pipeline.js';

describe('Pipeline × PrunedBranchRecord (v13 G5)', () => {
  it('recordPrunedBranch 写入 PBR 且可按 presentSliceRef 反查', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });

    const { prunedBranchRecord } = pipeline.recordPrunedBranch({
      branchDescription: '试图在 review rejected 之后继续 compile',
      prunedBy: ['institution'],
      presentSliceRef: 'PS_pipeline_001',
      definingEpisodeIds: ['ep_x'],
      rationale: 'review decision verdict=rejected',
    });

    assert.match(prunedBranchRecord.id, /^PBR_[a-f0-9]{12}$/);
    assert.strictEqual(prunedBranchRecord.presentSliceRef, 'PS_pipeline_001');

    const loaded = pipeline.prunedBranchRecords.get(prunedBranchRecord.id);
    assert.ok(loaded);
    assert.strictEqual(loaded!.branchDescription, '试图在 review rejected 之后继续 compile');

    const bySlice = pipeline.prunedBranchRecords.getByPresentSliceRef('PS_pipeline_001');
    assert.strictEqual(bySlice.length, 1);
    assert.strictEqual(bySlice[0].id, prunedBranchRecord.id);

    pipeline.close();
  });

  it('recordPrunedBranch 对空 branchDescription 抛 PBR-1', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    assert.throws(
      () => pipeline.recordPrunedBranch({
        branchDescription: '',
        prunedBy: ['failure'],
        presentSliceRef: 'PS_x',
      }),
      /PBR-1/,
    );
    pipeline.close();
  });

  it('recordPrunedBranch 对空 prunedBy 抛 PBR-2', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    assert.throws(
      () => pipeline.recordPrunedBranch({
        branchDescription: 'x',
        prunedBy: [],
        presentSliceRef: 'PS_x',
      }),
      /PBR-2/,
    );
    pipeline.close();
  });

  it('recordPrunedBranch 对空 presentSliceRef 抛 PBR-3', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    assert.throws(
      () => pipeline.recordPrunedBranch({
        branchDescription: 'x',
        prunedBy: ['failure'],
        presentSliceRef: '',
      }),
      /PBR-3/,
    );
    pipeline.close();
  });

  it('getStats 包含默认种子被剪记录为 0', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const stats = pipeline.prunedBranchRecords.getStats();
    assert.strictEqual(stats.totalCount, 0);
    assert.strictEqual(stats.byReason.failure, 0);
    pipeline.close();
  });

  it('多条不同 prunedBy 聚合到 byReason 正确', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    pipeline.recordPrunedBranch({
      branchDescription: 'a',
      prunedBy: ['failure'],
      presentSliceRef: 'PS_agg',
    });
    pipeline.recordPrunedBranch({
      branchDescription: 'b',
      prunedBy: ['institution', 'design'],
      presentSliceRef: 'PS_agg',
    });
    pipeline.recordPrunedBranch({
      branchDescription: 'c',
      prunedBy: ['physics'],
      presentSliceRef: 'PS_agg',
    });

    const stats = pipeline.prunedBranchRecords.getStats();
    assert.strictEqual(stats.totalCount, 3);
    assert.strictEqual(stats.byReason.failure, 1);
    assert.strictEqual(stats.byReason.institution, 1);
    assert.strictEqual(stats.byReason.design, 1);
    assert.strictEqual(stats.byReason.physics, 1);

    const bySlice = pipeline.prunedBranchRecords.getByPresentSliceRef('PS_agg');
    assert.strictEqual(bySlice.length, 3);

    pipeline.close();
  });
});
