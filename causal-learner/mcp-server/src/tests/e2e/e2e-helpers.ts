/**
 * E2E 测试公共夹具 — 场景驱动全链路测试工具集
 */
import type { DerivationStep, SupportLink } from '../../core/types.js';

let _stepNum = 0;

/** 生成推导步骤（proof[i].to.id 必须等于 proof[i+1].from.id 才能 complete） */
export function makeStep(fromId: string, toId: string, replayable = true): DerivationStep {
  return {
    stepNumber:      ++_stepNum,
    from:            { id: fromId, label: fromId, kind: 'claim' },
    relation:        'causes',
    to:              { id: toId,   label: toId,   kind: 'claim' },
    auditReplayable: replayable,
    llmInvolved:     false,
  };
}

/** 生成最小支撑链接 */
export function makeSupportLink(id: string, orId: string, claimId: string): SupportLink {
  return {
    id,
    observationRecordId: orId,
    claimId,
    polarity:   'supports',
    weight:     0.9,
    sourceKind: 'pipeline',
    sourceRef:  null,
    createdAt:  new Date().toISOString(),
    createdBy:  'e2e-test',
  };
}

/** 场景反馈报告接口（用于跨场景断言汇总） */
export interface ScenarioFeedbackReport {
  scenarioId: string;
  /** 发现的理论漏洞（若无则为空数组） */
  theoryGaps: string[];
  /** 边界触发次数 */
  boundaryViolations: number;
  /** 宪法审计摘要 */
  auditSummary: {
    mandatoryPassed: boolean;
    passedCount: number;
    failedCount: number;
  };
}
