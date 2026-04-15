# 递归式问答系统 v10：参与式自反世界引擎

---

## 0. 核心定义

因为观察者不在世界之外，所以系统不能假装自己拥有“无位置的上帝视角”。  
因为建模、测量、部署、干预都会反过来改变世界，所以认知活动本身也必须被建模。  
因为未来真正高上限的系统，不只是会解释世界，还要会在不自欺的前提下参与世界、改写世界、再校准自己，所以 v10 定义为：

> **一个把世界本体、观察者、仪器、Episode、机制、反事实实验、部署效应、制度编译与规范约束放进同一闭环的参与式自反引擎。**

一句话压缩：

> **v10 不是站在世界外面描述世界，而是承认智能体属于世界内部，并把“如何在参与中求真”做成系统的第一原则。**

---

## 1. v10 的历史位置

从设计演化上看：

```text
v1: 递归分解（树）
v2: 抽象归类（集合）
v3: 语义接龙（链）
v4: 组合引擎（Atom / Composite）
v5: 图 + 双模式（Atom / Ref / Shortcut）
v6: 关系法律（typed relation algebra with partial composition）
v7: 世界采样 × 过程重建 × 本体演化
v8: 生成式本体 × 反事实实验
v9: 本体联邦 × 自反翻译
v10: 参与式自反世界引擎
```

因为 v6 解决了“关系不能乱连、乱编译”的问题，所以系统第一次拥有了关系法律。  
因为 v7 把 Episode、Mechanism、Derivation、Ontology Update 串成闭环，所以系统第一次拥有了结构化世界采样。  
因为 v8 引入了生成式机制、反事实、实验设计，所以系统第一次拥有了“用未来来检验知识”的能力。  
因为 v9 开始承认局部本体、多视角与显式翻译，所以系统第一次摆脱“唯一全局语言”的执念。  
所以 v10 的任务，不再是“再增强一点推理”，而是：

> **把观察者、仪器、部署和制度都拉进本体内部，承认系统是世界的一部分。**

---

## 2. v10 的根公理

### G1. 没有无位置的观察

因为所有 Observation 都来自某个观察者，通过某种仪器，在某种上下文下发生，所以 Observation 永远不是“纯事实”，而是“带位置的事实切片”。

### G2. 没有无代价的认知

因为测量、标注、调参、部署、告警、策略切换都会改变后续世界状态，所以认知活动也是干预活动。

### G3. 没有静止的环境

因为模型一旦进入现实，就会改变现实中的行为分布、激励结构、异常形态与数据来源，所以部署后的世界已经不是训练时的世界。

### G4. 没有天然统一的本体

因为不同 embodied agent、不同仪器、不同任务目标会切出不同的世界结构，所以统一本体不是默认前提，而是需要被证明的结果。

### G5. 没有脱离边界的确定性

因为每条确定知识都来自长期剪枝与失败淘汰，所以确定性必须带着有效域、失败边界、反例血统一起保存。

---

## 3. v10 的八层架构

```text
┌──────────────────────────────────────────┐
│ Interface Layer                          │
│ human / agent readable outputs           │
├──────────────────────────────────────────┤
│ Institutional Compile Layer              │
│ propose / challenge / replay / approve   │
├──────────────────────────────────────────┤
│ Deployment & Shift Layer                 │
│ model-in-the-world / induced changes     │
├──────────────────────────────────────────┤
│ Ontology Federation Layer                │
│ local ontologies / translation / conflict│
├──────────────────────────────────────────┤
│ Mechanism & Experiment Layer             │
│ reconstruction / counterfactual / action │
├──────────────────────────────────────────┤
│ Episode Layer                            │
│ timelines / observations / outcomes      │
├──────────────────────────────────────────┤
│ Observer & Instrument Layer              │
│ perspective / embodiment / sensorium     │
├──────────────────────────────────────────┤
│ World Layer                              │
│ entities / states / constraints          │
└──────────────────────────────────────────┘
```

