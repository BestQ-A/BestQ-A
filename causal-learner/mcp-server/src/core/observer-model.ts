/**
 * ObserverModel — v10 观察者模型
 * implements: docs/current/participatory-world-contract.md
 *
 * ObserverModel 描述一个观察者的位置、仪器偏差和盲区。
 * 不同观察者看到的 ObservationRecord 可能因盲区而不同。
 */

import crypto from 'crypto';

// =============================================================================
// 类型定义
// =============================================================================

/** 仪器偏差描述 */
export interface InstrumentBias {
  /** 受影响的信号 key（对应 ObservationModel.outputSignals.key） */
  signalKey: string;
  /** 偏差类型 */
  biasKind: 'systematic' | 'random' | 'threshold' | 'saturation';
  /** 偏差量（可为正负，systematic/threshold 时有意义） */
  magnitude?: number;
  /** 偏差说明 */
  description: string;
}

/** 观察者模型 */
export interface ObserverModel {
  id: string;
  name: string;
  description: string;
  /** 观察者位置（坐标、角色、层级等自由描述） */
  position: string;
  /** 仪器偏差列表（可为空数组） */
  instrumentBiases: InstrumentBias[];
  /**
   * 盲区信号 key 列表（不变量 I1：可为空数组，但不为 null）
   * 盲区内的信号在 filterObservations 时被过滤掉
   */
  blindZoneSignalKeys: string[];
  /** 观察者所在的本体 ID（可选，v9 联邦上下文） */
  ontologyId?: string;
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

/** 观测过滤结果 */
export interface FilteredObservation {
  /** 原始信号 map（key → value） */
  original: Record<string, unknown>;
  /** 过滤后的信号 map（已移除盲区信号） */
  filtered: Record<string, unknown>;
  /** 被过滤掉的信号 key 列表 */
  removedKeys: string[];
}

// =============================================================================
// 工厂
// =============================================================================

export interface CreateObserverModelInput {
  id?: string;
  name: string;
  description: string;
  position: string;
  instrumentBiases?: InstrumentBias[];
  blindZoneSignalKeys?: string[];
  ontologyId?: string;
  createdBy?: string;
  status?: ObserverModel['status'];
}

export function createObserverModel(input: CreateObserverModelInput): ObserverModel {
  return {
    id:                   input.id ?? `OBS_${crypto.randomBytes(6).toString('hex')}`,
    name:                 input.name,
    description:          input.description,
    position:             input.position,
    instrumentBiases:     input.instrumentBiases     ?? [],
    blindZoneSignalKeys:  input.blindZoneSignalKeys  ?? [],
    ontologyId:           input.ontologyId,
    createdAt:            new Date().toISOString(),
    createdBy:            input.createdBy            ?? 'system',
    status:               input.status               ?? 'draft',
  };
}

// =============================================================================
// 观测过滤
// =============================================================================

/**
 * 根据观察者盲区过滤信号 map。
 * 盲区内的信号 key 被从 filtered 中移除，但记录在 removedKeys 中。
 *
 * @param observer  ObserverModel
 * @param signals   原始信号 map（key → value）
 * @returns FilteredObservation
 */
export function filterObservations(
  observer: ObserverModel,
  signals: Record<string, unknown>
): FilteredObservation {
  const blindZone = new Set(observer.blindZoneSignalKeys);
  const removedKeys: string[] = [];
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(signals)) {
    if (blindZone.has(key)) {
      removedKeys.push(key);
    } else {
      filtered[key] = value;
    }
  }

  return {
    original: { ...signals },
    filtered,
    removedKeys,
  };
}

/**
 * 将观察者的仪器偏差应用到信号值（数值型信号）。
 * systematic / threshold 偏差：在原始值上加上 magnitude。
 * 非数值型信号或无对应偏差的信号不做修改。
 *
 * @param observer  ObserverModel
 * @param signals   信号 map
 * @returns 应用偏差后的信号 map（新对象）
 */
export function applyInstrumentBias(
  observer: ObserverModel,
  signals: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...signals };
  for (const bias of observer.instrumentBiases) {
    const value = result[bias.signalKey];
    if (
      typeof value === 'number' &&
      typeof bias.magnitude === 'number' &&
      (bias.biasKind === 'systematic' || bias.biasKind === 'threshold')
    ) {
      result[bias.signalKey] = value + bias.magnitude;
    }
  }
  return result;
}
