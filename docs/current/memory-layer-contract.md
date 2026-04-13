---
status: mixed (current + target)
---

# Memory Layer 合同：存储职责边界与检索入口

> 本文档定义 BestQ-A 记忆层的**现状**与**目标**两张图，两者严格分离，不允许在同一节混写。
> **§2A 现状 retrieval surface**：当前代码里真实存在的检索 MCP 工具清单（Phase 1 唯一可用）。
> **§2B 目标 retrieval order**：Phase 3+ 要落地的五层串行入口，所有名字都是设计占位。
> 调用方在 Phase 1 必须直接使用 §2A 的工具；禁止按 §2B 的占位名编写生产代码。
> 上游依赖：[metamodel.md](metamodel.md)、[pipeline-contract.md](pipeline-contract.md)、[knowledge-source-contract.md](knowledge-source-contract.md)

---

## 1. 五类存储与职责边界

| 存储 | 负责 | 禁止 | status | 代码位置 / Phase 规划位置 |
|------|------|------|--------|--------------------------|
| `regulation_store` | 因果规则（pre → eff）、`candidate / hypothesis / confirmed / retired` 四状态机 | 存具体案例文本 | **current** | `causal-learner/mcp-server/src/core/dual-storage.ts`（`DualLayerStorage` 类，short-term + long-term SQLite），状态桶聚合见 `storage.ts:484-496` |
| `case_memory` | 具体问题 → 解法树映射、指纹索引 | 存因果规则、存原始长文本 | **not-implemented (Phase 3)** | 规划位置 `causal-learner/mcp-server/src/core/case-memory.ts`（不存在），规划表 `cases`（不存在） |
| `lesson_ledger` | 失败 / 跳过 / 反例教训、run-level lesson | 存成功 case | **not-implemented (Phase 3)** | 规划位置 `causal-learner/mcp-server/src/core/lesson-ledger.ts`（不存在），规划表 `lessons`（不存在） |
| `knowledge_index` | composites 编译产物（见 [knowledge-source-contract.md](knowledge-source-contract.md)） | 存运行时观测 | **not-implemented (Phase 2)** | 规划位置 `causal-learner/mcp-server/src/core/knowledge-index.ts`（不存在），规划表 `kb_*`（不存在）；当前 `core/knowledge-cluster.ts` 是事件聚类，**与本层无关** |
| `SimpleMem` | 原始自然语言描述、跨 session 语义召回 | 存结构化 fact、存编译产物 | **not-implemented (Phase ≥2)** | 外部 MCP Server，仓内 0 集成点 <!-- audit-ignore: symbol-drift: SimpleMem --> |

**硬约束**：
- 写入前必须检查本表；越界写入在 code review 阶段必须 revert。
- **禁止**在 Phase 1 代码里引用 `case_memory` / `lesson_ledger` / `knowledge_index` / `SimpleMem` 的任何方法名。
- 状态为 `not-implemented` 的条目从设计态迁移到现状态时，必须同步修订本文件 §1 与 §2A。

---

## 2A. 现状 Retrieval Surface（Phase 1 唯一可用）

当前 MCP Server 注册 **44 个工具**（`causal-learner/mcp-server/src/index.ts` TOOLS 数组逐项核对）。检索面**没有统一入口**——调用者直接按任务挑工具。下表列出所有真实存在的检索类工具：

