#!/usr/bin/env node
// ---
// kind: code
// implements: docs/current/stats-snapshot-contract.md
// ---
// TODO(2026-04-13): docs/current/stats-snapshot-contract.md 由并行 agent 创建中；
// 若在审计时该文件仍不存在，contract-audit.mjs 会报 implements 目标缺失。
/**
 * dump-stats.mjs — 极简 stats 导出器（Phase 0 baseline 用）
 *
 * 职责：初始化一套空的 causal-learner storage / graph / pipeline，
 * 调用它们的 getStats/getDualStats/getLongtermStats，把结果作为单个
 * JSON 对象打到 stdout。每个字段独立 try/catch，单点失败不影响其它。
 *
 * 运行方式（从 mcp-server 目录或其它地方都行，脚本自行解析相对路径）：
 *   node scripts/dump-stats.mjs
 *
 * 注意：
 *  - 纯 ESM，无新依赖
 *  - 如果 dist/ 不存在，自动先跑一次 `npm run build`
 *  - 所有 storage 都用 :memory:，不会污染任何文件 DB
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const MCP_DIR    = path.resolve(__dirname, '..');
const DIST_DIR   = path.join(MCP_DIR, 'dist');

// ---- 1. 确保 dist/ 存在（按需 build） ----------------------------------
if (!existsSync(path.join(DIST_DIR, 'core', 'storage.js'))) {
  const r = spawnSync('npm', ['run', 'build'], {
    cwd: MCP_DIR,
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.status !== 0) {
    console.error(JSON.stringify({ error: 'npm run build failed', code: r.status }));
    process.exit(2);
  }
}

// ---- 2. 动态 import 编译产物 -------------------------------------------
const importCore = async (rel) => {
  const abs = path.join(DIST_DIR, rel);
  return await import(pathToFileURL(abs).href);
};

// 分类元数据：让该产物能被 contract-audit.mjs 识别为 instance
const NOW_ISO = new Date().toISOString();
const out = {
  $kind: 'instance',
  $conforms_to: 'docs/current/stats-snapshot-contract.md',
  $generated_by: 'causal-learner/mcp-server/scripts/dump-stats.mjs',
  $generated_at: NOW_ISO,
  captured_at: NOW_ISO,
};

// storage.getStats() — 空内存 DB 也能正常返回 0 计数结构
try {
  const { CausalStorage } = await importCore('core/storage.js');
  const s = new CausalStorage(':memory:');
  out.storageStats = s.getStats();
  s.close();
} catch (e) {
  out.storageStats = { error: String(e?.message || e) };
}

// dualStorage.getDualStats() + getLongtermStats()
try {
  const { DualLayerStorage } = await importCore('core/dual-storage.js');
  // 用 :memory: 作为 long-term path，避免落盘
  const d = new DualLayerStorage(':memory:', { testMode: true });
  out.dualStats     = d.getDualStats();
  out.longtermStats = d.getLongtermStats();
} catch (e) {
  out.dualStats     = { error: String(e?.message || e) };
  out.longtermStats = { error: String(e?.message || e) };
}

// atomGraph.getStats()
try {
  const { AtomGraph } = await importCore('core/atom-graph.js');
  const g = new AtomGraph(':memory:');
  out.graphStats = g.getStats();
  g.close?.();
} catch (e) {
  out.graphStats = { error: String(e?.message || e) };
}

// pipeline.getStats() — 全内存配置
try {
  const { CausalPipeline } = await importCore('core/pipeline.js');
  const p = new CausalPipeline({
    graphDbPath:        ':memory:',
    storyDbPath:        ':memory:',
    evidenceDbPath:     ':memory:',
    problemClassDbPath: ':memory:',
    patternDbPath:      ':memory:',
    autoClassify:       false,
    autoExplore:        false,
    seedDefaults:       false,
  });
  out.pipelineStats = p.getStats();
  p.close?.();
} catch (e) {
  out.pipelineStats = { error: String(e?.message || e) };
}

// ---- 3. 输出 -----------------------------------------------------------
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
