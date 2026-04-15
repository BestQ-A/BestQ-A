---
kind: contract
status: current
phase: 3
schema_version: 1
describes: "OutcomeRecord 对象规范"
upstream:
  - action-execution-contract.md
  - v7-world-model-contract.md
downstream:
  - none
---

# OutcomeRecord 合同：从执行结果到 Episode 反馈的结构化落点

## §1 定位

`ActionExecution` 已经回答：

- 做了什么动作
- 这个动作触发了哪个新 Episode

但系统若要继续提高上限，还必须回答：

> **执行之后，世界反馈是什么？**

`OutcomeRecord` 的职责，就是把这一步变成显式对象。

一句话：

```text
ActionExecution = 动作被执行
OutcomeRecord   = 执行后的反馈被结构化记录
```

它不是：

- `ActionExecution`
- `Conclusion`
- `ObservationRecord`

它是 Episode 结果层的一等对象。

---

## §2 关系链

目标关系链：

```text
ExperimentDesign
  → ActionExecution
  → new Episode
  → OutcomeRecord
```

如果继续往下扩，则应形成：

```text
ActionExecution
  → OutcomeRecord
  → PredictionError
  → Counterfactual / MechanismProgram 校正
```

---

## §3 TypeScript 接口草案

```typescript
interface OutcomeRecord {
  id: string;

  episodeId: string;                 // 结果属于哪个新 Episode
  causedByActionExecutionId?: string; // 第一轮允许可选，后续要求显式绑定

  status: 'success' | 'failure' | 'partial' | 'abandoned';
  summary: string;

  observedSignals: string[];         // 执行后实际看到的关键反馈键
  sideEffects: string[];             // 额外副作用
  evidenceRefs: string[];            // ObservationRecord / SupportLink / log refs

  recordedAt: string;
  recordedBy: string;
}
```

---

## §4 最小不变量

1. `episodeId` 必须非空  
   没有 Episode 归属的结果不进入主闭环。

2. `summary` 必须非空  
   第一轮允许简短，但不能缺失。

3. `status` 必须是显式离散值  
   不允许自由文本状态。

4. `observedSignals` / `sideEffects` / `evidenceRefs` 可为空数组，但不可为 `null`

5. 后续转 `current` 前，`causedByActionExecutionId` 应成为必填  
   第一轮允许先用 Episode 结果壳承接。

---

## §5 与现有对象的边界

### 5.1 与 `ActionExecution`

`ActionExecution` 记录：

- 动作是否执行

`OutcomeRecord` 记录：

- 动作之后发生了什么

所以：

```text
ActionExecution = did do
OutcomeRecord   = what happened
```

### 5.2 与 `ObservationRecord`

`ObservationRecord` 是局部观测。

`OutcomeRecord` 是对执行结果的聚合判断。

因此：

- `ObservationRecord` 可被 `OutcomeRecord.evidenceRefs` 引用
- 但两者不应混成一个对象

### 5.3 与 `Conclusion`

`Conclusion` 面向回答层。

`OutcomeRecord` 面向 Episode 反馈层。

---

## §6 与当前代码的映射

| 目标对象 | 当前最接近对象 | 现状判断 | 升级方向 |
|---|---|---|---|
| `OutcomeRecord` | `Story.outcome` / `outcomeNotes` | 仅字段壳 | 升级为显式对象 |
| `causedByActionExecutionId` | 无 | 未实现 | 新增 |
| `evidenceRefs` | 无 | 未实现 | 未来接 ObservationRecord / SupportLink |

---

## §7 第一轮实现建议

本合同当前已进入 `current`，第一轮仍只要求最小反馈对象。

建议最小实现：

1. 新增 `outcome-record.ts`
2. 新增 `outcome-record-store.ts`
3. 在 `executeExperimentDesign()` 生成新 Episode 时，同时生成一个最小 `OutcomeRecord`

不要求：

- 完整证据聚合
- 真正的 PredictionError
- 多信号冲突处理

---

## §8 转 current 的条件

- [x] `OutcomeRecord` 成为显式对象并可持久化（2026-04-14）
- [x] 至少一条 `ActionExecution → OutcomeRecord` 样例跑通（2026-04-14）
- [x] `status` 与 `summary` 不再只藏在 `Story.outcome / outcomeNotes`（2026-04-14）
- [x] contract-audit 能检查基础绑定真值（episode / actionExecution）（2026-04-14）

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把执行后的 Episode 反馈收束为一等对象 |
| 2 | 2026-04-14 | 运行时闭环与治理接入完成，合同状态从 `draft` 升为 `current` |
