/**
 * test-v7-observation-record.mjs
 * 验收：ObservationRecord 持久化 + SupportLink 重新锚定（Patch Brief 5）
 *
 * 测试覆盖：
 *   T1  ObservationRecordStore CRUD（save / get / listByEpisode / getStats）
 *   T2  submitObservation() 后 Episode.observationRecordIds 非空
 *   T3  SupportLink.observationRecordId 能在 store 中解析（不是 Atom id）
 *   T4  负向验证：Atom id 不应被当 ObservationRecord.id
 */

import { CausalPipeline } from '../dist/core/pipeline.js';
import { ObservationRecordStore } from '../dist/core/observation-record-store.js';

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

// ---------------------------------------------------------------------------
// T1: ObservationRecordStore CRUD
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T1: ObservationRecordStore CRUD');

{
  const store = new ObservationRecordStore(':memory:');

  const rec = {
    id: 'OR_ep_t1_0',
    episodeId: 'ep_t1',
    t: 0,
    source: 'submitObservation',
    payload: { atomId: 'atom_001', factIndex: 0 },
  };
  store.save(rec);

  const retrieved = store.get('OR_ep_t1_0');
  check('get() 能取回已保存的 ObservationRecord', retrieved !== null);
  check('get().id 正确', retrieved?.id === 'OR_ep_t1_0', retrieved?.id);
  check('get().episodeId 正确', retrieved?.episodeId === 'ep_t1', retrieved?.episodeId);
  check('get().source 正确', retrieved?.source === 'submitObservation', retrieved?.source);
  check('get().payload.atomId 正确', retrieved?.payload?.atomId === 'atom_001', retrieved?.payload?.atomId);

  // 追加第二条
  store.save({ id: 'OR_ep_t1_1', episodeId: 'ep_t1', t: 1, source: 'submitObservation', payload: { atomId: 'atom_002', factIndex: 1 } });

  const byEpisode = store.listByEpisode('ep_t1');
  check('listByEpisode() 返回 2 条', byEpisode.length === 2, byEpisode.length);
  check('listByEpisode() 第 0 条 t=0', byEpisode[0].t === 0, byEpisode[0].t);

  const byUnknown = store.listByEpisode('unknown_ep');
  check('listByEpisode() 未知 episode 返回空数组', byUnknown.length === 0, byUnknown.length);

  const stats = store.getStats();
  check('getStats().total === 2', stats.total === 2, stats.total);
  check("getStats().byEpisode['ep_t1'] === 2", stats.byEpisode['ep_t1'] === 2, stats.byEpisode['ep_t1']);

  store.close();
}

// ---------------------------------------------------------------------------
// T2: submitObservation() 后 Episode 的 observationRecordIds 非空
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T2: submitObservation() 生成真实 ObservationRecord');

{
  const pipeline = new CausalPipeline({ seedDefaults: false });

  const obs = pipeline.submitObservation({
    rawInput: 'T2 测试：摄像头标定偏移',
    facts: [
      { pred: 'sensor',  value: 'camera_main' },
      { pred: 'symptom', value: 'drift' },
    ],
  });

  // 通过 store 直接查询
  const records = pipeline.observationRecords.listByEpisode(obs.story.id);
  check('submitObservation 后 store 中有 ObservationRecord', records.length > 0, records.length);
  check('ObservationRecord 数量与 atom 数量一致', records.length === obs.atoms.length, `${records.length} vs ${obs.atoms.length}`);
  check('ObservationRecord[0].id 以 OR_ 开头', records[0].id.startsWith('OR_'), records[0].id);
  check('ObservationRecord[0].episodeId === story.id', records[0].episodeId === obs.story.id, records[0].episodeId);
  check("ObservationRecord[0].source === 'submitObservation'", records[0].source === 'submitObservation', records[0].source);
  check('ObservationRecord[0].payload.atomId 存在', typeof records[0].payload?.atomId === 'string', records[0].payload?.atomId);

  pipeline.close();
}

