# 递归式问答 (Recursive Q&A) 系统设计 v7: 世界模型动力学引擎

## 1. 重新定位：v6 是中核，不是全体

经过重新评审，v6 不再应被看作“还缺逻辑骨架”的版本，而应被看作：

```text
已经找到关系法律内核
但尚未补齐世界动力学、本体采样与本体演化骨架
```

尤其是以下几点，说明 v6 已经把“宁可繁，也不能浑”推进到了真正的硬约束层：

- 四族关系：`structural / explanatory / evidential / interventional`
- 显式复合规则：哪些可以 `compiled`，哪些只能 `candidate`，哪些必须 `forbidden`
- `indicates ∘ causes`、`cooccurs ∘ causes` 被显式禁止，不再允许征兆偷渡成根因
- `evidential → explanatory` 只产生 `Hypothesis / CandidatePath`，不直接产生世界模型层 Ref
- `proof-carrying inference`：结论必须带 `DerivationStep[]`
- `PatternTemplate` 具备 `slots + arrows + invariants + fingerprint`

所以，v7 不是推翻 v6。

v7 的任务是：

**在 v6 的关系法律内核外，再补上世界有状态、经历有轨迹、机制可回放、本体可升级的骨架。**

---

## 2. v6 已经解决了什么

### 2.1 关系不能乱复合

v6 首次让图上的箭头具备法律。

```text
图只有连接
v6 让连接是否可复合、如何降级、何时禁止，都有明确规则
```

这解决了过去“路径一连就像有道理”的问题。

### 2.2 现象提示与世界机制被硬拆开

v6.1 明确区分：

- 世界模型层：`causes / requires / fixes / prevents / is_a / part_of`
- 认识论层：`indicates / cooccurs / similar_to`

因此，“观察如何提示解释”和“世界本身如何运作”终于不再混住。

### 2.3 推理过程可回放

`CompositionResult` 已经要求：

- `status`
- `resultKind`
- `resultForce`
- `evidencePolicy`
- `proof`

所以系统开始从“给答案”变成“给可回放的答案生成轨迹”。

### 2.4 模式从标签升级为结构模板

`PatternTemplate` 已不再是关键词列表，而是：

- `slots`
- `arrows`
- `invariants`
- `SlotFingerprint`

因此系统开始能区分“角色同属 FACT，但结构角色不同”的对象。

---

## 3. v6 还缺的四块硬骨头

### 3.1 缺世界动力学

v6 强在“关系如何合法复合”，但真实机制往往不是简单二元边，而是：

```text
A 和 B
在上下文 C 下
当 x > threshold
共同导致 D
并且经过阶段传播才显现
```

这超出了单纯 pairwise Ref + path composition 的表达力。

因此，v7 需要引入一等公民级别的：

- `MechanismClass`
- 多元条件
- 阈值触发
- 上下文约束
- 状态演化

### 3.2 缺 Episode 轨迹

v6 把 `Story / Case` 提升为了结构实例化，但还不足以完整表达：

- t0 时世界是什么状态
- 执行了什么动作
- t1 / t2 发生了什么转移
- 最终如何收敛到结果

因此，v7 必须让以下对象成为一等公民：

- `Episode`
- `StateSnapshot`
- `Transition`
- `ActionExecution`
- `OutcomeRecord`

### 3.3 缺更强类型的对象层

v6 的箭头已经很精细，但箭头连的对象仍偏粗。

如果对象类型不够清晰，就会出现：

```text
箭头法律很精密
但箭头连接的东西仍然语义模糊
```

因此 v7 需要把底层对象拆得更清楚：

- `EntityClass`
- `StateVarClass`
- `MechanismClass`
- `ActionClass`
- `ConstraintClass`
- `Episode`

### 3.4 缺本体升级法律

v6 已经能：

- compile
- strengthen relation
- prune illegal composition
- register new pattern

但仍缺少更高层的本体升级协议：

- 什么时候允许创建新 `MechanismClass`
- 什么时候应拆分类
- 什么时候应合并类
- 什么时候旧机制应降级 / 退役
- 需要多少 episode、多少 replay 一致性、多少 counterexample 检验，才能成为稳定本体

---

## 4. v7 的核心主张

v7 的核心主张可以压成一句话：

**v6 负责关系法律，v7 负责世界动力学。**

再展开一点：

```text
v6: 哪些箭头能合法连接
v7: 世界在什么状态下如何演化，经历如何被采样与回放，本体如何被升级
```

