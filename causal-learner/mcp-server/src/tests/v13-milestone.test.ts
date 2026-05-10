/**
 * v13 里程碑集成测试 — 历史生成本体引擎 (G1-G6 闭环)
 *
 * 验证单次 submitObservation + recordFix 调用，会把 v13 全部 6 个核心对象写入各自存储：
 *   G1/G2  Episode → PresentSlice + HistoricalCompressionRecord
 *   G3     AcceptedReconstruction (Minimal Sufficient Provenance)
 *   G4     BranchPoint + FutureBranch (可干预分叉)
 *   G5     PrunedBranchRecord (被剪掉的可能性空间)
 *   G6     LineageCompileProposal (谱系编译提案，经制度审理后进入文明记忆)
 *
 * 本文件不重复测试各对象的不变量——那是各自的 unit test 职责。
 * 这里只断言：经过 pipeline，6 个对象全部在存储中可查到，且关键外键对齐。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import { CausalPipeline } from '../core/pipeline.js';
import { AtomKind, RefKind } from '../core/atom-graph.js';

/**
 * fixDescription 必须与 recordFix({ fixDescription }) 保持一致：
 * pipeline Step 1 调用 addAtom(fixDescription, ACTION)，addAtom 按 (canonical_key, kind) 去重，
 * 一致时返回已有 atom，compile 才能找到已有 FIXES ref。
 */
const FIX_DESC = 'patch security-group rule';

function buildScenario(pipeline: CausalPipeline) {
  // G1: 观测写入 → Episode 存在
  const obs = pipeline.submitObservation({
    rawInput: 'v13-milestone: 数据库连接超时',
    facts: [
      { pred: 'error_type', value: 'ConnectionTimeout' },
      { pred: 'symptom', value: 'db_unreachable' },
    ],
  });
  const storyId = obs.story.id;
  const sourceAtomId = obs.story.observationAtomIds[0];
  assert.ok(sourceAtomId, 'G1: 观测必须产生至少一个 atom');

  // fixAtom 用 FIX_DESC 创建，与 recordFix fixDescription 保持一致（去重逻辑）
  const fixAtom = pipeline.graph.addAtom(FIX_DESC, AtomKind.ACTION);
  pipeline.graph.addRef(sourceAtomId, fixAtom.id, RefKind.FIXES, {
    weight: 0.9, mode: 'tentative', provenance: 'manual',
  });

  const altAtom1 = pipeline.graph.addAtom('restart service only', AtomKind.ACTION);
  const altAtom2 = pipeline.graph.addAtom('increase timeout threshold', AtomKind.ACTION);

  return {
    storyId,
    chosenPath: [sourceAtomId, fixAtom.id],
    failedPath1: [sourceAtomId, altAtom1.id],
    failedPath2: [sourceAtomId, altAtom2.id],
  };
}

