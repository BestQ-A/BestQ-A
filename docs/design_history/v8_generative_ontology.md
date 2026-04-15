# 递归式问答 (Recursive Q&A) 系统设计 v8: 生成式本体与反事实实验引擎

## 1. 重新定位：v7 是世界动力学骨架，v8 是范式跃迁

v7 已经完整建立了世界动力学骨架：

- 世界本体层定义了允许存在什么
- Episode 采样层把经历变成带轨迹的采样
- 关系法律层（v6）作为不可绕过的硬内核
- 推理与证明层让结论可回溯
- 本体演化层让系统会修世界模型边界

但 v7 的主旋律仍然是 **"发生了什么、为什么会这样"**。

v8 必须回答更高阶的问题：

```text
如果我改掉一个条件，会发生什么？
我下一步最该测什么？
我该怎样设计动作去逼近目标？
```

因此 v8 不是 v7 的加厚版，而是一次 **从重建过去到生成未来的范式跃迁**。

---

## 2. v7 已经解决了什么

### 2.1 经历不是聊天记录，而是世界采样

v7 把 `Episode` 提升为一等公民，强制要求：

- 状态快照 `StateSnapshot`
- 动作执行 `ActionExecution`
- 状态转移 `Transition`
- 结果记录 `OutcomeRecord`

这解决了"只有答案、没有过程"的问题。

### 2.2 本体演化有法律

v7 确立了 `OntologyDelta` 的必备输出，让每次闭环经历都必须产生：

- `PromoteMechanism` 的多 Episode 门槛
- `SplitClass / MergeClass` 的边界条件
- `DeprecateRelation` 的退役标准

这解决了"知识只会积累、不会修剪"的问题。

### 2.3 推理轨迹必须可回放

v7 要求每个 `AcceptedReconstruction` 都必须绑定：

- `selectedMechanismIds`
- `majorChain`
- `rejectedAlternatives`
- `traceId`

这解决了"黑盒解释"的问题。

---

## 3. v7 还缺的三块硬骨头

### 3.1 缺潜在状态与观测模型的显式分离

v7 的 `ObservationRecord` 仍然太接近"事实本身"。

但真实世界里：

```text
日志报错 ≠ 根因
residual 变大 ≠ 几何失配本身
症状出现 ≠ 机制已触发
```

没有显式的 **latent state** 和 **observation model**，系统永远只能在现象之间兜圈子，无法区分"世界真实状态"和"经过传感器投影后的观测像"。

### 3.2 缺机制的程序化表达

v7 的 `MechanismClass` 已经比 v6 的静态关系模板更进一步，但仍偏向"描述性骨架"。

真实机制往往包含：

```text
在上下文 C 下
当 x > threshold
A 和 B 共同触发状态转移程序 P
P 按阶段改变潜在状态
最终发射出可观测特征 O
```

这不是静态 `causes` 边能完整表达的。v8 需要让机制升级为 **可执行的状态转移程序**。

### 3.3 缺反事实与实验设计能力

v7 能回答"为什么会这样"，但不能系统性地回答：

```text
如果不执行这个动作，轨迹会不会分叉？
如果某个观测是假阳性，解释链会不会改变？
哪个实验最能区分两个候选机制？
```

没有反事实能力，系统只能解释，不能设计行动。
没有实验设计能力，系统只能被动采样，不能主动学习。

---

## 4. v8 的核心主张

v8 的核心主张可以压成一句话：

**v7 负责解释过去和升级本体，v8 负责生成未来并设计下一次学习。**

再展开一点：

```text
v7: 采样世界 → 重建过程 → 更新本体
v8: 推断潜在状态 → 模拟机制程序 → 生成反事实 → 设计最优实验/动作 → 执行 → 比较预测误差 → 校准本体
```

因此 v8 不是"更大的 v7"，而是：

**在 v7 的世界动力学内核之外，新增潜在状态层、生成模拟层、反事实层和主动学习层。**

---

## 5. v8 的六层架构

### 5.1 世界本体层（World Ontology Layer）

承接 v7，但对象进一步细化：

```text
EntityClass
StateVarClass
LatentStateClass          ← 新增
MechanismClass → MechanismProgram   ← 升级
ActionClass → InterventionModel     ← 升级
ConstraintClass
ObservationModel          ← 新增
```

