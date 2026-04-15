# 递归式问答 (Recursive Q&A) 系统设计 v9: 本体联邦与自反文明引擎

## 1. 重新定位：v8 是生成式本体引擎，v9 是文明级跃迁

v8 已经完成了从"解释过去"到"生成未来"的范式跃迁：

- 潜在状态层区分了世界真实状态与观测投影
- 机制程序层把 `MechanismClass` 升级为可执行的状态转移程序
- 反事实层让系统能模拟"如果 X 不同，会怎样"
- 主动学习层让系统能设计信息增益最大的实验
- `ValidityEnvelope` 为每条 compiled 机制画上了有效边界

但 v8 仍然隐含一个强假设：

```text
存在一套不断扩展的主表示语言，可以平滑容纳整个世界。
```

v9 必须打破这个假设。

因为真实世界的复杂性远超任何单一表示：

- 不同尺度下，结构完全不同
- 不同 embodiment 下，采样通道完全不同
- 不同任务目标下，切分世界的方式完全不同
- 不同智慧体之间，有些知识可翻译，有些只能局部对应，有些暂时不可通约

因此 v9 不是 v8 的加厚版，而是一次 **从单一世界模型到本体联邦的文明级跃迁**。

---

## 2. v8 已经解决了什么

### 2.1 观测不是事实，而是潜在状态的投影

v8 确立了 `LatentStateClass` 和 `ObservationModel`，让系统能够：

- 推断未直接观测的潜在状态
- 识别 measurement artifact
- 区分"世界本身"和"经过传感器投影后的像"

### 2.2 机制是可执行的程序

v8 把 `MechanismClass` 升级为 `MechanismProgram`，让系统能够：

- 按 `phases` 推进状态转移
- 预测应该发射的观测特征
- 在 `validityEnvelope` 内安全运行

### 2.3 反事实是一等公民

v8 让 `CounterfactualScenario` 成为系统运行的常规环节，解决了：

- 只能解释、不能设计行动的困境
- 通过预测先行，获得了可证伪性

### 2.4 主动学习有法律

v8 要求 `ExperimentDesign` 必须评估 `informationGain` 和 `discriminatingPower`，让系统不再被动等待经历，而是主动规划下一次采样。

---

## 3. v8 还缺的三块硬骨头

### 3.1 缺对多元本体的承认

v8 仍然倾向于在"同一套本体语言"内扩展。

但现实中：

```text
分子生物学的"基因"本体
与社会科学的"制度"本体
与工程系统的"信号"本体
无法被同一种 primitives 平滑容纳
```

如果强行统一，结果不是整合，而是混浊。

v9 必须承认：**局部本体是常态，共享内核是例外，需要被证明而非假设。**

### 3.2 缺对观察者视角的显式建模

v8 的 `ObservationModel` 仍然没有回答"谁在观察"。

但"观察"本身不是中性的：

```text
人类视网膜 ≠ 机器视觉传感器 ≠ 仿真体的状态读取器
不同 embodiment 有不同的盲区、噪声、可控通道
```

如果不把 `PerspectiveModel` 建模进去，系统会误把"我的观测方式"当成"世界本身"。

### 3.3 缺跨本体翻译的法律

v8 能在一个本体内合法复合关系、合法演化边界。

但多个本体之间如何互相映射？v8 没有回答：

```text
哪些结构可以跨本体翻译？
翻译时保留了什么 invariant？
丢了什么信息？
什么时候应该承认不可通约，而不是硬并？
```

没有这一层，系统一旦面对多领域、多智能体、多文化的知识，就会陷入静默损失或虚假统一。

---

## 4. v9 的核心主张

v9 的核心主张可以压成一句话：

**v8 负责生成未来并设计实验，v9 负责让多种局部真理合法共存、可验证翻译、在不混淆真理的前提下持续汇编共享现实。**

再展开一点：

```text
v8: 推断潜在状态 → 生成反事实 → 设计实验 → 校准本体
v9: 在局部本体内完成 v8 的全流程
     + 跨本体显式翻译（带 preserved invariants + loss profile）
     + 保留显式冲突与不可通约区
     + 用区分实验推进共享内核的编译
     + 用宪法层约束真理的部署方式
     + 用元修订规则修理表示语言本身
```

因此 v9 不是"更大的 v8"，而是：

**在 v8 的生成模拟内核之外，新增本体联邦层、翻译法律层、冲突治理层、宪法约束层和自反元层。**

---

## 5. v9 的七层架构

### 5.1 世界本体层（World Ontology Layer）

继承 v8，但增加核心约束：

```text
EntityClass
StateVarClass
LatentStateClass
MechanismProgram
InterventionModel
ConstraintClass
ObservationModel
```

**新增约束**：所有本体层对象必须归属到某个 `OntologyModel`，不存在游离的"全局对象"。

