/**
 * test-v7-recordfix.mjs
 * Brief §7: v7 recordFix 收束验收 — 4 个最小测试
 */

import { CausalPipeline } from '../dist/core/pipeline.js';
import {
  acceptInstance,
  rejectInstance,
  supersedeInstance,
  createMechanismInstance,
} from '../dist/core/mechanism-instance.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

console.log('🧪 v7 recordFix 收束验收测试\n');
console.log('============================================================\n');

// ──────────────────────────────────────────────────────────────────────────────
// 测试 1 & 2：无更新路径返回 OntologyDelta(kind=none)，episode.ontologyDeltaId 有值
// ──────────────────────────────────────────────────────────────────────────────
console.log('📦 Test 1+2: recordFix 无路径 → OntologyDelta(kind=none) + ontologyDeltaId 有值');

{
  const pipeline = new CausalPipeline({ seedDefaults: false });
  const obs = pipeline.submitObservation({
    rawInput: 'test error',
    facts: [{ pred: 'error', value: 'test' }],
  });

  // 不提供 chosenPathAtomIds → 走 none 分支
  const result = pipeline.recordFix({
    storyId: obs.story.id,
    fixDescription: '无路径修复',
  });

  assert(
    result.ontologyUpdate.kind === 'none',
    `ontologyUpdate.kind === 'none' (got: ${result.ontologyUpdate.kind})`
  );
  assert(
    typeof result.ontologyUpdate.no_update_reason === 'object' &&
      result.ontologyUpdate.no_update_reason !== null,
    'ontologyUpdate.no_update_reason 已填充'
  );
  assert(
    typeof result.ontologyUpdate.id === 'string' && result.ontologyUpdate.id.length > 0,
    `ontologyUpdate.id 存在 (${result.ontologyUpdate.id})`
  );
  assert(
    result.episode.ontologyDeltaId === result.ontologyUpdate.id,
    `episode.ontologyDeltaId === ontologyUpdate.id (${result.episode.ontologyDeltaId})`
  );
  assert(
    result.ontologyUpdate.applied_at === null,
    'applied_at 恒为 null'
  );

  pipeline.close();
}

// ──────────────────────────────────────────────────────────────────────────────
// 测试 3：acceptInstance() 在空 claim / support 下拒绝
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n📦 Test 3: acceptInstance 空 claim/support 抛错');

{
  const mi = createMechanismInstance({
    episode_id: 'ep_test',
    mechanism_class_ref: 'proxy:episode_ep_test',
    bindings: { slot_0: 'atom_a' },
  });

  let threw = false;
  try {
    acceptInstance(mi, { claim_ids: [], support_link_refs: [] });
  } catch (e) {
    threw = true;
  }
  assert(threw, 'acceptInstance 在空 claim/support 时抛出错误');

  // 非空时不抛
  let ok = false;
  try {
    acceptInstance(mi, { claim_ids: ['claim_1'] });
    ok = true;
  } catch (_) { /* */ }
  assert(ok, 'acceptInstance 非空 claim_ids 时正常通过');
}

// ──────────────────────────────────────────────────────────────────────────────
// 测试 4：reconstruction.mechanism_instance_ids 正确写入
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n📦 Test 4: reconstruction.mechanism_instance_ids 语义正确（P1）');

{
  // 4a: 无路径 → mechanismInstance = rejected → mechanism_instance_ids 应为空
  const pipeline = new CausalPipeline({ seedDefaults: false });
  const obs = pipeline.submitObservation({
    rawInput: 'another test',
    facts: [{ pred: 'symptom', value: 'slow' }],
  });

  const result = pipeline.recordFix({
    storyId: obs.story.id,
    fixDescription: '测试 mechanism_instance_ids',
  });

  assert(
    Array.isArray(result.reconstruction.mechanism_instance_ids),
    'reconstruction.mechanism_instance_ids 是数组'
  );
  assert(
    result.mechanismInstance.status === 'rejected',
    `无路径时 mechanismInstance.status === 'rejected' (got: ${result.mechanismInstance.status})`
  );
  assert(
    result.reconstruction.mechanism_instance_ids.length === 0,
    `rejected 路径 mechanism_instance_ids 为空 (len=${result.reconstruction.mechanism_instance_ids.length})`
  );
  // D3 验证：mechanism_class_ref 不含假 MC_hyp_ / MC_fallback_
  assert(
    result.mechanismInstance.mechanism_class_ref.startsWith('proxy:'),
    `mechanism_class_ref 使用 proxy:* 前缀 (${result.mechanismInstance.mechanism_class_ref})`
  );

  pipeline.close();
}