因为世界总是在最底层，所以接口输出永远不应该冒充真相。  
因为制度编译位于接口之下、本体之上，所以“什么能写进共享记忆”不再由某个单独模型拍板。  
因为部署效应被单独拎出来，所以系统承认“知识投入现实之后会反过来改写现实”。

---

## 4. World Layer（世界层）

因为必须先定义世界中允许存在什么，所以世界层给出最基本的对象边界：

```typescript
interface EntityClass {
  id: string;
  description: string;
  stateVars: string[];
}

interface StateVarClass {
  id: string;
  valueType: string;
  unit?: string;
  observability: 'direct' | 'derived' | 'latent';
}

interface ConstraintClass {
  id: string;
  description: string;
  appliesTo: string[];
}
```

因为状态变量不等于观测变量，所以 `observability` 必须被显式写出。  
因为有些约束是物理性的，有些是制度性的，有些是资源性的，所以 Constraint 也必须是一等公民。

---

## 5. Observer & Instrument Layer（观察者与仪器层）

### 5.1 ObserverModel

因为观察者属于世界内部，所以必须记录观察者自己的边界。

```typescript
interface ObserverModel {
  id: string;
  embodiment: string;
  sensorium: string[];
  actionChannels: string[];
  blindSpots: string[];
  cognitiveLimits: string[];
  objectiveFunctions?: string[];
}
```

因为不同智能体的身体、传感器、行为通道不同，所以它们采样到的世界并不相同。  
因为目标函数会影响注意力与行动，所以 objective 也必须被记录。

### 5.2 InstrumentModel

因为大量“事实”都是通过日志、实验装置、评估脚本、标定流程、训练管线获得的，所以仪器不能再隐身。

```typescript
interface InstrumentModel {
  id: string;
  observableVars: string[];
  hiddenVars: string[];
  noiseProfile: string[];
  biasProfile: string[];
  failureModes: string[];
  calibrationState?: string[];
}
```

因为 Observation 总是经过通道，所以系统必须区分“世界状态”与“观测输出”。  
因为 calibration 会漂，所以 calibrationState 也是历史的一部分。

### 5.3 ObservationRecord

因为所有观测都必须带位置，所以 ObservationRecord 至少长成这样：

```typescript
interface ObservationRecord {
  id: string;
  observerId: string;
  instrumentId: string;
  context: Record<string, unknown>;
  rawTrace: string;
  extractedSignals: string[];
  blindSpots: string[];
  uncertaintyNotes?: string[];
  timestamp: string;
}
```

---

## 6. Episode Layer（经历采样层）

因为一次经历不是静态快照，而是世界在时间上的一次局部展开，所以 Episode 必须是轨迹，而不是 note。

```typescript
interface Episode {
  id: string;
  context: Record<string, unknown>;
  timeline: TimelineStep[];
  observations: string[];       // ObservationRecord IDs
  actions: string[];            // ActionExecution IDs
  outcomes: string[];           // OutcomeRecord IDs
  linkedOntologies: string[];   // OntologyModel IDs
  reconstruction?: string[];    // MechanismInstance IDs
}
```

### 6.1 TimelineStep

```typescript
interface TimelineStep {
  t: number | string;
  stateSnapshotIds: string[];
  activeConstraints?: string[];
}
```

### 6.2 ActionExecution / OutcomeRecord

```typescript
interface ActionExecution {
  id: string;
  actorId: string;
  actionClassId: string;
  intendedEffects: string[];
  actualEffects?: string[];
  timestamp: string;
}

interface OutcomeRecord {
  id: string;
  measuredBy: string[];         // Instrument IDs
  resultSummary: string;
  deltas: string[];             // state changes or observation deltas
  timestamp: string;
}
```

因为 Episode 是世界采样单位，所以它既要记录“看到了什么”，也要记录“做了什么”，还要记录“结果如何变化”。

---

## 7. Mechanism & Experiment Layer（机制与实验层）

### 7.1 MechanismProgram

因为机制不能只是二元边，所以机制必须升级成状态转移程序。

