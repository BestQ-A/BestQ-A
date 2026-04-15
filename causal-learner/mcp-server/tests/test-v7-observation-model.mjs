/**
 * test-v7-observation-model.mjs
 * 验收：ObservationModel 持久化 + ObservationRecord 接线（Patch Brief 6）
 *
 * 测试覆盖：
 *   T1  ObservationModelStore CRUD（save / get / listAll / getStats）
 *   T2  submitObservation() 生成的 ObservationRecord 带 observationModelId
 *   T3  SupportLink 可沿链路回溯 ObservationRecord → ObservationModel
 *   T4  默认 ObservationModel 的 status / outputSignals 合法
 */

import { CausalPipeline } from '../dist/core/pipeline.js';
import { ObservationModelStore } from '../dist/core/observation-model-store.js';
import {
  createObservationModel,
  createDefaultObservationModel,
  DEFAULT_OBSERVATION_MODEL_ID,
} from '../dist/core/observation-model.js';

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
// T1: ObservationModelStore CRUD
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T1: ObservationModelStore CRUD');

{
  const store = new ObservationModelStore(':memory:');

  const model = createObservationModel({
    id: 'OM_test_001',
    name: 'test_model',
    description: '测试用观测模型',
    outputSignals: [
      { key: 'sensor_value', valueType: 'number', semantics: '传感器读数' },
    ],
    createdBy: 'test_runner',
    status: 'draft',
  });
  store.save(model);

  const retrieved = store.get('OM_test_001');
  check('get() 能取回已保存的 ObservationModel', retrieved !== null);
  check('get().id 正确', retrieved?.id === 'OM_test_001', retrieved?.id);
  check('get().name 正确', retrieved?.name === 'test_model', retrieved?.name);
  check('get().status 正确', retrieved?.status === 'draft', retrieved?.status);
  check('get().outputSignals 长度为 1', retrieved?.outputSignals.length === 1, retrieved?.outputSignals.length);
  check('get().blindSpots 不为 null', Array.isArray(retrieved?.blindSpots));
  check('get().noiseModel 不为 null', Array.isArray(retrieved?.noiseModel));
  check('get().biasModel 不为 null', Array.isArray(retrieved?.biasModel));

  const all = store.listAll();
  check('listAll() 返回 1 条', all.length === 1, all.length);

  const stats = store.getStats();
  check('getStats().total === 1', stats.total === 1, stats.total);
  check("getStats().byStatus['draft'] === 1", stats.byStatus['draft'] === 1, stats.byStatus['draft']);

  store.close();
}

// ---------------------------------------------------------------------------
// T2: submitObservation() 生成的 ObservationRecord 带 observationModelId
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T2: ObservationRecord.observationModelId 已落地');

{
  const pipeline = new CausalPipeline({ seedDefaults: false });

  const obs = pipeline.submitObservation({
    rawInput: 'T2 测试：压力传感器异常',
    facts: [
      { pred: 'sensor',   value: 'pressure_1' },
      { pred: 'reading',  value: 'overflow' },
    ],
  });

  const records = pipeline.observationRecords.listByEpisode(obs.story.id);
  check('ObservationRecord 存在', records.length > 0, records.length);

  for (const rec of records) {
    check(`OR ${rec.id} 有 observationModelId`, typeof rec.observationModelId === 'string' && rec.observationModelId.length > 0, rec.observationModelId);
    check(`OR ${rec.id}.observationModelId 指向默认模型`, rec.observationModelId === DEFAULT_OBSERVATION_MODEL_ID, rec.observationModelId);

    // observationModelId 可在 store 中解析
    const model = pipeline.observationModels.get(rec.observationModelId);
    check(`OR ${rec.id} observationModelId 可解析`, model !== null, rec.observationModelId);
  }

  pipeline.close();
}

// ---------------------------------------------------------------------------
// T3: SupportLink → ObservationRecord → ObservationModel 回溯链
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T3: SupportLink 可回溯到 ObservationModel');

