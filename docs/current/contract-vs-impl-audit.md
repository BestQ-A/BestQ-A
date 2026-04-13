---
kind: record
event: "2026-04-13 契约实现偏差盘点"
recorded_at: 2026-04-13
immutable: true
---

# 契约 vs 实现审计（2026-04-13）

> 本文档盘点 `docs/current/` 下 4 份新契约（artifact / metrics / knowledge-source / memory-layer）与 `causal-learner/mcp-server/src/` 实际代码之间的偏差。
> 对齐项不展开；仅列偏差、严重度、建议行动。审计者：general-purpose agent，未修改任何既有文件。

---

## 审计范围

**契约（被审计）**

- `docs/current/artifact-contract.md`
- `docs/current/metrics-contract.md`
- `docs/current/knowledge-source-contract.md`
- `docs/current/memory-layer-contract.md`

**背景对照（已对齐代码的契约，不审计）**

- `architecture-overview.md`、`pipeline-contract.md`、`compile-promotion-contract.md`、`metamodel.md`

**真实代码**

- `causal-learner/mcp-server/src/index.ts`（MCP 工具注册总表）
- `causal-learner/mcp-server/src/core/`：`pipeline.ts`、`storage.ts`、`dual-storage.ts`、`atom-graph.ts`、`types.ts`、`hypothesis.ts`、`story.ts`、`evidence.ts`、`problem-class.ts`、`pattern-template.ts`、`knowledge-cluster.ts`
- `causal-learner/mcp-server/src/tools/`：`graph.ts`、`induction.ts`、`observation.ts`、`query.ts`、`search.ts`、`swebench.ts`
- `causal-learner/mcp-server/package.json`

---

## 偏差清单

