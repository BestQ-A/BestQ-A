---
kind: contract
status: current
verified: 2026-04-13
schema_version: 1
describes: "stats 原始快照结构"
---

# Stats Snapshot 合同：原始存储快照结构规范

> 本文档定义 `dump-stats.mjs` 以及底层 MCP 工具 `get_stats` / `get_dual_stats` / `get_longterm_stats` / `graph_stats` 产出的 JSON 快照顶层结构。
> Snapshot 是从 causal-learner 五个独立存储/视图对象直接序列化出的**原始状态**，不是报表字段。
> 代码位置：`causal-learner/mcp-server/scripts/dump-stats.mjs`
> 上游依赖：无（本合同是 metrics-contract.md 的**原料侧**定义）

---

## 1. 目的

下列两类消费者需要一份稳定的原始快照 schema：

1. `scripts/capture-baseline.mjs` / `scripts/eval.mjs` 等导出脚本 — 需要把 causal-learner 的多个 stats 方法拼到同一个 JSON 文件里落盘，以供后续 diff。
2. `metrics-contract.md` §2 的字段字典 — 其中每个 "已采集" 字段都从本合同定义的顶层段之一里取值。

本合同只定义**快照的外壳和五个顶层字段分别取自哪个源**。各子结构内部字段（如 `eventsByStatus.open`）的语义，回到对应源代码自描述。

与 metrics-contract.md 的关系：见 §4。

---

## 2. 顶层字段

一个合法的 stats snapshot JSON 对象必须同时包含以下五个顶层字段。每个字段是对应 MCP 工具/核心方法的原样返回值，或在失败时写入 `{ error: string }`。

| 字段 | 来源方法 | 源文件:行 | 对应 MCP 工具 |
|------|---------|----------|---------------|
| `storageStats` | `CausalStorage.getStats()` | `causal-learner/mcp-server/src/core/storage.ts:465` | 无直接工具，通过 `get_dual_stats.shortTerm` 暴露 |
| `dualStats` | `DualLayerStorage.getDualStats()` | `causal-learner/mcp-server/src/core/dual-storage.ts:351` | `get_dual_stats` |
| `longtermStats` | `DualLayerStorage.getLongtermStats()` | `causal-learner/mcp-server/src/core/dual-storage.ts:368` | `get_longterm_stats` |
| `graphStats` | `AtomGraph.getStats()` | `causal-learner/mcp-server/src/core/atom-graph.ts:1304` | `graph_stats` |
| `pipelineStats` | `CausalPipeline.getStats()` | `causal-learner/mcp-server/src/core/pipeline.ts:468` | `get_stats` |

### 2.1 storageStats

返回结构由 `StorageStats` 类型承载（`storage.ts:465-505`）。固定键集：`observationCount` / `eventCount` / `regulationCount` / `eventsByStatus` / `regulationsByStatus`。

- `eventsByStatus` 有 4 个常量子键：`open` / `clustered` / `resolved` / `archived`（`storage.ts:474-479`）。
- `regulationsByStatus` 有 4 个常量子键：`candidate` / `hypothesis` / `confirmed` / `retired`（`storage.ts:488-493`）。
- 聚合来自裸 SQL：`SELECT status, COUNT(*) ... GROUP BY status`（`storage.ts:470-472` 与 `storage.ts:484-486`）。

### 2.2 dualStats

`DualLayerStorage.getDualStats()`（`dual-storage.ts:351-366`）在 `storageStats` 的基础上增加以下字段：

- `shortTerm`：完整 `StorageStats` 子对象，等于短期库 `this.shortTerm.getStats()`（`dual-storage.ts:352`）
- `longTerm`：完整 `StorageStats` 子对象，等于长期库 `this.longTerm.getStats()`（`dual-storage.ts:353`）
- `testMode`：boolean（`dual-storage.ts:363`）
- `loadedRegulationIds`：string[]（`dual-storage.ts:364`）

注意：顶层的 `observationCount` / `eventsByStatus` / `regulationsByStatus` 镜像的是**短期库**数据（`dual-storage.ts:356-360`），不是短长合计。

### 2.3 longtermStats

`DualLayerStorage.getLongtermStats()`（`dual-storage.ts:368-370`）直接转发 `this.longTerm.getStats()`。其结构与 §2.1 `storageStats` 完全相同，只是数据源是长期库而非短期库。

### 2.4 graphStats

`AtomGraph.getStats()`（`atom-graph.ts:1304-1345`）返回 `GraphStats`。固定键集：

- `atomCount` / `refCount` / `shortcutCount`：三张表的 `COUNT(*)`（`atom-graph.ts:1305-1307`）
- `orphanAtoms`：`ref_count = 0` 的原子数（`atom-graph.ts:1308`）
- `avgWeight`：`refs.weight` 的平均值，空表返回 0（`atom-graph.ts:1310-1311`）
- `atomsByKind` / `refsByKind` / `refsByMode`：三张 `GROUP BY kind|mode` 映射（`atom-graph.ts:1314-1336`）

### 2.5 pipelineStats

`CausalPipeline.getStats()`（`pipeline.ts:468-503`）是在其它子模块 stats 之上做的**重投影**，不是简单转发：

