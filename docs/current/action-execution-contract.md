---
kind: contract
status: current
phase: 3
schema_version: 1
describes: "ActionExecution 对象规范"
upstream:
  - experiment-design-contract.md
  - v7-world-model-contract.md
downstream:
  - none
---

# ActionExecution 合同：从实验设计到新 Episode 的执行桥

## §1 定位

`ExperimentDesign` 已经回答：

- 下一次最值得做什么？

但系统若想形成真正闭环，还必须回答：

> **这个推荐动作真的被执行了吗，执行后发生了什么？**

`ActionExecution` 的职责，就是把这个问题对象化。

一句话：

```text
ExperimentDesign = 选择下一步
ActionExecution  = 记录这一步真的被执行
new Episode      = 记录执行后的世界反馈
```

它不是：

- `ExperimentDesign`
- `Skill` 本身
- `OutcomeRecord`

它是三者之间的执行桥。

---

## §2 关系链

目标关系链：

```text
ExperimentDesign
  → ActionExecution
  → Episode
  → ObservationRecord / OutcomeRecord
```

### 2.1 它回答什么

1. 哪个推荐动作被执行了？
2. 什么时候执行的？
3. 带了哪些参数？
4. 执行结果是成功、失败，还是部分完成？
5. 它触发了哪一个新 Episode？

---

## §3 TypeScript 接口草案

```typescript
interface ActionExecution {
  id: string;

  basedOnExperimentDesignId: string;   // 来源设计
  sourceEpisodeId: string;             // 设计所基于的 episode
  targetEpisodeId?: string;            // 执行后生成的新 episode（第一轮允许后写）

  actionRef: string;                   // candidateMeasurements / candidateInterventions 中被选中的动作
  actionKind: 'measurement' | 'intervention';
  actionClassId?: string;              // 未来与 ActionClass 接线

  parameters: Record<string, unknown>;
  executionStatus: 'planned' | 'running' | 'completed' | 'failed' | 'abandoned';

  observedOutcomeSummary?: string;     // 执行后的简短结果
  predictionError?: number | null;     // 第一轮允许 null，后续接 Counterfactual / ExperimentDesign 校验

  startedAt: string;
  completedAt?: string | null;
  createdBy: string;
}
```

---

## §4 最小不变量

1. `basedOnExperimentDesignId` 必须非空  
   没有设计来源的执行记录不进入主闭环。

2. `actionRef` 必须等于来源 `ExperimentDesign.recommendedAction`  
   第一轮只允许执行推荐动作本身，不允许静默改动作。

3. `executionStatus = completed` 时，`completedAt` 必填  
   防止完成态无结束时间。

4. `executionStatus = completed` 时，应至少满足其一：
   - `targetEpisodeId` 已写入
   - `observedOutcomeSummary` 非空

5. `predictionError` 第一轮允许为 `null`，但不可缺字段  
   因为后续主动学习层一定会消费它。

---

## §5 与现有对象的边界

### 5.1 与 `ExperimentDesign`

`ExperimentDesign` 负责：

- 选动作

`ActionExecution` 负责：

- 记动作真的被执行

所以：

```text
ExperimentDesign = should do
ActionExecution  = did do
```

### 5.2 与 `Episode`

`ActionExecution` 本身不是 Episode，  
它应当指向：

- `sourceEpisodeId`
- `targetEpisodeId`

因此它是：

```text
old Episode → ActionExecution → new Episode
```

之间的桥对象。

### 5.3 与 `OutcomeRecord`

`OutcomeRecord` 记录：

- 这次 Episode 最后发生了什么

`ActionExecution` 记录：

- 这个动作是如何触发新 Episode 的

---

## §6 与当前代码的映射

| 目标对象 | 当前最接近对象 | 现状判断 | 升级方向 |
|---|---|---|---|
| `ActionExecution` | `types.ts` 中的轻量接口 | 仅有类型壳 | 升级为显式对象 + store |
| `basedOnExperimentDesignId` | 无 | 未实现 | 新增 |
| `targetEpisodeId` | 无 | 未实现 | 新增 |
| `predictionError` | `testing-strategy-contract` 中有目标，但无实现 | 未实现 | 先占位 |

---

## §7 第一轮实现建议

本合同当前已进入 `current`，但第一轮仍不要求真实工具执行器。

建议最小实现：

1. 新增 `action-execution.ts`
2. 新增 `action-execution-store.ts`
3. 允许“模拟执行”：
   - 从 `ExperimentDesign.recommendedAction` 生成 `ActionExecution`
   - 再生成一个最小 `Episode` 壳
4. 至少支持：
   - `basedOnExperimentDesignId`
   - `sourceEpisodeId`
   - `targetEpisodeId`
   - `executionStatus`

不要求：

- 真正调用外部工具
- 真正的 prediction error 计算
- ActionClass 全量接线

---

## §8 转 current 的条件

- [x] `ActionExecution` 成为显式对象并可持久化（2026-04-14）
- [x] 至少一个 `ExperimentDesign → ActionExecution → new Episode` 样例跑通（2026-04-14）
- [x] `actionRef` 真正等于来源 `ExperimentDesign.recommendedAction`（2026-04-14）
- [x] contract-audit 能检查基础绑定真值（design/sourceEpisode/targetEpisode）（2026-04-14）

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把 `ExperimentDesign → new Episode` 之间的执行桥对象显式化 |
| 2 | 2026-04-14 | 运行时闭环与治理接入完成，合同状态从 `draft` 升为 `current` |