### 5.2 Episode 采样层（Episode Sampling Layer）

继承 v8 的全部对象，但增加：

```text
Episode.perspectiveId              ← 新增
ObservationRecord.perspectiveId    ← 新增
```

**新增约束**：一次 Episode 必须声明它是从哪个 `PerspectiveModel` 采样的。

### 5.3 关系法律层（Relation Law Layer）

原封不动承接 v6/v7/v8 作为不可绕过的中核：

- `RefTypeSpec`
- `ComposeRule`
- `RefForce`
- `PatternTemplate`
- `DerivationStep`

**新增约束**：这些法律在一个 `OntologyModel` 内部生效；跨本体的映射由翻译法律层管辖，不能混用。

### 5.4 信念与生成层（Belief & Generation Layer）

继承 v8：

```text
BeliefState
CounterfactualScenario
PredictedTrajectory
ExperimentDesign
PredictionError
```

**新增约束**：生成和预测必须在某个指定的 `OntologyModel` 内运行；结果要跨本体共享时，必须经过 `TranslationFunctor`。

### 5.5 本体联邦层（Ontology Federation Layer）

这是 v9 的核心新增层。

```text
OntologyModel
PerspectiveModel
TranslationFunctor
ConflictSet
UnresolvedBoundary
```

这一层负责：

- 管理多个局部本体的注册与生命周期
- 记录不同视角的采样通道特性
- 执行跨本体的合法翻译
- 保留显式冲突区，而不是急着消灭它

### 5.6 翻译与冲突层（Translation & Conflict Layer）

```text
TranslationValidation
InvariantPreservationCheck
LossProfileRecord
DiscriminatingExperimentForConflict
```

这一层负责：

- 验证 `TranslationFunctor` 是否合法
- 检查 invariant 是否被保留
- 量化并记录信息损失
- 为冲突设计最小区分实验

### 5.7 自反与宪法层（Meta & Constitution Layer）

这是 v9 的最高层。

```text
MetaRevisionRule
OntologyAuditTrace
ConstitutionLayer
SharedKernelCompileGate
```

这一层负责：

- 修理构造世界模型的语言本身
- 约束哪些本体更新可以进入共享内核
- 确保"真理如何被部署"受宪法约束

---

## 6. v9 的核心对象

### 6.1 本体联邦对象

```typescript
interface OntologyModel {
  id: string;
  name: string;
  description: string;
  primitives: string[];             // EntityClass / StateVarClass / LatentStateClass IDs
  mechanisms: string[];             // MechanismProgram IDs
  actions: string[];                // InterventionModel IDs
  validityEnvelope: ValidityEnvelope;
  perspectiveId: string;            // 默认视角
  sharedKernelContribution: boolean;
}

interface PerspectiveModel {
  id: string;
  name: string;
  description: string;
  sensorium: string[];              // 可观测通道
  blindSpots: string[];             // 不可观测区
  noiseProfile: string[];           // 噪声特征
  controllableChannels: string[];   // 可干预通道
  embodimentType?: string;          // 身体/载体类型
}
```

### 6.2 翻译法律对象

```typescript
interface TranslationFunctor {
  id: string;
  sourceOntologyId: string;
  targetOntologyId: string;
  objectMap: TranslationMapping[];      // primitive 映射
  mechanismMap: TranslationMapping[];   // mechanism 映射
  preservedInvariants: string[];        // 翻译后仍成立的不变量
  lossProfile: LossRecord[];            // 明确记录损失了什么
  validationStatus: 'proposed' | 'verified' | 'rejected' | 'deprecated';
}

interface TranslationMapping {
  sourceId: string;
  targetId: string;
  confidence: number;
  rationale: string;
}

interface LossRecord {
  kind: 'information' | 'structure' | 'causality' | 'granularity';
  description: string;
  severity: 'low' | 'medium' | 'high';
}
```

### 6.3 冲突与不可通约对象

```typescript
interface ConflictSet {
  id: string;
  ontologyIds: string[];
  conflictingClaims: string[];
  minimalDiscriminatingExperiments: string[];
  status: 'open' | 'resolved' | 'accepted_as_boundary';
  resolutionNotes?: string;
}

interface UnresolvedBoundary {
  id: string;
  involvedOntologyIds: string[];
  reason:
    | 'translation_failed'
    | 'invariant_not_preserved'
    | 'no_discriminating_experiment'
    | 'perspective_incommensurable';
  description: string;
}
```

### 6.4 自反与宪法对象

