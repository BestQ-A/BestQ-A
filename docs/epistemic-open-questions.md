# 认识论层未决类型问题：写 epistemic-contract.md 前必须钉死的清单

> 应 Clarity Ceiling 规则（见 [feedback_clarity_ceiling.md](../../../.claude/projects/e--1-agents-space-9-AGI-BestQ-A/memory/feedback_clarity_ceiling.md)）：抽象层模糊不得进合同。本文是对 [epistemic-axioms.md](epistemic-axioms.md) 的自我批判审计 + 必须在写 `docs/current/epistemic-contract.md` 之前解决的类型层未决问题清单。
> 状态：**待攻坚**。每一条问题单独开一轮对话深度讨论，有结论后回填本文并标注 RESOLVED。
> 生成日期：2026-04-13

---

## 0. 本文为什么存在

[epistemic-axioms.md](epistemic-axioms.md) §10 列了 6 条未决问题，但我在那份文档里把它们标为"暂缓"。按 Clarity Ceiling 规则这是不合法的——**类型层问题（对象定义、边界、命名空间、度量）的模糊一旦进合同，后续规模再大也救不回来 ceiling**。

本文的定位：不是给出答案，是把问题**磨到足够锋利以至于下一轮对话能被逐条钉死**。每个问题都要有：

1. 问题的精确陈述
2. 我上一版的含糊答案（自我审计）
3. 隐藏假设（我默认了什么但没论证？）
4. 错了会怎样（失败模式）
5. 候选答案（列 2–4 个，不选择，留给下一轮）
6. 裁决标准

---

## 1. 对 epistemic-axioms.md 的整体自我批判

在进入三个具体问题前，先审我自己写的那份哲学文档哪里模糊。

### 1.1 "两个闭环"可能是同一个闭环的两个视角

我写了"问题求解环 + 本体学习环"两个闭环并行。自我审计：**这两个真的是两个闭环吗？**

如果一次解题过程中同时 induction 新规则、同时更新老 case 的 fidelity、同时修 ontology，那它其实是一个闭环，从两个角度观察。把它说成两个闭环可能是**工程便利的伪装**——让我可以分两个模块去实现——但概念上是同一动作。

**失败模式**：如果真当两个闭环去实现，可能会出现"求解环没触发学习环"或"学习环没覆盖求解环产生的新 trace"的漂移。

**下一轮要回答**：是 **一环双层**（单一 loop，输出分结论层 / 重建层），还是 **双环强耦合**（两个独立 loop，通过共享 state 同步）？这决定了 pipeline-contract 的形状。

### 1.2 Fidelity 单调不降与自我修正相互矛盾

