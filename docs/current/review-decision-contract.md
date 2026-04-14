# ReviewDecision Contract

$kind: review-decision-contract
$version: 1
$status: current
$conforms_to: artifact-contract.md

## 对象职责

ReviewDecision 是 ProgramRevisionProposal review lane 的裁决对象，捕获一次人工（或规则触发）审查后做出的决定，并以最小映射驱动 OntologyDelta。

## 三态转移

```
PRP.status=proposed → accepted   → OntologyDelta(kind=AppliedRevision)
PRP.status=proposed → rejected   → OntologyDelta(kind=none, reason_kind=human_override)
PRP.status=proposed → superseded → 无 OntologyDelta（由接管的新 PRP 负责）
```

## 字段规范

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | RD_ 前缀随机 id |
| proposalRef | string | 是 | 被审查的 ProgramRevisionProposal.id |
| decision | ReviewDecisionKind | 是 | accepted \| rejected \| superseded |
| supersededByRef | string \| null | 条件必填 | decision=superseded 时非空 |
| rationale | string | 是 | 裁决理由（非空） |
| generatedDeltaRef | string \| null | — | 生成的 OntologyDelta.id；superseded 时为 null |
| reviewedAt | string | 是 | ISO 8601 时间戳 |
| reviewedBy | string | 是 | 审查者 id |

## 不变量

| 编号 | 描述 |
|------|------|
| RD-1 | proposalRef 非空 |
| RD-2 | decision 为合法枚举值（accepted \| rejected \| superseded） |
| RD-3 | decision=superseded 时 supersededByRef 非空 |
| RD-4 | rationale 非空 |

## OntologyDelta 映射

| decision | 产生 OntologyDelta | kind | no_update_reason.reason_kind |
|----------|--------------------|------|------------------------------|
| accepted | 是 | AppliedRevision | — |
| rejected | 是 | none | human_override |
| superseded | 否 | — | — |

OntologyDelta 使用 `review:<proposalId>` 虚拟 episode_id，与真实 Episode pipeline 解耦，不触发 fidelity_regression_check。

## 不做（P06 边界）

- 不自动修改 MechanismProgram 或 ObservationModel
- 不自动将 OntologyDelta.applied_at 标记为非 null
- 不跨 proposal 聚合或 merge