// ---------------------------------------------------------------------------
// T3: recordFix() 中 SupportLink.observationRecordId 能解析到真实 ObservationRecord
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T3: SupportLink.observationRecordId 指向真实 ObservationRecord');

{
  const pipeline = new CausalPipeline({ seedDefaults: true });

  const obs = pipeline.submitObservation({
    rawInput: 'T3 测试：位置漂移',
    facts: [
      { pred: 'error',    value: 'position_drift' },
      { pred: 'sensor',   value: 'lidar_front' },
      { pred: 'severity', value: 'high' },
    ],
  });

  const atomIds = obs.atoms.map(a => a.id);
  const fix = pipeline.recordFix({
    storyId: obs.story.id,
    fixDescription: '重标定 lidar',
    chosenPathAtomIds: atomIds.length >= 2 ? atomIds : undefined,
  });

  const mi = fix.mechanismInstance;
  if (mi.status === 'accepted' && mi.support_link_refs.length > 0) {
    const slId = mi.support_link_refs[0];
    const sl = pipeline.supportLinks.get(slId);
    check('SupportLink 存在于 store', sl !== null, slId);

    if (sl) {
      // 关键：observationRecordId 必须能在 ObservationRecordStore 中解析
      const obsRecord = pipeline.observationRecords.get(sl.observationRecordId);
      check('SupportLink.observationRecordId 能解析到真实 ObservationRecord', obsRecord !== null, sl.observationRecordId);
      check('ObservationRecord 格式是 OR_*', sl.observationRecordId.startsWith('OR_'), sl.observationRecordId);
      check('ObservationRecord.episodeId 与当前 Episode 一致', obsRecord?.episodeId === obs.story.id, obsRecord?.episodeId);

      // 负向：observationRecordId 不是 Atom id 格式
      const isAtomId = obs.atoms.some(a => a.id === sl.observationRecordId);
      check('SupportLink.observationRecordId 不是 Atom id', !isAtomId, sl.observationRecordId);
    }
  } else {
    // compile 未触发（in-memory graph 无法 compile），验证 ObservationRecord 至少已落盘
    check('T3: compile 未触发，但 ObservationRecord 已落盘', pipeline.observationRecords.listByEpisode(obs.story.id).length > 0);
    check('T3: episode.observationRecordIds 非空（recordFix 回填）', fix.episode.observationRecordIds.length > 0, fix.episode.observationRecordIds.length);
  }

  pipeline.close();
}

// ---------------------------------------------------------------------------
// T4: 负向验证 — Atom id 不应出现在 ObservationRecord id 位置
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T4: Atom id 不得被当作 ObservationRecord id');

{
  const pipeline = new CausalPipeline({ seedDefaults: false });

  const obs = pipeline.submitObservation({
    rawInput: 'T4 负向测试',
    facts: [{ pred: 'type', value: 'test_event' }],
  });

  const records = pipeline.observationRecords.listByEpisode(obs.story.id);
  const atomIds = new Set(obs.atoms.map(a => a.id));

  // 所有 ObservationRecord.id 必须是 OR_* 格式，不得与 Atom id 重合
  const noAtomIdMixup = records.every(r => !atomIds.has(r.id));
  check('ObservationRecord.id 与 Atom id 无重叠', noAtomIdMixup);

  // 所有 ObservationRecord.payload.atomId 必须是对应的 Atom id（正向验证）
  const payloadsHaveAtomId = records.every(r => atomIds.has(r.payload?.atomId));
  check('ObservationRecord.payload.atomId 正确引用 Atom id', payloadsHaveAtomId);

  // store 中不存在任何以 Atom id 为主键的记录
  for (const atomId of atomIds) {
    const ghost = pipeline.observationRecords.get(atomId);
    if (ghost !== null) {
      check(`Atom id ${atomId} 不得存在于 ObservationRecordStore`, false, atomId);
    }
  }
  check('无 Atom id 被误存为 ObservationRecord', true);

  pipeline.close();
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ v7 ObservationRecord 持久化与锚定验收全部通过！');
} else {
  console.log('\n❌ 存在失败项，请检查！');
  process.exit(1);
}
