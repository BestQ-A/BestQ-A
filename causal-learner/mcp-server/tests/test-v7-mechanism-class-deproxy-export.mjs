/**
 * test-v7-mechanism-class-deproxy-export.mjs
 * 验收：MechanismClass de-proxy export governance
 *
 * 目标：
 *   T1  export 后 mechanism_instances/*.json 不再出现新的 proxy:*
 *   T2  export 后 reconstructions/*.json 的 selectedMechanismIds 不再出现新的 proxy:*
 *   T3  export 后 mechanism_programs/*.json 的 mechanismClassRef 不再出现新的 proxy:*
 *
 * 说明：
 *   - 只走真实 scripts/export-v7-artifacts.mjs
 *   - 每次测试创建独立 artifacts run 目录，结束后清理
 *   - 不依赖整个仓库历史 artifacts 状态，只检查本次新导出的 run
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import process from 'node:process';

const execFileP = promisify(execFile);

// 基于测试文件位置计算 BestQ-A 项目根，避免依赖运行时 cwd
// （CI 在 causal-learner/mcp-server 下运行 .mjs 测试，cwd 不是项目根）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const EXPORT_SCRIPT = path.join(ROOT, 'scripts', 'export-v7-artifacts.mjs');
const ARTIFACTS_ROOT = path.join(ROOT, 'artifacts');

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

function hasProxy(value) {
  if (typeof value === 'string') return value.startsWith('proxy:');
  if (Array.isArray(value)) return value.some(hasProxy);
  if (value && typeof value === 'object') return Object.values(value).some(hasProxy);
  return false;
}

async function readJsonFiles(dir) {
  const items = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const item of items) {
    if (!item.isFile() || !item.name.endsWith('.json')) continue;
    const abs = path.join(dir, item.name);
    out.push({
      file: abs,
      json: JSON.parse(await readFile(abs, 'utf8')),
    });
  }
  return out;
}

async function main() {
  const tmpBase = await mkdtemp(path.join(os.tmpdir(), 'bestqa-deproxy-export-'));
  try {
    await execFileP(process.execPath, [EXPORT_SCRIPT, '--out-dir', tmpBase], { cwd: ROOT });

    const runs = await readdir(tmpBase, { withFileTypes: true });
    const runDirs = runs.filter(d => d.isDirectory()).map(d => path.join(tmpBase, d.name));
    check('export 生成 1 个 run 目录', runDirs.length === 1, runDirs.length);
    if (runDirs.length !== 1) {
      throw new Error(`expected exactly one run dir, got ${runDirs.length}`);
    }

    const runDir = runDirs[0];
    const relRunDir = path.relative(ROOT, runDir).replace(/\\/g, '/');
    check('run 目录位于临时 out-dir 下', relRunDir.startsWith(path.relative(ROOT, tmpBase).replace(/\\/g, '/')), relRunDir);

    const miDir = path.join(runDir, 'mechanism_instances');
    const rcDir = path.join(runDir, 'reconstructions');
    const mpDir = path.join(runDir, 'mechanism_programs');

    const mechanismInstances = await readJsonFiles(miDir);
    const reconstructions = await readJsonFiles(rcDir);
    const mechanismPrograms = await readJsonFiles(mpDir);

    check('mechanism_instances/*.json 已导出', mechanismInstances.length > 0, mechanismInstances.length);
    check('reconstructions/*.json 已导出', reconstructions.length > 0, reconstructions.length);
    check('mechanism_programs/*.json 已导出', mechanismPrograms.length > 0, mechanismPrograms.length);

    const proxyMi = mechanismInstances.filter(({ json }) => hasProxy(json.mechanism_class_ref));
    const proxyRecon = reconstructions.filter(({ json }) => hasProxy(json.selectedMechanismIds));
    const proxyProg = mechanismPrograms.filter(({ json }) => hasProxy(json.mechanismClassRef));

    check('mechanism_instances/*.json 不再出现新的 proxy:*', proxyMi.length === 0, proxyMi.map(x => path.basename(x.file)).join(', '));
    check('reconstructions/*.json 的 selectedMechanismIds 不再出现新的 proxy:*', proxyRecon.length === 0, proxyRecon.map(x => path.basename(x.file)).join(', '));
    check('mechanism_programs/*.json 的 mechanismClassRef 不再出现新的 proxy:*', proxyProg.length === 0, proxyProg.map(x => path.basename(x.file)).join(', '));
  } finally {
    await rm(tmpBase, { recursive: true, force: true });
  }

  console.log('\n============================================================');
  console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

  if (fail === 0) {
    console.log('\n✅ MechanismClass de-proxy export 治理验收全部通过！');
  } else {
    console.log('\n❌ 新 export 产物仍包含 proxy:*，请检查实现。');
    process.exit(1);
  }
}

await main();
