# BestQ-A 因果学习引擎：算法与数据结构调研

> 目标：为当前 ad-hoc heuristic（Jaccard 聚类 + regex 特征 + 暴力搜索解释）找到有理论基础的替代算法。

## 现状诊断

| 当前模块 | 做什么 | 用什么 | 问题 |
|---|---|---|---|
| `inducer.ts` 聚类 | 把 open events 分组 | Jaccard(pred\|value) 贪心 | 无层次结构、无增量、O(n²) |
| `inducer.ts` 归纳 | 从聚类提取 regulation | 集合交集 + 频率阈值 | 无变量泛化、无递归规则 |
| `explainer.ts` 解释 | 用 regulation 链解释观测 | Beam search backward chaining | 无 provenance、无最优性保证 |
| `validator.ts` 晋升 | candidate→hypothesis→confirmed | 硬编码阈值计数 | 无统计检验、无因果方向验证 |
| `keywords.ts` 特征 | 提取文本特征 | TF-IDF + regex | 无结构化谓词发现 |

---

## 方向一：规则学习（替代 Jaccard 聚类归纳）

### 问题映射

BestQ-A 的归纳任务是：给定一组 `Event`（含 `facts`, `context`, `unexplainedAspects`），学习形如 `pre[] → eff[]` 的 Horn 规则。这正是**知识图谱规则学习**的核心问题。

### 推荐算法

#### 1. AnyBURL（Anytime Bottom-Up Rule Learning）

**为什么适合**：
- **Anytime**：可以随时停止，返回当前最优规则集——天然适合增量学习场景
- **Bottom-up**：从具体事实出发，采样路径后泛化为规则——和 BestQ-A "从观测归纳 regulation" 的理念一致
- **可解释**：输出的 Horn 规则直接对应 `Regulation.pre → Regulation.eff`
- 在大规模 KG 补全任务上性能优于 AMIE+，且效率更高

**概念映射**：
| BestQ-A | AnyBURL |
|---|---|
| `Fact{pred, args, value}` | Knowledge graph triple `(s, p, o)` |
| `Event.unexplainedAspects` | Query target / head of rule |
| `Event.observation.facts` | Background facts / body candidates |
| `Regulation{pre→eff}` | Learned Horn rule `body → head` |
| `trigger_induction` | `learn(timeLimit)` |