| # | 契约文件 | 契约声明 | 实际代码 | 严重度 | 建议行动 |
|---|---------|----------|----------|--------|----------|
| 1 | metrics-contract.md | `regulations_confirmed` 由 `get_stats` 采集 | `get_stats` 调用 `pipeline.getStats()`（pipeline.ts:468-503），返回结构 **不含** `regulations_confirmed` 字段，只含扁平的 `regulations: rv.length`（pipeline.ts:495） | **blocker** | 改契约：`regulations_confirmed` 应来自 `get_dual_stats().regulationsByStatus.confirmed`（storage.ts:488-496）或 `get_longterm_stats`，不是 `get_stats` |
| 2 | metrics-contract.md | `events_open` 由 `get_stats` 采集 | 同上，`get_stats`（即 `pipeline.getStats`）**不含 events 维度**，只含 `stories.{total,resolved,uncompiled}`（pipeline.ts:483-487）。Event 计数在 `get_dual_stats().eventsByStatus.open`（storage.ts:474-482） | **blocker** | 改契约采集口径：`events_open` ← `get_dual_stats`，并且应理解为 `eventsByStatus.open` |
| 3 | metrics-contract.md | 字段表声称 `get_stats` 是统一来源 | 真实代码里有 **三个独立 stats 工具**：`get_stats`（pipeline 视图）、`get_dual_stats`（事件/规则视图）、`get_longterm_stats`（仅长期库），还有 `graph_stats`（图维度）。语义截然不同 | major | metrics 契约必须按工具拆列字段来源；artifact-contract.md `stats_before/after.json` 应保存全部三类 |
| 4 | artifact-contract.md | "运行前 causal-learner 三类 stats 快照" | "三类"未定义；代码里至少有 4 类（`get_stats` / `get_dual_stats` / `get_longterm_stats` / `graph_stats`），还有 `knowledge-cluster.getStats`、`hypothesis.getStats`、`story.getStats` 在 pipeline 内部聚合但未暴露为独立工具 | major | 把"三类"显式枚举为 `get_stats` + `get_dual_stats` + `get_longterm_stats` + `graph_stats`；或在 artifact-contract 注脚里指明只快照前 3 个 |
| 5 | knowledge-source-contract.md | 代码位置（计划）：`core/knowledge-ingest.ts + knowledge-index.ts` | **两个文件都不存在**。`core/` 下唯一相关文件是 `knowledge-cluster.ts`（事件聚类，非 markdown ingest） | **blocker（信息）** | 契约自己写了"（计划）"，不算虚构，但 Phase 1 启动前必须落地 ADR：`knowledge-cluster` ≠ `knowledge-ingest`，且复用还是新建要明确 |
| 6 | knowledge-source-contract.md | `kb_nodes` / `kb_signals` / `kb_vectors` 表，前缀 `kb_` | `Grep` 全仓未发现任何 `kb_` 前缀的 SQL/表/常量。现存表只有：`atoms`、`atom_aliases`、`refs`、`shortcuts`、`stories`、`hypotheses`、`evidence`、`observations`、`events`、`regulations`、`problem_classes`、`strategies`、`pattern_templates`、`pattern_instances`、`skills`、`knowledge_clusters` | **blocker（信息）** | 全新表，需要 ADR 与迁移脚本；契约要明确"Phase X 才落库"，否则被误读为已存在 |
| 7 | knowledge-source-contract.md | "`hash(content)` 缓存" / "Stage A/B ingest 管线" | 全无对应代码雏形，连 frontmatter 解析器都没有；`docs/knowledge_base/composites/**` 是否存在也未在代码里被引用 | **blocker（信息）** | 标记为 "0% 实现"；Phase 1 不能依赖 |
| 8 | memory-layer-contract.md | 五类存储中 `case_memory` → `cases` 表（新增） | **不存在**。`core/` 下无 `case-memory.ts`，无 `cases` 表 | **blocker（信息）** | 契约自己写了"（计划）"；但 retrieval order 第 1 步直接 `case_memory.lookup(fingerprint)` 在 Phase 1 完全无法实现 |
| 9 | memory-layer-contract.md | 五类存储中 `lesson_ledger` → `lessons` 表（新增） | 同上，无 `lesson-ledger.ts`，无 `lessons` 表 | **blocker（信息）** | retrieval order 第 5 步"miss 必须写 lesson ledger"在 Phase 1 不可执行 |
| 10 | memory-layer-contract.md | 第 2 步 `regulation_store.match(signals)` → 命中 confirmed 规则即返回 cause chain | 真实方法是 `dualStorage.loadRelevantKnowledge(observation)`（dual-storage.ts:119-175）。语义差异：① 输入是 `Observation.facts[].pred`，不是抽象 `signals`；② 实现是 **predicate exact-string match**（`searchRegulationsByEffect`），不区分 confirmed/hypothesis/candidate（dual-storage.ts:146-158 只过滤 retired）；③ 返回值是 `LoadRelevantResult { loaded, predicatesMatched, regulationIds, message }`，**不返回 cause chain**；④ 命中后会写入短期缓存（有副作用），与契约的"早返回纯读"不符 | **major** | 改契约：第 2 步要么改名 `regulation_store.loadRelevant(observation)`，要么承认需要新建一层 confirmed-only 过滤 + cause chain 物化 |
| 11 | memory-layer-contract.md | "命中即停"的 retrieval 串行入口 `retrieve(problem, context)` | 代码里**没有这样的统一入口**。`pipeline.search()`（pipeline.ts:419-458）走的是 classify → findAtoms → explore → regulationView 投影，与五层 retrieval order 完全不是同一抽象 | **blocker** | 要么新建 `retrieval.ts` 实现统一入口，要么改契约承认"五层 retrieval order 是 Phase 2+ 目标，Phase 1 仍走 pipeline.search" |
| 12 | memory-layer-contract.md | regulation 状态机 `候选/假设/确认` | 代码里 `RegulationStatus = candidate | hypothesis | confirmed | retired`（storage.ts:488，types.ts），多一个 `retired` 状态契约未提 | minor | 契约表格补充 `retired` 状态 |
| 13 | artifact-contract.md / metrics-contract.md | `mean_tree_depth` / `context_chars_p50/p95` / `kb_compile_duration_sec` 等 P1+ 字段 | 代码层完全没有"solution tree"或"context formatter"概念；`pipeline.search` 返回 `paths` 但没有"tree depth"度量 | major（提醒） | 这些是注入层指标，需要在 BestQA harness（尚未实现）里采集，契约应明确"非 causal-learner 责任" |
| 14 | metrics-contract.md | "MCP 16 个工具"——契约虽未直接说，但 artifact-contract 隐含了"轻量"印象 | 实际 `index.ts` 注册了 **44 个 MCP 工具**（index.ts:150-687，逐项核对：submit_observation、batch_submit_observations、reevaluate_event、list_events、get_event、list_regulations、get_regulation、add_regulation、update_event_status、update_regulation、delete_regulation、get_regulations_for_effect、get_regulations_with_precondition、get_stats、search_events、search_regulations、trigger_induction、create_cluster、import_swe_issue、record_fix、suggest_causes、analyze_swe_batch、flush_to_longterm、get_dual_stats、reset_session、get_longterm_stats、causal_search、fuzzy_search_regulations、fuzzy_search_events、build_knowledge_cluster、search_knowledge_clusters、sample_evidence、add_atom、add_ref、explore_graph、compile_path、myelinate_graph、query_graph、find_atoms、graph_stats、prune_graph、ingest_facts、set_test_mode、load_relevant_knowledge） | minor | 如果别处文档说"16 个工具"那是过时口径；本契约族应统一为 44 |
| 15 | artifact-contract.md | `commit` 字段 = `git rev-parse --short HEAD` | 无任何脚本生成 `metrics.json`；`scripts/*.mjs` 这层在仓里**不存在**（package.json 只有 `build/dev/start`，无 `test/eval/bench`）。`.github/workflows/ci.yml` 也未验证存在 | **blocker（信息）** | 契约里"代码位置：`scripts/*.mjs + .github/workflows/ci.yml`"是 vapor，需要标记为 "Phase 0 待建" |
| 16 | knowledge-source-contract.md | 检索约束：第 3 步调用本索引，输入 `signals` | retrieval 第 2 步与第 3 步在代码里都不存在；signals 概念本身在代码里没有结构化定义（最接近的是 `Observation.facts[].pred` 字符串） | major | 契约需引入 `Signal` 类型定义，或与 metamodel.md 的 `ContextScope` / `Atom` 关联 |
| 17 | memory-layer-contract.md | "SimpleMem 只读，第 4 步不得触发自动写入" | 代码里完全没有 SimpleMem 集成（grep 全仓 0 命中） | minor | 契约要么标 "Phase ≥2 才接入"，要么删除该层 |
| 18 | metrics-contract.md | `regulationsByStatus` 在 storage 层扁平字段是 `candidate/hypothesis/confirmed/retired` | metrics 字段里只有 `regulations_confirmed`，**未采集 candidate / hypothesis / retired**，丢失了 P1 阶段最有价值的"晋升漏斗"信号 | major | metrics 字段表追加 `regulations_candidate`、`regulations_hypothesis`、`regulations_retired` |

