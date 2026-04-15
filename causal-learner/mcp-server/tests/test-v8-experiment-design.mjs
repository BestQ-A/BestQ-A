/**
 * test-v8-experiment-design.mjs
 * 验收：ExperimentDesign skeleton + store（Patch Brief v8 ExperimentDesign）
 *
 * 测试覆盖：
 *   T1  ExperimentDesignStore CRUD（save / get / listByEpisode / listByCounterfactual / listAll / getStats）
 *   T2  createExperimentDesign() 工厂不变量（5 条）
 *   T3  幂等更新 + status 切换
 *   T4  artifact 导出最小验证
 */

import {
  createExperimentDesign,
  ExperimentDesignStore,
} from '../dist/core/index.js';

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

const BASE_CF_ID = 'CS_test_cf_001';

// ---------------------------------------------------------------------------
// T1: ExperimentDesignStore CRUD
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T1: ExperimentDesignStore CRUD');

{
  const store = new ExperimentDesignStore(':memory:');

  const design = createExperimentDesign({
    baseEpisodeId:            'ep_t1_test_001',
    basedOnCounterfactualIds: [BASE_CF_ID],
    targetUncertaintyRefs:    ['mechanism.retry_backoff'],
    candidateMeasurements:    ['measure_latency_p99', 'measure_error_rate'],
    candidateInterventions:   ['set_retry_interval_500ms'],
    expectedInformationGain:  0.72,
    discriminatingPower:      { 'MP_default': 0.8 },
    safetyConstraints:        ['error_rate < 0.05'],
    recommendedAction:        'set_retry_interval_500ms',
    createdBy:                'test_runner',
    status:                   'draft',
  });

  store.save(design);

  const retrieved = store.get(design.id);
  check('get() 能取回已保存的 ExperimentDesign', retrieved !== null);
  check('get().id 正确', retrieved?.id === design.id, retrieved?.id);
  check('get().baseEpisodeId 正确', retrieved?.baseEpisodeId === 'ep_t1_test_001', retrieved?.baseEpisodeId);
  check('get().basedOnCounterfactualIds 长度为 1', retrieved?.basedOnCounterfactualIds.length === 1, retrieved?.basedOnCounterfactualIds.length);
  check('get().candidateMeasurements 长度为 2', retrieved?.candidateMeasurements.length === 2, retrieved?.candidateMeasurements.length);
  check('get().candidateInterventions 长度为 1', retrieved?.candidateInterventions.length === 1, retrieved?.candidateInterventions.length);
  check('get().expectedInformationGain 为 0.72', retrieved?.expectedInformationGain === 0.72, retrieved?.expectedInformationGain);
  check('get().recommendedAction 正确', retrieved?.recommendedAction === 'set_retry_interval_500ms', retrieved?.recommendedAction);
  check('get().safetyConstraints 非 null', Array.isArray(retrieved?.safetyConstraints));
  check("get().status === 'draft'", retrieved?.status === 'draft', retrieved?.status);

  check('listAll() 返回 1 条', store.listAll().length === 1, store.listAll().length);
  check('listByEpisode() 命中', store.listByEpisode('ep_t1_test_001').length === 1);
  check('listByEpisode() 未知 episode 返回空', store.listByEpisode('ep_unknown').length === 0);
  check('listByCounterfactual() 命中', store.listByCounterfactual(BASE_CF_ID).length === 1);
  check('listByCounterfactual() 未知 cf 返回空', store.listByCounterfactual('CS_unknown').length === 0);

  const stats = store.getStats();
  check('getStats().total === 1', stats.total === 1, stats.total);
  check("getStats().byStatus['draft'] === 1", stats.byStatus['draft'] === 1, stats.byStatus?.['draft']);

  store.close();
}

// ---------------------------------------------------------------------------
// T2: createExperimentDesign() 工厂不变量
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T2: createExperimentDesign() 工厂不变量');

const BASE_INPUT = {
  baseEpisodeId:            'ep_inv_001',
  basedOnCounterfactualIds: [BASE_CF_ID],
  candidateMeasurements:    ['measure_x'],
  candidateInterventions:   [],
  expectedInformationGain:  0.5,
  recommendedAction:        'measure_x',
};

