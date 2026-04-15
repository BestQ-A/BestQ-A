---
kind: record
event: "2026-04-14 v7 freeze criteria review"
recorded_at: 2026-04-14
immutable: true
---

# v7 冻结条件评审（2026-04-14）

> 目的：给当前主线一个“什么时候可以停止继续补基础对象、开始吸收 v8 / 面向终局推进”的判据。
> 否则系统很容易反复在：
> - 继续补对象壳
> - 提前吸收更高版本思想
> 之间来回摇摆。

---

## 1. 当前主线已经到哪里

截至当前工作区，以下链条已经基本成立：

```text
ObservationRecord
  → SupportLink
  → Claim
  → MechanismInstance
  → AcceptedReconstruction
  → DerivationTrace
  → OntologyDelta
```

而且这些对象已经逐步进入：

- contract
- store
- artifact
- contract-audit / CI

这说明当前主线已经不再是“纯设计阶段”，而是一个**正在收敛的工程基础层**。

---

## 2. 为什么现在需要“冻结条件”

因为从 `v8 / v9 / v10 / v11` 看，未来方向非常多：

- ObservationModel
- MechanismProgram
- CounterfactualScenario
- PerspectiveModel
- FailureBoundaryArchive
- Civilization Memory

如果没有冻结条件，主线就会出现一个典型坏现象：

```text
基础链条还没稳
就不断引入更高版本概念
```

这样最后会导致：

- 对象越来越多
- 边界越来越虚
- contract 越来越宏大
- 代码反而越来越像过渡层拼贴

所以必须先回答：

> **v7 到什么程度，才算“基础对象层已足够稳，可以往上长”？**

---

## 3. v7 的真正职责

v7 不是终局，也不该承担所有未来能力。

v7 的正确职责应该被收束为：

### 3.1 建立世界采样链

也就是：

- ObservationRecord
- Episode
- MechanismInstance
- AcceptedReconstruction
- OntologyDelta

这些对象必须真实存在，并且能互相绑定。

### 3.2 建立证据链

也就是：

- ObservationRecord
  → SupportLink
  → Claim
  → DerivationTrace

### 3.3 建立对象治理链

也就是：

- store
- artifact
- contract-audit

这三者都能看见这些对象，而不只是内存里暂时有。

一句话：

**v7 的使命不是生成未来，而是让“世界采样 -> 证据 -> 重建 -> 更新”这条基础链第一次真正站稳。**

---

## 4. 建议的 v7 冻结条件

只有以下条件都满足后，我才建议把主线重心逐步转到 `v8`。

### A. 对象存在性冻结

以下对象必须都具备：

- contract
- code type
- store
- artifact export
- audit coverage（至少第一轮）

对象列表：

1. `Episode`
2. `ObservationRecord`
3. `SupportLink`
4. `MechanismInstance`
5. `AcceptedReconstruction`
6. `DerivationTrace`
7. `OntologyDelta`

### B. 主链闭合冻结

至少一条真实路径能走完：

```text
submitObservation
  → ObservationRecord
  → recordFix
  → SupportLink
  → MechanismInstance
  → AcceptedReconstruction
  → DerivationTrace
  → OntologyDelta(kind=applied|none)
```

### C. 语义一致性冻结

以下语义不得再明显漂移：

1. `NoUpdateReason` 已固定为 `OntologyDelta(kind=none)` payload
2. `MechanismInstance` 不再继续改字段名和状态机语义
3. `SupportLink` 不再混入 compiled Ref / fake ids
4. `AcceptedReconstruction` 不再继续摇摆于 path proxy 和 bridge 引用之间

### D. 治理覆盖冻结

至少以下绑定真值要进入 CI：

1. reconstruction ↔ mechanismInstance
2. episode ↔ ontologyDelta
3. trace ↔ reconstruction
4. ontology kind=none ↔ no_update_reason
5. accepted mechanismInstance ↔ claim/support
6. supportLink ↔ observationRecord / claim

### E. 过渡态边界冻结

必须明确哪些东西仍然是过渡态：

- `proxy:*`
- `path_projection`
- placeholder fidelity

并且这些过渡态已经被合同写死，不能再在不同文件里换不同说法。

---

## 5. 在冻结前，不该做什么

在上述冻结条件没有满足前，不建议主线优先推进：

### 不建议优先做

- `CounterfactualScenario`
- `ExperimentDesign`
- `PerspectiveModel`
- `ObserverModel`
- `InstrumentModel`
- `FailureBoundaryArchive`
- `Ontology Federation`

### 理由

这些都是对的，但它们都要求基础链已经稳定。

否则你会出现：

> 更高层的对象越来越好看，底层对象身份却还在继续漂。

这会让未来每一层都变成过渡层。

---

## 6. 冻结后，最先吸收什么

一旦 v7 满足冻结条件，最值得优先吸收的 `v8` 增量只有两个：

### 6.1 `ObservationModel`

理由：

- 当前 `ObservationRecord` 已成立
- 下一步最自然的问题就是“它如何从世界状态投影出来”

### 6.2 `MechanismProgram`

理由：

- 当前 `MechanismClass` 仍偏模板
- 它的正确终局应该是程序化的状态转移模型

而以下对象仍然后置：

- `CounterfactualScenario`
- `ExperimentDesign`

因为它们需要 ObservationModel 和 MechanismProgram 先站稳。

---

## 7. 终局视角下的主线顺序

如果完全“以终为始”，建议把主线顺序明确成：

```text
当前施工：v7 基础对象链
下一阶段吸收：v8 的 ObservationModel / MechanismProgram
再下一阶段：v8 的 Counterfactual / ExperimentDesign
长期北极星：v11 的 Failure Boundary / Civilization Memory
```

一句话：

**终局北极星可以是 v11，但施工顺序必须是 v7 -> v8(前半) -> v8(后半) -> v11。**

---

## 8. 一句话结论

**不要因为已经看见终局，就跳过基础链的冻结。真正的“以终为始”不是直接做 v11，而是先把 v7 做到足够稳，之后只吸收那些终局一定需要、且今天实现不会返工的对象。**
