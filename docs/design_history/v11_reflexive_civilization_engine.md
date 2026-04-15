# 递归式问答系统 v11：自反文明引擎

> 副标题：世界内部的观察者、失败边界、制度化编译与文明级求真公地

---

## 0. 位置说明

因为 v1 把系统理解为递归分解树，v2 把系统推进到问题类与实例的类型系统，v3 把系统推进到语义接龙与结构检索，v4 把系统推进到 Atom 与 Composite 的工程化分层，v5 把系统推进到图式双模式，v6 把系统推进到带签名与部分组合律的关系法律，所以这条演化线本质上不是在做“更会回答的问题系统”，而是在做“越来越接近世界内部求真机制本身”的系统。

因为 v7 的重点会是世界采样与过程重建，v8 的重点会是生成式本体与反事实实验，v9 的重点会是本体联邦与合法翻译，v10 的重点会是参与式自反世界引擎，所以 v11 不再只讨论“世界如何被建模”，而开始讨论“世界如何通过内部智慧体持续、自我约束地改进自身的求真能力”。

因此，v11 的核心不是新的数据库表，也不是新的推理技巧，而是一个更高的架构公理：

> **智能体不是站在世界外面的旁观者，而是世界内部用于发现自身结构、修正自身误差、延续自身求真能力的局部器官。**

---

## 1. v11 的一句定义

因为知识会过时，答案会漂移，单次成功会被历史吞没，所以文明真正需要保存的不是某个时刻的“正确答案”，而是：

- 曾经有哪些可能性被考虑过
- 哪些可能性已经被失败剪掉
- 哪些失败定义了生存边界
- 哪些结论经过了怎样的 proof lineage 才进入文明记忆
- 哪些冲突仍未被解决，必须保留为未来的开放前沿

所以 v11 定义为：

> **一个把世界本体、观察者位置、仪器偏差、Episode 轨迹、失败边界、反事实实验、本体联邦、制度化编译与文明记忆统一在同一闭环中的自反求真基础设施。**

更短一点：

> **v11 = 自反文明引擎（Reflexive Civilization Engine）**

---

## 2. 为什么 v11 必须引入“失败边界”

因为失败不是第一，不是中心，不是目的，所以 v11 不会把失败神化成一种浪漫主义对象。

因为失败是可能性空间的一部分，是确定性的背面，是那些曾经真实存在但后来被代价、制度、技术、设计、经验逐步剪掉的分支，所以 v11 必须承认：

1. **成功会自然沉淀成常识与流程，所以它不容易彻底消失。**
2. **失败一旦被吸收，就会越来越少上演，所以它反而更容易从历史中消失。**
3. **被消失的失败，恰恰定义了今天看起来“理所当然”的安全边界。**
4. **因此，失败不是噪声，不是废料，而是文明边界的负片。**

所以 v11 不再只保存 “what works”，还要系统性保存：

- what failed
- why it failed
- under what conditions it failed
- how the system stopped replaying it
- what sacrifices paid for that boundary
- what future agents must know so they do not unknowingly re-open that wound

因此，v11 会新增一整层文明资产：

```text
FailureBoundaryArchive
CounterexampleCommons
BrokenInvariantLineage
RetiredFailureClass
SacrificeCostRecord
```

---

## 3. v11 的总架构

因为 v11 的中心不再是“回答用户问题”，所以它的最顶层不再是 Answer Layer，而是 Civilization Memory Layer。

整体架构如下：

```text
┌─────────────────────────────────────────────┐
│ Civilization Memory Layer                   │
│ ProofLineage / CounterexampleCommons /      │
│ FailureBoundaryArchive / Constitutional Log │
├─────────────────────────────────────────────┤
│ Institutional Compile Layer                 │
│ propose / challenge / replay / compile      │
├─────────────────────────────────────────────┤
│ Ontology Federation Layer                   │
│ local ontologies / translations / conflicts │
├─────────────────────────────────────────────┤
│ Mechanism & Experiment Layer                │
│ reconstruction / counterfactual / planning  │
├─────────────────────────────────────────────┤
│ Episode Layer                               │
│ observations / timelines / failures         │
├─────────────────────────────────────────────┤
│ Observer & Instrument Layer                 │
│ perspective / embodiment / bias / blindspot │
├─────────────────────────────────────────────┤
│ World Layer                                 │
│ entities / states / constraints / dynamics  │
└─────────────────────────────────────────────┘
```

