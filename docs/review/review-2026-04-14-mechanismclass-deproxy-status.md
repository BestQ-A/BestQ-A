---
title: MechanismClass de-proxy 阶段评审
date: 2026-04-14
status: runtime-closed-artifact-open
---

# MechanismClass de-proxy 阶段评审

## 结论

`MechanismClass` 的 **runtime 主链** 已经第一次脱离 `proxy:*`。

当前工作区里，本地主链已经可以写成：

```text
MechanismClass.id = MC_*
  → MechanismProgram.mechanismClassRef
  → MechanismInstance.mechanism_class_ref
  → AcceptedReconstruction.selectedMechanismIds
```

并且这条链已经被聚焦测试覆盖。

但这轮还**没有完全闭合**，因为：

- `export-v7-artifacts.mjs` 仍有 demo 级 `proxy:*`
- `artifact-contract.md` 仍描述旧过渡态
- 历史 artifacts 与历史审计文本仍充满 `proxy:*`

所以这轮最准确的状态不是“彻底去代理完成”，而是：

## runtime 已闭合，artifact 仍有漂移

---

## 本地验证结果

以下测试已在当前工作区通过：

- `npm run build`
- `node causal-learner/mcp-server/tests/test-v7-mechanism-class-deproxy.mjs`
- `node causal-learner/mcp-server/tests/test-v7-mechanism-program.mjs`
- `node causal-learner/mcp-server/tests/test-v7-recordfix.mjs`

关键通过点：

1. `recordFix()` 不再产出 `proxy:*`
2. 默认 `MechanismProgram.mechanismClassRef` 使用真实 `MC_*`
3. `selectedMechanismIds[0] === mechanism_class_ref === MC_*`

---

## 已确认收口的实现面

### 1. `MechanismClassStore` 已存在

工作区中已出现：

- `core/mechanism-class-store.ts`

说明机制类已不再只是类型定义，而是开始具备真实身份持久化能力。

### 2. `pipeline.ts` 已改用真实机制类

`recordFix()` 当前不再拼：

- `proxy:hyp_*`
- `proxy:episode_*`

而是通过 `ensurePathProjectionMechanismClass()` 获取真实 `MC_*`。

### 3. `MechanismProgram` 默认程序也已改接真实类

默认程序不再绑定 `proxy:default_path_projection`，而是绑定真实默认 `MC_*`。

---

## 尚未收口的地方

### 1. artifact 导出仍有 proxy 漂移

当前仍能在：

- `scripts/export-v7-artifacts.mjs`

里找到 demo 级：

```text
mechanism_class_ref: proxy:demo_*
```

这意味着 runtime 已经对齐，但 artifact 侧还没完全对齐。

### 2. 合同文案仍残留旧过渡态表述

当前：

- `docs/current/artifact-contract.md`

仍把 `proxy:*` 描述成现行导出过渡态，这已经落后于 runtime 主链。

### 3. 历史 artifact 不应被误判为当前事实

已有 `artifacts/**` 中大量旧文件仍然带 `proxy:*`。这不是当前 runtime 的反证，而是历史产物尚未清理/重导。

所以后续审计要区分：

- 旧历史 artifact
- 新一轮 export 产物

---

## 下一轮最值目标

不是直接跳去 `ActionExecution -> new Episode`。

下一轮更稳的目标是：

## `MechanismClass de-proxy` 治理收口

具体包括：

1. `export-v7-artifacts.mjs` 停止生成新的 `proxy:*`
2. `artifact-contract.md` 改写为新的事实状态
3. 如有必要，补一轮 audit / export 测试，证明新 artifact 主链也是 `MC_*`

---

## 为什么不能直接跳下一层

因为如果现在直接去做：

```text
ExperimentDesign → ActionExecution → new Episode
```

就会把闭环建立在“runtime 已真实化、artifact 仍代理化”的分裂状态上。

这会造成两个后果：

1. 运行时和治理链再次脱节
2. 历史审计与当前现实再次不一致

---

## 一句话收口

`MechanismClass` 去代理已经在 runtime 主链里成立，但还差最后一步：

**让 export / artifact / 合同文案一起跟上。**
