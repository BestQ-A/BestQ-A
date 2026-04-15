/**
 * FailureBoundaryArchive — v11 失败边界档案
 * implements: docs/current/civilization-memory-contract.md
 *
 * 记录已知的失败案例、失败代价和边界条件。
 * 语义上 append-only：条目一经写入不可修改，只可追加。
 * "文明不应重复同一错误"——可查询历史失败的边界条件。
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

/** 失败代价量化 */
export interface FailureCost {
  /** 代价类型 */
  kind: 'resource' | 'time' | 'safety' | 'epistemic' | 'reputational';
  /** 量化值（可选，具体含义依 kind 而定） */
  magnitude?: number;
  /** 单位（可选） */
  unit?: string;
  /** 文字说明 */
  description: string;
}

/** 边界条件（触发失败的临界值） */
export interface BoundaryCondition {
  /** 相关变量/参数 ref */
  variableRef: string;
  /** 临界方向 */
  direction: 'above' | 'below' | 'equal' | 'outside_range';
  /** 临界值（数值型） */
  thresholdValue?: number;
  /** 临界范围 [min, max]（direction=outside_range 时使用） */
  thresholdRange?: [number, number];
  /** 说明 */
  description: string;
}

/** 失败记录条目（不可变） */
export interface FailureRecord {
  id: string;
  /** 失败发生的 Episode ref */
  episodeRef: string;
  /** 触发失败的机制 ref */
  mechanismRef?: string;
  /** 失败描述 */
  description: string;
  /** 代价列表（不变量 FR-I1：至少一项代价） */
  costs: FailureCost[];
  /** 触发此失败的边界条件（不变量 FR-I2：至少一项） */
  boundaryConditions: BoundaryCondition[];
  /** 所属本体（v9 联邦上下文，可选） */
  ontologyId?: string;
  /** 条目写入时间（不可修改） */
  recordedAt: string;
  recordedBy: string;
}

/** 失败边界档案 */
export interface FailureBoundaryArchive {
  id: string;
  name: string;
  description: string;
  /** 失败记录列表（append-only，不变量 FBA-I1：不可 null） */
  records: FailureRecord[];
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateFailureBoundaryArchiveInput {
  id?: string;
  name: string;
  description: string;
  records?: FailureRecord[];
  createdBy?: string;
  status?: FailureBoundaryArchive['status'];
}

export function createFailureBoundaryArchive(
  input: CreateFailureBoundaryArchiveInput
): FailureBoundaryArchive {
  return {
    id:          input.id ?? `FBA_${crypto.randomBytes(6).toString('hex')}`,
    name:        input.name,
    description: input.description,
    records:     input.records ?? [],
    createdAt:   new Date().toISOString(),
    createdBy:   input.createdBy ?? 'system',
    status:      input.status ?? 'draft',
  };
}

// =============================================================================
// append-only 写入
// =============================================================================

export interface AppendFailureRecordInput {
  episodeRef: string;
  mechanismRef?: string;
  description: string;
  costs: FailureCost[];
  boundaryConditions: BoundaryCondition[];
  ontologyId?: string;
  recordedBy?: string;
}

/**
 * 向档案追加一条失败记录（immutable update，返回新档案对象）。
 * 不变量 FR-I1/I2 在此处强制检查。
 */
export function appendFailureRecord(
  archive: FailureBoundaryArchive,
  input: AppendFailureRecordInput
): FailureBoundaryArchive {
  // 不变量 FR-I1：至少一项代价
  if (!input.costs || input.costs.length === 0) {
    throw new Error('FailureRecord 不变量 FR-I1：costs 不可为空');
  }
  // 不变量 FR-I2：至少一项边界条件
  if (!input.boundaryConditions || input.boundaryConditions.length === 0) {
    throw new Error('FailureRecord 不变量 FR-I2：boundaryConditions 不可为空');
  }

  const record: FailureRecord = {
    id:                 `FR_${crypto.randomBytes(6).toString('hex')}`,
    episodeRef:         input.episodeRef,
    mechanismRef:       input.mechanismRef,
    description:        input.description,
    costs:              input.costs,
    boundaryConditions: input.boundaryConditions,
    ontologyId:         input.ontologyId,
    recordedAt:         new Date().toISOString(),
    recordedBy:         input.recordedBy ?? 'system',
  };

  return {
    ...archive,
    records: [...archive.records, record],
  };
}

// =============================================================================
// 边界查询
// =============================================================================

/**
 * 按代价类型过滤失败记录。
 */
export function queryRecordsByCostKind(
  archive: FailureBoundaryArchive,
  costKind: FailureCost['kind']
): FailureRecord[] {
  return archive.records.filter(r =>
    r.costs.some(c => c.kind === costKind)
  );
}

/**
 * 按边界条件变量 ref 查找相关失败记录。
 */
export function queryRecordsByVariable(
  archive: FailureBoundaryArchive,
  variableRef: string
): FailureRecord[] {
  return archive.records.filter(r =>
    r.boundaryConditions.some(bc => bc.variableRef === variableRef)
  );
}

/**
 * 检查给定变量值是否触及任一已知边界条件（简单数值型检查）。
 * 返回所有命中的 FailureRecord。
 */
export function checkBoundaryViolation(
  archive: FailureBoundaryArchive,
  variableRef: string,
  currentValue: number
): FailureRecord[] {
  return archive.records.filter(r =>
    r.boundaryConditions.some(bc => {
      if (bc.variableRef !== variableRef) return false;
      if (typeof bc.thresholdValue !== 'number') return false;
      switch (bc.direction) {
        case 'above':  return currentValue > bc.thresholdValue;
        case 'below':  return currentValue < bc.thresholdValue;
        case 'equal':  return currentValue === bc.thresholdValue;
        case 'outside_range': {
          if (!bc.thresholdRange) return false;
          const [min, max] = bc.thresholdRange;
          return currentValue < min || currentValue > max;
        }
        default: return false;
      }
    })
  );
}
