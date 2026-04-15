/**
 * pipeline-recordfix.test.ts
 * 迁移自 test-v7-recordfix.mjs 的核心验收测试
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { CausalPipeline } from '../core/pipeline.js';
import { AtomKind, RefKind } from '../core/atom-graph.js';
import {
  acceptInstance,
  rejectInstance,
  supersedeInstance,
  createMechanismInstance,
} from '../core/mechanism-instance.js';

function createCompileReadyStory(pipeline: CausalPipeline, fixDescription = 'compile ready fix') {
  const obs = pipeline.submitObservation({
    rawInput: 'compile ready observation',
    facts: [{ pred: 'symptom', value: 'timeout' }],
  });

  const sourceAtomId = obs.story.observationAtomIds[0];
  assert.ok(sourceAtomId);

  const fixAtom = pipeline.graph.addAtom(fixDescription, AtomKind.ACTION);
  pipeline.graph.addRef(sourceAtomId, fixAtom.id, RefKind.FIXES, {
    weight: 0.8,
    mode: 'tentative',
    provenance: 'manual',
  });

  return { obs, sourceAtomId, fixAtom };
}

describe('pipeline 合同偏差回归', () => {
  it('submitObservation 在 classify 抛错时仍返回 Story', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const originalClassify = pipeline.problemClasses.classify.bind(pipeline.problemClasses);
    (pipeline.problemClasses as { classify: typeof originalClassify }).classify = () => {
      throw new Error('classify boom');
    };

    const result = pipeline.submitObservation({
      rawInput: 'classification should not block observation',
      facts: [{ pred: 'symptom', value: 'latency' }],
    });

    assert.ok(result.story.id);
    assert.strictEqual(result.classification, undefined);
    assert.ok(result.atoms.length > 0);

    pipeline.close();
  });

  it('search 在 classify 抛错时仍返回结果', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    pipeline.submitObservation({
      rawInput: 'search seed',
      facts: [{ pred: 'error', value: 'timeout' }],
    });

    const originalClassify = pipeline.problemClasses.classify.bind(pipeline.problemClasses);
    (pipeline.problemClasses as { classify: typeof originalClassify }).classify = () => {
      throw new Error('classify boom');
    };

    const result = pipeline.search('timeout');

    assert.strictEqual(result.classification, undefined);
    assert.ok(Array.isArray(result.paths));
    assert.ok(Array.isArray(result.regulations));
    assert.ok(Array.isArray(result.suggestions));

    pipeline.close();
  });

  it('已 resolved 的 Story 不能再次 recordFix', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const obs = pipeline.submitObservation({
      rawInput: 'resolved guard',
      facts: [{ pred: 'error', value: 'guard' }],
    });

    pipeline.stories.resolve(obs.story.id, 'success', 'already fixed');

    assert.throws(
      () => pipeline.recordFix({ storyId: obs.story.id, fixDescription: 'repeat fix' }),
      /已 resolved/
    );

    pipeline.close();
  });

  it('compile 被拒时 Story 保持未 resolved', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false, autoExplore: false });
    const obs = pipeline.submitObservation({
      rawInput: 'compile reject',
      facts: [{ pred: 'error', value: 'missing-ref' }],
    });
    const detachedAtom = pipeline.graph.addAtom('unreachable concept', AtomKind.CONCEPT);
    const originalCanPromote = pipeline.hypotheses.canPromote.bind(pipeline.hypotheses);
    (pipeline.hypotheses as { canPromote: typeof originalCanPromote }).canPromote = () => ({ allowed: true });

    const result = pipeline.recordFix({
      storyId: obs.story.id,
      fixDescription: 'compile should be rejected',
      chosenPathAtomIds: [obs.story.observationAtomIds[0], detachedAtom.id],
    });

    const persistedStory = pipeline.stories.get(obs.story.id);
    assert.ok(result.compile);
    assert.strictEqual(result.compile?.compiledRefs, 0);
    assert.ok(persistedStory);
    assert.strictEqual(persistedStory?.status, 'open');
    assert.strictEqual(persistedStory?.outcome, undefined);
    assert.strictEqual(result.story.status, 'open');
    assert.strictEqual(result.story.outcome, undefined);

    pipeline.close();
  });

  it('Evidence 写入失败与 myelinate 失败不会回滚 compile 主结果', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const fixDescription = 'compile success despite side-effect failure';
    const { obs, sourceAtomId, fixAtom } = createCompileReadyStory(pipeline, fixDescription);

    const originalCanPromote = pipeline.hypotheses.canPromote.bind(pipeline.hypotheses);
    const originalRecord = pipeline.evidence.record.bind(pipeline.evidence);
    const originalMyelinate = pipeline.graph.myelinate.bind(pipeline.graph);

    (pipeline.hypotheses as { canPromote: typeof originalCanPromote }).canPromote = () => ({ allowed: true });
    (pipeline.evidence as { record: typeof originalRecord }).record = () => {
      throw new Error('evidence boom');
    };
    (pipeline.graph as { myelinate: typeof originalMyelinate }).myelinate = () => {
      throw new Error('myelinate boom');
    };

    const result = pipeline.recordFix({
      storyId: obs.story.id,
      fixDescription,
      chosenPathAtomIds: [sourceAtomId, fixAtom.id],
    });

    const persistedStory = pipeline.stories.get(obs.story.id);
    assert.ok(result.compile);
    assert.strictEqual(result.compile?.compiledRefs, 1);
    assert.strictEqual(result.evidenceCount, 0);
    assert.strictEqual(persistedStory?.status, 'resolved');
    assert.strictEqual(persistedStory?.outcome, 'success');
    assert.strictEqual(pipeline.evidence.getBySourceId(obs.story.id).length, 0);
    assert.strictEqual(pipeline.stories.getResolvedForCompile().length, 0);

    pipeline.close();
  });
});

describe('v7 recordFix 收束验收', () => {
  it('无更新路径返回 OntologyDelta(kind=none) 并正确关联 episode', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const obs = pipeline.submitObservation({
      rawInput: 'test error',
      facts: [{ pred: 'error', value: 'test' }],
    });

    const result = pipeline.recordFix({
      storyId: obs.story.id,
      fixDescription: '无路径修复',
    });

    assert.strictEqual(result.ontologyUpdate.kind, 'none');
    assert.ok(typeof result.ontologyUpdate.no_update_reason === 'object' && result.ontologyUpdate.no_update_reason !== null);
    assert.ok(typeof result.ontologyUpdate.id === 'string' && result.ontologyUpdate.id.length > 0);
    assert.strictEqual(result.episode.ontologyDeltaId, result.ontologyUpdate.id);
    assert.strictEqual(result.ontologyUpdate.applied_at, null);

    pipeline.close();
  });

  it('acceptInstance 在空 claim/support 下拒绝', () => {
    const mi = createMechanismInstance({
      episode_id: 'ep_test',
      mechanism_class_ref: 'proxy:episode_ep_test',
      bindings: { slot_0: 'atom_a' },
    });

    assert.throws(() => {
      acceptInstance(mi, { claim_ids: [], support_link_refs: [] });
    });

    assert.doesNotThrow(() => {
      acceptInstance(mi, { claim_ids: ['claim_1'] });
    });
  });

  it('reconstruction.mechanism_instance_ids 语义正确（rejected 为空，accepted 有值）', () => {
    // 4a: 无路径 → rejected → mechanism_instance_ids 为空
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const obs = pipeline.submitObservation({
      rawInput: 'another test',
      facts: [{ pred: 'symptom', value: 'slow' }],
    });

    const result = pipeline.recordFix({
      storyId: obs.story.id,
      fixDescription: '测试 mechanism_instance_ids',
    });

    assert.ok(Array.isArray(result.reconstruction.mechanism_instance_ids));
    assert.strictEqual(result.mechanismInstance.status, 'rejected');
    assert.strictEqual(result.reconstruction.mechanism_instance_ids.length, 0);
    assert.ok(result.mechanismInstance.mechanism_class_ref.startsWith('MC_'));

    pipeline.close();

    // 4b: accepted 路径下有值
    const mi = acceptInstance(
      createMechanismInstance({
        episode_id: 'ep_4b',
        mechanism_class_ref: 'proxy:test_class',
        bindings: { slot_0: 'atom_a' },
        claim_ids: ['claim_x'],
      }),
      { claim_ids: ['claim_x'] }
    );

    assert.strictEqual(mi.status, 'accepted');
    const miIds = mi.status === 'accepted' ? [mi.id] : [];
    assert.strictEqual(miIds.length, 1);
    assert.strictEqual(miIds[0], mi.id);
  });

  it('状态机 guard — 非 candidate/accepted 非法流转抛错', () => {
    const base = { episode_id: 'ep_sm', mechanism_class_ref: 'proxy:ep_sm', bindings: { slot_0: 'a1' } };

    const miAccepted = acceptInstance(createMechanismInstance(base), { claim_ids: ['claim_x'] });

    assert.throws(() => acceptInstance(miAccepted, { claim_ids: ['claim_y'] }));
    assert.throws(() => rejectInstance(miAccepted, 'test'));

    const miCand = createMechanismInstance(base);
    assert.throws(() => supersedeInstance(miCand, 'MI_new'));

    assert.doesNotThrow(() => supersedeInstance(miAccepted, 'MI_replacement_001'));

    const miRejected = rejectInstance(createMechanismInstance(base), '测试拒绝');
    assert.throws(() => acceptInstance(miRejected, { claim_ids: ['claim_z'] }));
  });

  it('selectedMechanismIds 等于 mechanism_class_ref', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const obs = pipeline.submitObservation({
      rawInput: 'mechanism ids test',
      facts: [{ pred: 'error', value: 'timeout' }],
    });

    const result = pipeline.recordFix({
      storyId: obs.story.id,
      fixDescription: 'selectedMechanismIds bridge test',
    });

    const smIds = result.reconstruction.selectedMechanismIds;
    const mcRef = result.mechanismInstance.mechanism_class_ref;

    assert.strictEqual(smIds.length, 1);
    assert.strictEqual(smIds[0], mcRef);
    assert.ok(smIds[0].startsWith('MC_'));

    pipeline.close();
  });

  it('kind=none 路径下 support_link_refs 不含 compiledRefIds', () => {
    const pipeline = new CausalPipeline({ seedDefaults: false });
    const obs = pipeline.submitObservation({
      rawInput: 'support_link_refs clean test',
      facts: [{ pred: 'symptom', value: 'crash' }],
    });

    const result = pipeline.recordFix({
      storyId: obs.story.id,
      fixDescription: '无路径不更新',
    });

    assert.strictEqual(result.ontologyUpdate.kind, 'none');
    assert.strictEqual(result.mechanismInstance.support_link_refs.length, 0);

    const mi = createMechanismInstance({
      episode_id: 'ep_clean',
      mechanism_class_ref: 'proxy:ep_clean',
      bindings: { slot_0: 'atom_x' },
      claim_ids: ['hyp_1'],
    });
    const accepted = acceptInstance(mi, { claim_ids: ['hyp_1'] });
    assert.strictEqual(accepted.support_link_refs.length, 0);

    pipeline.close();
  });
});
