---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "四空间世界模型引擎"
superseded_by: v7-world-model-contract.md
---

# v6 世界模型合同：世界采样与过程重建引擎

> **本合同已被 [v7-world-model-contract.md](v7-world-model-contract.md) 取代**（2026-04-13）。
> 保留原因：v6 仍代表“关系法律内核 + 四空间 world model”的重要中间设计，不应删除。

> 本合同把 BestQ-A 的认识论目标从 v1–v5 的"平铺对象列表 + 两闭环"升级为**四空间正交架构 + 14 基础单元 + 7 步显式算子链**。
> 核心主张：系统不是 answer generator，是 **evidence-driven world sampler + process reconstructor**。答案不是核心资产，推导链才是核心资产。
> 上游哲学层：[`../epistemic-axioms.md`](../epistemic-axioms.md)
> 被取代的旧版：[`epistemic-contract.md`](epistemic-contract.md)（7 对象集 + 2 闭环）
> 上游依赖：[`metamodel.md`](metamodel.md)、[`pipeline-contract.md`](pipeline-contract.md)、[`hypothesis-contract.md`](hypothesis-contract.md)、[`compile-promotion-contract.md`](compile-promotion-contract.md)

---

## §0 一句定义

**BestQ-A 不是做一个会说的系统，而是做一个会取样、会建模、会重建、会更新本体的系统。**

<!-- rationale: 来自 epistemic-axioms.md §8 收尾定义。系统的中心从"生成答案"转为"积累可重建世界的结构化知识，并在此基础上生成答案"。 -->

---

## §1 四空间定义

v1–v5 把所有对象平铺在一个列表里（Observation / Evidence / Hypothesis / Mechanism / Class / Instance / Reconstruction）。v6 做出根本性结构升级：将所有基础单元组织进四个正交空间，每个空间有独立的关注点、独立的不变量、独立的审计规则。

<!-- rationale: 因为平铺列表无法表达"对象之间属于不同逻辑维度"的事实——Observation 和 MechanismClass 不在同一个抽象层级上，把它们平铺在一起会导致对象间边界模糊、审计规则无法分层。所以四空间正交取代平铺。 -->

### §1.A Ontology Space（本体空间）

**关注点**：世界是什么样的——实体、属性、关系、机制的抽象结构。

**基础单元**：

| 单元 | 定义 |
|------|------|
| `Entity` | 世界中可被独立识别的对象（硬件组件、软件模块、概念） |
| `Attribute` | Entity 的可观测性质（状态、参数、阈值） |
| `Relation` | 两个 Entity 或 Attribute 之间的结构性联系（因果、依赖、组合） |
| `MechanismClass` | 可回放的因果过程模板——从条件到结果的完整机制链（见 §4） |

**不变量**：

- Ontology Space 中的对象描述**世界本身**，不描述某次具体经历
- `MechanismClass` 必须可回放（latent_phases / observable_signatures / intervention_points 三要素齐全，见 §4）
- 单个 Episode 禁止直接建 `MechanismClass`（见 §7 晋升门槛）
- `Relation` 必须有类型（`causes` / `requires` / `indicates` / `fixes` 等），与 RefAlgebra 四族对齐

### §1.B Episode Space（经历空间）

**关注点**：世界在某个局部状态下的一次具体展开——条件、现象、过程、结果。

**基础单元**：

| 单元 | 定义 |
|------|------|
| `Episode` | 一次完整经历的轨迹容器——从初始条件到最终结果的有序时间线（见 §5） |
| `ObservationRecord` | 某次 Episode 中被观察到的具体现象，不带解释 |
| `ContextSnapshot` | Episode 发生时的环境快照（技术栈、版本、配置、时间窗口） |

**不变量**：

- Episode 必须是**轨迹**（timeline + transitions），不是 bag of observations（见 §5）
- `ObservationRecord` 只陈述"看到了什么"，不得包含解释或结论
- `ContextSnapshot` 一旦落盘不可修改——它是 Episode 的环境标签
- 每个 `ObservationRecord` 必须归属且仅归属一个 `Episode`

### §1.C Claim Space（断言空间）

**关注点**：系统对世界的判断——提议、接受、拒绝、取代。

**基础单元**：

| 单元 | 定义 |
|------|------|
| `Claim` | 一条关于世界的显式断言，携带状态标签（proposed / accepted / rejected / superseded） |
| `SupportLink` | 从 `ObservationRecord` 到 `Claim` 的支持关系——表示"这条观察支持/反驳这条断言" |
| `ConfidenceScore` | `Claim` 的结构化置信度——不来自 LLM 语气词，而来自 `SupportLink` 的数量、一致性、可重复性 |

**不变量**：

- `Claim.status` 状态机：`proposed → accepted | rejected`，`accepted → superseded`；不可逆转（`rejected → proposed` 禁止）
- `ConfidenceScore` 必须可追溯到具体的 `SupportLink` 集合，禁止裸数字
- 每个 `SupportLink` 必须标注 polarity（`supports` / `contradicts`）

### §1.D Derivation Space（推导空间）

**关注点**：系统如何从已知信息推出新断言——推导链、重建结果、本体更新。

