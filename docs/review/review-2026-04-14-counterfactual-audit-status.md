---
kind: record
event: "2026-04-14 counterfactual audit milestone review"
recorded_at: 2026-04-14
immutable: true
---

# CounterfactualScenario 治理接入评审（2026-04-14）

> 记录 `CounterfactualScenario` 完成 artifact 导出与 contract-audit 第一轮接入后的阶段判断。

---

## 1. 里程碑结论

`CounterfactualScenario` 现在已经不只是：

- 合同对象
- 代码对象
- store 对象
- 测试对象

而是第一次成为：

- **artifact 对象**
- **contract-audit 可见对象**
- **CI 治理对象**

这意味着：

```text
CounterfactualScenario 已正式进入治理系统
```

---

## 2. 已满足的关键条件

当前已满足：

1. `counterfactual_scenarios/*.json` 已进入 artifacts
2. `mechanism_programs/*.json` 已导出，可供 `CF-3` 检查
3. `CF-1 ~ CF-4` 绑定规则均为空桶
4. `contract-audit-contract.md` 已登记 Counterfactual pass
5. `artifact-contract.md` 已登记 counterfactual / mechanism_program 导出目录

说明：

`CounterfactualScenario` 这条链已经从“对象存在”推进到了“对象受治理”。

---

## 3. 当前主线推进判断

当前主线已经形成：

```text
ObservationModel
  → ObservationRecord
  → SupportLink
  → Claim
  → MechanismProgram
  → CounterfactualScenario
```

这说明系统已正式从：

- 重建过去

推进到：

- 受约束地生成可能未来

也就是：

```text
v7 主链已稳
v8 入口已打开
```

---

## 4. 现在不该继续做什么

既然 `CounterfactualScenario` 已进入治理链，现在不建议继续优先补：

- 更多 Counterfactual 字段
- 更复杂的 Counterfactual 模拟
- 更强的 Counterfactual 审计规则

因为再继续深挖这一层，边际收益已经开始下降。

---

## 5. 下一步最值的对象

现在最自然的下一步，不是回头继续打磨 `CounterfactualScenario`，而是：

## `ExperimentDesign`

因为：

- 反事实已经可以生成
- 下一步自然该问：

```text
在这些可能未来里，哪个实验最值得做？
```

这正是 `ExperimentDesign` 的职责。

---

## 6. 推荐顺序

当前最合理的主线顺序应被明确为：

```text
ObservationModel（已治理）
  → MechanismProgram（已治理）
  → CounterfactualScenario（已治理）
  → ExperimentDesign（下一步）
```

再之后，才值得考虑：

- information gain
- active experiment planning
- failure boundary
- civilization memory

---

## 7. 一句话结论

**CounterfactualScenario 已经够稳，当前主线应正式转向 `ExperimentDesign`。**
