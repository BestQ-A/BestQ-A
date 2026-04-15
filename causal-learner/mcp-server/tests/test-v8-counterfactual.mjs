/**
 * test-v8-counterfactual.mjs
 * 验收：CounterfactualScenario skeleton + store（Patch Brief v8）
 *
 * 测试覆盖：
 *   T1  CounterfactualScenarioStore CRUD（save / get / listByEpisode / listByMechanismProgramRef / listAll / getStats）
 *   T2  createCounterfactualScenario() 工厂不变量（4 条）
 *   T3  mechanismProgramRefs 引用真实 MechanismProgram 对象（bridge 验证）
 *   T4  artifact 导出：至少能构造 1 条 scenario 并落盘
 */

import {
  createCounterfactualScenario,
  CounterfactualScenarioStore,
} from '../dist/core/index.js';
import { createDefaultMechanismProgram, DEFAULT_MECHANISM_PROGRAM_ID } from '../dist/core/index.js';
import { MechanismProgramStore } from '../dist/core/index.js';

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
// T1: CounterfactualScenarioStore CRUD
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T1: CounterfactualScenarioStore CRUD');

{
  const store = new CounterfactualScenarioStore(':memory:');

  const scenario = createCounterfactualScenario({
    baseEpisodeId:        'ep_t1_test_001',
    baseReconstructionId: 'rec_t1_test_001',
    modifiedAssumptions: [
      {
        targetRef:    'input.load_factor',
        modification: 'set',
        fromValue:    0.5,
        toValue:      0.9,
        rationale:    '模拟峰值负载场景',
      },
    ],
    mechanismProgramRefs: [DEFAULT_MECHANISM_PROGRAM_ID],
    predictedTrajectory: [
      { step: 0, kind: 'initial_condition', content: 'load_factor=0.9', source: 'program_simulated' },
      { step: 1, kind: 'latent_phase',      content: '内存压力上升',     source: 'program_simulated' },
      { step: 2, kind: 'outcome',           content: 'OOM 触发',         source: 'program_simulated' },
    ],
    predictedObservationSignals: ['memory_usage', 'gc_pause'],
    predictedOutcome:  'OOM 触发，服务降级',
    divergencePoints:  ['step 1：内存压力阈值超过原轨迹'],
    createdBy:         'test_runner',
    status:            'draft',
  });

  store.save(scenario);

  const retrieved = store.get(scenario.id);
  check('get() 能取回已保存的 CounterfactualScenario', retrieved !== null);
  check('get().id 正确', retrieved?.id === scenario.id, retrieved?.id);
  check('get().baseEpisodeId 正确', retrieved?.baseEpisodeId === 'ep_t1_test_001', retrieved?.baseEpisodeId);
  check('get().baseReconstructionId 正确', retrieved?.baseReconstructionId === 'rec_t1_test_001', retrieved?.baseReconstructionId);
  check('get().modifiedAssumptions 长度为 1', retrieved?.modifiedAssumptions.length === 1, retrieved?.modifiedAssumptions.length);
  check('get().mechanismProgramRefs 非空', (retrieved?.mechanismProgramRefs.length ?? 0) > 0, retrieved?.mechanismProgramRefs.length);
  check('get().predictedTrajectory 长度为 3', retrieved?.predictedTrajectory.length === 3, retrieved?.predictedTrajectory.length);
  check('get().predictedOutcome 非空', !!retrieved?.predictedOutcome, retrieved?.predictedOutcome);
  check('get().divergencePoints 不为 null（可空数组）', Array.isArray(retrieved?.divergencePoints));
  check("get().status === 'draft'", retrieved?.status === 'draft', retrieved?.status);

  // listAll
  check('listAll() 返回 1 条', store.listAll().length === 1, store.listAll().length);

  // listByEpisode
  check('listByEpisode() 命中', store.listByEpisode('ep_t1_test_001').length === 1);
  check('listByEpisode() 未知 episode 返回空', store.listByEpisode('ep_unknown').length === 0);

  // listByMechanismProgramRef
  check('listByMechanismProgramRef() 命中', store.listByMechanismProgramRef(DEFAULT_MECHANISM_PROGRAM_ID).length === 1);
  check('listByMechanismProgramRef() 未知 ref 返回空', store.listByMechanismProgramRef('MP_unknown').length === 0);

  // getStats
  const stats = store.getStats();
  check('getStats().total === 1', stats.total === 1, stats.total);
  check("getStats().byStatus['draft'] === 1", stats.byStatus['draft'] === 1, stats.byStatus?.['draft']);

  // 幂等更新
  const updated = { ...scenario, status: 'current' };
  store.save(updated);
  check('幂等更新后 total 仍为 1', store.listAll().length === 1);
  check("幂等更新后 status === 'current'", store.get(scenario.id)?.status === 'current', store.get(scenario.id)?.status);

  store.close();
}

// ---------------------------------------------------------------------------
// T2: createCounterfactualScenario() 工厂不变量
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T2: createCounterfactualScenario() 工厂不变量');

const BASE_INPUT = {
  baseEpisodeId:        'ep_inv_001',
  baseReconstructionId: 'rec_inv_001',
  modifiedAssumptions: [{ targetRef: 'x', modification: 'set', toValue: 1 }],
  mechanismProgramRefs: [DEFAULT_MECHANISM_PROGRAM_ID],
  predictedTrajectory: [{ step: 0, kind: 'outcome', content: 'y', source: 'program_simulated' }],
  predictedOutcome: '结果',
};

