/**
 * v10 ParticipativeWorld 测试
 * 覆盖：ObserverModel 盲区过滤 + 仪器偏差、InstitutionModel 权限检查
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createObserverModel,
  filterObservations,
  applyInstrumentBias,
} from '../core/observer-model.js';
import {
  createInstitutionModel,
  checkRolePermission,
  type InstitutionRule,
} from '../core/institution-model.js';
import { ObserverModelStore } from '../core/observer-model-store.js';

// =============================================================================
// 测试夹具
// =============================================================================

/** 地面站观察者：有盲区（latent_heat, pump_rpm）和系统偏差 */
const groundObserver = createObserverModel({
  id: 'OBS_ground',
  name: '地面站观察者',
  description: '地面站传感器，对内部温度有盲区',
  position: '地面站 A-3 位置',
  instrumentBiases: [
    {
      signalKey: 'temperature',
      biasKind: 'systematic',
      magnitude: 2.5,
      description: '温度传感器系统偏差 +2.5°C',
    },
  ],
  blindZoneSignalKeys: ['latent_heat', 'pump_rpm'],
});

/** 内部探头观察者：无盲区 */
const internalProbe = createObserverModel({
  id: 'OBS_internal',
  name: '内部探头',
  description: '直接接触内部组件，无盲区',
  position: '泵内部探头',
  blindZoneSignalKeys: [],
});

/** 制度模型：工厂操作规范 */
const factoryRules: InstitutionRule[] = [
  {
    id: 'RULE_shutdown',
    description: '紧急关机只允许安全工程师和管理员',
    constrainedActionKind: 'emergency_shutdown',
    allowedRoles: ['safety_engineer', 'admin'],
    forbiddenRoles: [],
    priority: 10,
  },
  {
    id: 'RULE_read',
    description: '数据读取所有角色均可',
    constrainedActionKind: 'read_sensor',
    allowedRoles: [],
    forbiddenRoles: [],
    priority: 5,
  },
  {
    id: 'RULE_no_override',
    description: '实习生禁止覆写校准参数',
    constrainedActionKind: 'calibrate',
    allowedRoles: ['senior_engineer', 'admin'],
    forbiddenRoles: ['intern'],
    priority: 8,
  },
];

const factory = createInstitutionModel({
  id: 'IM_factory',
  name: '工厂操作规范',
  description: '管理工厂操作权限的制度模型',
  rules: factoryRules,
  roleAssignments: [
    { agentRef: 'agent_alice', role: 'safety_engineer' },
    { agentRef: 'agent_bob',   role: 'intern' },
    { agentRef: 'agent_carol', role: 'senior_engineer' },
  ],
});

// =============================================================================
// ObserverModel 工厂
// =============================================================================

describe('ObserverModel', () => {
  it('正常创建并校验字段', () => {
    assert.equal(groundObserver.id, 'OBS_ground');
    assert.equal(groundObserver.blindZoneSignalKeys.length, 2);
    assert.equal(groundObserver.instrumentBiases.length, 1);
    assert.equal(groundObserver.status, 'draft');
  });

  it('blindZoneSignalKeys 默认为空数组', () => {
    const obs = createObserverModel({
      name: 'test',
      description: '',
      position: 'remote',
    });
    assert.deepEqual(obs.blindZoneSignalKeys, []);
  });

  it('instrumentBiases 默认为空数组', () => {
    assert.deepEqual(internalProbe.instrumentBiases, []);
  });
});

// =============================================================================
// filterObservations — 盲区过滤
// =============================================================================

describe('filterObservations', () => {
  const signals = {
    temperature: 85.0,
    pressure: 3.2,
    latent_heat: 420.0,
    pump_rpm: 1500,
    flow_rate: 12.5,
  };

  it('地面站观察者：过滤掉 latent_heat 和 pump_rpm', () => {
    const result = filterObservations(groundObserver, signals);
    assert.ok(!('latent_heat' in result.filtered));
    assert.ok(!('pump_rpm' in result.filtered));
    assert.equal(result.removedKeys.length, 2);
    assert.ok(result.removedKeys.includes('latent_heat'));
    assert.ok(result.removedKeys.includes('pump_rpm'));
  });

  it('地面站观察者：保留非盲区信号', () => {
    const result = filterObservations(groundObserver, signals);
    assert.equal(result.filtered.temperature, 85.0);
    assert.equal(result.filtered.pressure, 3.2);
    assert.equal(result.filtered.flow_rate, 12.5);
  });

  it('内部探头：无盲区，所有信号保留', () => {
    const result = filterObservations(internalProbe, signals);
    assert.equal(result.removedKeys.length, 0);
    assert.equal(Object.keys(result.filtered).length, 5);
  });

  it('filterObservations 是纯函数，不修改原始 signals', () => {
    const original = { temperature: 100, latent_heat: 500 };
    filterObservations(groundObserver, original);
    assert.equal(original.latent_heat, 500);  // 原对象不变
  });

  it('信号 map 为空时返回空 filtered', () => {
    const result = filterObservations(groundObserver, {});
    assert.equal(result.removedKeys.length, 0);
    assert.deepEqual(result.filtered, {});
  });
});

