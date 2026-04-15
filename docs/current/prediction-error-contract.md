---
kind: contract
status: current
phase: 3
schema_version: 1
describes: "PredictionError 对象规范"
upstream:
  - outcome-record-contract.md
  - counterfactual-scenario-contract.md
  - mechanism-program-contract.md
downstream:
  - none
---

# PredictionError 合同：从真实反馈到模型校正的偏差对象

## §1 定位

`OutcomeRecord` 已经回答：

- 执行之后，真实世界反馈是什么

但系统若想进入下一层学习闭环，还必须回答：

> **真实反馈与先前预测之间，偏差是什么？**

`PredictionError` 的职责，就是把这个偏差显式对象化。

一句话：

```text
Counterfactual / MechanismProgram = 事先怎么预测
OutcomeRecord                     = 事后真实发生什么
PredictionError                   = 两者之间差了什么
```

---

## §2 关系链

目标关系链：

```text
CounterfactualScenario
  → ExperimentDesign
  → ActionExecution
  → OutcomeRecord
  → PredictionError
```

如果继续往下扩，则应形成：

```text
PredictionError
  → MechanismProgram / ObservationModel / ValidityEnvelope 校正
```

---

## §3 TypeScript 接口草案

```typescript
interface PredictionError {
  id: string;

  basedOnCounterfactualId?: string;      // 第一轮允许可选
  causedByActionExecutionId: string;
  outcomeRecordId: string;

  errorKind: 'observation' | 'transition' | 'outcome' | 'context' | 'unknown';
  expectedSummary: string;
  actualSummary: string;
  deltaSummary: string;

  severity: 'low' | 'medium' | 'high';
  score?: number | null;                 // 第一轮允许 null，占位

  recordedAt: string;
  recordedBy: string;
}
```

---

## §4 最小不变量

1. `causedByActionExecutionId` 必须非空
2. `outcomeRecordId` 必须非空
3. `expectedSummary` / `actualSummary` / `deltaSummary` 必须非空
4. `errorKind` 必须是显式离散值
5. `score` 第一轮允许为 `null`，但不可缺字段

---

## §5 与现有对象的边界

### 5.1 与 `OutcomeRecord`

`OutcomeRecord` 记录：

- 真实发生了什么

`PredictionError` 记录：

- 真实结果与预测相比偏在哪里

### 5.2 与 `CounterfactualScenario`

`CounterfactualScenario` 记录：

- 事前预测的某条候选未来

`PredictionError` 记录：

- 真实结果与这条候选未来之间的偏差

### 5.3 与 `MechanismProgram`

第一轮不要求直接回写 `MechanismProgram`，但它是后续主要消费者。

---

## §6 与当前代码的映射

| 目标对象 | 当前最接近对象 | 现状判断 | 升级方向 |
|---|---|---|---|
| `PredictionError` | 无显式对象 | 未实现 | 新增显式对象 + store |
| `expectedSummary` | `CounterfactualScenario.predictedOutcome` | 已有来源 | 第一轮直接引用 |
| `actualSummary` | `OutcomeRecord.summary` | 已有来源 | 第一轮直接引用 |
| `deltaSummary` | 无 | 未实现 | 第一轮由简单摘要生成 |

---

## §7 第一轮实现建议

本合同当前已进入 `current`。第一轮仍只要求最小偏差对象，但 `expectedSummary` 现在应优先来自真实 `CounterfactualScenario.predictedOutcome`；仅在缺失时允许显式降级 fallback。

建议最小实现：

1. 新增 `prediction-error.ts`
2. 新增 `prediction-error-store.ts`
3. 在 `executeExperimentDesign()` 或相邻最小入口里，允许基于：
   - `basedOnCounterfactualIds[0]`
   - 新生成的 `OutcomeRecord`
   产生一条最小 `PredictionError`

不要求：

- 真正的量化 score 算法
- 多 Counterfactual 对比
- 自动回写 MechanismProgram

---

## §8 转 current 的条件

- [x] `PredictionError` 成为显式对象并可持久化（2026-04-14）
- [x] 至少一条 `OutcomeRecord → PredictionError` 样例跑通（2026-04-14）
- [x] `expectedSummary` 与 `actualSummary` 优先来自真实对象；缺失时显式降级 fallback（2026-04-14）
- [x] contract-audit 能检查基础绑定真值（actionExecution / outcomeRecord / counterfactual）（2026-04-14）

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把“预测与真实之间的偏差”收束为一等对象 |
| 2 | 2026-04-14 | 运行时闭环、治理接入、真实 expectedSummary 来源接线完成；合同状态从 `draft` 升为 `current` |
