# BestQ-A 认识论公理：从现象到本体的可逆建模

> BestQ-A 的设计根公理。所有 artifact、合同、脚本、评测产物都是这两条公理的工程投影。
> 生成日期：2026-04-13
> 状态：**哲学层 / upstream**。落地合同见 `docs/current/epistemic-contract.md`（待写）；工程过渡层见 [trace-and-fidelity-axioms.md](trace-and-fidelity-axioms.md)（已降级，受本文 supersede）。

---

## 1. 核心命题

**BestQ-A 不是 answer generator，是 evidence-driven reasoning engine + ontology sampler**。

它要的不是"一次把问题答对"，而是：

> **从现象出发，经过显式收集、显式连接、显式推导，落到答案；同时反过来改进世界模型**。

---

## 2. 两条根公理

### 公理 A —— 显式推导优先

> 不信任 LLM 凭内部统计分布的随机输出。每个答案的产品是"从已知事实 X，经规则 Y，到结论 Z"**那条推导链本身**；Z 会过时，链可复用、可改进。

**为什么不是普通 LLM**：LLM 直接输出答案的致命缺陷不是"偶尔错"，而是**错了没有资产沉淀**——今天这样答、明天那样答，中间缺少可复查、可复用、可改进的结构。

**链条形状**：

```text
问题
→ 收集相关现象
→ 收集相关知识
→ 组织候选解释
→ 明确排除/保留依据
→ 形成答案
```

**四重价值**：

| 价值 | 含义 |
|---|---|
| 可重复 | 同一问题下次沿同一结构重走，不靠"灵光一现" |
| 可纠错 | 错了能定位是现象漏了、知识错了、关系错了、还是推理路径错了 |
| 可复用 | 相似问题沿已有路径继续扩展 |
| 可工程化 | 链条对象化 → 可存储、可索引、可比较、可评分、可替换 |

**产物形状硬要求**：

系统输出**不是**：

```text
Answer: X
```

而**是**：

```text
Observations: [...]
Knowledge used: [...]
Hypotheses considered: [...]
Selected mechanism: ...
Rejected alternatives: ...
Answer: X
Confidence: ...
```

答案只是副产品，**推理轨迹才是主产品**。

### 公理 B —— 经历是本体采样

> 一次具体经历是对世界本体模型的一次采样。实践同时做两件事：(a) 改进现状；(b) 让本体模型更完备、更抽象、更系统。本体的质量由"**把老经历的 input 灌回模型能否还原主过程**"来衡量。

**为什么这比普通 case-based reasoning 更深**：一次经历不是"遇到问题 A → 解决方案 B"的孤立事件。它本质是世界在某个局部状态下的一次展开：某些条件同时成立 → 某些现象被观察 → 某些机制被触发 → 某些结果发生。

所以一个 case 的价值不是"解决了这一次"，而是它提供了：

> **一次世界模型的带标签采样**

**三层采样**：

| 层 | 采的是什么 |
|---|---|
| 现象层 | 观察到的日志、报错、行为 |
| 机制层 | 归纳出的原因链 |
| 本体层 | 抽象出的共性结构 |

**完备性指标**：本体质量不是"回答了多少问题"，而是"**给定任一老 case 的 initial conditions，当前 ontology 能否还原主要发生过程**"。这就是 **Reconstruction Fidelity**，比 solve_rate 更根本的完备性标尺。

---

## 3. 两个闭环

BestQ-A 不是单环问答系统，是两环并行：

### 闭环一：问题求解环

```text
现象收集
→ 候选解释
→ 证据补全
→ 机制判断
→ 给出答案/动作
```

解决"这次怎么办"，服务**使用**。

### 闭环二：本体学习环

```text
这次实例
→ 抽象出哪些稳定结构
→ 更新哪些 class
→ 修正哪些 relation
→ 删除哪些错误假设
→ 让以后更快、更准
```

解决"以后怎么看世界"，服务**成长**。

**耦合点**：每次解决问题的产物既是答案（给人），又是本体的一次采样（给系统自己）。这就是单层输出不够、必须双层的根本原因。

---

## 4. 七类一级对象

所有中间产物必须归入以下 7 类之一。**类与类之间零交集，强制分层**（承接 [current/file-taxonomy-contract.md](current/file-taxonomy-contract.md) 的零交集原则在运行时的同构重演）。

