---
title: StateSnapshot / Transition 收口为 Current
date: 2026-04-14
status: closed-for-now
---

# StateSnapshot / Transition 收口为 Current

## 结论

`StateSnapshot / Transition` 现在已经同时进入：

- runtime
- store
- artifact
- contract-audit

所以这一层可以先冻结，不再优先反复打磨。

---

## 已验证事实

以下测试在当前工作区通过：

- `npm run build`
- `node causal-learner/mcp-server/tests/test-v8-state-snapshot.mjs`
- `node causal-learner/mcp-server/tests/test-v8-transition.mjs`
- `node causal-learner/mcp-server/tests/test-v8-state-transition-audit.mjs`

关键通过点：

1. `submitObservation()` 自动产出 initial snapshot
2. `executeExperimentDesign()` 产出 post-action snapshot + transition
3. `transition.causedByActionId === actionExecution.id`
4. `state_snapshots/*.json` / `transitions/*.json` 已进入 artifact
5. `contract-audit` 已有 SS-1..SS-2 / TR-1..TR-3

---

## 当前主链

当前已闭合到：

```text
StateSnapshot
  → Transition
  → StateSnapshot
```

并且它已经被：

```text
ExperimentDesign
  → ActionExecution
  → OutcomeRecord
  → PredictionError
```

这条更高层链稳定引用。

---

## 下一步最值目标

下一步最值的，不再是继续补状态对象或治理规则，而是：

## `MechanismClass` 本体治理接入

原因：

- `MechanismClass` 已有真实 `MC_*`
- 已有 store
- 主链已完成 de-proxy
- 但它本身还没有进入 artifact / contract-audit

也就是说：

> 机制实例、机制程序、重建、偏差都已经被治理，
> 但“机制类本体”自己还没有被治理。

---

## 一句话收口

`StateSnapshot / Transition` 已经够稳。  
下一步最值的是：

**让 `MechanismClass` 本体对象进入治理系统。**
