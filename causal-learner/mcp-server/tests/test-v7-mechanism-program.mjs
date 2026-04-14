/**
 * test-v7-mechanism-program.mjs
 * 验收：MechanismProgram 持久化 + MechanismInstance bridge（Patch Brief 7）
 *
 * 测试覆盖：
 *   T1  MechanismProgramStore CRUD（save / get / listAll / listByMechanismClassRef / getStats）
 *   T2  createMechanismProgram() 工厂不变量（phases 非空、emittedObservationSignals 覆盖）
 *   T3  默认 MechanismProgram 能被 pipeline 幂等写入
 *   T4  MechanismInstance.mechanism_program_ref 若填入，应能 resolve 到 program
 */

import { CausalPipeline } from '../dist/core/pipeline.js';
import { MechanismProgramStore } from '../dist/core/mechanism-program-store.js';
import {
  createMechanismProgram,
  createDefaultMechanismProgram,
  DEFAULT_MECHANISM_PROGRAM_ID,
} from '../dist/core/mechanism-program.js';
import {
  createMechanismInstance,
  acceptInstance,
} from '../dist/core/mechanism-instance.js';

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

// ---------------------------------------------------------------------------
// T1: MechanismProgramStore CRUD
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T1: MechanismProgramStore CRUD');

{
  const store = new MechanismProgramStore(':memory:');

  const prog = createMechanismProgram({
    id: 'MP_test_001',
    mechanismClassRef: 'MC_test_sensor_a1b2',
    name: 'test_sensor_program',
    description: '测试用传感器机制程序',
    phases: [
      {
        name: 'trigger_phase',
        expectedStateChanges: ['sensor_state → active'],
        expectedObservations: ['sensor_reading', 'timestamp'],
      },
      {
        name: 'propagation_phase',
        expectedStateChanges: ['downstream_state → affected'],
        expectedObservations: ['downstream_value'],
        thresholdTriggers: ['reading > threshold'],
      },
    ],
    emittedObservationSignals: ['sensor_reading', 'timestamp', 'downstream_value'],
    outcomes: ['sensor_confirmed', 'sensor_rejected'],
    interventionPoints: ['trigger_phase', 'propagation_phase'],
    failsWhen: ['sensor_offline', 'reading_timeout'],
    createdBy: 'test_runner',
    status: 'draft',
  });
  store.save(prog);

  const retrieved = store.get('MP_test_001');
  check('get() 能取回已保存的 MechanismProgram', retrieved !== null);
  check('get().id 正确', retrieved?.id === 'MP_test_001', retrieved?.id);
  check('get().name 正确', retrieved?.name === 'test_sensor_program', retrieved?.name);
  check('get().mechanismClassRef 正确', retrieved?.mechanismClassRef === 'MC_test_sensor_a1b2', retrieved?.mechanismClassRef);
  check('get().status 正确', retrieved?.status === 'draft', retrieved?.status);
  check('get().phases 长度为 2', retrieved?.phases.length === 2, retrieved?.phases.length);
  check('get().emittedObservationSignals 长度为 3', retrieved?.emittedObservationSignals.length === 3, retrieved?.emittedObservationSignals.length);
  check('get().failsWhen 不为 null', Array.isArray(retrieved?.failsWhen));
  check('get().failsWhen 长度为 2', retrieved?.failsWhen.length === 2, retrieved?.failsWhen.length);

  // listAll
  const all = store.listAll();
  check('listAll() 返回 1 条', all.length === 1, all.length);

  // listByMechanismClassRef
  const byClass = store.listByMechanismClassRef('MC_test_sensor_a1b2');
  check('listByMechanismClassRef() 返回 1 条', byClass.length === 1, byClass.length);
  check('listByMechanismClassRef() 未知 ref 返回空数组', store.listByMechanismClassRef('MC_unknown').length === 0);

  // getStats
  const stats = store.getStats();
  check('getStats().total === 1', stats.total === 1, stats.total);
  check("getStats().byStatus['draft'] === 1", stats.byStatus['draft'] === 1, stats.byStatus['draft']);

  // INSERT OR REPLACE（幂等更新）
  const updated = { ...prog, status: 'current' };
  store.save(updated);
  check('save() 幂等更新后 total 仍为 1', store.listAll().length === 1);
  check("save() 幂等更新后 status === 'current'", store.get('MP_test_001')?.status === 'current', store.get('MP_test_001')?.status);

  store.close();
}