**基础单元**：

| 单元 | 定义 |
|------|------|
| `DerivationChain` | 从一组前提 `Claim` 到一个结论 `Claim` 的有序推导步骤序列 |
| `Reconstruction` | 给定 Episode 的初始条件 + 当前 Ontology，重建该 Episode 主要发生过程的结构化结果 |
| `OntologyDelta` | 一次 Episode 对 Ontology Space 产生的结构化修正（新增/修改/删除哪些 Entity/Relation/MechanismClass） |

**不变量**：

- `DerivationChain` 的每一步必须可独立回放验证——任一步骤 `audit_replayable: false` 即红灯
- `Reconstruction` 不是 retrieval（从库里找最像的 case），是**用当前 Ontology 重新生成 Episode 的主过程**，再与原始轨迹对比
- `OntologyDelta` 必须与求解结果绑定——系统不得把"求解成功"和"世界模型更新"分成两个互不相干的副作用
- 每个已完成 Episode 都必须产生 `OntologyDelta` 或 `NoUpdateReason`

---

## §2 角色剥离表

v1–v5 把 Evidence、Hypothesis、Conclusion 当作独立的一等对象类型。v6 做出根本性认知修正：这些不是独立对象，而是**角色**——由更基础的单元通过关系和状态标签来表达。

<!-- rationale: 因为 Evidence 的本质是"一条 ObservationRecord 支持某条 Claim"的关系，不是独立存在的对象。把它实体化两次（既存为 Observation 又存为 Evidence）会导致双存、同步困难。同理，Hypothesis 和 Conclusion 只是 Claim 在不同状态下的别名。角色从对象中剥离，是 epistemic-open-questions.md §3 问题二的最终结论。 -->

| 旧名（v1–v5） | 本质 | v6 表达 |
|----------------|------|---------|
| `Evidence` | ObservationRecord 对 Claim 的支持关系 | `SupportLink`（ObservationRecord → Claim，polarity + weight） |
| `Hypothesis` | 状态为 proposed 的断言 | `Claim` where `status = proposed` |
| `Conclusion` | 状态为 accepted 的断言 | `Claim` where `status = accepted` |
| `Rejected Alternative` | 状态为 rejected 的断言 | `Claim` where `status = rejected`（必须保留，不得丢弃） |
| `Observation` | 具体现象记录 | `ObservationRecord`（归属 Episode） |
| `Instance` | 一次具体经历 | `Episode`（轨迹容器） |
| `Class` | 机制的抽象模板 | `MechanismClass`（可回放规格） |
| `Mechanism / Relation` | 实体间的结构性联系 | `Relation`（在 Ontology Space 中） |
| `Reconstruction` | 过程重建结果 | `Reconstruction`（在 Derivation Space 中） |
| `OntologyUpdate` | 本体修正 | `OntologyDelta`（在 Derivation Space 中） |

---

## §3 基础单元集（14 个）

四空间共 14 个基础单元，分为两组：Truth primitives（描述世界本身）和 Reasoning primitives（描述系统如何认识世界）。

<!-- rationale: 因为"世界是什么"和"系统如何认识世界"是两个正交维度。把它们混在一起会导致本体论和认识论纠缠——修改一条推导规则时不小心改了世界模型，或者修改世界模型时破坏了推导链的完整性。所以必须分组。 -->

### Truth Primitives（8 个）——描述世界本身

| # | 单元 | 所属空间 | 一行定义 | 不等于什么 |
|---|------|---------|---------|-----------|
| T1 | `Entity` | Ontology | 世界中可被独立识别的对象 | 不等于 Atom——Atom 是图存储层的物理节点，Entity 是逻辑层的本体对象 |
| T2 | `Attribute` | Ontology | Entity 的可观测性质 | 不等于 tag/label——Attribute 有值域和约束，tag 没有 |
| T3 | `Relation` | Ontology | 两个 Entity/Attribute 之间的结构性联系 | 不等于 Ref——Ref 是图存储层的物理边，Relation 是逻辑层的语义联系 |
| T4 | `MechanismClass` | Ontology | 可回放的因果过程模板 | 不等于 ProblemClass——ProblemClass 是路由器（"这是什么类型的问题"），MechanismClass 是过程模板（"这个过程怎么发生的"） |
| T5 | `Episode` | Episode | 一次完整经历的轨迹容器 | 不等于 Story——Story 是当前代码的学习样本容器，Episode 是 v6 的带时间线的轨迹 |
| T6 | `ObservationRecord` | Episode | 某次经历中被观察到的具体现象 | 不等于 Evidence——Evidence 是角色（支持某断言），ObservationRecord 是裸现象 |
| T7 | `ContextSnapshot` | Episode | Episode 发生时的环境快照 | 不等于 ContextScope——ContextScope 是当前代码的条件谓词接口，ContextSnapshot 是 v6 中 Episode 级别的不可变环境标签 |
| T8 | `Claim` | Claim | 关于世界的显式断言 | 不等于 Hypothesis——Hypothesis 是 Claim 在 status=proposed 时的别名 |

### Reasoning Primitives（6 个）——描述系统如何认识世界

