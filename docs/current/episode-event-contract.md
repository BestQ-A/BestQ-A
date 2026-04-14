---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "Episode 事件时间线"
---

# EpisodeEvent 合同：Episode 内轻量 append-only 事件时间线

> 本合同立法 `EpisodeEvent` 的结构、11 种 kind 枚举、seq 单调性、payload 最小字段，以及与 Episode / MechanismInstance / AcceptedReconstruction / OntologyDelta 的回指关系。
>
> 对应实现：[`episode-event-store.ts`](../../causal-learner/mcp-server/src/core/episode-event-store.ts)
> 上游合同：[`v7-world-model-contract.md`](v7-world-model-contract.md)（§2.B Episode 采样层）
> 相关合同：[`mechanism-instance-contract.md`](mechanism-instance-contract.md)、[`reconstruction-contract.md`](reconstruction-contract.md)、[`ontology-delta-contract.md`](ontology-delta-contract.md)

---

## §1 一句定义

**EpisodeEvent 是 Episode 内唯一的 append-only 时序轴，记录"这次经历发生了什么、按什么顺序"，但不替代任何高层对象自身的结构。**

- 不存储完整对象（只存关键 ref_id 和最小 payload）
- 不替代 AcceptedReconstruction / OntologyDelta 的语义
- 唯一数据源是 seq 序号：任何 Episode 内的事件顺序必须由 seq 保证，不依赖 created_at

---

## §2 对象结构

```typescript
type EpisodeEventKind =
  | 'observation_recorded'
  | 'hypothesis_created'
  | 'hypothesis_validated'
  | 'compile_applied'
  | 'compile_blocked'
  | 'mechanism_instance_created'
  | 'mechanism_instance_accepted'
  | 'mechanism_instance_rejected'
  | 'reconstruction_written'
  | 'ontology_delta_written'
  | 'outcome_recorded';

interface EpisodeEvent {
  id:         string;            // 格式：EE_<episode_id>_<seq>_<hex3>
  episode_id: string;            // 归属 Episode
  seq:        number;            // 同 Episode 内从 1 起步，严格单调递增
  kind:       EpisodeEventKind;
  ref_id?:    string;            // 关联的主对象 ID（见 §5）
  payload:    Record<string, unknown>; // 最小字段（见 §6），不含完整对象
  created_at: string;            // ISO 8601
}
```

---

## §3 11 种 kind 枚举

| kind | 触发时机 | 归属 pipeline 阶段 |
|------|---------|-------------------|
| `observation_recorded` | `submitObservation` 创建 Story 后立即写入 | S1 输入收集 |
| `hypothesis_created` | `recordFix` 中 hypothesis 对象创建后 | S3 候选生成 |
| `hypothesis_validated` | hypothesis validate 完成后 | S5 证据绑定 |
| `compile_applied` | compile 成功且 compiledRefs > 0 | S4 关系法律 |
| `compile_blocked` | compile 未通过（canPromote 失败 或 compiledRefs=0） | S4 关系法律 |
| `mechanism_instance_created` | rawMechanismInstance 对象生成后 | S5 推理 |
| `mechanism_instance_accepted` | MI 状态确定为 accepted | S5 推理 |
| `mechanism_instance_rejected` | MI 状态确定为 rejected | S5 推理 |
| `reconstruction_written` | AcceptedReconstruction 落盘后 | S6 重建 |
| `ontology_delta_written` | OntologyDelta 落盘后 | L2 本体演化 |
| `outcome_recorded` | Story 状态最终确定后 | S6/S7 收束 |

**互斥规则**

- `compile_applied` 与 `compile_blocked` 在同一 `recordFix` 调用中**只能出现其一**
- `mechanism_instance_accepted` 与 `mechanism_instance_rejected` 在同一 `recordFix` 调用中**只能出现其一**
- `observation_recorded` 每个 Episode **只出现一次**（由 `submitObservation` 写入）

---

## §4 seq 单调性规则

1. seq 从 **1** 开始，同一 `episode_id` 内严格递增，无跳号
2. 计算方式：`MAX(seq) + 1`，由 `EpisodeEventStore.nextSeq()` 保证
3. `(episode_id, seq)` 构成唯一索引，重复写入静默忽略（`INSERT OR IGNORE`）
4. **禁止依赖 `created_at` 排序**——`seq` 是唯一权威顺序

---

## §5 ref_id 规则