| 类型 | 定义 | 示例 | 在系统中的角色 |
|---|---|---|---|
| **Observation** | 具体观察到的现象，不掺解释 | "接口超时"、"某 LED glint 偏移 20 px"、"某阶段 residual 明显升高" | trace 的最底层输入 |
| **Evidence** | 能支撑或反驳某个判断的证据 | 日志片段、测试结果、标定数据、实验统计 | 绑定到某个 Hypothesis，用于评分 |
| **Hypothesis** | 对现象的候选解释 | "是 DNS 问题"、"是 side camera 系统性偏差"、"是时序同步误差" | 被 Evidence 评分，经门控 accept/reject |
| **Mechanism / Relation** | 更抽象的机制关系 | "A 导致 B"、"A 暗示 B"、"A 需要 B"、"A 与 B 共现但非因果" | regulation 图的边 |
| **Class** | 更高层的问题类或机制类 | "网络连通性问题"、"侧视相机几何退化"、"反射模型失配" | 为 Instance 提供类型归属 |
| **Instance** | 一次真实经历，是 Class 在具体条件下的展开 | "某天某眼某组数据上的一次优化失败"、"某项目一次 display 冲突" | 既是 case_memory 条目，也是本体采样 |
| **Reconstruction** | 从已知信息还原"主要发生过程"的结构化结果 | 给定 initial conditions + 当前 ontology，重建 case 的主链条 | **可逆建模的唯一出口**，本体完备性检验器 |

**Class vs Instance 强制分离**（承接 b1917ce 的零交集公理）：
- Instance 必须通过 `class_of` 绑定到某个 Class
- Class 不得有 `class_of`
- 一个对象不能同时是 Class 和 Instance

**Observation vs Evidence 辨析**：同一条日志既可以是现象（"看到了什么"）又可以是证据（"支持某 Hypothesis"）。结论：**角色是 trace step 的字段，不是对象本身的类型**。同一个底层 log 条目在 Observation 角色登记一次，在作为某 Hypothesis 的 Evidence 引用时不再复制实体，只建一条引用边。

---

## 5. 可逆世界建模

本文最不同于普通 RAG / case-base 的一点。

**常规 case-base**：`case → retrieve → reuse`。单向。

**BestQ-A 要的**：

```text
具体经历 → 抽象结构         # 正向：从 case 中抽象 mechanism
抽象结构 + 条件 → 重建经历   # 反向：从 mechanism + initial conditions 还原 case 的主链条
```

**反向那一步就是 Reconstruction**。它**不是** retrieval，不是从库里找最像的 case；它是**用当前 ontology 重新生成这个 case 的主要发生过程**，再和原始 trace 对比。

**为什么这是最强的完备性测试**：

| 情况 | 含义 | 系统动作 |
|---|---|---|
| 重建节点 ⊇ 原 trace 主链条的大部分节点 | ontology 对这类经历建模充分 | 通过，不需要 induction |
| 重建节点与原 trace 错开 | ontology 有缺口 | 触发 induction 补规则 |
| induction 补完后重建度反而下降 | 新规则破坏了老规则 | 拒绝晋升，回滚 |

这就是 [trace-and-fidelity-axioms.md](trace-and-fidelity-axioms.md) §3.2 `fidelity_monotone` 的真正含义——不是 trace 的 Jaccard 交集，而是：

> **重建出的主过程节点覆盖老 trace 主过程节点的比例**

---

## 6. 双层输出

每次问题求解必须同时产出：

### 第一层：结论层（给人看）

- 最可能原因
- 推荐动作
- 优先级与置信度

服务**使用**。

### 第二层：重建层（给系统看）

- Observation 集合
- 候选 Hypothesis + 证据权重
- 最终采用的因果链
- 被排除的链路
- 抽象到哪个 Class
- 这次对本体模型做了什么修正（新增 / 修改 / 删除了哪些 Mechanism / Relation）
- 对本次及历史老 case 重建的保真度得分

服务**成长**。

**两层都必须落盘**。不落 = 合同审计红灯。

---

## 7. 系统中心的转变

BestQ-A 的定位从：

> **会回答的 AI**（language generator）

转为：

> **会采样、会建模、会重建的 AI**（knowledge modeler + process reconstructor + conclusion generator）

对应的最小核心对象也从"QA 对"转为"**7 类本体对象 + 推理链 trace + 重建结果**"。

---

## 8. 一句话收尾

**答案会过时、会漂移、会随机，所以不能把答案当核心资产**。
**现象、证据、关系、机制、实例、抽象类是可以不断沉淀和重构的，所以这些才是真正的核心资产**。