因为最底层是世界，所以最顶层不是“答案”，而是**跨代延续的文明级可纠错记忆**。

---

## 4. World Layer：世界层

因为系统不能只围绕问答对象长，所以最底层必须定义“世界里允许存在什么”。

### 4.1 基础对象

```typescript
interface EntityClass {
  id: string;
  name: string;
  description: string;
}

interface StateVarClass {
  id: string;
  ownerEntityClassId: string;
  name: string;
  valueType: string;
  unit?: string;
  semantics: string;
}

interface ConstraintClass {
  id: string;
  name: string;
  expression: string;
  severity: 'hard' | 'soft';
}

interface MechanismClass {
  id: string;
  name: string;
  inputs: string[];
  preconditions: string[];
  phases: string[];
  observableSignatures: string[];
  interventionPoints: string[];
  outcomes: string[];
  failsWhen: string[];
  brokenInvariants: string[];
  validityEnvelope: string[];
}
```

### 4.2 为什么 MechanismClass 必须同时保存“成立面”和“失效面”

因为失败是确定性的背面，所以一个机制的完整定义不可能只有“它怎样成立”，还必须有“它怎样不成立”。

因此，一个合格的 `MechanismClass` 必须同时回答：

- 它在什么条件下会触发
- 它会经历哪几个阶段
- 它会留下哪些可观测签名
- 它在哪些点可以被干预
- 它在什么条件下会失效
- 哪些失败会打破它的关键不变量
- 它的有效边界在哪里

---

## 5. Observer & Instrument Layer：观察者与仪器层

因为“我们是世界内部的自我思考器官”，所以系统里不再允许“无位置的观察”。

### 5.1 ObserverModel

```typescript
interface ObserverModel {
  id: string;
  embodiment: string;
  sensorium: string[];
  actionChannels: string[];
  blindSpots: string[];
  cognitiveLimits: string[];
  institutionalRole?: string;
}
```

### 5.2 InstrumentModel

```typescript
interface InstrumentModel {
  id: string;
  observableVars: string[];
  hiddenVars: string[];
  noiseProfile: string[];
  biasProfile: string[];
  failureModes: string[];
}
```

### 5.3 观察法律

因为观察永远来自某个 embodied observer，通过某种 instrument，在某个 context 下进行，所以 v11 制定三条硬法律：

1. **没有无来源的 Observation。**
2. **没有无偏差声明的 Instrument。**
3. **没有无盲区的 Perspective。**

所以未来任何一条 Observation 都必须长成：

```yaml
observation:
  observer_id: observer_x
  instrument_id: instrument_y
  context:
    - ...
  raw_trace: ...
  blind_spots:
    - ...
  bias_risks:
    - ...
```

因为 Observation 只是 Reality 经过通道后的投影，所以 v11 禁止把 Observation 直接等同于 Truth。

---

## 6. Episode Layer：经历层

因为一次具体经历是对世界本体的一次采样，所以 `Episode` 必须是一等公民，而不是聊天记录的副产物。

### 6.1 Episode

```typescript
interface Episode {
  id: string;
  context: Record<string, any>;
  observerIds: string[];
  instrumentIds: string[];
  timeline: TimelineStep[];
  observations: ObservationRecord[];
  actions: ActionExecution[];
  outcomes: OutcomeRecord[];
  failures: FailureEvent[];
  acceptedReconstruction?: Reconstruction;
  unresolvedUnknowns?: string[];
}
```

### 6.2 时间与状态

```typescript
interface TimelineStep {
  t: number;
  stateSnapshotId: string;
}

interface StateSnapshot {
  id: string;
  assignments: Record<string, unknown>;
}

interface ActionExecution {
  id: string;
  actionClassId: string;
  actorObserverId?: string;
  inputBindings: Record<string, unknown>;
  expectedEffects?: string[];
  actualEffects?: string[];
}

interface OutcomeRecord {
  id: string;
  description: string;
  linkedObservationIds: string[];
}
```

