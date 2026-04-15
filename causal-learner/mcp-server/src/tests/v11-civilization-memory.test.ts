/**
 * v11 CivilizationMemory 测试
 * 覆盖：FailureBoundaryArchive append-only + 边界查询、CounterexampleCommons 反例操作
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFailureBoundaryArchive,
  appendFailureRecord,
  queryRecordsByCostKind,
  queryRecordsByVariable,
  checkBoundaryViolation,
  type FailureCost,
  type BoundaryCondition,
} from '../core/failure-boundary-archive.js';
import {
  createCounterexampleCommons,
  appendCounterexample,
  markCounterexampleAbsorbed,
  searchActiveCounterexamples,
  searchBySeverity,
} from '../core/counterexample-commons.js';
import { FailureBoundaryArchiveStore } from '../core/failure-boundary-archive-store.js';

// =============================================================================
// 测试夹具
// =============================================================================

const safetyFailureCost: FailureCost = {
  kind: 'safety',
  magnitude: 9.5,
  unit: 'severity_score',
  description: '压力超限导致设备损坏',
};

const timeFailureCost: FailureCost = {
  kind: 'time',
  magnitude: 4,
  unit: 'hours',
  description: '停机 4 小时修复',
};

const pressureBoundary: BoundaryCondition = {
  variableRef: 'pump_pressure',
  direction: 'above',
  thresholdValue: 5.0,
  description: '泵压超过 5.0 MPa 时触发失败',
};

const tempBoundary: BoundaryCondition = {
  variableRef: 'temperature',
  direction: 'outside_range',
  thresholdValue: 0,
  thresholdRange: [20, 80],
  description: '温度超出 20-80°C 正常范围',
};

// =============================================================================
// FailureBoundaryArchive 工厂
// =============================================================================

describe('FailureBoundaryArchive', () => {
  it('createFailureBoundaryArchive：初始 records 为空', () => {
    const archive = createFailureBoundaryArchive({
      name: '泵系统失败档案',
      description: '记录泵系统历史失败',
    });
    assert.equal(archive.records.length, 0);
    assert.ok(archive.id.startsWith('FBA_'));
    assert.equal(archive.status, 'draft');
  });
});

// =============================================================================
// appendFailureRecord — append-only 写入
// =============================================================================

describe('appendFailureRecord', () => {
  it('追加一条失败记录', () => {
    let archive = createFailureBoundaryArchive({ name: 'test', description: '' });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_001',
      description: '泵压超限导致密封件损坏',
      costs: [safetyFailureCost],
      boundaryConditions: [pressureBoundary],
    });
    assert.equal(archive.records.length, 1);
    assert.ok(archive.records[0].id.startsWith('FR_'));
    assert.equal(archive.records[0].episodeRef, 'EP_001');
  });

  it('多次追加，记录数递增', () => {
    let archive = createFailureBoundaryArchive({ name: 'test', description: '' });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_001',
      description: '第一次失败',
      costs: [safetyFailureCost],
      boundaryConditions: [pressureBoundary],
    });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_002',
      description: '第二次失败',
      costs: [timeFailureCost],
      boundaryConditions: [tempBoundary],
    });
    assert.equal(archive.records.length, 2);
  });

  it('append-only：原档案对象不变', () => {
    const original = createFailureBoundaryArchive({ name: 'test', description: '' });
    appendFailureRecord(original, {
      episodeRef: 'EP_001',
      description: 'test',
      costs: [safetyFailureCost],
      boundaryConditions: [pressureBoundary],
    });
    assert.equal(original.records.length, 0);  // 原对象不变
  });

  it('不变量 FR-I1：costs 为空时抛出', () => {
    const archive = createFailureBoundaryArchive({ name: 'test', description: '' });
    assert.throws(
      () => appendFailureRecord(archive, {
        episodeRef: 'EP_001',
        description: 'test',
        costs: [],
        boundaryConditions: [pressureBoundary],
      }),
      /FR-I1/
    );
  });

  it('不变量 FR-I2：boundaryConditions 为空时抛出', () => {
    const archive = createFailureBoundaryArchive({ name: 'test', description: '' });
    assert.throws(
      () => appendFailureRecord(archive, {
        episodeRef: 'EP_001',
        description: 'test',
        costs: [safetyFailureCost],
        boundaryConditions: [],
      }),
      /FR-I2/
    );
  });
});

// =============================================================================
// 边界查询
// =============================================================================

describe('queryRecordsByCostKind', () => {
  it('过滤 safety 代价记录', () => {
    let archive = createFailureBoundaryArchive({ name: 'test', description: '' });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_001',
      description: '安全失败',
      costs: [safetyFailureCost],
      boundaryConditions: [pressureBoundary],
    });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_002',
      description: '时间失败',
      costs: [timeFailureCost],
      boundaryConditions: [tempBoundary],
    });
    const safetyRecords = queryRecordsByCostKind(archive, 'safety');
    assert.equal(safetyRecords.length, 1);
    assert.equal(safetyRecords[0].episodeRef, 'EP_001');
  });

  it('无匹配代价类型 → 返回空数组', () => {
    let archive = createFailureBoundaryArchive({ name: 'test', description: '' });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_001',
      description: 'test',
      costs: [safetyFailureCost],
      boundaryConditions: [pressureBoundary],
    });
    assert.deepEqual(queryRecordsByCostKind(archive, 'epistemic'), []);
  });
});

describe('queryRecordsByVariable', () => {
  it('按变量 ref 过滤边界条件', () => {
    let archive = createFailureBoundaryArchive({ name: 'test', description: '' });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_001',
      description: 'pressure failure',
      costs: [safetyFailureCost],
      boundaryConditions: [pressureBoundary],
    });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_002',
      description: 'temperature failure',
      costs: [timeFailureCost],
      boundaryConditions: [tempBoundary],
    });
    const pressureRecords = queryRecordsByVariable(archive, 'pump_pressure');
    assert.equal(pressureRecords.length, 1);
    assert.equal(pressureRecords[0].episodeRef, 'EP_001');
  });
});

describe('checkBoundaryViolation', () => {
  let archive = createFailureBoundaryArchive({ name: 'test', description: '' });
  archive = appendFailureRecord(archive, {
    episodeRef: 'EP_001',
    description: 'pressure failure',
    costs: [safetyFailureCost],
    boundaryConditions: [pressureBoundary],  // above 5.0
  });
  archive = appendFailureRecord(archive, {
    episodeRef: 'EP_002',
    description: 'temperature failure',
    costs: [timeFailureCost],
    boundaryConditions: [tempBoundary],  // outside [20, 80]
  });

  it('压力 6.0 > 5.0 触发边界违规', () => {
    const violations = checkBoundaryViolation(archive, 'pump_pressure', 6.0);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].episodeRef, 'EP_001');
  });

  it('压力 4.9 < 5.0 不触发违规', () => {
    const violations = checkBoundaryViolation(archive, 'pump_pressure', 4.9);
    assert.equal(violations.length, 0);
  });

  it('温度 15 < 20（outside range）触发违规', () => {
    const violations = checkBoundaryViolation(archive, 'temperature', 15);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].episodeRef, 'EP_002');
  });

  it('温度 50 在范围内不触发违规', () => {
    const violations = checkBoundaryViolation(archive, 'temperature', 50);
    assert.equal(violations.length, 0);
  });

  it('未知变量 → 无违规', () => {
    const violations = checkBoundaryViolation(archive, 'flow_rate', 999);
    assert.equal(violations.length, 0);
  });
});

// =============================================================================
// CounterexampleCommons
// =============================================================================

describe('CounterexampleCommons', () => {
  it('createCounterexampleCommons：初始 entries 为空', () => {
    const cc = createCounterexampleCommons({ name: '反例库', description: '' });
    assert.equal(cc.entries.length, 0);
    assert.ok(cc.id.startsWith('CC_'));
  });

  it('appendCounterexample：追加反例', () => {
    let cc = createCounterexampleCommons({ name: '反例库', description: '' });
    cc = appendCounterexample(cc, {
      refutedClaimRef: 'MC_PumpFailure',
      description: '在低压下泵也出现故障，与 MC_PumpFailure 假设矛盾',
      evidenceRefs: ['EP_003', 'EP_007'],
      triggerContext: 'pressure < 1.0 MPa',
      severity: 'moderate',
    });
    assert.equal(cc.entries.length, 1);
    assert.equal(cc.entries[0].absorbed, false);
    assert.equal(cc.entries[0].severity, 'moderate');
  });

  it('不变量 CE-I1：evidenceRefs 为空时抛出', () => {
    const cc = createCounterexampleCommons({ name: '反例库', description: '' });
    assert.throws(
      () => appendCounterexample(cc, {
        refutedClaimRef: 'MC_test',
        description: 'test',
        evidenceRefs: [],
        triggerContext: 'test',
        severity: 'minor',
      }),
      /CE-I1/
    );
  });

  it('appendCounterexample 是 immutable update', () => {
    const cc = createCounterexampleCommons({ name: '反例库', description: '' });
    appendCounterexample(cc, {
      refutedClaimRef: 'MC_x',
      description: 'test',
      evidenceRefs: ['EP_001'],
      triggerContext: 'test',
      severity: 'minor',
    });
    assert.equal(cc.entries.length, 0);  // 原对象不变
  });
});

describe('searchActiveCounterexamples', () => {
  let cc = createCounterexampleCommons({ name: '反例库', description: '' });
  cc = appendCounterexample(cc, {
    refutedClaimRef: 'MC_PumpFailure',
    description: '反例 A',
    evidenceRefs: ['EP_001'],
    triggerContext: 'low pressure',
    severity: 'moderate',
  });
  cc = appendCounterexample(cc, {
    refutedClaimRef: 'MC_PumpFailure',
    description: '反例 B',
    evidenceRefs: ['EP_002'],
    triggerContext: 'high temp',
    severity: 'critical',
  });
  cc = appendCounterexample(cc, {
    refutedClaimRef: 'MC_HeaterFailure',
    description: '反例 C',
    evidenceRefs: ['EP_003'],
    triggerContext: 'test',
    severity: 'minor',
  });

  it('搜索 MC_PumpFailure 的活跃反例', () => {
    const results = searchActiveCounterexamples(cc, 'MC_PumpFailure');
    assert.equal(results.length, 2);
  });

  it('标记吸收后搜索结果减少', () => {
    const entryId = cc.entries[0].id;
    const cc2 = markCounterexampleAbsorbed(cc, entryId, '理论已更新为 MC_PumpFailure_v2');
    const results = searchActiveCounterexamples(cc2, 'MC_PumpFailure');
    assert.equal(results.length, 1);
    assert.equal(cc2.entries[0].absorbed, true);
    assert.equal(cc2.entries[0].absorptionNote, '理论已更新为 MC_PumpFailure_v2');
  });

  it('按严重程度过滤：critical', () => {
    const results = searchBySeverity(cc, 'critical');
    assert.equal(results.length, 1);
    assert.equal(results[0].description, '反例 B');
  });
});

// =============================================================================
// FailureBoundaryArchiveStore 持久化
// =============================================================================

describe('FailureBoundaryArchiveStore', () => {
  it('save + get 往返一致', () => {
    const store = new FailureBoundaryArchiveStore(':memory:');
    let archive = createFailureBoundaryArchive({
      id: 'FBA_test',
      name: '测试档案',
      description: '',
    });
    archive = appendFailureRecord(archive, {
      episodeRef: 'EP_001',
      description: 'test',
      costs: [safetyFailureCost],
      boundaryConditions: [pressureBoundary],
    });
    store.save(archive);
    const retrieved = store.get('FBA_test');
    assert.ok(retrieved !== null);
    assert.equal(retrieved.records.length, 1);
    assert.equal(retrieved.records[0].episodeRef, 'EP_001');
    store.close();
  });

  it('listAll 返回已保存对象', () => {
    const store = new FailureBoundaryArchiveStore(':memory:');
    const a1 = createFailureBoundaryArchive({ id: 'FBA_1', name: 'a1', description: '' });
    const a2 = createFailureBoundaryArchive({ id: 'FBA_2', name: 'a2', description: '' });
    store.save(a1);
    store.save(a2);
    assert.equal(store.listAll().length, 2);
    store.close();
  });

  it('get 不存在 ID 返回 null', () => {
    const store = new FailureBoundaryArchiveStore(':memory:');
    assert.equal(store.get('FBA_nonexistent'), null);
    store.close();
  });
});