| # | 单元 | 所属空间 | 一行定义 | 不等于什么 |
|---|------|---------|---------|-----------|
| R1 | `SupportLink` | Claim | ObservationRecord → Claim 的支持/反驳关系 | 不等于 Evidence 对象——Evidence 在 v1–v5 是独立实体，SupportLink 是边（关系） |
| R2 | `ConfidenceScore` | Claim | Claim 的结构化置信度 | 不等于 LLM 输出的概率——ConfidenceScore 必须可追溯到 SupportLink 集合 |
| R3 | `DerivationChain` | Derivation | 从前提到结论的有序推导步骤序列 | 不等于 Shortcut——Shortcut 是图缓存，DerivationChain 是可审计的推理过程 |
| R4 | `Reconstruction` | Derivation | 用当前 Ontology 重建 Episode 主过程的结果 | 不等于 retrieval——retrieval 从库里找最像的 case，Reconstruction 用 Ontology 重新生成过程 |
| R5 | `OntologyDelta` | Derivation | Episode 对 Ontology Space 的结构化修正 | 不等于 compile side effect——compile 是图存储层操作，OntologyDelta 是逻辑层的显式本体更新 |
| R6 | `NoUpdateReason` | Derivation | 当 Episode 不产生本体修正时的显式理由 | 不等于空值——必须有结构化理由说明为什么没有更新 |

---

## §4 MechanismClass 可回放规格

MechanismClass 是 Ontology Space 中最复杂的单元。它不是标签，不是分类，是**可回放的因果过程模板**。

<!-- rationale: 因为如果 MechanismClass 只是一个名字（如"空指针异常类"），系统无法用它重建过程——它只能做 retrieval（找最像的 case），做不了 Reconstruction（从机制出发生成过程）。可回放要求 MechanismClass 携带足够的结构信息：哪些阶段不可直接观测但必须存在（latent_phases），哪些现象可以被观测到（observable_signatures），哪些节点可以被干预（intervention_points）。 -->

```yaml
MechanismClass:
  id: "MC_gaze_geometric_degradation"
  name: "注视估计几何退化机制"
  version: "1.0.0"
  
  # 谓词：定义成员资格（intensional，非 extensional）
  predicate:
    observation_requires:
      - "obs:gaze_error_exceeds_threshold"
      - "obs:geometric_parameter_drift"
    mechanism_active:
      - "M_eye_model_parameter_instability"
    mechanism_absent:
      - "M_illumination_failure"
    resolution_via:
      hypothesis_kind: "H_recalibrate_geometric_model"
      gate: "accept"

  # 潜在阶段：不可直接观测但必须存在的中间过程
  latent_phases:
    - phase_id: "LP1"
      name: "参数漂移积累"
      description: "眼球模型几何参数在多次采样中逐渐偏离标定值"
      duration_estimate: "minutes_to_hours"
      detectable_by: "参数趋势分析"
    - phase_id: "LP2"
      name: "误差放大"
      description: "漂移超过阈值后非线性放大注视估计误差"
      duration_estimate: "immediate"
      detectable_by: "residual 突增检测"

  # 可观测特征：可以被外部观察到的现象
  observable_signatures:
    - sig_id: "OS1"
      name: "注视误差超阈值"
      observation_kind: "gaze_error_metric"
      typical_range: "> 2 degrees"
      mandatory: true
    - sig_id: "OS2"
      name: "几何参数偏移"
      observation_kind: "parameter_drift_metric"
      typical_range: "> 3 sigma from calibration"
      mandatory: true
    - sig_id: "OS3"
      name: "时间相关性"
      observation_kind: "error_temporal_pattern"
      typical_range: "monotonic increase over session"
      mandatory: false

  # 干预点：可以被外部干预以验证或修复的节点
  intervention_points:
    - point_id: "IP1"
      name: "重标定"
      action: "重新执行几何标定流程"
      expected_outcome: "误差恢复到标定精度"
      validates_mechanism: true
    - point_id: "IP2"
      name: "参数冻结"
      action: "锁定几何参数为标定值不允许自适应更新"
      expected_outcome: "误差不再随时间增长但可能偏高"
      validates_mechanism: false

  # 晋升历史
  promoted: true
  promotion_evidence:
    episode_count: 3
    min_required: 2
    gate_history:
      - episode_id: "EP_20260401_001"
        outcome: "mechanism_confirmed"
        date: "2026-04-01"
      - episode_id: "EP_20260405_002"
        outcome: "mechanism_confirmed"
        date: "2026-04-05"
      - episode_id: "EP_20260410_003"
        outcome: "symptom_relieved"
        date: "2026-04-10"
```

**MechanismClass 三要素不变量**：

| 要素 | 作用 | 缺失时的后果 |
|------|------|-------------|
| `latent_phases` | 表达"不可直接观测但必须存在的中间过程" | 机制退化为黑箱——知道 input→output 但不知道中间发生了什么，无法 debug |
| `observable_signatures` | 表达"可以被外部观察到的现象" | 机制无法被验证——不知道应该观察什么来确认机制是否激活 |
| `intervention_points` | 表达"可以被外部干预以验证或修复的节点" | 机制无法被证伪——不知道干预哪里可以确认/排除该机制 |

