/**
 * CausalPipeline — BestQ-A 编排管道
 *
 * 将各独立模块连成一条完整的闭环管道：
 * classify → contextualize → constrain → explore → execute → compile
 *
 * - submit_observation: 摄入事实 → 分类 → 创建 Story → 探索 → 模板匹配
 * - record_fix: 解决 Story → compile 路径 → 记录证据 → 更新 RegulationView
 */

import { AtomGraph, AtomKind } from './atom-graph.js';
import type { Atom, ExploreResult, CompileResult, PathResult } from './atom-graph.js';
import { StoryStorage } from './story.js';
import type { Story, StoryPath, ContextScope } from './story.js';
import { EvidenceStore, recordSupport } from './evidence.js';
import { ProblemClassRegistry } from './problem-class.js';
import type { ClassifyResult } from './problem-class.js';
import { RegulationViewBuilder } from './regulation-view.js';
import type { RegulationView } from './regulation-view.js';
import { PatternEngine } from './pattern-template.js';
// getRefAlgebra 由 explore 内部使用，此处不直接调用但保留 import 以供将来扩展
import { getRefAlgebra } from './ref-algebra.js';
import { HypothesisStore } from './hypothesis.js';
import type { InterventionOutcome } from './hypothesis.js';
import { toEpisode, type Episode } from './story.js';
import type { AcceptedReconstruction } from './reconstruction.js';
import type { Conclusion, SupportLink, ObservationRecord } from './types.js';
import {
  createAcceptedReconstruction,
} from './reconstruction.js';
import type { MechanismInstance } from './mechanism-instance.js';
import {
  createMechanismInstance,
  acceptInstance,
  rejectInstance,
} from './mechanism-instance.js';
import type { OntologyDelta } from './ontology-delta.js';
import {
  buildRelationChange,
  createOntologyDelta,
  createOntologyDeltaNone,
} from './ontology-delta.js';
import { MechanismInstanceStore } from './mechanism-instance-store.js';
import type { MechanismInstanceStoreStats } from './mechanism-instance-store.js';
import { DerivationTraceStore } from './derivation-trace-store.js';
import type { DerivationTraceStoreStats } from './derivation-trace-store.js';
import { createDerivationTrace } from './derivation-trace.js';
import { EpisodeEventStore, createEpisodeEvent } from './episode-event-store.js';
import type { EpisodeEventStoreStats, EpisodeEventKind } from './episode-event-store.js';
import { SupportLinkStore } from './support-link-store.js';
import type { SupportLinkStoreStats } from './support-link-store.js';
import { ObservationRecordStore } from './observation-record-store.js';
import type { ObservationRecordStoreStats } from './observation-record-store.js';
import crypto from 'crypto';

// =============================================================================
// 配置与接口
// =============================================================================

/** 管道配置 */
export interface PipelineConfig {
  /** AtomGraph 数据库路径 */
  graphDbPath: string;
  /** Story 数据库路径 */
  storyDbPath: string;
  /** Evidence 数据库路径 */
  evidenceDbPath: string;
  /** ProblemClass 数据库路径 */
  problemClassDbPath: string;
  /** PatternEngine 数据库路径 */
  patternDbPath: string;
  /** 自动分类，默认 true */
  autoClassify: boolean;
  /** 自动探索，默认 true */
  autoExplore: boolean;
  /** 自动注入种子数据，默认 true */
  seedDefaults: boolean;
  /** MechanismInstance 持久化数据库路径 */
  mechanismInstanceDbPath: string;
  /** DerivationTrace 持久化数据库路径 */
  derivationTraceDbPath: string;
  /** EpisodeEvent 持久化数据库路径 */
  episodeEventDbPath: string;
  /** SupportLink 持久化数据库路径 */
  supportLinksDbPath: string;
  /** ObservationRecord 持久化数据库路径 */
  observationRecordsDbPath: string;
}

/** 提交观测的输入 */
export interface ObservationInput {
  /** 原始问题描述 */
  rawInput: string;
  /** 结构化事实列表 */
  facts: Array<{ pred: string; value: unknown; args?: Record<string, unknown> }>;
  /** 上下文作用域 */
  context?: ContextScope;
  /** 操作者 ID */
  operator?: string;
}