这一层定义：

- 世界里有哪些对象（可见的 + 潜在的）
- 潜在状态如何经过观测模型投影为现象
- 机制不再是描述，而是状态转移程序
- 动作不再是注释，而是可施加的干预模型

### 5.2 Episode 采样层（Episode Sampling Layer）

继承 v7 的全部对象，但增加新约束：

```text
ObservationRecord 必须标注 viaObservationModelId
StateSnapshot 区分 observedValues vs inferredLatentValues
ActionExecution 必须标注 intendedInterventionModelId
```

这一层负责回答：

- 当时的局部世界长什么样
- 哪些状态是直接观测的，哪些是推断的
- 执行的动作对应哪个干预模型

### 5.3 关系法律层（Relation Law Layer）

原封不动承接 v6/v7 作为中核：

- `RefTypeSpec`
- `ComposeRule`
- `RefForce`
- `PatternTemplate`
- `SlotFingerprint`
- `InvariantCheck`
- `CompositionResult`
- `DerivationStep`

任何 agent 仍然不得绕过本层直接写入 compiled world-model。

### 5.4 信念与推断层（Belief & Inference Layer）

因为真实世界不完全可见，系统不能只维护硬结论。

```text
BeliefState
PosteriorDistribution
UncertaintyRecord
LatentStateInference
```

这一层负责：

- 当前对潜在状态的信念分布
- 对候选机制的权重
- 当前最不确定的关键变量

### 5.5 反事实与实验层（Counterfactual & Experiment Layer）

这是 v8 的灵魂所在。

```text
CounterfactualScenario
PredictedTrajectory
PredictionError
ExperimentDesign
InformationGainEstimate
```

这一层负责：

- 生成"如果 X 不同，会怎样"的模拟
- 在行动前写下"我预计会看到什么"
- 设计信息增益最大的下一次实验

### 5.6 本体演化层（Ontology Evolution Layer）

继承 v7，但升级依据：

```text
PromoteMechanism
SplitClass
MergeClass
DeprecateRelation
RegisterPattern
CounterexampleSet
ValidityEnvelopeUpdate   ← 新增
```

这一层让系统不只是"会修边界"，而是基于 **预测校准** 和 **反事实验证** 来修边界。

---

## 6. v8 的核心对象

### 6.1 新增世界本体对象

```typescript
interface LatentStateClass {
  id: string;
  name: string;
  description: string;
  variables: string[];              // StateVarClass IDs
}

interface ObservationModel {
  id: string;
  name: string;
  latentInputs: string[];           // LatentStateClass IDs
  observationOutputs: string[];     // 可观测特征
  noiseModel?: string;              // 噪声模型描述
  biasModel?: string;               // 偏差模型描述
}

interface MechanismProgram {
  id: string;
  name: string;
  description: string;
  stateInputs: string[];            // LatentStateClass / StateVar IDs
  contextInputs: string[];          // ConstraintClass IDs
  preconditions: string[];          // 触发前提断言
  transition: MechanismPhase[];     // 状态转移程序（分阶段）
  emittedObservations: string[];    // 预计发射的观测特征
  outcomes: string[];               // 可能的终局
  validityEnvelope: ValidityEnvelope;
}

interface MechanismPhase {
  name: string;
  expectedStateChanges: string[];
  expectedObservations: string[];
  thresholdTriggers?: string[];
}

interface InterventionModel {
  id: string;
  name: string;
  controllableVars: string[];       // 可改变的 StateVar / LatentState IDs
  expectedStateEffects: string[];   // 预期状态变化
  sideEffects: string[];            // 副作用
  delayProfile?: string;            // 作用延迟描述
  failureConditions: string[];      // 失效条件
}

interface ValidityEnvelope {
  contexts: string[];               // 适用上下文
  variableRanges: Record<string, { min?: number; max?: number }>;
  domainAssumptions: string[];      // 域假设
  sensitivityNotes: string[];       // 对噪声/扰动的敏感度
}
```

### 6.2 信念与推断对象

