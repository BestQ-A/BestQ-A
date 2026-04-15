/**
 * test-v8-action-execution.mjs
 * 验收：ActionExecution minimal loop
 *
 * 目标：
 *   1. basedOnExperimentDesignId 可解析
 *   2. actionRef === ExperimentDesign.recommendedAction
 *   3. targetEpisodeId 被写入且可回查
 *   4. 至少一条 ExperimentDesign -> ActionExecution -> new Episode 样例通过
 *
 * 说明：
 *   - 这是目标态验收测试，不改业务实现
 *   - 当前若 ActionExecution 对象 / store / pipeline 入口尚未实现，应明确红灯
 */

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DIST_CORE = path.join(ROOT, 'causal-learner', 'mcp-server', 'dist', 'core');

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
console.log('📦 T1: ActionExecution object/store/entry surface 存在');

const core = await importFromDist('index.js');
const pipelineMod = await importFromDist('pipeline.js');

check('dist/core/index.js 导出 CausalPipeline', typeof core.CausalPipeline === 'function');
check('dist/core/index.js 导出 createExperimentDesign', typeof core.createExperimentDesign === 'function');
check('dist/core/index.js 导出 ActionExecutionStore', typeof core.ActionExecutionStore === 'function', typeof core.ActionExecutionStore);
check('dist/core/index.js 导出 createActionExecution', typeof core.createActionExecution === 'function', typeof core.createActionExecution);
check('pipeline 暴露 executeExperimentDesign 或等价入口', typeof pipelineMod.CausalPipeline?.prototype?.executeExperimentDesign === 'function', typeof pipelineMod.CausalPipeline?.prototype?.executeExperimentDesign);

console.log('\n============================================================');
console.log('📦 T2: ExperimentDesign -> ActionExecution -> new Episode 最小闭环');

if (
  typeof core.CausalPipeline === 'function' &&
  typeof core.createExperimentDesign === 'function' &&
  typeof core.ActionExecutionStore === 'function' &&
  typeof pipelineMod.CausalPipeline?.prototype?.executeExperimentDesign === 'function'
) {
  const pipeline = new core.CausalPipeline({ seedDefaults: false });

  const obs = pipeline.submitObservation({
    rawInput: 'action execution loop test',
    facts: [
      { pred: 'service', value: 'billing' },
      { pred: 'error', value: 'timeout' },
    ],
  });

  const design = core.createExperimentDesign({
    baseEpisodeId: obs.story.id,
    basedOnCounterfactualIds: ['CS_fixture_actionexecution'],
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

  check('返回 ActionExecution 对象', typeof result?.actionExecution?.id === 'string', result?.actionExecution?.id);
  check('basedOnExperimentDesignId 可解析', result?.actionExecution?.basedOnExperimentDesignId === design.id, result?.actionExecution?.basedOnExperimentDesignId);
  check('actionRef === recommendedAction', result?.actionExecution?.actionRef === design.recommendedAction, `${result?.actionExecution?.actionRef} vs ${design.recommendedAction}`);
  check('targetEpisodeId 已写入', typeof result?.actionExecution?.targetEpisodeId === 'string' && result.actionExecution.targetEpisodeId.length > 0, result?.actionExecution?.targetEpisodeId);

  const targetEpisode = result?.episode ?? pipeline.stories?.get?.(result?.actionExecution?.targetEpisodeId);
  check('targetEpisode 可回查', !!targetEpisode, result?.actionExecution?.targetEpisodeId);
  check('targetEpisode.id 与 ActionExecution.targetEpisodeId 一致', targetEpisode?.id === result?.actionExecution?.targetEpisodeId, `${targetEpisode?.id} vs ${result?.actionExecution?.targetEpisodeId}`);

  pipeline.close?.();
} else {
  check('ActionExecution 最小闭环入口尚未可用', false, 'missing ActionExecutionStore/createActionExecution/executeExperimentDesign');
}

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ ActionExecution minimal loop 验收全部通过！');
} else {
  console.log('\n❌ ActionExecution minimal loop 尚未完成，请先补实现。');
  process.exit(1);
}