| kind | ref_id 值 | 语义 |
|------|----------|------|
| `observation_recorded` | `episode_id`（story.id） | 回指 Episode 本身 |
| `hypothesis_created` | `hypothesis.id` | 回指 Hypothesis 对象 |
| `hypothesis_validated` | `hypothesis.id` | 同上 |
| `compile_applied` | `compile:<episode_id>` | 回指 compile 结果（无独立对象） |
| `compile_blocked` | —（`undefined`） | 无有效 ref 对象 |
| `mechanism_instance_created` | `MechanismInstance.id`（raw） | 回指原始 MI |
| `mechanism_instance_accepted` | `MechanismInstance.id`（final） | 回指接受后 MI |
| `mechanism_instance_rejected` | `MechanismInstance.id`（final） | 回指拒绝后 MI |
| `reconstruction_written` | `AcceptedReconstruction.id` | 回指 Reconstruction |
| `ontology_delta_written` | `OntologyDelta.id` | 回指 OntologyDelta |
| `outcome_recorded` | `episode_id`（story.id） | 回指 Episode 本身 |

---

## §6 payload 最小字段

每种 kind 的 payload 至少包含以下字段；允许追加，但不得删除已登记字段。

| kind | 必填字段 | 类型 | 说明 |
|------|---------|------|------|
| `observation_recorded` | `atomCount` | `number` | 本次 observation 产出的 atom 数 |
| `hypothesis_created` | `claim` | `string` | hypothesis.claim 值 |
| `hypothesis_validated` | `outcome` | `string` | validate 结果（passed / partial 等） |
| `compile_applied` | `compiledRefs` | `number` | 成功编译的 Ref 数 |
| `compile_blocked` | `reason` | `string` | 阻断原因（`canPromote_failed` \| `compiledRefs=0` \| 其他） |
| `mechanism_instance_created` | `mechanism_class_ref` | `string` | 绑定的 MechanismClass 引用 |
| `mechanism_instance_accepted` | `status` | `"accepted"` | 恒为字面量 `"accepted"` |
| `mechanism_instance_rejected` | `status` | `"rejected"` | 恒为字面量 `"rejected"` |
| `reconstruction_written` | `traceId` | `string` | 对应 DerivationTrace.id |
| `reconstruction_written` | `fidelityScore` | `number` | reconstruction.fidelity.score |
| `ontology_delta_written` | `kind` | `OntologyDeltaKind` | delta 的 kind 值 |
| `outcome_recorded` | `outcome` | `string` | story.outcome（success/failure/partial/abandoned） |
| `outcome_recorded` | `status` | `string` | story.status（resolved/open 等） |

---

## §7 与上层对象的回指关系

```text
Episode
  └── episodeEventIds: string[]      ← EpisodeEvent.id 列表（全量，按 seq 升序）
  └── acceptedReconstructionId?      ← 由 reconstruction_written 事件 ref_id 对应
  └── ontologyDeltaId?               ← 由 ontology_delta_written 事件 ref_id 对应

AcceptedReconstruction
  └── traceId                        ← 由 reconstruction_written.payload.traceId 可验

OntologyDelta
  └── id                             ← 由 ontology_delta_written.ref_id 可验

MechanismInstance
  └── id                             ← 由 mechanism_instance_accepted/rejected.ref_id 可验
```

**单向原则**：EpisodeEvent 只回指上层对象，上层对象不强制回指 EpisodeEvent（但 Episode.episodeEventIds 作为便捷索引可提供）。

---

## §8 存储不变量

由 `EpisodeEventStore` 强制执行：

1. **唯一 seq**：`(episode_id, seq)` UNIQUE INDEX，重复插入静默忽略
2. **追加专用**：不提供 update / delete 接口
3. **完整 JSON blob**：data 列存整个 EpisodeEvent JSON，indexed 列（episode_id, kind, seq）仅供快速筛选
4. **WAL 模式**：`PRAGMA journal_mode = WAL`，保证写入顺序

---

## §9 转 current 的条件

- [ ] `episode-event-store.ts` 实现与本合同 §2–§6 对齐（字段名、payload 最小字段）
- [ ] `artifact-contract.md` 已登记 `episodes/` 子目录包含 EpisodeEvent artifact 路径
- [ ] `v7-world-model-contract.md` §3.2 Episode 定义已加入 `episodeEventIds` 字段
- [ ] `contract-audit` 能检查 `episode_event_kind` 枚举合法性（可选，第二轮 audit）

---

## §10 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-04-14 | 初版：立法 EpisodeEvent 11 种 kind、seq 单调性、payload 最小字段、与上层对象回指关系 |