/** 提交观测的完整结果 */
export interface ObservationResult {
  /** 摄入产生的 Atom 列表 */
  atoms: Atom[];
  /** 分类结果（autoClassify=true 时存在） */
  classification?: ClassifyResult;
  /** 创建的 Story */
  story: Story;
  /** 探索结果（autoExplore=true 时存在） */
  explore?: ExploreResult;
  /** 候选因果路径 */
  candidatePaths: StoryPath[];
  /** 模板匹配结果 */
  templateMatches?: Array<{ templateId: string; templateName: string; score: number }>;
  /** 人类可读建议 */
  suggestions: string[];
}

/** 记录修复的输入 */
export interface FixInput {
  /** 要解决的 Story ID */
  storyId: string;
  /** 修复描述 */
  fixDescription: string;
  /** 实际走的路径（Atom ID 有序列表） */
  chosenPathAtomIds?: string[];
  /** 试过但失败的路径 */
  failedPathAtomIds?: string[][];
  /** 上下文作用域 */
  context?: ContextScope;
  /** 操作者 ID */
  operator?: string;
  /** 干预结果，默认 'mechanism_confirmed' */
  interventionOutcome?: InterventionOutcome;
}

/** 记录修复的完整结果 */
export interface FixResult {
  /** 更新后的 Story */
  story: Story;
  /** Episode 兼容壳 */
  episode: Episode;
  /** Reconstruction 产物（v7 §10 条件 3） */
  reconstruction: AcceptedReconstruction;
  /** 最终结论（v7 §10 条件 5：主流程输出 Conclusion + Reconstruction） */
  conclusion: Conclusion;
  /**
   * MechanismInstance（mechanism-instance-contract.md §8 条件 1）
   * compile 成功时 status='accepted'；否则 status='candidate' 或 'rejected'
   */
  mechanismInstance: MechanismInstance;
  /** Ontology 更新或不更新说明（v7 §10 条件 4） */
  ontologyUpdate: OntologyDelta;
  /** 编译结果（有 chosenPathAtomIds 时存在） */
  compile?: CompileResult;
  /** 记录的证据条数 */
  evidenceCount: number;
  /** 更新后的 Regulation 视图列表 */
  regulationViews: RegulationView[];
}

/** 管道统计 */
export interface PipelineStats {
  graph: { atomCount: number; refCount: number; shortcutCount: number };
  stories: { total: number; resolved: number; uncompiled: number };
  evidence: { total: number; supports: number; contradicts: number };
  problemClasses: number;
  templates: number;
  regulations: number;
  hypotheses: { total: number; open: number; validated: number; readyForCompile: number };
  mechanismInstances: MechanismInstanceStoreStats;
  derivationTraces: DerivationTraceStoreStats;
  episodeEvents: EpisodeEventStoreStats;
  supportLinks: SupportLinkStoreStats;
  observationRecords: ObservationRecordStoreStats;
}

// =============================================================================
// CausalPipeline 主类
// =============================================================================

export class CausalPipeline {
  /** 因果知识图谱 */
  readonly graph: AtomGraph;
  /** Story/Case 存储 */
  readonly stories: StoryStorage;
  /** 证据存储 */
  readonly evidence: EvidenceStore;
  /** 问题类注册表 */
  readonly problemClasses: ProblemClassRegistry;
  /** 模式模板引擎 */
  readonly patterns: PatternEngine;
  /** 假设存储（Hypothesis gate） */
  readonly hypotheses: HypothesisStore;
  /** MechanismInstance 持久化存储 */
  readonly mechanismInstances: MechanismInstanceStore;
  /** DerivationTrace 持久化存储 */
  readonly derivationTraces: DerivationTraceStore;
  /** EpisodeEvent 轻量 timeline 存储 */
  readonly episodeEvents: EpisodeEventStore;
  /** SupportLink 持久化存储 */
  readonly supportLinks: SupportLinkStore;
  /** ObservationRecord 持久化存储 */
  readonly observationRecords: ObservationRecordStore;

  private rvBuilder: RegulationViewBuilder;
  private config: PipelineConfig;

