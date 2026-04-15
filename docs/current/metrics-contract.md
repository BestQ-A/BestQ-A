---
kind: contract
status: current
verified: 2026-04-13
schema_version: 1
describes: "metrics.json 字段字典"
---

# Metrics 合同：度量字典与字段冻结规范

> 本文档是 BestQ-A 全部运行产物里 `metrics.json` 字段的唯一真相源。
> 所有 Phase、所有脚本、所有 CI 报表共享这份字典；字段新增、删除、改名、改采集口径都必须走 ADR。
> 每个"已采集"字段的采集方式列必须写真实 MCP 工具名 + `file:line` 证据。凭感觉写的采集口径一律拒收。
> 上游依赖：[artifact-contract.md](artifact-contract.md)、[pipeline-contract.md](pipeline-contract.md)

---

## 1. 真实 stats 来源盘点

causal-learner MCP Server 暴露 **4 个独立的 stats 工具**，语义不可互换。任何 metric 字段采集前必须先定位到正确的工具：

| 工具 | 入口函数 | 代码位置 | 返回结构要点 |
|------|---------|----------|-------------|
| `get_stats` | `pipeline.getStats()` | `causal-learner/mcp-server/src/core/pipeline.ts:468` | `graph / stories / evidence / problemClasses / templates / regulations(总数) / hypotheses` |
| `get_dual_stats` | `dualStorage.getDualStats()` | `causal-learner/mcp-server/src/core/dual-storage.ts:351` | `observationCount / eventCount / regulationCount / eventsByStatus / regulationsByStatus / shortTerm / longTerm` |
| `get_longterm_stats` | `dualStorage.getLongtermStats()` | `causal-learner/mcp-server/src/core/dual-storage.ts:368` | 仅长期库的 `StorageStats`（结构同 storage.ts:465） |
| `graph_stats` | `graph.getStats()` | `causal-learner/mcp-server/src/core/pipeline.ts:469`（转发） | `atomCount / refCount / shortcutCount / byKind` |

关键事实：`pipeline.getStats()` **不按 status 分桶 regulations**，只返回 `regulations: rv.length`（pipeline.ts:495）。`get_stats` **完全不含 events 维度**。任何需要按状态分桶的指标必须走 `get_dual_stats`。`regulationsByStatus` / `eventsByStatus` 的原始 SQL 聚合在 `storage.ts:484-496` 与 `storage.ts:470-482`。

---

## 2. 字段字典

| 字段 | 类型 | 引入 Phase | 定义 | 采集方式 |
|------|------|------------|------|----------|
| `run_id` | string | P0 | 单次运行唯一 ID，格式 `YYYYMMDD-NNN` | 运行脚本生成（TBD：`scripts/eval.mjs` 待建） |
| `commit` | string | P0 | 运行时 git HEAD short sha | `git rev-parse --short HEAD`（TBD：采集脚本待建） |
| `phase` | enum | P0 | `phase0`/`phase1`/`phase2`/`phase3`/`phase4` | 运行脚本声明 |
| `dataset` | string | P0 | 评测数据集名 | 参数传入 |
| `n_instances` | int | P0 | 本次评测样本数 | 计数 |
| `solve_rate` | float | P0 | SWE-bench pass@1 | harness 结果 |
| `duration_sec` | float | P0 | 单次运行总耗时 | 运行脚本计时 |
| `regulations_candidate` | int | P1 | 运行后 `candidate` 规则数 | `get_dual_stats().regulationsByStatus.candidate`（storage.ts:489） |
| `regulations_hypothesis` | int | P1 | 运行后 `hypothesis` 规则数 | `get_dual_stats().regulationsByStatus.hypothesis`（storage.ts:490） |
| `regulations_confirmed` | int | P1 | 运行后 `confirmed` 规则数 | `get_dual_stats().regulationsByStatus.confirmed`（storage.ts:491） |
| `regulations_retired` | int | P1 | 运行后 `retired` 规则数 | `get_dual_stats().regulationsByStatus.retired`（storage.ts:492） |
| `events_open` | int | P1 | 未聚类未解决 event 数 | `get_dual_stats().eventsByStatus.open`（storage.ts:475） |
| `events_clustered` | int | P1 | 已聚类待解决 event 数 | `get_dual_stats().eventsByStatus.clustered`（storage.ts:476） |
| `events_resolved` | int | P1 | 已解决 event 数 | `get_dual_stats().eventsByStatus.resolved`（storage.ts:477） |
| `events_archived` | int | P1 | 已归档 event 数 | `get_dual_stats().eventsByStatus.archived`（storage.ts:478） |
| `hypotheses_open` | int | P1 | 运行后未验证假设数 | `get_stats().hypotheses.open`（pipeline.ts:498） |
| `hypotheses_ready_for_compile` | int | P1 | 可编译假设数，晋升漏斗前沿信号 | `get_stats().hypotheses.readyForCompile`（pipeline.ts:500） |
| `evidence_supports` | int | P1 | 支持证据计数 | `get_stats().evidence.supports`（pipeline.ts:490） |
| `evidence_contradicts` | int | P1 | 反证证据计数 | `get_stats().evidence.contradicts`（pipeline.ts:491） |
| `atom_count` | int | P1 | 图谱原子总数 | `get_stats().graph.atomCount`（pipeline.ts:479） |
| `ref_count` | int | P1 | 图谱关系总数 | `get_stats().graph.refCount`（pipeline.ts:480） |
| `shortcut_count` | int | P1 | 图谱捷径总数（髓鞘化产物） | `get_stats().graph.shortcutCount`（pipeline.ts:481） |
| `stories_total` | int | P1 | Story 总数 | `get_stats().stories.total`（pipeline.ts:484） |
| `stories_resolved` | int | P1 | 已解决 Story 数 | `get_stats().stories.resolved`（pipeline.ts:485） |
| `stories_uncompiled` | int | P1 | 已解决但未编译 Story 数 | `get_stats().stories.uncompiled`（pipeline.ts:486） |
| `mean_tree_depth` | float | P1 | 注入的 solution tree 平均深度 | TBD (Phase 1) — 依赖 BestQA 注入层（仓内尚无 prompt formatter 模块，**非 causal-learner 责任**） |
| `context_chars_p50` | int | P1 | 注入 context 字符数 50 分位 | TBD (Phase 1) — 同上，依赖 BestQA harness 埋点 |
| `context_chars_p95` | int | P1 | 注入 context 字符数 95 分位 | TBD (Phase 1) — 同上 |
| `kb_nodes_total` | int | P2 | 编译后的 composites 节点总数 | TBD (Phase 2) — blocked by: `knowledge-ingest.ts` + `kb_*` 表尚未实现（见 knowledge-source-contract.md） |
| `kb_compile_duration_sec` | float | P2 | Stage A+B ingest 总耗时 | TBD (Phase 2) — 同上 |
| `hit_rate_by_layer` | object | P3 | `{case, regulation, kb, simplemem, miss}` 五层命中分布 | TBD (Phase 3) — blocked by: 统一 `retrieve()` 入口 + `case_memory` / `lesson_ledger` 未实现（见 [memory-layer-target.md](memory-layer-target.md) §2） |
| `memory_hit_rate` | float | P3 | `case_memory` 单次命中率 | TBD (Phase 3) — blocked by: `case-memory.ts` 未实现 |
| `lesson_count` | int | P3 | 新写入 lesson ledger 条数 | TBD (Phase 3) — blocked by: `lesson-ledger.ts` 未实现 |
| `review_queue_length` | int | P4 | 待人工审批项数 | TBD (Phase 4) — blocked by: review 模块尚未定义 |

