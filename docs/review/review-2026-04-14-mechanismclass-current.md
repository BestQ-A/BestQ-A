---
kind: review
status: current
date: 2026-04-14
focus: "MechanismClass governance closure"
---

# Review：MechanismClass 已进入治理系统

## 结论

`MechanismClass` 现在已经不只是 runtime 主链里的一个 ID。

截至 2026-04-14，它已经同时进入：

- 类型与 store
- `MC_*` de-proxy 主链
- artifact 导出（`mechanism_classes/*.json`）
- `contract-audit` 基础绑定检查（MC-1 ~ MC-5）

因此，`MechanismClass` 这条线可以视为：

> **最小本体对象已被治理化。**

这不等于多类本体化或晋升门控已经完成，但足以停止继续围绕“有没有这个对象”打转。

## 已成立事实

当前已被证实成立的链条：

```text
MechanismClass
  → MechanismProgram
  → MechanismInstance
  → AcceptedReconstruction
```

并且：

- 新导出 run 不再新增 `proxy:*`
- `mechanism_classes/*.json` 已进入 artifact
- `test-v8-mechanism-class-audit.mjs` 验证真实 export 不命中 MC-x 错误桶

## 仍未完成的部分

以下问题仍然存在，但已经从“对象不存在”下降为“高阶语义未完成”：

1. 多类本体化尚未开始
2. 跨 Episode 聚合晋升门控尚未实现
3. `PredictionError` 还没有真实反向修正 `MechanismProgram / MechanismClass`
4. `SupportLink` 第二轮深审计尚未接入

## 下一阶段判断

当前最值的下一步，不再是补更多浅层治理，而是：

> **把 `PredictionError` 从“被记录的偏差”推进成“可提名的模型修正依据”。**

换句话说，后续主线应从：

```text
PredictionError
```

推进到：

```text
PredictionError
  → ProgramRevisionProposal
  → MechanismProgram / ObservationModel 校正
```

## 一句话收束

`MechanismClass` 现在已经是系统里的“被治理本体对象”，下一步该解决的是：

**系统如何因为偏差而改模型，而不是继续证明对象存在。**