  constructor(config: Partial<PipelineConfig> = {}) {
    const resolved: PipelineConfig = {
      graphDbPath:             config.graphDbPath             ?? ':memory:',
      storyDbPath:             config.storyDbPath             ?? ':memory:',
      evidenceDbPath:          config.evidenceDbPath          ?? ':memory:',
      problemClassDbPath:      config.problemClassDbPath      ?? ':memory:',
      patternDbPath:           config.patternDbPath           ?? ':memory:',
      autoClassify:            config.autoClassify            ?? true,
      autoExplore:             config.autoExplore             ?? true,
      seedDefaults:            config.seedDefaults            ?? true,
      mechanismInstanceDbPath: config.mechanismInstanceDbPath ?? ':memory:',
      derivationTraceDbPath:   config.derivationTraceDbPath   ?? ':memory:',
      episodeEventDbPath:      config.episodeEventDbPath      ?? ':memory:',
      supportLinksDbPath:      config.supportLinksDbPath      ?? ':memory:',
      observationRecordsDbPath: config.observationRecordsDbPath ?? ':memory:',
    };
    this.config = resolved;

    this.graph         = new AtomGraph(resolved.graphDbPath);
    this.stories       = new StoryStorage(resolved.storyDbPath);
    this.evidence      = new EvidenceStore(resolved.evidenceDbPath);
    this.problemClasses = new ProblemClassRegistry(resolved.problemClassDbPath);
    this.patterns      = new PatternEngine(resolved.patternDbPath);
    const hypothesisDbPath = resolved.graphDbPath === ':memory:' ? ':memory:'
      : resolved.graphDbPath.replace('.db', '_hypotheses.db');
    this.hypotheses    = new HypothesisStore(hypothesisDbPath);
    // RegulationViewBuilder 直接读 AtomGraph 的 DB（只读视图，不建自己的表）
    this.rvBuilder            = new RegulationViewBuilder(this.graph.db);
    this.mechanismInstances   = new MechanismInstanceStore(resolved.mechanismInstanceDbPath);
    this.derivationTraces     = new DerivationTraceStore(resolved.derivationTraceDbPath);
    this.episodeEvents        = new EpisodeEventStore(resolved.episodeEventDbPath);
    this.supportLinks         = new SupportLinkStore(resolved.supportLinksDbPath);
    this.observationRecords   = new ObservationRecordStore(resolved.observationRecordsDbPath);

    if (resolved.seedDefaults) {
      this.problemClasses.seedDefaults();
      this.patterns.seedDefaults();
    }
  }

  // ===========================================================================
  // submitObservation
  // ===========================================================================

