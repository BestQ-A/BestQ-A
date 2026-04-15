/**
 * test-v7-mechanism-class-deproxy.mjs
 * 验收：MechanismClass de-proxy
 *
 * 目标：
 *   T1  recordFix() 产出的 mechanism_class_ref 不再依赖 proxy:*
 *   T2  默认 MechanismProgram.mechanismClassRef 为真实 MC_*
 *   T3  selectedMechanismIds 与 mechanism_class_ref 一致，且都为真实 MC_*
 */

import { CausalPipeline } from '../dist/core/pipeline.js';
import {
  createDefaultMechanismProgram,
  DEFAULT_MECHANISM_PROGRAM_ID,
} from '../dist/core/mechanism-program.js';

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

function isRealMechanismClassRef(ref) {
  return typeof ref === 'string' && /^MC_[A-Za-z0-9_]+(?:_[0-9a-f]{4})?$/.test(ref);
}

console.log('\n============================================================');
console.log('📦 T1: recordFix() 不再产出 proxy:* mechanism_class_ref');

{
  const pipeline = new CausalPipeline({ seedDefaults: false });
  const obs = pipeline.submitObservation({
    rawInput: 'deproxy test: service timeout under load',
    facts: [
      { pred: 'service', value: 'login' },
      { pred: 'error', value: 'timeout' },
      { pred: 'context', value: 'peak_load' },
    ],
  });

  const atomIds = obs.atoms.map(a => a.id);
  const fix = pipeline.recordFix({
    storyId: obs.story.id,
    fixDescription: 'increase backoff',
    chosenPathAtomIds: atomIds.length >= 2 ? atomIds : undefined,
  });

  check('recordFix() 返回 mechanism_class_ref', typeof fix.mechanismInstance.mechanism_class_ref === 'string', fix.mechanismInstance.mechanism_class_ref);
  check('recordFix() mechanism_class_ref 为真实 MC_*', isRealMechanismClassRef(fix.mechanismInstance.mechanism_class_ref), fix.mechanismInstance.mechanism_class_ref);
  check('recordFix() mechanism_class_ref 不再含 proxy:*', !String(fix.mechanismInstance.mechanism_class_ref).startsWith('proxy:'), fix.mechanismInstance.mechanism_class_ref);

  pipeline.close();
}

console.log('\n============================================================');
console.log('📦 T2: 默认 MechanismProgram.mechanismClassRef 为真实 MC_*');

{
  const prog = createDefaultMechanismProgram();
  check('createDefaultMechanismProgram().id 正确', prog.id === DEFAULT_MECHANISM_PROGRAM_ID, prog.id);
  check('默认程序 mechanismClassRef 为真实 MC_*', isRealMechanismClassRef(prog.mechanismClassRef), prog.mechanismClassRef);
  check('默认程序 mechanismClassRef 不再含 proxy:*', !prog.mechanismClassRef.startsWith('proxy:'), prog.mechanismClassRef);
}

console.log('\n============================================================');
console.log('📦 T3: selectedMechanismIds 与 mechanism_class_ref 一致且为真实 MC_*');

{
  const pipeline = new CausalPipeline({ seedDefaults: false });
  const obs = pipeline.submitObservation({
    rawInput: 'deproxy selectedMechanismIds test',
    facts: [
      { pred: 'subsystem', value: 'cache' },
      { pred: 'symptom', value: 'thrash' },
    ],
  });

  const fix = pipeline.recordFix({
    storyId: obs.story.id,
    fixDescription: 'adjust cache ttl',
  });

  const ids = fix.reconstruction.selectedMechanismIds;
  const ref = fix.mechanismInstance.mechanism_class_ref;

  check('selectedMechanismIds.length === 1', ids.length === 1, ids.length);
  check('selectedMechanismIds[0] === mechanism_class_ref', ids[0] === ref, `${ids[0]} vs ${ref}`);
  check('selectedMechanismIds[0] 为真实 MC_*', isRealMechanismClassRef(ids[0]), ids[0]);
  check('selectedMechanismIds[0] 不再含 proxy:*', !String(ids[0]).startsWith('proxy:'), ids[0]);

  pipeline.close();
}

console.log('\n============================================================');
console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, 共 ${pass + fail} 项`);

if (fail === 0) {
  console.log('\n✅ MechanismClass de-proxy 验收全部通过！');
} else {
  console.log('\n❌ MechanismClass de-proxy 仍未完成，请检查实现。');
  process.exit(1);
}
