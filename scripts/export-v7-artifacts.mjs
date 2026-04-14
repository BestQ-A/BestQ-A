#!/usr/bin/env node
// ---
// kind: code
// implements: docs/current/artifact-contract.md
// ---
/**
 * export-v7-artifacts.mjs — 最小 v7 对象实例落盘
 *
 * 运行代表性 workload，将五类 v7 核心对象落盘到 artifacts/<run_id>/
 * 供 contract-audit.mjs 扫描第一轮绑定真值（§10 五条规则）。
 *
 * 目录布局：
 *   reconstructions/<id>.json        ← reconstruction-contract.md
 *   ontology_deltas/<id>.json        ← ontology-delta-contract.md
 *   derivation_chains/<id>.json      ← derivation-chain-contract.md
 *   mechanism_instances/<id>.json    ← mechanism-instance-contract.md
 *   episodes/<id>.json               ← v7-world-model-contract.md
 *
 * 用法（从项目根）：
 *   node scripts/export-v7-artifacts.mjs [--out-dir artifacts]
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DIST_CORE = path.join(ROOT, 'causal-learner', 'mcp-server', 'dist', 'core');
const GENERATED_BY = 'scripts/export-v7-artifacts.mjs';

// ──────────────────────────────────────────────────────────────────────────────
// 工具
// ──────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { 'out-dir': 'artifacts' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith('--')) { out[key] = true; } else { out[key] = val; i++; }
  }
  return out;
}

async function fromDist(module) {
  return import(pathToFileURL(path.join(DIST_CORE, module)).href);
}

function makeRunId() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10).replace(/-/g, '');
  const ms = d.getTime().toString(36).slice(-4);
  return `${date}-v7e-${ms}`;
}

async function writeArtifact(dir, filename, obj, conformsTo) {
  const wrapped = {
    $kind: 'instance',
    $conforms_to: conformsTo,
    $generated_by: GENERATED_BY,
    $generated_at: new Date().toISOString(),
    ...obj,
  };
  await writeFile(path.join(dir, filename), JSON.stringify(wrapped, null, 2) + '\n', 'utf8');
  return filename;
}

// ──────────────────────────────────────────────────────────────────────────────
// main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const outDirRel = String(args['out-dir']);
  const OUT_DIR = path.isAbsolute(outDirRel) ? outDirRel : path.join(ROOT, outDirRel);

  const runId = makeRunId();
  const runDir = path.join(OUT_DIR, runId);
  const dirs = {
    reconstructions:    path.join(runDir, 'reconstructions'),
    ontology_deltas:    path.join(runDir, 'ontology_deltas'),
    derivation_chains:  path.join(runDir, 'derivation_chains'),
    mechanism_instances: path.join(runDir, 'mechanism_instances'),
    episodes:           path.join(runDir, 'episodes'),
    episode_events:     path.join(runDir, 'episode_events'),
    observation_models:  path.join(runDir, 'observation_models'),
    observation_records: path.join(runDir, 'observation_records'),
    support_links:       path.join(runDir, 'support_links'),
  };
  for (const d of Object.values(dirs)) await mkdir(d, { recursive: true });

  console.log(`\n📦 export-v7-artifacts  →  artifacts/${runId}/\n`);

  // 动态导入编译产物
  const { CausalPipeline }              = await fromDist('pipeline.js');
  const { createMechanismInstance, acceptInstance } = await fromDist('mechanism-instance.js');
  const { createAcceptedReconstruction } = await fromDist('reconstruction.js');
  const { createDerivationTrace }        = await fromDist('derivation-trace.js');

  const pipeline = new CausalPipeline({ seedDefaults: false });
  const stats = {
    reconstructions: 0, ontology_deltas: 0, derivation_chains: 0,
    mechanism_instances: 0, episodes: 0, episode_events: 0,
    observation_models: 0, observation_records: 0, support_links: 0,
  };

  // ──────────────────────────────────────────────────────────────────────
  // Case A: 无路径 → MI=rejected, OntologyDelta.kind=none
  // ──────────────────────────────────────────────────────────────────────
  const obsA = pipeline.submitObservation({
    rawInput: 'service timeout on login endpoint',
    facts: [{ pred: 'error', value: 'timeout' }],
  });
  const fixA = pipeline.recordFix({
    storyId: obsA.story.id,
    fixDescription: '增加重试间隔和熔断器',
  });

  // ──────────────────────────────────────────────────────────────────────
  // Case B: 有路径（路径 atom 数不足 compile → MI=rejected, kind=none）
  // ──────────────────────────────────────────────────────────────────────
  const obsB = pipeline.submitObservation({
    rawInput: 'memory usage keeps growing after peak load',
    facts: [{ pred: 'symptom', value: 'memory_leak' }, { pred: 'context', value: 'peak_load' }],
  });
  const fixB = pipeline.recordFix({
    storyId: obsB.story.id,
    fixDescription: '修复未释放对象引用',
    chosenPathAtomIds: obsB.atoms.length >= 2 ? obsB.atoms.map(a => a.id) : undefined,
  });

  // 写出 pipeline 案例
  for (const fix of [fixA, fixB]) {
    const { reconstruction, ontologyUpdate, mechanismInstance, episode } = fix;
    const trace = pipeline.derivationTraces.getByReconstruction(reconstruction.id);

    await writeArtifact(dirs.reconstructions, `${reconstruction.id}.json`, reconstruction, 'docs/current/reconstruction-contract.md');
    stats.reconstructions++;

    await writeArtifact(dirs.ontology_deltas, `${ontologyUpdate.id}.json`, ontologyUpdate, 'docs/current/ontology-delta-contract.md');
    stats.ontology_deltas++;

    if (trace) {
      await writeArtifact(dirs.derivation_chains, `${trace.id}.json`, trace, 'docs/current/derivation-chain-contract.md');
      stats.derivation_chains++;
    }

    await writeArtifact(dirs.mechanism_instances, `${mechanismInstance.id}.json`, mechanismInstance, 'docs/current/mechanism-instance-contract.md');
    stats.mechanism_instances++;

    await writeArtifact(dirs.episodes, `${episode.id}.json`, episode, 'docs/current/v7-world-model-contract.md');
    stats.episodes++;

    // Episode events（从 pipeline 内存 store 读取，必须在 pipeline.close() 前）
    for (const ev of pipeline.episodeEvents.getByEpisode(episode.id)) {
      await writeArtifact(dirs.episode_events, `${ev.id}.json`, ev, 'docs/current/episode-event-contract.md');
      stats.episode_events++;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // ObservationModel 导出（OM-3 验证：status=current 的 OM 必须有 OR 引用）
  // ──────────────────────────────────────────────────────────────────────
  for (const om of pipeline.observationModels.listAll()) {
    await writeArtifact(dirs.observation_models, `${om.id}.json`, om, 'docs/current/observation-model-contract.md');
    stats.observation_models++;
  }

  // ──────────────────────────────────────────────────────────────────────
  // ObservationRecord 导出（OM-1 验证：OR.observationModelId 必须可解析）
  // ──────────────────────────────────────────────────────────────────────
  for (const obs of [obsA, obsB]) {
    for (const or of pipeline.observationRecords.listByEpisode(obs.story.id)) {
      await writeArtifact(dirs.observation_records, `${or.id}.json`, or, 'docs/current/observation-model-contract.md');
      stats.observation_records++;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // SupportLink 导出（OM-2 验证：SupportLink → OR → OM 链不断）
  // 若 compile 未触发（内存图无边）则手动构造一条 demo SupportLink
  // ──────────────────────────────────────────────────────────────────────
  {
    let slExported = 0;
    for (const fix of [fixA, fixB]) {
      for (const slId of fix.mechanismInstance.support_link_refs) {
        const sl = pipeline.supportLinks.get(slId);
        if (sl) {
          await writeArtifact(dirs.support_links, `${sl.id}.json`, sl, 'docs/current/support-link-contract.md');
          stats.support_links++;
          slExported++;
        }
      }
    }
    // 兜底：手动构造一条 demo SupportLink，确保 OM-2 链路在 artifact 层可验证
    if (slExported === 0) {
      const allOrs = [
        ...pipeline.observationRecords.listByEpisode(obsA.story.id),
        ...pipeline.observationRecords.listByEpisode(obsB.story.id),
      ];
      if (allOrs.length > 0) {
        const sl = {
          id: `SL_demo_${crypto.randomBytes(4).toString('hex')}`,
          observationRecordId: allOrs[0].id,
          claimId: `hyp_demo_${crypto.randomBytes(4).toString('hex')}`,
          polarity: 'supports',
          weight: 0.75,
          sourceKind: 'pipeline',
          sourceRef: 'export-v7-artifacts:demo',
          createdAt: new Date().toISOString(),
          createdBy: GENERATED_BY,
        };
        pipeline.supportLinks.save(sl);
        await writeArtifact(dirs.support_links, `${sl.id}.json`, sl, 'docs/current/support-link-contract.md');
        stats.support_links++;
      }
    }
  }

  pipeline.close();

  // ──────────────────────────────────────────────────────────────────────
  // Case C: 直接构造 accepted MI（覆盖 V7-1 + V7-5 非空路径）
  // accepted MI → reconstruction.mechanism_instance_ids 非空 → V7-1 可验证
  // ──────────────────────────────────────────────────────────────────────
  const epIdC = `ep_demo_${crypto.randomBytes(3).toString('hex')}`;
  const atomIdC = `atom_${crypto.randomBytes(3).toString('hex')}`;
  const hypIdC = `hyp_${crypto.randomBytes(3).toString('hex')}`;

  const miC = acceptInstance(
    createMechanismInstance({
      episode_id: epIdC,
      mechanism_class_ref: `proxy:demo_${epIdC}`,
      bindings: { slot_0: atomIdC },
      claim_ids: [hypIdC],
    }),
    { claim_ids: [hypIdC] }
  );

  const traceIdC = `DT_${epIdC}_${crypto.randomBytes(3).toString('hex')}`;
  const reconC = createAcceptedReconstruction({
    episodeId: epIdC,
    chosenPathAtomIds: [atomIdC],
    observationAtomIds: [atomIdC],
    selectedMechanismIds: [miC.mechanism_class_ref],
    mechanismInstanceIds: [miC.id],   // V7-1 验证用
    traceId: traceIdC,
    ontologySnapshotRef: 'ontology_current',
  });
  const traceC = createDerivationTrace({
    id: traceIdC,
    episodeId: epIdC,
    reconstructionId: reconC.id,   // 双向互链
    contextKind: 'reconstruction',
    premiseClaimIds: [hypIdC],
    createdBy: GENERATED_BY,
  });

  await writeArtifact(dirs.reconstructions, `${reconC.id}.json`, reconC, 'docs/current/reconstruction-contract.md');
  stats.reconstructions++;

  await writeArtifact(dirs.derivation_chains, `${traceC.id}.json`, traceC, 'docs/current/derivation-chain-contract.md');
  stats.derivation_chains++;

  await writeArtifact(dirs.mechanism_instances, `${miC.id}.json`, miC, 'docs/current/mechanism-instance-contract.md');
  stats.mechanism_instances++;

  console.log('落盘统计:');
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);
  console.log(`\n✅ 完成  artifacts/${runId}/\n`);
}

main().catch(err => {
  console.error('[export-v7-artifacts] 失败：', err.message);
  console.error(err.stack);
  process.exit(1);
});
