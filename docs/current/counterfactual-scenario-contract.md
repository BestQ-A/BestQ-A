---
kind: contract
status: current
schema_version: 1
describes: CounterfactualScenario
upstream:
  - v8_generative_ontology.md
  - mechanism-program-contract.md
downstream:
  - experiment-design-contract.md
  - reconstruction-contract.md
---

<!-- audit-ignore: describes-too-long -->

# CounterfactualScenario 合同：从重建过去到生成未来的第一对象

## §1 定位

到 `v7` 为止，系统已经能回答：

- 发生了什么
- 为什么会这样
- 这次经历如何更新世界模型

但它还不能系统性回答：

> **如果改掉一个条件，会发生什么？**

`CounterfactualScenario` 的作用，就是把这个问题正式对象化。

它不是新的“答案类型”，而是：

- 在既有 `Episode` 基础上
- 修改一个或多个前提
- 用当前 `MechanismProgram` 生成一条假设轨迹
- 比较这条假设轨迹与原轨迹的分叉

一句话：

```text
AcceptedReconstruction = 对过去的最优重建
CounterfactualScenario = 对可能未来的受约束生成
```

---

## §2 与现有对象的关系

目标关系链：

```text
Episode
  → AcceptedReconstruction
  → CounterfactualScenario
  → ExperimentDesign
```

### 2.1 它不是什么

- 不是 `AcceptedReconstruction`
- 不是 `MechanismProgram`
- 不是 `ExperimentDesign`
- 不是新的 `Claim`

### 2.2 它回答什么问题

给定一个 Episode 和当前本体，系统应该能问：

1. 如果修改一个输入条件，轨迹会如何分叉？
2. 哪些观测会变化？
3. 结局是否会改变？
4. 当前哪些条件最值得被改动来区分两个候选机制？

---

## §3 TypeScript 接口草案

```typescript
interface CounterfactualScenario {
  id: string;
  baseEpisodeId: string;             // 基于哪个真实 Episode
  baseReconstructionId: string;      // 基于哪条 accepted reconstruction

  // ---- 改动了什么 ----
  modifiedAssumptions: CounterfactualAssumption[];

  // ---- 用什么推演 ----
  mechanismProgramRefs: string[];    // 至少一个 MechanismProgram
  derivationTraceId?: string;        // 可选：记录本次反事实推导链

  // ---- 产出 ----
  predictedTrajectory: PredictedStep[];
  predictedObservationSignals: string[];
  predictedOutcome: string;

  // ---- 与原轨迹的差异 ----
  divergencePoints: string[];        // 关键分叉点描述

  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

interface CounterfactualAssumption {
  targetRef: string;                 // 指向被改动的变量/前提/动作
  modification: 'set' | 'remove' | 'perturb';
  fromValue?: unknown;
  toValue?: unknown;
  rationale?: string;
}

interface PredictedStep {
  step: number;
  kind: 'initial_condition' | 'latent_phase' | 'observable' | 'intervention' | 'outcome';
  content: string;
  source: 'program_simulated' | 'episode_anchored';
}
```

---

## §4 最小不变量

1. `modifiedAssumptions` 非空  
   没有修改的反事实场景等于原场景重放，不构成反事实。

2. `mechanismProgramRefs` 非空  
   反事实不是自由想象，必须由程序对象驱动。

3. `predictedTrajectory` 非空  
   没有轨迹的反事实场景没有解释力。

4. `predictedOutcome` 不可为空  
   反事实场景最终必须落到某种结局判断。

5. `divergencePoints` 可为空数组，但不可为 null  
   即使当前未发现关键分叉，也必须显式记录“未发现”。

---

## §5 与现有合同的边界

### 5.1 与 `AcceptedReconstruction`

`AcceptedReconstruction` 回答：

- 在当前证据下，这次 Episode 最优的过去过程是什么

`CounterfactualScenario` 回答：

- 如果改动一个条件，用当前程序对象推演，可能会产生什么未来

所以：

- reconstruction 是**对已发生世界的解释**
- counterfactual 是**对未发生世界的受约束生成**

### 5.2 与 `MechanismProgram`

`CounterfactualScenario` 自身不拥有机制逻辑，它只引用：

- `mechanismProgramRefs`

因此：

```text
CounterfactualScenario 不定义程序
CounterfactualScenario 只运行程序
```

### 5.3 与 `ExperimentDesign`

`CounterfactualScenario` 先生成“如果改动，会怎样”的候选轨迹。  
`ExperimentDesign` 则在多个反事实场景之间，选择最能带来信息增益的下一个实验。

所以顺序应当是：

```text
CounterfactualScenario
  → ExperimentDesign
```

而不是反过来。

---

## §6 与当前代码的映射

| 目标对象 | 实现位置 | 现状判断 |
|---|---|---|
| `CounterfactualScenario` | `core/counterfactual-scenario.ts:36-59` | **已实现**，含不变量校验与 `inferCounterfactual` 推演入口 |
| `modifiedAssumptions` | `core/counterfactual-scenario.ts:44` | **已实现**，作为 Fact[] 字段 |
| `predictedTrajectory` | `core/counterfactual-scenario.ts:48` | **已实现**，`inferCounterfactual` 自动生成 |
| `mechanismProgramRefs` | `core/counterfactual-scenario.ts:46` | **已实现**，引用 MechanismProgram |
| `CounterfactualScenarioStore` | `core/counterfactual-scenario-store.ts` | **已实现**，SQLite WAL 持久化 |

Pipeline 集成：`core/pipeline.ts:1062-1138` 将 CounterfactualScenario 接入主流程。

---

## §7 实现状态（2026-04-16）

**已完成**：
- `core/counterfactual-scenario.ts`：类型定义 + `inferCounterfactual` 推演引擎
- `core/counterfactual-scenario-store.ts`：SQLite WAL 持久化（save/get/list/getByEpisode/getStats）
- `core/pipeline.ts`：pipeline 集成（ExecuteExperimentDesign → Scenario → Design → Execution 闭环）

**已知范围限制**（v13 §8 扩展方向）：
- 多场景搜索（当前单次推演）
- 信息增益排序（由 `ExperimentDesign.expectedInformationGain` 承担）
- 真正的 counterfactual 真值验证（当前为结构化占位）

---

## §8 转 current 的条件

- [ ] `CounterfactualScenario` 成为显式对象并可持久化
- [ ] 至少一个场景能真实引用 `MechanismProgram`
- [ ] `predictedTrajectory` 不再只是 reconstruction 的复制品，而是有真实 modified assumptions
- [ ] contract-audit 能检查基础绑定真值（baseEpisode / baseReconstruction / mechanismProgramRefs）

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把 v8 中“如果改一个条件，会发生什么”的思想收束为当前主线可吸收的对象合同 |