---

## §5 Episode 轨迹规格

Episode 必须是轨迹（timeline + transitions），不是 bag of observations。

<!-- rationale: 因为 bag of observations 丢失了时序信息——"先看到 A 再看到 B"和"同时看到 A 和 B"在因果推理中完全不同。如果 Episode 只是一堆观察的集合，系统无法区分因果序列和共现巧合，Reconstruction 的回放就没有时间锚点。 -->

```yaml
Episode:
  id: "EP_20260413_001"
  
  # 初始条件
  initial_conditions:
    context: # ContextSnapshot
      env: "lab"
      stack: ["eye_tracker_v3", "calibration_module_v2"]
      version: "firmware_3.1.2"
      project: "vrsk_gaze"
    trigger: "用户报告注视精度下降"
  
  # 有序时间线
  timeline:
    - step: 1
      timestamp: "2026-04-13T10:00:00Z"
      kind: "observation"
      record_id: "OR_001"
      content: "注视误差在最近 30 分钟内从 0.8° 上升到 2.5°"
    - step: 2
      timestamp: "2026-04-13T10:05:00Z"
      kind: "observation"
      record_id: "OR_002"
      content: "几何标定参数 cornea_radius 偏移 +0.3mm（超出 3σ）"
    - step: 3
      timestamp: "2026-04-13T10:10:00Z"
      kind: "claim_proposed"
      claim_id: "CL_001"
      content: "提议：几何参数漂移导致注视精度退化"
      support_links: ["SL_001(OR_001→CL_001, supports)", "SL_002(OR_002→CL_001, supports)"]
    - step: 4
      timestamp: "2026-04-13T10:15:00Z"
      kind: "intervention"
      action: "执行重标定"
      result: "注视误差恢复到 0.9°"
    - step: 5
      timestamp: "2026-04-13T10:20:00Z"
      kind: "claim_accepted"
      claim_id: "CL_001"
      outcome: "mechanism_confirmed"
  
  # 状态转移序列
  transitions:
    - from_step: 1
      to_step: 2
      relation: "temporal_sequence"
      note: "观察到误差后检查参数"
    - from_step: 2
      to_step: 3
      relation: "inference"
      note: "从参数偏移推出几何退化假设"
    - from_step: 3
      to_step: 4
      relation: "intervention_test"
      note: "用重标定来验证假设"
    - from_step: 4
      to_step: 5
      relation: "confirmation"
      note: "干预成功确认机制"
  
  # 已接受的重建结果（Reconstruction 的输出）
  accepted_reconstruction:
    mechanism_class_id: "MC_gaze_geometric_degradation"
    reconstructed_chain:
      - "LP1(参数漂移积累) → OS1(误差超阈值) → OS2(参数偏移) → IP1(重标定) → 恢复"
    fidelity_score: 0.92
    fidelity_method: "key_node_coverage"
  
  # 未解决的未知项
  unresolved_unknowns:
    - "漂移速率是否与环境温度相关？"
    - "LP1 阶段的精确持续时间未测量"
  
  # 本体增量
  ontology_delta:
    kind: "applied"
    changes:
      - action: "strengthen"
        target: "Relation(cornea_radius_drift → gaze_error_increase)"
        evidence: "EP_20260413_001 确认了因果方向"
      - action: "add_attribute"
        target: "Entity(geometric_model)"
        attribute: "drift_rate_per_session"
        note: "新发现的可观测属性，待后续 Episode 量化"
```

**Episode 不变量**：

| 不变量 | 说明 |
|--------|------|
| timeline 有序 | step 编号严格递增，timestamp 不可逆 |
| 每步 kind 属于枚举 | `observation` / `claim_proposed` / `claim_accepted` / `claim_rejected` / `intervention` / `derivation` |
| transitions 引用合法 | from_step 和 to_step 必须是 timeline 中存在的 step |
| accepted_reconstruction 可选 | Episode 可以暂无 Reconstruction，但最终必须有 |
| ontology_delta 必填 | 已完成的 Episode 必须有 `ontology_delta`（哪怕是 `kind: none, reason: "..."`） |
| unresolved_unknowns 显式 | 已知不知道的东西必须显式列出，禁止假装全知 |

---

## §6 运行时 7 步显式算子链

v1–v5 的 Pipeline 是隐式的"submitObservation → explore → compile"三步。v6 升级为 7 步显式算子链，每步有明确的输入、输出和约束。

<!-- rationale: 因为三步隐式 Pipeline 缺少对"目标设定"、"检索"、"绑定"、"评分"这些关键中间步骤的显式管控。LLM 在隐式步骤中做了太多无法审计的决策（比如直接跳到结论而不显式列出候选），导致推导链断裂。7 步算子链把每个决策点暴露为可审计的显式步骤。 -->

