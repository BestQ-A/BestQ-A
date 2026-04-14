---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "五层世界动力学引擎"
---

# v7 世界模型合同：关系法律内核之上的世界动力学骨架

> 本合同把 `v6-world-model-contract.md` 的“四空间世界模型”继续收束为 **五层世界动力学引擎**。
> v7 的立场不是推翻 v6，而是明确：**v6 是关系法律内核，v7 是整体系统骨架。**
> 上游设计：[`../design_history/v7_world_model_dynamics.md`](../design_history/v7_world_model_dynamics.md)
> 被取代的目标态合同：[`v6-world-model-contract.md`](v6-world-model-contract.md)
> 相关依赖：[`metamodel.md`](metamodel.md)、[`pipeline-contract.md`](pipeline-contract.md)、[`hypothesis-contract.md`](hypothesis-contract.md)、[`compile-promotion-contract.md`](compile-promotion-contract.md)、[`ref-algebra-contract.md`](ref-algebra-contract.md)、[`support-link-contract.md`](support-link-contract.md)

---

## §0 一句定义

**BestQ-A 不是做一个会说的系统，而是做一个会取样、会建模、会重建、会升级世界本体的系统。**

因此：

- 答案不是主资产
- 推理轨迹不是附属说明，而是主产物
- 一次经历不是聊天记录，而是世界模型的一次带标签采样

---

## §1 v7 对 v6 的总判断

v6 已经解决了最关键的关系法问题：

- 哪些关系能合法复合
- 哪些复合只能产生 candidate
- 哪些复合必须 forbidden
- evidential 与 explanatory 如何分层
- proof trace 如何保留

所以 v7 不否定 v6。

v7 的判断是：

```text
v6 = 关系法律内核
v7 = 关系法律内核
     + 世界本体层
     + Episode 采样层
     + 推理与证明层
     + 本体演化层
```

---

## §2 五层架构

### §2.A 世界本体层（World Ontology Layer）

**关注点**：世界里允许存在什么。

基础对象：

- `EntityClass`
- `StateVarClass`
- `MechanismClass`
- `ActionClass`
- `ConstraintClass`

硬约束：

- 本层描述“世界是什么”，不描述具体某次经历
- `MechanismClass` 必须表达多条件、上下文、阶段传播与可干预点
- 本层对象一旦进入稳定本体，修改必须通过本体演化层

### §2.B Episode 采样层（Episode Sampling Layer）

**关注点**：世界在某个局部条件下的一次真实展开。

基础对象：

- `Episode`
- `ObservationRecord`
- `StateSnapshot`
- `ActionExecution`
- `Transition`
- `OutcomeRecord`

硬约束：

- `Episode` 必须是轨迹，不是 observations 的无序集合
- 每个 `ObservationRecord` 只能归属一个 `Episode`
- `StateSnapshot` 与 `Transition` 必须能表达“状态如何演化”

### §2.C 关系法律层（Relation Law Layer）

**关注点**：哪些关系能合法连接，哪些推导可以进入世界模型。

本层直接承接 v6：

- `RefTypeSpec`
- `ComposeRule`
- `RefForce`
- `PatternTemplate`
- `SlotFingerprint`
- `InvariantCheck`
- `CompositionResult`
- `DerivationStep`

硬约束：

- 任何 agent 都不得绕过本层直接写入 compiled world-model
- `indicates ∘ causes`、`cooccurs ∘ causes` 等非法复合继续保持禁止
- evidential → explanatory 只能产生 `candidate claim/path`

### §2.D 推理与证明层（Inference & Proof Layer）

**关注点**：系统为什么接受某条解释链，而不是另一条。

基础对象：

- `Claim`
- `CandidatePath`
- `MechanismInstance`
- `SupportLink`
- `RefuteLink`
- `DerivationTrace`
- `AcceptedReconstruction`
- `Conclusion`

硬约束：