因此 v7 不是“更大的 v6”，而是：

**在 v6 关系代数内核之外，新增世界本体层、Episode 采样层、重建层和本体演化层。**

---

## 5. v7 的五层架构

### 5.1 第一层：世界本体层（World Ontology Layer）

先定义世界里允许存在什么。

```text
EntityClass
StateVarClass
MechanismClass
ActionClass
ConstraintClass
```

这一层不回答问题，它定义：

- 世界里有哪些对象
- 每类对象有哪些状态
- 哪些状态变量可以变化
- 哪些约束不可违反

### 5.2 第二层：Episode 采样层（Episode Sampling Layer）

一次经历不是聊天记录，而是对世界的一次采样。

```text
Episode
ObservationRecord
StateSnapshot
ActionExecution
Transition
OutcomeRecord
```

这一层负责回答：

- 当时的局部世界长什么样
- 我们看到了什么
- 做了什么动作
- 发生了哪些状态转移
- 最后出现了什么结果

### 5.3 第三层：关系法律层（Relation Law Layer）

这一层原封不动承接 v6 作为中核：

- `RefTypeSpec`
- `ComposeRule`
- `RefForce`
- `PatternTemplate`
- `SlotFingerprint`
- `InvariantCheck`
- `CompositionResult`
- `DerivationStep`

这一层不需要推翻，只需要继续作为硬边界。

### 5.4 第四层：推理与证明层（Inference & Proof Layer）

这一层把“当前为什么接受这条解释链”对象化。

```text
Claim
CandidatePath
Support / Refute
DerivationTrace
AcceptedReconstruction
Conclusion
```

其核心不是生成文本，而是：

- 当前接受哪条机制链
- 为什么排除其它链
- 证据支持度如何
- 重建结果是什么

### 5.5 第五层：本体演化层（Ontology Evolution Layer）

这一层负责“这次经历之后，世界模型边界应该怎样修”。

```text
PromoteMechanism
SplitClass
MergeClass
DeprecateRelation
RegisterPattern
CounterexampleSet
```

这一层让系统不只是“会积累 pattern”，而是会主动修世界模型的边界。

---

## 6. v7 的核心对象

### 6.1 世界本体对象

```typescript
interface EntityClass {
  id: string;
  name: string;
  description: string;
  stateVars: string[];              // StateVarClass IDs
}

interface StateVarClass {
  id: string;
  name: string;
  valueType: 'number' | 'boolean' | 'enum' | 'vector' | 'text';
  unit?: string;
}

interface MechanismClass {
  id: string;
  name: string;
  description: string;
  inputs: string[];                 // Entity / StateVar / Mechanism IDs
  outputs: string[];
  contextConstraints: string[];     // ConstraintClass IDs
  triggerConditions: string[];      // threshold / phase / mode
}

interface ActionClass {
  id: string;
  name: string;
  description: string;
  expectedEffects: string[];        // Mechanism / StateVar deltas
}

interface ConstraintClass {
  id: string;
  name: string;
  description: string;
  scope: 'global' | 'domain' | 'episode';
}
```

### 6.2 Episode 采样对象

```typescript
interface Episode {
  id: string;
  context: Record<string, unknown>;
  snapshots: StateSnapshot[];
  observations: ObservationRecord[];
  actions: ActionExecution[];
  transitions: Transition[];
  outcomes: OutcomeRecord[];
}

interface StateSnapshot {
  id: string;
  t: number | string;
  values: Record<string, unknown>;  // stateVarId -> value
}

interface ObservationRecord {
  id: string;
  t: number | string;
  facts: string[];                  // Observation IDs
}

interface ActionExecution {
  id: string;
  t: number | string;
  actionClassId: string;
  parameters?: Record<string, unknown>;
}

interface Transition {
  id: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  causedByActionId?: string;
  candidateMechanismIds: string[];
}

interface OutcomeRecord {
  id: string;
  t: number | string;
  status: 'success' | 'failure' | 'partial';
  summary: string;
}
```

### 6.3 推理与证明对象

```typescript
interface Claim {
  id: string;
  episodeId: string;
  target: string;                   // failure / mechanism / action recommendation
  candidatePathIds: string[];
}

interface DerivationTrace {
  id: string;
  proof: DerivationStep[];
  supportEvidenceIds: string[];
  refuteEvidenceIds: string[];
  rejectedAlternativeIds: string[];
}

interface AcceptedReconstruction {
  id: string;
  episodeId: string;
  selectedMechanismIds: string[];
  majorChain: string[];
  rejectedPaths: string[];
  traceId: string;
}
```