| Step | 名称 | 输入 | 输出 | 约束 |
|------|------|------|------|------|
| **S1** | 目标设定 | 用户请求 / 系统触发 | `Goal`：待回答的问题 + 成功标准 | Goal 必须是可证伪的——必须定义"什么情况算回答了" |
| **S2** | 世界采样 | Goal + 当前 Ontology Space | 候选 `ObservationRecord` 集合 | 采样必须是显式的——列出"看了什么"和"没看什么"；不得假装看了没看的数据 |
| **S3** | 知识检索 | ObservationRecord 集合 + Ontology Space | 候选 `MechanismClass` + 候选 `Relation` 集合 | 检索范围受 ProblemClass 路由约束（缩小子图）；必须记录"检索了哪些区域、跳过了哪些区域" |
| **S4** | 候选绑定 | ObservationRecord × MechanismClass | 候选 `Claim`（status=proposed）集合 + `SupportLink` 集合 | 每条 Claim 必须绑定至少一条 SupportLink；LLM 在此步只做**绑定提议者**，不做裁决者 |
| **S5** | 评分与排序 | Claim 集合 + SupportLink 集合 | 排序后的 Claim 列表 + `ConfidenceScore` | ConfidenceScore 必须来自结构证据（SupportLink 数量、一致性、mechanism 稳定性），不得来自 LLM 语气词 |
| **S6** | 过程重建 | 最优 Claim + 关联 MechanismClass + Episode 初始条件 | `Reconstruction` + `DerivationChain` | Reconstruction 的每一步必须 `audit_replayable: true`；重建结果必须与原始 Episode timeline 对比计算 fidelity |
| **S7** | 本体更新 | Reconstruction + 现有 Ontology | `OntologyDelta` / `NoUpdateReason` | 新增 MechanismClass 必须满足晋升门槛（§7）；fidelity 在"未被标记为错误"的老 Episode 上不得下降 |

**7 步不变量**：

- 每一步的输出必须落盘为可审计对象——跳过任何一步等于推导链断裂
- S4 的 LLM 参与严格受限于"提议绑定"，不得在 S4 直接输出 accepted Claim
- S5 的评分不得使用 LLM 自评的置信度——必须有独立于 LLM 的结构化评分
- S6 是本合同区别于普通 RAG 的核心——没有 Reconstruction，系统就只有 retrieval，没有"过程重建"
- S7 的 fidelity 约束使用**带标签的单调**策略：在"未被标记为错误"的老 Episode 上单调不降，允许显式标记老 Episode 为"过时"后豁免

<!-- rationale: fidelity 单调不降与自我修正的矛盾（见 epistemic-open-questions.md §1.2）的解决方案选择了候选 A——带标签的单调。因为纯单调会导致错误规则被锁进 ontology（第一批 case 决定终身），而全局 ELBO 式又允许个别 case 被牺牲。带标签的单调是最佳折衷：允许显式声明"这个老 case 本身是错的"，然后在正确 case 集合上保持单调。 -->

---

## §7 晋升门槛

从 Episode 到 MechanismClass 的晋升不是自动的。单次经历的"因果解释"只是候选，必须经过多次 Episode 的交叉验证才能晋升为本体层的稳定结构。

<!-- rationale: 因为单次经历可能是巧合——"这次重标定修好了"不等于"所有类似问题都是几何退化"。如果允许单个 Episode 直接建 MechanismClass，系统会快速积累大量低质量的"一次性因果解释"，Ontology Space 退化为 case memory 的重新包装。 -->

| 条件 | 单次 Episode 允许 | 单次 Episode 不允许 | 晋升最低条件 |
|------|------------------|-------------------|-------------|
| 提出候选 Claim（status=proposed） | ✅ | — | — |
| 接受 Claim（status=accepted） | ✅ | — | 至少 1 条 SupportLink + intervention outcome ≥ symptom_relieved |
| 强化已有 Relation 的权重 | ✅ | — | Claim.status = accepted |
| **创建新 MechanismClass** | ❌ | ✅ | ≥ 2 个 Episode 的 accepted Claim 指向同一因果结构 |
| **修改 MechanismClass 的 latent_phases** | ❌ | ✅ | ≥ 1 个 Episode + 原 MechanismClass 作者审批（人工或自动门控） |
| **删除 MechanismClass** | ❌ | ✅ | 显式反例 Episode + fidelity 不受损证明 |

**晋升门控流水线**（与 Hypothesis 合同的 canPromote 门控同构）：

```
候选 MechanismClass
  → 检查 episode_count ≥ 2
  → 检查每个 Episode 的 outcome ≥ symptom_relieved
  → 检查 latent_phases / observable_signatures / intervention_points 三要素齐全
  → 检查与现有 MechanismClass 无谓词等价冲突（同义则合并，近义则建层级）
  → 通过 → promote
  → 不通过 → 打回草稿区，保留候选记录
```

<!-- rationale: 谓词等价检测复用 epistemic-open-questions.md §4.7 RESOLVED 的结论——同义（谓词等价）→ 拒绝新建，新名作 alias 写入旧 Class；近义（P₁ ⊂ P₂）→ 自动形成子 Class 层级，由谓词蕴含推导。 -->

---

## §8 LLM 降级条款

LLM 在 v1–v5 中的角色过于宽泛——从问题理解到因果判断到结论输出全程参与，导致推导链不可审计。v6 严格限制 LLM 的角色为三种：提议者、绑定器、摘要器。