- 不得存在 free-floating answer
- `MechanismClass` 不得直接跳到 `AcceptedReconstruction`，必须先经过 `MechanismInstance`
- 每个 accepted 结论都必须能回溯到 `ObservationRecord / SupportLink / DerivationTrace`
- 被拒绝路径不得被静默丢弃

### §2.E 本体演化层（Ontology Evolution Layer）

**关注点**：这次经历之后，世界模型边界应该如何修。

基础对象：

- `OntologyDelta`
- `PromoteMechanism`
- `SplitClass`
- `MergeClass`
- `DeprecateRelation`
- `RegisterPattern`
- `CounterexampleSet`
- `no_update_reason` payload

硬约束：

- 每个已完成 `Episode` 必须产生一个 `OntologyDelta`
- 若本轮不更新本体，则用 `OntologyDelta(kind=none)` + `no_update_reason` payload 表达
- 单次 episode 禁止直接写稳定 `MechanismClass`
- 本体升级必须经过 replay 一致性与 counterexample 检验

---

## §3 一等对象定义

### §3.1 世界本体对象

```typescript
interface EntityClass {
  id: string;
  name: string;
  description: string;
}

interface StateVarClass {
  id: string;
  name: string;
  valueType: 'number' | 'boolean' | 'enum' | 'vector' | 'text';
  unit?: string;
}

interface MechanismClass {
  id: string;
  name: string;
  description: string;
  preconditions: string[];
  latentPhases: string[];
  observableSignatures: string[];
  interventionPoints: string[];
  thresholds?: string[];
  contextConstraints?: string[];
}

interface ActionClass {
  id: string;
  name: string;
  description: string;
  expectedEffects: string[];
}

interface ConstraintClass {
  id: string;
  name: string;
  description: string;
}
```

### §3.2 Episode 对象

```typescript
interface Episode {
  id: string;
  contextSnapshotId: string;
  initialSnapshotId: string;
  observationRecordIds: string[];
  actionExecutionIds: string[];
  transitionIds: string[];
  /** append-only 事件时间线（按 seq 升序）— 见 episode-event-contract.md */
  episodeEventIds: string[];
  outcomeRecordId?: string;
  acceptedReconstructionId?: string;
  ontologyDeltaId?: string;
}

interface ObservationRecord {
  id: string;
  episodeId: string;
  t: number | string;
  content: string;
}

interface StateSnapshot {
  id: string;
  episodeId: string;
  t: number | string;
  values: Record<string, unknown>;
}

interface ActionExecution {
  id: string;
  episodeId: string;
  t: number | string;
  actionClassId: string;
  parameters?: Record<string, unknown>;
}

interface Transition {
  id: string;
  episodeId: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  causedByActionId?: string;
  candidateMechanismIds: string[];
}

interface OutcomeRecord {
  id: string;
  episodeId: string;
  t: number | string;
  status: 'success' | 'failure' | 'partial' | 'abandoned';
  summary: string;
}
```

### §3.3 推理与重建对象

```typescript
interface Claim {
  id: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  target: string;
  episodeId?: string;
}

interface MechanismInstance {
  id: string;
  mechanismClassRef: string;
  episodeId: string;
  bindings: Record<string, string>;
  status: 'candidate' | 'accepted' | 'rejected' | 'superseded';
}

interface SupportLink {
  observationRecordId: string;
  claimId: string;
  polarity: 'supports' | 'contradicts';
  weight: number;
}

interface DerivationTrace {
  id: string;
  proof: DerivationStep[];
  supportLinks: SupportLink[];
  rejectedClaimIds: string[];
}

interface AcceptedReconstruction {
  id: string;
  episodeId: string;
  selectedMechanismIds: string[];
  majorChain: string[];
  rejectedAlternatives: string[];
  traceId: string;
  fidelity: number;
}

interface Conclusion {
  answer: string;
  recommendedActions?: string[];
  confidence: number;
}
```

### §3.4 本体演化对象