| 工具 | MCP 注册位置 | 实现函数 | 语义 | 副作用 |
|------|-------------|---------|------|--------|
| `load_relevant_knowledge` | `index.ts:664` | `dualStorage.loadRelevantKnowledge(observation)` → `dual-storage.ts:119` | 以 `Observation.facts[].pred` 与 `pred=value` 字符串为键，在 long-term 库用 `searchRegulationsByEffect` 召回；仅过滤 `retired`，`candidate / hypothesis / confirmed` 一锅端 | **有**：命中的 regulation 会 `shortTerm.saveRegulation` 写入短期缓存（dual-storage.ts:158），并记入 `loadedRegulationIds` |
| `search_regulations` | `index.ts:352` | `searchRegulationsByPredicate` → `tools/query.ts:232` | 按 predicate 精确匹配，遍历全部 regulation | 只读 |
| `fuzzy_search_regulations` | `index.ts:534` | `fuzzySearchRegulationsTool` → `tools/search.ts:472` | 模糊匹配（字符串相似度），返回打分列表 | 只读 |
| `search_events` | `index.ts:340` | `searchEventsByPredicate` → `tools/query.ts:207` | 按 predicate 精确匹配 events | 只读 |
| `fuzzy_search_events` | `index.ts:547` | `fuzzySearchEventsTool` → `tools/search.ts:531` | 模糊匹配 events | 只读 |
| `causal_search` | `index.ts:521` | `causalSearchTool` → `tools/search.ts:435` | 综合搜索（events + regulations），按因果链打分 | 只读 |
| `suggest_causes` | `index.ts:443` | `suggestCausesTool` → `tools/swebench.ts:339` | 对给定效果返回候选原因集合 | 只读 |
| `get_regulations_for_effect` | `index.ts:308` | `getRegulationsForEffect` → `tools/query.ts:256` | 按 effect 谓词精确查 regulations | 只读 |
| `get_regulations_with_precondition` | `index.ts:320` | `getRegulationsWithPrecondition` → `tools/query.ts:283` | 按 precondition 谓词精确查 regulations | 只读 |
| `find_atoms` / `explore_graph` / `query_graph` | `index.ts:632 / 612 / 627` | `AtomGraph` 查询系列 | 图层面节点/子图查询，为 `pipeline.search` 的底层原料 | 只读 |

**现状隐式入口**：Pipeline 的 `pipeline.search(...)`（`core/pipeline.ts:413`）走 `classify → findAtoms → explore → regulationView` 流程，是目前最接近"综合检索"的单点调用，但它**不是** §2B 五层 retrieval——它不区分 case/regulation/kb/simplemem。

**Phase 1 约束**：
- 调用方若需"命中即停"语义，必须自行在脚本里组合 `load_relevant_knowledge` + `pipeline.search` 的结果并做去重。
- `load_relevant_knowledge` **有写缓存副作用**，调用前须明确是否需要清缓存（`clearLoadedCache` in dual-storage.ts:202）。
- 禁止把 `load_relevant_knowledge` 误当作"仅 confirmed 召回"——它**同时**返回 candidate 与 hypothesis。如需 confirmed-only 过滤，调用方自己按 `regulation.status === 'confirmed'` 在应用层筛。

---

## 2B. 目标 Retrieval Order（Phase 3+，全部为设计占位）

> 本节全部名字是**设计占位**，不对应任何现存接口或类型。任何一行迁移到现状前必须回到 §2A 登记。

统一检索入口 `retrieve(problem, context)` 计划按以下顺序串行调用，**命中即停**：

| # | 目标调用 | 现状映射 | 需要新增的模块 |
|---|---------|---------|----------------|
| 1 | `case_memory.lookup(fingerprint)`，相似度 ≥ 0.85 时返回 case 与 solution tree | **无现状对应** | `core/case-memory.ts` + `cases` 表 + fingerprint 算法（§4） |
| 2 | `regulation_store.match(signals)`，命中 confirmed 规则即返回 cause chain | 最接近现状：`load_relevant_knowledge`（`dual-storage.ts:119`）。但差异：① 输入是 `Observation.facts[].pred` 而非抽象 `signals`；② 召回混合 candidate/hypothesis/confirmed；③ 返回 `LoadRelevantResult { loaded, predicatesMatched, regulationIds, message }`，**无 cause chain 物化**；④ 有短期缓存写入副作用 | 新增 confirmed-only 过滤层 + cause chain 物化函数；或在 `DualLayerStorage` 上新增 `matchConfirmed(signals): CauseChain[]` |
| 3 | `knowledge_index.search(signals)` 返回 composites 节点 | **无现状对应**；`knowledge-cluster.ts` 是事件聚类，非 markdown composites 索引 | `core/knowledge-index.ts` + `kb_*` 表，由 [knowledge-source-contract.md](knowledge-source-contract.md) 规定 |
| 4 | `simplemem.semantic_search(raw_text)` 兜底，只返回 memoryRef | **无现状对应**；仓内 `grep -r simplemem` 零命中 | 新增 SimpleMem 客户端 + memoryRef 类型 |
| 5 | `[miss]` 写入 event pool + lesson_ledger | event pool 部分可用现状 `submit_observation`；lesson_ledger 完全缺失 | `core/lesson-ledger.ts` + `lessons` 表 |