**实现情况**：Java 实现（[web.informatik.uni-mannheim.de/AnyBURL](http://web.informatik.uni-mannheim.de/AnyBURL/)）。无 TypeScript 端口，需通过子进程调用或自行移植核心算法（路径采样 + 泛化，约 2000 行 Java）。

#### 2. AMIE 3.5（Association Rule Mining under Incomplete Evidence）

**为什么适合**：
- 专为**不完整知识库**设计——BestQ-A 的知识库天然不完整（只有观测到的 facts）
- 使用 PCA（Partial Completeness Assumption）置信度，比 CWA 更适合开放世界
- 支持远程 server/client 架构，可以作为后端服务

**概念映射**：与 AnyBURL 类似，但 AMIE 的 head coverage + PCA confidence 可直接映射为 `Regulation.supportN` 和 `Regulation.counterexampleN` 的语义。

**实现情况**：Java（[github.com/dig-team/amie](https://github.com/dig-team/amie)）。配套 Python 库 PyClause 可处理规则应用。

#### 3. Popper（ILP: Learning from Failures）

**为什么适合**：
- **学习递归规则**：AnyBURL/AMIE 限于固定长度 Horn 子句，Popper 可学习含递归的 Datalog 程序
- **假设空间约束**：generate-test-constrain 循环与 BestQ-A 的 candidate→hypothesis→confirmed 晋升机制高度契合
- 从失败中学习约束，剪枝假设空间——类似 BestQ-A 的 `CounterexampleCommons`

**概念映射**：
| BestQ-A | Popper |
|---|---|
| `Event` (未解释观测) | Positive example |
| `Regulation` 被反驳 | Negative example / constraint |
| `ConstitutionalLayer` | Background knowledge / bias |
| `promoteOrDemote` | Hypothesis refinement loop |

**实现情况**：Python + Clingo + SWI-Prolog（[github.com/logic-and-learning-lab/Popper](https://github.com/logic-and-learning-lab/Popper)）。需通过子进程调用。

### 方向一结论

**最小落地路径**：先将 AnyBURL 的核心路径采样算法移植到 TypeScript（约 500 行），替换 `inducer.ts` 中的 Jaccard 聚类 + 集合交集归纳。AnyBURL 的 anytime 特性使得它可以无缝替换现有的 `trigger_induction`——设定时间预算，随时返回当前最优规则。

---

## 方向二：因果发现（替代 flat DAG）

### 问题映射

BestQ-A 当前的 `Regulation{pre→eff}` 是**关联规则**，不是因果规则。`pre` 出现时 `eff` 也出现，但不知道 `pre` 是否**导致** `eff`。因果发现算法可以从观测数据中推断方向。

### 推荐算法

#### 1. PC 算法（Peter-Clark Algorithm）

**为什么适合**：
- 从条件独立性检验出发，构建因果骨架（skeleton），再定向为 DAG
- 输出的 DAG 边可直接标注为 `Regulation` 的因果方向
- **已有 TypeScript 实现**：`@kanaries/causal`

**概念映射**：
| BestQ-A | PC Algorithm |
|---|---|
| `Fact.pred` | Variable / node |
| `Observation[]` | Dataset rows |
| `Regulation{pre→eff}` | Directed edge in CPDAG |
| `evidenceKind: 'observational'` | PC 输出本身就是观测因果 |
| `evidenceKind: 'intervention'` | 需要 FCI 扩展处理混杂 |

**实现情况**：TypeScript——[`@kanaries/causal`](https://github.com/Kanaries/causal-js)，支持 PC / GES / GIN / GRaSP / RCD，Node + 浏览器双端，30/30 测试通过对齐 causal-learn。

#### 2. FCI（Fast Causal Inference）

**为什么适合**：PC 假设无隐变量，FCI 放宽了这个假设——BestQ-A 场景中大量因素未被观测到（如用户环境、历史操作），FCI 更合理。

**实现情况**：`@kanaries/causal` 路线图中，当前需回退到 Python `causal-learn`。

#### 3. libdagitty（因果图推理）

**为什么适合**：
- 不做因果发现，但做因果图上的**推理**：d-separation、调整集、工具变量
- 可以验证一个已发现的 `Regulation` DAG 是否满足因果可辨识性
- 纯 JavaScript 实现，轻量

**实现情况**：JavaScript——[`libdagitty`](https://github.com/jtextor/libdagitty)。

### 方向二结论

**最小落地路径**：引入 `@kanaries/causal` 的 PC 算法，在 `induceFromEvents` 之后增加一步因果定向：将归纳出的关联规则（`pre↔eff`）通过 PC 算法确定方向，将 `evidenceKind` 从 `'observational'` 升级为 `'quasi_experiment'`。

---

## 方向三：Provenance-based Reasoning（替代暴力 explainObservation）

### 问题映射

当前 `explainer.ts` 用 beam search 做 backward chaining，找到能解释观测的 regulation 链。问题：
1. Beam search 不保证最优
2. 没有 provenance——不知道"为什么选这条链"
3. 无法高效做 top-k

### 推荐算法

#### 1. Provenance Semiring + Top-k Proofs（Scallop 方法）

**为什么适合**：
- **Provenance semiring** 是 Datalog 查询结果附带推导证据的数学框架
- **Top-k proofs semiring** 精确给出前 k 条最高分解释链——直接替代 beam search
- 支持递归、聚合、否定——BestQ-A 的 regulation 链天然是递归 Datalog
- 证明链（proof）直接对应 BestQ-A 的 `DerivationTrace` / `ProofLineage`

**概念映射**：
| BestQ-A | Scallop Provenance |
|---|---|
| `Regulation{pre→eff}` | Datalog rule |
| `Observation.facts` | EDB (Extensional Database) |
| `explainObservation()` | Top-k provenance query |
| `Story{regulationIds, score}` | Proof with provenance tag |
| `ruleScore()` | Semiring weight |
| `DerivationTrace` | How-provenance |

**实现情况**：Rust + Python（[github.com/scallop-lang/scallop](https://github.com/scallop-lang/scallop)）。无 TypeScript 端口。但核心算法（semi-naive evaluation + provenance tagging）可以在 TypeScript 中实现，因为 BestQ-A 的规则集很小（通常 <1000 条 regulation），不需要 Scallop 的编译优化。

#### 2. Why-Provenance / How-Provenance（直接实现）

**为什么适合**：
- Why-provenance 回答"哪些输入事实参与了推导"——对应 `Story.assumptions`
- How-provenance 回答"推导的精确路径是什么"——对应 `Story.regulationIds`
- 可以在现有 backward chaining 上增量添加，无需重写

**最小实现**：在 `SearchNode` 中增加 `provenanceTag: Map<string, Set<string>>`，记录每个绑定变量的来源 fact ID。beam search 完成后，provenance 自然生成。

### 方向三结论

**最小落地路径**：
1. **立即可做**：在 `explainer.ts` 的 `SearchNode` 中添加 how-provenance 追踪（~50 行），让 `Story` 携带完整推导路径和事实来源
2. **中期**：将 backward chaining 改为 semi-naive forward evaluation + top-k provenance semiring，获得最优性保证

---

## 方向四：增量规则维护（替代全量 trigger_induction）

### 问题映射

当前 `triggerInductionTool` 每次都扫描所有 open events、重新聚类、重新归纳。当 events 数量增长时，这是 O(n²) 的。

### 推荐算法

#### 1. Semi-Naive Evaluation

**为什么适合**：
- Datalog 的标准增量求值策略：只对**新增**事实执行规则，避免重复推导
- 直接对应"新观测进来时只更新受影响的 regulations"
- 实现简单：维护 `ΔFacts`（本轮新增），每轮只用 `ΔFacts` 去触发规则

**概念映射**：
| BestQ-A | Semi-Naive |
|---|---|
| `saveObservation()` 新观测 | 新增 EDB fact → ΔFacts |
| `processObservation()` | 用 ΔFacts 驱动规则求值 |
| `explainObservation()` | 只对受影响的 goals 重新求值 |
| `trigger_induction` | 只对含 ΔFacts 的聚类重新归纳 |

**实现情况**：
- [`@datalogui/datalog`](https://www.npmjs.com/package/@datalogui/datalog)——TypeScript，支持 differential updates（增量）
- [`d2ts`](https://github.com/electric-sql/d2ts)——TypeScript differential dataflow（见下）

#### 2. Differential Dataflow（D2TS）

**为什么适合**：
- 比 semi-naive 更强：支持**删除**和**修改**的增量传播
- BestQ-A 的 `retired` regulation 需要撤回其解释——这需要 delete 传播
- 支持递归计算的增量更新

**概念映射**：
| BestQ-A | Differential Dataflow |
|---|---|
| `saveObservation()` | `source.insert(fact)` |
| `Regulation` 被 retired | `source.remove(rule)` |
| `explainObservation()` | 增量维护的物化视图 |
| `trigger_induction` | 增量聚类 + 增量归纳 |

**实现情况**：
- [`d2ts`](https://github.com/electric-sql/d2ts)——ElectricSQL 开发的 TypeScript differential dataflow，支持 join、iterate、persist to SQLite
- [`materialite`](https://github.com/vlcn-io/materialite)——另一个 TypeScript differential dataflow，API 更简洁

#### 3. DRed（Delete/Rederive）

**为什么适合**：专门处理规则删除后的重新推导。当一条 regulation 被 retired 时，DRed 可以精确计算哪些 derived facts 需要被撤回、哪些可以通过其他路径重新推导。

**实现情况**：无独立 TypeScript 实现，但 DRed 算法本身很简单（~200 行），可以直接在 storage 层实现。

### 方向四结论

**最小落地路径**：
1. **立即可做**：在 `processObservation` 中引入 `ΔEvents` 概念——只对新产生的 events 尝试聚类，不重扫全量
2. **中期**：引入 `d2ts` 作为增量计算引擎，将 observation→event→cluster→regulation 管线改为流式增量

---

## 方向五：因果效应估计（替代 fidelity 硬算）

### 问题映射

BestQ-A 用 `ruleScore()` 计算 regulation 可信度，公式是 `evidenceWeight × repWeight × specWeight × statusWeight`。这是启发式打分，缺乏因果效应估计的统计基础。

### 推荐算法

#### 1. Average Treatment Effect（ATE）估计

**为什么适合**：
- 将 regulation 看作 treatment：`pre` 出现 = treated, `pre` 不出现 = control
- ATE 量化 `pre` 对 `eff` 的平均因果效应大小
- 可以直接替代 `ruleScore()` 作为 regulation 的因果强度度量

**概念映射**：
| BestQ-A | ATE |
|---|---|
| `Regulation{pre→eff}` | Treatment → Outcome |
| `supportN` | Treated group size |
| `counterexampleN` | Treated group 中 outcome 未出现 |
| `Observation[]` 中 pre 不满足的 | Control group |
| `ruleScore()` | ATE estimate |

#### 2. Propensity Score Matching

**为什么适合**：当 `pre` 的出现不是随机的（观测数据中通常如此），需要匹配相似的 treated/control 样本来消除混杂。

#### 3. 置信区间 + 统计检验

**为什么适合**：当前 `PROMOTION_THRESHOLDS` 是硬编码数字（`candidateMinSupport: 3`）。用统计检验（如 Fisher exact test 或 bootstrap 置信区间）可以根据数据量自适应调整晋升门槛。

**实现情况**：
- [`@kanaries/causal`](https://github.com/Kanaries/causal-js) 包含条件独立性检验
- [`simple-statistics`](https://www.npmjs.com/package/simple-statistics)——TypeScript 统计库，含 t-test、置信区间
- [`jstat`](https://www.npmjs.com/package/jstat)——JavaScript 统计库

### 方向五结论

**最小落地路径**：用 Fisher exact test 替代 `PROMOTION_THRESHOLDS` 中的硬编码阈值。`simple-statistics` 已有 npm 包，一行安装。

---

## 最小落地路径总结

按优先级排序，以投入产出比为准：

| 优先级 | 替换目标 | 用什么 | 投入 | 收益 |
|---|---|---|---|---|
| **P0** | `explainer.ts` 添加 provenance | How-provenance 追踪 | ~50 行 | Story 携带完整推导链，对齐 v7 `DerivationTrace` |
| **P1** | `validator.ts` 晋升阈值 | Fisher exact test | ~100 行 + npm dep | 自适应晋升，消除 magic number |
| **P2** | `inducer.ts` 增量聚类 | ΔEvents semi-naive | ~200 行 | 从 O(n²) 降到 O(Δn) |
| **P3** | `inducer.ts` 规则归纳 | AnyBURL 路径采样移植 | ~500 行 | 变量泛化、anytime、可解释规则 |
| **P4** | `explainer.ts` 最优解释 | Top-k provenance semiring | ~800 行 | 最优性保证、精确 top-k |
| **P5** | 因果方向验证 | `@kanaries/causal` PC | npm dep + ~200 行胶水 | 关联→因果升级 |
| **P6** | 全量增量化 | `d2ts` differential dataflow | 架构重构 | 全管线增量，支持 regulation 撤回 |

### 推荐执行顺序

```
P0 → P1 → P2（一周内可完成，立竿见影）
  → P3 → P4（需要 2-3 周，规则质量质变）
    → P5 → P6（需要 1-2 月，架构级升级）
```

---

## 可用 npm/TypeScript 实现汇总

| 库 | npm 包 | 用途 | 成熟度 |
|---|---|---|---|
| [causal-js](https://github.com/Kanaries/causal-js) | `@kanaries/causal` | PC/GES 因果发现 | 生产级（30/30 tests） |
| [d2ts](https://github.com/electric-sql/d2ts) | `d2ts` | Differential dataflow | 活跃开发中 |
| [materialite](https://github.com/vlcn-io/materialite) | `@vlcn.io/materialite` | Incremental view maintenance | 实验性 |
| [@datalogui/datalog](https://www.npmjs.com/package/@datalogui/datalog) | `@datalogui/datalog` | Incremental Datalog | 小众但可用 |
| [libdagitty](https://github.com/jtextor/libdagitty) | 需手动引入 | 因果图推理(d-sep) | 成熟 |
| [simple-statistics](https://www.npmjs.com/package/simple-statistics) | `simple-statistics` | 统计检验 | 生产级 |
| [datalog-ts](https://www.npmjs.com/package/datalog-ts) | `datalog-ts` | Datalog 解释器 | 停更 |
| [datascript](https://www.npmjs.com/package/datascript) | `datascript` | Datomic-style Datalog | 成熟 |

### 需要移植/子进程调用的

| 工具 | 语言 | 用途 | 移植难度 |
|---|---|---|---|
| [AnyBURL](http://web.informatik.uni-mannheim.de/AnyBURL/) | Java | 规则学习 | 中（核心~2000行） |
| [AMIE 3.5](https://github.com/dig-team/amie) | Java | 规则挖掘 | 高（依赖重） |
| [Popper](https://github.com/logic-and-learning-lab/Popper) | Python+Prolog | ILP | 高（需 Prolog runtime） |
| [Scallop](https://github.com/scallop-lang/scallop) | Rust+Python | Provenance Datalog | 高（编译器级别） |