describe('v13 里程碑：单次 recordFix 闭合 G1-G6 六个对象', () => {
  it('G3: recordFix 写入 AcceptedReconstruction 并持久化', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const { storyId, chosenPath } = buildScenario(pipeline);

    const { reconstruction } = pipeline.recordFix({
      storyId,
      fixDescription: 'v13 G3 重建验证',
      chosenPathAtomIds: chosenPath,
      operator: 'test_v13',
    });

    const stored = pipeline.reconstructions.get(reconstruction.id);
    assert.ok(stored, 'G3: AcceptedReconstruction 必须持久化到 ReconstructionStore');
    assert.strictEqual(stored!.episode_id, storyId);
    assert.ok(stored!.majorChain.length > 0, 'G3: majorChain 必须非空（MSP 来源链）');

    pipeline.close();
  });

  it('G4: recordFix 写入 BranchPoint + FutureBranch（可干预分叉）', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const { storyId, chosenPath, failedPath1 } = buildScenario(pipeline);

    pipeline.recordFix({
      storyId,
      fixDescription: 'v13 G4 分叉验证',
      chosenPathAtomIds: chosenPath,
      failedPathAtomIds: [failedPath1],
      operator: 'test_v13',
    });

    const bps = pipeline.branchPoints.getByEpisode(storyId);
    assert.ok(bps.length > 0, 'G4: BranchPoint 必须持久化');

    const bp = bps[0];
    assert.ok(bp.chosenBranchId, 'G4: BranchPoint.chosenBranchId 必须存在');
    // getPrunedBranches 返回全局 pruned 列表；本 story 有 failedPath 所以必然 > 0
    const pruned = pipeline.branchPoints.getPrunedBranches();
    assert.ok(pruned.length > 0, 'G4: 必须存在至少一条 pruned FutureBranch');

    pipeline.close();
  });

  it('G5: recordFix 为每条 failedPath 自动派生 PrunedBranchRecord', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const { storyId, chosenPath, failedPath1, failedPath2 } = buildScenario(pipeline);

    pipeline.recordFix({
      storyId,
      fixDescription: 'v13 G5 PBR 验证',
      chosenPathAtomIds: chosenPath,
      failedPathAtomIds: [failedPath1, failedPath2],
      operator: 'test_v13',
    });

    const stats = pipeline.prunedBranchRecords.getStats();
    assert.strictEqual(stats.totalCount, 2, 'G5: 两条 failedPath 必须派生 2 条 PBR');
    assert.strictEqual(stats.byReason.failure, 2, 'G5: 默认 prunedBy=failure');

    const pbrs = pipeline.prunedBranchRecords.getByEpisodeId(storyId);
    assert.strictEqual(pbrs.length, 2);
    for (const pbr of pbrs) {
      assert.ok(pbr.presentSliceRef, 'G5: PBR.presentSliceRef 必须绑定到本次 PresentSlice');
      const slice = pipeline.presentSlices.get(pbr.presentSliceRef);
      assert.ok(slice, 'G5: presentSliceRef 可反查到 PresentSlice');
    }

    pipeline.close();
  });

  it('G2: recordFix 写入 PresentSlice + HistoricalCompressionRecord', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const { storyId, chosenPath } = buildScenario(pipeline);

    pipeline.recordFix({
      storyId,
      fixDescription: 'v13 G2 当下切片验证',
      chosenPathAtomIds: chosenPath,
      operator: 'test_v13',
    });

    const slices = pipeline.presentSlices.getByEpisodeId(storyId);
    assert.ok(slices.length > 0, 'G2: PresentSlice 必须持久化');

    const slice = slices[0];
    assert.ok(slice.episodeIds.includes(storyId), 'G2: PresentSlice.episodeIds 必须含 storyId');
    assert.ok(slice.fidelityScore >= 0 && slice.fidelityScore <= 1, 'G2: fidelityScore 在 [0,1]');

    const hcrs = pipeline.historicalCompressionRecords.getByPresentSliceId(slice.id);
    assert.ok(hcrs.length > 0, 'G2: HistoricalCompressionRecord 必须绑定到 PresentSlice');
    assert.ok(hcrs[0].sourceEpisodeIds.includes(storyId), 'G2: HCR.sourceEpisodeIds 含 storyId');

    pipeline.close();
  });

  it('G6: recordFix 写入 LineageCompileProposal（谱系编译提案，compile 门控通过）', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const { storyId, chosenPath } = buildScenario(pipeline);

    // LCP 仅在 canPromote + compiledRefs > 0 时创建；mock 门控使 compile 通过
    // fixDescription 必须与 FIX_DESC 一致，否则 addAtom 创建新 atom，compile 无法找到 FIXES ref
    const orig = pipeline.hypotheses.canPromote.bind(pipeline.hypotheses);
    (pipeline.hypotheses as { canPromote: typeof orig }).canPromote = () => ({ allowed: true });

    pipeline.recordFix({
      storyId,
      fixDescription: FIX_DESC,
      chosenPathAtomIds: chosenPath,
      operator: 'test_v13',
    });

    const proposals = pipeline.lineageCompileProposals.listAll(10);
    assert.ok(proposals.length > 0, 'G6: LineageCompileProposal 必须持久化');

    const lcp = proposals[0];
    assert.ok(lcp.targetPresentSliceId, 'G6: LCP 必须绑定 targetPresentSliceId');
    assert.ok(lcp.supportingEpisodes.includes(storyId), 'G6: LCP.supportingEpisodes 必须含 storyId');
    assert.ok(['draft', 'applied'].includes(lcp.status), 'G6: LCP 初始状态合法');

    pipeline.close();
  });

  it('G1-G6 全链路：单次 recordFix（compile 门控通过，含失败路径）六存储均有写入', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const { storyId, chosenPath, failedPath1 } = buildScenario(pipeline);

    // mock canPromote 使 compile 成功，触发 LCP 创建
    const orig = pipeline.hypotheses.canPromote.bind(pipeline.hypotheses);
    (pipeline.hypotheses as { canPromote: typeof orig }).canPromote = () => ({ allowed: true });

    pipeline.recordFix({
      storyId,
      fixDescription: FIX_DESC,  // 与 buildScenario fixAtom 内容一致，compile 才能找到 FIXES ref
      chosenPathAtomIds: chosenPath,
      failedPathAtomIds: [failedPath1],
      operator: 'test_v13_full',
    });

    // 六个对象全部可查
    assert.ok(pipeline.reconstructions.getByEpisode(storyId).length > 0,       'G3 AcceptedReconstruction');
    assert.ok(pipeline.branchPoints.getByEpisode(storyId).length > 0,           'G4 BranchPoint');
    assert.ok(pipeline.presentSlices.getByEpisodeId(storyId).length > 0,        'G2 PresentSlice');
    assert.ok(pipeline.historicalCompressionRecords.listAll(5).length > 0,      'G2 HCR');
    assert.ok(pipeline.lineageCompileProposals.listAll(5).length > 0,           'G6 LCP');
    assert.strictEqual(pipeline.prunedBranchRecords.getStats().totalCount, 1,   'G5 PBR=1');

    pipeline.close();
  });

  it('G1-G5（无 compile）：recordFix 无 canPromote 时仍完成 G2/G3/G4/G5', () => {
    // 验证 LCP 是 best-effort：即使 compile 未通过，其他 5 个对象照常写入
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const { storyId, chosenPath, failedPath1 } = buildScenario(pipeline);

    pipeline.recordFix({
      storyId,
      fixDescription: 'v13 无 compile 闭环',
      chosenPathAtomIds: chosenPath,
      failedPathAtomIds: [failedPath1],
      operator: 'test_v13_no_compile',
    });

    assert.ok(pipeline.reconstructions.getByEpisode(storyId).length > 0,       'G3 AcceptedReconstruction');
    assert.ok(pipeline.branchPoints.getByEpisode(storyId).length > 0,           'G4 BranchPoint');
    assert.ok(pipeline.presentSlices.getByEpisodeId(storyId).length > 0,        'G2 PresentSlice');
    assert.ok(pipeline.historicalCompressionRecords.listAll(5).length > 0,      'G2 HCR');
    assert.strictEqual(pipeline.prunedBranchRecords.getStats().totalCount, 1,   'G5 PBR=1');
    // G6 LCP: compile 未通过，不应创建
    assert.strictEqual(pipeline.lineageCompileProposals.listAll(5).length, 0,   'G6 LCP=0（compile 未通过）');

    pipeline.close();
  });
});
