---
kind: contract
status: draft
phase: 4
schema_version: 1
describes: "ProgramRevisionProposal 审查决策对象规范"
upstream:
  - program-revision-proposal-contract.md
  - ontology-delta-contract.md
downstream:
  - ontology-delta-contract.md
  - v7-world-model-contract.md
---

# ReviewDecision 合同：ProgramRevisionProposal 的审查裁决层

## §1 定位

当前系统已经具备：

```text
PredictionError
  → ProgramRevisionProposal
```

但这还不等于真正的本体变化。

在 `ProgramRevisionProposal` 和 `OntologyDelta` 之间，还需要一层显式审查对象：

> **这条修正建议被接受、被拒绝，还是被另一条更好的建议取代？**

`ReviewDecision` 的职责，就是把这个中间裁决层对象化。

一句话：

```text
ProgramRevisionProposal = 偏差驱动的修正建议
ReviewDecision          = 这条建议在制度层被如何裁决
OntologyDelta           = 被裁决后的正式本体变更结果
```

## §2 关系链

目标关系链：

```text
ProgramRevisionProposal
  → ReviewDecision
  → OntologyDelta(kind=AppliedRevision | none)
```

## §3 TypeScript 接口草案

```typescript
type ReviewDecisionKind = 'accepted' | 'rejected' | 'superseded';

interface ReviewDecision {
  id: string;
  proposalRef: string;
  decision: ReviewDecisionKind;
  supersededByRef: string | null;
  rationale: string;
  generatedDeltaRef: string | null;
  reviewedAt: string;
  reviewedBy: string;
}
```

## §4 最小不变量

1. `proposalRef` 必须非空
2. `decision` 必须是 `accepted | rejected | superseded`
3. `decision = superseded` 时，`supersededByRef` 必须非空
4. `rationale` 必须非空
5. `decision = accepted | rejected` 时，`generatedDeltaRef` 必须非空
6. `decision = superseded` 时，`generatedDeltaRef` 必须为 null

## §5 与现有对象的边界

### 5.1 与 `ProgramRevisionProposal`

`ProgramRevisionProposal` 只表达“建议修什么”。  
`ReviewDecision` 才表达“制度层如何裁决这条建议”。

### 5.2 与 `OntologyDelta`

`ReviewDecision` 不是 `OntologyDelta`。  
它只负责驱动：

- `accepted` → `OntologyDelta(kind=AppliedRevision)`
- `rejected` → `OntologyDelta(kind=none, no_update_reason=human_override)`
- `superseded` → 暂不生成 delta

### 5.3 与 `MechanismClass promotion gate`

`ReviewDecision` 不等于本体晋升门控。  
它只审查 proposal，不自动让 `MechanismClass` 晋升为 `compiled`。

## §6 第一轮实现建议

第一轮最小实现：

1. `review-decision.ts`
2. `review-decision-store.ts`
3. 三个 helper：
   - `acceptProposal()`
   - `rejectProposal()`
   - `supersedeProposal()`
4. 最小测试覆盖三态转移与 `OntologyDelta` 绑定

## §7 转 current 的条件

- [x] `ReviewDecision` 成为显式对象并可持久化（review-decision.ts + review-decision-store.ts，2026-04-14）
- [x] 至少一条 `accepted` 路径生成 `OntologyDelta(kind=AppliedRevision)`（T4 验证，2026-04-14）
- [x] 至少一条 `rejected` 路径生成 `OntologyDelta(kind=none)`（T5 验证，2026-04-14）
- [x] 至少一条 `superseded` 路径不生成 delta 但能稳定记录取代关系（T6 验证，2026-04-14）
- [x] contract-audit 能检查基础绑定真值（§22 RD-1~RD-4，2026-04-14）

## §8 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把 ProgramRevisionProposal 与 OntologyDelta 之间的制度裁决层显式对象化 |
| 2 | 2026-04-14 | 升级为 current：ReviewDecision/Store、三态 helper、pipeline 集成、contract-audit §22 RD-1~RD-4、artifact export 均已落地 |
