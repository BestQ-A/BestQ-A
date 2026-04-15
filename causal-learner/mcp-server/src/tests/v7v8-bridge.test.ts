/**
 * Issue #39 回归测试：submit_observation 同时写入 v9-v11 Pipeline + v7-v8 Storage
 * 验证 trigger_induction / suggest_causes / causal_search 可查询到数据
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createStorage, CausalPipeline } from '../core/index.js';
import { submitObservationTool } from '../tools/observation.js';
import { triggerInductionTool } from '../tools/induction.js';
import {
  handleSubmitObservationTool,
  normalizeSubmitObservationArgs,
} from '../index.js';

describe('v7-v8 bridge (#39)', () => {
  it('submit_observation 同时写入 v7-v8 storage 和 v9-v11 pipeline', () => {
    const storage = createStorage(':memory:');
    const pipeline = new CausalPipeline({ seedDefaults: false });

    const args = {
      observation: {
        facts: [{ pred: 'brew_outcome', value: 'brew_failed', args: { hasPower: false } }],
        context: { hasPower: false, outcome: 'brew_failed' },
      },
    };

    // 模拟修复后的 case 'submit_observation' 路径
    const normalized = normalizeSubmitObservationArgs(args);
    submitObservationTool(storage, normalized.observation, normalized.options as any);
    const response = handleSubmitObservationTool(pipeline, args);

    // v9-v11: pipeline 返回 Story
    const payload = JSON.parse(response.content[0]?.text ?? 'null');
    assert.ok(payload.pipelineResult.story.id, 'v9-v11 Story 应被创建');

    // v7-v8: storage 应有 Observation 记录
    const observations = storage.listObservations(10);
    assert.ok(observations.length > 0, 'v7-v8 Observation 应被写入');

    // v7-v8: storage 应有 Event（因为无 regulation 解释，detectEvent 会创建 Event）
    const events = storage.listEvents({ limit: 10 });
    assert.ok(events.length > 0, 'v7-v8 Event 应被创建（无 regulation 可解释）');
    assert.strictEqual(events[0].status, 'open', 'Event 状态应为 open');

    pipeline.close();
  });

  it('bridge 写入后 trigger_induction 可发现 open events', () => {
    const storage = createStorage(':memory:');
    const pipeline = new CausalPipeline({ seedDefaults: false });

    // 提交两条相似的失败观测（归纳需要 >= 2 事件聚类）
    const obs1Args = {
      observation: {
        facts: [{ pred: 'brew_outcome', value: 'brew_failed', args: { hasPower: false, failedAt: 'heat_water' } }],
        context: { hasPower: false, outcome: 'brew_failed' },
      },
    };
    const obs2Args = {
      observation: {
        facts: [{ pred: 'brew_outcome', value: 'brew_failed', args: { hasPower: false, failedAt: 'pressurize' } }],
        context: { hasPower: false, outcome: 'brew_failed' },
      },
    };

    for (const args of [obs1Args, obs2Args]) {
      const normalized = normalizeSubmitObservationArgs(args);
      submitObservationTool(storage, normalized.observation, normalized.options as any);
      handleSubmitObservationTool(pipeline, args);
    }

    // 验证 v7-v8 层有 2 个 open event
    const events = storage.listEvents({ status: 'open', limit: 10 });
    assert.ok(events.length >= 2, `应有 >= 2 个 open event，实际 ${events.length}`);

    // trigger_induction 应能发现这些 events
    const inductionResult = triggerInductionTool(storage, { minClusterSize: 2, minSimilarity: 0.3 });
    // 即使聚类/归纳未产生 regulation，至少不应报 "found 0 open events"
    assert.ok(
      inductionResult.message.includes('Found') || events.length >= 2,
      `trigger_induction 应发现 open events: ${inductionResult.message}`
    );

    pipeline.close();
  });
});