### 6.4 本体演化对象

```typescript
interface OntologyUpdate {
  id: string;
  sourceEpisodeIds: string[];
  kind:
    | 'PromoteMechanism'
    | 'SplitClass'
    | 'MergeClass'
    | 'DeprecateRelation'
    | 'RegisterPattern';
  rationale: string;
  counterexampleSetIds: string[];
  status: 'proposed' | 'validated' | 'applied' | 'rejected';
}
```

---

## 7. v7 的运行闭环

### 7.1 问题求解环

```text
输入问题
  → 收集 Observation
  → 绑定相关 Episode / StateSnapshot / Evidence
  → 生成 CandidatePath
  → 在 v6 关系法律下过滤
  → 形成 AcceptedReconstruction
  → 输出 Conclusion
```

### 7.2 本体学习环

```text
已完成 Episode
  → 抽象稳定 MechanismClass
  → 检查与旧类的边界冲突
  → 收集 CounterexampleSet
  → 形成 OntologyUpdate
  → 通过后写入世界模型
```

### 7.3 最关键的新增要求

每个“已解决问题”都不能只沉淀为答案，必须沉淀为：

- `Episode`
- `AcceptedReconstruction`
- `OntologyUpdate | NoUpdateReason`

---

## 8. 本体升级法律

v7 必须把“如何升级世界模型”写成法律，而不是经验主义操作。

### 8.1 PromoteMechanism

允许把某机制晋升为稳定本体的前提：

- 至少来自多个独立 `Episode`
- replay 一致性通过
- 没有高强度反例未解决
- 经过 v6 relation law 与 invariant check

### 8.2 SplitClass

当出现以下情况时，允许拆分类：

- 同一类内部需要两套不同机制才能解释
- 两子群 episode 在 replay 时长期不兼容
- 共享标签但不共享动力学

### 8.3 MergeClass

允许合并的前提：

- 两类在机制层、约束层、转移层高度同构
- 分开维护只制造重复，没有新的解释力

### 8.4 DeprecateRelation

一条旧关系需要降级或退役的前提：

- 反例持续增加
- replay 一致性下降
- 被更高解释力的机制替代

### 8.5 RegisterPattern

只有当某结构在多个 Episode 中重复出现，且 invariant 长期成立时，才允许注册为新 PatternTemplate。

---

## 9. 多 agent 的正确用法

因为系统允许极大规模 agent 并行，所以最合理的不是放松法律，而是收紧晋升门槛。

### 9.1 候选生成 agent

负责：

- 提名 `PatternTemplate` 绑定
- 提名相似 `Episode`
- 提名候选机制链

### 9.2 反例搜索 agent

负责：

- 找 counterexample
- 找非法复合
- 找 invariant 破坏点

### 9.3 Replay agent

负责：

- 把候选机制真正带入 episode 的状态轨迹
- 检查是否能重建主要发生过程

### 9.4 本体审理 agent

负责：

- 类边界拆分建议
- 机制合并建议
- 关系降级建议
- update proposal 审理

### 9.5 v7 的铁律

```text
agent 数量可以无限放大 candidate
但任何 agent 都不能绕过 typed relation algebra、
invariant check、proof trace、counterexample test，
直接写入 compiled world-model
```

更狠一点说：

**宁可 80 亿 agent 在法律之内暴力搜索，也不要 1 个 agent 在法律之外聪明跳步。**

---

## 10. v7 的系统口号

v6 的口号是：

- 不要把模式当标签
- 不要把关系当边注释

v7 的口号则是：

- **不要把经历当聊天记录，要把经历当世界采样**
- **不要把答案当核心资产，要把重建轨迹当核心资产**
- **不要只积累 pattern，要持续修世界模型边界**

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
```

从 v1 到 v7：

```text
树 → 集合 → 链 → 分层 → 图 → 关系法律 → 世界动力学
```

---

## 12. v7 的最终判断

v7 不否定 v6。

v7 对 v6 的最终判断是：

```text
v6 = 关系法律内核
v7 = 关系法律内核
     + 世界本体层
     + Episode 采样层
     + 重建与证明层
     + 本体演化层
```

因此，系统的最终目标不再只是：

**会回答**

而是：

**会取样、会建模、会重建、会升级世界本体。**