  /**
   * 提交观测 — 完整管道：
   * 1. ingestFacts → Atoms
   * 2. ProblemClass.classify → 分类
   * 3. Story.create → 创建案例
   * 4. explore（图遍历，找候选路径）
   * 5. PatternTemplate.match → 模板匹配
   * 6. 生成建议
   */
  submitObservation(input: ObservationInput): ObservationResult {
    const suggestions: string[] = [];

    // Step 1: 摄入事实为 Atoms
    const contextRecord: Record<string, unknown> = {};
    if (input.context) {
      if (input.context.env)     contextRecord['env']     = input.context.env;
      if (input.context.stack)   contextRecord['stack']   = input.context.stack.join(',');
      if (input.context.project) contextRecord['project'] = input.context.project;
    }
    const atoms = this.graph.ingestFacts(input.facts, contextRecord);

    // Step 2: 自动分类
    let classification: ClassifyResult | undefined;
    if (this.config.autoClassify) {
      const results = this.problemClasses.classify(input.rawInput);
      if (results.length > 0) {
        classification = results[0];
        suggestions.push(
          `问题分类: ${classification.problemClassId} (置信度 ${(classification.confidence * 100).toFixed(0)}%)`
        );
      }
    }

    // Step 3: 创建 Story
    const story = this.stories.create({
      rawInput:           input.rawInput,
      problemClassId:     classification?.problemClassId,
      context:            input.context,
      observationAtomIds: atoms.map(a => a.id),
      operator:           input.operator ?? 'system',
    });

    // Step 3b: 为每个 observation atom 生成真实 ObservationRecord 并落盘
    // D1: observationRecordId 必须是真实 ObservationRecord.id，不得借用 Atom id
    const observationRecordIds: string[] = [];
    atoms.forEach((atom, idx) => {
      const rec: ObservationRecord = {
        id: `OR_${story.id}_${idx}`,
        episodeId: story.id,
        t: idx,
        source: 'submitObservation',
        payload: {
          atomId: atom.id,
          factIndex: idx,
          rawInput: input.rawInput.slice(0, 120),
        },
      };
      this.observationRecords.save(rec);
      observationRecordIds.push(rec.id);
    });

    // Step 3c: 写入 observation_recorded 事件
    this.episodeEvents.append(createEpisodeEvent({
      episode_id: story.id,
      seq: this.episodeEvents.nextSeq(story.id),
      kind: 'observation_recorded',
      ref_id: story.id,
      payload: { atomCount: atoms.length, observationRecordIds },
    }));

    // Step 4: 探索（在图中找候选因果路径）
    let explore: ExploreResult | undefined;
    const candidatePaths: StoryPath[] = [];

    if (this.config.autoExplore && atoms.length > 0) {
      const factAtomIds = atoms
        .filter(a => a.kind === AtomKind.FACT)
        .map(a => a.id);

      if (factAtomIds.length > 0) {
        explore = this.graph.explore(factAtomIds, { maxDepth: 3, maxPaths: 10 });

        for (const p of explore.paths) {
          candidatePaths.push({
            atomIds:     p.atoms.map(a => a.id),
            totalWeight: p.totalWeight,
          });
        }

        if (explore.newTentativeRefs > 0) {
          suggestions.push(`创建了 ${explore.newTentativeRefs} 条新的探索边（tentative）`);
        }

        if (explore.shortcutHits > 0) {
          suggestions.push(`命中 ${explore.shortcutHits} 条快捷路径（髓鞘化缓存）`);
        }

        // 将候选路径写回 Story
        if (candidatePaths.length > 0) {
          this.stories.startExploring(story.id, candidatePaths);
        }
      }
    }

    // Step 5: 模板匹配
    let templateMatches: Array<{ templateId: string; templateName: string; score: number }> | undefined;
    if (atoms.length > 0) {
      const atomsForMatch = atoms.map(a => ({ id: a.id, kind: a.kind, content: a.content }));

      // 为 refChecker 构建闭包：检查图中是否存在指定类型的出边
      const refChecker = (from: string, to: string, kind: string): boolean => {
        const neighbors = this.graph.getNeighbors(from, { direction: 'outgoing' });
        return neighbors.some(n => n.atom.id === to && n.ref.kind === kind);
      };

      const matches = this.patterns.matchTemplates(atomsForMatch, refChecker, {
        minScore: 0.3,
        limit: 5,
      });

      if (matches.length > 0) {
        templateMatches = matches.map(m => ({
          templateId:   m.template.id,
          templateName: m.template.name,
          score:        m.instance.score,
        }));
        suggestions.push(
          `匹配到模板: ${matches[0].template.name} (${(matches[0].instance.score * 100).toFixed(0)}%)`
        );
      }
    }

    // Step 6: 生成动作建议
    if (candidatePaths.length > 0) {
      const best = candidatePaths[0];
      const lastAtomId = best.atomIds[best.atomIds.length - 1];
      if (lastAtomId) {
        const lastAtom = this.graph.getAtom(lastAtomId);
        if (lastAtom && lastAtom.kind === AtomKind.ACTION) {
          suggestions.push(`建议动作: ${lastAtom.content}`);
        }
      }
    }

    if (candidatePaths.length === 0 && atoms.length > 0) {
      suggestions.push('未找到已有解释路径，已创建 open Story 等待后续学习');
    }

    return {
      atoms,
      classification,
      story,
      explore,
      candidatePaths,
      templateMatches,
      suggestions,
    };
  }

  // ===========================================================================
  // recordFix
  // ===========================================================================