<!-- rationale: 因为 LLM 的核心问题不是"偶尔错"，而是"错了没有资产沉淀"——今天这样答、明天那样答，中间缺少可复查、可复用、可改进的结构。如果让 LLM 做裁决者，系统的推导链就退化为 LLM 的内部统计分布，不可审计、不可复用、不可改进。 -->

| LLM 角色 | 允许做 | 不可以做 |
|----------|--------|---------|
| **提议者**（Proposer） | 在 S4 提出候选 Claim 和 SupportLink 绑定 | 不可以直接输出 accepted Claim——必须经评分（S5）和门控 |
| **绑定器**（Binder） | 在 S3 将 ObservationRecord 与候选 MechanismClass 关联 | 不可以创建新 MechanismClass——必须走晋升门槛（§7） |
| **摘要器**（Summarizer） | 在最终输出时将 accepted Claim + Reconstruction 转为人类可读结论 | 不可以添加 Reconstruction 中不存在的因果声明——摘要必须是推导链的子集 |

**LLM 降级不变量**：

- `kind: llm_propose` 的推导步骤不得直接产出 accepted Claim 或 compiled Relation
- LLM 提议的每条 Claim 必须带 `rationale_ref` 指向可独立验证的依据
- LLM 的置信度自评**不计入** ConfidenceScore——ConfidenceScore 只来自 SupportLink 的结构化计算
- 任何 LLM 输出必须经过至少一次非 LLM 的验证步骤（门控、回放、或人工确认）才能进入 Ontology Space

---

## §9 与 v1–v5 的关系

v6 不是推翻 v1–v5，是在更高抽象层对其进行类型系统包覆。

<!-- rationale: 因为 v1–v5 已经建立了大量可用的工程实现（Atom/Ref/Shortcut 图、RefAlgebra 复合规则、PatternTemplate 模式匹配、Pipeline 编排）。如果 v6 要求全部重写，过渡成本不可承受。正确的做法是：v1–v5 的实现保留为物理存储层和编排层，v6 在其上添加逻辑类型层。 -->

| v1–v5 概念 | v6 中的地位 | 继承声明 |
|------------|-----------|---------|
| **Atom/Ref/Shortcut 图** | 保留为**物理存储层** | v6 的 14 个基础单元最终物化为 Atom/Ref，但逻辑层通过类型系统（Entity / Relation / Claim 等）包覆物理层 |
| **RefAlgebra** | 保留为**复合规则引擎** | v6 的 Relation 复合仍由 RefAlgebra 执行，四族分类（structural / explanatory / evidential / interventional）不变 |
| **PatternTemplate** | 保留为**模式匹配引擎** | v6 的 MechanismClass 在匹配时复用 PatternTemplate 的 SlotFingerprint + InvariantCheck |
| **ProblemClass** | 降为**接口视图** | ProblemClass 不再是一等本体对象，而是 MechanismClass 的路由投影——"这个问题可能涉及哪些 MechanismClass"的快捷查询 |
| **Strategy** | 保留为**理解协议** | v6 的 S1–S3（目标设定、世界采样、知识检索）对应 Strategy 的 classify→contextualize→constrain 步骤 |
| **Skill** | 保留为**执行能力** | v6 的 S6 重建和 S7 更新可能触发 Skill 执行 |
| **Story** | 升级为 **Episode** | Story 的状态机（open→resolved→archived）保留，但 Episode 增加了 timeline / transitions / accepted_reconstruction |
| **Evidence** | 降为 **SupportLink** | Evidence 的 append-only 语义保留，但不再是独立一等对象——降为 ObservationRecord→Claim 的边 |
| **Hypothesis** | 降为 **Claim.status=proposed** | Hypothesis 合同的状态机（open→validated→rejected→superseded）映射为 Claim 的 status 流转 |
| **Pipeline（explore/compile）** | 保留但被**更高类型包覆** | explore 对应 S2–S4，compile 对应 S6–S7；Pipeline 仍是编排器，但每步的输入输出类型由 v6 的 14 基础单元约束 |
| **RegulationView** | 保留为**只读投影** | RegulationView 仍从 compiled Ref 投影，但逻辑层新增 MechanismClass 视图作为更高层投影 |
| **ContextScope** | 保留为 **ContextSnapshot 的物理实现** | ContextScope 接口（env/stack/version/project）直接作为 ContextSnapshot 的 schema |

---

## §10 与现有代码的映射

本节对每个 v6 基础单元说明"现有最接近对象 + 现状判断"。

### Ontology Space

| v6 基础单元 | 当前最接近对象 | 现状判断 |
|------------|--------------|---------|
| `Entity` | `Atom`（kind=FACT/CONCEPT） | Atom 是物理节点，可作为 Entity 的存储载体，但缺少"Entity 是逻辑层对象"的类型标注。**需新增 Entity 类型层** |
| `Attribute` | `Atom`（kind=CONTEXT）+ `ContextScope` 的字段 | 分散在两处，无统一 Attribute schema。**需统一** |
| `Relation` | `Ref`（kind + force + contextScope） | Ref 已有丰富的类型系统（四族 + force + evidencePolicy），可直接作为 Relation 的物理实现。**基本对齐，需加逻辑类型标注** |
| `MechanismClass` | `PatternTemplate` + `ProblemClass` 的组合 | PatternTemplate 有 slots/arrows/invariants，接近 MechanismClass 的匹配能力。但缺少 latent_phases / observable_signatures / intervention_points 三要素。ProblemClass 有分类路由但缺少可回放规格。**需重大升级** |

