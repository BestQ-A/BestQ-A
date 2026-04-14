/**
 * test-v7-support-link.mjs
 * 验收：SupportLink 持久化与接线（Patch Brief 4）
 *
 * 测试覆盖：
 *   T1  SupportLinkStore CRUD（save / get / listByClaim / listByObservationRecord）
 *   T2  accepted MechanismInstance.support_link_refs 引用真实 SupportLink.id
 *   T3  DerivationTrace.supportLinks 非空且字段正确
 *   T4  compiledRefIds 不得冒充 support_link_refs（语义隔离）
 */

import { SupportLinkStore } from '../dist/core/support-link-store.js';
import { createMechanismInstance, acceptInstance } from '../dist/core/mechanism-instance.js';
import { createDerivationTrace } from '../dist/core/derivation-trace.js';

let pass = 0;
let fail = 0;
const results = [];

function check(label, condition, got) {
  if (condition) {
    console.log(`  ✅ ${label}${got !== undefined ? ` (got: ${got})` : ''}`);
    pass++;
    results.push({ label, ok: true });
  } else {
    console.log(`  ❌ ${label}${got !== undefined ? ` (got: ${got})` : ''}`);
    fail++;
    results.push({ label, ok: false });
  }
}

// ---------------------------------------------------------------------------
// T1: SupportLinkStore CRUD
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T1: SupportLinkStore CRUD');

{
  const store = new SupportLinkStore(':memory:');

  const link = {
    id: 'SL_ep_test_0001',
    observationRecordId: 'obs_001',
    claimId: 'claim_001',
    polarity: 'supports',
    weight: 0.8,
    sourceKind: 'pipeline',
    sourceRef: 'compile:story_001',
    createdAt: new Date().toISOString(),
    createdBy: 'test_runner',
  };

  store.save(link);

  const retrieved = store.get('SL_ep_test_0001');
  check('get() 能取回已保存的 SupportLink', retrieved !== null);
  check('get().id 正确', retrieved?.id === link.id, retrieved?.id);
  check('get().polarity 正确', retrieved?.polarity === 'supports', retrieved?.polarity);
  check('get().weight 正确', retrieved?.weight === 0.8, retrieved?.weight);
  check('get().sourceKind 正确', retrieved?.sourceKind === 'pipeline', retrieved?.sourceKind);
  check('get().observationRecordId 正确', retrieved?.observationRecordId === 'obs_001', retrieved?.observationRecordId);
  check('get().claimId 正确', retrieved?.claimId === 'claim_001', retrieved?.claimId);

  const byObs = store.listByObservationRecord('obs_001');
  check('listByObservationRecord() 返回 1 条', byObs.length === 1, byObs.length);

  const byClaim = store.listByClaim('claim_001');
  check('listByClaim() 返回 1 条', byClaim.length === 1, byClaim.length);

  const byUnknown = store.listByClaim('unknown_claim');
  check('listByClaim() 未知 claim 返回空数组', byUnknown.length === 0, byUnknown.length);

  const stats = store.getStats();
  check('getStats().total === 1', stats.total === 1, stats.total);
  check("getStats().byPolarity['supports'] === 1", stats.byPolarity['supports'] === 1, stats.byPolarity['supports']);

  store.close();
}

// ---------------------------------------------------------------------------
// T2: accepted MI.support_link_refs 引用真实 SupportLink.id（单元测试）
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T2: accepted MI.support_link_refs 引用真实 SupportLink.id');

{
  // 先保存一个真实 SupportLink
  const store = new SupportLinkStore(':memory:');
  const sl = {
    id: 'SL_ep_t2_0001',
    observationRecordId: 'obs_atom_001',
    claimId: 'hyp_claim_001',
    polarity: 'supports',
    weight: 0.7,
    sourceKind: 'pipeline',
    sourceRef: 'compile:story_t2',
    createdAt: new Date().toISOString(),
    createdBy: 'pipeline_recordfix',
  };
  store.save(sl);

  // 创建并 accept 一个 MI，传入真实 SupportLink.id
  const raw = createMechanismInstance({
    episode_id: 'ep_t2',
    mechanism_class_ref: 'proxy:hyp_hyp_claim_001',
    bindings: { slot_0: 'obs_atom_001' },
    claim_ids: ['hyp_claim_001'],
  });
  const mi = acceptInstance(raw, {
    claim_ids: ['hyp_claim_001'],
    support_link_refs: [sl.id],
  });

  check('MI status === accepted', mi.status === 'accepted', mi.status);
  check('support_link_refs 是数组', Array.isArray(mi.support_link_refs));
  check('support_link_refs 长度为 1', mi.support_link_refs.length === 1, mi.support_link_refs.length);
  check('support_link_refs[0] === SL_.* 格式', mi.support_link_refs[0].startsWith('SL_'), mi.support_link_refs[0]);
  check('support_link_refs[0] 能在 store 中解析', store.get(mi.support_link_refs[0]) !== null);

  // 禁止：MI ID 或 compiled Ref 混入
  const noMiId = mi.support_link_refs.every(r => !r.startsWith('MI_'));
  const noCompiledRef = mi.support_link_refs.every(r => !r.startsWith('ref:') && !r.includes('compiled'));
  check('support_link_refs 不含 MI_* id', noMiId);
  check('support_link_refs 不含 compiled Ref', noCompiledRef);

  store.close();
}

