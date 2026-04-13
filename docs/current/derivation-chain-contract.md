---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "推导链对象规范"
---

# DerivationChain 合同：推导链对象规范

> 定义 Derivation Space 中 `DerivationTrace` 的完整 schema、步骤类型枚举、回放验证协议。
> v7 命名：`DerivationTrace`（v6 曾用名 `DerivationChain`，v7 §2.D / §3.3 更名以强调"可落盘的完整推导轨迹"语义，包含 proof steps + supportLinks + rejectedClaimIds）。
> DerivationTrace 是可审计推理的物化形态——推导链断裂等于系统退化为黑箱 LLM。
> 上游依赖：[v7-world-model-contract.md](v7-world-model-contract.md) §2.D / §3.3 / §6
> 姊妹合同：[reconstruction-contract.md](reconstruction-contract.md)、[ontology-delta-contract.md](ontology-delta-contract.md)

---

## §1 定义与边界

**定义**：从一组前提到一个结论的有序推导步骤序列。每步携带输入节点、输出节点、关系类型、可回放标记。

**两种使用场景**：

| 场景 | 输入 | 输出 | 步骤中的节点类型 |
|------|------|------|----------------|
| **逻辑推导** | 前提 Claim 集合 | 结论 Claim | Claim / SupportLink |
| **过程重建** | Episode 初始条件 + MechanismClass | Reconstruction | latent_phase / observable / intervention |

两种场景共享同一 step schema（§2），区别在于步骤节点引用的对象类型不同。

**不是什么**：

- 不是 Shortcut——Shortcut 是图缓存层的物理跳跃边，DerivationTrace 是逻辑层的可审计推理过程
- 不是 LLM 的内部推理——LLM 的思考过程不可审计，DerivationTrace 的每步必须可独立验证

---

## §2 Schema

```yaml
DerivationTrace:              # v7 §3.3 命名（v6 曾用名 DerivationChain）
  # 身份
  id: string                  # 格式: "DT_<context_id>_<seq>"
  context_kind: string        # "reconstruction" | "inference" — 标识使用场景

  # 绑定
  episode_id: string | null   # reconstruction 场景必填；inference 场景可选
  reconstruction_id: string | null  # reconstruction 场景必填
  premise_claim_ids: string[] # inference 场景：前提 Claim ID 集合
  conclusion_claim_id: string | null  # inference 场景：结论 Claim ID

  # 核心产出（v7 字段名）
  proof: DerivationStep[]     # 有序推导步骤序列（v7 §3.3 字段名，即原 steps）
  supportLinks: SupportLink[] # 支撑本轨迹的 ObservationRecord→Claim 边集合（v7 扩展）
  rejectedClaimIds: string[]  # 被拒绝的候选 Claim ID（v7 §3.3 字段——必须显式保留）

  # 审计汇总
  total_steps: int
  replayable_steps: int       # audit_replayable = true 的步骤数
  chain_integrity: string     # "complete" | "broken" — 见 §4

  # 元数据
  created_at: ISO8601
  created_by: string          # "pipeline_s6" | "pipeline_s4" | "human"
```

### §2.1 DerivationStep Schema

```yaml
DerivationStep:
  step_number: int            # 从 1 开始，严格递增
  from: NodeRef               # 输入节点
  relation: string            # 关系类型（见 §3）
  to: NodeRef                 # 输出节点
  audit_replayable: boolean   # 该步是否可独立回放验证
  replay_method: string | null  # 当 audit_replayable = true 时，说明验证方法
  llm_involved: boolean       # 该步是否有 LLM 参与
  llm_role: string | null     # LLM 参与时的角色（见 §5）
```

### §2.2 NodeRef Schema

```yaml
NodeRef:
  kind: string               # 节点类型（见 §2.3 枚举）
  id: string                  # 节点 ID（指向具体对象）
  label: string               # 人类可读标签
```

### §2.3 NodeRef.kind 枚举