```typescript
interface BeliefState {
  id: string;
  episodeId: string;
  latentStateDistribution: Record<string, unknown>;
  mechanismWeights: Record<string, number>;  // mechanismId -> weight
  topUncertainties: string[];       // 最不确定的变量 ID
  timestamp: string;
}
```

### 6.3 反事实与实验对象

```typescript
interface CounterfactualScenario {
  id: string;
  baseEpisodeId: string;
  modifiedAssumptions: string[];    // 改动了哪些前提
  predictedTrajectory: PredictedState[];
  predictedObservations: string[];
  predictedOutcome: string;
}

interface PredictedState {
  t: number | string;
  latentValues: Record<string, unknown>;
  observationProbabilities: Record<string, number>;
}

interface ExperimentDesign {
  id: string;
  targetUncertainty: string[];      // 想减少不确定的变量
  candidateMeasurements: string[];  // 候选观测/动作
  candidateInterventions: string[]; // 候选干预
  expectedInformationGain: number;
  discriminatingPower: Record<string, number>; // 对候选机制的区分力
}
```

### 6.4 升级后的本体演化对象

```typescript
interface OntologyUpdate {
  id: string;
  sourceEpisodeIds: string[];
  kind:
    | 'PromoteMechanism'
    | 'SplitClass'
    | 'MergeClass'
    | 'DeprecateRelation'
    | 'RegisterPattern'
    | 'UpdateValidityEnvelope'
    | 'UpdateObservationModel';
  rationale: string;
  predictionCalibrationNotes?: string;  // 预测校准记录
  counterexampleSetIds: string[];
  status: 'proposed' | 'validated' | 'applied' | 'rejected';
}
```

---

## 7. v8 的运行闭环

### 7.1 问题求解环（升级）

```text
输入问题
  → 收集 Observation
  → 推断 LatentState（经由 ObservationModel）
  → 绑定相关 Episode / BeliefState
  → 检索候选 MechanismProgram
  → 生成 CounterfactualScenario（评估不同动作后果）
  → 在 v6 关系法律下过滤
  → 选择最优动作 / 输出 Conclusion + PredictedTrajectory
  → 执行
  → 比较真实结果与 PredictionError
  → 形成 AcceptedReconstruction
```

### 7.2 主动学习环（新增）

```text
当前 BeliefState 显示高不确定性
  → 设计 ExperimentDesign
  → 选择信息增益最大的实验/动作
  → 执行并采样新 Episode
  → 比较预测与真实
  → 更新 BeliefState
  → 若机制预测持续校准，则推进 OntologyUpdate
```

### 7.3 本体学习环（升级）

```text
已完成 Episode + PredictionError 记录
  → 评估 MechanismProgram 的预测校准度
  → 评估 ObservationModel 的解释力
  → 调整 ValidityEnvelope
  → 收集 CounterexampleSet
  → 形成 OntologyUpdate
  → 通过后写入世界模型
```

### 7.4 最关键的新增要求

每个"已解决问题"不能只沉淀为 `Episode + AcceptedReconstruction + OntologyDelta`，
还必须沉淀为：

- `BeliefState`（当时的信念分布）
- `CounterfactualScenario[]`（评估过的反事实）
- `PredictionError`（预测与真实的偏差记录）

---

## 8. v8 的新法律：可迁移性法律与有效性包络

v8 必须把"一个机制在什么时候成立"写成法律，而不是经验注释。

### 8.1 Validity Envelope 法律

一条被编译的机制必须附带显式的 `ValidityEnvelope`：

- 在哪些 `ContextScope` 里成立
- 哪些变量区间外会失效
- 哪些 `domain shift` 会打破它
- 对观测噪声敏感到什么程度

**铁律**：

```text
没有 ValidityEnvelope 的 MechanismProgram，不得晋升为 compiled。
```

### 8.2 预测先于执行法律

任何 `ActionExecution` 在真实执行前，必须先产生：

- `PredictedTrajectory`
- `predictedObservations`
- `predictedOutcome`

**铁律**：

```text
没有预测，就没有可证伪性；没有可证伪性，就不能进入本体学习环。
```

### 8.3 Prediction Error 必须落盘法律

行动后的真实结果必须与预测比较，产生结构化的 `PredictionError`：

- 观测误差（observation model 错了吗？）
- 状态转移误差（mechanism program 错了吗？）
- 上下文边界误差（validity envelope 需要修吗？）

