/**
 * test-v8-experiment-design-audit.mjs
 * 验收：ExperimentDesign governance integration（contract-audit first-pass）
 *
 * 目标：
 *   ED-1  baseEpisodeId 可解析
 *   ED-2  basedOnCounterfactualIds 全部可解析
 *   ED-3  recommendedAction 属于候选集合
 *
 * 说明：
 *   - 只走真实 artifact + scripts/contract-audit.mjs 路径
 *   - 不要求整个仓库 audit 零错误，只断言本测试生成的 ED 文件是否命中预期错误桶
 *   - 为避免污染后续 case，每个 case 都创建并清理独立 artifacts run 目录
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const execFileP = promisify(execFile);

const ROOT = path.resolve(process.cwd());
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const AUDIT_SCRIPT = path.join(ROOT, 'scripts', 'contract-audit.mjs');
const AUDIT_REPORT = path.join(ARTIFACTS_DIR, 'contract-audit-latest.json');
const GENERATED_BY = 'causal-learner/mcp-server/tests/test-v8-experiment-design-audit.mjs';

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

async function createSupportArtifacts(runDir, token) {
  const episodeId = `ep_${token}`;
  const deltaId = `OD_${token}`;
  const traceId = `DT_${token}`;
  const reconstructionId = `AR_${token}`;
  const programId = `MP_${token}`;
  const counterfactualId = `CS_${token}`;

  await writeArtifact(
    path.join(runDir, 'ontology_deltas'),
    `${deltaId}.json`,
    {
      id: deltaId,
      kind: 'none',
      changes: [],
      no_update_reason: {
        reason_kind: 'already_covered',
        explanation: 'test fixture',
      },
      applied_at: null,
    },
    'docs/current/ontology-delta-contract.md',
  );

  await writeArtifact(
    path.join(runDir, 'episodes'),
    `${episodeId}.json`,
    {
      id: episodeId,
      ontologyDeltaId: deltaId,
      observationAtomIds: [`atom_${token}`],
      chosenPathAtomIds: [],
      status: 'resolved',
    },
    'docs/current/v7-world-model-contract.md',
  );

  await writeArtifact(
    path.join(runDir, 'derivation_chains'),
    `${traceId}.json`,
    {
      id: traceId,
      episodeId,
      reconstructionId,
      contextKind: 'reconstruction',
      premiseClaimIds: [],
      supportLinks: [],
      createdBy: 'test_runner',
    },
    'docs/current/derivation-chain-contract.md',
  );

  await writeArtifact(
    path.join(runDir, 'reconstructions'),
    `${reconstructionId}.json`,
    {
      id: reconstructionId,
      episodeId,
      mechanism_instance_ids: [],
      traceId,
      selectedMechanismIds: [],
      chosenPathAtomIds: [],
      observationAtomIds: [`atom_${token}`],
      ontologySnapshotRef: 'ontology_current',
    },
    'docs/current/reconstruction-contract.md',
  );

  await writeArtifact(
    path.join(runDir, 'mechanism_programs'),
    `${programId}.json`,
    {
      id: programId,
      name: 'test-program',
      phases: [{ phase: 'observe', description: 'fixture' }],
      emittedObservationSignals: ['signal.fixture'],
      failsWhen: ['constraint.fixture'],
      status: 'current',
    },
    'docs/current/mechanism-program-contract.md',
  );

  await writeArtifact(
    path.join(runDir, 'counterfactual_scenarios'),
    `${counterfactualId}.json`,
    {
      id: counterfactualId,
      baseEpisodeId: episodeId,
      baseReconstructionId: reconstructionId,
      modifiedAssumptions: [
        {
          targetRef: 'param.fixture',
          modification: 'set',
          fromValue: 1,
          toValue: 2,
          rationale: 'fixture',
        },
      ],
      mechanismProgramRefs: [programId],
      predictedTrajectory: [
        { step: 0, kind: 'initial_condition', content: 'fixture', source: 'program_simulated' },
      ],
      predictedObservationSignals: ['signal.fixture'],
      predictedOutcome: 'fixture',
      divergencePoints: ['step0'],
      createdBy: 'test_runner',
      status: 'draft',
    },
    'docs/current/counterfactual-scenario-contract.md',
  );

  return { episodeId, counterfactualId };
}

async function runAudit() {
  try {
    await execFileP(process.execPath, [AUDIT_SCRIPT], { cwd: ROOT });
  } catch {
    // contract-audit may exit non-zero due unrelated repo findings; report is still the source of truth for these tests
  }
  const report = JSON.parse(await readFile(AUDIT_REPORT, 'utf8'));
  return report;
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

// ---------------------------------------------------------------------------
// T1: 合法 ExperimentDesign 不命中 ED 错误桶
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T1: 合法 ExperimentDesign governance pass');

await withRunDir('ed-audit-valid', async ({ runDir, runId }) => {
  const token = runToken('valid');
  const { episodeId, counterfactualId } = await createSupportArtifacts(runDir, token);
  const edId = `ED_${token}`;
  const relFile = path.join('artifacts', runId, 'experiment_designs', `${edId}.json`).replace(/\\/g, '/');

  await writeArtifact(
    path.join(runDir, 'experiment_designs'),
    `${edId}.json`,
    {
      id: edId,
      baseEpisodeId: episodeId,
      basedOnCounterfactualIds: [counterfactualId],
      targetUncertaintyRefs: ['mechanism.fixture'],
      candidateMeasurements: ['measure_fixture'],
      candidateInterventions: ['set_fixture'],
      expectedInformationGain: 0.7,
      discriminatingPower: {},
      safetyConstraints: [],
      recommendedAction: 'measure_fixture',
      createdBy: 'test_runner',
      status: 'draft',
    },
    'docs/current/experiment-design-contract.md',
  );

  const report = await runAudit();
  check('合法 ED 文件出现在 audit results', report.results.some(r => r.file === relFile), relFile);
  check('合法 ED 不命中 ED-1 bucket', !fileInBucket(report, 'bad_experiment_design_episode_ref', relFile));
  check('合法 ED 不命中 ED-2 bucket', !fileInBucket(report, 'bad_experiment_design_counterfactual_ref', relFile));
  check('合法 ED 不命中 ED-3 bucket', !fileInBucket(report, 'recommended_action_outside_candidates', relFile));
});

// ---------------------------------------------------------------------------
// T2: ED-1 baseEpisodeId 不可解析
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T2: ED-1 episode ref resolvable');

await withRunDir('ed-audit-bad-episode', async ({ runDir, runId }) => {
  const token = runToken('bad-ep');
  const { counterfactualId } = await createSupportArtifacts(runDir, token);
  const edId = `ED_${token}`;
  const relFile = path.join('artifacts', runId, 'experiment_designs', `${edId}.json`).replace(/\\/g, '/');

  await writeArtifact(
    path.join(runDir, 'experiment_designs'),
    `${edId}.json`,
    {
      id: edId,
      baseEpisodeId: 'ep_missing_fixture',
      basedOnCounterfactualIds: [counterfactualId],
      targetUncertaintyRefs: [],
      candidateMeasurements: ['measure_fixture'],
      candidateInterventions: [],
      expectedInformationGain: 0.5,
      discriminatingPower: {},
      safetyConstraints: [],
      recommendedAction: 'measure_fixture',
      createdBy: 'test_runner',
      status: 'draft',
    },
    'docs/current/experiment-design-contract.md',
  );

  const report = await runAudit();
  check('坏 episode ref 命中 ED-1 bucket', fileInBucket(report, 'bad_experiment_design_episode_ref', relFile));
});

// ---------------------------------------------------------------------------
// T3: ED-2 basedOnCounterfactualIds 不可解析
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T3: ED-2 counterfactual refs resolvable');

await withRunDir('ed-audit-bad-counterfactual', async ({ runDir, runId }) => {
  const token = runToken('bad-cf');
  const { episodeId } = await createSupportArtifacts(runDir, token);
  const edId = `ED_${token}`;
  const relFile = path.join('artifacts', runId, 'experiment_designs', `${edId}.json`).replace(/\\/g, '/');

  await writeArtifact(
    path.join(runDir, 'experiment_designs'),
    `${edId}.json`,
    {
      id: edId,
      baseEpisodeId: episodeId,
      basedOnCounterfactualIds: ['CS_missing_fixture'],
      targetUncertaintyRefs: [],
      candidateMeasurements: ['measure_fixture'],
      candidateInterventions: [],
      expectedInformationGain: 0.5,
      discriminatingPower: {},
      safetyConstraints: [],
      recommendedAction: 'measure_fixture',
      createdBy: 'test_runner',
      status: 'draft',
    },
    'docs/current/experiment-design-contract.md',
  );

  const report = await runAudit();
  check('坏 counterfactual ref 命中 ED-2 bucket', fileInBucket(report, 'bad_experiment_design_counterfactual_ref', relFile));
});

// ---------------------------------------------------------------------------
// T4: ED-3 recommendedAction 不在候选集合中
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T4: ED-3 recommendedAction inside candidate sets');

await withRunDir('ed-audit-bad-action', async ({ runDir, runId }) => {
  const token = runToken('bad-action');
  const { episodeId, counterfactualId } = await createSupportArtifacts(runDir, token);
  const edId = `ED_${token}`;
  const relFile = path.join('artifacts', runId, 'experiment_designs', `${edId}.json`).replace(/\\/g, '/');

  await writeArtifact(
    path.join(runDir, 'experiment_designs'),
    `${edId}.json`,
    {
      id: edId,
      baseEpisodeId: episodeId,
      basedOnCounterfactualIds: [counterfactualId],
      targetUncertaintyRefs: [],
      candidateMeasurements: ['measure_fixture'],
      candidateInterventions: ['set_fixture'],
      expectedInformationGain: 0.5,
      discriminatingPower: {},
      safetyConstraints: [],
      recommendedAction: 'not_in_candidates',
      createdBy: 'test_runner',
      status: 'draft',
    },
    'docs/current/experiment-design-contract.md',
  );

  const report = await runAudit();
  check('坏 recommendedAction 命中 ED-3 bucket', fileInBucket(report, 'recommended_action_outside_candidates', relFile));
});

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ v8 ExperimentDesign governance audit 验收全部通过！');
} else {
  console.log('\n❌ 存在失败项，请检查！');
  process.exit(1);
}
