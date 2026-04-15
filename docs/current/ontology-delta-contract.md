---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "本体增量对象规范"
---

# OntologyDelta 合同：本体增量对象规范

> 定义 Derivation Space 中 `OntologyDelta` 的完整 schema、变更动作枚举、`kind=none` 时的 `no_update_reason` payload，以及 fidelity 回归检查协议。
> v7 命名对齐：v7 §2.E / §3.4 定义了六种 OntologyDelta.kind（PromoteMechanism / SplitClass / MergeClass / DeprecateRelation / RegisterPattern / none），本合同 §3 的 changes 动作枚举与之兼容（更细粒度）。
> 每个已完成 Episode 必须产出一个 `OntologyDelta`。当本轮不更新时，结果仍然是 `OntologyDelta(kind=none)`，并附带 `no_update_reason` payload。
> 上游依赖：[v7-world-model-contract.md](v7-world-model-contract.md) §2.E / §3.4 / §5.2 L2–L4 / §7
> 姊妹合同：[reconstruction-contract.md](reconstruction-contract.md)、[derivation-chain-contract.md](derivation-chain-contract.md)

---

## §1 定义与边界

### §1.1 OntologyDelta（R5）

**定义**：一次 Episode 对 Ontology Space 产生的结构化修正——新增、修改、或删除哪些 Entity / Attribute / Relation / MechanismClass。

**是什么**：

- 逻辑层的显式本体更新声明
- 必须与求解结果绑定——不允许"求解成功了但本体没更新"且无理由

**不是什么**：

- 不是 compile side effect——compile 是图存储层操作（Atom/Ref 写入），OntologyDelta 是逻辑层声明
- 不是 batch migration——OntologyDelta 始终绑定单个 Episode

### §1.2 `no_update_reason` payload（R6 的载荷形态）

**定义**：当 Episode 不产生 Ontology 修正时，附着在 `OntologyDelta(kind=none)` 上的结构化理由载荷。

**是什么**：

- 结构化的"为什么没更新"声明
- 不等于 null / 空对象——必须有 `reason_kind` + `explanation`
- 是 `OntologyDelta` 的子结构，不是与其并列的一等顶层实例

**不是什么**：

- 不是懒惰借口——"没什么好改的"不是有效理由
- 不是延迟声明——"以后再更新"必须转为具体 follow-up 任务

---

## §2 OntologyDelta Schema

```yaml
OntologyDelta:
  # 身份
  id: string                    # 格式: "OD_<episode_id>_<seq>"

  # 绑定
  episode_id: string            # 触发本次变更的 Episode
  reconstruction_id: string     # 对应的 Reconstruction（变更基于重建结果）
  claim_ids: string[]           # 变更依据的 accepted Claim 集合

  # 变更内容
  kind: string                  # "applied" | "none"
  changes: OntologyChange[]     # 见 §3
  no_update_reason:             # 仅 kind=none 时必填，见 §4
    reason_kind: string
    explanation: string
    follow_up: string | null

  # Fidelity 回归检查
  fidelity_regression_check: RegressionCheck  # 见 §5

  # 元数据
  created_at: ISO8601
  created_by: string            # "pipeline_s7" | "human_review"
  applied_at: ISO8601 | null    # 实际写入 Ontology 的时间（回归检查通过后）
```

### §2.1 字段约束

| 字段 | 约束 |
|------|------|
| `id` | 全局唯一 |
| `episode_id` | 必须指向已存在的 Episode |
| `reconstruction_id` | 必须指向已存在的 Reconstruction |
| `claim_ids` | `kind != 'none'` 时非空，每个 ID 指向 `status = accepted` 的 Claim；`kind = 'none'` 时可为空，但必须有 `no_update_reason` |
| `kind` | 枚举：`applied` / `none` |
| `changes` | `kind = applied` 时非空；`kind = none` 时必须为空数组 |
| `no_update_reason` | `kind = none` 时必填；`kind = applied` 时必须为 null 或缺省 |
| `fidelity_regression_check` | 不可为空——即使只有 0 个历史 Episode 也必须给出空检查结果 |
| `applied_at` | `kind = applied` 且回归检查通过后必填；否则为 null |

---

## §3 OntologyChange 动作枚举

