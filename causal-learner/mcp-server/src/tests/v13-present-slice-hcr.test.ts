/**
 * v13 PresentSlice + HistoricalCompressionRecord 直接测试
 * 覆盖：工厂函数、不变量校验、buildPresentSliceFromPipeline、Store CRUD
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createPresentSlice,
  buildPresentSliceFromPipeline,
} from '../core/present-slice.js';
import type { CreatePresentSliceInput, PipelineSnapshot } from '../core/present-slice.js';
import { PresentSliceStore } from '../core/present-slice-store.js';

import {
  createHistoricalCompressionRecord,
  assertValidCompressionRecord,
} from '../core/historical-compression-record.js';
import type { CreateHistoricalCompressionRecordInput } from '../core/historical-compression-record.js';
import { HistoricalCompressionRecordStore } from '../core/historical-compression-record-store.js';

// =============================================================================
// 辅助
// =============================================================================

function makeSliceInput(overrides?: Partial<CreatePresentSliceInput>): CreatePresentSliceInput {
  return {
    name: '测试切片',
    episodeIds: ['ep_001'],
    fidelityScore: 0.8,
    ...overrides,
  };
}

function makeHcrInput(overrides?: Partial<CreateHistoricalCompressionRecordInput>): CreateHistoricalCompressionRecordInput {
  return {
    name: '测试压缩',
    sourceEpisodeIds: ['ep_001', 'ep_002'],
    targetPresentSliceId: 'PS_test',
    retainedAtomIds: ['atom_1'],
    discardedAtomIds: ['atom_2', 'atom_3'],
    ...overrides,
  };
}

// =============================================================================
// PresentSlice
// =============================================================================

describe('PresentSlice 工厂函数', () => {
  it('createPresentSlice 正常创建', () => {
    const s = createPresentSlice(makeSliceInput());
    assert.ok(s.id.startsWith('PS_'), 'id 应以 PS_ 开头');
    assert.strictEqual(s.name, '测试切片');
    assert.deepStrictEqual(s.episodeIds, ['ep_001']);
    assert.strictEqual(s.fidelityScore, 0.8);
    // 默认数组为空
    assert.deepStrictEqual(s.reconstructionIds, []);
    assert.deepStrictEqual(s.activeRegulationIds, []);
    assert.deepStrictEqual(s.activeBranchPointIds, []);
    assert.deepStrictEqual(s.unresolvedUnknowns, []);
  });

  it('fidelityScore 自动 clamp 到 [0,1]', () => {
    const tooHigh = createPresentSlice(makeSliceInput({ fidelityScore: 1.5 }));
    assert.strictEqual(tooHigh.fidelityScore, 1.0);

    const tooLow = createPresentSlice(makeSliceInput({ fidelityScore: -0.5 }));
    assert.strictEqual(tooLow.fidelityScore, 0.0);

    const nonFinite = createPresentSlice(makeSliceInput({ fidelityScore: NaN }));
    assert.strictEqual(nonFinite.fidelityScore, 0.0);
  });

  it('buildPresentSliceFromPipeline 计算 fidelityScore 均值', () => {
    const snapshot: PipelineSnapshot = {
      name: 'pipeline-slice',
      episodeIds: ['ep_001', 'ep_002'],
      reconstructionIds: ['rc_001', 'rc_002'],
      reconstructionFidelities: [0.6, 0.8],
      activeRegulationIds: ['reg_001'],
      activeBranchPointIds: ['bp_001'],
    };
    const s = buildPresentSliceFromPipeline(snapshot);
    assert.ok(s.id.startsWith('PS_'));
    assert.strictEqual(s.name, 'pipeline-slice');
    assert.strictEqual(s.fidelityScore, 0.7); // (0.6 + 0.8) / 2
    assert.ok(s.compressionSummary.includes('2 个 Episode'));
    assert.ok(s.compressionSummary.includes('2 个 Reconstruction'));
    assert.strictEqual(s.createdBy, 'pipeline');
  });

  it('buildPresentSliceFromPipeline 无 Reconstruction 时 fidelityScore=0', () => {
    const snapshot: PipelineSnapshot = {
      name: 'empty-slice',
      episodeIds: ['ep_001'],
      reconstructionIds: [],
      reconstructionFidelities: [],
      activeRegulationIds: [],
      activeBranchPointIds: [],
    };
    const s = buildPresentSliceFromPipeline(snapshot);
    assert.strictEqual(s.fidelityScore, 0);
  });
});

describe('PresentSliceStore CRUD', () => {
  it('save + get 往返一致', () => {
    const store = new PresentSliceStore(':memory:');
    const s = createPresentSlice(makeSliceInput({
      activeRegulationIds: ['reg_001'],
      visibleOutcomes: ['outcome_crash'],
    }));
    store.save(s);

    const loaded = store.get(s.id);
    assert.ok(loaded, 'get 应返回已保存的 slice');
    assert.strictEqual(loaded!.id, s.id);
    assert.deepStrictEqual(loaded!.activeRegulationIds, ['reg_001']);
    assert.deepStrictEqual(loaded!.visibleOutcomes, ['outcome_crash']);
    store.close();
  });

  it('get 不存在 ID 返回 null', () => {
    const store = new PresentSliceStore(':memory:');
    assert.strictEqual(store.get('PS_not_exist'), null);
    store.close();
  });

  it('save 幂等：同 id 重复写入覆盖', () => {
    const store = new PresentSliceStore(':memory:');
    const s = createPresentSlice(makeSliceInput({ fidelityScore: 0.5 }));
    store.save(s);
    // 更新后重存
    const updated = { ...s, fidelityScore: 0.9, name: '更新后' };
    store.save(updated);

    const loaded = store.get(s.id);
    assert.strictEqual(loaded!.fidelityScore, 0.9);
    assert.strictEqual(loaded!.name, '更新后');
    store.close();
  });

  it('getLowFidelity 返回低于阈值的记录', () => {
    const store = new PresentSliceStore(':memory:');
    store.save(createPresentSlice(makeSliceInput({ fidelityScore: 0.3 })));
    store.save(createPresentSlice(makeSliceInput({ fidelityScore: 0.5 })));
    store.save(createPresentSlice(makeSliceInput({ fidelityScore: 0.9 })));

    const low = store.getLowFidelity(0.6);
    assert.strictEqual(low.length, 2, '应返回 fidelity < 0.6 的 2 条');
    assert.ok(low.every(s => s.fidelityScore < 0.6));
    store.close();
  });

  it('getByEpisodeId 精确匹配', () => {
    const store = new PresentSliceStore(':memory:');
    store.save(createPresentSlice(makeSliceInput({ episodeIds: ['ep_001', 'ep_002'] })));
    store.save(createPresentSlice(makeSliceInput({ episodeIds: ['ep_002', 'ep_003'] })));
    store.save(createPresentSlice(makeSliceInput({ episodeIds: ['ep_999'] })));

    const byEp2 = store.getByEpisodeId('ep_002');
    assert.strictEqual(byEp2.length, 2, 'ep_002 出现在两条记录中');
    const byEp1 = store.getByEpisodeId('ep_001');
    assert.strictEqual(byEp1.length, 1);
    const byMissing = store.getByEpisodeId('ep_000');
    assert.strictEqual(byMissing.length, 0);
    store.close();
  });

  it('getStats 返回正确计数', () => {
    const store = new PresentSliceStore(':memory:');
    store.save(createPresentSlice(makeSliceInput()));
    store.save(createPresentSlice(makeSliceInput()));
    const stats = store.getStats();
    assert.strictEqual(stats.totalCount, 2);
    store.close();
  });
});

// =============================================================================
// HistoricalCompressionRecord
// =============================================================================

describe('HistoricalCompressionRecord 工厂函数', () => {
  it('createHistoricalCompressionRecord 正常创建', () => {
    const r = createHistoricalCompressionRecord(makeHcrInput());
    assert.ok(r.id.startsWith('HCR_'), 'id 应以 HCR_ 开头');
    assert.strictEqual(r.name, '测试压缩');
    assert.deepStrictEqual(r.sourceEpisodeIds, ['ep_001', 'ep_002']);
    assert.strictEqual(r.targetPresentSliceId, 'PS_test');
    assert.deepStrictEqual(r.retainedAtomIds, ['atom_1']);
    // compressionRatio 自动计算: 2 episodes / 1 retained = 2.0
    assert.strictEqual(r.compressionRatio, 2.0);
    assert.strictEqual(r.reversible, false);  // 默认不可逆
  });

  it('compressionRatio 自动计算：无 retained 时回退到 sourceCount', () => {
    const r = createHistoricalCompressionRecord(makeHcrInput({
      retainedAtomIds: [],
    }));
    // sourceEpisodeIds.length = 2，retainedAtomIds = [] → ratio = 2
    assert.strictEqual(r.compressionRatio, 2);
  });

  it('compressionRatio 可由调用方覆盖', () => {
    const r = createHistoricalCompressionRecord(makeHcrInput({ compressionRatio: 5.5 }));
    assert.strictEqual(r.compressionRatio, 5.5);
  });

  it('不变量 HCR-1：sourceEpisodeIds 为空时抛出', () => {
    assert.throws(
      () => createHistoricalCompressionRecord(makeHcrInput({ sourceEpisodeIds: [] })),
      /sourceEpisodeIds 不能为空/,
    );
  });

  it('不变量 HCR-2：compressionRatio <= 0 时抛出', () => {
    assert.throws(
      () => createHistoricalCompressionRecord(makeHcrInput({ compressionRatio: 0 })),
      /compressionRatio 必须 > 0/,
    );
    assert.throws(
      () => createHistoricalCompressionRecord(makeHcrInput({ compressionRatio: -1 })),
      /compressionRatio 必须 > 0/,
    );
  });

  it('assertValidCompressionRecord：对合法对象不抛出', () => {
    const r = createHistoricalCompressionRecord(makeHcrInput());
    assert.doesNotThrow(() => assertValidCompressionRecord(r));
  });

  it('reversible=true 可设置', () => {
    const r = createHistoricalCompressionRecord(makeHcrInput({
      reversible: true,
      lossDescription: '完整保留所有 atom，可逆压缩',
    }));
    assert.strictEqual(r.reversible, true);
    assert.strictEqual(r.lossDescription, '完整保留所有 atom，可逆压缩');
  });
});

describe('HistoricalCompressionRecordStore CRUD', () => {
  it('save + get 往返一致', () => {
    const store = new HistoricalCompressionRecordStore(':memory:');
    const r = createHistoricalCompressionRecord(makeHcrInput());
    store.save(r);

    const loaded = store.get(r.id);
    assert.ok(loaded, 'get 应返回已保存的记录');
    assert.strictEqual(loaded!.id, r.id);
    assert.strictEqual(loaded!.compressionRatio, r.compressionRatio);
    store.close();
  });

  it('get 不存在 ID 返回 null', () => {
    const store = new HistoricalCompressionRecordStore(':memory:');
    assert.strictEqual(store.get('HCR_not_exist'), null);
    store.close();
  });

  it('getByPresentSliceId：一个切片关联多条压缩记录', () => {
    const store = new HistoricalCompressionRecordStore(':memory:');
    store.save(createHistoricalCompressionRecord(makeHcrInput({ targetPresentSliceId: 'PS_A' })));
    store.save(createHistoricalCompressionRecord(makeHcrInput({ targetPresentSliceId: 'PS_A' })));
    store.save(createHistoricalCompressionRecord(makeHcrInput({ targetPresentSliceId: 'PS_B' })));

    assert.strictEqual(store.getByPresentSliceId('PS_A').length, 2);
    assert.strictEqual(store.getByPresentSliceId('PS_B').length, 1);
    assert.strictEqual(store.getByPresentSliceId('PS_C').length, 0);
    store.close();
  });

  it('getHighCompression 返回比率 >= 阈值的记录（降序）', () => {
    const store = new HistoricalCompressionRecordStore(':memory:');
    store.save(createHistoricalCompressionRecord(makeHcrInput({ compressionRatio: 1.5 })));
    store.save(createHistoricalCompressionRecord(makeHcrInput({ compressionRatio: 3.0 })));
    store.save(createHistoricalCompressionRecord(makeHcrInput({ compressionRatio: 5.0 })));

    const high = store.getHighCompression(3.0);
    assert.strictEqual(high.length, 2, '应返回 ratio >= 3.0 的 2 条');
    assert.ok(high[0].compressionRatio >= high[1].compressionRatio, '应按降序排列');
    store.close();
  });

  it('getReversible 只返回可逆记录', () => {
    const store = new HistoricalCompressionRecordStore(':memory:');
    store.save(createHistoricalCompressionRecord(makeHcrInput({ reversible: true })));
    store.save(createHistoricalCompressionRecord(makeHcrInput({ reversible: true })));
    store.save(createHistoricalCompressionRecord(makeHcrInput({ reversible: false })));

    const reversible = store.getReversible();
    assert.strictEqual(reversible.length, 2);
    assert.ok(reversible.every(r => r.reversible));
    store.close();
  });

  it('getStats 返回正确计数', () => {
    const store = new HistoricalCompressionRecordStore(':memory:');
    store.save(createHistoricalCompressionRecord(makeHcrInput()));
    store.save(createHistoricalCompressionRecord(makeHcrInput()));
    store.save(createHistoricalCompressionRecord(makeHcrInput()));
    assert.strictEqual(store.getStats().totalCount, 3);
    store.close();
  });
});