### Episode Space

| v6 基础单元 | 当前最接近对象 | 现状判断 |
|------------|--------------|---------|
| `Episode` | `Story`（id + rawInput + candidatePaths + chosenPath + outcome） | Story 有完整生命周期，但缺少 timeline（有序步骤）和 transitions（步骤间关系）。**需升级为轨迹结构** |
| `ObservationRecord` | `Atom`（kind=FACT）+ `core/types.ts` 中的 `Observation` | 已有一等对象基础，但未与 Episode 强绑定。**需加 episode_id 外键** |
| `ContextSnapshot` | `ContextScope`（core/story.ts 中的接口 + 工具函数） | 已有 scopeContains/Overlaps/Merge。**基本对齐，需升级为 Episode 级别的不可变快照** |

### Claim Space

| v6 基础单元 | 当前最接近对象 | 现状判断 |
|------------|--------------|---------|
| `Claim` | `Hypothesis`（core/hypothesis.ts） | Hypothesis 有状态机（open→validated→rejected→superseded），与 Claim 的 status 流转同构。**需改名或加别名** |
| `SupportLink` | `Evidence`（core/evidence.ts）+ `Hypothesis.validatedByEvidenceIds` | Evidence 是 append-only 对象，但与 Hypothesis 的关联是通过 ID 列表而非显式边。**需重构为显式边类型** |
| `ConfidenceScore` | `Hypothesis.confidence`（数字字段） | 存在但缺少"可追溯到 SupportLink 集合"的结构化计算。**需从裸数字升级为结构化对象** |

### Derivation Space

| v6 基础单元 | 当前最接近对象 | 现状判断 |
|------------|--------------|---------|
| `DerivationChain` | `HypothesisDerivation[]`（hypothesis.ts）+ trace 概念（epistemic-axioms.md） | Hypothesis 有 derivation 步骤，但不是完整的从前提到结论的推导链。**需升级** |
| `Reconstruction` | 无显式对象 | **未实现** |
| `OntologyDelta` | compile / promote / memory updates 的分散结果 | compile 会修改 Ref，promote 会创建 Shortcut，但没有统一的"本次对本体做了什么"的一等对象。**未实现为一等对象** |
| `NoUpdateReason` | 无显式对象 | **未实现** |

### Gap 汇总

| Gap 等级 | 数量 | 具体项 |
|---------|------|--------|
| **未实现** | 3 | `Reconstruction`、`OntologyDelta`（一等对象）、`NoUpdateReason` |
| **需重大升级** | 3 | `MechanismClass`（三要素）、`Episode`（轨迹结构）、`DerivationChain`（完整推导链） |
| **需中等升级** | 4 | `Entity`（类型层）、`Attribute`（统一 schema）、`SupportLink`（显式边）、`ConfidenceScore`（结构化） |
| **基本对齐** | 4 | `Relation`→Ref、`ContextSnapshot`→ContextScope、`Claim`→Hypothesis、`ObservationRecord`→Observation |

---

## §11 转 current 的条件

本合同只有在以下条件满足后，才可从 `draft` 转为 `current`：

### Ontology Space

- [ ] `Entity` 成为 first-class 对象并有显式 schema（不是只靠 Atom.kind=FACT 隐含）
- [ ] `MechanismClass` 可回放三要素（latent_phases / observable_signatures / intervention_points）在代码中有对应 schema 且可审计

### Episode Space

- [ ] `Episode` 有 timeline + transitions 结构（不是 bag of observations）
- [ ] 至少一个 Episode 实例可端到端落盘和回放

### Claim Space

- [ ] `Claim` 状态机（proposed → accepted/rejected → superseded）在代码中有对应实现
- [ ] `SupportLink` 作为显式边类型存在（不是通过 ID 列表间接关联）

### Derivation Space

- [ ] `Reconstruction` 成为显式对象并可落盘
- [ ] `OntologyDelta` 成为显式对象，而非隐含 compile side effect
- [ ] 至少一条主路径能从 Episode 回放主要 MechanismClass 链

### 全局

- [ ] 7 步算子链（S1–S7）至少有一条端到端路径在代码中可执行
- [ ] contract-audit 能检查上述对象的存在性与基本绑定关系
- [ ] 14 基础单元中至少 10 个有对应的代码对象（first-class 或 wrapper）

---

## §12 示例：gaze error 诊断全流程

本节用一个完整的 gaze error 诊断案例走通 7 步算子链，展示 14 基础单元如何协作。

### S1 目标设定

```yaml
Goal:
  question: "为什么最近注视精度从 0.8° 恶化到 2.5°？"
  success_criteria: "给出根因 + 验证方案 + 修复方案"
  falsifiable: true  # 可以通过干预结果确认或否定
```

### S2 世界采样