```typescript
interface OntologyDelta {
  id: string;
  episodeId: string;
  kind:
    | 'PromoteMechanism'
    | 'SplitClass'
    | 'MergeClass'
    | 'DeprecateRelation'
    | 'RegisterPattern'
    | 'none';
  rationale: string;
  counterexampleIds?: string[];
}
```

---

## §4 从当前代码到 v7 的映射

| v7 对象 | 当前最接近对象 | 现状判断 | 升级方向 |
|---|---|---|---|
| `EntityClass` | 无显式对象 | 未实现 | 从 Atom/Concept 上方抽出本体层 |
| `StateVarClass` | 无显式对象 | 未实现 | 需要从 Observation/metrics 中抽象值域 |
| `MechanismClass` | `PatternTemplate` + `Relation/Ref` 组合 | 部分实现 | 从关系模板升级为可回放动力学模板 |
| `ActionClass` | `Skill` | 基本对齐 | 补 expectedEffects / ontology binding |
| `ConstraintClass` | `ContextScope` / invariant 的分散约束 | 部分实现 | 升级为显式对象 |
| `Episode` | `Story` | 需重大升级 | 增加 timeline / snapshots / transitions |
| `ObservationRecord` | `Observation` + FACT Atom | 基本对齐 | 增加 `episodeId` 强绑定 |
| `StateSnapshot` | 无显式对象 | 未实现 | 新增 |
| `ActionExecution` | `executedSkillIds` | 部分实现 | 增加时间、参数、效果 |
| `Transition` | 无显式对象 | 未实现 | 新增 |
| `OutcomeRecord` | `Story.outcome` | 部分实现 | 从单字段升级为一等对象 |
| `Claim` | `Hypothesis` | 基本对齐 | 扩展 accepted/rejected/superseded 全语义 |
| `MechanismInstance` | `PatternInstance` + reconstruction 中的 path proxy | 部分实现 | 显式桥对象已出现，后续需脱离 path-only 过渡语义 |
| `SupportLink` | Evidence IDs 间接关联 | 部分实现 | 已有最小类型与专项合同，但仍缺显式持久化/查询层 |
| `DerivationTrace` | `proof` + `Hypothesis.derivation` | 部分实现 | 聚合为可落盘对象 |
| `AcceptedReconstruction` | 无显式对象 | 未实现 | 新增 |
| `Conclusion` | `suggestions` / search result text | 部分实现 | 统一输出合同 |
| `OntologyDelta` | compile/promote side effect | 未实现 | 新增 |

---

## §5 v7 下的主流程

### §5.1 问题求解环

```text
Input
  → S1 Observation 收集
  → S2 Episode 初始化
  → S3 候选 Claim / CandidatePath 生成
  → S4 Relation Law 过滤
  → S5 证据绑定与排序
  → S6 AcceptedReconstruction
  → S7 Conclusion
```

### §5.2 本体学习环

```text
Completed Episode
  → L1 聚合本次 Reconstruction
  → L2 提名 OntologyDelta
  → L3 运行 replay / counterexample 检查
  → L4 Apply Delta or write `kind=none`
```

---

## §6 对现有 pipeline 的绑定要求

### §6.1 `submitObservation`

当前：

- 创建 `Story`
- 保存 Observation atoms
- 生成 candidate paths

v7 目标：

- `submitObservation` 至少产出 `Episode` 的最小壳
- `Story` 作为当前实现可保留，但语义上降为 `Episode` 的兼容包装层
- 所有 Observation 必须最终归属到 `episodeId`

### §6.2 `recordFix`

当前：

- validate hypothesis
- compile refs
- record evidence
- resolve story

v7 目标：

- `recordFix` 之后，除 compile side effect 外，还必须尝试生成：
  - `AcceptedReconstruction`
  - `OntologyDelta`
- 若暂未实现本体升级，也必须显式生成 `OntologyDelta(kind=none)`，并附 `no_update_reason`

### §6.3 `search` / `suggest`

