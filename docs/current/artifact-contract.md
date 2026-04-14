---
kind: contract
status: draft
phase: 0
schema_version: 1
describes: "artifacts 运行产物目录规范"
---

# Artifact 合同：运行产物目录与度量字段规范

> 本文档定义每次 `eval` / `bench` / `run` 运行必须落盘的产物目录结构、字段冻结约束、以及跨运行对比的可重复性要求。
> 所有评测脚本、CI、HITL 审查都依赖这份合同做对比与回归。
> 代码位置：`scripts/*.mjs + .github/workflows/ci.yml`
> 上游依赖：[pipeline-contract.md](pipeline-contract.md)、[metrics-contract.md](metrics-contract.md)

---

## 1. 目录结构

每次运行必须生成一个新的 `artifacts/<run_id>/` 目录，`run_id` 格式 `YYYYMMDD-NNN`（NNN 为当日顺序）。

```
artifacts/<run_id>/
├── metrics.json             # 机器可读度量（字段见 metrics-contract.md）
├── summary.md               # 人类可读摘要：一句话结论 + 关键变化
├── verification_report.json # 测试/断言结果、失败项列表
├── stats_before.json        # 运行前 causal-learner 三类 stats 快照
├── stats_after.json         # 运行后快照
└── run.log                  # 完整 stdout/stderr
```

**不变量**：

| 不变量 | 说明 |
|--------|------|
| 原子性 | 运行失败也必须生成目录（至少含 `run.log` + `summary.md` 的失败说明） |
| 只追加 | 已发布的 `run_id` 目录只读，禁止改写历史产物 |
| 可重现 | 给定相同 `commit` + `dataset` + 种子，`metrics.json` 所有数值字段必须可复现 |
| 自描述 | `metrics.json.commit` 字段必须等于运行时的 `git rev-parse --short HEAD` |

---

## 2. metrics.json 最小字段

字段命名、类型、位置由 [metrics-contract.md](metrics-contract.md) 唯一裁决。本合同只要求**字段位置必须预留**，即便当前 Phase 尚未采集，也要写 `null`。

```json
{
  "run_id": "20260413-001",
  "commit": "ff82b76",
  "phase": "phase1",
  "dataset": "swebench_lite",
  "n_instances": 50,
  "solve_rate": 0.42,
  "mean_tree_depth": 3.1,
  "context_chars_p50": 1820,
  "context_chars_p95": 4200,
  "memory_hit_rate": null,
  "hit_rate_by_layer": null,
  "regulations_confirmed": 12,
  "events_open": 8,
  "kb_nodes_total": null,
  "kb_compile_duration_sec": null,
  "lesson_count": null,
  "review_queue_length": null,
  "duration_sec": 142.3
}
```

---

## 3. 失败语义

| 情况 | 产物要求 |
|------|----------|
| build 失败 | 生成目录 + `run.log` + `summary.md`（"build failed: <首行错误>"），`metrics.json` 的 `solve_rate` 写 `null`，不得省略文件 |
| 评测中途异常 | 已完成样本计数写入 `n_instances`，`summary.md` 标注 `partial` |
| 断言失败 | `verification_report.json` 列出每个失败项，其它字段正常产出 |

---

## 4. 引用与清理

- CI 只保留最近 50 个 `run_id` 目录，更老的移到 `.omx/runs-archive/`（本地）或删除（CI）
- `summary.md` 必须引用上一次成功运行的 `run_id` 做 delta 对比
- `metrics.json` 字段变更必须先改 [metrics-contract.md](metrics-contract.md) 再改代码

---

## 5. v7/v8 对象导出目录

v7/v8 对象实例文件通过 `scripts/export-v7-artifacts.mjs` 产出，落盘到独立的 `run_id` 目录，与 eval/bench 产物分离。

### 5.1 目录结构

```
artifacts/<v7e_run_id>/                   # v7 export run（YYYYMMDD-v7e-XXXX）
├── reconstructions/<id>.json             # conforms_to: reconstruction-contract.md
├── ontology_deltas/<id>.json             # conforms_to: ontology-delta-contract.md
├── derivation_chains/<id>.json           # conforms_to: derivation-chain-contract.md
├── mechanism_instances/<id>.json         # conforms_to: mechanism-instance-contract.md
├── action_executions/<id>.json           # conforms_to: action-execution-contract.md
├── mechanism_programs/<id>.json          # conforms_to: mechanism-program-contract.md
├── episodes/<id>.json                    # conforms_to: v7-world-model-contract.md
├── counterfactual_scenarios/<id>.json    # conforms_to: counterfactual-scenario-contract.md
├── experiment_designs/<id>.json          # conforms_to: experiment-design-contract.md
├── outcome_records/<id>.json             # conforms_to: outcome-record-contract.md
├── prediction_errors/<id>.json           # conforms_to: prediction-error-contract.md
├── state_snapshots/<id>.json             # conforms_to: state-snapshot-contract.md
├── transitions/<id>.json                 # conforms_to: transition-contract.md
├── mechanism_classes/<id>.json           # conforms_to: mechanism-class-contract.md
├── program_revision_proposals/<id>.json  # conforms_to: program-revision-proposal-contract.md
└── review_decisions/<id>.json            # conforms_to: review-decision-contract.md
```

`v7e_run_id` 格式：`YYYYMMDD-v7e-XXXX`（XXXX 为时间戳 base36 后 4 位）。

### 5.2 文件元数据要求

每个 v7 实例文件必须包含以下根字段（由 `contract-audit` 的 R6–R8 规则强制检查）：

```json
{
  "$kind": "instance",
  "$conforms_to": "docs/current/<对应-contract>.md",
  "$generated_by": "scripts/export-v7-artifacts.mjs",
  "$generated_at": "<ISO 8601>"
}
```

### 5.3 与 §1 的区别

| 产物类型 | run_id 格式 | 主要消费者 |
|---------|------------|-----------|
| eval/bench 运行 | `YYYYMMDD-NNN` | CI metrics 对比、人工 review |
| v7/v8 对象导出 | `YYYYMMDD-v7e-XXXX` | `contract-audit` §10–§18 binding pass |

两类产物均纳入 `contract-audit` 扫描范围（`artifacts/**/*.json`），但 binding pass 只对 `kind=instance` 且 `format=json` 的 v7 文件生效（§10–§19）。

---

## 6. MechanismClass de-proxy 当前状态

截至 2026-04-14，`export-v7-artifacts.mjs` 新导出的主链实例：

- `mechanism_instances/*.json`
- `reconstructions/*.json`
- `mechanism_programs/*.json`

已经默认改用真实 `MechanismClass.id = MC_*`，不再为新 run 生成新的 `proxy:*`。

### 6.1 历史产物说明

历史 `artifacts/<old_run>/` 目录中仍可能存在旧的 `proxy:*` 引用。这些是**已发布历史产物**，不应被回写或清理，本合同只约束：

- 新导出 run 不再新增 `proxy:*`
- 主链身份以真实 `MC_*` 为准

### 6.2 尚未宣称完成的部分

这并不等同于：

- `MechanismClass` 已完成多 Episode 归并
- `MechanismClass` 已完成 promotion gate
- `MechanismClass` 已完成 full replay 语义

当前只收口了**主链身份治理**，没有扩展到更高层本体演化语义。
