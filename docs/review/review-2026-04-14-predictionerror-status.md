---
title: PredictionError 阶段评审
date: 2026-04-14
status: runtime-closed-governance-open
---

# PredictionError 阶段评审

## 结论

`PredictionError` 的**最小运行时闭环**已经成立。

当前工作区里，至少一条链已经能跑通：

```text
CounterfactualScenario
  → ExperimentDesign
  → ActionExecution
  → OutcomeRecord
  → PredictionError
```

但当前这条线还没有进入治理系统。

所以这轮最准确的状态不是“PredictionError 已全部完成”，而是：

## runtime 已闭合，governance 尚未接入

---

## 已验证事实

以下测试在当前工作区通过：

- `npm run build`
- `node causal-learner/mcp-server/tests/test-v8-prediction-error.mjs`
- `node causal-learner/mcp-server/tests/test-v8-outcome-record.mjs`
- `node causal-learner/mcp-server/tests/test-v8-action-execution.mjs`

关键通过点：

1. `PredictionErrorStore` 存在并可导出
2. `createPredictionError` 存在并可导出
3. `executeExperimentDesign()` 能产出 `predictionError`
4. `PredictionError -> OutcomeRecord / ActionExecution` 最小引用已经成立

---

## 当前限制

当前实现仍是第一轮最小偏差对象：

- `expectedSummary` 现在允许退化为 `"unknown expected outcome"`
- `score` 固定为 `null`
- `deltaSummary` 目前还是简单文字差异

这些都不是当前缺陷，而是下一层目标。

---

## 下一轮最值目标

不是继续打磨 `PredictionError` 的 runtime 算法，而是：

## `PredictionError` 治理接入

最小范围：

1. `prediction_errors/*.json` 导出
2. `contract-audit` 第一轮基础绑定检查
3. 对应聚焦测试

建议第一轮只查：

1. `causedByActionExecutionId` 可解析
2. `outcomeRecordId` 可解析
3. `basedOnCounterfactualId` 如果存在则可解析
4. `expectedSummary / actualSummary / deltaSummary` 非空

---

## 一句话收口

`PredictionError` 已经不再是概念草图。  
下一步该让它进入 artifact / audit / CI，而不是继续只停在 runtime 层。
