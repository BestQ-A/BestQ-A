---
kind: contract
status: draft
phase: 3
schema_version: 1
describes: "五层 retrieval 目标设计"
---

# Memory Layer 目标合同：Phase 3+ 五层串行 retrieval 设计

> 本文档定义 BestQ-A 记忆层 Phase 3+ 要落地的**目标态**：四类尚未实现的存储层、统一 `retrieve()` 入口的五层串行顺序、扩展的写入闭环、指纹算法不变量。
> **本文件所有名字都是设计占位**，不对应任何现存接口或类型。任何一行迁移到现状前必须回到 [memory-layer-current.md](memory-layer-current.md) 登记。
> 上游依赖：[metamodel.md](metamodel.md)、[pipeline-contract.md](pipeline-contract.md)、[knowledge-source-contract.md](knowledge-source-contract.md)

---

## 1. 规划中的存储层

| 存储 | 负责 | 禁止 | status | 规划位置 |
|------|------|------|--------|----------|
| `case_memory` | 具体问题 → 解法树映射、指纹索引 | 存因果规则、存原始长文本 | **not-implemented (Phase 3)** | 规划位置 `causal-learner/mcp-server/src/core/case-memory.ts`（不存在），规划表 `cases`（不存在） |
| `lesson_ledger` | 失败 / 跳过 / 反例教训、run-level lesson | 存成功 case | **not-implemented (Phase 3)** | 规划位置 `causal-learner/mcp-server/src/core/lesson-ledger.ts`（不存在），规划表 `lessons`（不存在） |
| `knowledge_index` | composites 编译产物（见 [knowledge-source-contract.md](knowledge-source-contract.md)） | 存运行时观测 | **not-implemented (Phase 2)** | 规划位置 `causal-learner/mcp-server/src/core/knowledge-index.ts`（不存在），规划表 `kb_*`（不存在）；当前 `core/knowledge-cluster.ts` 是事件聚类，**与本层无关** |
| `SimpleMem` | 原始自然语言描述、跨 session 语义召回 | 存结构化 fact、存编译产物 | **not-implemented (Phase ≥2)** | 外部 MCP Server，仓内 0 集成点 <!-- audit-ignore: symbol-drift: SimpleMem --> |

**硬约束**：
- **禁止**在 Phase 1 代码里引用 `case_memory` / `lesson_ledger` / `knowledge_index` / `SimpleMem` 的任何方法名。
- 状态为 `not-implemented` 的条目从设计态迁移到现状态时，必须同步把该行从本文件挪到 [memory-layer-current.md](memory-layer-current.md) §1。

---

## 2. 目标 Retrieval Order（Phase 3+，全部为设计占位）

> 本节全部名字是**设计占位**，不对应任何现存接口或类型。任何一行迁移到现状前必须回到 [memory-layer-current.md](memory-layer-current.md) §2 登记。

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

## 3. 目标写入路径

### 3.1 扩展成功闭环（Phase 3+）

> 以下调用在 Phase 1 **完全不可执行**，名字是占位。

```
pipeline.recordFix(...)            # 现状保留（见 memory-layer-current.md §3）
  ↓ (新增)
case_memory.upsert({
  fingerprint: signature(problem + context),
  solution_tree: chosenPath,
  source_story: storyId
})
  ↓ (新增)
lesson_ledger.append(lesson_type='success', ref=storyId)
```

### 3.2 失败闭环（Phase 3+）

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

## 5. 冲突裁决（target 范围内）

| 冲突 | 裁决 | status |
|------|------|--------|
| case vs regulation 职责重叠 | case 存具体、regulation 存抽象规则，retrieval order 先 case 后 regulation | target |
| case_memory vs SimpleMem | case_memory 存结构化映射，SimpleMem 存原始自然语言，禁止双写原文 | target |
| kb vs case | kb 是"人工/半自动沉淀的标准解法"，case 是"跑出来的具体历史"，kb 优先级低于 case | target |

---

## 6. 变更流程

- **新增目标层**：先在 §1 追加行并声明 `status: not-implemented` + 规划位置 → 再在 §2 retrieval order 表中占位。
- **改变 retrieval order**：必须走 ADR，且在 `metrics.json` 的 `hit_rate_by_layer` 展示前后对比。
- **target → current 迁移**：必须同步把 §2 中对应行的"现状映射"列更新为实际 `file:line`，并把该行从本文件挪到 [memory-layer-current.md](memory-layer-current.md) §2 表格中新增或修订条目。未同步本节的 PR 不得合并。
