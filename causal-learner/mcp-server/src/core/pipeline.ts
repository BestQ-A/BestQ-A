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
}

/** 记录修复的完整结果 */
export interface FixResult {
  /** 更新后的 Story */
  story: Story;
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

  private rvBuilder: RegulationViewBuilder;
  private config: PipelineConfig;

  constructor(config: Partial<PipelineConfig> = {}) {
    const resolved: PipelineConfig = {
      graphDbPath:       config.graphDbPath       ?? ':memory:',
      storyDbPath:       config.storyDbPath       ?? ':memory:',
      evidenceDbPath:    config.evidenceDbPath    ?? ':memory:',
      problemClassDbPath: config.problemClassDbPath ?? ':memory:',
      patternDbPath:     config.patternDbPath     ?? ':memory:',
      autoClassify:      config.autoClassify      ?? true,
      autoExplore:       config.autoExplore       ?? true,
      seedDefaults:      config.seedDefaults      ?? true,
    };
    this.config = resolved;

    this.graph         = new AtomGraph(resolved.graphDbPath);
    this.stories       = new StoryStorage(resolved.storyDbPath);
    this.evidence      = new EvidenceStore(resolved.evidenceDbPath);
    this.problemClasses = new ProblemClassRegistry(resolved.problemClassDbPath);
    this.patterns      = new PatternEngine(resolved.patternDbPath);
    // RegulationViewBuilder 直接读 AtomGraph 的 DB（只读视图，不建自己的表）
    this.rvBuilder     = new RegulationViewBuilder(this.graph.db);

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
   * 记录修复 — 完整管道：
   * 1. Story.resolve → 更新状态
   * 2. compile → 强化正确路径，削弱失败路径
   * 3. Evidence.record → 为每条有效边记录支持证据
   * 4. Story.markCompiled → 标记已消费
   * 5. myelinate → 检查是否产生新快捷边
   * 6. RegulationView.buildAll → 更新视图
   */
  recordFix(input: FixInput): FixResult {
    // Step 1: 创建修复 Atom（ACTION 类型）
    const fixAtom = this.graph.addAtom(input.fixDescription, AtomKind.ACTION);

    // Step 2: compile（如果提供了正确路径）
    let compile: CompileResult | undefined;
    if (input.chosenPathAtomIds && input.chosenPathAtomIds.length >= 2) {
      // 确保修复 Atom 在路径末尾
      const pathWithFix = input.chosenPathAtomIds.includes(fixAtom.id)
        ? input.chosenPathAtomIds
        : [...input.chosenPathAtomIds, fixAtom.id];

      compile = this.graph.compile(
        { atomIds: pathWithFix },
        input.failedPathAtomIds?.map(ids => ({ atomIds: ids }))
      );
    }

    // Step 3: 解决 Story
    const resolvedStory = this.stories.resolve(input.storyId, 'success', input.fixDescription);

    // Step 4: 为路径上的每条有效 Ref 记录支持证据
    let evidenceCount = 0;
    if (compile && input.chosenPathAtomIds && input.chosenPathAtomIds.length >= 2) {
      for (let i = 0; i < input.chosenPathAtomIds.length - 1; i++) {
        const from = input.chosenPathAtomIds[i];
        const to   = input.chosenPathAtomIds[i + 1];

        // 找到对应的出向 Ref
        const neighbors = this.graph.getNeighbors(from, { direction: 'outgoing' });
        const matched   = neighbors.find(n => n.atom.id === to);
        if (matched) {
          recordSupport(
            this.evidence,
            matched.ref.id,
            'fix',
            input.storyId,
            0.85,
            input.context
          );
          evidenceCount++;
        }
      }
    }

    // Step 5: 标记 Story 已被 compile 消费
    this.stories.markCompiled(input.storyId);

    // Step 6: 尝试髓鞘化（高频 compiled 路径 → 快捷边）
    this.graph.myelinate({ minUseCount: 3, minWeight: 0.6 });

    // Step 7: 生成 Regulation 视图
    const regulationViews = this.rvBuilder.buildAll({ minWeight: 0.3 });

    return {
      story:           resolvedStory ?? this.stories.get(input.storyId)!,
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
    // rvBuilder 不拥有独立 DB 连接，无需单独关闭
  }
}