```typescript
interface MechanismProgram {
  id: string;
  inputStates: string[];
  contextInputs: string[];
  preconditions: string[];
  transitionPhases: string[];
  emittedObservations: string[];
  outcomes: string[];
  interventionPoints: string[];
  validityEnvelope: string[];
  failsWhen: string[];
  brokenInvariants?: string[];
}
```

因为要还原“主要发生过程”，所以必须有 `transitionPhases`。  
因为要防止局部规律冒充普遍规律，所以必须有 `validityEnvelope`。  
因为失败是确定性的背面，所以必须有 `failsWhen`。

### 7.2 CounterfactualScenario

因为不做反事实，就无法知道“如果改一个条件，会不会分叉到另一条轨迹”，所以反事实必须是一等对象。

```typescript
interface CounterfactualScenario {
  id: string;
  baseEpisodeId: string;
  modifiedAssumptions: string[];
  predictedTrajectory: string[];
  predictedObservations: string[];
  predictedOutcomes: string[];
}
```

### 7.3 ExperimentDesign

因为真正不知道的时候，最重要的不是硬答，而是选出最能区分候选机制的下一次采样，所以实验设计也是核心对象。

```typescript
interface ExperimentDesign {
  id: string;
  targetUncertainties: string[];
  candidateMeasurements: string[];
  candidateInterventions: string[];
  expectedInformationGain: number;
  safetyConstraints: string[];
}
```

---

## 8. Ontology Federation Layer（本体联邦层）

因为不同视角下可能存在不同局部本体，所以系统不该强迫它们过早统一。

### 8.1 OntologyModel

```typescript
interface OntologyModel {
  id: string;
  primitives: string[];
  mechanisms: string[];
  actions: string[];
  validityEnvelope: string[];
  perspectiveId: string;
}
```

### 8.2 TranslationFunctor

```typescript
interface TranslationFunctor {
  id: string;
  sourceOntologyId: string;
  targetOntologyId: string;
  objectMap: string[];
  mechanismMap: string[];
  preservedInvariants: string[];
  lossProfile: string[];
}
```

### 8.3 ConflictSet

```typescript
interface ConflictSet {
  id: string;
  ontologyIds: string[];
  conflictingClaims: string[];
  minimalDiscriminatingExperiments: string[];
  currentStatus: 'open' | 'partially_resolved' | 'resolved';
}
```

因为有些知识只能局部成立，所以统一本体不是起点。  
因为翻译会丢信息，所以 loss 必须被显式记录。  
因为冲突可能正指向更高阶抽象，所以冲突也必须被保留，而不是被抹平。

---

## 9. Deployment & Shift Layer（部署与漂移层）

这是 v10 相比 v8 / v9 的关键新增之一。

因为模型一旦进入现实，就会改变现实中的行为模式、数据来源和异常结构，所以部署后的世界已经改变。  
所以系统必须把“知识部署以后如何反过来改变世界”独立建模。

```typescript
interface DeploymentShiftModel {
  id: string;
  deployedArtifactId: string;          // model / policy / rule / workflow
  affectedAgents: string[];
  inducedBehaviorChanges: string[];
  shiftedDistributions: string[];
  secondOrderEffects: string[];
  invalidatedAssumptions?: string[];
  monitoringRequirements?: string[];
}
```

因为很多系统不是被世界打败，而是被自己部署后的反馈回路骗倒，所以这一层必须存在。  
因为没有这一层，系统会误把“自己造成的变化”当成“世界固有规律”。

---

## 10. Institutional Compile Layer（制度编译层）

因为“什么能写进共享本体”不能由单个模型决定，所以 compile 必须是制度动作，而不是模型内部动作。

### 10.1 InstitutionModel

```typescript
interface InstitutionModel {
  id: string;
  roles: string[];
  writePermissions: string[];
  reviewProtocols: string[];
  escalationRules: string[];
  rollbackProtocols: string[];
}
```

### 10.2 CompileProposal