---

## 3. 字段约束

| 约束 | 说明 |
|------|------|
| 位置冻结 | Phase N 字段在 Phase N-1 的 `metrics.json` 中必须以 `null` 占位，不得省略 key |
| 类型冻结 | 字段类型一经引入不得变更（int → float 属破坏性变更，需走 ADR） |
| 名称冻结 | 改名必须保留旧字段写入一个完整 Phase，双写期 ≥ 1 Phase |
| 数据集正交 | `dataset` 不同的运行不得在同一图表里做数值对比，只能比 delta |
| 采集证据 | 新增字段时"采集方式"列必须写真实工具名 + `file:line`，不允许写 "pipeline 内部聚合" 这类含糊表述 |
| status 晋升 | 当一个 TBD 字段迁移到已实现，必须同步把采集方式列换成真实 `file:line` 并追加该字段的 PR 链接 |

---

## 4. 新增字段流程

1. 在本文件表格追加一行（定义、类型、Phase、采集方式），采集方式必须给出真实函数名 + `file:line` 或 `TBD (Phase N)`
2. 更新 [artifact-contract.md](artifact-contract.md) 的 `metrics.json` 示例
3. 代码里先在旧 Phase 写 `null` 占位，下 Phase 才允许填值
4. commit message 前缀：`docs(metrics): ...`

---

## 5. 废弃字段流程

1. 标记 `deprecated_at: <phase>` 在本字典对应行追加列
2. 保留字段至少 1 个 Phase，其间写 `null` 或 `"deprecated"`
3. 下一 Phase 从字典和示例中移除
4. 所有历史 `artifacts/<run_id>/metrics.json` 不回改

---

## 6. Open Issues

以下 issue 来自 `contract-vs-impl-audit.md`（2026-04-13），尚未在本合同之外解决：

| ID | 描述 | blocked by |
|----|------|------------|
| MET-01 | `mean_tree_depth` / `context_chars_p50|p95` 的采集层 | BestQA prompt formatter / injection harness 在仓内 0 实现，Phase 1 启动前必须落地 `scripts/eval.mjs` + 注入埋点 |
| MET-02 | `kb_*` 系列字段 | `core/knowledge-ingest.ts` + `core/knowledge-index.ts` + `kb_*` 表全部未实现（审计 B2）。不得在 Phase 1 采集 |
| MET-03 | `hit_rate_by_layer` / `memory_hit_rate` / `lesson_count` | 统一 `retrieve()` 入口不存在（审计 B4），`case_memory` / `lesson_ledger` 不存在（审计 B3）。Phase 1 写 `null` 占位 |
| MET-04 | `run_id` / `commit` 采集器本体 | `scripts/eval.mjs` + `.github/workflows/ci.yml` 在仓内不存在（审计 B5），必须先落地这一层才能生成任何 `metrics.json` |
| MET-05 | 已采集字段的实际 generator | 即使"采集方式"列已给 `file:line`，当前仓内仍无脚本把 MCP 返回值映射到本字典字段。建议新建 `scripts/snapshot-stats.mjs` 统一拼装 `get_stats` + `get_dual_stats` + `get_longterm_stats` + `graph_stats` 四类快照 |
