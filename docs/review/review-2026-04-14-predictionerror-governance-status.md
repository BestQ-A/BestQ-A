---
title: PredictionError 治理接入后的状态判断
date: 2026-04-14
status: governance-closed-runtime-closed-not-current
---

# PredictionError 治理接入后的状态判断

## 结论

`PredictionError` 现在已经同时进入：

- runtime
- store
- artifact
- contract-audit

但它**现在还不应升为 `current`**。

原因只有一个，而且是硬原因：

## `expectedSummary` 还没有稳定来自真实上游对象

当前 `pipeline.ts` 里仍存在：

```text
const expectedSummary = "unknown expected outcome"
```

这意味着：

- `PredictionError` 作为对象已经成立
- 治理链也已经成立
- 但“预测值来自真实 Counterfactual / MechanismProgram”这件事还没成立

所以它还处在：

## governance 已闭合，语义来源仍未收口

---

## 已确认成立的部分

以下都已通过：

- `npm run build`
- `test-v8-prediction-error.mjs`
- `test-v8-prediction-error-audit.mjs`
- `test-v8-outcome-record.mjs`
- `test-v8-action-execution.mjs`

当前链条已成立：

```text
ExperimentDesign
  → ActionExecution
  → OutcomeRecord
  → PredictionError
```

并且：

- `prediction_errors/*.json` 已导出
- `contract-audit` 已有 PE-1..PE-4

---

## 为什么现在还不能升 current

`prediction-error-contract.md` 的转 current 条件里有一条：

> `expectedSummary` 与 `actualSummary` 都来自真实对象而非硬编码

其中：

- `actualSummary` 已满足：来自 `OutcomeRecord.summary`
- `expectedSummary` 尚未满足：当前仍允许硬编码 fallback

所以现在如果升 `current`，会制造合同与实现不一致。

---

## 下一步唯一正确目标

不是继续补治理，不是继续补 score。

下一步应该只做：

## `PredictionError expectedSummary real-source wiring`

也就是：

1. 让 pipeline 能拿到真实 `CounterfactualScenario`
2. 用真实 `predictedOutcome` 填 `expectedSummary`
3. 只有拿不到时，才保留受限 fallback 语义

---

## 一句话收口

`PredictionError` 已经进入治理系统，但还没有拿到真实预测来源。  
下一轮应该补的不是更多审计，而是：

**把 `expectedSummary` 从硬编码兜底，升级成真实对象引用。**