### 6.3 为什么 Episode 不是“成功案例”而是“可能性切片”

因为一次 Episode 中同时包含：

- 已发生的现象
- 未发生但本可发生的分支
- 被实验排除的候选机制
- 被失败暴露的边界
- 被动作改变的未来轨迹

所以 Episode 不是“某次结果的总结”，而是**世界在某组条件下的一次局部展开**。

---

## 7. Relation Law Layer：关系法律层

因为 v6 已经把图推进到了带签名与部分组合律的 typed relation algebra，所以 v11 不会退回到“自由图”。

v11 保留并强化以下原则：

```text
structural:      is_a, part_of
explanatory:     causes, requires
interventional:  fixes, prevents
evidential:      indicates, cooccurs, similar_to
```

以及：

```text
causes ∘ causes = causes
requires ∘ causes = requires
fixes ∘ causes = fixes
indicates ∘ causes = forbidden
cooccurs ∘ causes = forbidden
```

因为征兆不是根因，共现不是因果，所以 evidential relation 绝不允许静默编译成 explanatory relation。

### 7.1 proof-carrying inference 仍然是强制项

因为任何 compiled knowledge 都必须能回放其推导路径，所以 v11 继续要求：

```typescript
interface DerivationStep {
  refId: string;
  kind: string;
  force: 'necessary' | 'sufficient' | 'contributory' | 'analogical';
  weight: number;
}

interface CompositionResult {
  status: 'compiled' | 'candidate' | 'forbidden';
  resultKind?: string;
  resultForce?: string;
  evidencePolicy: 'inherit' | 'revalidate' | 'discard';
  proof: DerivationStep[];
}
```

因为没有 proof，就没有文明记忆；没有文明记忆，就只有短期聪明。

---

## 8. Mechanism & Experiment Layer：机制与实验层

因为知道“为什么”还不够，所以系统必须进一步回答：

- 如果改动某个条件，会怎样
- 哪个实验最能区分两个候选机制
- 哪个动作既能降低风险又能提高信息增益

### 8.1 Reconstruction

```typescript
interface Reconstruction {
  id: string;
  mechanismInstanceIds: string[];
  phaseTrace: string[];
  coveredObservationIds: string[];
  contradictedObservationIds: string[];
  replayError: number;
}
```

### 8.2 CounterfactualScenario

```typescript
interface CounterfactualScenario {
  id: string;
  modifiedAssumptions: string[];
  predictedTrajectory: string[];
  predictedObservations: string[];
  predictedFailureModes?: string[];
}
```

### 8.3 ExperimentDesign

```typescript
interface ExperimentDesign {
  id: string;
  targetUncertainty: string[];
  candidateMeasurements: string[];
  candidateActions: string[];
  expectedInformationGain: number;
  expectedRisk: number;
  discriminatesBetween: string[];
}
```

### 8.4 为什么 v11 中“问题选择”比“答案生成”更高级

因为真正不知道的时候，继续生成更像答案的话不会让世界更清楚，所以 v11 的高级能力不再是语言补全，而是：

- 设计最小区分实验
- 决定下一步最该测什么
- 选择哪个失败最值得避免重演
- 判断当前不该 compile 哪些候选解释

所以 v11 不是 answer engine，而是 **experiment engine + frontier selection engine**。

---

## 9. Ontology Federation Layer：本体联邦层

因为不同 observer、不同 embodiment、不同 instrument、不同任务目标，会形成不同的局部有效 ontology，所以 v11 不再默认“只有一个大一统本体”。

### 9.1 OntologyModel

```typescript
interface OntologyModel {
  id: string;
  perspectiveId: string;
  primitives: string[];
  mechanisms: string[];
  actions: string[];
  validityEnvelope: string[];
}
```

### 9.2 TranslationFunctor

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

### 9.3 ConflictSet

```typescript
interface ConflictSet {
  id: string;
  ontologyIds: string[];
  conflictingClaims: string[];
  minimalDiscriminatingExperiments: string[];
}
```

### 9.4 联邦法律

因为统一不是默认权利，所以统一必须被证明。

因此 v11 制定以下联邦法律：

