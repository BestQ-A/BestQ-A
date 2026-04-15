---
title: ActionExecution 之后的下一轮主线
date: 2026-04-14
status: active-target
---

# ActionExecution 之后的下一轮主线

## 结论

`ActionExecution` 现在已经进入：

- runtime
- store
- artifact
- contract-audit

所以当前主线不该继续围着“动作有没有被执行”打转，而该前进一步：

## `OutcomeRecord`

原因很简单：

现在系统已经会：

```text
ExperimentDesign
  → ActionExecution
  → new Episode
```

但还不会把：

```text
new Episode 之后到底发生了什么
```

收成显式对象。

---

## 为什么是它

如果没有 `OutcomeRecord`：

- 执行结果仍只是 `Story.outcomeNotes` 里的字符串
- 反馈无法成为后续 `PredictionError` 的输入
- `ActionExecution` 仍停在“动作执行了”，而不是“动作产生了什么结构化反馈”

这会直接卡住后续：

- Counterfactual 校正
- MechanismProgram 校正
- 主动学习

---

## 一句话收口

`ActionExecution` 解决了“做了什么”，  
下一轮要解决的是：

**“做完以后，世界反馈是什么。”**