### 8.4 观测不是事实法律

任何 `ObservationRecord` 必须标注它经由的 `ObservationModel`。

系统必须能回答：

```text
这个现象是 latent state 的直接投影，还是包含 noise/bias/artifact？
```

---

## 9. 多 agent 的正确用法

v8 的 agent 分工在 v7 基础上扩展：

### 9.1 潜在状态推断 agent

负责：

- 从观测推断 latent state
- 评估 observation model 的拟合度
- 提名新的 `LatentStateClass`

### 9.2 机制程序生成 agent

负责：

- 把 `MechanismClass` 的骨架填充为可模拟的 `MechanismProgram`
- 验证 `transition` 的可执行性
- 标注 `validityEnvelope`

### 9.3 反事实模拟 agent

负责：

- 生成 `CounterfactualScenario`
- 运行机制程序的前向模拟
- 对比不同假设下的预测轨迹

### 9.4 实验设计 agent

负责：

- 计算 `InformationGain`
- 评估候选实验对机制区分的区分力
- 推荐最优下一次采样

### 9.5 反例搜索 agent

负责：

- 找 counterexample
- 找 validity envelope 的破坏点
- 找 observation model 的失效场景

### 9.6 Replay agent

负责：

- 把 `MechanismProgram` 带入真实 `Episode` 回放
- 比较预测与实际观测的一致性
- 输出 `PredictionError`

### 9.7 本体审理 agent

负责：

- 审理 `OntologyUpdate`
- 验证 `ValidityEnvelope` 的覆盖度
- 监督 `ObservationModel` 的更新

### 9.8 v8 的铁律

```text
agent 数量可以无限放大 candidate、simulation、experiment design
但任何 agent 都不能绕过
  typed relation algebra、invariant check、proof trace、
  replay fidelity、counterexample test、prediction calibration
直接写入 compiled world-model
```

更狠一点：

**宁可 80 亿 agent 在法律之内暴力搜索与模拟，也不要 1 个 agent 在法律之外聪明跳步。**

---

## 10. v8 的系统口号

v6 的口号：

- 不要把模式当标签
- 不要把关系当边注释

v7 的口号：

- 不要把经历当聊天记录，要把经历当世界采样
- 不要把答案当核心资产，要把重建轨迹当核心资产
- 不要只积累 pattern，要持续修世界模型边界

v8 的口号则是：

- **不要把观测当事实本身，要把观测当潜在状态的有噪投影**
- **不要只解释过去，要能在执行前生成可检验的预测**
- **不要被动等待经历，要主动设计最小代价的下一次学习**
- **不要把局部真理误当普遍真理，要为每条 compiled 机制画上 ValidityEnvelope**

---

## 11. 设计演化轨迹

```text
v1: 递归分解（树）
v2: 抽象归类（集合）
v3: 语义接龙（链）
v4: 组合引擎（Atom + Composite 分离）
v5: 卡片盒 + 髓鞘化（图 + 双模式）
v6: 关系范畴引擎（关系法律内核）
v7: 世界模型动力学引擎（本体 + Episode + Replay + Evolution）
v8: 生成式本体与反事实实验引擎（潜在状态 + 机制程序 + 反事实 + 主动学习）
```

从 v1 到 v8：

```text
树 → 集合 → 链 → 分层 → 图 → 关系法律 → 世界动力学 → 生成模拟与实验设计
```

---

## 12. v8 的最终判断

v8 不否定 v7。

v8 对 v7 的最终判断是：

```text
v6 = 关系法律内核
v7 = 关系法律内核 + 世界动力学骨架
v8 = 关系法律内核 + 世界动力学骨架
      + 潜在状态层
      + 机制程序层
      + 反事实模拟层
      + 主动实验设计层
```

因此，系统的最终目标不再只是：

**会取样、会建模、会重建、会升级本体。**

而是：

**会推断潜在状态、会生成预测、会运行反事实、会设计实验、会通过预测误差持续校准本体。**

再压成最狠的一句：

**到了 v8，系统不只是知道世界"是什么"和"发生过什么"，而是开始知道"怎样通过最小代价的试验，更快逼近世界本身"。**