  /**
   * 记录修复 — 完整管道（含 Hypothesis gate）：
   * 1. 创建修复 Atom
   * 2. 创建 Hypothesis → validate → canPromote 门控
   * 3. compile（仅当 canPromote 通过）
   * 4. Evidence 绑定精确 compiledRefIds（仅 compile 成功）
   * 5. Story resolve（compile 成功 → success，否则 → partial）
   * 6. myelinate + RegulationView.buildAll
   */
  recordFix(input: FixInput): FixResult {
    const outcome: InterventionOutcome = input.interventionOutcome ?? 'mechanism_confirmed';
    const fallbackTime = new Date().toISOString();
    const existingStory = this.stories.get(input.storyId);
    const storySnapshot: Story = existingStory ?? {
      id: input.storyId,
      rawInput: input.fixDescription,
      context: input.context ?? {},
      observationAtomIds: [],
      candidatePaths: [],
      executedSkillIds: [],
      status: 'open',
      operator: input.operator ?? 'system',
      createdAt: fallbackTime,
      updatedAt: fallbackTime,
    };

    // ─── EpisodeEvent 辅助 ────────────────────────────────────────────────
    const episodeEventIds: string[] = [];
    const appendEv = (kind: EpisodeEventKind, refId?: string, payload: Record<string, unknown> = {}): string => {
      const ev = createEpisodeEvent({
        episode_id: input.storyId,
        seq: this.episodeEvents.nextSeq(input.storyId),
        kind,
        ref_id: refId,
        payload,
      });
      this.episodeEvents.append(ev);
      return ev.id;
    };

    // Step 1: 创建修复 Atom（ACTION 类型）
    const fixAtom = this.graph.addAtom(input.fixDescription, AtomKind.ACTION);

    // Step 2: 如果提供了正确路径，走 Hypothesis gate
    let compile: CompileResult | undefined;
    let evidenceCount = 0;
    let hypothesisId: string | undefined;
    let pathWithFix: string[] | undefined;

    if (input.chosenPathAtomIds && input.chosenPathAtomIds.length >= 2) {
      // 确保修复 Atom 在路径中
      pathWithFix = input.chosenPathAtomIds.includes(fixAtom.id)
        ? input.chosenPathAtomIds
        : [...input.chosenPathAtomIds, fixAtom.id];

      // Step 2a: 创建 Hypothesis（暂存候选推断）
      // 取路径首尾作为 claim
      const firstAtomId = pathWithFix[0];
      const lastAtomId  = pathWithFix[pathWithFix.length - 1];
      const hypothesis  = this.hypotheses.create({
        claim:            { fromAtomId: firstAtomId, toAtomId: lastAtomId, kind: 'causes' },
        forceUpperBound:  'contributory',
        evidencePolicy:   'revalidate',
        storyId:          input.storyId,
        sourceDescription: input.fixDescription,
      });
      hypothesisId = hypothesis.id;
      episodeEventIds.push(appendEv('hypothesis_created', hypothesis.id, { claim: hypothesis.claim }));

      // Step 2b: Validate hypothesis（提供 outcome；此时尚无 compiled evidence，传空列表）
      this.hypotheses.validate(hypothesis.id, [], outcome);
      episodeEventIds.push(appendEv('hypothesis_validated', hypothesis.id, { outcome }));

      // Step 2c: 检查 canPromote
      const promoteCheck = this.hypotheses.canPromote(hypothesis.id);

      if (promoteCheck.allowed) {
        // Step 2d: compile（路径合法性由 compile 内部的 RefAlgebra 检查保证）
        compile = this.graph.compile(
          { atomIds: pathWithFix },
          input.failedPathAtomIds?.map(ids => ({ atomIds: ids }))
        );

        // Step 2e: 只有 compile 真正写入了才记录 Evidence
        if (compile.compiledRefs > 0) {
          for (const refId of compile.compiledRefIds) {
            recordSupport(this.evidence, refId, 'fix', input.storyId, 0.85, input.context);
            evidenceCount++;
          }
          episodeEventIds.push(appendEv('compile_applied', `compile:${input.storyId}`, { compiledRefs: compile.compiledRefs }));
        } else {
          episodeEventIds.push(appendEv('compile_blocked', undefined, { reason: 'compiledRefs=0' }));
        }
      } else {
        // canPromote 未通过 → compile 保持 undefined，story 将标记 partial
        episodeEventIds.push(appendEv('compile_blocked', undefined, { reason: 'canPromote_failed' }));
      }
    }

    // Step 3: 创建并裁决 MechanismInstance（D2：先于 Reconstruction 创建）
    // source_kind='path_projection'：当前为过渡态，路径 Atom 作为 slot 绑定代理
    const miBindings: Record<string, string> = {};
    const pathForBindings = pathWithFix ?? storySnapshot.observationAtomIds;
    pathForBindings.forEach((atomId, i) => { miBindings[`slot_${i}`] = atomId; });

    // D3: 使用 proxy:* 前缀，不伪造真实 MechanismClass ID
    const mechanismClassRef = hypothesisId
      ? `proxy:hyp_${hypothesisId}`
      : `proxy:episode_${input.storyId}`;

    const rawMechanismInstance = createMechanismInstance({
      episode_id: input.storyId,
      mechanism_class_ref: mechanismClassRef,
      bindings: Object.keys(miBindings).length > 0 ? miBindings : { slot_0: fixAtom.id },
      source_kind: 'path_projection',
      source_ref: compile ? `compile:${input.storyId}` : null,
      claim_ids: hypothesisId ? [hypothesisId] : [],
      created_by: 'pipeline_s4',
    });
    episodeEventIds.push(appendEv('mechanism_instance_created', rawMechanismInstance.id, { mechanism_class_ref: mechanismClassRef }));

    // Step 3b: 如果 accepted 路径存在且有 hypothesisId，生成最小 SupportLink
    // 语义：ObservationRecord → Claim（真实 ObservationRecord id，不借用 Atom id）
    const generatedSupportLinks: SupportLink[] = [];
    if (compile && compile.compiledRefs > 0 && hypothesisId) {
      // 优先从 ObservationRecordStore 取已落盘的真实 record
      const obsRecords = this.observationRecords.listByEpisode(input.storyId);
      const firstObsRecord = obsRecords[0];
      if (firstObsRecord) {
        const sl: SupportLink = {
          id: `SL_${input.storyId}_${crypto.randomBytes(4).toString('hex')}`,
          observationRecordId: firstObsRecord.id,   // 真实 ObservationRecord.id
          claimId: hypothesisId,
          polarity: 'supports',
          weight: 0.7,
          sourceKind: 'pipeline',
          sourceRef: `compile:${input.storyId}`,
          createdAt: new Date().toISOString(),
          createdBy: 'pipeline_recordfix',
        };
        this.supportLinks.save(sl);
        generatedSupportLinks.push(sl);
      }
    }

    const mechanismInstance: MechanismInstance = compile && compile.compiledRefs > 0
      ? acceptInstance(rawMechanismInstance, {
          claim_ids: hypothesisId ? [hypothesisId] : [],
          // support_link_refs 必须引用真实 SupportLink.id，不得混入 compiledRefIds
          support_link_refs: generatedSupportLinks.map(sl => sl.id),
        })
      : rejectInstance(rawMechanismInstance, compile
          ? '路径 compile 成功但 compiledRefs=0'
          : (hypothesisId ? 'canPromote 门控未通过' : '无有效路径'));
    episodeEventIds.push(appendEv(
      mechanismInstance.status === 'accepted' ? 'mechanism_instance_accepted' : 'mechanism_instance_rejected',
      mechanismInstance.id,
      { status: mechanismInstance.status }
    ));

    // 落盘 MechanismInstance
    this.mechanismInstances.save(mechanismInstance);

    // Step 4: 创建 AcceptedReconstruction（D2：用 mechanismInstance.id 写入）
    // 预生成 traceId，供 reconstruction 和 DerivationTrace 双向互链
    const preTraceId = `DT_${input.storyId}_${crypto.randomBytes(4).toString('hex')}`;
    const reconstruction = createAcceptedReconstruction({
      episodeId: input.storyId,
      chosenPathAtomIds: pathWithFix ?? storySnapshot.observationAtomIds,
      observationAtomIds: storySnapshot.observationAtomIds,
      derivationChainId: hypothesisId ? `DC_${input.storyId}_${hypothesisId}` : undefined,
      traceId: preTraceId,
      selectedMechanismIds: [mechanismInstance.mechanism_class_ref],
      ontologySnapshotRef: 'ontology_current',
      // P1：只在 accepted 时写入，rejected 路径不得绑定被否决的 bridge 对象
      mechanismInstanceIds: mechanismInstance.status === 'accepted' ? [mechanismInstance.id] : [],
    });

    // 创建并落盘 DerivationTrace（与 reconstruction 双向互链）
    const trace = createDerivationTrace({
      id: preTraceId,
      episodeId: input.storyId,
      reconstructionId: reconstruction.id,
      contextKind: 'reconstruction',
      premiseClaimIds: hypothesisId ? [hypothesisId] : [],
      rejectedClaimIds: mechanismInstance.status === 'rejected' ? [mechanismInstance.id] : [],
      createdBy: 'pipeline_recordfix_shell',
      supportLinks: generatedSupportLinks,
    });
    this.derivationTraces.save(trace);
    episodeEventIds.push(appendEv('reconstruction_written', reconstruction.id, { traceId: preTraceId, fidelityScore: reconstruction.fidelity.score }));

    // Step 5: 生成 OntologyDelta（D1：所有路径均返回 OntologyDelta，不再用独立 NoUpdateReason）
    let ontologyUpdate: OntologyDelta;
    if (compile && compile.compiledRefs > 0 && pathWithFix && pathWithFix.length >= 2) {
      const changes = pathWithFix.slice(0, -1).map((fromAtomId, index) =>
        buildRelationChange(fromAtomId, pathWithFix![index + 1], input.storyId)
      );
      ontologyUpdate = createOntologyDelta(
        input.storyId,
        reconstruction,
        [hypothesisId ?? fixAtom.id],
        changes
      );
    } else {
      const reasonKind =
        input.chosenPathAtomIds && input.chosenPathAtomIds.length >= 2
          ? (hypothesisId ? 'pending_more_evidence' : 'episode_inconclusive')
          : (reconstruction.fidelity.score >= 0.9 ? 'ontology_sufficient' : 'episode_inconclusive');

      ontologyUpdate = createOntologyDeltaNone(
        input.storyId,
        reconstruction,
        hypothesisId ? [hypothesisId] : [],
        {
          reason_kind: reasonKind,
          explanation: reasonKind === 'ontology_sufficient'
            ? '当前 Ontology 已能充分解释该 Episode。'
            : reasonKind === 'pending_more_evidence'
              ? '已生成 Reconstruction，但现有证据不足以安全提交 OntologyDelta。'
              : '当前 Episode 的证据链仍不足以生成稳定的 Ontology 更新。',
          follow_up: reasonKind === 'pending_more_evidence'
            ? '补充更多已接受的 claim 或更明确的证据再重试。'
            : null,
        }
      );
    }

    episodeEventIds.push(appendEv('ontology_delta_written', ontologyUpdate.id, { kind: ontologyUpdate.kind }));

    // Step 6: 根据 compile 结果决定 Story 状态
    let story: Story;
    if (compile && compile.compiledRefs > 0) {
      // compile 成功 → resolve + markCompiled + myelinate
      story = (this.stories.resolve(input.storyId, 'success', input.fixDescription)
                ?? this.stories.get(input.storyId)
                ?? storySnapshot) as Story;
      this.stories.markCompiled(input.storyId);
      this.graph.myelinate({ minUseCount: 3, minWeight: 0.6 });
    } else if (input.chosenPathAtomIds && input.chosenPathAtomIds.length >= 2) {
      // 提供了路径但 compile 被拒绝（canPromote 门控未通过或路径不合法）
      const reason = compile
        ? '路径不合法'
        : (hypothesisId ? 'canPromote 门控未通过' : '编译未执行');
      story = (this.stories.resolve(input.storyId, 'partial', `编译未通过：${reason}`)
                ?? this.stories.get(input.storyId)
                ?? storySnapshot) as Story;
    } else {
      // 没有提供路径 → 仅记录修复描述，直接 resolve
      story = (this.stories.resolve(input.storyId, 'success', input.fixDescription)
                ?? this.stories.get(input.storyId)
                ?? storySnapshot) as Story;
    }

    episodeEventIds.push(appendEv('outcome_recorded', story.id, { outcome: story.outcome, status: story.status }));

    // Step 7: 生成 Regulation 视图 + Episode
    const regulationViews = this.rvBuilder.buildAll({ minWeight: 0.3 });
    // 全量查询：含 submitObservation 阶段写入的 observation_recorded
    const allEpisodeEventIds = this.episodeEvents.getByEpisode(input.storyId).map(e => e.id);
    // 从 ObservationRecordStore 查真实落盘 ID（submitObservation 阶段已写入）
    const episodeObsRecordIds = this.observationRecords.listByEpisode(input.storyId).map(r => r.id);
    const episode: Episode = {
      ...toEpisode(story),
      acceptedReconstructionId: reconstruction.id,
      ontologyDeltaId: ontologyUpdate.id,  // D1：所有路径均有 id
      episodeEventIds: allEpisodeEventIds,
      observationRecordIds: episodeObsRecordIds,
    };

    // Step 8: 生成 Conclusion（v7 §10 条件 5）
    const conclusion: Conclusion = {
      answer: story.outcomeNotes ?? input.fixDescription,
      confidence: reconstruction.fidelity.score,
      recommendedActions: compile && compile.compiledRefs > 0
        ? [`编译路径已落盘，${compile.compiledRefs} 条 Ref 可供后续重建使用`]
        : undefined,
    };

    return {
      story,
      episode,
      reconstruction,
      conclusion,
      mechanismInstance,
      ontologyUpdate,
      compile,
      evidenceCount,
      regulationViews,
    };
  }

