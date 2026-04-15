/**
 * test-v8-prediction-error.mjs
 * 验收：PredictionError minimal delta
 *
 * 目标：
 *   T1：对象与 store 表面存在
 *   T2：工厂不变量（缺关键字段应抛错）
 *   T3：ActionExecution → OutcomeRecord → PredictionError 最小闭环
 *   T4：回归（test-v8-outcome-record / test-v8-action-execution）
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
// T1：对象与 store 表面存在
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: PredictionError object/store/entry surface 存在');

const core = await importFromDist('index.js');

check('导出 PredictionErrorStore',   typeof core.PredictionErrorStore   === 'function', typeof core.PredictionErrorStore);
check('导出 createPredictionError',  typeof core.createPredictionError  === 'function', typeof core.createPredictionError);
check('CausalPipeline 已导出',       typeof core.CausalPipeline         === 'function');

// ──────────────────────────────────────────────────────────────────────────────
// T2：工厂不变量
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: 工厂不变量');

function mustThrow(label, fn) {
  try { fn(); check(label, false, '未抛出异常'); } catch (e) { check(label, true, e.message.slice(0, 60)); }
}

const validBase = {
  causedByActionExecutionId: 'AX_test',
  outcomeRecordId: 'ORC_test',
  errorKind: 'outcome',
  expectedSummary: 'expected something',
  actualSummary: 'actual something',
  deltaSummary: 'expected vs actual',
  severity: 'low',
  score: null,
};

mustThrow('缺 causedByActionExecutionId 抛错', () =>
  core.createPredictionError({ ...validBase, causedByActionExecutionId: '' }));

mustThrow('缺 outcomeRecordId 抛错', () =>
  core.createPredictionError({ ...validBase, outcomeRecordId: '' }));

mustThrow('缺 expectedSummary 抛错', () =>
  core.createPredictionError({ ...validBase, expectedSummary: '   ' }));

mustThrow('缺 actualSummary 抛错', () =>
  core.createPredictionError({ ...validBase, actualSummary: '' }));

mustThrow('缺 deltaSummary 抛错', () =>
  core.createPredictionError({ ...validBase, deltaSummary: '' }));

mustThrow('errorKind 非枚举值抛错', () =>
  core.createPredictionError({ ...validBase, errorKind: 'invalid_kind' }));

// 正常创建不抛错
{
  let pe = null;
  try {
    pe = core.createPredictionError(validBase);
  } catch (e) {
    check('合法输入不抛错', false, e.message);
  }
  if (pe !== null) {
    check('合法输入不抛错', true);
    check('id 以 PE_ 开头', pe.id.startsWith('PE_'), pe.id);
    check('score 允许 null', pe.score === null, pe.score);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：最小偏差闭环
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: ActionExecution → OutcomeRecord → PredictionError 最小闭环');

{
  const pipelineMod = await importFromDist('pipeline.js');
  const pipeline = new core.CausalPipeline({ seedDefaults: false });

  const obs = pipeline.submitObservation({
    rawInput: 'prediction error loop test',
    facts: [
      { pred: 'service', value: 'payments' },
      { pred: 'error', value: 'connection_reset' },
    ],
  });

  const design = core.createExperimentDesign({
    baseEpisodeId: obs.story.id,
    basedOnCounterfactualIds: ['CS_fixture_pe_test'],
    targetUncertaintyRefs: ['mechanism.connection_reset'],
    candidateMeasurements: ['measure_tcp_retries'],
    candidateInterventions: ['set_keepalive_30s'],
    expectedInformationGain: 0.65,
    discriminatingPower: {},
    safetyConstraints: [],
    recommendedAction: 'set_keepalive_30s',
    createdBy: 'test_runner',
    status: 'draft',
  });

  const result = pipeline.executeExperimentDesign({
    experimentDesign: design,
    operator: 'test_runner',
  });

  const { outcomeRecord, predictionError, execution, actionExecution } = result;
  const ax = actionExecution ?? execution;

  check('返回 predictionError 对象', typeof predictionError?.id === 'string', predictionError?.id);
  check('predictionError.outcomeRecordId === outcomeRecord.id',
    predictionError?.outcomeRecordId === outcomeRecord?.id,
    `${predictionError?.outcomeRecordId} vs ${outcomeRecord?.id}`);
  check('predictionError.causedByActionExecutionId === actionExecution.id',
    predictionError?.causedByActionExecutionId === ax?.id,
    `${predictionError?.causedByActionExecutionId} vs ${ax?.id}`);
  check('predictionError.expectedSummary 非空',
    typeof predictionError?.expectedSummary === 'string' && predictionError.expectedSummary.trim() !== '',
    predictionError?.expectedSummary);
  check('predictionError.actualSummary === outcomeRecord.summary',
    predictionError?.actualSummary === outcomeRecord?.summary,
    `${predictionError?.actualSummary} vs ${outcomeRecord?.summary}`);
  check('predictionError.errorKind 合法',
    ['observation','transition','outcome','context','unknown'].includes(predictionError?.errorKind ?? ''),
    predictionError?.errorKind);
  check('predictionError.severity 合法',
    ['low','medium','high'].includes(predictionError?.severity ?? ''),
    predictionError?.severity);
  check('score 字段存在（允许 null）', 'score' in (predictionError ?? {}), predictionError?.score);

  // store 可回查
  const fromStore = pipeline.predictionErrors?.get?.(predictionError?.id);
  check('predictionErrors.get() 可回查', fromStore?.id === predictionError?.id, fromStore?.id);

  const byOutcome = pipeline.predictionErrors?.listByOutcomeRecord?.(outcomeRecord?.id);
  check('listByOutcomeRecord() 可命中', byOutcome?.[0]?.id === predictionError?.id, byOutcome?.[0]?.id);

  pipeline.close?.();
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：expectedSummary 真实来源路径（CF.predictedOutcome）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: expectedSummary 真实来源路径');

{
  const pipeline = new core.CausalPipeline({ seedDefaults: false });

  const obs = pipeline.submitObservation({
    rawInput: 'real source test',
    facts: [{ pred: 'service', value: 'cache' }, { pred: 'error', value: 'eviction_spike' }],
  });

  // 构造真实 CF 并存入 pipeline store
  const cf = core.createCounterfactualScenario({
    baseEpisodeId: obs.story.id,
    modifiedAssumptions: ['assume_cache_hit_rate_stable'],
    mechanismProgramRefs: ['mech_cache_eviction'],
    predictedTrajectory: [{ step: 1, action: 'observe_cache_hit', expectedOutcome: 'hit_rate_normal' }],
    predictedObservationSignals: ['cache_hit_rate'],
    predictedOutcome: 'cache returns to normal hit rate after load reduction',
    divergencePoints: ['t_cache_overload'],
    createdBy: 'test_runner',
    status: 'draft',
  });
  pipeline.counterfactualScenarios.save(cf);

  const design = core.createExperimentDesign({
    baseEpisodeId: obs.story.id,
    basedOnCounterfactualIds: [cf.id],
    targetUncertaintyRefs: ['mechanism.cache_eviction'],
    candidateMeasurements: ['measure_cache_hit_rate'],
    candidateInterventions: ['reduce_cache_pressure'],
    expectedInformationGain: 0.8,
    discriminatingPower: {},
    safetyConstraints: [],
    recommendedAction: 'reduce_cache_pressure',
    createdBy: 'test_runner',
    status: 'draft',
  });

  const result = pipeline.executeExperimentDesign({
    experimentDesign: design,
    operator: 'test_runner',
  });

  const { predictionError } = result;
  check('expectedSummary 来自真实 CF.predictedOutcome',
    predictionError?.expectedSummary === cf.predictedOutcome,
    `"${predictionError?.expectedSummary}" vs "${cf.predictedOutcome}"`);
  check('expectedSummary 不含 fallback 词', !predictionError?.expectedSummary?.includes('missing'), predictionError?.expectedSummary);

  pipeline.close?.();
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：expectedSummary 降级路径（CF 不在 store 中）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: expectedSummary 降级路径（CF 不在 store）');

{
  const pipeline = new core.CausalPipeline({ seedDefaults: false });

  const obs = pipeline.submitObservation({
    rawInput: 'fallback test',
    facts: [{ pred: 'service', value: 'queue' }, { pred: 'error', value: 'backlog' }],
  });

  // 引用一个不存在的 CF ID
  const design = core.createExperimentDesign({
    baseEpisodeId: obs.story.id,
    basedOnCounterfactualIds: ['CS_does_not_exist_xyz'],
    targetUncertaintyRefs: ['mechanism.queue_backlog'],
    candidateMeasurements: ['measure_queue_depth'],
    candidateInterventions: ['increase_consumer_count'],
    expectedInformationGain: 0.5,
    discriminatingPower: {},
    safetyConstraints: [],
    recommendedAction: 'increase_consumer_count',
    createdBy: 'test_runner',
    status: 'draft',
  });

  const result = pipeline.executeExperimentDesign({
    experimentDesign: design,
    operator: 'test_runner',
  });

  const { predictionError } = result;
  check('fallback 路径 expectedSummary 仍非空',
    typeof predictionError?.expectedSummary === 'string' && predictionError.expectedSummary.trim() !== '',
    predictionError?.expectedSummary);
  check('fallback 值明确反映降级语义（含 missing）',
    predictionError?.expectedSummary?.includes('missing'),
    predictionError?.expectedSummary);

  pipeline.close?.();
}

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ PredictionError minimal delta 验收全部通过！');
} else {
  console.log('\n❌ PredictionError minimal delta 尚未完成，请先补实现。');
  process.exit(1);
}
