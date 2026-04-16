/**
 * PrunedBranchRecord 对象 + Store 直接测试
 * contract: docs/current/pruned-branch-record-contract.md
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createPrunedBranchRecord,
  assertValidPrunedBranchRecord,
} from '../core/pruned-branch-record.js';
import { PrunedBranchRecordStore } from '../core/pruned-branch-record-store.js';

describe('PrunedBranchRecord 工厂函数与不变量', () => {
  it('合法输入生成 PBR_<hex12> 形式 ID 且通过校验', () => {
    const pbr = createPrunedBranchRecord({
      branchDescription: '试图在未验证制度约束时直接 compile',
      prunedBy: ['institution'],
      presentSliceRef: 'PS_test123',
    });

    assert.match(pbr.id, /^PBR_[a-f0-9]{12}$/);
    assert.strictEqual(pbr.branchDescription, '试图在未验证制度约束时直接 compile');
    assert.deepStrictEqual(pbr.prunedBy, ['institution']);
    assert.strictEqual(pbr.presentSliceRef, 'PS_test123');
    assert.strictEqual(pbr.prunedByActor, 'system');
    assert.ok(pbr.prunedAt);
    // 可选字段默认空数组
    assert.deepStrictEqual(pbr.definingEpisodeIds, []);
    assert.deepStrictEqual(pbr.reactivationRisks, []);
    assert.deepStrictEqual(pbr.evidenceAtomIds, []);
  });

  it('PBR-1: branchDescription 空串触发抛出', () => {
    assert.throws(
      () =>
        createPrunedBranchRecord({
          branchDescription: '   ',
          prunedBy: ['failure'],
          presentSliceRef: 'PS_x',
        }),
      /PBR-1/,
    );
  });

  it('PBR-2: prunedBy 空数组触发抛出', () => {
    assert.throws(
      () =>
        createPrunedBranchRecord({
          branchDescription: 'x',
          prunedBy: [],
          presentSliceRef: 'PS_x',
        }),
      /PBR-2/,
    );
  });

  it('PBR-3: presentSliceRef 空串触发抛出', () => {
    assert.throws(
      () =>
        createPrunedBranchRecord({
          branchDescription: 'x',
          prunedBy: ['failure'],
          presentSliceRef: '',
        }),
      /PBR-3/,
    );
  });

  it('assertValidPrunedBranchRecord 对合法记录不抛', () => {
    const pbr = createPrunedBranchRecord({
      branchDescription: 'ok',
      prunedBy: ['design', 'physics'],
      presentSliceRef: 'PS_ok',
    });
    assert.doesNotThrow(() => assertValidPrunedBranchRecord(pbr));
  });
});

describe('PrunedBranchRecordStore CRUD', () => {
  it('save + get 往返一致', () => {
    const store = new PrunedBranchRecordStore(':memory:');
    const pbr = createPrunedBranchRecord({
      branchDescription: '断电下继续萃取',
      prunedBy: ['physics'],
      presentSliceRef: 'PS_brew_001',
      definingEpisodeIds: ['ep_1', 'ep_2'],
      reactivationRisks: ['备用电源接入'],
      rationale: 'hasPower=false 时无法完成加热',
    });
    store.save(pbr);

    const loaded = store.get(pbr.id);
    assert.ok(loaded);
    assert.strictEqual(loaded!.id, pbr.id);
    assert.strictEqual(loaded!.branchDescription, '断电下继续萃取');
    assert.deepStrictEqual(loaded!.prunedBy, ['physics']);
    assert.strictEqual(loaded!.presentSliceRef, 'PS_brew_001');
    assert.deepStrictEqual(loaded!.definingEpisodeIds, ['ep_1', 'ep_2']);

    store.close();
  });

  it('save 幂等：同 id 重复写入覆盖而非报错', () => {
    const store = new PrunedBranchRecordStore(':memory:');
    const pbr = createPrunedBranchRecord({
      branchDescription: 'v1',
      prunedBy: ['failure'],
      presentSliceRef: 'PS_x',
    });
    store.save(pbr);
    const mutated = { ...pbr, rationale: '更新后的理由' };
    assert.doesNotThrow(() => store.save(mutated));
    assert.strictEqual(store.get(pbr.id)!.rationale, '更新后的理由');
    store.close();
  });

  it('getByPresentSliceRef 按切片聚合', () => {
    const store = new PrunedBranchRecordStore(':memory:');
    const slice = 'PS_aggregate';

    store.save(createPrunedBranchRecord({
      branchDescription: 'b1',
      prunedBy: ['failure'],
      presentSliceRef: slice,
    }));
    store.save(createPrunedBranchRecord({
      branchDescription: 'b2',
      prunedBy: ['institution'],
      presentSliceRef: slice,
    }));
    store.save(createPrunedBranchRecord({
      branchDescription: 'b3',
      prunedBy: ['design'],
      presentSliceRef: 'PS_other',
    }));

    const pbrs = store.getByPresentSliceRef(slice);
    assert.strictEqual(pbrs.length, 2);
    assert.ok(pbrs.every(r => r.presentSliceRef === slice));

    store.close();
  });

  it('getByReason 按剪枝理由过滤', () => {
    const store = new PrunedBranchRecordStore(':memory:');
    store.save(createPrunedBranchRecord({
      branchDescription: 'a',
      prunedBy: ['failure'],
      presentSliceRef: 'PS_1',
    }));
    store.save(createPrunedBranchRecord({
      branchDescription: 'b',
      prunedBy: ['institution', 'design'],
      presentSliceRef: 'PS_1',
    }));

    const failures = store.getByReason('failure');
    assert.strictEqual(failures.length, 1);
    assert.strictEqual(failures[0].branchDescription, 'a');

    const designs = store.getByReason('design');
    assert.strictEqual(designs.length, 1);
    assert.strictEqual(designs[0].branchDescription, 'b');

    store.close();
  });

  it('getByEpisodeId 按 definingEpisodeIds 反查', () => {
    const store = new PrunedBranchRecordStore(':memory:');
    store.save(createPrunedBranchRecord({
      branchDescription: 'a',
      prunedBy: ['failure'],
      presentSliceRef: 'PS_1',
      definingEpisodeIds: ['ep_A', 'ep_B'],
    }));
    store.save(createPrunedBranchRecord({
      branchDescription: 'b',
      prunedBy: ['failure'],
      presentSliceRef: 'PS_1',
      definingEpisodeIds: ['ep_C'],
    }));

    const byA = store.getByEpisodeId('ep_A');
    assert.strictEqual(byA.length, 1);
    assert.strictEqual(byA[0].branchDescription, 'a');

    store.close();
  });

  it('getStats 返回总数与 byReason 细分', () => {
    const store = new PrunedBranchRecordStore(':memory:');
    store.save(createPrunedBranchRecord({
      branchDescription: 'a',
      prunedBy: ['failure'],
      presentSliceRef: 'PS_1',
    }));
    store.save(createPrunedBranchRecord({
      branchDescription: 'b',
      prunedBy: ['institution'],
      presentSliceRef: 'PS_1',
    }));
    store.save(createPrunedBranchRecord({
      branchDescription: 'c',
      prunedBy: ['failure', 'physics'],
      presentSliceRef: 'PS_2',
    }));

    const stats = store.getStats();
    assert.strictEqual(stats.totalCount, 3);
    assert.strictEqual(stats.byReason.failure, 2);
    assert.strictEqual(stats.byReason.institution, 1);
    assert.strictEqual(stats.byReason.physics, 1);
    assert.strictEqual(stats.byReason.design, 0);

    store.close();
  });
});
