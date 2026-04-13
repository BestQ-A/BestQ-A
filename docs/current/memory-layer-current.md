---
kind: contract
status: current
verified: 2026-04-13
phase: 1
schema_version: 1
describes: "当前真实存在的检索 MCP 工具清单"
---

# Memory Layer 现状合同：Phase 1 唯一可用的检索面与写入闭环

> 本文档定义 BestQ-A 记忆层在 Phase 1 的**真实存在**形态：唯一落地的存储层 `regulation_store`、当前 MCP Server 注册的检索工具清单、以及 regulation 侧的成功闭环写入路径。
> 本文件不含任何目标态或设计占位；目标态见 [memory-layer-target.md](memory-layer-target.md)。
> 上游依赖：[metamodel.md](metamodel.md)、[pipeline-contract.md](pipeline-contract.md)

---

## 1. 当前存在的存储层

| 存储 | 负责 | 禁止 | status | 代码位置 |
|------|------|------|--------|----------|
| `regulation_store` | 因果规则（pre → eff）、`candidate / hypothesis / confirmed / retired` 四状态机 | 存具体案例文本 | **current** | `causal-learner/mcp-server/src/core/dual-storage.ts`（`DualLayerStorage` 类，short-term + long-term SQLite），状态桶聚合见 `storage.ts:484-496` |

**硬约束**：
- 写入前必须检查本表；越界写入在 code review 阶段必须 revert。
- **禁止**在 Phase 1 代码里引用 `case_memory` / `lesson_ledger` / `knowledge_index` / `SimpleMem` 的任何方法名（它们的目标定义见 [memory-layer-target.md](memory-layer-target.md)）。

---

## 2. 现状 Retrieval Surface（Phase 1 唯一可用）

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

**现状隐式入口**：Pipeline 的 `pipeline.search(...)`（`core/pipeline.ts:413`）走 `classify → findAtoms → explore → regulationView` 流程，是目前最接近"综合检索"的单点调用，但它**不是**五层串行 retrieval——它不区分 case/regulation/kb/simplemem。

**Phase 1 约束**：
- 调用方若需"命中即停"语义，必须自行在脚本里组合 `load_relevant_knowledge` + `pipeline.search` 的结果并做去重。
- `load_relevant_knowledge` **有写缓存副作用**，调用前须明确是否需要清缓存（`clearLoadedCache` in dual-storage.ts:202）。
- 禁止把 `load_relevant_knowledge` 误当作"仅 confirmed 召回"——它**同时**返回 candidate 与 hypothesis。如需 confirmed-only 过滤，调用方自己按 `regulation.status === 'confirmed'` 在应用层筛。

---

## 3. 现状写入路径：成功闭环（Phase 1 唯一可用）

当前仅 regulation 侧的写入闭环存在，由 `pipeline.recordFix(input)`（`core/pipeline.ts:320`）驱动，步骤见 [pipeline-contract.md §1.2](pipeline-contract.md)。简述：

```
pipeline.recordFix(storyId, chosenPath)
  ↓
AtomGraph.compile → StoryStorage.resolve → EvidenceStore.recordSupport
  → StoryStorage.markCompiled → AtomGraph.myelinate → RegulationViewBuilder.buildAll
```

对应 MCP 工具：`record_fix`（`index.ts:421`）。

---

## 4. 冲突裁决（current 范围内）

| 冲突 | 裁决 | status |
|------|------|--------|
| current 多源检索重复命中（§2 多工具同时命中） | Phase 1 由调用方脚本自行去重；合同不给优先级，等 `retrieve()` 统一入口落地再冻结 | current |

---

## 5. 变更流程

- **新增存储层**：先在 §1 追加行并声明 `status` + 代码位置 → 再写代码；若一条目从 [memory-layer-target.md](memory-layer-target.md) 迁移到本文件，必须同步修订 §2 并在 [metrics-contract.md](metrics-contract.md) 开启对应字段。
- **删除存储层**：走废弃流程，至少保留 1 个 Phase 的双读期。
- **target → current 迁移**：必须同步把 [memory-layer-target.md](memory-layer-target.md) 中对应行的"现状映射"列更新为实际 `file:line`，并在本文件 §2 表格中新增或修订条目。未同步本节的 PR 不得合并。