```typescript
interface MetaRevisionRule {
  id: string;
  name: string;
  triggerConditions: string[];
  allowedOperations: (
    | 'split_primitive'
    | 'merge_primitive'
    | 'retype_relation'
    | 'deprecate_concept'
    | 'create_new_primitive'
    | 'introduce_new_perspective'
  )[];
  requiredEvidence: string[];
  appliedCount: number;
}

interface ConstitutionLayer {
  id: string;
  version: string;
  principles: ConstitutionalPrinciple[];
}

interface ConstitutionalPrinciple {
  id: string;
  statement: string;
  enforcement: 'hard_stop' | 'audit_flag' | 'human_review';
  scope: 'shared_kernel' | 'all_ontologies' | 'high_risk_intervention';
}
```

### 6.5 共享内核门控对象

```typescript
interface SharedKernelCompileGate {
  id: string;
  candidateOntologyUpdateId: string;
  crossOntologyTranslationChecks: string[];
  conflictSetReviewIds: string[];
  constitutionCompliance: boolean;
  decision: 'approved' | 'rejected' | 'deferred';
  reviewerTrace: string[];
}
```

---

## 7. v9 的运行闭环

### 7.1 局部问题求解环

```text
输入问题
  → 选择适用的 OntologyModel
  → 声明 PerspectiveModel
  → 收集 Observation（标注 observationModelId + perspectiveId）
  → 推断 LatentState
  → 在选定的 OntologyModel 内运行 v8 全循环
  → 生成局部 Conclusion + PredictedTrajectory
```

### 7.2 跨本体翻译环

```text
局部本体 A 产生结论 C_a
  → 检索到共享内核相关的 OntologyModel B
  → 调用 TranslationFunctor(A → B)
  → 运行 InvariantPreservationCheck
  → 记录 LossProfile
  → 若 invariant 被破坏，则生成 ConflictSet
  → 若无法翻译，则生成 UnresolvedBoundary
```

### 7.3 冲突治理环

```text
发现 ConflictSet
  → 评估 minimalDiscriminatingExperiments
  → 设计并执行区分实验
  → 根据实验结果：
      a) 修改 TranslationFunctor
      b) 更新某一 OntologyModel 的 validityEnvelope
      c) 将冲突标为 accepted_as_boundary（保留为边界知识）
```

### 7.4 共享内核编译环

```text
局部 OntologyUpdate 成熟
  → 提交到 SharedKernelCompileGate
  → 检查跨本体翻译一致性
  → 检查 ConflictSet 是否已处理
  → 检查 ConstitutionLayer 合规性
  → 批准后写入 Shared Kernel
  → 被拒绝的更新保留在 Local Ontology
```

### 7.5 元修订环

```text
长期观察到某类 OntologyModel 的表示瓶颈
  → 提名 MetaRevisionRule
  → 收集跨本体一致性和跨 embodiment 兼容性证据
  → 运行自反审计
  → 若通过，则修改表示语言/增加新 primitive
  → 更新所有受影响 TranslationFunctor 的版本
```

### 7.6 最关键的新增要求

每个"跨本体交互"不能只沉淀为结果，必须沉淀为：

- `TranslationFunctor`（带 `lossProfile`）
- `ConflictSet` 或 `UnresolvedBoundary`
- `SharedKernelCompileGate` 的审理记录
- 若发生过元修订，`MetaRevisionRule` 的执行痕迹

---

## 8. v9 的新法律：翻译法律、联邦法律与宪法

### 8.1 翻译必须有法律

v6 的第一原则是"关系必须有法律"，v9 的第一原则是：

**本体之间的翻译也必须有法律。**

具体而言：

- 不能静默跨本体映射
- 不能静默丢失信息
- `TranslationFunctor` 必须显式声明 `preservedInvariants`
- `TranslationFunctor` 必须显式记录 `lossProfile`
- 未经验证的翻译不得进入共享内核

**铁律**：

```text
没有 loss profile 的 TranslationFunctor，不得用于共享内核编译。
```

### 8.2 统一不是默认，而是需要证明的结果

**铁律**：

```text
任何两个 OntologyModel 的合并或统一，必须先经过：
  1. TranslationFunctor 验证
  2. InvariantPreservationCheck 通过
  3. ConflictSet 为空或已 accepted_as_boundary
  4. SharedKernelCompileGate 批准
```

### 8.3 不可通约是知识，不是噪声

系统必须把以下记录作为一等知识落盘：

- `translation failed because...`
- `invariant not preserved because...`
- `two ontologies disagree under these contexts...`
- `no current discriminating experiment exists...`

**铁律**：

```text
UnresolvedBoundary 不得被自动删除或覆盖，只能被显式元修订规则处理。
```

### 8.4 宪法层约束真理部署

`ConstitutionLayer` 的最小原则：

- 不得静默覆盖旧本体
- 不得删除反例
- 不得绕过 proof trace 写入 compiled knowledge
- 不得在高风险域进行未经批准的强干预
- 不得在没有 `TranslationFunctor` 的情况下强制统一两个 OntologyModel

**铁律**：

```text
任何写入 Shared Kernel 的操作，必须通过 ConstitutionLayer 的 hard_stop 检查。
```