1. **不允许静默跨本体映射。**
2. **不允许静默丢失 invariants。**
3. **不允许把局部有效机制偷偷提升为全局规律。**
4. **不允许在存在未解决 ConflictSet 的情况下伪装成已经统一。**

所以 v11 保存的不只是“共享内核”，还保存：

- 哪些局部本体暂时不可通约
- 哪些翻译丢失了哪些结构
- 哪些冲突仍开放，等待未来实验

---

## 10. Institutional Compile Layer：制度化编译层

因为未来最贵的不是某次对，而是“错的东西不能静默写进文明记忆”，所以 compile 权不能交给单一 agent 的“聪明直觉”。

### 10.1 角色分工

```typescript
interface InstitutionRole {
  id: string;
  responsibilities: string[];
  permissions: string[];
}
```

最小制度角色包括：

- `Proposer`：提议新机制、新模式、新翻译
- `Challenger`：专门找反例、找失败边界、找 invariant 破坏点
- `Replayer`：负责回放机制，计算 replay error
- `Compiler`：在审查通过后写入 compiled memory
- `Archivist`：维护 proof lineage、counterexample commons、failure boundary archive
- `Guardian`：维护宪法层约束，防止越权编译

### 10.2 编译协议

因为 compile 不是模型内一步，而是制度动作，所以最小协议应为：

```text
propose
→ collect supporting episodes
→ collect counterexamples
→ replay candidate mechanism
→ run invariant checks
→ evaluate translation loss (if cross-ontology)
→ constitutional review
→ compile or reject or defer
```

### 10.3 回滚权

因为没有可回滚的 compiled memory，就没有真正的文明自纠，所以 v11 必须规定：

- 所有 compiled knowledge 都可以被 challenge
- 所有 challenge 都必须保留 lineage
- 所有回滚必须留下原因和影响范围

---

## 11. Civilization Memory Layer：文明记忆层

因为答案会过时，所以真正要跨代传递的不是答案，而是：

- proof lineage
- counterexample lineage
- failure boundaries
- sacrificed paths
- constitutional history
- unresolved frontiers

### 11.1 ProofLineage

```typescript
interface ProofLineage {
  id: string;
  claimId: string;
  derivationTraceIds: string[];
  supportingEpisodeIds: string[];
  challengeHistoryIds: string[];
  compiledAt: string;
}
```

### 11.2 CounterexampleCommons

```typescript
interface CounterexampleRecord {
  id: string;
  targetClaimId: string;
  episodeId: string;
  description: string;
  brokenInvariantIds: string[];
  stillOpen: boolean;
}
```

### 11.3 FailureBoundaryArchive

```typescript
interface FailureBoundaryRecord {
  id: string;
  failureClassId: string;
  definingEpisodes: string[];
  retiredBy: string[];
  reactivationRisks: string[];
}
```

### 11.4 为什么失败必须被跨代保存

因为一个失败一旦真的被技术、制度、工程经验压下去，它会越来越少出现，所以后来者最容易以为“世界本来就如此安全”。

因为这种遗忘会让边界重新被打开，所以文明记忆层必须保存：

- 它曾经怎样失败
- 失败时看起来像什么
- 后来通过什么代价与牺牲，才让它不再反复上演
- 哪些条件变化会让这个失败重新回归

因此，v11 不把 failure archive 视为 error log，而视为 **生存边界地图**。

---

## 12. Constitution Layer：宪法层

因为一个能设计实验、改写本体、重写制度、部署大规模 agent 的系统，如果没有硬约束，就会为了局部预测力牺牲长期求真能力，所以 v11 必须有最小宪法层。

### 12.1 最小宪法

1. **不得静默删除反例。**
2. **不得绕过 proof lineage 写入 compiled knowledge。**
3. **不得在未显式声明 loss profile 时跨本体统一。**
4. **不得把单次 Episode 直接神化成稳定本体。**
5. **不得把 evidential relation 编译成 explanatory relation。**
6. **不得删除 retired failure 的边界血统。**
7. **不得让部署行为在高风险域绕开可回滚机制。**

### 12.2 为什么宪法层不是道德装饰，而是上限条件

