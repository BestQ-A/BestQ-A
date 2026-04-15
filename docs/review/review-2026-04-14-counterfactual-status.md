---
kind: record
event: "2026-04-14 counterfactual milestone review"
recorded_at: 2026-04-14
immutable: true
---

# CounterfactualScenario 阶段性评审（2026-04-14）

> 记录 `CounterfactualScenario` 第一轮实现完成后的阶段判断。

---

## 1. 里程碑判断

`CounterfactualScenario` 现在已经从“设计史中的高层想法”变成了：

- 显式对象
- 持久化对象
- 可测试对象

这意味着系统第一次开始拥有：

```text
如果改一个条件，会发生什么？
```

这种问题的对象级承载体。

---

## 2. 当前主线推进到哪里了

截至当前，主线已经从：

```text
ObservationModel
  → ObservationRecord
  → SupportLink
  → Claim
  → MechanismProgram
```

推进到：

```text
ObservationModel
  → ObservationRecord
  → SupportLink
  → Claim
  → MechanismProgram
  → CounterfactualScenario
```

这说明系统已经开始从“解释过去”转向“生成可能未来”。

---

## 3. 但它还没有完全闭环

和前面几个对象一样，现在最需要区分的是：

### 已成立

- 对象存在
- store 存在
- 最小测试存在

### 尚未成立

- artifact 导出是否进入规范化目录
- `contract-audit` 是否已检查：
  - `baseEpisodeId`
  - `baseReconstructionId`
  - `mechanismProgramRefs`
  - `modifiedAssumptions`

换句话说：

> 当前 `CounterfactualScenario` 已经进入实现层，但还没有进入治理层。

---

## 4. 现在不该直接跳去 `ExperimentDesign`

虽然从对象演化上讲，下一层确实是：

```text
CounterfactualScenario
  → ExperimentDesign
```

但现在还缺一件关键事：

> 让反事实对象进入 artifact / audit / CI 的治理链。

如果现在就直接去做 `ExperimentDesign`，会重演之前的老问题：

- 对象有了
- 但治理没跟上
- 后面又要回头补 audit

所以当前最稳的顺序仍然是：

1. 先把 `CounterfactualScenario` 接入治理
2. 再去做 `ExperimentDesign`

---

## 5. 建议的下一步

### 近期最值

**补 `CounterfactualScenario` 的第一轮 audit / artifact 闭环。**

建议 audit 第一轮只查这 4 项：

1. `baseEpisodeId` 可解析
2. `baseReconstructionId` 可解析
3. `mechanismProgramRefs` 全部可解析
4. `modifiedAssumptions` 非空

### 再下一步

当以上四项进入治理链后，再推进：

**`ExperimentDesign`**

---

## 6. 一句话结论

**CounterfactualScenario 已经成立为对象，但还没进入治理系统；所以现在最该做的不是 ExperimentDesign，而是先补 Counterfactual 的 audit / artifact 闭环。**