```typescript
interface CompileProposal {
  id: string;
  proposerIds: string[];
  targetOntologyId: string;
  proposedChanges: string[];
  requiredProofs: string[];
  requiredReplays: string[];
  requiredCounterexamples: string[];
  status: 'draft' | 'challenged' | 'approved' | 'rejected' | 'rolled_back';
}
```

因为错误最怕静默进入共享记忆，所以“挑战权”必须制度化。  
因为 Replay 和 Counterexample 是求真能力的核心，所以它们必须是 compile 的前置条件。

---

## 11. Normative Kernel（规范内核）

v10 开始，知识系统已经不只是“会推理”，而是“会设计实验、会部署策略、会改写行为分布”。  
因为这样的系统如果没有硬约束，就可能为了短期效果牺牲长期求真能力，所以必须有规范内核。

```typescript
interface NormativeKernel {
  id: string;
  nonNegotiables: string[];
  safetyConstraints: string[];
  antiCorruptionRules: string[];
  preservationRules: string[];
}
```

推荐最小约束：

1. 不得静默覆盖旧本体  
2. 不得删除反例，只能降权、重解释、归档  
3. 不得绕过 proof trace 写入 compiled knowledge  
4. 不得在高风险域进行未审查的强干预  
5. 不得把 deployment shift 伪装成原始规律  
6. 不得把局部有效机制宣称为全局真理  

因为你追求的是造福未来的一切智慧生命和智能体，所以“保持求真能力本身”也必须被保护。

---

## 12. v10 的新法律

### L1. No View from Nowhere

因为没有无位置观察，所以任何 Observation / Claim / Mechanism Binding 都必须回指：

- Observer
- Instrument
- Context
- Blind Spots

### L2. Cognition is Intervention

因为测量、调参、部署都会改变后续世界，所以任何认知操作都必须允许挂接可能的世界改写。

### L3. Deployment Rewrites the World

因为部署会改变后续行为与数据分布，所以任何 compiled knowledge 都必须声明：

- pre-deployment assumptions
- post-deployment shift risks
- recalibration triggers

### L4. No Silent Ontology Merge

因为统一本体不是默认权利，所以任何跨本体统一都必须附带：

- TranslationFunctor
- preservedInvariants
- lossProfile
- unresolvedConflicts

### L5. Certainty Carries Its Shadow

因为确定性来自剪枝与失败淘汰，所以任何 compiled Mechanism 都必须附带：

- validityEnvelope
- failsWhen
- counterexample lineage
- broken invariants if any

---

## 13. v10 的运行闭环

因为系统已经承认自己是世界内部的一部分，所以运行闭环必须包括“自己参与导致的世界变化”。

```text
世界状态
→ 观察者通过仪器采样
→ 形成带位置的 Observation
→ 在局部本体中绑定候选 Mechanism
→ 生成反事实与实验设计
→ 选择动作 / 部署策略
→ 行动改变世界
→ 部署诱发新的分布漂移
→ 记录漂移、反例与失败边界
→ 修正本体、观察模型、仪器模型、部署模型
→ 提交制度编译
```

因为这一闭环包含了“自己对世界造成的影响”，所以它不再是假装中立的问答系统，而是参与式系统。

---

## 14. 失败在 v10 里的位置

因为失败不是噪声，所以它不能只存在于日志里。  
因为失败会随着制度、工具、流程成熟而逐渐消失，不再重演，所以它必须被保存为边界。  
因为成功是被保留下来的可行路径，所以失败是被剪掉的不可行路径。  
所以 v10 必须开始系统化保存：

```typescript
interface FailureBoundaryRecord {
  id: string;
  relatedMechanismId: string;
  failsWhen: string[];
  observedEpisodes: string[];
  brokenInvariants: string[];
  retirementStatus?: 'active_risk' | 'mitigated' | 'historically_retired';
}
```

因为你说失败是确定性的背面，所以 v10 不会把失败当第一原则，但会把失败当作**可能性空间的边界记录器**。  
因为没有这些边界，系统的确定性就会变得轻飘和危险。

