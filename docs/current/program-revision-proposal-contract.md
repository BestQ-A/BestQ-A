---
kind: contract
status: draft
phase: 4
schema_version: 1
describes: "模型修正提名对象"
upstream:
  - prediction-error-contract.md
  - mechanism-program-contract.md
  - observation-model-contract.md
downstream:
  - mechanism-program-contract.md
  - observation-model-contract.md
---

# ProgramRevisionProposal 合同：从偏差记录到模型修正建议

## §1 定位

当前系统已经能形成：

```text
PredictionError = 预测与真实之间差了什么
```

但这还不是学习闭环。

系统若想因为偏差而改进模型，还必须显式回答：

> 这条偏差意味着应该修哪里？

`ProgramRevisionProposal` 的职责，就是把这个问题对象化。

一句话：

```text
PredictionError               = 偏差是什么
ProgramRevisionProposal       = 这个偏差提示应如何修正模型
```

## §2 关系链

目标关系链：

```text
PredictionError
  → ProgramRevisionProposal
  → MechanismProgram / ObservationModel
```

第一轮只做“提名”，不做自动应用。

## §3 TypeScript 接口草案

```typescript
interface ProgramRevisionProposal {
  id: string;

  basedOnPredictionErrorIds: string[];

  targetKind: 'mechanism_program' | 'observation_model';
  targetRef: string;

  proposedChangeKind:
    | 'phase_adjustment'
    | 'signature_adjustment'
    | 'precondition_adjustment'
    | 'observation_mapping_adjustment'
    | 'validity_narrowing'
    | 'validity_broadening';

  rationale: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';

  createdAt: string;
  createdBy: string;
}
```

## §4 最小不变量

1. `basedOnPredictionErrorIds.length >= 1`
2. `targetKind` 必须是显式离散值
3. `targetRef` 必须非空
4. `rationale` 必须非空
5. 第一轮 `status` 初始只能为 `proposed`

## §5 与现有对象的边界

### 5.1 与 `PredictionError`

`PredictionError` 只描述偏差，不裁决修正方向。

### 5.2 与 `MechanismProgram`

第一轮只允许 proposal 指向 `MechanismProgram`，不允许直接改 program 本身。

### 5.3 与 `ObservationModel`

当偏差主要来自观测映射时，proposal 可指向 `ObservationModel`。

### 5.4 与 `OntologyDelta`

`ProgramRevisionProposal` 不是 `OntologyDelta`。

区别：

- `ProgramRevisionProposal`：偏差驱动的修正建议
- `OntologyDelta`：经过门控后真正被接受的本体变化

## §6 第一轮实现建议

建议最小实现：

1. 新增 `program-revision-proposal.ts`
2. 新增 `program-revision-proposal-store.ts`
3. 在 `executeExperimentDesign()` 末尾，若生成了 `PredictionError`，允许根据最小规则生成一条 proposal

最小规则允许很保守：

- `errorKind = observation` → `targetKind='observation_model'` + `observation_mapping_adjustment`
- `errorKind = outcome | transition` → `targetKind='mechanism_program'` + `validity_narrowing`

## §7 明确不做

本阶段不做：

- 自动修改 `MechanismProgram`
- 自动修改 `ObservationModel`
- 多 proposal 聚类
- 基于 score 的排序算法
- 直接晋升为 `OntologyDelta`

## §8 转 current 的条件

- [ ] `ProgramRevisionProposal` 成为显式对象并可持久化
- [ ] 至少一条 `PredictionError → ProgramRevisionProposal` 样例跑通
- [ ] `targetRef` 能真实指向 `MechanismProgram` 或 `ObservationModel`
- [ ] contract-audit 能检查基础绑定真值

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把“偏差如何提名模型修正”收束为一等对象 |