---

## 致命偏差（blocker）

### B1：metrics 字段采集来源张冠李戴（# 1, 2, 3）

`metrics-contract.md` 第 1 节字段表把 `regulations_confirmed`、`events_open` 都写成"采集方式：`get_stats`"。

但 `pipeline.getStats()`（[`pipeline.ts:468-503`](../../causal-learner/mcp-server/src/core/pipeline.ts)）的真实返回 shape 是：

```ts
{
  graph: { atomCount, refCount, shortcutCount },
  stories: { total, resolved, uncompiled },
  evidence: { total, supports, contradicts },
  problemClasses: number,
  templates: number,
  regulations: number,            // 注意：是 RegulationView 的总数，没有按 status 分桶
  hypotheses: { total, open, validated, readyForCompile },
}
```

**没有 `events_open`、没有 `regulations_confirmed`**。

正确来源在 `dual-storage.ts:351-366` 的 `getDualStats()`，它返回 `eventsByStatus`/`regulationsByStatus`（取自 [`storage.ts:465-505`](../../causal-learner/mcp-server/src/core/storage.ts)）：

```ts
eventsByStatus      = { open, clustered, resolved, archived }
regulationsByStatus = { candidate, hypothesis, confirmed, retired }
```

**结论**：Phase 1 任何采集脚本若按现契约写，会得到 `undefined`。必须先修订 metrics-contract.md。

### B2：knowledge_index / kb_* 整套表 0 实现（# 5, 6, 7）

`knowledge-source-contract.md` 把 `kb_nodes` / `kb_signals` / `kb_vectors` / `knowledge-ingest.ts` / `knowledge-index.ts` 当作"代码位置（计划）"列出，但：

- `core/knowledge-ingest.ts`、`core/knowledge-index.ts` 不存在
- 仓内无任何 `kb_` 前缀的 SQL / 表 / 常量
- frontmatter 解析、`hash(content)` 缓存均无雏形
- 唯一名字相近的 `core/knowledge-cluster.ts` 是事件聚类（`knowledge_clusters` 表，[`knowledge-cluster.ts:217`](../../causal-learner/mcp-server/src/core/knowledge-cluster.ts)），与 markdown ingest 无关，**不要混淆**

契约自己写了"（计划）"故非欺骗，但 Phase 1 不能假设它存在。

### B3：case_memory / lesson_ledger 0 实现（# 8, 9）

`memory-layer-contract.md` 第 1 节五类存储中：

- `case_memory` → `cases` 表（新增）—— 不存在
- `lesson_ledger` → `lessons` 表（新增）—— 不存在
- `core/case-memory.ts`、`core/lesson-ledger.ts`、`core/retrieval.ts` 全部不存在