当前：

- 返回 paths / regulations / suggestions

v7 目标：

- 主输出升级为：
  - `Conclusion`
  - `AcceptedReconstruction | ReconstructionDraft`
  - `RejectedAlternatives`

---

## §7 本体升级法律

### §7.1 PromoteMechanism

允许将机制晋升为稳定本体，至少需要：

- `>= 2` 个独立 `Episode`
- replay 一致性通过
- counterexample 检查通过
- 不违反 v6 relation law / invariant

### §7.2 SplitClass

应触发拆分类的条件：

- 同一类内部长期需要两套不同动力学解释
- replay 时出现稳定的不兼容分支

### §7.3 MergeClass

允许合并的条件：

- 机制层、约束层、转移层高度同构
- 分开维护不再增加解释力

### §7.4 DeprecateRelation

一条旧关系需要降级 / 退役的条件：

- 反例持续增加
- replay fidelity 持续下降
- 被更高解释力的机制链替代

---

## §8 多 agent 约束

agent 可以无限扩大量，但权限不能跳过法律。

允许大量 agent 去做：

- 候选 Pattern / Mechanism / Claim 提名
- 相似 Episode 搜索
- 反例搜索
- replay 验证
- 本体边界拆分 / 合并建议

但任何 agent 都**不得**绕过以下门槛直接写稳定世界模型：

- typed relation algebra
- invariant check
- proof trace
- replay fidelity
- counterexample test

铁律：

**宁可 80 亿 agent 在法律之内暴力搜索，也不要 1 个 agent 在法律之外聪明跳步。**

---

## §9 当前缺口总结

相对 v7，当前仓内最关键的缺口是（截至 2026-04-14）：

| # | 缺口 | 状态 |
|---|------|------|
| 1 | `Episode` 具备完整 timeline（StateSnapshot / Transition）| ⚠️ 部分闭合：event log 已存在（`EpisodeEventStore`），但 StateSnapshot / Transition 仍未实现 |
| 2 | `AcceptedReconstruction` 成为一等可落盘对象 | ✅ 已闭合 |
| 3 | `OntologyDelta` 成为每个完成 episode 的必备输出 | ✅ 已闭合（kind=none 路径亦已覆盖） |
| 4 | `MechanismInstance` 桥层存在（MechanismClass → MI → Reconstruction）| ✅ 已闭合 |
| 5 | `SupportLink` 升级为显式边 | ❌ 仍主要以间接 ID 关联存在 |
| 6 | `MechanismClass` 从关系模板升级为动力学模板 | ❌ 仍使用 `proxy:*` 过渡引用 |

---

## §10 转 current 的条件

- [ ] `Episode` 具备完整 timeline（`StateSnapshot` / `Transition` / `ActionExecution` 真实实现）
- [ ] `ObservationRecord` 与 `episodeId` 显式绑定（当前仍通过 Story atoms 间接关联）
- [x] `AcceptedReconstruction` 成为显式对象并可落盘（2026-04-14）
- [x] `OntologyDelta` 成为每个已完成 episode 的必备输出；无更新时用 `kind=none`（2026-04-14）
- [x] 至少一条主流程输出 `Conclusion + Reconstruction`（2026-04-14，§10 条件 5）
- [x] contract-audit 能检查以上对象的存在性与基本绑定关系（V7-1~V7-5，2026-04-14）
- [ ] `MechanismClass` 脱离 `proxy:*` 过渡态，成为真实动力学模板
- [ ] `SupportLink` 升级为显式边并纳入 contract-audit 第二轮检查

---

## §11 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 1 | 2026-04-13 | 初版。把 v6 重新定位为 relation-law kernel，并补入五层世界动力学架构、Episode 轨迹与本体演化法律 |
| 2 | 2026-04-14 | §3.2 Episode 接口加入 `episodeEventIds: string[]`；§9 缺口状态更新（缺口 2/3/4 已闭合）；§10 已完成条件打钩 |