### 目标态约束（启用前空转，启用后才生效）

| 约束 | 说明 |
|------|------|
| 顺序冻结 | 禁止跳层、禁止并行合并（必须逐层 profile） |
| 早返回 | 上层命中即停，下层不得再调用 |
| 层级命中度量 | 每层命中必须写入 `hit_rate_by_layer`（[metrics-contract.md](metrics-contract.md) MET-03） |
| SimpleMem 只读 | 第 4 步**不得**触发 SimpleMem 的自动写入 |
| miss 必追 | 第 5 步的 miss 必须写 lesson ledger，禁止静默丢弃 |
| signals 类型 | `signals` 必须与 `metamodel.md` 的 `ContextScope` 或 `types.ts` 的 `Observation.facts[].pred` 之一绑定，不得自创类型 |

---

## 3. 写入路径

### 3.1 现状：成功闭环（Phase 1 唯一可用）

当前仅 regulation 侧的写入闭环存在，由 `pipeline.recordFix(input)`（`core/pipeline.ts:320`）驱动，步骤见 [pipeline-contract.md §1.2](pipeline-contract.md)。简述：

```
pipeline.recordFix(storyId, chosenPath)
  ↓
AtomGraph.compile → StoryStorage.resolve → EvidenceStore.recordSupport
  → StoryStorage.markCompiled → AtomGraph.myelinate → RegulationViewBuilder.buildAll
```

对应 MCP 工具：`record_fix`（`index.ts:421`）。

### 3.2 目标：扩展成功闭环（Phase 3+）

> 以下调用在 Phase 1 **完全不可执行**，名字是占位。

```
pipeline.recordFix(...)            # 现状保留
  ↓ (新增)
case_memory.upsert({
  fingerprint: signature(problem + context),
  solution_tree: chosenPath,
  source_story: storyId
})
  ↓ (新增)
lesson_ledger.append(lesson_type='success', ref=storyId)
```

### 3.3 目标：失败闭环（Phase 3+）

```
onMiss(problem, attempted_layers)
  ↓
event_pool.create(...)             # 现状近似 submit_observation
  ↓ (新增)
lesson_ledger.append({
  lesson_type: 'miss',
  attempted: attempted_layers,
  gap: '<哪一层应命中却没有>'
})
```

---

## 4. 指纹算法（Phase 3 目标）

`case_memory` 的 fingerprint 必须满足：

- 同一 `problem_class` + 相近 `signals` → 相同或相近 fingerprint
- 与 regulation 的 pre 谓词对齐，但粒度更细（包含 context）
- 具体算法留给实现，本合同只规定不变量：**不得使用纯文本 hash**（那会让同义变形命不中）

本节在 `case-memory.ts` 落地前全部为目标态。

---

## 5. 冲突裁决

| 冲突 | 裁决 | status |
|------|------|--------|
| case vs regulation 职责重叠 | case 存具体、regulation 存抽象规则，retrieval order 先 case 后 regulation | target |
| case_memory vs SimpleMem | case_memory 存结构化映射，SimpleMem 存原始自然语言，禁止双写原文 | target |
| kb vs case | kb 是"人工/半自动沉淀的标准解法"，case 是"跑出来的具体历史"，kb 优先级低于 case | target |
| current 多源检索重复命中（§2A） | Phase 1 由调用方脚本自行去重；合同不给优先级，等 `retrieve()` 统一入口落地再冻结 | current |

---

## 6. 变更流程

- **新增存储层**：先在 §1 追加行并声明 `status` + 代码位置 → 再写代码；若从 `not-implemented` 迁移到 `current`，必须同步修订 §2A 并在 [metrics-contract.md](metrics-contract.md) 开启对应字段。
- **改变 retrieval order**：必须走 ADR，且在 `metrics.json` 的 `hit_rate_by_layer` 展示前后对比。
- **删除存储层**：走废弃流程，至少保留 1 个 Phase 的双读期。
- **target → current 迁移**：必须同步把 §2B 中对应行的"现状映射"列更新为实际 `file:line`，并在 §2A 表格中新增或修订条目。未同步本节的 PR 不得合并。
