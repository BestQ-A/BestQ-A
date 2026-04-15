---
title: de-proxy 之后的下一轮主线
date: 2026-04-14
status: active-target
---

# de-proxy 之后的下一轮主线

## 结论

`MechanismClass` 的 runtime 与 export 主链已经完成去代理收口。

当前最值的下一步，不再是继续打磨 `proxy:*`，而是推进：

```text
ExperimentDesign
  → ActionExecution
  → new Episode
```

这一步的意义不是“多一个对象”，而是：

**让系统第一次真的把“选择下一步”变成“执行下一步并重新采样世界”。**

---

## 为什么是它

当前已经闭合的链条：

```text
ObservationModel
  → ObservationRecord
  → SupportLink
  → Claim
  → MechanismProgram
  → CounterfactualScenario
  → ExperimentDesign
```

如果停在这里，系统仍然只是：

- 解释过去
- 想象未来
- 选择下一步

但还没有：

- 执行下一步
- 获得新的世界采样
- 让新 Episode 回流修正旧判断

所以现在最关键的不是再添上层概念，而是补这个闭环桥。

---

## 为什么现在可以做

因为前面几层已经足够稳：

- ObservationModel 已治理
- MechanismProgram 已治理
- CounterfactualScenario 已治理
- ExperimentDesign 已治理
- MechanismClass de-proxy 已收口到 export

所以现在补执行桥，不会建立在代理身份或未治理对象之上。

---

## 本轮边界

只做最小闭环：

1. `ActionExecution` 成为显式对象
2. `ActionExecutionStore` 存在
3. 至少一条：

```text
ExperimentDesign
  → ActionExecution
  → new Episode
```

样例跑通

不做：

- 真正外部工具执行器
- PredictionError 精确算法
- FailureBoundary
- Civilization Memory

---

## 一句话收口

前面几层已经回答了“该做什么”。  
下一轮该开始回答：

**“做了之后，世界真的怎么变了？”**
