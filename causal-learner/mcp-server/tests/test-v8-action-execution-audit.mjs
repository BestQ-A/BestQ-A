/**
 * test-v8-action-execution-audit.mjs
 * 验收：ActionExecution governance integration（contract-audit first-pass）
 *
 * 目标：
 *   AX-1  basedOnExperimentDesignId 可解析
 *   AX-2  sourceEpisodeId 可解析
 *   AX-3  targetEpisodeId 可解析（completed 时）
 *   AX-4  actionRef === ExperimentDesign.recommendedAction
 *
 * 说明：
 *   - 正向样例走真实 export + 真实 contract-audit
 *   - 反向样例走临时 artifact fixture + 真实 contract-audit
 *   - 不要求整个仓库 audit 零错误，只断言本测试生成 / 导出的 AX 文件是否命中预期错误桶
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const execFileP = promisify(execFile);

const ROOT = path.resolve(process.cwd());
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const AUDIT_SCRIPT = path.join(ROOT, 'scripts', 'contract-audit.mjs');
const EXPORT_SCRIPT = path.join(ROOT, 'scripts', 'export-v7-artifacts.mjs');
const AUDIT_REPORT = path.join(ARTIFACTS_DIR, 'contract-audit-latest.json');
const GENERATED_BY = 'causal-learner/mcp-server/tests/test-v8-action-execution-audit.mjs';

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

function runToken(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
}

async function writeArtifact(dir, filename, body, conformsTo) {
  await mkdir(dir, { recursive: true });
  const wrapped = {
    $kind: 'instance',
    $conforms_to: conformsTo,
    $generated_by: GENERATED_BY,
    $generated_at: new Date().toISOString(),
    ...body,
  };
  await writeFile(path.join(dir, filename), JSON.stringify(wrapped, null, 2) + '\n', 'utf8');
}

async function runAudit() {
  try {
    await execFileP(process.execPath, [AUDIT_SCRIPT], { cwd: ROOT });
  } catch {
    // 允许存在与本轮无关的既有错误；报告文件仍是本测试的真值来源
  }
  return JSON.parse(await readFile(AUDIT_REPORT, 'utf8'));
}

function fileInBucket(report, bucketName, relFile) {
  return Array.isArray(report.binding_errors?.[bucketName]) &&
    report.binding_errors[bucketName].includes(relFile.replace(/\\/g, '/'));
}

async function withRunDir(prefix, fn) {
  const runId = runToken(prefix);
  const runDir = path.join(ARTIFACTS_DIR, runId);
  try {
    await mkdir(runDir, { recursive: true });
    return await fn({ runId, runDir });
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

async function createSupportArtifacts(runDir, token, overrides = {}) {
  const episodeId = overrides.episodeId ?? `ep_${token}`;
  const targetEpisodeId = overrides.targetEpisodeId ?? `ep_target_${token}`;
  const designId = overrides.designId ?? `ED_${token}`;
  const counterfactualId = overrides.counterfactualId ?? `CS_${token}`;
  const actionRef = overrides.recommendedAction ?? 'measure_fixture';

  await writeArtifact(
    path.join(runDir, 'episodes'),
    `${episodeId}.json`,
    {
      id: episodeId,
      ontologyDeltaId: `OD_${token}`,
      observationAtomIds: [`atom_${token}`],
      chosenPathAtomIds: [],
      status: 'resolved',
    },
    'docs/current/v7-world-model-contract.md',
  );

  await writeArtifact(
    path.join(runDir, 'episodes'),
    `${targetEpisodeId}.json`,
    {
      id: targetEpisodeId,
      ontologyDeltaId: `OD_target_${token}`,
      observationAtomIds: [`atom_target_${token}`],
      chosenPathAtomIds: [],
      status: 'resolved',
    },
    'docs/current/v7-world-model-contract.md',
  );

  await writeArtifact(
    path.join(runDir, 'counterfactual_scenarios'),
    `${counterfactualId}.json`,
    {
      id: counterfactualId,
      baseEpisodeId: episodeId,
      baseReconstructionId: `AR_${token}`,
      modifiedAssumptions: [
        {
          targetRef: 'param.fixture',
          modification: 'set',
          fromValue: 1,
          toValue: 2,
          rationale: 'fixture',
        },
      ],
      mechanismProgramRefs: ['MP_fixture'],
      predictedTrajectory: [{ step: 0, kind: 'initial_condition', content: 'fixture', source: 'program_simulated' }],
      predictedObservationSignals: ['signal.fixture'],
      predictedOutcome: 'fixture',
      divergencePoints: ['step0'],
      createdBy: 'test_runner',
      status: 'draft',
    },
    'docs/current/counterfactual-scenario-contract.md',
  );

  await writeArtifact(
    path.join(runDir, 'experiment_designs'),
    `${designId}.json`,
    {
      id: designId,
      baseEpisodeId: episodeId,
      basedOnCounterfactualIds: [counterfactualId],
      targetUncertaintyRefs: ['mechanism.fixture'],
      candidateMeasurements: ['measure_fixture'],
      candidateInterventions: ['set_fixture'],
      expectedInformationGain: 0.6,
      discriminatingPower: {},
      safetyConstraints: [],
      recommendedAction: actionRef,
      createdBy: 'test_runner',
      status: 'draft',
    },
    'docs/current/experiment-design-contract.md',
  );

  return { episodeId, targetEpisodeId, designId, actionRef };
}

console.log('\n============================================================');
console.log('📦 T1: 合法 ActionExecution governance pass（真实 export）');

{
  const before = new Set(
    (await readdir(ARTIFACTS_DIR, { withFileTypes: true }))
      .filter(e => e.isDirectory())
      .map(e => e.name),
  );
  let createdRunDir = null;
  try {
    await execFileP(process.execPath, [EXPORT_SCRIPT, '--out-dir', ARTIFACTS_DIR], { cwd: ROOT });
    const entries = await readdir(ARTIFACTS_DIR, { withFileTypes: true });
    const runDirs = entries
      .filter(e => e.isDirectory() && !before.has(e.name))
      .map(e => path.join(ARTIFACTS_DIR, e.name));

    check('真实 export 生成 1 个 run 目录', runDirs.length === 1, runDirs.length);

    if (runDirs.length === 1) {
      const runDir = runDirs[0];
      createdRunDir = runDir;
      const actionExecDir = path.join(runDir, 'action_executions');
      const files = (await readdir(actionExecDir)).filter(name => name.endsWith('.json'));
      check('真实 export 导出 action_executions/*.json', files.length > 0, files.length);

      if (files.length > 0) {
        const relFile = path.join(path.relative(ROOT, runDir), 'action_executions', files[0]).replace(/\\/g, '/');
        const report = await runAudit();

        check('合法 AX 文件出现在 audit results', report.results.some(r => r.file === relFile), relFile);
        check('合法 AX 不命中 AX-1 bucket', !fileInBucket(report, 'bad_action_execution_design_ref', relFile));
        check('合法 AX 不命中 AX-2 bucket', !fileInBucket(report, 'bad_action_execution_source_episode_ref', relFile));
        check('合法 AX 不命中 AX-3 bucket', !fileInBucket(report, 'bad_action_execution_target_episode_ref', relFile));
        check('合法 AX 不命中 AX-4 bucket', !fileInBucket(report, 'action_execution_ref_mismatch', relFile));
      }
    }
  } finally {
    if (createdRunDir) {
      await rm(createdRunDir, { recursive: true, force: true });
    }
  }
}

console.log('\n============================================================');
console.log('📦 T2: AX-1 basedOnExperimentDesignId 可解析');

await withRunDir('ax-audit-bad-design', async ({ runDir, runId }) => {
  const token = runToken('bad-design');
  const { episodeId, targetEpisodeId } = await createSupportArtifacts(runDir, token);
  const axId = `AX_${token}`;
  const relFile = path.join('artifacts', runId, 'action_executions', `${axId}.json`).replace(/\\/g, '/');

  await writeArtifact(
    path.join(runDir, 'action_executions'),
    `${axId}.json`,
    {
      id: axId,
      basedOnExperimentDesignId: 'ED_missing_fixture',
      sourceEpisodeId: episodeId,
      targetEpisodeId,
      actionRef: 'measure_fixture',
      actionKind: 'measurement',
      parameters: {},
      executionStatus: 'completed',
      observedOutcomeSummary: 'fixture',
      predictionError: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdBy: 'test_runner',
    },
    'docs/current/action-execution-contract.md',
  );

  const report = await runAudit();
  check('坏 design ref 命中 AX-1 bucket', fileInBucket(report, 'bad_action_execution_design_ref', relFile));
});

console.log('\n============================================================');
console.log('📦 T3: AX-2 sourceEpisodeId 可解析');

await withRunDir('ax-audit-bad-source', async ({ runDir, runId }) => {
  const token = runToken('bad-source');
  const { designId, targetEpisodeId } = await createSupportArtifacts(runDir, token);
  const axId = `AX_${token}`;
  const relFile = path.join('artifacts', runId, 'action_executions', `${axId}.json`).replace(/\\/g, '/');

  await writeArtifact(
    path.join(runDir, 'action_executions'),
    `${axId}.json`,
    {
      id: axId,
      basedOnExperimentDesignId: designId,
      sourceEpisodeId: 'ep_missing_fixture',
      targetEpisodeId,
      actionRef: 'measure_fixture',
      actionKind: 'measurement',
      parameters: {},
      executionStatus: 'completed',
      observedOutcomeSummary: 'fixture',
      predictionError: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdBy: 'test_runner',
    },
    'docs/current/action-execution-contract.md',
  );

  const report = await runAudit();
  check('坏 source episode ref 命中 AX-2 bucket', fileInBucket(report, 'bad_action_execution_source_episode_ref', relFile));
});

console.log('\n============================================================');
console.log('📦 T4: AX-3 targetEpisodeId 可解析（completed 时）');

await withRunDir('ax-audit-bad-target', async ({ runDir, runId }) => {
  const token = runToken('bad-target');
  const { episodeId, designId } = await createSupportArtifacts(runDir, token);
  const axId = `AX_${token}`;
  const relFile = path.join('artifacts', runId, 'action_executions', `${axId}.json`).replace(/\\/g, '/');

  await writeArtifact(
    path.join(runDir, 'action_executions'),
    `${axId}.json`,
    {
      id: axId,
      basedOnExperimentDesignId: designId,
      sourceEpisodeId: episodeId,
      targetEpisodeId: 'ep_target_missing_fixture',
      actionRef: 'measure_fixture',
      actionKind: 'measurement',
      parameters: {},
      executionStatus: 'completed',
      observedOutcomeSummary: 'fixture',
      predictionError: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdBy: 'test_runner',
    },
    'docs/current/action-execution-contract.md',
  );

  const report = await runAudit();
  check('坏 target episode ref 命中 AX-3 bucket', fileInBucket(report, 'bad_action_execution_target_episode_ref', relFile));
});

console.log('\n============================================================');
console.log('📦 T5: AX-4 actionRef === recommendedAction');

await withRunDir('ax-audit-bad-actionref', async ({ runDir, runId }) => {
  const token = runToken('bad-actionref');
  const { episodeId, targetEpisodeId, designId } = await createSupportArtifacts(runDir, token, {
    recommendedAction: 'measure_fixture',
  });
  const axId = `AX_${token}`;
  const relFile = path.join('artifacts', runId, 'action_executions', `${axId}.json`).replace(/\\/g, '/');

  await writeArtifact(
    path.join(runDir, 'action_executions'),
    `${axId}.json`,
    {
      id: axId,
      basedOnExperimentDesignId: designId,
      sourceEpisodeId: episodeId,
      targetEpisodeId,
      actionRef: 'set_fixture',
      actionKind: 'intervention',
      parameters: {},
      executionStatus: 'completed',
      observedOutcomeSummary: 'fixture',
      predictionError: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdBy: 'test_runner',
    },
    'docs/current/action-execution-contract.md',
  );

  const report = await runAudit();
  check('坏 actionRef 命中 AX-4 bucket', fileInBucket(report, 'action_execution_ref_mismatch', relFile));
});

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ ActionExecution governance audit 验收全部通过！');
} else {
  console.log('\n❌ ActionExecution governance audit 尚未完成，请补治理接入。');
  process.exit(1);
}
