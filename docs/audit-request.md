# BestQ-A 代码审计请求

## 项目简介

BestQ-A 是一个**异常驱动的因果学习系统**，核心目标：从反复出现的观测中归纳因果规律，用这些规律解释新问题。

设计经历了 v1-v6 的演化：`树 → 集合 → 链 → 分层 → 图 → 关系代数`。

当前系统核心是 v5/v6 架构：**Atom/Ref/Shortcut 知识图谱 + RefAlgebra 复合规则 + PatternTemplate 小范畴模板 + Hypothesis 一等假设 + Pipeline 闭环编排**。

技术栈：TypeScript + better-sqlite3 + MCP SDK，零外部 AI 依赖。

---

## 项目规模

- **17,553 行** TypeScript
- **31 个源文件**（24 core + 6 tools + 1 entry）
- **44 个 MCP 工具**
- **100+ 项测试**全部通过

---

## 架构总览

### 三层架构

```
┌──────────────────────────────────┐
│  接口层: Regulation View / MCP    │  对外兼容、人类可读
├──────────────────────────────────┤
│  流程层: Pipeline / Story / Hyp   │  运行时推理、学习闭环
├──────────────────────────────────┤
│  真相层: Atom / Ref / Shortcut    │  知识底座、SSOT
└──────────────────────────────────┘
```

### 数据流

```
输入 → ProblemClass.classify → Story.create → Atom.ingest
  → explore(RefAlgebra 约束) → PatternTemplate.match
  → Hypothesis.create(跨层推断)
  → Skill.execute → recordFix
  → Story.resolve → Evidence.record → compile(路径合法性检查)
  → Hypothesis.validate → canPromote(门控)
  → RegulationView.build → myelinate(Shortcut)
```

---

## 核心模块清单

### 真相层

| 文件 | 行数 | 职责 |
|------|------|------|
| `atom-graph.ts` | 1325 | Atom/Ref/Shortcut SQLite 图存储、explore(含 RefAlgebra 剪枝)、compile(含路径合法性预检)、myelinate、ingestFacts、CONJUNCTION 合取节点、canonicalKey 去重、provenance/contextScope |
| `ref-algebra.ts` | 420 | 四族分类(structural/explanatory/evidential/interventional)、RefForce(necessary/sufficient/contributory/analogical)、17 条合法 + 7 条禁止复合规则、EvidencePolicy(inherit/revalidate/discard)、validatePathRich(proof-carrying)、闭世界假设 |
| `regulation-view.ts` | 595 | Regulation 只读投影(从 compiled Ref 物化)、CONJUNCTION 展开、LegacyRegulation 兼容映射、status 映射(avgWeight+evidence → confirmed/hypothesis/candidate) |

### 假设层

| 文件 | 行数 | 职责 |
|------|------|------|
| `hypothesis.ts` | 691 | 一等假设对象(evidential→explanatory 跨层产物)、InterventionOutcome(mechanism_confirmed/symptom_relieved/workaround_only/no_effect/side_effect)、canPromote 四项门控(状态/outcome 强度/evidence/force 上界)、"修复成功≠解释正确" |

### 证据层

| 文件 | 行数 | 职责 |
|------|------|------|
| `evidence.ts` | 560 | append-only EvidenceStore、EvidenceRecord(sourceType/contextSnapshot/supportsOrContradicts/confidence)、getSummary 聚合、isEvidenceHealthy 健康检查 |

### 学习层

| 文件 | 行数 | 职责 |
|------|------|------|
| `story.ts` | 749 | Story/Case 完整生命周期(open→exploring→executing→resolved)、ContextScope 结构化接口(scopeContains/Overlaps/Merge)、getResolvedForCompile、markCompiled |
| `pipeline.ts` | 479 | CausalPipeline 闭环编排：submitObservation(ingest→classify→story→explore→match)、recordFix(compile→evidence→myelinate→view)、search(classify→explore→regulations) |

### 分类层

| 文件 | 行数 | 职责 |
|------|------|------|
| `problem-class.ts` | 734 | ProblemClass(签名匹配 classify、SubgraphConstraint)、Strategy(步骤化协议)、6 种子 ProblemClass + 1 种子 Strategy、seedDefaults |

### 模板层

| 文件 | 行数 | 职责 |
|------|------|------|
| `pattern-template.ts` | 963 | PatternTemplate(小范畴模板)、PatternSlot(含 SlotFingerprint 指纹约束)、PatternArrow、InvariantCheckDef(可执行 DSL)、PatternInstance(函子实例化)、matchTemplates(DFS 枚举+回溯)、evaluateInvariants/canCompile 门控、suggestTemplates(模式涌现)、3 种子模板(diagnostic/dependency/regression) |

### 技能层

| 文件 | 行数 | 职责 |
|------|------|------|
| `skill.ts` | 530 | Skill(输入输出契约、sideEffects/idempotent/autoExecutable)、SkillRegistry(CRUD + 执行统计 + successRate)、boundAtomId(ACTION Atom 绑定)、3 种子 Skill |

### 检索增强层（参考 Sirchmunk）