```yaml
ObservationRecords:
  - id: "OR_001"
    content: "注视误差 30 分钟内从 0.8° → 2.5°"
    source: "gaze_accuracy_monitor"
    timestamp: "2026-04-13T10:00:00Z"
  - id: "OR_002"
    content: "cornea_radius 偏移 +0.3mm（> 3σ）"
    source: "calibration_parameter_log"
    timestamp: "2026-04-13T10:05:00Z"
  - id: "OR_003"
    content: "环境光照未变化"
    source: "ambient_light_sensor"
    timestamp: "2026-04-13T10:05:30Z"

# 显式记录"没看什么"
not_sampled:
  - "用户头部运动数据（本次未采集）"
  - "瞳孔大小变化（本次未采集）"
```

### S3 知识检索

```yaml
# ProblemClass 路由
route: "gaze_accuracy_degradation"
subgraph_constraint: "geometric_model + calibration"

# 候选 MechanismClass
candidates:
  - MC_gaze_geometric_degradation  # 几何退化
  - MC_illumination_model_failure  # 光照模型失效
  - MC_pupil_detection_drift       # 瞳孔检测漂移

# 候选 Relation
candidate_relations:
  - "cornea_radius_drift causes gaze_error_increase (weight=0.7)"
  - "illumination_change causes reflection_shift (weight=0.5)"
```

### S4 候选绑定

```yaml
Claims:
  - id: "CL_001"
    content: "几何参数漂移导致注视精度退化"
    status: proposed
    support_links:
      - SupportLink(OR_001→CL_001, supports, weight=0.8)
      - SupportLink(OR_002→CL_001, supports, weight=0.9)
  - id: "CL_002"
    content: "光照变化导致反射模型失配"
    status: proposed
    support_links:
      - SupportLink(OR_003→CL_002, contradicts, weight=0.7)
      # OR_003（环境光照未变化）反驳了 CL_002

# LLM 在此步只做绑定提议，不做裁决
llm_role: "proposer"
```

### S5 评分与排序

```yaml
Ranking:
  - CL_001:
      confidence:
        score: 0.85
        basis:
          support_count: 2
          contradict_count: 0
          mechanism_stability: "MC_gaze_geometric_degradation 有 3 次历史确认"
          intervention_available: true
  - CL_002:
      confidence:
        score: 0.15
        basis:
          support_count: 0
          contradict_count: 1
          mechanism_stability: "MC_illumination_model_failure 有 1 次历史确认"
          intervention_available: true

# ConfidenceScore 纯结构化，不含 LLM 自评
```

### S6 过程重建

```yaml
Reconstruction:
  episode_id: "EP_20260413_001"
  mechanism_class_id: "MC_gaze_geometric_degradation"
  derivation_chain:
    - step: 1
      from: "initial_conditions(firmware_3.1.2 + calibration_module_v2)"
      relation: "enables"
      to: "LP1(参数漂移积累)"
      audit_replayable: true
    - step: 2
      from: "LP1(参数漂移积累)"
      relation: "causes"
      to: "OS2(cornea_radius 偏移 +0.3mm)"
      audit_replayable: true
    - step: 3
      from: "OS2(cornea_radius 偏移)"
      relation: "causes"
      to: "OS1(注视误差 0.8° → 2.5°)"
      audit_replayable: true
    - step: 4
      from: "IP1(重标定)"
      relation: "fixes"
      to: "OS1(注视误差恢复到 0.9°)"
      audit_replayable: true
  
  fidelity:
    score: 0.92
    method: "key_node_coverage"
    matched_nodes: ["LP1", "OS1", "OS2", "IP1"]
    missed_nodes: []
    extra_nodes: []
```

### S7 本体更新

```yaml
OntologyDelta:
  kind: applied
  changes:
    - action: "strengthen_relation"
      target: "Relation(cornea_radius_drift → gaze_error_increase)"
      new_weight: 0.85
      old_weight: 0.70
      evidence: "EP_20260413_001"
    - action: "add_attribute"
      target: "Entity(geometric_model)"
      attribute: "drift_rate_per_session"
      note: "新发现的可观测属性"
    - action: "reject_claim"
      target: "CL_002(光照变化导致反射模型失配)"
      reason: "OR_003 显式反驳"

  # Fidelity 检查：老 Episode 的 fidelity 不下降
  fidelity_regression_check:
    episodes_checked: 5
    min_fidelity_before: 0.88
    min_fidelity_after: 0.88
    regression_detected: false
```

---

## §13 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-13 | 初版。从 epistemic-contract.md（7 对象集 + 2 闭环）升级为四空间正交架构 + 14 基础单元 + 7 步算子链 |

---

## 参考

- [[epistemic-contract|旧版认识论合同]]（superseded）
- [[metamodel|元模型：五模块语义定义]]
- [[pipeline-contract|Pipeline 编排合同]]
- [[hypothesis-contract|Hypothesis 门控合同]]
- [[compile-promotion-contract|Compile 晋升合同]]
- [[ref-algebra-contract|RefAlgebra 合同]]
- [[template-invariant-contract|PatternTemplate 合同]]
- [[architecture-overview|架构总览]]