**v7 §3.4 定义了六种顶层 kind**：`PromoteMechanism / SplitClass / MergeClass / DeprecateRelation / RegisterPattern / none`。本合同的 `changes[].action` 是更细粒度的枚举，与 v7 kind 的对应关系：

| v7 kind | 本合同 action（细粒度） |
|---------|----------------------|
| `PromoteMechanism` | `promote_mechanism` |
| `SplitClass` | `deprecate_entity` + `add_entity` × 2（拆分为子类） |
| `MergeClass` | `deprecate_entity` × 2 + `add_entity`（合并为新类） |
| `DeprecateRelation` | `remove_relation` |
| `RegisterPattern` | `add_relation` + `promote_mechanism`（注册新模式） |
| `none` | changes 为空，附 `no_update_reason` payload |

每个 `OntologyChange` 描述一条原子变更。

```yaml
OntologyChange:
  action: string              # 见 §3.1 枚举
  target_space: string        # "ontology" — 所有变更都作用于 Ontology Space
  target_kind: string         # 被操作对象的 v6 类型
  target_id: string           # 被操作对象的 ID
  details: object             # 动作特定的详情（见 §3.1 各动作定义）
  evidence_episode_id: string # 产生本变更的 Episode ID
```

### §3.1 动作定义

#### Entity 相关

| action | target_kind | details | 语义 |
|--------|------------|---------|------|
| `add_entity` | `Entity` | `{ name, attributes: [] }` | 新增本体实体 |
| `modify_entity` | `Entity` | `{ field, old_value, new_value }` | 修改实体属性 |
| `deprecate_entity` | `Entity` | `{ reason, replacement_id }` | 废弃实体（不是删除——保留历史引用） |

#### Attribute 相关

| action | target_kind | details | 语义 |
|--------|------------|---------|------|
| `add_attribute` | `Attribute` | `{ entity_id, name, value_domain, note }` | 为实体新增可观测属性 |
| `modify_attribute` | `Attribute` | `{ entity_id, field, old_value, new_value }` | 修改属性定义 |
| `remove_attribute` | `Attribute` | `{ entity_id, name, reason }` | 移除属性 |

#### Relation 相关

| action | target_kind | details | 语义 |
|--------|------------|---------|------|
| `add_relation` | `Relation` | `{ from_id, to_id, relation_type, initial_weight }` | 新增结构性联系 |
| `strengthen_relation` | `Relation` | `{ old_weight, new_weight }` | 增强关系权重 |
| `weaken_relation` | `Relation` | `{ old_weight, new_weight }` | 减弱关系权重 |
| `retype_relation` | `Relation` | `{ old_type, new_type, reason }` | 修改关系类型 |
| `remove_relation` | `Relation` | `{ reason }` | 移除关系 |

#### MechanismClass 相关

| action | target_kind | details | 语义 |
|--------|------------|---------|------|
| `promote_mechanism` | `MechanismClass` | `{ promotion_evidence }` | 候选晋升为本体层 MechanismClass（须过 v6 §7 门槛） |
| `extend_mechanism` | `MechanismClass` | `{ added_phases?, added_sigs?, added_ips? }` | 扩展已有 MechanismClass 的三要素 |
| `retire_mechanism` | `MechanismClass` | `{ reason, counterexample_episodes }` | 退役 MechanismClass |

#### Claim 相关

| action | target_kind | details | 语义 |
|--------|------------|---------|------|
| `accept_claim` | `Claim` | `{ support_link_ids }` | Claim 从 proposed 转为 accepted |
| `reject_claim` | `Claim` | `{ reason, contradicting_observations }` | Claim 从 proposed 转为 rejected |
| `supersede_claim` | `Claim` | `{ new_claim_id, reason }` | 已 accepted 的 Claim 被新 Claim 取代 |

---

## §4 `no_update_reason` Payload Schema

```yaml
NoUpdateReasonPayload:
  reason_kind: string           # 见 §4.1 枚举
  explanation: string           # 人类可读解释
  follow_up: string | null      # 可选：后续行动建议
```

### §4.1 reason_kind 枚举