{
  // 不变量 1：basedOnCounterfactualIds 非空
  let threw = false;
  try { createExperimentDesign({ ...BASE_INPUT, basedOnCounterfactualIds: [] }); }
  catch { threw = true; }
  check('basedOnCounterfactualIds 为空时工厂抛错（不变量 1）', threw);

  // 不变量 2：candidateMeasurements + candidateInterventions 至少一侧非空
  threw = false;
  try { createExperimentDesign({ ...BASE_INPUT, candidateMeasurements: [], candidateInterventions: [] }); }
  catch { threw = true; }
  check('两侧候选集均为空时工厂抛错（不变量 2）', threw);

  // 不变量 3：expectedInformationGain < 0
  threw = false;
  try { createExperimentDesign({ ...BASE_INPUT, expectedInformationGain: -0.1 }); }
  catch { threw = true; }
  check('expectedInformationGain < 0 时工厂抛错（不变量 3）', threw);

  // 不变量 3：expectedInformationGain > 1
  threw = false;
  try { createExperimentDesign({ ...BASE_INPUT, expectedInformationGain: 1.1 }); }
  catch { threw = true; }
  check('expectedInformationGain > 1 时工厂抛错（不变量 3）', threw);

  // 不变量 4：recommendedAction 不在候选集合中
  threw = false;
  try { createExperimentDesign({ ...BASE_INPUT, recommendedAction: 'not_in_candidates' }); }
  catch { threw = true; }
  check('recommendedAction 不在候选集合时工厂抛错（不变量 4）', threw);

  // 正常路径
  const d = createExperimentDesign(BASE_INPUT);
  check('正常路径：id 自动生成 ED_* 前缀', d.id.startsWith('ED_'), d.id);
  check("正常路径：status 默认为 'draft'", d.status === 'draft', d.status);
  check('正常路径：safetyConstraints 默认为空数组（不可 null）', Array.isArray(d.safetyConstraints) && d.safetyConstraints.length === 0);
  check('正常路径：targetUncertaintyRefs 默认为空数组', Array.isArray(d.targetUncertaintyRefs) && d.targetUncertaintyRefs.length === 0);
  check('正常路径：discriminatingPower 默认为空 map', typeof d.discriminatingPower === 'object' && Object.keys(d.discriminatingPower).length === 0);
}

// ---------------------------------------------------------------------------
// T3: 幂等更新 + status 切换
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T3: 幂等更新 + status 切换');

{
  const store = new ExperimentDesignStore(':memory:');
  const d = createExperimentDesign(BASE_INPUT);
  store.save(d);
  store.save({ ...d, status: 'current' });

  check('幂等更新后 total 仍为 1', store.listAll().length === 1);
  check("幂等更新后 status === 'current'", store.get(d.id)?.status === 'current', store.get(d.id)?.status);
  store.close();
}

// ---------------------------------------------------------------------------
// T4: artifact 导出最小验证
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T4: artifact 导出最小验证');

{
  const store = new ExperimentDesignStore(':memory:');

  const design = createExperimentDesign({
    id:                       'ED_artifact_test_001',
    baseEpisodeId:            'ep_artifact_001',
    basedOnCounterfactualIds: ['CS_artifact_test_001', 'CS_artifact_test_002'],
    targetUncertaintyRefs:    ['mechanism.cache_eviction'],
    candidateMeasurements:    ['measure_cache_hit_rate', 'measure_memory_usage'],
    candidateInterventions:   ['set_cache_ttl_60s', 'increase_heap_limit'],
    expectedInformationGain:  0.85,
    discriminatingPower:      { 'MP_default': 0.9, 'MP_cache': 0.75 },
    safetyConstraints:        ['memory_usage < 80%', 'latency_p99 < 500ms'],
    recommendedAction:        'set_cache_ttl_60s',
    createdBy:                'test_runner',
  });

  store.save(design);

  const exported = store.get('ED_artifact_test_001');
  const json = JSON.stringify(exported, null, 2);

  check('artifact 导出：design 可序列化', json.length > 0, `${json.length} chars`);
  check('artifact 导出：包含 baseEpisodeId', json.includes('ep_artifact_001'));
  check('artifact 导出：包含 basedOnCounterfactualIds', json.includes('CS_artifact_test_001'));
  check('artifact 导出：包含 recommendedAction', json.includes('set_cache_ttl_60s'));
  check('artifact 导出：expectedInformationGain 为 0.85', exported?.expectedInformationGain === 0.85, exported?.expectedInformationGain);
  check('artifact 导出：safetyConstraints 长度为 2', exported?.safetyConstraints.length === 2, exported?.safetyConstraints.length);

  store.close();
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ v8 ExperimentDesign skeleton + store 验收全部通过！');
} else {
  console.log('\n❌ 存在失败项，请检查！');
  process.exit(1);
}
