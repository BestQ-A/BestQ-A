import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';

import { CausalPipeline } from '../core/pipeline.js';
import {
  buildPipelineConfig,
  handleCausalSearchTool,
  handleRecordFixTool,
  handleSubmitObservationTool,
  normalizeRecordFixArgs,
  normalizeSubmitObservationArgs,
} from '../index.js';

function parseToolPayload(response: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(response.content[0]?.text ?? 'null');
}

describe('MCP pipeline 路由', () => {
  it('buildPipelineConfig 使用 sibling DB，避免复用 legacy DB', () => {
    const config = buildPipelineConfig('E:/tmp/causal.db');

    assert.strictEqual(config.graphDbPath, path.join('E:/tmp', 'causal.pipeline.graph.db'));
    assert.strictEqual(config.storyDbPath, path.join('E:/tmp', 'causal.pipeline.story.db'));
    assert.notStrictEqual(config.graphDbPath, path.join('E:/tmp', 'causal.db'));
  });

  it('submit_observation handler 返回 pipeline 语义结果', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });

    const response = handleSubmitObservationTool(pipeline, {
      observation: {
        observationId: 'obs_route_submit',
        facts: [{ pred: 'symptom', value: 'timeout' }],
        context: { env: 'ci', branch: 'main' },
        rawRefs: ['raw log line 1', 'raw log line 2'],
      },
    });

    const payload = parseToolPayload(response) as {
      eventCreated: { eventId: string };
      pipelineResult: { story: { id: string; context: { custom?: Record<string, unknown> } } };
    };

    assert.strictEqual(payload.eventCreated.eventId, payload.pipelineResult.story.id);
    assert.strictEqual(payload.pipelineResult.story.context.custom?.legacyObservationId, 'obs_route_submit');
    assert.strictEqual(payload.pipelineResult.story.context.custom?.branch, 'main');

    pipeline.close();
  });

  it('record_fix handler 映射 eventId->storyId，并保留 legacy fix 元数据', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const obs = pipeline.submitObservation({
      rawInput: 'record fix seed',
      facts: [{ pred: 'error', value: 'timeout' }],
    });

    const response = handleRecordFixTool(pipeline, {
      eventId: obs.story.id,
      fix: {
        fixCommit: 'abc123',
        fixDescription: 'add timeout retry',
        filesChanged: ['src/retry.ts'],
        linesChanged: 12,
        testsPassed: false,
      },
    });

    const payload = parseToolPayload(response) as {
      eventUpdated: { eventId: string };
      pipelineResult: { story: { id: string; status: string } };
    };

    assert.strictEqual(payload.eventUpdated.eventId, obs.story.id);
    assert.strictEqual(payload.pipelineResult.story.id, obs.story.id);
    assert.strictEqual(payload.pipelineResult.story.status, 'resolved');

    const normalized = normalizeRecordFixArgs({
      eventId: obs.story.id,
      fix: {
        fixCommit: 'abc123',
        fixDescription: 'add timeout retry',
        filesChanged: ['src/retry.ts'],
        linesChanged: 12,
        testsPassed: false,
      },
    });
    assert.strictEqual(normalized.pipelineInput.context?.custom?.legacyFixCommit, 'abc123');
    assert.strictEqual(normalized.pipelineInput.context?.custom?.legacyTestsPassed, false);

    pipeline.close();
  });

  it('causal_search handler 直接走 pipeline.search', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    handleSubmitObservationTool(pipeline, {
      observation: {
        facts: [{ pred: 'error', value: 'timeout' }],
        metadata: { title: 'timeout during startup' },
      },
    });

    const response = handleCausalSearchTool(pipeline, {
      query: 'timeout',
      maxDepth: 9,
      strategy: 'event_first',
    });

    const payload = parseToolPayload(response) as {
      query: string;
      pipelineResult: { suggestions: string[]; regulations: unknown[]; paths: unknown[] };
    };

    assert.strictEqual(payload.query, 'timeout');
    assert.ok(Array.isArray(payload.pipelineResult.suggestions));
    assert.ok(Array.isArray(payload.pipelineResult.regulations));
    assert.ok(Array.isArray(payload.pipelineResult.paths));

    pipeline.close();
  });

  it('normalize helper 产出兼容映射', () => {
    const submit = normalizeSubmitObservationArgs({
      observation: {
        observationId: 'obs_norm',
        facts: [{ pred: 'symptom', value: 'latency' }],
        metadata: { title: 't1', description: 'd1' },
      },
    });
    const fix = normalizeRecordFixArgs({
      eventId: 'story_norm',
      fix: {
        fixCommit: 'def456',
        fixDescription: 'apply fix',
        testsPassed: false,
      },
    });

    assert.strictEqual(submit.pipelineInput.rawInput, 't1\nd1');
    assert.strictEqual(submit.pipelineInput.context?.custom?.legacyObservationId, 'obs_norm');
    assert.strictEqual(fix.pipelineInput.storyId, 'story_norm');
    assert.strictEqual(fix.pipelineInput.interventionOutcome, 'no_effect');
  });
});
