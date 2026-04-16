---
kind: contract
status: current
schema_version: 1
describes: ExperimentDesign
upstream:
  - v8_generative_ontology.md
  - counterfactual-scenario-contract.md
downstream:
  - none
---

# ExperimentDesign 合同：从反事实场景到下一次最值实验

## §1 定位

`CounterfactualScenario` 已经能回答：

- 如果改一个条件，会发生什么？

但系统下一步真正要回答的是：

> **在这些可能未来里，哪一个实验最值得做？**

`ExperimentDesign` 的职责，就是把这个问题正式对象化。

一句话：

```text
CounterfactualScenario = 生成候选未来
ExperimentDesign      = 选择下一次最值的干预 / 观测
```

它不是新的推理对象，而是：

- 多个 counterfactual 场景之上的选择对象
- 把“应该做什么”从直觉变成结构化设计

---

## §2 与现有对象的关系

目标关系链：

```text
MechanismProgram
  → CounterfactualScenario
  → ExperimentDesign
  → ActionExecution / new Episode
```

### 2.1 它不是什么

- 不是 `CounterfactualScenario`
- 不是 `MechanismProgram`
- 不是 `ActionClass`
- 不是最终结论文本

### 2.2 它回答什么问题

给定多个 counterfactual 场景，系统应该能问：

1. 哪些观测最能区分候选机制？
2. 哪些干预最能改变结果？
3. 哪个动作在风险、信息增益和成本之间最值？

---

## §3 TypeScript 接口草案

```typescript
interface ExperimentDesign {
  id: string;
  baseEpisodeId: string;
  basedOnCounterfactualIds: string[];    // 至少一个 CounterfactualScenario

  targetUncertaintyRefs: string[];       // 想减少不确定的变量 / 机制 /结论
  candidateMeasurements: string[];       // 候选观测动作
  candidateInterventions: string[];      // 候选干预动作

  expectedInformationGain: number;       // 0..1
  discriminatingPower: Record<string, number>; // 对候选机制的区分力
  safetyConstraints: string[];           // 不得违反的条件

  recommendedAction: string;             // 当前推荐实验 / 干预

  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}
```

---

## §4 最小不变量

1. `basedOnCounterfactualIds` 非空  
   没有反事实输入的实验设计没有来源。

2. `candidateMeasurements` 与 `candidateInterventions` 至少一侧非空  
   否则没有实验动作可选。

3. `expectedInformationGain` 必须在 `[0,1]` 内  
   这样不同设计才能比较。

4. `recommendedAction` 必须属于：
   - `candidateMeasurements`
   或
   - `candidateInterventions`

5. `safetyConstraints` 可为空数组，但不可为 null  
   即使当前没有额外约束，也必须显式记录。

---

## §5 与现有对象的边界

### 5.1 与 `CounterfactualScenario`

`CounterfactualScenario` 负责：

- 生成“如果改一个条件会怎样”的候选未来

`ExperimentDesign` 负责：

- 在多个候选未来之上，选择最值得执行的观测或干预

所以：

- counterfactual 是**生成层**
- experiment design 是**选择层**

### 5.2 与 `ActionClass`

`ActionClass` 定义：

- 某类动作本体上是什么

`ExperimentDesign` 定义：

- 当前这一轮最值得选哪一个动作

所以：

```text
ActionClass = 可做什么
ExperimentDesign = 现在最值得做什么
```

### 5.3 与 `Episode`

`ExperimentDesign` 本身不是 Episode。  
它应当在后续被执行，并进入：

```text
ExperimentDesign
  → ActionExecution
  → new Episode
```

---

## §6 与当前代码的映射

| 目标对象 | 实现位置 | 现状判断 |
|---|---|---|
| `ExperimentDesign` | `core/experiment-design.ts:15-42` | **已实现**，含构造器与闭环计算 |
| `basedOnCounterfactualIds` | `core/experiment-design.ts` | **已实现**，直接引用 CounterfactualScenario |
| `candidateInterventions` | `core/experiment-design.ts` | **已实现**，ActionClass 自然延伸 |
| `expectedInformationGain` | `core/experiment-design.ts:143-194` | **已实现**，含 discriminatingPower 计算 |
| `ExperimentDesignStore` | `core/experiment-design-store.ts:66-106` | **已实现**，SQLite WAL 持久化 |

Pipeline 集成：`core/pipeline.ts:417-419` 将 ExperimentDesign 接入 `executeExperimentDesign` 闭环（Scenario→Design→Execution）。

---

## §7 实现状态（2026-04-16）

**已完成**：
- `core/experiment-design.ts`：类型定义 + `expectedInformationGain` + `discriminatingPower`
- `core/experiment-design-store.ts`：SQLite WAL 持久化（save/get/list/getByEpisode/getStats）
- `core/pipeline.ts`：`executeExperimentDesign` 主流程（CounterfactualScenario→ExperimentDesign→ActionExecution→新 Episode 闭环）

**已知范围限制**（v13 §8 扩展方向）：
- 多目标优化（当前单目标 discriminatingPower 排序）
- 风险最小化求解器（当前占位）
- 与 ActionClass 合同的完整接线（当前通过 candidateInterventions 字符串列表）

---

## §8 转 current 的条件

- [ ] `ExperimentDesign` 成为显式对象并可持久化
- [ ] 至少一个设计能引用多个 CounterfactualScenario
- [ ] `recommendedAction` 真正来自候选集合，而不是自由文本
- [ ] contract-audit 能检查基础绑定真值（baseEpisode / basedOnCounterfactualIds / recommendedAction in candidates）

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把 v8 中“下一步最该测什么”的思想收束为当前主线可吸收的对象合同 |
