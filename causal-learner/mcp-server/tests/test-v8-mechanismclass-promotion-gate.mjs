/**
 * test-v8-mechanismclass-promotion-gate.mjs
 * 验收：MechanismClass promotion gate（P04）
 *
 * T1：phases 为空 → 晋升失败
 * T2：supporting_episode_ids < 2 → 晋升失败
 * T3：mechanismProgramIds 为空 → 晋升失败（新增门控）
 * T4：三个门控全部满足 → 晋升成功，compilation_status = compiled
 * T5：deprecateMechanismClass(compiled) → deprecated
 * T6：deprecateMechanismClass(candidate) → 失败（非 compiled 不可废弃）
 * T7：validateMechanismClass 不变量 6（compiled + no programs）→ 报错
 * T8：validateMechanismClass 合法 compiled（有 programs）→ 通过
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

const core = await importFromDist('index.js');

// ── 基础工厂 ──────────────────────────────────────────────────
function makeMC(overrides = {}) {
  return core.createMechanismClass({
    name: 'test_gate_mechanism',
    description: 'test fixture',
    phases: [{ name: 'phase_a', expected_state_changes: [], expected_observations: ['sig_a'] }],
    observable_signatures: ['sig_a'],
    intervention_points: ['phase_a'],
    outcomes: ['success'],
    supporting_episode_ids: ['ep_1', 'ep_2'],
    mechanismProgramIds: ['MP_fixture_001'],
    created_by: 'test',
    ...overrides,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// T1：phases 为空 → 晋升失败
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: phases 为空 → 晋升失败');

{
  const mc = makeMC({ phases: [] });
  const result = core.promoteMechanismClass(mc);
  check('promoted = false', result.promoted === false, result.promoted);
  check('reason 含 phases', result.reason?.includes('phases'), result.reason);
}

// ──────────────────────────────────────────────────────────────────────────────
// T2：supporting_episode_ids < 2 → 晋升失败
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: supporting_episode_ids < 2 → 晋升失败');

{
  const mc = makeMC({ supporting_episode_ids: ['ep_only_one'] });
  const result = core.promoteMechanismClass(mc);
  check('promoted = false', result.promoted === false, result.promoted);
  check('reason 含 supporting_episode_ids', result.reason?.includes('supporting_episode_ids'), result.reason);
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：mechanismProgramIds 为空 → 晋升失败（P04 新增门控）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: mechanismProgramIds 为空 → 晋升失败');

{
  const mc = makeMC({ mechanismProgramIds: [] });
  const result = core.promoteMechanismClass(mc);
  check('promoted = false', result.promoted === false, result.promoted);
  check('reason 含 mechanismProgramIds', result.reason?.includes('mechanismProgramIds'), result.reason);
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：三个门控全部满足 → 晋升成功
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: 三个门控满足 → candidate 晋升为 compiled');

{
  const mc = makeMC(); // phases=1, supportingEpisodes=2, programs=1
  const result = core.promoteMechanismClass(mc);
  check('promoted = true', result.promoted === true, result.promoted);
  check('compilation_status = compiled', result.mechanism?.compilation_status === 'compiled', result.mechanism?.compilation_status);
  check('原对象不变（不可变语义）', mc.compilation_status === 'candidate', mc.compilation_status);
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：deprecateMechanismClass(compiled) → deprecated
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: deprecateMechanismClass(compiled) → deprecated');

{
  const mc = makeMC({ compilation_status: 'compiled' });
  const result = core.deprecateMechanismClass(mc);
  check('deprecated = true', result.deprecated === true, result.deprecated);
  check('compilation_status = deprecated', result.mechanism?.compilation_status === 'deprecated', result.mechanism?.compilation_status);
  check('原对象不变（不可变语义）', mc.compilation_status === 'compiled', mc.compilation_status);
}

// ──────────────────────────────────────────────────────────────────────────────
// T6：deprecateMechanismClass(candidate) → 失败
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T6: deprecateMechanismClass(candidate) → 失败');

{
  const mc = makeMC({ compilation_status: 'candidate' });
  const result = core.deprecateMechanismClass(mc);
  check('deprecated = false', result.deprecated === false, result.deprecated);
  check('reason 含 compiled', result.reason?.includes('compiled'), result.reason);
}

// ──────────────────────────────────────────────────────────────────────────────
// T7：validateMechanismClass 不变量 6：compiled + no programs → 报错
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T7: validateMechanismClass 不变量 6 — compiled + mechanismProgramIds=[]');

{
  const mc = makeMC({ compilation_status: 'compiled', mechanismProgramIds: [] });
  const result = core.validateMechanismClass(mc);
  check('valid = false', result.valid === false, result.valid);
  check('errors 含不变量 6', result.errors.some(e => e.includes('不变量 6')), result.errors.join('; '));
}

// ──────────────────────────────────────────────────────────────────────────────
// T8：validateMechanismClass 合法 compiled（有 programs）→ 通过
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T8: validateMechanismClass 合法 compiled → 通过');

{
  const mc = makeMC({
    compilation_status: 'compiled',
    supporting_episode_ids: ['ep_a', 'ep_b'],
    mechanismProgramIds: ['MP_test_001'],
  });
  const result = core.validateMechanismClass(mc);
  check('valid = true', result.valid === true, result.valid);
  check('errors 为空', result.errors.length === 0, result.errors.join('; ') || 'none');
}

// ──────────────────────────────────────────────────────────────────────────────
// 汇总
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ MechanismClass promotion gate 验收全部通过！');
} else {
  console.log('\n❌ MechanismClass promotion gate 有失败项，请检查。');
  process.exit(1);
}
