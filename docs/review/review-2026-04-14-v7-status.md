---
kind: record
event: "2026-04-14 v7 status review"
recorded_at: 2026-04-14
immutable: true
---

# v7 阶段性评审（2026-04-14）

> 记录当前 v7 设计与实现推进的阶段性判断。  
> 目的不是定义新合同，而是给后续实现和评审提供一个稳定快照。

---

## 1. 当前阶段结论

截至 `033d7b1`，v7 已经不再停留在“纯设计草图”阶段，而是首次形成了：

- 目标态合同链
- 关键 bridge 对象
- 最小持久化层
- 审计进入治理链

也就是说，系统已经从：

```text
有哲学、有合同、但对象只存在于代码内存中
```

进入了：

```text
关键对象已经能落盘、可回查、可被审计
```

这是一个真正的阶段性里程碑。

---

## 2. 已闭合的缺口

### 缺口一：bridge 对象持久化与可查询

已闭合。

当前已经具备：

- `MechanismInstanceStore`
- `DerivationTraceStore`
- `recordFix -> MechanismInstance -> AcceptedReconstruction -> DerivationTrace -> OntologyDelta`

这意味着：

- reconstruction 引用的 bridge id 已经可以找回
- trace / reconstruction 双向引用已建立

### 缺口二：Episode event log

已闭合为“轻量事件时间线”层面。

当前已经能观察到：

- `observation_recorded`
- `mechanism_instance_created`
- `mechanism_instance_rejected`
- `reconstruction_written`
- `ontology_delta_written`
- `outcome_recorded`

在有路径场景下，还会额外出现：

- `hypothesis_created`
- `hypothesis_validated`
- `compile_applied / compile_blocked`

说明：

`Episode` 已开始从 envelope 走向 event-bearing instance。

### 缺口三：contract-audit 覆盖新对象

已闭合到第一轮绑定真值检查。

当前 `contract-audit` 已能检查 5 项：

1. `AcceptedReconstruction.mechanism_instance_ids` 可解析
2. `Episode.ontologyDeltaId` 可解析
3. `DerivationTrace.reconstructionId ↔ AcceptedReconstruction.traceId` 双向一致
4. `OntologyDelta.kind=none` 时 `no_update_reason` 非空
5. `MechanismInstance.status=accepted` 时 `claim_ids || support_link_refs` 非空

这意味着：

v7 对象已经第一次进入治理系统，而不是只存在于合同和代码里。

---

## 3. 目前最稳的结构主线

当前最清晰、也最值得继续坚持的主线是：

```text
Story
  → Episode 兼容壳
  → Episode event log
  → MechanismInstance
  → AcceptedReconstruction
  → DerivationTrace
  → OntologyDelta(kind=applied | none)
```

这里最重要的收敛有两个：

### 3.1 `NoUpdateReason` 身份已收束

不再把它与 `OntologyDelta` 并列，而是：

```text
OntologyDelta(kind=none) + no_update_reason payload
```

这让：

- Episode 绑定
- artifact 落盘
- contract-audit
- 后续 UI / summary

都保持在单一对象模型上。

### 3.2 `MechanismInstance` 已经进入主线

它不再只是口头上的桥对象，而是已经被正式放进：

- `v7-world-model-contract.md`
- `reconstruction-contract.md`
- `mechanism-instance-contract.md`
- 以及核心代码和 store

这意味着：

`MechanismClass -> MechanismInstance -> Reconstruction`

这条桥链已经有了真实承载点。

---

## 4. 当前仍需警惕的地方

虽然 gap1~3 已闭合，但还不能误判为“v7 已完成”。

### 4.1 `MechanismClass` 仍未真正落地

当前很多地方仍在使用：

- `proxy:*`
- `path_projection`

作为过渡引用。

这说明：

`MechanismInstance` 虽然已经显式化，但它桥接的另一端仍然是过渡态，而不是真正稳定的 `MechanismClass`。

### 4.2 `AcceptedReconstruction` 仍偏 shell

虽然：

- 它已经有 timeline
- 有 fidelity
- 有 trace
- 有 bridge id

但其生成逻辑仍主要依赖：

- 当前 path
- 当前 observation atoms

而不是完整 ontology replay。

所以目前更准确的理解仍是：

```text
结构化重建壳已成立
完整 ontology-driven replay 仍未成立
```

### 4.3 Episode 还不是 full stateful episode

现在的 Episode 更像：

- event log container

而不是：

- 完整 `StateSnapshot / Transition / ActionExecution` 驱动的状态演化体

这没有问题，但必须明确阶段边界，避免过早高估。

---

## 5. 下一步最值的设计方向

现在**不建议**继续优先扩：

- 再多一种新对象
- 更复杂的 replay 算法
- 更深的 UI / dashboard
- 更强的 audit 规则

下一步最值的是：

## `EpisodeEvent` 专项合同

原因：

1. Episode 已经开始承载事件序列，但还没有自己的独立 contract
2. 目前 event log 仍主要靠实现默契维持
3. 没有 contract，就很容易在后续补字段、补事件种类时再次漂移

应优先新增：

- `docs/current/episode-event-contract.md`

至少明确：

- `EpisodeEvent.kind` 枚举
- `seq` 单调性
- `payload` 最小字段
- 与 `Episode / MechanismInstance / AcceptedReconstruction / OntologyDelta` 的回指关系

---

## 6. 建议的推进顺序

### Phase A

新增 `episode-event-contract.md`

### Phase B

回填：

- `v7-world-model-contract.md`
- `artifact-contract.md`

明确 episode event 产物路径与地位

### Phase C

再让实现侧补：

- `episode-event-store.ts`
- artifact export
- 第二轮 audit（如果需要）

---

## 7. 一句话收尾

当前 v7 的状态不是“还停留在设计”，而是：

**关键对象链已经成立，下一步要从“对象存在”推进到“对象之间的事件语义被正式立法”。**