{
  const pipeline = new CausalPipeline({ seedDefaults: true });

  const obs = pipeline.submitObservation({
    rawInput: 'T3 测试：光照偏移导致位置漂移',
    facts: [
      { pred: 'illumination', value: 'changed' },
      { pred: 'position_err', value: 'high' },
      { pred: 'severity',     value: 'medium' },
    ],
  });

  const atomIds = obs.atoms.map(a => a.id);
  const fix = pipeline.recordFix({
    storyId: obs.story.id,
    fixDescription: '调整光照补偿参数',
    chosenPathAtomIds: atomIds.length >= 2 ? atomIds : undefined,
  });

  const mi = fix.mechanismInstance;

  if (mi.status === 'accepted' && mi.support_link_refs.length > 0) {
    const slId = mi.support_link_refs[0];
    const sl = pipeline.supportLinks.get(slId);
    check('SupportLink 存在', sl !== null, slId);

    if (sl) {
      const obsRecord = pipeline.observationRecords.get(sl.observationRecordId);
      check('SupportLink → ObservationRecord 可解析', obsRecord !== null, sl.observationRecordId);

      if (obsRecord) {
        const obsModel = pipeline.observationModels.get(obsRecord.observationModelId);
        check('ObservationRecord → ObservationModel 可解析', obsModel !== null, obsRecord.observationModelId);
        check('ObservationModel.id 格式正确 (OM_*)', obsModel?.id.startsWith('OM_'), obsModel?.id);
        check('ObservationModel.status 合法', ['draft', 'current', 'deprecated'].includes(obsModel?.status ?? ''), obsModel?.status);
      }
    }
  } else {
    // compile 未触发时，验证 ObservationRecord 有 observationModelId
    const records = pipeline.observationRecords.listByEpisode(obs.story.id);
    check('T3: compile 未触发，ObservationRecord 已有 observationModelId',
      records.every(r => !!r.observationModelId), records[0]?.observationModelId);
  }

  pipeline.close();
}

// ---------------------------------------------------------------------------
// T4: 默认 ObservationModel 字段合法
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T4: 默认 ObservationModel 合法性验证');

{
  const model = createDefaultObservationModel();

  check('id === DEFAULT_OBSERVATION_MODEL_ID', model.id === DEFAULT_OBSERVATION_MODEL_ID, model.id);
  check("status === 'current'", model.status === 'current', model.status);
  check('outputSignals 非空', model.outputSignals.length > 0, model.outputSignals.length);
  check('outputSignals key 唯一', new Set(model.outputSignals.map(s => s.key)).size === model.outputSignals.length);
  check('blindSpots 不为 null', Array.isArray(model.blindSpots));
  check('noiseModel 不为 null', Array.isArray(model.noiseModel));
  check('biasModel 不为 null', Array.isArray(model.biasModel));
  check('createdBy 存在', typeof model.createdBy === 'string' && model.createdBy.length > 0, model.createdBy);

  // 工厂不变量：outputSignals 空时应抛错
  let threw = false;
  try {
    createObservationModel({ name: 'bad', description: 'no signals', outputSignals: [], createdBy: 'test' });
  } catch { threw = true; }
  check('outputSignals 为空时工厂抛错（不变量 I1）', threw);

  // 工厂不变量：outputSignals key 重复时应抛错
  let threwDup = false;
  try {
    createObservationModel({
      name: 'dup', description: 'dup keys',
      outputSignals: [
        { key: 'x', valueType: 'number', semantics: 'a' },
        { key: 'x', valueType: 'text',   semantics: 'b' },
      ],
      createdBy: 'test',
    });
  } catch { threwDup = true; }
  check('outputSignals key 重复时工厂抛错（不变量 I3）', threwDup);
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ v7 ObservationModel 持久化与接线验收全部通过！');
} else {
  console.log('\n❌ 存在失败项，请检查！');
  process.exit(1);
}
