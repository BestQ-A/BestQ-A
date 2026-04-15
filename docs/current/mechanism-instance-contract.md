---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "机制实例绑定规范"
---

# MechanismInstance 合同：Episode 与 MechanismClass 的桥接对象

> 定义 `MechanismInstance` 的 schema、状态机、不变量，以及它与 `Episode` / `MechanismClass` / `AcceptedReconstruction` 的绑定关系。
> 它的存在是为了填补当前 v7 结构中的缺口：
> `MechanismClass` 是抽象模板，`Episode` 是具体经历，但两者之间还缺少“这次经历里，这个机制是如何被具体绑定和裁决”的显式对象。
> 上游依赖：[v7-world-model-contract.md](v7-world-model-contract.md)、[reconstruction-contract.md](reconstruction-contract.md)、[template-invariant-contract.md](template-invariant-contract.md)、[support-link-contract.md](support-link-contract.md)

---

## §1 定义与边界

**定义**：`MechanismInstance` 是某个 `MechanismClass` 在某个 `Episode` 中的一次具体绑定结果。

它回答的不是：

- 世界里是否存在某种机制类

而是：

- 在这次具体 Episode 里，这个机制类被怎样绑定到实际 observation / action / state 上
- 当前这次绑定是 `candidate`、`accepted` 还是 `rejected`

**是什么**：

- Episode 内部的机制实例化结果
- 从抽象机制类到具体经历之间的桥接对象
- `AcceptedReconstruction` 的上游绑定源

**不是什么**：

- 不是 `MechanismClass` 本身
- 不是 `PatternTemplate` 本身
- 不是 compile 之后的 world-model relation

---

## §2 Schema

```yaml
MechanismInstance:
  # 身份
  id: string                       # 格式: "MI_<episode_id>_<seq>"

  # 绑定
  mechanism_class_ref: string      # 指向 MechanismClass；draft 阶段允许 `proxy:*`
  episode_id: string               # 指向 Episode

  # 绑定细节
  bindings:                        # slot / phase / role -> concrete object id
    <name>: string

  # 来源
  source_kind: string              # "pattern_instance" | "path_projection" | "manual"
  source_ref: string | null        # PatternInstance ID / path hash / manual note ref

  # 证据与裁决
  claim_ids: string[]              # 关联 Claim
  support_link_refs: string[]      # 关联 SupportLink / RefuteLink ID
  status: string                   # "candidate" | "accepted" | "rejected" | "superseded"

  # 元数据
  created_at: ISO8601
  created_by: string               # "pipeline_s3" | "pipeline_s4" | "human_review"
  superseded_by: string | null
```

### §2.1 字段约束

| 字段 | 约束 |
|------|------|
| `id` | 全局唯一 |
| `mechanism_class_ref` | draft 阶段允许 `proxy:*` 过渡引用；转 current 前必须指向已存在的 MechanismClass |
| `episode_id` | 必须指向已存在的 Episode |
| `bindings` | 非空对象；值必须是本 Episode 内可解析对象的 ID |
| `source_kind` | 枚举：`pattern_instance` / `path_projection` / `manual` |
| `claim_ids` | 可为空数组，但不可为 null |
| `support_link_refs` | 可为空数组，但不可为 null；元素未来必须是显式 SupportLink id，不得混入 compiled Ref id |
| `status` | 枚举：`candidate` / `accepted` / `rejected` / `superseded` |
| `superseded_by` | `status = superseded` 时必填；否则为 null |

---

## §3 状态机

```text
candidate → accepted
candidate → rejected
accepted  → superseded
rejected  → terminal
superseded → terminal
```

### §3.1 流转语义

| 流转 | 条件 | 含义 |
|------|------|------|
| `candidate → accepted` | 该绑定通过当前路径选择与证据门控 | 本次 Episode 接受此机制实例 |
| `candidate → rejected` | 被证据或路径裁决否定 | 该绑定不可用于本次重建 |
| `accepted → superseded` | 被更强绑定实例取代 | 历史保留，不再作为当前实例 |

### §3.2 禁止流转

- `rejected → accepted`
- `accepted → candidate`
- `superseded → accepted`

---

