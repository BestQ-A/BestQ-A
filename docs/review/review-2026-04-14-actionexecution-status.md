---
title: ActionExecution 阶段评审
date: 2026-04-14
status: runtime-closed-governance-open
---

# ActionExecution 阶段评审

## 结论

`ActionExecution` 的**最小运行时闭环**已经成立。

当前工作区里，至少一条链已经能跑通：

```text
ExperimentDesign
  → ActionExecution
  → new Episode
```

并且本地验证已经通过。

---

## 已验证事实

以下测试在当前工作区通过：

- `npm run build`
- `node causal-learner/mcp-server/tests/test-v8-action-execution.mjs`
- `node causal-learner/mcp-server/tests/test-v8-experiment-design.mjs`
- `node causal-learner/mcp-server/tests/test-v7-recordfix.mjs`

关键通过点：

1. `ActionExecutionStore` 存在并可导出
2. `createActionExecution` 存在并可导出
3. `pipeline.executeExperimentDesign(...)` 存在
4. `basedOnExperimentDesignId` 可解析
5. `actionRef === recommendedAction`
6. `targetEpisodeId` 已写入且可回查

---

## 当前状态判断

这轮最准确的状态不是“ActionExecution 已全部完成”，而是：

## runtime 已闭合，governance 尚未接入

当前仍缺：

- artifact 导出
- contract-audit 第一轮绑定检查
- 合同转 current 所需的治理闭环

---

## 下一轮最值目标

不是继续打磨 `ActionExecution` 对象本身，而是：

## `ActionExecution` 治理接入

最小范围：

1. `action_executions/*.json` 导出
2. `contract-audit` 第一轮基础绑定检查
3. 对应聚焦测试

---

## 建议第一轮 audit 项

1. `AX-1` `basedOnExperimentDesignId` 可解析
2. `AX-2` `sourceEpisodeId` 可解析
3. `AX-3` `targetEpisodeId` 可解析（若 `executionStatus = completed`）
4. `AX-4` `actionRef === ExperimentDesign.recommendedAction`

---

## 一句话收口

`ActionExecution` 已经不再是壳。下一步该让它进入治理系统，而不是继续只在 runtime 层成立。