// ---------------------------------------------------------------------------
// T2: createMechanismProgram() 工厂不变量
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T2: createMechanismProgram() 工厂不变量');

{
  // 不变量 I1：phases 非空
  let threwI1 = false;
  try {
    createMechanismProgram({
      mechanismClassRef: 'proxy:test',
      name: 'empty_phases',
      description: '无 phase 的程序',
      phases: [],
    });
  } catch { threwI1 = true; }
  check('phases 为空时工厂抛错（不变量 I1）', threwI1);

  // 不变量 I2：emittedObservationSignals 覆盖所有 phase.expectedObservations
  let threwI2 = false;
  try {
    createMechanismProgram({
      mechanismClassRef: 'proxy:test',
      name: 'missing_signal',
      description: '缺少 signal 覆盖',
      phases: [
        {
          name: 'phase_a',
          expectedStateChanges: [],
          expectedObservations: ['sig_x', 'sig_y'],
        },
      ],
      emittedObservationSignals: ['sig_x'],  // 缺少 sig_y
    });
  } catch { threwI2 = true; }
  check('emittedObservationSignals 未覆盖 phase 信号时工厂抛错（不变量 I2）', threwI2);

  // 正常创建路径：emittedObservationSignals 自动推导（不传时取所有 phase 信号并集）
  const prog = createMechanismProgram({
    mechanismClassRef: 'proxy:test',
    name: 'auto_signals',
    description: '自动推导 emittedObservationSignals',
    phases: [
      {
        name: 'phase_a',
        expectedStateChanges: [],
        expectedObservations: ['sig_a'],
      },
      {
        name: 'phase_b',
        expectedStateChanges: [],
        expectedObservations: ['sig_b'],
      },
    ],
    // 不传 emittedObservationSignals，工厂自动推导
  });
  check('未传 emittedObservationSignals 时自动推导', prog.emittedObservationSignals.includes('sig_a') && prog.emittedObservationSignals.includes('sig_b'));
  check('自动推导后 phases 长度正确', prog.phases.length === 2, prog.phases.length);
  check('failsWhen 默认为空数组（不变量 I5）', Array.isArray(prog.failsWhen) && prog.failsWhen.length === 0);

  // 默认 status = 'draft'
  check("status 默认值为 'draft'", prog.status === 'draft', prog.status);

  // id 自动生成 MP_ 前缀
  check('id 自动生成 MP_* 前缀', prog.id.startsWith('MP_'), prog.id);
}

// ---------------------------------------------------------------------------
// T3: 默认 MechanismProgram 能被 pipeline 幂等写入
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T3: 默认 MechanismProgram pipeline 幂等写入');

{
  // 第一次构建
  const pipeline1 = new CausalPipeline({ seedDefaults: false });
  const mp1 = pipeline1.mechanismPrograms.get(DEFAULT_MECHANISM_PROGRAM_ID);
  check('pipeline 构建后默认 MechanismProgram 已写入', mp1 !== null);
  check('默认程序 id === DEFAULT_MECHANISM_PROGRAM_ID', mp1?.id === DEFAULT_MECHANISM_PROGRAM_ID, mp1?.id);
  check("默认程序 status === 'current'", mp1?.status === 'current', mp1?.status);
  check('默认程序 phases 非空', (mp1?.phases.length ?? 0) > 0, mp1?.phases.length);
  check('默认程序 emittedObservationSignals 非空', (mp1?.emittedObservationSignals.length ?? 0) > 0, mp1?.emittedObservationSignals.length);
  check('默认程序 failsWhen 不为 null', Array.isArray(mp1?.failsWhen));
  pipeline1.close();

  // 验证 createDefaultMechanismProgram() 独立工厂
  const defaultProg = createDefaultMechanismProgram();
  check('createDefaultMechanismProgram().id 正确', defaultProg.id === DEFAULT_MECHANISM_PROGRAM_ID, defaultProg.id);
  check("createDefaultMechanismProgram().status === 'current'", defaultProg.status === 'current', defaultProg.status);
  check('createDefaultMechanismProgram().mechanismClassRef 是 proxy:*', defaultProg.mechanismClassRef.startsWith('proxy:'), defaultProg.mechanismClassRef);

  // getStats 包含 mechanismPrograms
  const pipeline2 = new CausalPipeline({ seedDefaults: false });
  const stats = pipeline2.getStats();
  check('getStats().mechanismPrograms 存在', stats.mechanismPrograms !== undefined);
  check('getStats().mechanismPrograms.total >= 1', stats.mechanismPrograms.total >= 1, stats.mechanismPrograms.total);
  pipeline2.close();
}