{
  // 不变量 1：modifiedAssumptions 非空
  let threw = false;
  try { createCounterfactualScenario({ ...BASE_INPUT, modifiedAssumptions: [] }); }
  catch { threw = true; }
  check('modifiedAssumptions 为空时工厂抛错（不变量 1）', threw);

  // 不变量 2：mechanismProgramRefs 非空
  threw = false;
  try { createCounterfactualScenario({ ...BASE_INPUT, mechanismProgramRefs: [] }); }
  catch { threw = true; }
  check('mechanismProgramRefs 为空时工厂抛错（不变量 2）', threw);

  // 不变量 3：predictedTrajectory 非空
  threw = false;
  try { createCounterfactualScenario({ ...BASE_INPUT, predictedTrajectory: [] }); }
  catch { threw = true; }
  check('predictedTrajectory 为空时工厂抛错（不变量 3）', threw);

  // 不变量 4：predictedOutcome 非空字符串
  threw = false;
  try { createCounterfactualScenario({ ...BASE_INPUT, predictedOutcome: '   ' }); }
  catch { threw = true; }
  check('predictedOutcome 为空白字符串时工厂抛错（不变量 4）', threw);

  // 正常路径
  const s = createCounterfactualScenario(BASE_INPUT);
  check('正常路径：id 自动生成 CS_* 前缀', s.id.startsWith('CS_'), s.id);
  check("正常路径：status 默认为 'draft'", s.status === 'draft', s.status);
  check('正常路径：divergencePoints 默认为空数组（不可 null）', Array.isArray(s.divergencePoints) && s.divergencePoints.length === 0);
  check('正常路径：predictedObservationSignals 默认为空数组', Array.isArray(s.predictedObservationSignals) && s.predictedObservationSignals.length === 0);
}

// ---------------------------------------------------------------------------
// T3: mechanismProgramRefs 必须能 resolve 到真实 MechanismProgram
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T3: mechanismProgramRefs bridge 验证');

{
  const mpStore = new MechanismProgramStore(':memory:');
  const defaultProg = createDefaultMechanismProgram();
  mpStore.save(defaultProg);

  const scenario = createCounterfactualScenario({
    ...BASE_INPUT,
    mechanismProgramRefs: [DEFAULT_MECHANISM_PROGRAM_ID],
  });

  check('scenario.mechanismProgramRefs[0] === DEFAULT_MECHANISM_PROGRAM_ID',
    scenario.mechanismProgramRefs[0] === DEFAULT_MECHANISM_PROGRAM_ID,
    scenario.mechanismProgramRefs[0]);

  const resolved = mpStore.get(scenario.mechanismProgramRefs[0]);
  check('mechanismProgramRefs[0] 能在 MechanismProgramStore 中 resolve', resolved !== null);
  check('resolve 出的程序 id 正确', resolved?.id === DEFAULT_MECHANISM_PROGRAM_ID, resolved?.id);
  check("resolve 出的程序 status === 'current'", resolved?.status === 'current', resolved?.status);

  mpStore.close();
}

// ---------------------------------------------------------------------------
// T4: artifact 导出：构造 1 条 scenario 并落盘（模拟 export 行为）
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T4: artifact 导出最小验证');

{
  const store = new CounterfactualScenarioStore(':memory:');

  const scenario = createCounterfactualScenario({
    id:                   'CS_artifact_test_001',
    baseEpisodeId:        'ep_artifact_001',
    baseReconstructionId: 'rec_artifact_001',
    modifiedAssumptions: [
      { targetRef: 'retry_interval', modification: 'set', fromValue: 100, toValue: 500 },
    ],
    mechanismProgramRefs: [DEFAULT_MECHANISM_PROGRAM_ID],
    predictedTrajectory: [
      { step: 0, kind: 'initial_condition', content: 'retry_interval=500ms', source: 'program_simulated' },
      { step: 1, kind: 'observable',        content: '超时次数下降 60%',       source: 'program_simulated' },
      { step: 2, kind: 'outcome',           content: '服务稳定',              source: 'program_simulated' },
    ],
    predictedOutcome: '服务恢复稳定，超时率降至 2%',
    createdBy:        'test_runner',
  });

  store.save(scenario);

  // 模拟 artifact export：序列化为 JSON
  const exported = store.get('CS_artifact_test_001');
  const json = JSON.stringify(exported, null, 2);

  check('artifact 导出：scenario 可序列化', json.length > 0, `${json.length} chars`);
  check('artifact 导出：包含 baseEpisodeId', json.includes('ep_artifact_001'));
  check('artifact 导出：包含 baseReconstructionId', json.includes('rec_artifact_001'));
  check('artifact 导出：包含 mechanismProgramRefs', json.includes(DEFAULT_MECHANISM_PROGRAM_ID));
  check('artifact 导出：包含 modifiedAssumptions', json.includes('retry_interval'));
  check('artifact 导出：predictedTrajectory 3 步', exported?.predictedTrajectory.length === 3, exported?.predictedTrajectory.length);

  store.close();
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ v8 CounterfactualScenario skeleton + store 验收全部通过！');
} else {
  console.log('\n❌ 存在失败项，请检查！');
  process.exit(1);
}
