/**
 * test-v8-validity-envelope.mjs
 * 验收：ValidityEnvelope runtime/store first pass（P05）
 *
 * T1：对象与 store 表面存在（导出正确）
 * T2：工厂不变量（缺关键字段抛错）
 * T3：store 基本操作（save/get/listByMechanismProgram/getStats）
 * T4：pipeline demo 绑定（默认 VE 已绑到 DEFAULT_MECHANISM_PROGRAM_ID）
 * T5：MechanismProgram 有 validityEnvelopeRefs 字段
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

function mustThrow(label, fn) {
  try { fn(); check(label, false, '未抛出异常'); } catch (e) { check(label, true, e.message.slice(0, 80)); }
}

async function importFromDist(moduleName) {
  return import(pathToFileURL(path.join(DIST_CORE, moduleName)).href);
}

const core = await importFromDist('index.js');

// ──────────────────────────────────────────────────────────────────────────────
// T1：对象与 store 表面存在
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T1: ValidityEnvelope object/store 表面存在');

check('导出 ValidityEnvelopeStore',
  typeof core.ValidityEnvelopeStore === 'function',
  typeof core.ValidityEnvelopeStore);
check('导出 createValidityEnvelope',
  typeof core.createValidityEnvelope === 'function',
  typeof core.createValidityEnvelope);
check('导出 assertValidValidityEnvelope',
  typeof core.assertValidValidityEnvelope === 'function',
  typeof core.assertValidValidityEnvelope);
check('导出 DEFAULT_VALIDITY_ENVELOPE_ID',
  typeof core.DEFAULT_VALIDITY_ENVELOPE_ID === 'string',
  core.DEFAULT_VALIDITY_ENVELOPE_ID);
check('导出 createDefaultValidityEnvelope',
  typeof core.createDefaultValidityEnvelope === 'function',
  typeof core.createDefaultValidityEnvelope);

{
  const store = new core.ValidityEnvelopeStore(':memory:');
  const stats = store.getStats();
  check('Store 可实例化，getStats().total=0', stats.total === 0, stats.total);
  store.close();
}

// ──────────────────────────────────────────────────────────────────────────────
// T2：工厂不变量
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T2: 工厂不变量');

const validBase = {
  mechanismProgramRef: 'MP_test_001',
  requiredPreconditions: ['condition A'],
  confidenceBand: 'medium',
  rationale: 'test rationale for P05',
};

mustThrow('mechanismProgramRef 为空抛错', () =>
  core.createValidityEnvelope({ ...validBase, mechanismProgramRef: '' }));

mustThrow('requiredPreconditions 与 invalidatingConditions 同时为空抛错', () =>
  core.createValidityEnvelope({
    ...validBase,
    requiredPreconditions: [],
    invalidatingConditions: [],
  }));

mustThrow('confidenceBand 非法值抛错', () =>
  core.createValidityEnvelope({ ...validBase, confidenceBand: 'unknown_band' }));

mustThrow('rationale 为空抛错', () =>
  core.createValidityEnvelope({ ...validBase, rationale: '   ' }));

{
  let ve = null;
  try {
    ve = core.createValidityEnvelope(validBase);
  } catch (e) {
    check('合法输入不抛错', false, e.message);
  }
  if (ve !== null) {
    check('合法输入不抛错', true);
    check('id 以 VE_ 开头', ve.id.startsWith('VE_'), ve.id);
    check('status 默认 draft', ve.status === 'draft', ve.status);
    check('confidenceBand 正确', ve.confidenceBand === 'medium', ve.confidenceBand);
    check('只有 requiredPreconditions（invalidatingConditions 可空）', true);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// T3：store 基本操作
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T3: Store save/get/listByMechanismProgram/getStats');

{
  const store = new core.ValidityEnvelopeStore(':memory:');

  const ve1 = core.createValidityEnvelope({
    mechanismProgramRef: 'MP_foo',
    requiredPreconditions: ['req_a'],
    confidenceBand: 'broad',
    rationale: 'test ve1',
  });
  const ve2 = core.createValidityEnvelope({
    mechanismProgramRef: 'MP_foo',
    invalidatingConditions: ['inv_b'],
    confidenceBand: 'narrow',
    rationale: 'test ve2',
  });
  const ve3 = core.createValidityEnvelope({
    mechanismProgramRef: 'MP_bar',
    requiredPreconditions: ['req_c'],
    confidenceBand: 'medium',
    rationale: 'test ve3',
  });

  store.save(ve1);
  store.save(ve2);
  store.save(ve3);

  const fromStore = store.get(ve1.id);
  check('get() 可回查', fromStore?.id === ve1.id, fromStore?.id);

  const byFoo = store.listByMechanismProgram('MP_foo');
  check('listByMechanismProgram(MP_foo) 返回 2 条', byFoo.length === 2, byFoo.length);

  const byBar = store.listByMechanismProgram('MP_bar');
  check('listByMechanismProgram(MP_bar) 返回 1 条', byBar.length === 1, byBar.length);

  const stats = store.getStats();
  check('getStats().total = 3', stats.total === 3, stats.total);
  check('byConfidenceBand 含 broad', (stats.byConfidenceBand?.broad ?? 0) >= 1,
    JSON.stringify(stats.byConfidenceBand));
  check('byStatus 含 draft', (stats.byStatus?.draft ?? 0) >= 1,
    JSON.stringify(stats.byStatus));

  store.close();
}

// ──────────────────────────────────────────────────────────────────────────────
// T4：pipeline demo 绑定（默认 VE 已绑到 DEFAULT_MECHANISM_PROGRAM_ID）
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T4: pipeline demo 绑定 — 默认 VE 绑到 DEFAULT_MECHANISM_PROGRAM_ID');

{
  const pipeline = new core.CausalPipeline({ seedDefaults: false });

  const defaultVE = pipeline.validityEnvelopes.get(core.DEFAULT_VALIDITY_ENVELOPE_ID);
  check('pipeline.validityEnvelopes.get(DEFAULT_VALIDITY_ENVELOPE_ID) 存在',
    defaultVE !== null, defaultVE?.id ?? 'null');
  check('默认 VE.mechanismProgramRef = DEFAULT_MECHANISM_PROGRAM_ID',
    defaultVE?.mechanismProgramRef === core.DEFAULT_MECHANISM_PROGRAM_ID,
    defaultVE?.mechanismProgramRef);
  check('默认 VE.status = current', defaultVE?.status === 'current', defaultVE?.status);
  check('默认 VE.confidenceBand = narrow', defaultVE?.confidenceBand === 'narrow', defaultVE?.confidenceBand);

  const veStats = pipeline.validityEnvelopes.getStats();
  check('pipeline.validityEnvelopes.getStats().total >= 1', veStats.total >= 1, veStats.total);

  const byMP = pipeline.validityEnvelopes.listByMechanismProgram(core.DEFAULT_MECHANISM_PROGRAM_ID);
  check('listByMechanismProgram(DEFAULT_MP) >= 1', byMP.length >= 1, byMP.length);

  pipeline.close();
}

// ──────────────────────────────────────────────────────────────────────────────
// T5：MechanismProgram 有 validityEnvelopeRefs 字段
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log('📦 T5: MechanismProgram.validityEnvelopeRefs 字段存在');

{
  const mp = core.createMechanismProgram({
    mechanismClassRef: 'MC_test_0000',
    name: 'test_mp',
    description: 'test',
    phases: [{ name: 'p1', expectedStateChanges: [], expectedObservations: [] }],
    validityEnvelopeRefs: ['VE_test_001'],
  });
  check('createMechanismProgram 接受 validityEnvelopeRefs',
    Array.isArray(mp.validityEnvelopeRefs), typeof mp.validityEnvelopeRefs);
  check('validityEnvelopeRefs 值正确',
    mp.validityEnvelopeRefs[0] === 'VE_test_001', mp.validityEnvelopeRefs[0]);

  const mpDefault = core.createMechanismProgram({
    mechanismClassRef: 'MC_test_0000',
    name: 'test_mp_no_ve_refs',
    description: 'test',
    phases: [{ name: 'p1', expectedStateChanges: [], expectedObservations: [] }],
  });
  check('不传 validityEnvelopeRefs 默认为空数组',
    Array.isArray(mpDefault.validityEnvelopeRefs) && mpDefault.validityEnvelopeRefs.length === 0,
    mpDefault.validityEnvelopeRefs?.length);
}

// ──────────────────────────────────────────────────────────────────────────────
// 汇总
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ ValidityEnvelope first pass 验收全部通过！');
} else {
  console.log('\n❌ ValidityEnvelope first pass 有失败项，请检查。');
  process.exit(1);
}