| reason_kind | 语义 | 有效条件 |
|-------------|------|---------|
| `ontology_sufficient` | 当前 Ontology 已能充分解释该 Episode | Reconstruction fidelity >= 0.90 |
| `episode_inconclusive` | Episode 信息不足以支撑 Ontology 变更 | 无 accepted Claim 或 Claim 之间冲突 |
| `duplicate_episode` | 该 Episode 与已处理 Episode 高度重复 | 须指明重复的 episode_id |
| `human_override` | 人工审核决定不更新 | 须附人工审核者标识 |
| `pending_more_evidence` | 需要更多 Episode 才能做出 Ontology 变更 | 须附 `follow_up` 描述需要什么证据 |

### §4.2 约束

- `reason_kind = "ontology_sufficient"` 时，其所在 `OntologyDelta.reconstruction_id` 对应 Reconstruction 的 fidelity.score 必须 >= 0.90
- `reason_kind = "duplicate_episode"` 时 `explanation` 必须包含被重复的 episode_id
- `reason_kind = "pending_more_evidence"` 时 `follow_up` 不可为 null

---

## §5 Fidelity 回归检查协议

引用 v6 §6 S7："fidelity 在'未被标记为错误'的老 Episode 上不得下降"。

### §5.1 RegressionCheck Schema

```yaml
RegressionCheck:
  # 检查范围
  episodes_checked: int         # 被检查的历史 Episode 数量
  episodes_skipped: int         # 被标记为 obsolete 而跳过的数量
  skipped_ids: string[]         # 被跳过的 Episode ID 列表

  # 结果
  min_fidelity_before: float    # 变更前所有被检查 Episode 的最低 fidelity
  min_fidelity_after: float     # 变更后所有被检查 Episode 的最低 fidelity
  regression_detected: boolean  # min_fidelity_after < min_fidelity_before

  # 详情（仅当 regression_detected = true 时有意义）
  regressed_episodes: RegressionDetail[] | null
```

### §5.2 RegressionDetail Schema

```yaml
RegressionDetail:
  episode_id: string
  fidelity_before: float
  fidelity_after: float
  delta: float                  # fidelity_after - fidelity_before（负数）
  affected_nodes: string[]      # 受影响的关键节点
```

### §5.3 检查流程

```
OntologyDelta 提交
  → 列出所有 status != obsolete 的历史 Episode
  → 对每个 Episode：用变更后的 Ontology 重跑 Reconstruction
  → 比较新旧 fidelity
  → regression_detected = any(new_fidelity < old_fidelity)
  → 若 regression_detected = true → OntologyDelta 阻断
  → 若 regression_detected = false → OntologyDelta 通过，写入 applied_at
```

### §5.4 解除阻断

当 regression_detected = true 时，解除阻断的唯一方式：

1. **缩小变更范围**：移除导致回归的 changes 条目，重新提交
2. **标记老 Episode 为 obsolete**：显式声明"该老 Episode 本身是错的"，附理由，然后重跑检查
3. **人工覆盖**（最后手段）：人工审核确认回归可接受，附 `human_override` 标签

选项 2 的理由记录在该老 Episode 的 `obsolete_reason` 字段。

---

## §6 与晋升门槛的交互

OntologyDelta 中的 `promote_mechanism` 动作必须满足 v6 §7 晋升门槛：

| 检查项 | 条件 |
|--------|------|
| 多 Episode 交叉验证 | `promotion_evidence.episode_count >= 2` |
| 每个 Episode 结果 | `outcome >= symptom_relieved` |
| MechanismClass 三要素 | latent_phases / observable_signatures / intervention_points 齐全 |
| 谓词等价检查 | 与现有 MechanismClass 无同义冲突 |

`promote_mechanism` 的 `details.promotion_evidence` 必须包含上述检查项的通过证据。任一检查项不通过 → 该 change 条目被拒绝（但 OntologyDelta 的其他 changes 不受影响）。

---

## §7 与 compile 的关系

OntologyDelta 是逻辑层声明，compile 是物理层执行。两者的映射：

| OntologyDelta action | compile 物理操作 |
|---------------------|----------------|
| `add_entity` | 创建 Atom（kind=FACT/CONCEPT） |
| `add_relation` | 创建 Ref（kind + force + contextScope） |
| `strengthen_relation` | 更新 Ref.weight |
| `promote_mechanism` | 创建 Shortcut + PatternTemplate |
| `retire_mechanism` | Ref.status → retired |