// ---------------------------------------------------------------------------
// T4: MechanismInstance.mechanism_program_ref 若填入，应能 resolve
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('📦 T4: MechanismInstance.mechanism_program_ref bridge 验证');

{
  const store = new MechanismProgramStore(':memory:');
  const prog = createDefaultMechanismProgram();
  store.save(prog);

  // 创建带 mechanism_program_ref 的 MechanismInstance
  const mi = createMechanismInstance({
    episode_id: 'ep_t4_test_001',
    mechanism_class_ref: 'proxy:test_class',
    mechanism_program_ref: DEFAULT_MECHANISM_PROGRAM_ID,
    bindings: { slot_0: 'atom_001', slot_1: 'atom_002' },
    source_kind: 'path_projection',
    claim_ids: ['hyp_t4_001'],
  });

  check('createMechanismInstance 含 mechanism_program_ref', mi.mechanism_program_ref === DEFAULT_MECHANISM_PROGRAM_ID, mi.mechanism_program_ref);
  check('mechanism_program_ref 能在 store 中解析', store.get(mi.mechanism_program_ref ?? '') !== null);
  check('解析出的 program id 正确', store.get(mi.mechanism_program_ref ?? '')?.id === DEFAULT_MECHANISM_PROGRAM_ID);

  // acceptInstance 后 mechanism_program_ref 仍然保留
  const accepted = acceptInstance(mi, { claim_ids: ['hyp_t4_001'] });
  check("acceptInstance 后 status === 'accepted'", accepted.status === 'accepted', accepted.status);
  check('acceptInstance 后 mechanism_program_ref 仍存在', accepted.mechanism_program_ref === DEFAULT_MECHANISM_PROGRAM_ID, accepted.mechanism_program_ref);

  // pipeline 路径：recordFix 产出的 MechanismInstance 应含 mechanism_program_ref
  const pipeline = new CausalPipeline({ seedDefaults: true });
  const obs = pipeline.submitObservation({
    rawInput: 'T4 测试：阀门压力超限',
    facts: [
      { pred: 'valve',    value: 'pressure_valve_1' },
      { pred: 'pressure', value: 'overflow' },
      { pred: 'severity', value: 'high' },
    ],
  });
  const atomIds = obs.atoms.map(a => a.id);
  const fix = pipeline.recordFix({
    storyId: obs.story.id,
    fixDescription: '调整阀门压力阈值',
    chosenPathAtomIds: atomIds.length >= 2 ? atomIds : undefined,
  });
  const mi2 = fix.mechanismInstance;
  check('pipeline.recordFix() MI 含 mechanism_program_ref', typeof mi2.mechanism_program_ref === 'string' && mi2.mechanism_program_ref.length > 0, mi2.mechanism_program_ref);
  check('pipeline.recordFix() MI.mechanism_program_ref === DEFAULT_MECHANISM_PROGRAM_ID', mi2.mechanism_program_ref === DEFAULT_MECHANISM_PROGRAM_ID, mi2.mechanism_program_ref);
  // 验证能从 pipeline.mechanismPrograms store 中解析
  const resolvedProg = pipeline.mechanismPrograms.get(mi2.mechanism_program_ref ?? '');
  check('pipeline MI.mechanism_program_ref 能在 pipeline.mechanismPrograms 中解析', resolvedProg !== null);
  check('解析出的 program.mechanismClassRef 是 proxy:*', resolvedProg?.mechanismClassRef.startsWith('proxy:') ?? false, resolvedProg?.mechanismClassRef);

  pipeline.close();
  store.close();
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ v7 MechanismProgram 持久化与接线验收全部通过！');
} else {
  console.log('\n❌ 存在失败项，请检查！');
  process.exit(1);
}
