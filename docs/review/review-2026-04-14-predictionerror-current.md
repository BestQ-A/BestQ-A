---
title: PredictionError 收口为 Current
date: 2026-04-14
status: closed-for-now
---

# PredictionError 收口为 Current

## 结论

`PredictionError` 现在已经满足转 `current` 的最小条件。

当前工作区里，这条链已经全部成立：

```text
CounterfactualScenario
  → ExperimentDesign
  → ActionExecution
  → OutcomeRecord
  → PredictionError
```

并且它已经同时进入：

- runtime
- store
- artifact
- contract-audit

## 为什么现在可以升 current

此前阻止它转 `current` 的唯一硬原因是：

- `expectedSummary` 还停留在硬编码 fallback

现在这个点已经被收口：

- 优先使用真实 `CounterfactualScenario.predictedOutcome`
- 仅在对象缺失或字段为空时，退回显式降级文本

因此：

- `actualSummary` 来自 `OutcomeRecord.summary`
- `expectedSummary` 优先来自真实上游对象
- fallback 仍保留，但已不再伪装成目标态

## 当前仍未做的事

这不等于 `PredictionError` 已经终局完成。

当前仍未做：

- `score` 数值算法
- `deltaSummary` 语义 diff
- 多 Counterfactual 对比
- 自动回写 `MechanismProgram / ObservationModel / ValidityEnvelope`

这些属于下一阶段，不属于当前层的最小成立条件。

## 下一步最值目标

现在最值得补的，不再是：

- 再给 `PredictionError` 加更多治理

而是回到 v7 当前最大的基础缺口：

## `StateSnapshot / Transition`

因为当前主链虽然已经能：

- 预测
- 执行
- 记录反馈
- 记录偏差

但 `Episode` 仍然只有：

- event log

还没有真正的：

- `StateSnapshot`
- `Transition`

也就是说，系统已经开始拥有“闭环学习对象”，但还没有完整的“状态演化对象”。

## 一句话收口

`PredictionError` 这层已经够稳，可以先冻结。  
下一步最值的不是继续打磨误差对象，而是回到：

**Episode 的状态演化层。**
