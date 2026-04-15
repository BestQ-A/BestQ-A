/**
 * test-v8-transition.mjs
 * 验收：Transition minimal delta
 *
 * T1：对象与 store 表面存在
 * T2：工厂不变量（缺关键字段应抛错）
 * T3：executeExperimentDesign() 产出 post-action snapshot + transition
 * T4：transition.causedByActionId === actionExecution.id
 * T5：store CRUD
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
console.log('📦 T1: Transition object/store surface 存在');

const core = await importFromDist('index.js');

check('导出 TransitionStore',  typeof core.TransitionStore  === 'function', typeof core.TransitionStore);
check('导出 createTransition', typeof core.createTransition === 'function', typeof core.createTransition);
check('导出 CausalPipeline',   typeof core.CausalPipeline   === 'function');

// ──────────────────────────────────────────────────────────────────────────────
// T2：工厂不变量
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: 工厂不变量');

function mustThrow(label, fn) {
  try { fn(); check(label, false, '未抛出异常'); } catch (e) { check(label, true, e.message.slice(0, 60)); }
}

mustThrow('缺 episodeId 抛错', () =>
  core.createTransition({ episodeId: '', fromSnapshotId: 'SS_a', toSnapshotId: 'SS_b' }));

mustThrow('from === to 抛错', () =>
  core.createTransition({ episodeId: 'ep1', fromSnapshotId: 'SS_same', toSnapshotId: 'SS_same' }));

// 正常创建
{
  let tr = null;
  try {
    tr = core.createTransition({
      episodeId: 'ep_test',
      fromSnapshotId: 'SS_from',
      toSnapshotId: 'SS_to',
      causedByActionId: 'AX_test',
      candidateMechanismIds: [],
    });
  } catch (e) {
    check('合法输入不抛错', false, e.message);
  }
  if (tr) {
    check('合法输入不抛错', true);
    check('id 以 TR_ 开头', tr.id.startsWith('TR_'), tr.id);
    check('candidateMechanismIds 为空数组', Array.isArray(tr.candidateMechanismIds), tr.candidateMechanismIds?.length);
    check('createdBy 有默认值', typeof tr.createdBy === 'string', tr.createdBy);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// T3 & T4：executeExperimentDesign() 产出 snapshot + transition
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3+T4: executeExperimentDesign() 产出 post-action snapshot + transition');

{
  const pipeline = new core.CausalPipeline({ seedDefaults: false });

  const obs = pipeline.submitObservation({
    rawInput: 'transition loop test',
    facts: [
      { pred: 'service', value: 'db' },
      { pred: 'error', value: 'connection_pool_exhausted' },
    ],
    operator: 'test_runner',
  });

  const design = core.createExperimentDesign({
    baseEpisodeId: obs.story.id,
    basedOnCounterfactualIds: ['CS_fixture_tr_test'],
    targetUncertaintyRefs: ['mechanism.connection_pool'],
    candidateMeasurements: ['measure_active_connections'],
    candidateInterventions: ['increase_pool_size'],
    expectedInformationGain: 0.7,
    discriminatingPower: {},
    safetyConstraints: [],
    recommendedAction: 'increase_pool_size',
    createdBy: 'test_runner',
    status: 'draft',
  });

  const result = pipeline.executeExperimentDesign({
    experimentDesign: design,
    operator: 'test_runner',
  });

  const { actionExecution, execution, targetSnapshot, sourceSnapshot, transition } = result;
  const ax = actionExecution ?? execution;

  // targetSnapshot 检查
  check('返回 targetSnapshot 对象', typeof targetSnapshot?.id === 'string', targetSnapshot?.id);
  check('targetSnapshot.id 以 SS_ 开头', targetSnapshot?.id?.startsWith('SS_'), targetSnapshot?.id);
  check('targetSnapshot.episodeId === targetEpisode.id',
    targetSnapshot?.episodeId === result.targetEpisode?.id,
    `${targetSnapshot?.episodeId} vs ${result.targetEpisode?.id}`);
  check('targetSnapshot.values.actionRef 存在',
    typeof targetSnapshot?.values?.actionRef === 'string',
    targetSnapshot?.values?.actionRef);

  // sourceSnapshot 检查（source episode 由 submitObservation 产生，应有 initial snapshot）
  check('sourceSnapshot 不为 null（来自 initial snapshot）', sourceSnapshot !== null, sourceSnapshot?.id);

  // transition 检查
  check('返回 transition 对象', typeof transition?.id === 'string', transition?.id);
  check('transition.id 以 TR_ 开头', transition?.id?.startsWith('TR_'), transition?.id);
  check('transition.causedByActionId === actionExecution.id',
    transition?.causedByActionId === ax?.id,
    `${transition?.causedByActionId} vs ${ax?.id}`);
  check('transition.fromSnapshotId === sourceSnapshot.id',
    transition?.fromSnapshotId === sourceSnapshot?.id,
    `${transition?.fromSnapshotId} vs ${sourceSnapshot?.id}`);
  check('transition.toSnapshotId === targetSnapshot.id',
    transition?.toSnapshotId === targetSnapshot?.id,
    `${transition?.toSnapshotId} vs ${targetSnapshot?.id}`);
  check('transition.fromSnapshotId !== transition.toSnapshotId',
    transition?.fromSnapshotId !== transition?.toSnapshotId,
    `${transition?.fromSnapshotId} vs ${transition?.toSnapshotId}`);

  // store 回查
  const targetSnapshotFromStore = pipeline.stateSnapshots.get(targetSnapshot?.id);
  check('stateSnapshots.get(targetSnapshot.id) 可回查', targetSnapshotFromStore?.id === targetSnapshot?.id, targetSnapshotFromStore?.id);

  const transitionFromStore = pipeline.transitions.get(transition?.id);
  check('transitions.get(transition.id) 可回查', transitionFromStore?.id === transition?.id, transitionFromStore?.id);

  const byAction = pipeline.transitions.listByActionExecution(ax?.id);
  check('listByActionExecution() 可命中', byAction?.[0]?.id === transition?.id, byAction?.[0]?.id);

  pipeline.close?.();
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：TransitionStore 独立 CRUD
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: TransitionStore 独立 CRUD');

{
  const store = new core.TransitionStore(':memory:');
  const tr = core.createTransition({
    episodeId: 'ep_crud',
    fromSnapshotId: 'SS_x',
    toSnapshotId: 'SS_y',
    causedByActionId: 'AX_crud',
    candidateMechanismIds: ['mc_1'],
    createdBy: 'test_runner',
  });
  store.save(tr);

  const got = store.get(tr.id);
  check('save + get 可回查', got?.id === tr.id, got?.id);
  check('listByEpisode 命中', store.listByEpisode('ep_crud').length === 1);
  check('listByActionExecution 命中', store.listByActionExecution('AX_crud').length === 1);

  const stats = store.getStats();
  check('getStats().total === 1', stats.total === 1, stats.total);

  store.close();
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ Transition minimal delta 验收全部通过！');
} else {
  console.log('\n❌ Transition minimal delta 尚未完成，请先补实现。');
  process.exit(1);
}