retrieval order 第 1 步（`case_memory.lookup`）和第 5 步（`lesson_ledger` 写入 miss）在 Phase 1 不可执行。

### B4：统一 retrieval 入口不存在（# 11）

`memory-layer-contract.md` 假设的 `retrieve(problem, context)` 串行五层入口在代码里没有对应物。最接近的 `pipeline.search()`（[`pipeline.ts:419-458`](../../causal-learner/mcp-server/src/core/pipeline.ts)）走的是 `classify → findAtoms → explore → regulationView` 流程，与"五层命中即停"是不同抽象。

### B5：artifacts 生成脚本是 vapor（# 15）

`artifact-contract.md` 顶部声称代码位置 `scripts/*.mjs + .github/workflows/ci.yml`。

- `causal-learner/mcp-server/package.json` 的 `scripts` 只有 `build / dev / start`，**没有 test / eval / bench**
- 仓根 `scripts/` 是否存在未在任何契约/代码里被引用
- `.github/workflows/ci.yml` 未在背景对照契约里被声明存在

整个 artifacts 生成层是 0% 实现，Phase 1 启动前需要先落地至少一个 `eval.mjs` + CI workflow。

---

## 重大偏差（major）

### M1：`loadRelevantKnowledge` ≠ `regulation_store.match`（# 10）

`memory-layer-contract.md` 第 2 步 retrieval 写的是 "命中 confirmed 规则即返回 cause chain"。

但唯一现有的 predicate 召回是 [`dual-storage.ts:119-175`](../../causal-learner/mcp-server/src/core/dual-storage.ts) 的 `loadRelevantKnowledge(observation)`：

| 维度 | 契约预期 | 实际实现 |
|------|---------|----------|
| 输入 | 抽象 `signals` | `Observation.facts[].pred`（带 `pred=value` 字符串） |
| 状态过滤 | 仅 confirmed | 仅排除 `retired`，candidate/hypothesis/confirmed 一锅端（dual-storage.ts:150） |
| 返回 | cause chain | `{ loaded, predicatesMatched, regulationIds, message }`（无 chain 物化） |
| 副作用 | 只读 | 命中后写入短期缓存 `shortTerm.saveRegulation`（dual-storage.ts:158） |

并且对应的 MCP 工具 `load_relevant_knowledge`（index.ts:664, 1023-1043）确实存在，但语义与契约相差很远。

### M2：三个 stats 工具职责拆分契约未交代（# 3, 4）

`get_stats` / `get_dual_stats` / `get_longterm_stats` / `graph_stats` 是四个独立工具，分别覆盖：

| 工具 | 入口 | 返回 |
|------|------|------|
| `get_stats` | `pipeline.getStats()` | graph/stories/evidence/templates/hypotheses 聚合 |
| `get_dual_stats` | `dualStorage.getDualStats()` | observationCount/eventCount/regulationCount + byStatus 分桶 + shortTerm/longTerm 双视图 |
| `get_longterm_stats` | `dualStorage.getLongtermStats()` | 仅长期库的 `StorageStats` |
| `graph_stats` | `graph.getStats()` | atom/ref/shortcut count + byKind |

artifact/metrics 契约把"快照"模糊成"三类 stats"，必须显式枚举。

### M3：metrics 漏采"晋升漏斗"信号（# 18）

`regulationsByStatus` 在 storage 层是 4 桶（candidate / hypothesis / confirmed / retired），metrics 只取 `confirmed` 一项，丢失了"提案 → 假设 → 确认"晋升漏斗的中间观察。Phase 1 关键 KPI 应是漏斗，不只是 confirmed 终态。

### M4：mean_tree_depth / context_chars_* 在 causal-learner 层无支撑（# 13）

这些字段需要"BestQA 注入层 / prompt formatter"采集，但该模块在仓内也不存在。需要标注非 causal-learner 责任。

### M5：signals 类型未定义（# 16）

`knowledge-source-contract.md` 的 frontmatter `signals.preconditions` 与 `memory-layer-contract.md` retrieval 入参 `signals` 都未在 `types.ts` 中找到对应类型。最接近的是 `ContextScope`（metamodel.md 第 7 节）和 `Observation.facts[].pred`（types.ts），需要在契约里指定到底沿用哪一个。

---

## 次要偏差（minor）

