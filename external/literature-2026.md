# 因果推理与数据库融合领域文献索引（2024–2026）

> 补充 [[deep-research-report]] 的最新论文/项目，按六个研究方向整理。

## 1. Causal Discovery + Database — 因果发现与数据库系统结合

- [Suna: Scalable Causal Confounder Discovery over Relational Data](https://dl.acm.org/doi/10.14778/3749646.3749684) — 在关系数据上做可扩展的因果混杂因子发现，解决未知因果模型下的因果效应估计 (VLDB 2025)
- [From Logs to Causal Inference: Diagnosing Large Systems](https://www.vldb.org/pvldb/vol18/p158-markakis.pdf) — 从系统日志到因果推断的诊断 pipeline，含 PostgreSQL TPC-DS 实验 (VLDB 2025, Markakis et al.)
- [CausaLens: A System for Summarizing Causal DAGs](https://dl.acm.org/doi/10.1145/3722212.3725086) — 因果 DAG 摘要系统，平衡图简化与推断可靠性 (SIGMOD 2025)
- [Causal Data Integration](https://arxiv.org/abs/2305.08741) — 从外部源挖掘未观测属性并自动构建因果 DAG 的数据集成框架 (VLDB 2023, MIT)
- [Causal Relationships in Databases](https://people.cs.umass.edu/~ameli/projects/causality/) — UMass 项目：扩展数据库系统以建模因果依赖，支持因果解释型查询

## 2. LLM + Causal Reasoning — 大语言模型与因果推理

- [Causal-Copilot: An Autonomous Causal Analysis Agent](https://arxiv.org/abs/2504.13263) — LLM 驱动的自动因果分析 Agent，集成 20+ 因果算法，自然语言交互 (2025, Wang et al.) | [GitHub](https://github.com/Lancelot39/Causal-Copilot)
- [Causal Inference with Large Language Model: A Survey](https://aclanthology.org/2025.findings-naacl.327.pdf) — 系统综述 LLM×因果推断，发现 LLM 可能只是"因果鹦鹉" (NAACL 2025 Findings, Jing Ma)
- [Large Language Models for Causal Discovery: Current Landscape and Future Directions](https://arxiv.org/abs/2402.11068) — LLM 在因果发现三维度的综述：直接推断、知识集成、结构精化 (IJCAI 2025)
- [Causal Discovery through Synergizing LLM and Data-Driven Reasoning](https://www.cs.emory.edu/~jyang71/files/llmcd.pdf) — 在 PC 算法各阶段注入 LLM 先验知识以提升因果骨架和方向准确性 (KDD 2025)
- [Causal Reasoning and LLMs: Opening a New Frontier for Causality](https://arxiv.org/abs/2403.09606) — LLM 与因果推断协作的全面综述，涵盖公平性、可解释性、多模态 (TMLR 2024, Kıcıman et al.)

## 3. Knowledge Distillation for Reasoning — 推理能力蒸馏到结构化知识

- [LLM-Guided Knowledge Distillation for Temporal Knowledge Graph Reasoning](https://arxiv.org/html/2602.14428) — 将 LLM 时序知识蒸馏到轻量模型，用于时间知识图谱推理 (2026)
- [GraphMERT: Efficient and Scalable Distillation of Reliable Knowledge Graphs from Unstructured Data](https://www.alphaxiv.org/resources/2510.09580v1) — 微型图编码器从非结构化文本蒸馏高质量 KG (2025)
- [LLM-driven Knowledge Distillation for Dynamic Text-Attributed Graphs](https://arxiv.org/abs/2502.10914) — 从 LLM 边表示蒸馏到轻量 GNN，编码结构+时间+文本信息 (2025)
- [Chain-of-Thought Curriculum Distillation](https://dl.acm.org/doi/10.1145/3775073.3775200) — CoT + 课程学习蒸馏，770M T5 达到 540B 教师模型 94% 性能 (2025)
- [Knowledge Distillation and Dataset Distillation of LLMs: Emerging Trends](https://link.springer.com/article/10.1007/s10462-025-11423-3) — KD+DD 双范式综述，涵盖 rationale-based KD、不确定性感知 KD 等前沿技术 (AI Review 2025)

## 4. Incremental Datalog / Semi-naive Evaluation — 增量规则求值

- [FlowLog: Efficient and Extensible Datalog via Incrementality](https://arxiv.org/html/2511.00865) — 基于 Differential Dataflow 的批+增量 Datalog 引擎，含递归感知优化 (2025, Zhao et al.)
- [DBSP: Automatic Incremental View Maintenance for Rich Query Languages](https://docs.feldera.com/vldb23.pdf) — 全 SQL 自动增量化理论框架，VLDB 2023 最佳论文 + SIGMOD 2024 研究亮点 | [Feldera](https://github.com/feldera/feldera)
- [Making Formulog Fast: An Argument for Unconventional Datalog Evaluation](https://arxiv.org/html/2408.14017v1/) — 挑战 semi-naive 万能假设，在静态分析负载上探索非传统求值策略 (OOPSLA 2024)
- [Optimizing Datalog for the GPU (GPUlog)](https://arxiv.org/html/2311.02206v4) — GPU 上实现 semi-naive 求值，比 Soufflé 快 45× (2024)
- [Incremental Evaluation of Dynamic Datalog Programs as DBSP Circuits](https://ceur-ws.org/Vol-3801/paper1.pdf) — 动态 Datalog 程序的增量求值，用 DBSP/Differential Dataflow 作后端 (CEUR 2024)

## 5. SWE-bench + Causal Analysis — 因果分析提升 SWE-bench

- [How We Hit 83.4% on SWE-bench Verified: Finding the Root Cause](https://dev.to/morethananai/how-we-hit-834-on-swe-bench-verified-part-2-finding-the-root-cause-and-generating-the-fix-4o63) — 5-Whys 根因分析 + Focus Alignment 因果约束，阻止与根因无因果关系的补丁 (2026, MoreThanAnAI)
- [AgentFL: Scaling LLM-based Fault Localization to Project-Level Context](https://arxiv.org/abs/2403.16362) — 多 Agent 故障定位系统，模拟人类理解-导航-确认流程 (2024, Qin et al.)
- [CauSE 2025: Causal Methods in Software Engineering Workshop](https://causality-software-engineering.github.io/cause-workshop-2025/) — 因果发现/推断应用于故障定位、调试、根因分析的专题研讨会 (ICSE 2025)
- [Does SWE-Bench-Verified Test Agent Ability or Model Memory?](https://arxiv.org/abs/2512.10218) — 调查模型在 SWE-bench 上的定位能力是否源于记忆而非推理 (2025)
- [Causal Reasoning in Software Quality Assurance: A Systematic Review](https://www.sciencedirect.com/science/article/pii/S0950584924002040) — 因果推理在软件质量保障中的系统综述 (IST 2024)

## 6. Scallop / Provenance-based Reasoning — 基于 provenance 的可微推理

- [Lobster: A GPU-Accelerated Framework for Neurosymbolic Programming](https://arxiv.org/pdf/2503.21937) — 将 Scallop 式程序编译到 GPU，含 provenance semiring 库，比 Scallop 平均快 5.3× (ASPLOS 2026)
- [Scallop: A Language for Neurosymbolic Programming](https://arxiv.org/abs/2304.04812) — 基于 provenance semiring 的可微 Datalog，18 种内建 provenance (PLDI 2023, Li et al.) | [GitHub](https://github.com/scallop-lang/scallop)
- [Neurosymbolic Programming in Scallop: Principles and Practice](https://www.cis.upenn.edu/~mhnaik/papers/fntpl24.pdf) — Scallop 设计原理教程：查询规划、硬件加速、概率与可微推理 (FnToPL 2024)
- [Nemo: Your Friendly and Versatile Rule Reasoning Toolkit](https://proceedings.kr.org/2024/70/kr2024-0070-ivliev-et-al.pdf) — Rust 实现的高性能规则引擎，支持存在规则+聚合+分层否定 (KR 2024, TU Dresden) | [GitHub](https://github.com/knowsys/nemo)
- [Neuro-Symbolic AI in 2024: A Systematic Review](https://arxiv.org/abs/2501.05435) — 167 篇论文系统综述，覆盖 provenance semiring、LTN、LNN 等可微逻辑范式 (2025)

---

## 交叉观察

<!-- 跨方向的关键洞察 -->

| 趋势 | 代表工作 | 意义 |
|---|---|---|
| LLM 作为因果先验注入器 | Causal-Copilot, LLM-CD | LLM 不直接做因果发现，而是为统计方法提供先验 |
| 增量求值从 Datalog 扩展到全 SQL | DBSP/Feldera, FlowLog | semi-naive 思想泛化为通用 IVM 理论 |
| 根因分析成为 SWE-bench 关键瓶颈 | MoreThanAnAI, AgentFL | 定位能力比生成补丁更决定最终成绩 |
| provenance semiring 上 GPU | Lobster | 可微逻辑推理的工程瓶颈正在被打破 |
| KD 从模型压缩走向知识图谱构建 | GraphMERT, LLM→TKG | 蒸馏目标从"小模型"变为"结构化知识" |
