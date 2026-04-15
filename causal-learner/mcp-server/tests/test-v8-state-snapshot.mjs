/**
 * test-v8-state-snapshot.mjs
 * 验收：StateSnapshot minimal delta
 *
 * T1：对象与 store 表面存在
 * T2：工厂不变量（缺关键字段应抛错）
 * T3：submitObservation() 自动产生初始快照
 * T4：回归（test-v8-prediction-error / test-v8-outcome-record）
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

async function importFromDist(moduleName) {
  return import(pathToFileURL(path.join(DIST_CORE, moduleName)).href);
}

// ──────────────────────────────────────────────────────────────────────────────
// T1：表面存在
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: StateSnapshot object/store surface 存在');

const core = await importFromDist('index.js');

check('导出 StateSnapshotStore',  typeof core.StateSnapshotStore  === 'function', typeof core.StateSnapshotStore);
check('导出 createStateSnapshot', typeof core.createStateSnapshot === 'function', typeof core.createStateSnapshot);
check('导出 CausalPipeline',      typeof core.CausalPipeline      === 'function');

// ──────────────────────────────────────────────────────────────────────────────
// T2：工厂不变量
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: 工厂不变量');

function mustThrow(label, fn) {
  try { fn(); check(label, false, '未抛出异常'); } catch (e) { check(label, true, e.message.slice(0, 60)); }
}

mustThrow('缺 episodeId 抛错', () =>
  core.createStateSnapshot({ episodeId: '', t: 0, values: {} }));

mustThrow('values 为 null 抛错', () =>
  core.createStateSnapshot({ episodeId: 'ep1', t: 0, values: null }));

mustThrow('t 为空字符串抛错', () =>
  core.createStateSnapshot({ episodeId: 'ep1', t: '', values: {} }));

// 正常创建
{
  let ss = null;
  try {
    ss = core.createStateSnapshot({ episodeId: 'ep_test', t: 0, values: { x: 1 } });
  } catch (e) {
    check('合法输入不抛错', false, e.message);
  }
  if (ss) {
    check('合法输入不抛错', true);
    check('id 以 SS_ 开头', ss.id.startsWith('SS_'), ss.id);
    check('createdBy 有默认值', typeof ss.createdBy === 'string', ss.createdBy);
    check('createdAt 有默认值', typeof ss.createdAt === 'string', ss.createdAt);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：submitObservation() 自动产生初始快照
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: submitObservation() 自动产生初始 StateSnapshot');

{
  const pipeline = new core.CausalPipeline({ seedDefaults: false });

  const obs = pipeline.submitObservation({
    rawInput: 'state snapshot test',
    facts: [
      { pred: 'service', value: 'auth' },
      { pred: 'error', value: 'token_expired' },
    ],
    operator: 'test_runner',
  });

  const episodeId = obs.story.id;

  // 通过 store 回查
  const snapshots = pipeline.stateSnapshots.listByEpisode(episodeId);
  check('submitObservation 后 stateSnapshots.listByEpisode 有至少 1 条', snapshots.length >= 1, snapshots.length);

  const ss = snapshots[0];
  check('snapshot.episodeId === story.id', ss?.episodeId === episodeId, `${ss?.episodeId} vs ${episodeId}`);
  check('snapshot.t === 0', ss?.t === 0, ss?.t);
  check('snapshot.values.factCount 存在', typeof ss?.values?.factCount === 'number', ss?.values?.factCount);
  check('snapshot.id 以 SS_ 开头', ss?.id?.startsWith('SS_'), ss?.id);

  // getLatestByEpisode
  const latest = pipeline.stateSnapshots.getLatestByEpisode(episodeId);
  check('getLatestByEpisode() 可命中', latest?.id === ss?.id, latest?.id);

  pipeline.close?.();
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：store 独立 CRUD 验收
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: StateSnapshotStore 独立 CRUD');

{
  const store = new core.StateSnapshotStore(':memory:');
  const ss = core.createStateSnapshot({
    episodeId: 'ep_crud_test',
    t: 42,
    values: { foo: 'bar' },
    createdBy: 'test_runner',
  });
  store.save(ss);

  const got = store.get(ss.id);
  check('save + get 可回查', got?.id === ss.id, got?.id);
  check('listByEpisode 命中', store.listByEpisode('ep_crud_test').length === 1, store.listByEpisode('ep_crud_test').length);

  const stats = store.getStats();
  check('getStats().total === 1', stats.total === 1, stats.total);

  store.close();
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ StateSnapshot minimal delta 验收全部通过！');
} else {
  console.log('\n❌ StateSnapshot minimal delta 尚未完成，请先补实现。');
  process.exit(1);
}
