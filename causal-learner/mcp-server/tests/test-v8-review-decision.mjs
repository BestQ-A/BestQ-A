/**
 * test-v8-review-decision.mjs
 * 验收：ReviewDecision review lane（P06）
 *
 * T1：对象与 store 表面存在（导出正确）
 * T2：工厂不变量（缺关键字段抛错）
 * T3：store 基本操作（save/get/listByProposal/getStats）
 * T4：acceptProposal pipeline（delta.kind=AppliedRevision）
 * T5：rejectProposal pipeline（delta.kind=none, human_override）
 * T6：supersedeProposal pipeline（no delta, supersededByRef 正确）
 * T7：二次转移 guard（非 proposed 状态抛错）
 * T8：pipeline 集成（pipeline.reviewDecisions 存在）
 */

import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const DIST_CORE = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist', 'core');

let pass = 0;
let fail = 0;

function check(label, condition, got) {
  if (condition) {
    console.log(`  ✅ ${label}${got !== undefined ? ` (got: ${got})` : ''}`);
    pass++;
  } else {
    console.log(`  ❌ ${label}${got !== undefined ? ` (got: ${got})` : ''}`);
    fail++;
  }
}

function mustThrow(label, fn) {
  try { fn(); check(label, false, '未抛出异常'); } catch (e) { check(label, true, e.message.slice(0, 80)); }
}

async function importFromDist(moduleName) {
  return import(pathToFileURL(path.join(DIST_CORE, moduleName)).href);
}

const core = await importFromDist('index.js');

