# 两公理落地提案：推导链即产品 · 本体重现保真度

> ⚠ **已降级 / Superseded-by [epistemic-axioms.md](epistemic-axioms.md)（2026-04-13 同日升级）**
> 本文是对话到合同之间的**过渡工程切片**，以下两点已被上层哲学文档扩展或修正：
> 1. 对象集从 atom / regulation 两层扩到 **7 类一级对象**（Observation / Evidence / Hypothesis / Mechanism / Class / Instance / Reconstruction），详见 [epistemic-axioms.md §4](epistemic-axioms.md#4-七类一级对象)
> 2. Fidelity 从"trace Jaccard 交集"升级为 **Reconstruction 重建保真度**（给定 initial conditions + 当前 ontology 能否还原 case 主链条），详见 [epistemic-axioms.md §5](epistemic-axioms.md#5-可逆世界建模)
>
> 本文保留作为"从对话到合同"的过渡记录，**不作为最终 schema 来源**。写稳定合同时以 `epistemic-axioms.md` 为准。
>
> ---
>
> 把 2026-04-13 对话确立的两条核心原则固化为合同变更清单，避免它们只存在于对话里。
> 状态：**过渡提案（已降级）**。最终落地见 `docs/current/epistemic-contract.md`（待写）。
> 生成日期：2026-04-13

---

## 1. 两条公理

**公理 A —— 显式推导优先**
不信任 LLM 凭固有理解的随机输出。每个答案的产品是"从已知事实 X，经规则 Y，到结论 Z"**那条推导链本身**；Z 会过时，链可复用可改进。

**公理 B —— 经历是本体采样**
一次具体经历是对世界本体模型的一次采样。实践同时做两件事：(a) 改进现状；(b) 让本体模型更完备、更抽象、更系统。本体的质量由"**把老经历的 input 灌回模型能否还原主过程**"来衡量。

---

## 2. 对 BestQ-A 的直接影响

| 公理 | 影响 | 已有合同对齐 | 缺什么 |
|---|---|---|---|
| A | artifact 的主角是 trace，不是 solve_rate | ref-algebra / hypothesis / regulation 合同方向对 | artifact-contract 未强制 `trace.jsonl` |
| B | case_memory 是训练信号，不是缓存；需要"重放保真度"指标与门控 | memory-layer-contract 定义了 case_memory 存储 | 没有 ontology-fidelity 合同 |

---

## 3. 合同变更清单

### 3.1 更新 [current/artifact-contract.md](current/artifact-contract.md)

`artifacts/<run_id>/` 强制新增两份产物：

```
artifacts/<run_id>/
├── metrics.json          # 已有
├── trace.jsonl           # 新增，必需
└── ontology-replay.json  # 新增，必需（见 3.2）
```

`trace.jsonl` 每行一条推导步骤，最小字段：

```jsonc
{
  "step_id": "s-0001",
  "ts": "2026-04-13T12:34:56Z",
  "kind": "atom_read | regulation_fire | hypothesis_gate | ref_algebra_op | llm_propose",
  "inputs": ["atom:xxx", "regulation:yyy"],
  "produced": "atom:zzz | hypothesis:hhh | decision:accept|reject",
  "rationale_ref": "cite:<source>",
  "audit_replayable": true
}
```

**硬约束**：
- `kind: llm_propose` 的步骤**不得直接产出 regulation**，必须再经一次 `regulation_fire` 或 `hypothesis_gate` 门控
- 任一步骤 `audit_replayable: false` → contract-audit.mjs 红灯
- `llm_propose` 必须带 `rationale_ref` 指向外部语料 citation，不接受空引用

### 3.2 新增 current/ontology-fidelity-contract.md

定义两个硬指标：

| 字段 | 含义 | 落盘位置 |
|---|---|---|
| `replay_fidelity` | 用当前 ontology 对某 case 的 input 做 deduction，与原 trace 主过程的相似度（0–1） | `ontology-replay.json` |
| `fidelity_monotone` | induction 晋升新规则前必须全量重放老 case；**任一 case 保真度下降即红灯**，拒绝晋升 | CI hard gate |

MVP 度量：`replay_fidelity = |fired_regulations(old) ∩ fired_regulations(new)| / |fired_regulations(old)|`，Phase 3 再升级为序列对齐。

### 3.3 补丁 [knowledge-source-strategy.md](knowledge-source-strategy.md) §4

`LLM as Relation Extractor` 行追加 caveat：

> ⚠ LLM 在此**只做候选提议者**，不做结论裁决者。每条候选必须带 (1) 语料 citation (2) 可独立重放的审计链 (3) 至少一次 deduction 验证通过，否则不得进 regulation。本约束由 [current/artifact-contract.md](current/artifact-contract.md) 的 `trace.jsonl.llm_propose` 硬约束承接。

---

## 4. eval.mjs 产物要求变化

原计划：跑 SWE-bench Lite 10 条，输出 `metrics.json` 含 `solve_rate`。

新要求：每条 issue 额外输出 `trace.jsonl` + `ontology-replay.json`。`solve_rate` 依然要有，但从"终点"降级为 trace 上的一个字段。

---

## 5. 落地顺序

1. 本提案评审通过 → 合并进 `docs/` 作为 upstream record
2. 新建 `docs/current/ontology-fidelity-contract.md`（走 file-taxonomy-contract 审计）
3. 改 `docs/current/artifact-contract.md`，追加 §trace.jsonl + §ontology-replay.json
4. 改 `scripts/contract-audit.mjs`，新增 trace/fidelity 字段校验规则
5. 改 `scripts/eval.mjs`，接 `swebench.harness`，按新 schema 产出
6. 首次 baseline 跑通：`solve_rate` 变成真数字，trace 与 fidelity 同时落盘
7. 回头给 [knowledge-source-strategy.md](knowledge-source-strategy.md) §4 打 caveat 补丁

---

## 6. 未决问题

- `replay_fidelity` 的相似度度量 MVP 用 Jaccard，何时升级为序列编辑距离 / 关键路径覆盖率
- 老 case 全量重放的性能成本：10 条 ok，100 条以上需要增量 + 缓存
- 被 induction 门控拒绝的候选放哪？建议 `artifacts/<run_id>/rejected-inductions.jsonl` 供人工复核
- LLM 候选提议的配额与成本必须计入 `metrics.json`，避免隐形预算泄漏
- `trace.jsonl` 对多并发场景的顺序语义：按 step_id 单调还是按时间戳排序？先用 step_id 单调

---

## 7. 与既有文档的关系

| 文档 | 关系 |
|---|---|
| [current/artifact-contract.md](current/artifact-contract.md) | 落地后必须追加 trace/fidelity 两节 |
| [current/memory-layer-contract.md](current/memory-layer-contract.md) | case_memory 定义不变，新增"写入触发重放保真度检查"副作用 |
| [current/hypothesis-contract.md](current/hypothesis-contract.md) | LLM 候选走 hypothesis 门控，这是公理 A 最强的抓手 |
| [current/file-taxonomy-contract.md](current/file-taxonomy-contract.md) | 新合同 ontology-fidelity-contract.md 需要符合 kind: contract 分类 |
| [bestqa-roadmap.md](bestqa-roadmap.md) | Phase 1 Exit 新增"solve_rate + trace + fidelity 三件套齐全"一条 |
| [knowledge-source-strategy.md](knowledge-source-strategy.md) | §4 需打 LLM-as-proposer caveat 补丁 |

---

## 8. 一句话

**solve_rate 是副产品，trace 是产品，fidelity 是产品的完备性指标**。这三句话之后的所有合同、脚本、数据结构，都只是在把这三句话翻译成工程。