// =============================================================================
// applyInstrumentBias — 仪器偏差
// =============================================================================

describe('applyInstrumentBias', () => {
  it('系统偏差：temperature += 2.5', () => {
    const signals = { temperature: 80.0, pressure: 3.0 };
    const result = applyInstrumentBias(groundObserver, signals);
    assert.equal(result.temperature, 82.5);
    assert.equal(result.pressure, 3.0);  // 无偏差
  });

  it('无偏差的观察者：信号不变', () => {
    const signals = { temperature: 80.0, pump_rpm: 1500 };
    const result = applyInstrumentBias(internalProbe, signals);
    assert.deepEqual(result, signals);
  });

  it('applyInstrumentBias 是纯函数，不修改原始 signals', () => {
    const original = { temperature: 80.0 };
    applyInstrumentBias(groundObserver, original);
    assert.equal(original.temperature, 80.0);  // 原对象不变
  });

  it('非数值型信号不受偏差影响', () => {
    const obs = createObserverModel({
      name: 'str_bias',
      description: '',
      position: 'test',
      instrumentBiases: [{
        signalKey: 'status',
        biasKind: 'systematic',
        magnitude: 1,
        description: 'test',
      }],
    });
    const signals = { status: 'ok' };
    const result = applyInstrumentBias(obs, signals);
    assert.equal(result.status, 'ok');  // 字符串不做数值加法
  });
});

// =============================================================================
// InstitutionModel 工厂 + 权限检查
// =============================================================================

describe('InstitutionModel', () => {
  it('正常创建并校验字段', () => {
    assert.equal(factory.id, 'IM_factory');
    assert.equal(factory.rules.length, 3);
    assert.equal(factory.roleAssignments.length, 3);
  });

  it('不变量 I1：rules 为空时抛出', () => {
    assert.throws(
      () => createInstitutionModel({ name: 'empty', description: '', rules: [] }),
      /不变量 I1/
    );
  });
});

describe('checkRolePermission', () => {
  it('alice（safety_engineer）可以执行 emergency_shutdown', () => {
    const result = checkRolePermission(factory, 'agent_alice', 'emergency_shutdown');
    assert.equal(result.allowed, true);
    assert.equal(result.matchedRule?.id, 'RULE_shutdown');
  });

  it('bob（intern）不能执行 emergency_shutdown（不在 allowedRoles）', () => {
    const result = checkRolePermission(factory, 'agent_bob', 'emergency_shutdown');
    assert.equal(result.allowed, false);
  });

  it('所有角色都能执行 read_sensor（allowedRoles 为空）', () => {
    const resultAlice = checkRolePermission(factory, 'agent_alice', 'read_sensor');
    const resultBob   = checkRolePermission(factory, 'agent_bob',   'read_sensor');
    assert.equal(resultAlice.allowed, true);
    assert.equal(resultBob.allowed,   true);
  });

  it('bob（intern）被禁止执行 calibrate', () => {
    const result = checkRolePermission(factory, 'agent_bob', 'calibrate');
    assert.equal(result.allowed, false);
    assert.equal(result.matchedRule?.id, 'RULE_no_override');
  });

  it('carol（senior_engineer）可以执行 calibrate', () => {
    const result = checkRolePermission(factory, 'agent_carol', 'calibrate');
    assert.equal(result.allowed, true);
  });

  it('未知动作类型 → 默认允许（开放世界假设）', () => {
    const result = checkRolePermission(factory, 'agent_bob', 'unknown_action');
    assert.equal(result.allowed, true);
    assert.equal(result.matchedRule, null);
  });

  it('无角色分配的 Agent → 默认允许 read_sensor', () => {
    const result = checkRolePermission(factory, 'agent_unknown', 'read_sensor');
    assert.equal(result.allowed, true);
  });
});

// =============================================================================
// ObserverModelStore 持久化
// =============================================================================

describe('ObserverModelStore', () => {
  it('save + get 往返一致', () => {
    const store = new ObserverModelStore(':memory:');
    store.save(groundObserver);
    const retrieved = store.get('OBS_ground');
    assert.ok(retrieved !== null);
    assert.equal(retrieved.name, '地面站观察者');
    assert.equal(retrieved.blindZoneSignalKeys.length, 2);
    store.close();
  });

  it('listAll 返回已保存对象', () => {
    const store = new ObserverModelStore(':memory:');
    store.save(groundObserver);
    store.save(internalProbe);
    const all = store.listAll();
    assert.equal(all.length, 2);
    store.close();
  });

  it('get 不存在 ID 返回 null', () => {
    const store = new ObserverModelStore(':memory:');
    assert.equal(store.get('OBS_nonexistent'), null);
    store.close();
  });
});