系统的中心从"**生成答案**"转成：

> **"积累可重建世界的结构化知识，并在此基础上生成答案"**

---

## 9. 与既有文档的承接关系

| 文档 | 关系 |
|---|---|
| [trace-and-fidelity-axioms.md](trace-and-fidelity-axioms.md) | 工程过渡层；本文是其哲学父本，其 schema 需按 §4 的 7 对象集重写 |
| [current/hypothesis-contract.md](current/hypothesis-contract.md) | Hypothesis 对象类型的现有合同，承接本文 §4 |
| [current/memory-layer-contract.md](current/memory-layer-contract.md) | Instance 存储层；需追加 Reconstruction 结果的存储位置 |
| [current/ref-algebra-contract.md](current/ref-algebra-contract.md) | 推导链中 Mechanism / Relation 的代数表达 |
| [current/file-taxonomy-contract.md](current/file-taxonomy-contract.md) | 零交集原则在运行时的同构重演 |
| [current/artifact-contract.md](current/artifact-contract.md) | `trace.jsonl` + `ontology-replay.json` + 新增 `reconstruction.json` 的载体 |
| [current/pipeline-contract.md](current/pipeline-contract.md) | Pipeline 每阶段输出必须归入 7 对象集 |
| [knowledge-source-strategy.md](knowledge-source-strategy.md) | §4 "LLM as Relation Extractor" 必须在公理 A 下改写：LLM 只做候选提议者 |
| [predicate-evolution-philosophy.md](predicate-evolution-philosophy.md) | 早期哲学层前身；本文是升级版，扩展至 7 对象集 + 可逆建模 |
| [bestqa-roadmap.md](bestqa-roadmap.md) | Phase 1 Exit 应追加"solve_rate + trace + reconstruction 三件套齐全" |

---

## 10. 未决问题

- **Reconstruction 度量算法 MVP**：Jaccard（关键 Mechanism 节点集）是否足够，还是需要 DAG 对齐 / 序列编辑距离
- **Reconstruction 成本上限**：每次 induction 前全量重放所有老 case 在 100+ 规模下的性能天花板
- **LLM 在 Reconstruction 中的参与度**：全程 LLM 生成有伪造风险，全程符号化推理可能覆盖不够。临时结论是 LLM 只能生成候选节点，每个节点必须有可独立重放的 Mechanism 支撑
- **Observation 与 Evidence 的双角色**：倾向"角色是 trace step 字段而非对象类型"，但需在合同层确认
- **Class 命名空间治理**：Class 由谁命名、如何合并重名、如何处理同义 Class？暂缓，等有第一批 Instance 后再定
- **Reconstruction 的"主要发生过程"定义**：哪些节点算"主过程"哪些算枝节？暂定"被 hypothesis_gate 采纳的 Mechanism + 其直接前驱 Observation"

---

## 11. 下一步（待审阅后执行）

1. 本文审阅通过 → 冻结 7 对象集命名与 Reconstruction 定义
2. 改写 [trace-and-fidelity-axioms.md](trace-and-fidelity-axioms.md) §3.1 `trace.jsonl` schema，引入 `epistemic_object_kind` 字段，与 operation `kind` 正交
3. 新建 `docs/current/epistemic-contract.md`（`kind: contract`），正式定义 7 对象集 schema、Reconstruction 接口、Fidelity 度量、门控规则
4. 改 [current/artifact-contract.md](current/artifact-contract.md)，追加 `reconstruction.json` 为必需产物
5. 改 `scripts/contract-audit.mjs`，新增"trace 必须至少出现一次 `reconstruction_play` 步骤"硬约束
6. 改 `scripts/eval.mjs` 首次输出三件套：`solve_rate` + `trace.jsonl` + `reconstruction.json`
7. 回头给 [knowledge-source-strategy.md](knowledge-source-strategy.md) §4 打 LLM-as-proposer caveat 补丁

---

## 12. 不变量（any future edit must preserve）

任何对本文的后续编辑必须保留以下不变量，否则视为破坏根公理：

1. **答案不是核心资产，推导链是**
2. **经历是本体采样，不是 QA 对**
3. **7 对象集零交集，Class 与 Instance 强制分离**
4. **系统必须支持 Reconstruction，不仅仅是 Retrieval**
5. **每次问题求解必须同时产出结论层 + 重建层**
6. **induction 前必须全量重放老 case，fidelity 单调不降才能晋升**
7. **LLM 只能做候选提议者，不能做结论裁决者**