| kind | 语义 | 对应 v6 基础单元 |
|------|------|----------------|
| `claim` | 一条断言 | Claim（T8） |
| `observation` | 一条观察记录 | ObservationRecord（T6） |
| `mechanism_class` | 一个机制模板 | MechanismClass（T4） |
| `latent_phase` | 机制的不可直接观测阶段 | MechanismClass.latent_phases 子元素 |
| `observable_sig` | 机制的可观测特征 | MechanismClass.observable_signatures 子元素 |
| `intervention_point` | 机制的干预点 | MechanismClass.intervention_points 子元素 |
| `initial_condition` | Episode 初始条件 | ContextSnapshot（T7） |
| `entity` | 本体实体 | Entity（T1） |
| `relation_node` | 本体关系 | Relation（T3） |

### §2.4 字段约束

| 字段 | 约束 |
|------|------|
| `id` | 全局唯一 |
| `context_kind` | 枚举：`reconstruction` / `inference` |
| `proof` | 非空数组；step_number 从 1 开始严格递增 |
| `proof[i].to` | 必须等于 `proof[i+1].from`（链式连接，不允许跳步） |
| `rejectedClaimIds` | 可为空数组，但不可为 null——至少要写 `[]` |
| `total_steps` | 必须等于 `proof.length` |
| `replayable_steps` | 必须等于 `proof.filter(s => s.audit_replayable).length` |
| `chain_integrity` | 当 `replayable_steps == total_steps` 时为 `complete`，否则为 `broken` |

---

## §3 关系类型枚举

步骤中的 `relation` 字段必须取以下枚举值之一。分为四族，与 RefAlgebra 四族对齐。

### §3.1 Structural 族

| relation | 语义 | 典型场景 |
|----------|------|---------|
| `enables` | A 使 B 成为可能 | 初始条件 enables 后续过程 |
| `requires` | A 是 B 的前提 | 参数漂移 requires 足够时间 |
| `composes` | A 是 B 的组成部分 | 子过程 composes 完整机制 |

### §3.2 Explanatory 族

| relation | 语义 | 典型场景 |
|----------|------|---------|
| `causes` | A 因果导致 B | 参数偏移 causes 误差上升 |
| `explains` | A 解释了 B 的存在 | 机制 explains 观察现象 |
| `amplifies` | A 放大了 B 的效果 | 非线性阶段 amplifies 漂移 |

### §3.3 Evidential 族

| relation | 语义 | 典型场景 |
|----------|------|---------|
| `supports` | A 支持 B 的真实性 | 观察 supports 假说 |
| `contradicts` | A 反驳 B 的真实性 | 光照未变 contradicts 光照假说 |
| `confirms` | A 确认 B（干预验证） | 重标定后恢复 confirms 机制 |

### §3.4 Interventional 族

| relation | 语义 | 典型场景 |
|----------|------|---------|
| `fixes` | A 修复了 B | 重标定 fixes 误差 |
| `blocks` | A 阻断了 B | 参数冻结 blocks 漂移 |
| `reveals` | A 揭示了 B 的存在 | 干预 reveals 潜在阶段 |

---

## §4 回放验证协议

### §4.1 单步回放

每个 `audit_replayable: true` 的步骤必须可以独立验证：

1. 给定 `from` 节点的状态
2. 应用 `relation` 所描述的转换
3. 验证结果是否等于 `to` 节点的状态

`replay_method` 字段标注验证方法：

| replay_method | 说明 |
|---------------|------|
| `mechanism_spec` | 通过 MechanismClass 的 observable_signatures 验证 |
| `observation_match` | 通过与原始 ObservationRecord 比对验证 |
| `intervention_outcome` | 通过干预结果验证 |
| `logical_entailment` | 通过逻辑蕴含规则验证 |
| `human_judgment` | 需要人工确认（降级选项） |

### §4.2 链完整性

```
chain_integrity = "complete"  ← proof 所有步骤 audit_replayable = true
chain_integrity = "broken"    ← proof 任意步骤 audit_replayable = false
```

**broken chain 的行为**：

- `broken` 的 DerivationTrace 仍然合法——可以落盘、可以关联 AcceptedReconstruction
- 但关联的 AcceptedReconstruction 不得用于晋升门控证据（v7 §7）
- `broken` 步骤必须标注 `replay_method: null` + 理由注释

### §4.3 全链回放

全链回放 = 从第一步到最后一步依次回放每步，验证链式连接的一致性：