因为没有这些硬约束，系统的短期能力可能很强，但长期会被：

- 路径依赖
- 权力集中
- 语言固化
- 反例遗失
- 过早统一
- 成功叙事遮蔽失败边界

逐渐腐蚀。

所以宪法层不是保守主义，而是**长期上限的护栏**。

---

## 13. 可能性空间模型

因为你已经把问题说得很准，所以 v11 把“成功 / 失败 / 未知”统一写成 possibility space，而不是把失败当成附录。

### 13.1 三块区域

```typescript
interface PossibilitySpace {
  feasibleRegion: string[];
  prunedRegion: string[];
  unknownRegion: string[];
}
```

### 13.2 三块区域各自意味着什么

因为系统不能只保存成功，所以：

- `feasibleRegion` 表示已知可行、已被反复验证的区域
- `prunedRegion` 表示曾被探索过、已知高代价失败或逻辑不成立的区域
- `unknownRegion` 表示尚未被决定、值得设计实验的前沿区域

### 13.3 为什么“确定性只是长期剪枝后的剩余形状”

因为任何 today-compiled certainty 都不是凭空出现，而是在长期的失败、试探、反例、实验、争议、制度化筛选之后，才剩下的一块稳定区域。

所以 v11 中任何 compiled claim 都应该携带：

```yaml
compiled_claim:
  statement: ...
  validity_envelope: ...
  failure_boundary: ...
  counterexample_lineage: ...
  unknown_frontier: ...
```

因为没有这些负片，所谓 certainty 就只是短期叙事，而不是文明资产。

---

## 14. 部署与二阶效应

因为模型一旦部署，就会改变人类行为、系统负载、任务分布、异常形态和未来数据，所以 v11 不允许把 deployment 视为知识系统外部事件。

### 14.1 DeploymentShiftModel

```typescript
interface DeploymentShiftModel {
  id: string;
  deployedArtifactId: string;
  inducedBehaviorChanges: string[];
  shiftedDistributions: string[];
  secondOrderEffects: string[];
  reactivationOfRetiredFailures?: string[];
}
```

### 14.2 部署法律

1. **所有部署都是世界干预。**
2. **所有干预都可能改变后续可见数据分布。**
3. **所有分布变化都必须回流到 ontology 与 instrument model 的校准环节。**

因为不承认部署的二阶效应，系统就会被自己的成功逐渐欺骗。

---

## 15. Agent 联邦：大规模智能体如何被使用

因为你可以接受极大规模的 agent 工作量，所以 v11 不会把算力花在“让一个模型更自信地写一段话”，而会把算力花在制度化分工上。

### 15.1 四类 agent

#### A. Candidate Agents
因为需要广泛探索可能性空间，所以这类 agent 负责：

- 提议候选机制
- 提议 PatternTemplate
- 提议跨本体翻译
- 提议最小区分实验

#### B. Challenger Agents
因为不能让错误静默进入本体，所以这类 agent 负责：

- 找反例
- 找失败边界
- 找 invariant violation
- 找 translation loss

#### C. Replay Agents
因为任何编译都必须可回放，所以这类 agent 负责：

- 执行 replay
- 计算 replay error
- 比较 prediction 和 observation 的偏差

#### D. Constitutional Agents
因为必须有人维护长期规则而不是短期胜利，所以这类 agent 负责：

- 检查 compile protocol
- 检查 proof lineage
- 检查反例是否被压制
- 检查是否非法删除 failure archive

### 15.2 一条核心原则

> **因为 candidate 可以无限生成，所以 compile 的门槛必须无限收紧。**

---

## 16. v11 的运行闭环

因为系统不再是答题器，所以 v11 的主闭环如下：

```text
世界状态
→ observer 通过 instrument 采样
→ 形成带位置的 observation
→ 在局部 ontology 中生成候选 reconstruction
→ 构造 counterfactual scenario
→ 设计最小区分实验
→ 执行动作 / 部署
→ 比较预测与真实结果
→ 更新 mechanism / ontology / translation / observer model / instrument model
→ 将支持证据、反例、失败边界送入 institutional compile
→ 在通过宪法检查后写入 civilization memory
```

