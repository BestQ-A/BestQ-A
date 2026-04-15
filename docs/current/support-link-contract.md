---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "证据边对象规范"
---

# SupportLink 合同：ObservationRecord 到 Claim 的显式证据边

> 定义 `SupportLink` 的最小 schema、角色边界、不变量，以及它与 `ObservationRecord` / `Claim` / `MechanismInstance` / `DerivationTrace` 的绑定关系。
> 它的存在是为了把当前仍主要停留在“间接 ID 关联”的证据层，升级为真正的显式边对象。
> 上游依赖：[v7-world-model-contract.md](v7-world-model-contract.md)、[derivation-chain-contract.md](derivation-chain-contract.md)、[mechanism-instance-contract.md](mechanism-instance-contract.md)

---

## §1 定义与边界

**定义**：`SupportLink` 是一条从 `ObservationRecord` 指向 `Claim` 的类型化证据边，用来表达“这条观察支持或反驳这条断言”。

**是什么**：

- 证据在逻辑层的显式角色对象
- `ObservationRecord` 与 `Claim` 之间的桥
- `DerivationTrace` 与 `MechanismInstance` 的证据来源

**不是什么**：

- 不是 Observation 的副本
- 不是 compile 后的 `Ref`
- 不是 `EvidenceRecord` 的简单重命名

一句话：

```text
ObservationRecord = 现象本身
SupportLink      = 现象相对于某个 Claim 所扮演的证据角色
```

---

## §2 Schema

```yaml
SupportLink:
  id: string                    # 格式: "SL_<episode_id>_<seq>"
  observation_record_id: string # 指向 ObservationRecord
  claim_id: string              # 指向 Claim
  polarity: string              # "supports" | "contradicts"
  weight: float                 # [0.0, 1.0]
  source_kind: string           # "pipeline" | "llm_binder" | "human_review"
  source_ref: string | null
  created_at: ISO8601
  created_by: string
```

### §2.1 字段约束

| 字段 | 约束 |
|------|------|
| `id` | 全局唯一 |
| `observation_record_id` | 必须指向已存在的 ObservationRecord |
| `claim_id` | 必须指向已存在的 Claim |
| `polarity` | 枚举：`supports` / `contradicts` |
| `weight` | `[0.0, 1.0]` 闭区间 |
| `source_kind` | 枚举：`pipeline` / `llm_binder` / `human_review` |
| `source_ref` | 可空；若存在，必须是稳定可读引用 |

---

## §3 与其它对象的绑定关系

### §3.1 ObservationRecord

```text
ObservationRecord ──1:N──> SupportLink
```

### §3.2 Claim

```text
Claim ──1:N──> SupportLink
```

### §3.3 MechanismInstance

`MechanismInstance.support_link_refs` 的目标语义是：

- 存真实 SupportLink id

**明确禁止**：

```text
把 compiled Ref id / mechanism instance id / 任意字符串
冒充为 support_link_refs
```

### §3.4 DerivationTrace

`DerivationTrace.supportLinks` 是本次推导过程中实际使用的证据边集合，不是新的证据副本。

---

## §4 不变量

| # | 不变量 | 违反后果 |
|---|--------|---------|
| I1 | `observation_record_id` 与 `claim_id` 都必须可解析 | 证据边悬空 |
| I2 | `polarity` 只能是 `supports` / `contradicts` | 证据角色失真 |
| I3 | `weight` 必须在 `[0,1]` 内 | 评分不可比较 |
| I4 | `source_kind = llm_binder` 时，该边不得单独支撑 accepted Claim | LLM 自嗨 |
| I5 | `support_link_refs` 未来必须只引用显式 SupportLink id | 语义污染 |

---

## §5 与当前代码的映射

| 目标对象 | 当前最接近对象 | 现状判断 | 升级方向 |
|---|---|---|---|
| `SupportLink` | `types.ts` 中的 `SupportLink` interface | 已有最小类型定义 | 缺专项合同与持久化层 |
| `MechanismInstance.support_link_refs` | 仅字段存在 | 仍未接入真实 SupportLink id | 后续持久化 + audit 第二轮 |
| `DerivationTrace.supportLinks` | 已有字段 | 仍主要是运行时对象 | 后续落盘与双向引用 |

---

## §6 转 current 的条件

- [ ] `SupportLink` 具备持久化与查询能力
- [ ] `MechanismInstance.support_link_refs` 开始引用真实 SupportLink id
- [ ] `DerivationTrace.supportLinks` 与落盘对象一致
- [ ] contract-audit 第二轮开始检查 `support_link_refs` 的 resolvable 真值

---

## §7 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把 SupportLink 从上游合同中的字段提升为独立专项合同，并明确与 ObservationRecord / Claim / MechanismInstance / DerivationTrace 的关系 |
