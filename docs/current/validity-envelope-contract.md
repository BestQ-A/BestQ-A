---
kind: contract
status: draft
phase: 4
schema_version: 1
describes: "MechanismProgram 有效域对象规范"
upstream:
  - mechanism-program-contract.md
  - prediction-error-contract.md
downstream:
  - mechanism-program-contract.md
  - program-revision-proposal-contract.md
---

# ValidityEnvelope 合同：MechanismProgram 的适用边界

## §1 定位

当前 `MechanismProgram` 已经有：

- `preconditions`
- `failsWhen`
- `contextConstraints`（在更早层的概念里）

但这些边界条件仍是散落字段，不是显式对象。

`ValidityEnvelope` 的职责，就是把这个问题对象化：

> **这个程序在什么条件下应当被认为有效，超出什么边界应当被收窄、扩展或拒绝。**

一句话：

```text
MechanismProgram = 机制如何运行
ValidityEnvelope = 这个运行规则在哪些边界内可信
```

## §2 关系链

目标关系链：

```text
MechanismProgram
  → ValidityEnvelope
  ← PredictionError / ProgramRevisionProposal
```

## §3 TypeScript 接口草案

```typescript
interface ValidityEnvelope {
  id: string;
  mechanismProgramRef: string;

  contextRefs: string[];
  requiredPreconditions: string[];
  invalidatingConditions: string[];

  confidenceBand: 'narrow' | 'medium' | 'broad';
  rationale: string;

  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}
```

## §4 最小不变量

1. `mechanismProgramRef` 必须非空
2. `requiredPreconditions` 与 `invalidatingConditions` 不得同时全空
3. `confidenceBand` 必须是显式离散值
4. `rationale` 必须非空

## §5 与现有对象的边界

### 5.1 与 `MechanismProgram`

`MechanismProgram` 描述机制本身。  
`ValidityEnvelope` 描述该程序的可信适用范围。

### 5.2 与 `PredictionError`

`PredictionError` 不是 envelope。  
它只是提示 envelope 可能需要被收窄或扩展。

### 5.3 与 `ProgramRevisionProposal`

`ProgramRevisionProposal` 可提名：

- `validity_narrowing`
- `validity_broadening`

但不直接修改 envelope 本体。

## §6 第一轮实现建议

第一轮只做合同，不要求实现。

推荐顺序：

1. 先完成 `ProgramRevisionProposal`
2. 再把 `ValidityEnvelope` 引入 `MechanismProgram`
3. 最后才让 `PredictionError` 真正反馈到 envelope

## §7 转 current 的条件

- [ ] `ValidityEnvelope` 成为显式对象并可持久化
- [ ] 至少一个 `MechanismProgram` 绑定 `ValidityEnvelope`
- [ ] 至少一条 `ProgramRevisionProposal` 能提名 `validity_narrowing` 或 `validity_broadening`
- [ ] contract-audit 能检查基础绑定关系

## §8 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把 MechanismProgram 的适用边界从散落字段提升为显式对象 |
