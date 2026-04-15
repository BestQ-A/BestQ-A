/**
 * test-v8-outcome-record.mjs
 * 验收：OutcomeRecord minimal feedback
 *
 * 目标：
 *   1. episodeId 可解析
 *   2. causedByActionExecutionId 可解析
 *   3. status / summary 正确写入
 *   4. 至少一条 ActionExecution -> OutcomeRecord 样例通过
 *
 * 说明：
 *   - 这是目标态验收测试，不改业务实现
 *   - 若 OutcomeRecord 对象 / store / pipeline 接线尚未实现，应明确红灯
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

console.log('\n============================================================');
console.log('📦 T1: OutcomeRecord object/store/entry surface 存在');

const core = await importFromDist('index.js');
const pipelineMod = await importFromDist('pipeline.js');

check('dist/core/index.js 导出 CausalPipeline', typeof core.CausalPipeline === 'function');
check('dist/core/index.js 导出 createExperimentDesign', typeof core.createExperimentDesign === 'function');
check('dist/core/index.js 导出 OutcomeRecordStore', typeof core.OutcomeRecordStore === 'function', typeof core.OutcomeRecordStore);
check('dist/core/index.js 导出 createOutcomeRecord', typeof core.createOutcomeRecord === 'function', typeof core.createOutcomeRecord);
check('pipeline 暴露 executeExperimentDesign', typeof pipelineMod.CausalPipeline?.prototype?.executeExperimentDesign === 'function', typeof pipelineMod.CausalPipeline?.prototype?.executeExperimentDesign);

console.log('\n============================================================');
console.log('📦 T2: ActionExecution -> OutcomeRecord 最小反馈闭环');

if (
  typeof core.CausalPipeline === 'function' &&
  typeof core.createExperimentDesign === 'function' &&
  typeof core.OutcomeRecordStore === 'function' &&
  typeof core.createOutcomeRecord === 'function' &&
  typeof pipelineMod.CausalPipeline?.prototype?.executeExperimentDesign === 'function'
) {
  const pipeline = new core.CausalPipeline({ seedDefaults: false });

  const obs = pipeline.submitObservation({
    rawInput: 'outcome record loop test',
    facts: [
      { pred: 'service', value: 'checkout' },
      { pred: 'error', value: 'timeout' },
    ],
  });

  const design = core.createExperimentDesign({
    baseEpisodeId: obs.story.id,
    basedOnCounterfactualIds: ['CS_fixture_outcome'],
    targetUncertaintyRefs: ['mechanism.timeout'],
    candidateMeasurements: ['measure_latency_p99'],
    candidateInterventions: ['set_retry_interval_500ms'],
    expectedInformationGain: 0.7,
    discriminatingPower: {},
    safetyConstraints: [],
    recommendedAction: 'set_retry_interval_500ms',
    createdBy: 'test_runner',
    status: 'draft',
  });

  const result = pipeline.executeExperimentDesign({
    experimentDesign: design,
    createdBy: 'test_runner',
  });

  const targetEpisode = result?.targetEpisode ?? result?.episode;
  const actionExecution = result?.actionExecution ?? result?.execution;

  const outcome = result?.outcomeRecord
    ?? pipeline.outcomeRecords?.get?.(targetEpisode?.outcomeRecordId)
    ?? pipeline.outcomeRecords?.listByEpisode?.(targetEpisode?.id)?.[0];

  const outcomeByActionExecution = pipeline.outcomeRecords?.listByActionExecution?.(actionExecution?.id)?.[0];

  check('返回或可回查 OutcomeRecord 对象', typeof outcome?.id === 'string', outcome?.id);
  check('episodeId 可解析到 targetEpisode', outcome?.episodeId === targetEpisode?.id, `${outcome?.episodeId} vs ${targetEpisode?.id}`);
  check('causedByActionExecutionId 可解析', outcome?.causedByActionExecutionId === actionExecution?.id, `${outcome?.causedByActionExecutionId} vs ${actionExecution?.id}`);
  check('status 正确写入为 partial', outcome?.status === 'partial', outcome?.status);
  check('summary 正确写入为执行结果摘要', outcome?.summary === actionExecution?.observedOutcomeSummary, `${outcome?.summary} vs ${actionExecution?.observedOutcomeSummary}`);
  check('listByActionExecution() 可命中该 OutcomeRecord', outcomeByActionExecution?.id === outcome?.id, `${outcomeByActionExecution?.id} vs ${outcome?.id}`);

  pipeline.close?.();
} else {
  check('OutcomeRecord 最小反馈入口尚未可用', false, 'missing OutcomeRecordStore/createOutcomeRecord/executeExperimentDesign wiring');
}

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ OutcomeRecord minimal feedback 验收全部通过！');
} else {
  console.log('\n❌ OutcomeRecord minimal feedback 尚未完成，请先补实现。');
  process.exit(1);
}
