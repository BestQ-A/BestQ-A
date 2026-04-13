/**
 * test-v7-recordfix.mjs
 * Brief §7: v7 recordFix 收束验收 — 4 个最小测试
 */

import { CausalPipeline } from '../dist/core/pipeline.js';
import { acceptInstance, createMechanismInstance } from '../dist/core/mechanism-instance.js';

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
console.log('\n📦 Test 4: reconstruction.mechanism_instance_ids 写入正确');

{
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
    result.reconstruction.mechanism_instance_ids.length >= 1,
    `mechanism_instance_ids 非空 (len=${result.reconstruction.mechanism_instance_ids.length})`
  );
  assert(
    result.reconstruction.mechanism_instance_ids[0] === result.mechanismInstance.id,
    `mechanism_instance_ids[0] === mechanismInstance.id (${result.mechanismInstance.id})`
  );

  // D3 验证：mechanism_class_ref 不含假 MC_hyp_ / MC_fallback_
  assert(
    result.mechanismInstance.mechanism_class_ref.startsWith('proxy:'),
    `mechanism_class_ref 使用 proxy:* 前缀 (${result.mechanismInstance.mechanism_class_ref})`
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