- `graph`：仅含 `atomCount` / `refCount` / `shortcutCount` 三个字段，抽取自 `graph.getStats()`（`pipeline.ts:478-482`）
- `stories`：`total` / `resolved` / `uncompiled` 三字段，抽取自 `stories.getStats()` 并做桶映射（`pipeline.ts:483-487`）
- `evidence`：`total` / `supports` / `contradicts` 三字段（`pipeline.ts:488-492`）
- `problemClasses`：int 总数（`pipeline.ts:493`）
- `templates`：int 总数（`pipeline.ts:494`）
- `regulations`：**仅总数** int，来自 `rvBuilder.buildAll().length`（`pipeline.ts:495`）
- `hypotheses`：`total` / `open` / `validated` / `readyForCompile` 四字段（`pipeline.ts:496-501`）

关键事实：**pipelineStats.regulations 不按 status 分桶**；需要按状态分桶的消费者必须回去读 `dualStats.regulationsByStatus`。

---

## 3. 元数据字段

`dump-stats.mjs` 在输出 JSON 的顶层注入五个元数据键（`causal-learner/mcp-server/scripts/dump-stats.mjs:53-60`），不属于任何源 stats，但本合同强制它们存在：

| 字段 | 值 | 语义 |
|------|----|------|
| `$kind` | 固定字符串 `"instance"` | 让 `contract-audit.mjs` 识别为实例文件 |
| `$conforms_to` | 固定字符串 `"docs/current/stats-snapshot-contract.md"` | 指向本合同（当前 `causal-learner/mcp-server/scripts/dump-stats.mjs:55` 仍写着 `metrics-contract.md`，属于 reviewer 2026-04-13 问题 3，待后续修补丁切换） |
| `$generated_by` | 固定字符串 `"causal-learner/mcp-server/scripts/dump-stats.mjs"` | 生产者标识 |
| `$generated_at` | ISO-8601 时间戳 | 快照时间 |
| `captured_at` | 与 `$generated_at` 相同的 ISO-8601 | 向后兼容的采集时间别名 |

失败语义：五个顶层 stats 字段各自独立 try/catch（`causal-learner/mcp-server/scripts/dump-stats.mjs:63-111`），单点失败写成 `{ error: "<message>" }`，其它段不受影响。空 `:memory:` 实例上所有计数应为 0 而非缺段。

---

## 4. 与 metrics-contract.md 的边界

两份合同描述**不同 schema**，绝不重合：

| 维度 | stats-snapshot-contract | metrics-contract |
|------|------------------------|------------------|
| 定义对象 | `stats.json` / `stats_before.json` / `stats_after.json` | `metrics.json` |
| 顶层结构 | 5 个嵌套子对象（见 §2），每个对象内部还是嵌套结构 | 扁平字段字典，一个字段一个键值对 |
| 字段稳定性 | 由底层存储方法的 TS 类型决定，跟 causal-learner 版本绑 | 由 metrics-contract.md §2 表格冻结，跟 Phase 绑 |
| 消费者 | 脚本 diff、原始审计、调试 | 报表、CI 回归、HITL 审核 |

**原料关系**：metrics-contract.md §1 盘点的 4 个 stats 工具，正是本合同 §2 的五个顶层字段的来源。metrics-contract.md §2 的每个"已采集"字段在"采集方式"列给出的 `file:line`，等价于从本合同定义的顶层段里**取有限子字段**重新命名。例如：

- `regulations_confirmed` ← `dualStats.regulationsByStatus.confirmed`
- `atom_count` ← `pipelineStats.graph.atomCount`
- `events_open` ← `dualStats.eventsByStatus.open`

因此一个运行目录里同时存在 `stats_after.json`（conforms to 本合同）和 `metrics.json`（conforms to metrics-contract.md），两者**不是同一文件的两种写法**。前者是原料快照，后者是派生字典。

---

## 5. schema_version 变更流程

`schema_version: 1` 语义：本合同 §2 列出的五个顶层字段名及其来源方法签名属于冻结面。下列变更需要 `schema_version +1`：

1. 顶层字段增减（例如 causal-learner 新增第六个 stats 源）
2. 任一顶层字段的来源方法从 A 切到 B（例如 `pipelineStats` 改用 dualStats 聚合）
3. `$kind` / `$conforms_to` / `$generated_by` / `$generated_at` / `captured_at` 元数据键集变化
4. 单点 try/catch 粒度退化为整体 fail-fast

下列变更**不需要**版本升级，只需在本合同 §2 追加注解：

1. 底层方法内部新增子字段（如 `StorageStats` 加一列计数），因为本合同只约束顶层
2. 元数据值的写法微调（只要键集不变）
3. 修正 §2 表格里已有字段的 `file:line` 证据行号

升级流程：

1. 在本文件 `schema_version` 上 bump
2. 改 §2 表格或 §3 元数据段
3. 同步改 `dump-stats.mjs` 的 `$conforms_to` 值（如果此时才从 metrics-contract.md 切过来，就是问题 3 的正式修补丁）
4. 触发 `contract-audit.mjs` 验证所有历史快照文件仍然解析得通，不通则按 metrics-contract.md §4 的"位置冻结"规则补占位
5. commit message 前缀：`docs(stats-snapshot): ...`

---

## 参考

- [[metrics-contract|Metrics 合同]] — 使用本快照作为原料，抽取有限字段做报表
- [[artifact-contract|Artifact 合同]] — 定义 `stats_before.json` / `stats_after.json` 必须落盘在 `artifacts/<run_id>/`
- [[pipeline-contract|Pipeline 合同]] — `CausalPipeline.getStats()` 的上下文，风格参考