1. `proof[0].from` 是 Episode 的初始条件或前提 Claim
2. 对每个 `i`：`proof[i].to == proof[i+1].from`（链式连接不变量）
3. `proof[last].to` 是 AcceptedReconstruction 的最终结果或结论 Claim

全链回放失败 → DerivationTrace 作废，关联 AcceptedReconstruction 标记为 invalid。

---

## §5 LLM 参与边界

引用 v7 §8 LLM 降级条款。DerivationTrace 中 LLM 的角色严格受限。

| llm_role | 允许在哪些步骤 | 限制 |
|----------|--------------|------|
| `proposer` | 任意步骤 | LLM 提议 from→to 的绑定关系，但 audit_replayable 必须由非 LLM 方法确认 |
| `binder` | `relation = supports / contradicts` 的步骤 | LLM 将 ObservationRecord 与 Claim 关联，但权重由结构化评分决定 |
| `null` | 任意步骤 | 无 LLM 参与——纯规则推导或人工判断 |

**红线**：

- `llm_role = "arbiter"` 不存在——LLM 不得做裁决者
- `llm_involved = true` 且 `audit_replayable = true` 时，`replay_method` 不得为 `"llm_self_check"` ——LLM 不能审计自己

---

## §6 落盘格式

DerivationTrace 与 AcceptedReconstruction 同级落盘：

```
artifacts/<run_id>/derivation_chains/<chain_id>.json
```

JSON 根字段元数据：

```json
{
  "$kind": "instance",
  "$conforms_to": "docs/current/derivation-chain-contract.md",
  "$generated_by": "scripts/eval.mjs",
  "$generated_at": "2026-04-13T10:20:00Z"
}
```

---

## §7 不变量

| # | 不变量 | 违反后果 |
|---|--------|---------|
| I1 | 链式连接：`proof[i].to == proof[i+1].from` | 推导链断裂，全链作废 |
| I2 | 步骤递增：step_number 从 1 开始严格递增 | 步骤序不可靠 |
| I3 | 回放一致：`replayable_steps` 必须等于实际计数 | 审计数据不一致 |
| I4 | LLM 不自审：`llm_involved = true` 时 `replay_method != "llm_self_check"` | 审计失效 |
| I5 | 非空链：steps 数组不可为空 | 空链无语义 |
| I6 | relation 枚举：relation 值必须在 §3 枚举范围内 | 未定义关系无法审计 |
| I7 | context 一致：`context_kind = "reconstruction"` 时 `reconstruction_id` 必填 | 绑定断裂 |

---

## §8 与现有代码的映射

| 组件 | 当前状态 | Gap |
|------|---------|-----|
| DerivationTrace 类型 | `HypothesisDerivation[]`（hypothesis.ts）存在但不完整 | 需新增完整 `DerivationTrace` 接口 |
| DerivationStep 类型 | **未实现** | 需在 `core/types.ts` 新增 |
| NodeRef 类型 | **未实现** | 需在 `core/types.ts` 新增 |
| 链式连接验证 | **未实现** | 需新建 `core/derivation.ts` |
| 回放验证 | **未实现** | 需实现 replay protocol |
| Shortcut（物理层） | `atom-graph.ts` Shortcut 已实现 | DerivationTrace 是逻辑层包覆，不替代 Shortcut |
| 落盘路径 | `artifacts/` 已存在 | eval.mjs 扩展输出 `derivation_traces/` 子目录 |

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-13 | 初版。定义 DerivationTrace/Step/NodeRef schema、四族 12 种关系类型、回放验证协议、LLM 参与边界、7 条不变量。对象命名对齐 v7 §3.3 |

---

## 参考

- [[v7-world-model-contract|v7 世界模型合同]] — 上游，§2.D / §3.3 / §6 / §8
- [[reconstruction-contract|AcceptedReconstruction 合同]] — 姊妹，过程重建规范
- [[ontology-delta-contract|OntologyDelta 合同]] — 姊妹，本体增量规范
- [[ref-algebra-contract|RefAlgebra 合同]] — 四族关系类型的物理层定义
- [[hypothesis-contract|Hypothesis 合同]] — Claim 状态机