  // ===========================================================================
  // search
  // ===========================================================================

  /**
   * 智能搜索 — 先分类，再在图中探索候选路径，最后匹配 Regulation 视图
   */
  search(
    query: string,
    context?: ContextScope
  ): {
    classification?: ClassifyResult;
    paths: PathResult[];
    regulations: RegulationView[];
    suggestions: string[];
  } {
    const suggestions: string[] = [];

    // Step 1: 分类
    const classified   = this.problemClasses.classify(query);
    const classification = classified.length > 0 ? classified[0] : undefined;

    // Step 2: 在图中搜索相关 Atoms（fact + concept 类型）
    const atoms   = this.graph.findAtoms(query, undefined, 10);
    const factIds = atoms
      .filter(a => a.kind === AtomKind.FACT || a.kind === AtomKind.CONCEPT)
      .map(a => a.id);

    // Step 3: explore
    let paths: PathResult[] = [];
    if (factIds.length > 0) {
      const result = this.graph.explore(factIds, { maxDepth: 3, maxPaths: 10 });
      paths = result.paths;
    }

    // Step 4: Regulation 视图搜索
    const regulations = this.rvBuilder.search(query, 5);

    // Step 5: 生成建议
    if (classification) {
      suggestions.push(`问题类型: ${classification.problemClassId}`);
    }
    if (paths.length > 0) {
      suggestions.push(`找到 ${paths.length} 条因果路径`);
    }
    if (regulations.length > 0) {
      suggestions.push(`匹配 ${regulations.length} 条因果规律`);
    }
    if (paths.length === 0 && regulations.length === 0) {
      suggestions.push('暂无匹配的因果路径或规律，继续积累观测数据');
    }

    return { classification, paths, regulations, suggestions };
  }