## §4 与其它对象的绑定关系

### §4.1 Episode

```text
Episode ──1:N──> MechanismInstance
```

- 一个 Episode 可有多个机制实例绑定
- 每个 MechanismInstance 必须且仅能属于一个 Episode

### §4.2 MechanismClass

```text
MechanismClass ──1:N──> MechanismInstance
```

- 一个 MechanismClass 可在多个 Episode 中被实例化
- 但单个 MechanismInstance 只对应一个 MechanismClass

### §4.3 AcceptedReconstruction

```text
AcceptedReconstruction ──N:1──> MechanismInstance
```

在最终语义下：

- `AcceptedReconstruction.selectedMechanismIds` 指向的是被接受的 `MechanismInstance`
- 再通过这些实例，间接回到 `MechanismClass`

**第一轮兼容期说明**：

- 允许 `selectedMechanismIds` 暂时仍是 path / atom 代理
- 但在本合同转 `current` 前，必须完成为 `MechanismInstance` 级绑定

### §4.4 PatternTemplate

当前最接近的现有实现是：

- `core/pattern-template.ts` 里的 `PatternInstance.bindings`

映射关系：

| 当前对象 | 目标对象 | 说明 |
|---|---|---|
| `PatternInstance` | `MechanismInstance(source_kind=pattern_instance)` | 现有最接近的物理实现 |
| `bindings` | `bindings` | 语义近似，可直接复用 |
| `score` | 外部裁决信号 | 可作为 candidate 评分，但不等同于 accepted |

---

## §5 不变量

| # | 不变量 | 违反后果 |
|---|--------|---------|
| I1 | 每个 MechanismInstance 必须绑定一个 Episode 和一个 MechanismClass | 失去桥接意义 |
| I2 | `accepted` 的 MechanismInstance 至少应关联一个 Claim 或 SupportLink | 无法解释为何被接受 |
| I3 | `rejected` 的 MechanismInstance 不得进入 AcceptedReconstruction | 重建链污染 |
| I4 | `superseded` 的实例必须指向 `superseded_by` | 历史断裂 |
| I5 | `bindings` 不可为空 | 退化成空壳机制名 |
| I6 | `source_kind=path_projection` 只能视为过渡态，不得作为最终 current 语义 | 代理对象永久化 |

---

## §6 与当前代码的映射

| 目标对象 | 当前最接近对象 | 现状判断 | 升级方向 |
|---|---|---|---|
| `MechanismInstance` | `PatternInstance` + `AcceptedReconstruction.selectedMechanismIds` | 部分存在但未统一成显式对象 | 新增 `core/mechanism-instance.ts` |
| `bindings` | `PatternInstance.bindings` | 基本对齐 | 可复用 |
| `source_kind` | 无 | 未实现 | 新增 |
| `status` | 无 | 已出现最小状态机 | 后续接入持久化与 audit 第二轮 |

---

## §7 第一轮实现建议

第一轮不要求完整 MechanismClass replay，只要求把桥对象显式化。

### 最小实现

1. 新增 `core/mechanism-instance.ts`
2. 先支持 `source_kind = "path_projection"` 和 `source_kind = "pattern_instance"`
3. 在 `recordFix()` 中：
   - compile 成功路径生成 `accepted` MechanismInstance
   - 未通过路径生成 `candidate` 或 `rejected` 实例
4. `AcceptedReconstruction` 先绑定 `mechanism_instance_ids`

### 暂缓实现

- 从 MechanismClass 自动生成 phase-aware bindings
- 完整 `superseded` 链
- 多 Episode 对同一 MechanismClass 的统一裁决

---

## §8 转 current 的条件

- [ ] `MechanismInstance` 成为显式对象并可落盘
- [ ] `AcceptedReconstruction` 不再直接引用 path / atom 代理，而改为引用 `MechanismInstance`
- [ ] 至少一条 `source_kind=pattern_instance` 的路径可端到端流入 reconstruction
- [ ] `source_kind=path_projection` 被明确限制为过渡态

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把 `MechanismInstance` 定义为 Episode 与 MechanismClass 的桥接对象，并给出与 PatternInstance / Reconstruction 的映射 |