- **N1（# 12）**：`RegulationStatus` 实际是 4 状态（含 `retired`），契约只列了 3 个。
- **N2（# 14）**：MCP 工具实际 44 个（见 index.ts:150-687 完整枚举），如别处文档说 "16 个" 应统一。
- **N3（# 17）**：SimpleMem 在仓内 0 命中，契约描述其"只读"约束目前空转。
- **N4**：`hypothesis.getStats()` 中实际字段是 `byStatus`（含 `open/validated`）和 `readyForCompile`（[`pipeline.ts:496-501`](../../causal-learner/mcp-server/src/core/pipeline.ts)），可作为未来 `hypotheses_ready_for_compile` 候选 metric，metrics 字段表未提。
- **N5**：`evidence.getStats()` 暴露的 `byVerdict` 维度（supports/contradicts，pipeline.ts:489-491）也未进 metrics 字段表，可用于矛盾率监控。

---

## 对齐项（抽样通过）

证明本审计确实对照了代码：

1. ✅ `submit_observation` MCP 工具确实存在（index.ts:150）
2. ✅ `trigger_induction` MCP 工具确实存在（index.ts:365）
3. ✅ `list_events` MCP 工具确实存在（index.ts:213）
4. ✅ `record_fix` MCP 工具确实存在（index.ts:421）
5. ✅ `compile_path` MCP 工具确实存在（index.ts:617），与 `compile-promotion-contract.md` 第 9 节决策树名字一致
6. ✅ `pipeline.recordFix` 流程的 1→7 步顺序与 `pipeline-contract.md` § 1.2 一致
7. ✅ `RegulationStatus` 枚举中 `confirmed` 与 metrics 契约的 `regulations_confirmed` 用词一致（仅采集口径错）
8. ✅ `EventStatus = open | clustered | resolved | archived` 与 `metamodel.md` 中描述的 Story 状态机近似
9. ✅ `dualStorage.loadRelevantKnowledge` 真实存在并对应 MCP 工具 `load_relevant_knowledge`，契约引用工具名正确（仅语义不对齐）
10. ✅ Phase 0 metrics 字段（`run_id` / `commit` / `dataset` / `n_instances` / `solve_rate` / `duration_sec`）属于评测 harness 层，与 causal-learner 内部 stats 解耦无冲突

---

## 结论

### Phase 1 能否在不改契约前提下启动？

**不能**。至少 **5 项 blocker** 必须先解决：

1. metrics-contract.md：修正 `regulations_confirmed` / `events_open` 的采集来源（B1）
2. memory-layer-contract.md：明确 `case_memory` / `lesson_ledger` / `retrieve()` 是 Phase 2+ 目标，Phase 1 仍以 `pipeline.search` + `loadRelevantKnowledge` 为唯一入口（B3, B4）
3. knowledge-source-contract.md：所有 `kb_*` 表与 ingest 管线都标记为 "0% 实现"，Phase 1 不依赖（B2）
4. artifact-contract.md：声明 `scripts/*.mjs` + `ci.yml` 是 Phase 0 待建，并优先把这一层先落地（B5）
5. metrics 字段位置即便是 `null` 占位也要存在 → 这条契约本身没问题，但前提是 generator 脚本先存在

### 必须先修订的契约

| 契约 | 修订点 |
|------|--------|
| `metrics-contract.md` | 字段表"采集方式"列按真实工具拆分；补 `regulations_candidate/hypothesis/retired`、`hypotheses_ready_for_compile`、`evidence_contradiction_rate` |
| `memory-layer-contract.md` | 五类存储表加 "Phase Available" 列；retrieval order 拆为 "Phase 1 实际版"（pipeline.search 直通）+ "Phase 2 目标版"（五层串行） |
| `knowledge-source-contract.md` | 顶部加大字标注 "本合同 Phase 2 起生效，Phase 1 不依赖任何 `kb_*` 表" |
| `artifact-contract.md` | "代码位置"行改为 "代码位置（待建）：`scripts/eval.mjs` + `.github/workflows/ci.yml`" |

### 建议新增代码层才能兑现契约

Phase 1 至少需要：

1. `scripts/eval.mjs` —— 生成 `artifacts/<run_id>/{metrics.json, summary.md, run.log}`
2. `scripts/snapshot-stats.mjs` —— 调用 4 个 stats 工具拼装 `stats_before/after.json`
3. `metrics-collector.ts`（或脚本内嵌）—— 把 `get_dual_stats().regulationsByStatus.confirmed` 等真实字段映射到 metrics 契约字段名
4. （Phase 2）`core/knowledge-ingest.ts` + `core/knowledge-index.ts` + `kb_*` 表迁移
5. （Phase 2）`core/case-memory.ts` + `core/lesson-ledger.ts` + `core/retrieval.ts` 五层统一入口