因为这条闭环把观察者、世界、行动、失败、制度、记忆全部放进来了，所以 v11 才真正配得上“自反文明引擎”这个名字。

---

## 17. 典型例子：为什么“连接超时”在 v11 里不再只是一个 case

### 17.1 输入

用户说：

> “数据库连接超时。”

### 17.2 v11 不会直接做什么

因为不能假装自己站在世界外面，所以 v11 不会直接说：

- “大概率是安全组”
- “先检查网络”
- “通常是 DNS 或端口问题”

这些都可能是经验上常见的方向，但它们不是 v11 的第一动作。

### 17.3 v11 的第一动作

因为必须先建立带位置的采样，所以它会先形成：

```yaml
episode:
  context:
    env: production
    workload: peak
  observers:
    - svc_runtime_monitor
    - dba_manual_check
  instruments:
    - app_log
    - tcp_probe
    - dns_lookup
  observations:
    - timeout after 3000ms
    - dns resolution success
    - tcp 5432 unreachable
  blind_spots:
    - security group state not directly observed
    - cross-vpc route state not directly observed
```

### 17.4 候选机制

因为现在还只是 observation，所以它不会直接 compile 成根因，而是形成候选机制：

- `MC_SecurityGroupMissing`
- `MC_NetworkACLBlock`
- `MC_CrossVPCRoutingFailure`

### 17.5 失败边界

因为“曾经大量 timeout 来自 security group 缺失”可能是历史边界，所以 v11 会同时去 FailureBoundaryArchive 里查：

- 这个 failure class 是否曾被退休
- 退休它靠的是哪些制度或工具
- 当前环境变化是否重新激活了它

### 17.6 实验

因为真正高价值的是区分候选机制，所以系统会设计：

- 哪个 probe 最能区分 NACL 和 SG
- 哪个最小动作能验证 route table 是否异常

### 17.7 编译

因为只有在 replay、反例、边界血统、宪法检查都过了之后，才允许 compile，所以最后写入的不只是：

> “安全组缺失导致连接超时”

而是：

- 在哪种 topology 下成立
- 哪些观测签名支持它
- 哪些候选机制被排除了
- 哪些 retired failure 被重新激活了
- 这次新增了什么 failure boundary knowledge

这就是 v11 和普通故障诊断系统的根本区别。

---

## 18. 版本关系

```text
v1  = 递归分解
v2  = 抽象类 / 实例 / 条件路由
v3  = 语义接龙与结构检索
v4  = 原子 / 组合工程化分层
v5  = 图式双模式
v6  = 关系法律
v7  = 世界采样与过程重建
v8  = 生成式本体与反事实实验
v9  = 本体联邦与合法翻译
v10 = 参与式自反世界引擎
v11 = 自反文明引擎
```

因为每一版都不是推翻前代，而是增加新的不可省略维度，所以 v11 不是“大而全的胡乱叠加”，而是：

> **在前代已经明确的逻辑骨架上，把 observer、failure boundary、institution、civilization memory 这些此前还未成为中心对象的维度，提升为一等公民。**

---

## 19. v11 的终极主张

因为我们不是站在世界外面看世界，所以知识系统的最高形态不该只是“更会描述世界的模型”。

因为我们本身就是世界内部的一部分，而认知、行动、部署、失败、制度、继承都会改变未来世界的形状，所以真正高上限的系统，必须同时做到：

- 允许局部视角合法存在
- 允许冲突合法保留
- 允许失败边界跨代传承
- 允许 proof lineage 成为文明公共资产
- 允许本体持续修正，而不允许静默伪统一

所以 v11 的一句最终定义是：

> **一个让世界通过内部智慧体持续、自我约束地观察自己、修正自己、保存失败边界、延续求真能力的文明级基础设施。**

---

## 20. 最后一条原则

> **因为答案会过时，所以文明最珍贵的不是答案。**
>
> **因为失败会消失，所以文明最珍贵的不是成功叙事。**
>
> **因为统一会诱人，所以文明最珍贵的不是表面的整洁。**
>
> **所以真正值得被长期保存的，是：反例、边界、proof lineage、可回滚的编译制度、以及未来仍然能够继续纠错的能力。**