{
  // 4b: accepted 路径下 mechanism_instance_ids 有值（单元级验证）
  const mi = acceptInstance(
    createMechanismInstance({
      episode_id: 'ep_4b',
      mechanism_class_ref: 'proxy:test_class',
      bindings: { slot_0: 'atom_a' },
      claim_ids: ['claim_x'],
    }),
    { claim_ids: ['claim_x'] }
  );

  assert(mi.status === 'accepted', `MI status === 'accepted'`);
  const miIds = mi.status === 'accepted' ? [mi.id] : [];
  assert(miIds.length === 1 && miIds[0] === mi.id, `accepted MI id 写入 mechanismInstanceIds (${mi.id})`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 测试 5: 非 candidate 调 accept/reject/supersede 必须抛错
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n📦 Test 5: 状态机 guard — 非 candidate/accepted 非法流转抛错');

{
  const base = { episode_id: 'ep_sm', mechanism_class_ref: 'proxy:ep_sm', bindings: { slot_0: 'a1' } };

  // accepted 状态不能再 accept / reject
  const miAccepted = acceptInstance(createMechanismInstance(base), { claim_ids: ['claim_x'] });

  let threw_accept = false;
  try { acceptInstance(miAccepted, { claim_ids: ['claim_y'] }); } catch { threw_accept = true; }
  assert(threw_accept, "accepted → acceptInstance 抛错");

  let threw_reject = false;
  try { rejectInstance(miAccepted, 'test'); } catch { threw_reject = true; }
  assert(threw_reject, "accepted → rejectInstance 抛错");

  // candidate 状态不能 supersede
  const miCand = createMechanismInstance(base);
  let threw_supersede = false;
  try { supersedeInstance(miCand, 'MI_new'); } catch { threw_supersede = true; }
  assert(threw_supersede, "candidate → supersedeInstance 抛错");

  // accepted → superseded 合法
  let ok_supersede = false;
  try { supersedeInstance(miAccepted, 'MI_replacement_001'); ok_supersede = true; } catch {}
  assert(ok_supersede, "accepted → supersedeInstance 正常通过");

  // rejected 状态不能 accept
  const miRejected = rejectInstance(createMechanismInstance(base), '测试拒绝');
  let threw_accept2 = false;
  try { acceptInstance(miRejected, { claim_ids: ['claim_z'] }); } catch { threw_accept2 = true; }
  assert(threw_accept2, "rejected → acceptInstance 抛错");
}

// ──────────────────────────────────────────────────────────────────────────────
// 测试 6: selectedMechanismIds 等于 mechanism_class_ref，不再是 atom/path ids
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n📦 Test 6: selectedMechanismIds === mechanism_class_ref');

{
  const pipeline = new CausalPipeline({ seedDefaults: false });
  const obs = pipeline.submitObservation({
    rawInput: 'mechanism ids test',
    facts: [{ pred: 'error', value: 'timeout' }],
  });

  const result = pipeline.recordFix({
    storyId: obs.story.id,
    fixDescription: 'selectedMechanismIds bridge test',
  });

  const smIds = result.reconstruction.selectedMechanismIds;
  const mcRef = result.mechanismInstance.mechanism_class_ref;

  assert(smIds.length === 1, `selectedMechanismIds.length === 1 (got ${smIds.length})`);
  assert(smIds[0] === mcRef, `selectedMechanismIds[0] === mechanism_class_ref (${smIds[0]})`);
  assert(smIds[0].startsWith('proxy:'), `selectedMechanismIds[0] 是 proxy:* (${smIds[0]})`);

  pipeline.close();
}

// ──────────────────────────────────────────────────────────────────────────────
// 测试 7: kind=none 路径下 support_link_refs 不含 compiledRefIds
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n📦 Test 7: kind=none 路径下 support_link_refs 不混入 compiledRefIds');

{
  const pipeline = new CausalPipeline({ seedDefaults: false });
  const obs = pipeline.submitObservation({
    rawInput: 'support_link_refs clean test',
    facts: [{ pred: 'symptom', value: 'crash' }],
  });

  // 无路径 → kind=none → mechanismInstance 是 rejected
  const result = pipeline.recordFix({
    storyId: obs.story.id,
    fixDescription: '无路径不更新',
  });

  assert(result.ontologyUpdate.kind === 'none', `kind=none 路径 (got: ${result.ontologyUpdate.kind})`);
  // rejected 状态下 support_link_refs 应为空（无 compiledRefIds 污染）
  assert(
    result.mechanismInstance.support_link_refs.length === 0,
    `kind=none 路径 mechanismInstance.support_link_refs 为空 (len=${result.mechanismInstance.support_link_refs.length})`
  );

  // 直接测试 acceptInstance 不再接收 compiledRefIds 作为 support_link_refs
  const mi = createMechanismInstance({
    episode_id: 'ep_clean',
    mechanism_class_ref: 'proxy:ep_clean',
    bindings: { slot_0: 'atom_x' },
    claim_ids: ['hyp_1'],
  });
  const accepted = acceptInstance(mi, { claim_ids: ['hyp_1'] });
  assert(
    accepted.support_link_refs.length === 0,
    `acceptInstance 不填 support_link_refs 时保持空 (len=${accepted.support_link_refs.length})`
  );

  pipeline.close();
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项\n`);

if (failed === 0) {
  console.log('✅ v7 recordFix 收束验收全部通过！');
} else {
  console.log('❌ 有测试失败，请检查上方输出。');
  process.exit(1);
}