  // ===========================================================================
  // getStats
  // ===========================================================================

  /**
   * 获取管道整体统计信息
   */
  getStats(): PipelineStats {
    const gs  = this.graph.getStats();
    const ss  = this.stories.getStats();
    const es  = this.evidence.getStats();
    const ps  = this.problemClasses.getStats();
    const pts = this.patterns.getStats();
    const rv  = this.rvBuilder.buildAll();
    const hs  = this.hypotheses.getStats();

    return {
      graph: {
        atomCount:     gs.atomCount,
        refCount:      gs.refCount,
        shortcutCount: gs.shortcutCount,
      },
      stories: {
        total:      ss.total,
        resolved:   ss.byStatus?.['resolved'] ?? 0,
        uncompiled: ss.uncompiledCount,
      },
      evidence: {
        total:       es.total,
        supports:    es.byVerdict?.supports    ?? 0,
        contradicts: es.byVerdict?.contradicts ?? 0,
      },
      problemClasses: ps.problemClassCount,
      templates:      pts.templateCount,
      regulations:    rv.length,
      hypotheses: {
        total:           hs.total,
        open:            hs.byStatus?.['open']      ?? 0,
        validated:       hs.byStatus?.['validated'] ?? 0,
        readyForCompile: hs.readyForCompile,
      },
      mechanismInstances: this.mechanismInstances.getStats(),
      derivationTraces:   this.derivationTraces.getStats(),
      episodeEvents:      this.episodeEvents.getStats(),
      supportLinks:       this.supportLinks.getStats(),
      observationRecords: this.observationRecords.getStats(),
    };
  }

  // ===========================================================================
  // close
  // ===========================================================================

  /**
   * 关闭所有数据库连接
   */
  close(): void {
    this.graph.close();
    this.stories.close();
    this.evidence.close();
    this.problemClasses.close();
    this.patterns.close();
    this.hypotheses.close();
    this.mechanismInstances.close();
    this.derivationTraces.close();
    this.episodeEvents.close();
    this.supportLinks.close();
    this.observationRecords.close();
    // rvBuilder 不拥有独立 DB 连接，无需单独关闭
  }
}