### 8.5 元修订需要更高门槛

`MetaRevisionRule` 触发时，必须满足：

- 有跨多个 `OntologyModel` 的结构性证据
- 有 `PerspectiveModel` 差异导致的系统性表示失败证据
- 有至少一个可行的替代表示方案
- 修订后的影响范围已被审计

---

## 9. 多 agent 的正确用法

v9 的 agent 分工在 v8 基础上扩展为"制度化科学共同体"：

### 9.1 局部本体 agent

负责：

- 在指定 `OntologyModel` 内运行完整的 v8 循环
- 提名新的 `OntologyModel` 或 `PerspectiveModel`
- 维护局部本体的 `validityEnvelope`

### 9.2 翻译提名 agent

负责：

- 发现两个 `OntologyModel` 之间的候选映射
- 提名 `TranslationFunctor`
- 初步标注 `preservedInvariants` 和 `lossProfile`

### 9.3 翻译验证 agent

负责：

- 运行 `InvariantPreservationCheck`
- 量化 `lossProfile`
- 验证 `TranslationFunctor` 的合法性

### 9.4 反例与冲突搜索 agent

负责：

- 找 `TranslationFunctor` 的反例
- 找跨本体的不兼容场景
- 提名 `ConflictSet` 和 `UnresolvedBoundary`

### 9.5 区分实验设计 agent

负责：

- 为 `ConflictSet` 设计 `minimalDiscriminatingExperiments`
- 评估实验对两个候选翻译的区分力

### 9.6 共享内核编译 agent

负责：

- 审理 `SharedKernelCompileGate`
- 验证 `ConstitutionLayer` 合规性
- **唯一**被授权写入 Shared Kernel 的 agent 类型

### 9.7 元审计 agent

负责：

- 监控是否需要触发 `MetaRevisionRule`
- 评估表示语言的瓶颈
- 审计本体边界是否只是历史产物

### 9.8 v9 的铁律

```text
agent 数量可以无限放大局部本体、翻译提名、反例搜索和实验设计
但任何 agent 都不能绕过
  TranslationFunctor 验证、InvariantPreservationCheck、
  ConflictSet 审理、ConstitutionLayer 合规检查、
  SharedKernelCompileGate 批准
直接写入共享内核
```

更狠一点：

**宁可 80 亿 agent 在联邦法律之内并行探索，也不要 1 个 agent 在法律之外静默统一。**

---

## 10. v9 的系统口号

v6 的口号：

- 不要把模式当标签
- 不要把关系当边注释

v7 的口号：

- 不要把经历当聊天记录，要把经历当世界采样
- 不要把答案当核心资产，要把重建轨迹当核心资产
- 不要只积累 pattern，要持续修世界模型边界

v8 的口号：

- 不要把观测当事实本身，要把观测当潜在状态的有噪投影
- 不要只解释过去，要能在执行前生成可检验的预测
- 不要被动等待经历，要主动设计最小代价的下一次学习
- 不要把局部真理误当普遍真理，要为每条 compiled 机制画上 ValidityEnvelope

v9 的口号则是：

- **不要追求唯一的终极本体，要让多种局部真理合法共存**
- **不要静默跨本体映射，要让翻译也带上法律和损失记录**
- **不要把冲突当噪声，要把不可通约也当作知识落盘**
- **不要依赖某个超级大脑不会错，要依赖制度化科学共同体和法律约束**
- **不要忘了约束真理的部署方式，文明级求真引擎必须有宪法层**

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
v9: 本体联邦与自反文明引擎（多元本体 + 翻译法律 + 冲突治理 + 宪法约束 + 元修订）
```

从 v1 到 v9：

```text
树 → 集合 → 链 → 分层 → 图 → 关系法律 → 世界动力学 → 生成模拟与实验设计 → 本体联邦与文明约束
```

---

## 12. v9 的最终判断

v9 不否定 v8。

v9 对 v8 的最终判断是：

```text
v6 = 关系法律内核
v7 = 关系法律内核 + 世界动力学骨架
v8 = 关系法律内核 + 世界动力学骨架 + 生成模拟与主动学习层
v9 = 关系法律内核 + 世界动力学骨架 + 生成模拟与主动学习层
      + 本体联邦层
      + 翻译法律层
      + 冲突治理层
      + 宪法约束层
      + 自反元修订层
```

因此，系统的最终目标不再只是：

**会推断潜在状态、会生成预测、会设计实验、会校准本体。**

而是：

**会构建局部本体、会合法翻译、会保留冲突与不可通约、会汇编共享现实、会约束真理部署、会修理自己的表示语言。**

再压成最狠的一句：

**到了 v9，系统不只是逼近世界本身，而是开始逼近“不同智慧体如何在不混淆真理的前提下，共同逼近世界”这一更高阶的规律。**
