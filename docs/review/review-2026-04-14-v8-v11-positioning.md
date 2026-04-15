---
kind: record
event: "2026-04-14 v8-v11 positioning review"
recorded_at: 2026-04-14
immutable: true
---

# v8 / v9 / v10 / v11 设计定位评审（2026-04-14）

> 目的：判断 `design_history/` 中新增的 `v8 / v9 / v10 / v11`，哪些应当作为当前主线的“终局北极星”，哪些应当只保留为设计史，不应过早主线化。

---

## 1. 总判断

### 一句话结论

**v11 可以作为长期哲学终局，但不能作为当前工程主线。**

更准确地说：

- `v11` 适合作为 **远期北极星**
- `v8` 适合作为 **下一阶段最值得吸收的增量来源**
- `v9 / v10 / v11` 目前都不适合直接进入 `current/` 作为新的主合同主线

---

## 2. 为什么不能直接主线化 v11

### 2.1 当前主线还在补“单一本体下的对象链”

到目前为止，当前工作区刚刚建立起来的是：

```text
ObservationRecord
  → SupportLink
  → Claim
  → MechanismInstance
  → AcceptedReconstruction
  → DerivationTrace
  → OntologyDelta
```

也就是说，我们现在的工程主线仍在解决：

- 观测对象化
- 证据边对象化
- 机制实例桥接
- 重建对象落盘
- 本体更新对象落盘

这条链才刚刚开始稳定。

而 `v11` 已经在讨论：

- FailureBoundaryArchive
- CounterexampleCommons
- Institutional Compile Layer
- Civilization Memory Layer
- Reflexive civilization engine

这些概念不是错，而是**层级比当前实现高至少两层**。

### 2.2 v11 的问题不是太大，而是太早

`v11` 真正有价值的地方，不是它的新对象本身，而是它强迫我们承认：

1. 失败边界必须长期保存
2. 观察者属于世界内部
3. 部署会反过来改变世界
4. 文明真正延续的不是答案，而是可纠错的 lineage

这些判断在哲学层是对的。

但如果现在把它们直接主线化，就会产生一个很危险的后果：

> 当前尚未稳定的 `v7` / `v8` 对象链，会再次被“未来版本的超大叙事”压扁。

换句话说：

**v11 不会直接帮你把眼前对象链做稳，只会诱惑你提前开更多层。**

---

## 3. v8 才是当前最值得吸收的版本

如果从“以终为始”的角度看，最值得吸收进当前主线的，不是 v11，而是 v8。

### 3.1 v8 的核心增量是可直接接进当前主线的

`v8` 的几个关键对象：

- `LatentStateClass`
- `ObservationModel`
- `MechanismProgram`
- `CounterfactualScenario`
- `ExperimentDesign`

其中最适合当前阶段吸收的，是：

#### A. `ObservationModel`

当前你已经开始做：

- `ObservationRecord`
- `SupportLink`

下一步最自然的问题就是：

> `ObservationRecord` 到底是不是世界状态本身，还是某种“通过观测模型投影出来的像”？

`ObservationModel` 正好能回答这个问题。

#### B. `MechanismProgram`

当前 `MechanismClass` 仍然偏向：

- 关系模板
- 过程骨架

而不是：

- 程序化状态转移模型

所以 `MechanismProgram` 给出了 `MechanismClass` 的正确终局方向。

### 3.2 为什么不是立刻吸收 `CounterfactualScenario`

因为反事实要站在：

- 真实 ObservationRecord
- 真实 SupportLink
- 真实 MechanismClass / MechanismProgram
- 稳定 Reconstruction

之上。

当前这些基础还没全部稳定，所以：

- `ObservationModel` 可以先行
- `CounterfactualScenario` 应后置

---

## 4. v9 / v10 / v11 中真正值得前置吸收的“单点思想”

虽然我不建议现在主线化它们，但我认为其中有 3 个思想可以提前吸收。

### 4.1 来自 v9：`PerspectiveModel`

这个思想很重要，而且可以前置。

它解决的是：

> “谁在观察” 和 “通过什么视角观察”，必须被显式记录。

这很适合作为 `ObservationModel` 的上游伙伴：

- `PerspectiveModel`
- `ObservationModel`
- `ObservationRecord`

形成一条更清晰的观测链。

### 4.2 来自 v10：Observer / Instrument Layer

这其实和上面的 `PerspectiveModel` 是同一路思想。

当前最值得吸收的是：

- Observation 必须带 observer / instrument
- 观测永远不是无位置事实

这可以提前进入当前主线，但不要上升到 v10 整体。

### 4.3 来自 v11：FailureBoundary 是终局资产

`v11` 最值得保留的一点，是：

> 失败不是噪声，而是边界的负片。

这个想法非常对，但它不需要现在就变成 `FailureBoundaryArchive` 这种大层。

它更适合作为：

- 后续 `OntologyDelta` / `CounterexampleSet`
- 以及未来 replay / experiment 体系

的设计指导。

---

## 5. 建议的主线顺序

如果按“以终为始，但不提前过载”的原则来排，我建议是：

### 当前稳定主线

继续沿：

```text
v7 作为工程主线
```

也就是：

- Episode
- ObservationRecord
- SupportLink
- Claim
- MechanismInstance
- AcceptedReconstruction
- DerivationTrace
- OntologyDelta

### 下一阶段增量

从 `v8` 吸收：

1. `ObservationModel`
2. `MechanismProgram`

### 再下一阶段

当 `ObservationModel + MechanismProgram` 稳定后，再引入：

3. `CounterfactualScenario`
4. `ExperimentDesign`

### 长期北极星

把 `v11` 保留为：

- 哲学终局
- 文明记忆方向
- 失败边界方向

但不要现在就强行进入 `current/`。

---

## 6. 推荐判断

### 推荐

- **把 `v11` 当作北极星**
- **把 `v8` 当作下一步合同化输入**

### 不推荐

- 现在就把 `v11` 变成主合同
- 现在就引入 `Ontology Federation / Constitution / Civilization Memory` 为工程对象

---

## 7. 最适合的下一步

如果要真正“以终为始”，最合理的下一步不是写 `v12`，而是：

### 新增

- `docs/current/observation-model-contract.md`

### 之后再做

- `docs/current/mechanism-program-contract.md`

这是当前主线能够稳定吸收、又真正面向终局的最短路径。

---

## 8. 一句话收尾

**v11 是远期真北极星，但当前工程该吸收的是 v8 里的“ObservationModel + MechanismProgram”，而不是把文明级概念过早压进主线。**