**关键约束**：compile 不得绕过 OntologyDelta 直接执行——先有 OntologyDelta 声明，再由 compile 执行物理写入。这保证每次 Ontology 变更都有显式审计记录。

---

## §8 落盘格式

OntologyDelta 与 Reconstruction 同级落盘：

```
artifacts/<run_id>/ontology_deltas/<delta_id>.json
```

JSON 根字段元数据：

```json
{
  "$kind": "instance",
  "$conforms_to": "docs/current/ontology-delta-contract.md",
  "$generated_by": "scripts/eval.mjs",
  "$generated_at": "2026-04-13T10:25:00Z"
}
```

当 `kind = "none"` 时，落盘文件仍然是 `OntologyDelta`，只是：

- `changes = []`
- `no_update_reason != null`

```
artifacts/<run_id>/ontology_deltas/<delta_id>.json
```

---

## §9 不变量

| # | 不变量 | 违反后果 |
|---|--------|---------|
| I1 | 每个已完成 Episode 必须产出 `OntologyDelta`；无更新时用 `kind=none` | Episode 处于"求解完但世界模型未知"的悬空态 |
| I2 | 变更绑定：OntologyDelta 必须关联 episode_id + reconstruction_id；`kind != 'none'` 时 claim_ids 非空；`kind = 'none'` 时 no_update_reason 非空 | 变更来源不可追溯 |
| I3 | 回归检查必填：`fidelity_regression_check` 不可为空 | 无法确认 Ontology 变更不破坏历史 |
| I4 | 原子变更：每个 OntologyChange 恰好描述一条原子操作 | 复合变更无法单独回滚 |
| I5 | 声明先于执行：compile 物理操作必须以 OntologyDelta 为前提 | 无审计记录的 Ontology 变更 |
| I6 | `kind=none` 结构化：`no_update_reason.reason_kind` 不可为空 | 无理由的不更新等于信息丢失 |
| I7 | 晋升门槛：`promote_mechanism` 必须满足 v6 §7 所有检查项 | 低质量 MechanismClass 进入 Ontology |
| I8 | applied_at 门控：仅在 regression_detected = false 后设置 | 带回归的变更被静默应用 |

---

## §10 与现有代码的映射

| 组件 | 当前状态 | Gap |
|------|---------|-----|
| OntologyDelta 类型 | **部分实现**——已有 `core/ontology-delta.ts`，但 `kind=none` 与独立 NoUpdateReason 仍并存 | 需收敛为单一 `OntologyDelta` 对象 |
| `no_update_reason` payload | **未实现为 payload** | 需从独立 `NoUpdateReason` 顶层类型收束为 `OntologyDelta(kind=none)` 子结构 |
| OntologyChange 类型 | **未实现** | 需在 `core/types.ts` 新增 |
| Fidelity 回归检查 | **部分实现**——已有壳，但仍是占位结果 | 需接入真实 replay / regression gate |
| compile 声明化 | compile 直接执行物理操作 | 需重构为 OntologyDelta → compile 两步 |
| 落盘路径 | `artifacts/` 已存在 | eval.mjs 扩展输出 `ontology_deltas/` 子目录 |

---

## §11 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-13 | 初版。定义 OntologyDelta / NoUpdateReason / OntologyChange schema、16 种变更动作、fidelity 回归检查协议、晋升门槛交互、compile 关系、8 条不变量 |
| 2 | 2026-04-14 | 收束对象身份：`NoUpdateReason` 不再作为并列顶层实例，而改为 `OntologyDelta(kind=none)` 的 `no_update_reason` payload；统一 Episode 绑定与落盘路径 |

---

## 参考

- [[v6-world-model-contract|v6 世界模型合同]] — 上游，§1.D / §3 R5-R6 / §6 S7 / §7
- [[reconstruction-contract|Reconstruction 合同]] — 姊妹，fidelity 评分来源
- [[derivation-chain-contract|DerivationTrace 合同]] — 姊妹，推导链规范
- [[compile-promotion-contract|Compile 晋升合同]] — 物理层 compile 规则
- [[ref-algebra-contract|RefAlgebra 合同]] — 物理层 Ref 操作