// 构造一个合法的 PRP fixture
function makePrp(overrides = {}) {
  return core.createProgramRevisionProposal({
    basedOnPredictionErrorIds: ['PE_test_001'],
    targetKind: 'mechanism_program',
    targetRef: 'MP_test_001',
    proposedChangeKind: 'phase_adjustment',
    rationale: 'test rationale for P06',
    ...overrides,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// T1：对象与 store 表面存在
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: ReviewDecision 对象/store 表面存在');

check('导出 ReviewDecisionStore',
  typeof core.ReviewDecisionStore === 'function', typeof core.ReviewDecisionStore);
check('导出 createReviewDecision',
  typeof core.createReviewDecision === 'function', typeof core.createReviewDecision);
check('导出 assertValidReviewDecision',
  typeof core.assertValidReviewDecision === 'function', typeof core.assertValidReviewDecision);
check('导出 acceptProposal',
  typeof core.acceptProposal === 'function', typeof core.acceptProposal);
check('导出 rejectProposal',
  typeof core.rejectProposal === 'function', typeof core.rejectProposal);
check('导出 supersedeProposal',
  typeof core.supersedeProposal === 'function', typeof core.supersedeProposal);
check('导出 createOntologyDeltaFromReviewAccept',
  typeof core.createOntologyDeltaFromReviewAccept === 'function',
  typeof core.createOntologyDeltaFromReviewAccept);
check('导出 createOntologyDeltaFromReviewReject',
  typeof core.createOntologyDeltaFromReviewReject === 'function',
  typeof core.createOntologyDeltaFromReviewReject);

{
  const store = new core.ReviewDecisionStore(':memory:');
  const stats = store.getStats();
  check('Store 可实例化，getStats().total=0', stats.total === 0, stats.total);
  store.close();
}

// ──────────────────────────────────────────────────────────────────────────────
// T2：工厂不变量
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: 工厂不变量');

mustThrow('proposalRef 为空抛错', () =>
  core.createReviewDecision({ proposalRef: '', decision: 'accepted', rationale: 'ok' }));

mustThrow('decision 非法值抛错', () =>
  core.createReviewDecision({ proposalRef: 'PRP_001', decision: 'invalid', rationale: 'ok' }));

mustThrow('decision=superseded 无 supersededByRef 抛错', () =>
  core.createReviewDecision({ proposalRef: 'PRP_001', decision: 'superseded', rationale: 'ok' }));

mustThrow('rationale 为空抛错', () =>
  core.createReviewDecision({ proposalRef: 'PRP_001', decision: 'accepted', rationale: '   ' }));

{
  let rd = null;
  try {
    rd = core.createReviewDecision({ proposalRef: 'PRP_001', decision: 'accepted', rationale: 'valid' });
  } catch (e) {
    check('合法输入不抛错', false, e.message);
  }
  if (rd !== null) {
    check('合法输入不抛错', true);
    check('id 以 RD_ 开头', rd.id.startsWith('RD_'), rd.id);
    check('supersededByRef 默认 null', rd.supersededByRef === null, rd.supersededByRef);
    check('generatedDeltaRef 默认 null', rd.generatedDeltaRef === null, rd.generatedDeltaRef);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：store 基本操作
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: Store save/get/listByProposal/getStats');

{
  const store = new core.ReviewDecisionStore(':memory:');

  const rd1 = core.createReviewDecision({ proposalRef: 'PRP_aaa', decision: 'accepted', rationale: 'accept aaa' });
  const rd2 = core.createReviewDecision({ proposalRef: 'PRP_aaa', decision: 'rejected', rationale: 'reject aaa' });
  const rd3 = core.createReviewDecision({ proposalRef: 'PRP_bbb', decision: 'accepted', rationale: 'accept bbb' });

  store.save(rd1);
  store.save(rd2);
  store.save(rd3);

  const fromStore = store.get(rd1.id);
  check('get() 可回查', fromStore?.id === rd1.id, fromStore?.id);

  const byAaa = store.listByProposal('PRP_aaa');
  check('listByProposal(PRP_aaa) 返回 2 条', byAaa.length === 2, byAaa.length);

  const byBbb = store.listByProposal('PRP_bbb');
  check('listByProposal(PRP_bbb) 返回 1 条', byBbb.length === 1, byBbb.length);

  const stats = store.getStats();
  check('getStats().total = 3', stats.total === 3, stats.total);
  check('byDecision 含 accepted', (stats.byDecision?.accepted ?? 0) >= 1,
    JSON.stringify(stats.byDecision));

  store.close();
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：acceptProposal pipeline
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: acceptProposal pipeline → OntologyDelta(kind=AppliedRevision)');

{
  const prp = makePrp();
  const result = core.acceptProposal(prp, 'approved by reviewer', 'reviewer_01');

  check('updatedProposal.status = accepted', result.updatedProposal.status === 'accepted',
    result.updatedProposal.status);
  check('delta.kind = AppliedRevision', result.delta.kind === 'AppliedRevision', result.delta.kind);
  check('delta.changes 有 1 条', result.delta.changes.length === 1, result.delta.changes.length);
  check("delta.changes[0].action = 'accept_claim'",
    result.delta.changes[0].action === 'accept_claim', result.delta.changes[0].action);
  check('reviewDecision.decision = accepted', result.reviewDecision.decision === 'accepted',
    result.reviewDecision.decision);
  check('reviewDecision.generatedDeltaRef = delta.id',
    result.reviewDecision.generatedDeltaRef === result.delta.id,
    result.reviewDecision.generatedDeltaRef);
  check('delta.episode_id 以 review: 开头',
    result.delta.episode_id.startsWith('review:'), result.delta.episode_id);
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：rejectProposal pipeline
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: rejectProposal pipeline → OntologyDelta(kind=none, human_override)');

{
  const prp = makePrp();
  const result = core.rejectProposal(prp, 'insufficient evidence', 'reviewer_02');

  check('updatedProposal.status = rejected', result.updatedProposal.status === 'rejected',
    result.updatedProposal.status);
  check('delta.kind = none', result.delta.kind === 'none', result.delta.kind);
  check('delta.changes 为空', result.delta.changes.length === 0, result.delta.changes.length);
  check('delta.no_update_reason.reason_kind = human_override',
    result.delta.no_update_reason?.reason_kind === 'human_override',
    result.delta.no_update_reason?.reason_kind);
  check('reviewDecision.decision = rejected', result.reviewDecision.decision === 'rejected',
    result.reviewDecision.decision);
  check('reviewDecision.generatedDeltaRef = delta.id',
    result.reviewDecision.generatedDeltaRef === result.delta.id,
    result.reviewDecision.generatedDeltaRef);
}

// ──────────────────────────────────────────────────────────────────────────────
// T6：supersedeProposal pipeline
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T6: supersedeProposal pipeline → no delta, supersededByRef 正确');

{
  const prp = makePrp();
  const result = core.supersedeProposal(prp, 'PRP_new_001', 'replaced by better proposal', 'reviewer_03');

  check('updatedProposal.status = superseded', result.updatedProposal.status === 'superseded',
    result.updatedProposal.status);
  check('result 无 delta 字段', result.delta === undefined, typeof result.delta);
  check('reviewDecision.decision = superseded', result.reviewDecision.decision === 'superseded',
    result.reviewDecision.decision);
  check('reviewDecision.supersededByRef = PRP_new_001',
    result.reviewDecision.supersededByRef === 'PRP_new_001',
    result.reviewDecision.supersededByRef);
  check('reviewDecision.generatedDeltaRef = null',
    result.reviewDecision.generatedDeltaRef === null, result.reviewDecision.generatedDeltaRef);
}

// ──────────────────────────────────────────────────────────────────────────────
// T7：二次转移 guard（非 proposed 状态抛错）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T7: 二次转移 guard');

{
  const prp = makePrp();
  const accepted = core.acceptProposal(prp, 'first accept').updatedProposal;

  mustThrow('acceptProposal 对已 accepted PRP 抛错',
    () => core.acceptProposal(accepted, 'second accept'));
  mustThrow('rejectProposal 对已 accepted PRP 抛错',
    () => core.rejectProposal(accepted, 'reject after accept'));
  mustThrow('supersedeProposal 对已 accepted PRP 抛错',
    () => core.supersedeProposal(accepted, 'PRP_x', 'supersede after accept'));
}

// ──────────────────────────────────────────────────────────────────────────────
// T8：pipeline 集成
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T8: pipeline.reviewDecisions 集成');

{
  const pipeline = new core.CausalPipeline({ seedDefaults: false });

  check('pipeline.reviewDecisions 存在',
    pipeline.reviewDecisions !== undefined && pipeline.reviewDecisions !== null,
    typeof pipeline.reviewDecisions);

  const stats = pipeline.reviewDecisions.getStats();
  check('pipeline.reviewDecisions.getStats().total = 0', stats.total === 0, stats.total);

  const pipelineStats = pipeline.getStats();
  check('pipeline.getStats().reviewDecisions 存在',
    typeof pipelineStats.reviewDecisions === 'object', typeof pipelineStats.reviewDecisions);

  pipeline.close();
}

// ──────────────────────────────────────────────────────────────────────────────
// 汇总
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ ReviewDecision review lane 验收全部通过！');
} else {
  console.log('\n❌ ReviewDecision review lane 有失败项，请检查。');
  process.exit(1);
}
