---
title: ExperimentDesign 治理闭环确认
date: 2026-04-14
status: closed-for-now
---

# ExperimentDesign 治理闭环确认

## 结论

`ExperimentDesign` 这一层现在已经不再是“对象存在但治理缺席”的状态。

当前工作区里，这条线已经同时具备：

- 合同：`docs/current/experiment-design-contract.md`
- 对象与存储：`experiment-design.ts` / `experiment-design-store.ts`
- artifact：`experiment_designs/*.json`
- audit：`checkExperimentDesignBindings()` + `R28–R30`
- 测试：`test-v8-experiment-design.mjs` 与 `test-v8-experiment-design-audit.mjs`

所以这条线可以先冻结，不再优先反复打磨。

## 已确认事实

### 1. artifact 已成立

`export-v7-artifacts.mjs` 已导出 `experiment_designs/`，且导出的实例能被 `contract-audit` 扫描。

### 2. audit 已成立

`contract-audit.mjs` 已包含：

- `ED-1` `baseEpisodeId` resolvable
- `ED-2` `basedOnCounterfactualIds` 全部 resolvable
- `ED-3` `recommendedAction` 属于候选集合

### 3. 测试已成立

`test-v8-experiment-design-audit.mjs` 现在已经形成独立治理验证面，并且使用真实 artifact + 真实 audit 路径，而不是 mock-only。

## 当前主线因此前移

当前已经闭合的主链可以写成：

```text
ObservationModel
  → ObservationRecord
  → SupportLink
  → Claim
  → MechanismProgram
  → CounterfactualScenario
  → ExperimentDesign
```

下一步最值目标，不再是继续补 `ExperimentDesign`，而是：

```text
MechanismClass 脱离 proxy:* 过渡态
```

## 为什么是它

因为当前主链里最明显的结构性过渡态仍然是：

- `MechanismInstance.mechanism_class_ref = proxy:*`
- `MechanismProgram.mechanismClassRef = proxy:*`
- `AcceptedReconstruction.selectedMechanismIds` 允许 `proxy:*`

这说明机制侧已经具备：

- 类对象
- 程序对象
- 实例对象
- 重建对象

但它们之间的“本体身份”仍然是代理引用，而不是真实 `MC_*`。

## 下一轮边界

下一轮只做“最小去代理”，不做这些事：

- 不做 MechanismClass 完整语义重写
- 不做多 Episode 自动合并
- 不做 promote/review 工作流升级
- 不做 v11 的 FailureBoundary / Constitution 层

只做：

1. `MechanismClassStore`
2. `pipeline.recordFix()` 生成 / 复用真实 `MC_*`
3. `MechanismProgram` 与 `MechanismInstance` 改接真实 `MC_*`
4. 测试验证主链不再依赖 `proxy:*`

## 一句话收口

`ExperimentDesign` 已进入治理系统。主线现在该回到机制本体层，把 `proxy:*` 这个长期过渡态拔掉。