我在 [epistemic-axioms.md §12 不变量](epistemic-axioms.md#12-不变量) 写了"induction 前必须全量重放老 case，fidelity 单调不降才能晋升"。自我审计：**如果新 case 揭示老 regulation 本来就错了呢？**

这条规则强制 ontology 只能新增不能修正。但公理 B 要求"让本体模型更完备、更抽象、更系统"——这必然包含**删除 / 修改错误假设**。单调不降 ⇒ 不能修正 ⇒ 违反公理 B。

**失败模式**：
- 第一批 case 把错误规则锁进 ontology，后续正确 case 反而因"会让老 case fidelity 下降"被拒晋升
- 系统从"不断改进的学习系统"退化为"第一批数据决定终身的锁定系统"

**下一轮要回答**：正确约束应该是什么？候选：
- **(A) 带标签的单调**：fidelity 在"未被标记为错误"的老 case 上单调不降，允许显式标记老 case 为"过时"后豁免
- **(B) 全局 ELBO 式**：fidelity 的加权总和不降（允许某些 case 下降，只要总体涨）
- **(C) 版本化 ontology**：ontology 不 in-place 修改，每次变动产生新版本，老 case 绑定到创建时的版本号，fidelity 只在同版本内单调
- **(D) 两阶段**：induction 阶段允许任意变动，commit 阶段要求"核心不变量 case"（人工标注的金标准集）fidelity 单调

### 1.3 Reconstruction 是唯一出口 可能 过于强硬

我写"Reconstruction 是可逆建模的唯一出口"。自我审计：**唯一吗？**

Counterfactual prediction（给定条件预测未来而非还原过去）也是可逆建模的一种出口，我没有把它纳入。如果系统只能"还原过去"不能"预测未来"，那 ontology 的可逆性是残缺的。

**失败模式**：合同只规定 Reconstruction，未来要加 Counterfactual 时发现 `reconstruction.json` 的 schema 装不下，被迫破坏合同。

**下一轮要回答**：Reconstruction 是 `case → replay` 的单向还原，还是 `(conditions, ontology) → trajectory` 的一般化生成？如果是后者，名字应该改为 **Projection** 或 **Instantiation**，Reconstruction 只是它在"条件 = 历史条件"时的特例。

---

## 2. 问题一：Reconstruction 度量算法

### 2.1 问题陈述

给定一个历史 case 的 `(initial_conditions, original_trace, final_answer)` 和当前 ontology，如何计算"**当前 ontology 用 initial_conditions 重新展开能还原原 trace 主过程的程度**"？这个度量必须是：

- 可在 CI 上自动跑
- 对 100+ case 规模可承受
- **结构上对应"主过程"而非字面 trace 相等**（重建出不同但等价的推理链应得高分）
- 能区分"等价改写"与"错过关键因果节点"

### 2.2 我上一版的含糊答案

我写的是 "MVP = Jaccard of fired regulations set"。

**自我审计**：这是一个集合度量，不是 DAG 度量。它至少错在三处：

1. **丢了顺序与依赖**：`A→B→C` 和 `A→C→B` 在 Jaccard 下等价，但它们的因果结构完全不同
2. **丢了关键节点权重**：0.8 的 Jaccard 可能是"匹配了 80% 不重要的节点、漏了 20% 关键枢纽"
3. **无法识别等价改写**：用不同名字但同结构的 regulation 得 0 分

我标了"MVP" 想把它当脚手架。按 Clarity Ceiling 规则，这不是真的脚手架，是**我回避找正确度量的遮羞布**。

### 2.3 隐藏假设

我默认了"fidelity 是 trace-level 的相似度"。**这个默认本身可能是错的**。

另一种可能：fidelity 不是 trace 的相似度，而是**答案的可达性**——"用重建出的 trace 能不能推出原 trace 的 final_answer"。这是一个更本质的标准：不管 trace 怎么长，只要结论可达就算本体充分。

### 2.4 错了会怎样

- 如果用 Jaccard：低上限，ontology 一旦有"近义不同名"规则立刻失分，系统会倾向 rename 而非 restructure，退化为"命名游戏"
- 如果用 trace 相似度但定义不对"主过程"：系统优化无关的支线节点，核心推理反而被稀释
- 如果用答案可达性但只要 final_answer 匹配：系统学会"抄答案"——任何 trace 只要最后能吐出原答案就算赢，过程可以完全虚构

### 2.5 候选答案

- **(A) DAG 编辑距离**：把 original_trace 和 reconstructed_trace 都建成 DAG，计算图编辑距离归一化。严谨但慢，且"编辑成本"怎么定又是一个子问题
- **(B) 关键节点覆盖率**：人工或规则标注每个 case 的"枢纽节点"（通常是被 hypothesis_gate 采纳的 Mechanism），只看枢纽节点的覆盖。快但依赖标注
- **(C) 答案可达性**：只要 reconstructed_trace 能推出 original_final_answer 就算 1，否则 0。最简但最容易被 game
- **(D) 双指标组合**：`fidelity = α·key_node_coverage + (1-α)·answer_reachability`，前者防止抄答案，后者防止纠结次要节点
- **(E) 语义等价性**：两个节点"等价"当且仅当它们引用同一 Mechanism class（即使 Instance 不同）。需要先解决问题三（Class 命名空间）

### 2.6 裁决标准

下一轮对话挑选答案时必须回答：

1. 该度量能否识别 rename-attack（换个规则名字得分不应该变）
2. 该度量能否识别 skip-attack（跳过关键推理步得分应该掉）
3. 该度量能否识别 fabrication-attack（编造 trace 只为了 final_answer 匹配应该掉）
4. 该度量在 10/100/1000 case 规模下的成本是 O(n)、O(n²) 还是 O(n³)
5. 该度量是否依赖 Class 命名空间（若依赖则必须在问题三之后解决）

---

## 3. 问题二：Observation vs Evidence 双角色

### 3.1 问题陈述

同一条底层数据（例如一条日志片段）既可以是"被观察到的现象"（Observation），也可以是"支持/反驳某假设的证据"（Evidence）。它们在 7 对象集里是：

- **(a) 两个不同的一级对象类型**，同一条日志实体化两次？
- **(b) 同一个一级对象类型**，Evidence 只是 Observation 的一种角色标注？
- **(c) Observation 是对象，Evidence 是 Observation → Hypothesis 的类型化边（relation），不是对象？**

### 3.2 我上一版的含糊答案

我写的是 "角色是 trace step 的字段，不是对象本身的类型；同一底层 log 条目在 Observation 角色登记一次，作为 Evidence 引用时不复制实体只建引用边"。

**自我审计**：这个答案**回避了问题本身**。我说"Evidence 不复制实体"，意思是 Evidence 没有自己的独立 identity，但我又把它列在 7 对象集里作为一级对象——这是自相矛盾。如果 Evidence 没有独立 identity，它就不该是对象，它就是 Observation → Hypothesis 的边类型。

按 Clarity Ceiling 规则，**7 对象集其实可能该是 6 对象集 + 边类型 Evidence**。但我没敢这么写，因为用户在原始消息里明确把 Evidence 列在 7 个对象里。

这是我没把用户的原话当成"待批判的输入"而是"不可违抗的权威"。自我审计层面，这是错的——clarity-ceiling 的承载者不是用户的原话而是逻辑本身。

### 3.3 隐藏假设

我默认了"用户列出的最小对象集就是最终对象集"。**这个默认本身是反 Clarity Ceiling 的**：用户的原话是激发性的、未经批判的初版，合同层必须经过自我批判打磨。

另一个隐藏假设：我默认 "同一条 log 有两个角色" 是要解决的问题。但也许根本问题是另一个方向——**没有纯粹的 Observation**。任何记录下来的观察都已经带了"为什么记录"的意图，意图就是 Hypothesis 的影子。纯 Observation 是理想化的。

### 3.4 错了会怎样

- **如果当两类对象实体化**：log 数据双存，storage 膨胀 2 倍，且同步困难（原 log 修订了，evidence 副本不知道）
- **如果当一类对象 + trace 字段角色**：trace 查询时要每次在 "Evidence 视角" 和 "Observation 视角" 之间做 join，性能和代码复杂度同时涨
- **如果当 6 对象 + Evidence 边**：最干净，但意味着"边"也要有自己的 schema、id、生命周期、审计通道——这就把边也升格为某种次级对象，7 对象集变成"6 主对象 + N 边类型" 的两层结构

### 3.5 候选答案

- **(A) 实体化两次**：Evidence 是 Observation 的一个克隆副本，绑定到 Hypothesis。拒绝理由：双存
- **(B) 角色标注**：Evidence 不是对象，是 Observation 在 trace step 中的一个字段 `role: evidence_for[H]`。接近我原来的含糊答案
- **(C) Evidence 即边**：6 对象集 + Evidence 为 `Observation -[supports/refutes | weight]→ Hypothesis` 的类型化边。最干净
- **(D) 没有纯 Observation**：Observation 本身就是"带意图的记录"，Evidence 退化为"所有 Observation 都有的 hypothesis 指针" → 本体集压缩到 6 但语义变重
- **(E) 反向**：Hypothesis 持有对 Observation 的引用列表及每条引用的 weight/polarity，不引入 Evidence 类型。Evidence 不存在，只有 "Hypothesis.supporting_obs" 和 "Hypothesis.refuting_obs"

### 3.6 裁决标准

- 该答案下同一条 log 可否被两个 Hypothesis 共享为证据？（必须可以）
- 该答案下能否追溯"我为什么采信这条证据"（evidence 的评分与门控历史）？
- 该答案下 trace.jsonl 的 kind 枚举需要多少种 step？枚举越干净越好
- 该答案是否把 Observation 与 Hypothesis 变成了有周期的图？（必须避免）

---

## 4. 问题三：Class 命名空间治理

### 4.1 问题陈述

Class 是 7 对象集里最抽象的一类。谁有权创建 Class？如何处理同义 / 近义 Class？Class 之间是否有层级（上位类、继承）？Class 的身份由"成员实例集合"决定（extensional）还是"某个模式 / 约束"决定（intensional）？

### 4.2 我上一版的含糊答案

我写的是 "暂缓，等有第一批 Instance 后再定"。

**自我审计**：这是本轮最大的一次偷懒。类型层治理规则必须在运行时之前确定，Class 是类型层最核心的一环，"等实例出来了再定"等于 **让最早的数据决定类型系统**——这是工程上最糟糕的反模式，违反 Clarity Ceiling 最严重。

而且我写这句话时心里很清楚它不对，只是不想现场打开这个问题。这种自觉的回避在 Clarity Ceiling 规则下必须暴露出来。

### 4.3 隐藏假设

我默认了 "Class 是一个工程对象"。但 Class 是什么其实是一个**本体论问题**：

- **Extensional（外延）**：Class 是一组实例的集合。`C = {i₁, i₂, …}`。新实例加入等价于类的定义改变
- **Intensional（内涵）**：Class 是一个谓词或约束。`C = {x | P(x)}`。实例不影响类定义，只影响成员关系
- **Family Resemblance（维特根斯坦式）**：Class 没有本质特征，只有重叠的家族相似性
- **Prototype**：Class 由一个中心典型实例代表，其他实例按距离归属

这四种形而上学选择会导致**完全不同**的工程实现。我没选，就等于让工程实现随便挑一个默认——通常是最偷懒的 extensional——然后被锁定。

### 4.4 错了会怎样

- **Extensional 默认**：Class 的身份随实例集合变化，每次加 Instance 都在重定义 Class；fidelity 单调性立刻崩（旧 case 的 Class 变了）
- **Intensional 但无治理**：每个 induction 都可能提出新 Class，同义 Class 爆炸，retrieval 污染
- **Family Resemblance**：Class 的边界永远模糊，审计脚本无法给出 `kind: class` 的判定规则
- **Prototype 但无替换策略**：原型实例本身错了时没有修正机制

### 4.5 候选答案

- **(A) Intensional + Hypothesis 化治理**：Class 就是一条"模式 → 机制 cluster"的 Hypothesis，走与 regulation 同样的 induction→gate→promote 流程。Class 没有特权，它是 Hypothesis 的一种特殊形式。结果：类型层复用了推理层，Clarity 最高
- **(B) Extensional + 版本化**：Class 按 "创建时成员集合的 hash" 取身份，成员变动 → 新版本。老 case 引用老版本，新 case 引用新版本。结果：类型稳定但空间爆炸
- **(C) Prototype + 替换**：每个 Class 由一个原型 Instance 代表，后续 Instance 按"到原型的距离"归属。新 Instance 若距离 < 阈值则加入，若远于某阈值则提议创建新 Class。结果：直观但阈值选择变成新的类型层问题
- **(D) 禁用 Class**：放弃 Class 作为一级对象，所有抽象都通过 Mechanism + Relation 表达。极简但可能让 7 对象集减到 5-6，需要重写公理 B

### 4.6 裁决标准

- 该答案下两个 Class 可否合并（存在同义 Class 时）？合并的算子语义是什么？
- 该答案下 Class 是否可以修正（发现原来的分类错了）？
- 该答案下 Class 身份是否稳定（老 case 的 Class 引用不会因后续动作失效）？
- 该答案下 `contract-audit.mjs` 能否自动判定一个对象是不是 Class？（零交集要求自动可判定）
- 该答案下 Class 与 Mechanism 的边界如何？（一个抽象机制和一个机制 Class 如何区分）
- 该答案是否与 Class 与 Instance 强制分离的不变量（§12 不变量 3）一致？

### 4.7 RESOLVED — 2026-04-13

**结论：候选 A，精确化为"独立 `kind: class` + 谓词 = 合取查询 + 复用 Hypothesis gate 流水线"**

**关键精确化（A 的正确形式不是"Class 是 Hypothesis"）**：  
Class 是独立对象类型（`kind: class`），不与 `kind: hypothesis` 混淆（零交集维持）。但创建流程复用同一条 induction→gate→promote 流水线。

**Class schema 骨架**：
```jsonc
{
  "kind": "class",
  "id": "<predicate_canonical_hash>",
  "name": "python_none_attr_error",
  "predicate": {
    "observation_requires": ["obs:null_dereference"],
    "mechanism_active":     ["M_null_pointer_propagation"],
    "mechanism_absent":     [],
    "resolution_via":       { "hypothesis_kind": "H_missing_init", "gate": "accept" }
  },
  "promoted": true,
  "version": "1.0.0",
  "gate_history": [...]
}
```

**谓词语言约束**：合取查询（CNF），不允许谓词内析取（析取用 Class 层级表达）；谓词可引用其他已 promoted Class，但引用图必须是 DAG（promote 时 DFS 检测，发现环则拒绝）。

**合并语义**：
- 同义（谓词等价）→ 拒绝新建，新名作 alias 写入旧 Class
- 近义（P₁ ⊂ P₂）→ 自动形成子 Class 层级，由谓词蕴含推导，无需手工声明
- 无关合并 → 创建父 Class，谓词为 P₁ ∨ P₂

**Class 与 Mechanism 的边界**：Mechanism 是图的边（对象间关系，"A 导致 B"）；Class 是节点的类型谓词（"这个 Instance 属于哪类"）。因果方向：Mechanism 先于 Class——Class 谓词可引用"哪些 Mechanism 激活"，反向不成立。

**否决记录**：
- B rejected：修正语义缺失（只能加减实例不能改语义），版本追踪使审计复杂
- C rejected：原型即 Instance，违反 Class/Instance 强制分离；身份不稳定（改原型 → 全部归属重算）
- D rejected：技术上通过六条标准，但破坏公理 B 的抽象步骤和本体学习环的归类入口，ontology 只能横向扩宽无法纵向加深

**遗留子问题（不阻塞问题二）**：Class 谓词引用其他 Class 时的 DAG 循环检测如何在 `contract-audit.mjs` 中实现？暂定：promote 时做 DFS，发现环则拒绝，候选打回草稿区。具体实现推迟到 epistemic-contract.md 编写时。

---

## 5. 决议顺序

这三个问题之间有依赖：

```
问题三（Class 命名空间治理）
    ↓
问题二（Observation / Evidence 角色）
    ↓
问题一（Reconstruction 度量算法）
```

**问题三必须先解决**，因为：

- 问题一的候选 (E) "语义等价性" 依赖 Class 命名空间
- 问题二的候选 (C) "Evidence 即边" 下，边的类型本身可能需要被 Class 化
- 7 对象集的几乎所有对象都要回答"它们的类型由什么定义"，这是问题三的同一个问题

解决顺序建议：

1. **第 N+1 轮对话**：攻问题三，决定 Class 的形而上学 + 治理规则
2. **第 N+2 轮对话**：攻问题二，在问题三结论约束下决定 Observation/Evidence 的本体地位
3. **第 N+3 轮对话**：攻问题一，在前两者结论约束下选择 Reconstruction 度量
4. **第 N+4 轮对话**：回头处理 §1 的两个整体自我批判（两闭环 / fidelity 单调 / Reconstruction 唯一性）
5. **第 N+5 轮对话及以后**：开始写 `docs/current/epistemic-contract.md`

---

## 6. 本文的使用方式

- 每一轮攻坚开始时，对应问题的 6 小节须 **整段复制** 到工作对话作为输入
- 攻坚结束时，该问题小节追加 `### 2.7 RESOLVED` 段落，写定答案 + 决策理由
- 被否决的候选答案**不删除**，标注 `rejected because ...`，保留全部理由链作为未来修订参考
- 新发现的类型层问题追加到本文末尾而非散落各处
- 本文在所有问题 RESOLVED 前，`docs/current/epistemic-contract.md` **不得写** —— 这是硬约束

---

## 7. 与现有文档的关系

| 文档 | 关系 |
|---|---|
| [epistemic-axioms.md](epistemic-axioms.md) | 本文是其 §10 未决问题的深化 + 自我批判，解决后回填其 §10 为 RESOLVED |
| [trace-and-fidelity-axioms.md](trace-and-fidelity-axioms.md) | 已 superseded；本文的问题一结论会决定其 §3.2 schema 能否升级 |
| [current/hypothesis-contract.md](current/hypothesis-contract.md) | 问题二候选 (E) 会影响 Hypothesis schema |
| [current/memory-layer-contract.md](current/memory-layer-contract.md) | 问题三结论会影响 Class 与 Instance 的存储边界 |
| [current/file-taxonomy-contract.md](current/file-taxonomy-contract.md) | 问题三候选 (A) 与其零交集 + 强制分类原则完全同构 |
| [bestqa-roadmap.md](bestqa-roadmap.md) | Phase 1 Exit 推迟到本文全部 RESOLVED 之后 |