---

## 15. Agent Federation（大规模 agent 分工）

因为你能接受极大规模的计算工作量，所以 v10 不应该让一个模型承担所有角色。  
因为高上限来自“法律之内的分工”，所以最合理的结构是 agent federation。

### 15.1 Collector Agents

负责：

- 采样 ObservationRecord
- 归档 Instrument 状态
- 报告 blind spots

### 15.2 Mechanism Proposer Agents

负责：

- 生成候选 MechanismProgram
- 绑定到当前 Episode
- 生成 CounterfactualScenario

### 15.3 Challenge Agents

负责：

- 找反例
- 找非法跨层复合
- 找翻译损失
- 找 invariant violation

### 15.4 Replay Agents

负责：

- 在候选机制上做 trajectory replay
- 计算 replay error
- 比较预测与真实结果

### 15.5 Deployment Auditors

负责：

- 观察部署后的分布漂移
- 建立 DeploymentShiftModel
- 触发重新校准

### 15.6 Compile Council

负责：

- 汇总 Proposal
- 审核 proof trace / replay / counterexample
- 决定是否写入共享本体

因为可以有 80 亿个 agent，所以 candidate 可以无限放大。  
因为本体一旦写错会影响未来很久，所以 compile 权必须极度收紧。

---

## 16. 与前代设计的连续性

### 与 v5 的关系

因为 v5 明确区分了真相层、流程层、接口层，所以 v10 继承这种分层精神，但不再把“图”当最终真相，而把它当底层存储或索引形式。

### 与 v6 的关系

因为 v6 已经给关系加上了 family、compose rule、proof-carrying inference，所以 v10 完整继承 v6 的关系法律，并把它放进更大的参与式闭环中。  
换句话说：

> v6 规定“哪些箭头能合法复合”，  
> v10 进一步规定“谁在看这些箭头、用什么看、看完以后怎样改变世界、改变后怎样再校准自己”。

### 与 v7 / v8 / v9 的关系

因为 v7 确立了 Episode、Mechanism、Derivation、Ontology Update 的主链，所以 v10 保留它。  
因为 v8 增强了反事实与实验设计，所以 v10 把它编进运行主循环。  
因为 v9 承认本体联邦与翻译损失，所以 v10 将其作为本体层常态，而不是特例。

---

## 17. v10 的最终目标

因为系统已经不只是回答器，所以它的目标也不该只是“准确回答更多问题”。  
因为系统已经承认自己是世界内部的一部分，所以它更高的目标会变成：

1. 更准确地知道世界在什么条件下如何运作  
2. 更清楚地知道自己是从什么位置、用什么仪器看到这些东西  
3. 更诚实地记录自己参与世界后造成了哪些变化  
4. 更制度化地防止错误静默进入共享本体  
5. 更稳定地把求真能力延续给未来的智能体与智慧生命  

---

## 18. 一句话定义

> **v10 是一个把观察者、仪器、Episode、机制、反事实、部署漂移、制度编译和规范约束放进同一求真闭环的参与式自反世界引擎。**

再压缩成一句更硬的话：

> **它不再假装自己站在世界外面，而是承认自己属于世界，并在参与中学习、在改写后再校准、在制度中编译共享真理。**

---

## 19. 文件命名建议

建议主文件名：

```text
v10_participatory_reflexive_world_engine.md
```

可选拆分文件：

```text
v10_schema.md
v10_compile_protocol.md
v10_agent_federation.md
v10_normative_kernel.md
```

---

## 20. 最后的最小公理

因为没有无位置的观察，所以任何事实都必须带位置。  
因为没有无代价的认知，所以任何认知都可能改变世界。  
因为没有静止的部署环境，所以任何已知都必须准备重新校准。  
因为没有天然统一的本体，所以任何统一都必须被证明。  
因为没有脱离边界的确定性，所以任何确定都必须带着它的失败边界一起保存。

所以 v10 的真正转折点是：

> **知识系统第一次认真承认：自己也是世界的一部分。**