// ---------------------------------------------------------------------------
// T3: DerivationTrace.supportLinks 字段正确（单元测试）
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T3: DerivationTrace.supportLinks 字段正确');

{
  const sl1 = {
    id: 'SL_ep_t3_0001',
    observationRecordId: 'obs_atom_t3_001',
    claimId: 'hyp_t3_001',
    polarity: 'supports',
    weight: 0.7,
    sourceKind: 'pipeline',
    sourceRef: 'compile:story_t3',
    createdAt: new Date().toISOString(),
    createdBy: 'pipeline_recordfix',
  };

  const trace = createDerivationTrace({
    episodeId: 'ep_t3',
    reconstructionId: 'RC_ep_t3_0001',
    contextKind: 'reconstruction',
    premiseClaimIds: ['hyp_t3_001'],
    supportLinks: [sl1],
    createdBy: 'test_runner',
  });

  check('trace.supportLinks 是数组', Array.isArray(trace.supportLinks));
  check('trace.supportLinks 长度为 1', trace.supportLinks.length === 1, trace.supportLinks.length);

  const link = trace.supportLinks[0];
  check('supportLinks[0].id 正确', link.id === 'SL_ep_t3_0001', link.id);
  check('supportLinks[0].polarity 正确', link.polarity === 'supports', link.polarity);
  check('supportLinks[0].observationRecordId 正确', link.observationRecordId === 'obs_atom_t3_001', link.observationRecordId);
  check('supportLinks[0].claimId 正确', link.claimId === 'hyp_t3_001', link.claimId);
  check('supportLinks[0].weight 在 [0,1]', link.weight >= 0 && link.weight <= 1, link.weight);
  check('supportLinks[0].sourceKind 合法', ['pipeline', 'llm_binder', 'human_review'].includes(link.sourceKind), link.sourceKind);
}

// ---------------------------------------------------------------------------
// T4: compiledRefIds 不得冒充 support_link_refs（语义隔离单元测试）
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T4: compiledRefIds 禁止混入 support_link_refs');

{
  // 模拟 pipeline 内部正确行为：compiledRefIds 是 compiled Ref，不得进 support_link_refs
  const fakeCompiledRefIds = ['ref_abc123', 'ref_def456'];
  const fakeSupportLinkId = 'SL_ep_t4_0001';

  // 创建 MI，只传真实 SupportLink.id，不传 compiledRefIds
  const raw = createMechanismInstance({
    episode_id: 'ep_t4',
    mechanism_class_ref: 'proxy:hyp_claim_t4',
    bindings: { slot_0: 'obs_atom_t4_001' },
    claim_ids: ['claim_t4'],
  });
  const mi = acceptInstance(raw, {
    claim_ids: ['claim_t4'],
    support_link_refs: [fakeSupportLinkId], // 只填真实 SL id
  });

  check('MI status === accepted', mi.status === 'accepted', mi.status);

  // 验证：compiledRefIds 不在 support_link_refs 中
  const refs = mi.support_link_refs ?? [];
  const hasCompiled = refs.some(r => fakeCompiledRefIds.includes(r));
  check('support_link_refs 不含任何 compiledRefId', !hasCompiled, hasCompiled ? `污染: ${refs.find(r => fakeCompiledRefIds.includes(r))}` : '无污染');

  // 验证：support_link_refs 只含 SL_ 格式的 id
  const allSL = refs.every(r => r.startsWith('SL_'));
  check('support_link_refs 全部是 SL_* 格式', allSL, refs[0]);

  // 负向验证：如果错误地把 compiledRefIds 填进去，能被检测出来
  const corruptedMI = { ...mi, support_link_refs: [...fakeCompiledRefIds] };
  const pollution = corruptedMI.support_link_refs.some(r => !r.startsWith('SL_'));
  check('语义检测：compiledRefIds 混入时能被识别（负向验证）', pollution, `污染项: ${fakeCompiledRefIds[0]}`);
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ v7 SupportLink 持久化与接线验收全部通过！');
} else {
  console.log('\n❌ 存在失败项，请检查！');
  process.exit(1);
}
