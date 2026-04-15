---
kind: record
event: "2026-04-14 observation model milestone review"
recorded_at: 2026-04-14
immutable: true
---

# ObservationModel 阶段性评审（2026-04-14）

> 记录 `fee1d33` 完成后的阶段判断。  
> 目标不是定义新合同，而是确认：当前主线是否可以从观测侧转向机制侧。

---

## 1. 里程碑判断

`ObservationModel` 这轮不是“多了一个对象”，而是第一次让 v7 的观测侧拥有了明确的上游锚点。

当前已经成立的链是：

```text
ObservationModel
  → ObservationRecord
  → SupportLink
  → Claim
  → MechanismInstance
  → AcceptedReconstruction
```

这里最关键的变化是：

> `ObservationRecord` 不再等于“事实本身”，而开始被明确视作某个观测模型投影出来的结果。

这一步对长期上限的价值很高，因为后续：

- 观测噪声
- 盲区
- 视角差异
- 潜在状态推断

都可以围绕 `ObservationModel` 展开，而不必再去污染 `ObservationRecord` 或 `SupportLink`。

---

## 2. 当前主线状态

截至当前，v7 主线中已经比较稳定的对象链是：

```text
ObservationModel
  → ObservationRecord
  → SupportLink
  → Claim
  → MechanismInstance
  → AcceptedReconstruction
  → DerivationTrace
  → OntologyDelta
```

这意味着：

### 已基本站稳的层

- Observation 起点
- 证据边
- 判断对象
- 机制实例桥
- 重建对象
- 推导链对象
- 本体更新对象

### 仍然是过渡态的层

- `MechanismClass` 仍偏模板化
- `MechanismProgram` 才刚开始进入主线
- `Counterfactual / ExperimentDesign` 仍不应现在主线化

---

## 3. 为什么现在应该转去机制侧

因为如果继续在 observation 侧深挖，会很容易进入“把局部做得越来越精细，但机制层还是空”的不平衡状态。

当前 observation 侧已经足够支撑下一步：

- Observation 不再是裸事实
- Observation 有上游模型
- 证据边有显式起点

所以现在最合理的顺序是：

1. 冻结 observation 侧语义
2. 转去做 `MechanismProgram`
3. 再之后才考虑：
   - `CounterfactualScenario`
   - `ExperimentDesign`

换句话说：

**现在继续补 observation 会边际收益下降，补 mechanism 才是新的上限来源。**

---

## 4. 当前最应该坚持的纪律

### 4.1 不要再让 Observation 层吞掉机制职责

当前已经有一种风险：

> ObservationModel 很容易继续被扩成“解释一切”的层。

这是错误方向。

正确边界应该继续坚持：

- `ObservationModel` 只回答“怎么观察”
- `MechanismProgram` 才回答“怎么展开”

### 4.2 不要过早把反事实拉进来

现在虽然已经开始接近 v8，但不要马上做：

- `CounterfactualScenario`
- `ExperimentDesign`

因为如果 `MechanismProgram` 还没立住，反事实只会变成：

- 更花哨的 reconstruction 壳

而不是：

- 真正的生成式机制模拟

### 4.3 不要让 `proxy:*` 永久化

Observation 侧已经有真实上游对象了。  
机制侧如果还长期停留在：

- `proxy:*`
- `path_projection`

就会形成新的结构不对称。

所以机制侧必须成为下一步优先级最高的修复目标。

---

## 5. 下一步最值的设计对象

下一步最值得主线化的对象是：

## `MechanismProgram`

它的价值在于：

- 给 `MechanismClass` 一个真正的程序化终局
- 给 `MechanismInstance` 一个不再依赖 path proxy 的上游
- 给未来 `CounterfactualScenario` 和 `ExperimentDesign` 提供真实引擎

因此建议主线顺序是：

```text
ObservationModel（已成立）
  → MechanismProgram（下一步）
  → CounterfactualScenario
  → ExperimentDesign
```

---

## 6. 一句话结论

**Observation 侧已经第一次站稳，当前主线应立即转向机制侧，不要继续在观测层过度打磨。**