| 文件 | 行数 | 职责 |
|------|------|------|
| `fuzzy-matcher.ts` | 633 | Levenshtein 距离、tokenSetRatio、FuzzyMatcher、calculateRelevanceScore(TF-IDF 重排序) |
| `monte-carlo-sampler.ts` | 536 | 蒙特卡洛证据采样(Fuzz 锚点→分层随机→高斯聚焦)、keywordScorer、小文档快速路径 |
| `react-search.ts` | 1005 | SearchContext(token budget)、ToolRegistry、4 种内置工具、ReActSearchAgent 循环、ruleBasedReasoner |
| `knowledge-cluster.ts` | 842 | KnowledgeCluster(lifecycle/confidence/hotness)、KnowledgeClusterStorage(SQLite)、buildClusterFromRegulations/Evidence |

### 旧层（v1-v4 兼容）

| 文件 | 行数 | 职责 |
|------|------|------|
| `types.ts` | 579 | Fact/Observation/Regulation/Event/Story(旧) 基础类型 |
| `storage.ts` | 628 | SqliteCausalStorage(旧 Regulation/Event 存储) |
| `dual-storage.ts` | 509 | 双层存储(session + longterm) |
| `explainer.ts` | 251 | Beam Search 后向链解释器 |
| `detector.ts` | 196 | 异常检测(processObservation) |
| `inducer.ts` | 222 | 归纳引擎(clusterEvents → induceRegulation) |
| `validator.ts` | 319 | 验证器(validateCandidate → promoteOrDemote) |
| `keywords.ts` | 320 | TF-IDF 关键词提取 |
| `unify.ts` | 163 | 合一算法(unifyFact/substituteFact) |

---

## 设计合同

### 全局合同

- **`docs/current/metamodel.md`** — 唯一语义底座，定义 5 个并列模块 + 8 条不变量 + 8 个指标

### 局部合同

- **`docs/current/ref-algebra-contract.md`** — 复合规则、force 约束、evidencePolicy、proof 失效
- **`docs/current/template-invariant-contract.md`** — SlotFingerprint、InvariantCheck、模板生命周期、涌现治理

### 设计历史

- `v1_recursive_decomposition.md` → `v2_abstraction_classes.md` → `v3_semantic_chain.md` → `v4_composable_knowledge.md` → `v5_zettelkasten_dual_mode.md` → `v6_categorical_relations.md`

---

## 系统不变量（来自 metamodel.md）

1. **图是唯一写模型** — 所有知识变更先落 Atom/Ref
2. **Regulation 只是读视图** — compiled Ref 的投影
3. **Shortcut 不可写入真相层** — 只由 myelinate 创建
4. **compile 只能基于 Story/Evidence** — 不可凭空强化 Ref
5. **删除 Ref 必须联动 Shortcut 失效**
6. **ProblemClass 在图外** — 路由器，不是 Atom
7. **Atom 写自由，删受限** — 只有 prune 可删
8. **Evidence 不可篡改** — append-only

---

## 关键设计决策

### 1. evidential vs world-state 分层

```
世界模型层: causes, requires, fixes, prevents, is_a, part_of → 可产生 compiled Ref
认识论层:   indicates, cooccurs, similar_to → 只能产生 Hypothesis，不能直接写入 compiled Ref
```

`indicates ∘ causes → FORBIDDEN`（征兆不能压缩为根因）

### 2. "修复成功 ≠ 解释正确"

InterventionOutcome 五级：mechanism_confirmed > symptom_relieved > workaround_only > no_effect > side_effect

canPromote 门控：只有 `validated` + `outcome ≥ symptom_relieved` + `有 Evidence` + `force ≠ analogical` 才允许升级为 compiled Ref

### 3. 合取条件显式化

`A && B → C` 不拆成 `A→C` + `B→C`，用 CONJUNCTION Atom 表达：
```
A --part_of--> Conjunction
B --part_of--> Conjunction
Conjunction --causes--> C
```

### 4. Pipeline 闭环

```
submitObservation: ingest → classify → story → explore(RefAlgebra) → patternMatch
recordFix:         compile → evidence → myelinate → regulationView
```

---

## 请审计的重点

1. **ref-algebra.ts 的接口面** — 复合规则表是否完备？force 降级是否正确？证据策略映射是否合理？
2. **Story → Hypothesis → Compile 这条链** — canPromote 门控是否足够严格？InterventionOutcome 的粒度是否合适？
3. **atom-graph.ts 的 explore/compile** — RefAlgebra 剪枝是否正确接入 BFS？compile 的路径预检是否有遗漏？
4. **pattern-template.ts 的匹配算法** — DFS 枚举是否正确？InvariantCheck DSL 是否足够？SlotFingerprint 是否真正参与匹配？
5. **pipeline.ts 的编排** — 各模块的调用顺序是否正确？错误处理是否充分？资源管理是否安全？
6. **整体架构** — 24 个模块的职责边界是否清晰？是否有不该存在的耦合或遗漏的连接？

---

## 如何获取完整源码

所有源码在 `causal-learner/mcp-server/src/` 下。如需查看任何文件的完整实现，请指定文件路径。
