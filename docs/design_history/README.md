# Design History README

`docs/design_history/` 保存的是设计史，不是当前实现说明书。
这里遵循 append-only 哲学：旧设计不会被覆写，只会被后续文件解释、收敛、桥接或显式延后。

一句话把握当前项目边界：**当前最稳妥的理解是 `v6 lawful kernel + docs/current/metamodel.md semantic base + v7 backbone + selective v8 absorption`；`v9-v11` 仍是 horizon，不应读成现状承诺。**

## 这个目录是做什么的

- 记录从 `v1` 到 `v13` 的设计演化轨迹。
- 保留已经被后续版本超越的上行视野，避免把历史意图误读为当前 contract。
- 为 `docs/current/` 提供来源背景，但不替代 `docs/current/` 的现行语义与操作契约。

## 阅读入口

### 快速理解现状

1. 先读 [`../current/metamodel.md`](../current/metamodel.md)：当前语义基座。
2. 再读 [current-boundary-map.md](./current-boundary-map.md)：看各历史版本如何映射到 `docs/current/`。
3. 然后读 [v12_convergence_to_current_boundary.md](./v12_convergence_to_current_boundary.md)：拿到当前边界的统一解释。

### 追设计演化

1. 从 [v1_recursive_decomposition.md](./v1_recursive_decomposition.md) 到 [v4_composable_knowledge.md](./v4_composable_knowledge.md)：早期问题分解与可组合知识阶段。
2. 接着读 [v5_zettelkasten_dual_mode.md](./v5_zettelkasten_dual_mode.md) 和 [v6_categorical_relations.md](./v6_categorical_relations.md)：进入 graph truth layer 与 lawful relations 内核。
3. 再读 [v7_world_model_dynamics.md](./v7_world_model_dynamics.md)：理解当前主干为何转向 world-model backbone。
4. 最后浏览 [v8_generative_ontology.md](./v8_generative_ontology.md) 到 [v11_reflexive_civilization_engine.md](./v11_reflexive_civilization_engine.md)：理解高阶 horizon 从哪里来、为什么目前仍被严格延后。

### 看 bridge set

1. [v12_convergence_to_current_boundary.md](./v12_convergence_to_current_boundary.md)：给出"今天到底应该怎么读整个项目"的总收敛结论。
2. [v12a_objectization_of_v7.md](./v12a_objectization_of_v7.md)：解释 `v7` 如何拆成当前 object/contract 栈。
3. [v12b_selective_v8_absorption.md](./v12b_selective_v8_absorption.md)：解释 `v8` 哪些部分被吸收，哪些仍停留在 draft/horizon。
4. [v12c_deferred_layers_v9_to_v11.md](./v12c_deferred_layers_v9_to_v11.md)：明确 `v9-v11` 为什么被保留为延后层，而不是当前能力。
5. [v13_historical_generative_ontology.md](./v13_historical_generative_ontology.md)：在 v12 收敛之上的历史生成式本体层。
6. [current-boundary-map.md](./current-boundary-map.md)：把设计史节点逐个映射到 `docs/current/` 合同状态与可辩护实现现实。

## 版本分层

### v1-v4：问题分解与可组合知识前史

- [v1_recursive_decomposition.md](./v1_recursive_decomposition.md)：把高层问题拆成可验证原子任务。
- [v2_abstraction_classes.md](./v2_abstraction_classes.md)：把问题类型抽象成可复用类别。
- [v3_semantic_chain.md](./v3_semantic_chain.md)：形成从原始需求到上下文检索的理解链。
- [v4_composable_knowledge.md](./v4_composable_knowledge.md)：确立 atom/composite 分离的可组合知识观。

### v5-v6：当前内核的稳定来源

- [v5_zettelkasten_dual_mode.md](./v5_zettelkasten_dual_mode.md)：把知识重心转到 `Atom / Ref / Shortcut` 图结构与 explore/compile 双模。
- [v6_categorical_relations.md](./v6_categorical_relations.md)：形成当前最稳定的 lawful kernel，重点是 `RefType` 组合律、关系代数与合法推演。

### v7：当前主干骨架

- [v7_world_model_dynamics.md](./v7_world_model_dynamics.md)：在 `v6` 合法关系内核之上，加入 world ontology、episode、reconstruction、ontology evolution，构成当前最接近运行中心的 backbone。

### v8-v11：上行 horizon，不是当前承诺

- [v8_generative_ontology.md](./v8_generative_ontology.md)：提出生成式本体、反事实与实验设计。
- [v9_ontology_federation.md](./v9_ontology_federation.md)：提出多本体联邦与合法翻译。
- [v10_participatory_reflexive_world_engine.md](./v10_participatory_reflexive_world_engine.md)：把观察者、仪器、部署效应纳入同一循环。
- [v11_reflexive_civilization_engine.md](./v11_reflexive_civilization_engine.md)：把系统推到文明级证明谱系与失败边界基础设施。
- **注意**：不要把 `v8-v11` 读成当前实现承诺；它们保留的是设计上行方向，不等于 `docs/current/` 已经承诺或实现这些层。

### v12*：bridge set

- [v12_convergence_to_current_boundary.md](./v12_convergence_to_current_boundary.md)：总收敛说明，定义当前最不误导的整体读法。
- [v12a_objectization_of_v7.md](./v12a_objectization_of_v7.md)：把 `v7` 的粗粒度语义拆成当前可审计对象与 contract 家族。
- [v12b_selective_v8_absorption.md](./v12b_selective_v8_absorption.md)：界定 `v8` 中哪些能力进入当前边界，哪些仍明确延后。
- [v12c_deferred_layers_v9_to_v11.md](./v12c_deferred_layers_v9_to_v11.md)：把 `v9-v11` 明确标成 deferred horizon，并给出进入条件思路。

### v13：历史生成式本体

- [v13_historical_generative_ontology.md](./v13_historical_generative_ontology.md)：在 v12 收敛之上的历史生成式本体层。

### docs/current：当前锚点

- [`../current/metamodel.md`](../current/metamodel.md)：当前语义锚点，不是设计史版本文件，但它是 `v1-v6` 收敛到现行 contract 语言的核心入口。
- `docs/current/` 整体应被读作当前 semantic/operational contract surface；凡与设计史存在张力时，以 `docs/current/` 的 contract 状态为准。

## Bridge Set 一句话说明

- [v12_convergence_to_current_boundary.md](./v12_convergence_to_current_boundary.md)：回答"历史设计最终在今天该如何被解释"。
- [v12a_objectization_of_v7.md](./v12a_objectization_of_v7.md)：回答"`v7` 主干怎样落到现在这组对象与合同上"。
- [v12b_selective_v8_absorption.md](./v12b_selective_v8_absorption.md)：回答"`v8` 只吸收了哪一小部分，边界卡在哪里"。
- [v12c_deferred_layers_v9_to_v11.md](./v12c_deferred_layers_v9_to_v11.md)：回答"为什么 `v9-v11` 仍是 horizon，而不是当前能力声明"。
- [v13_historical_generative_ontology.md](./v13_historical_generative_ontology.md)：回答"在 v12 收敛稳定之后，如何把历史本身当作生成式对象来治理"。
- [current-boundary-map.md](./current-boundary-map.md)：回答"每个历史节点在 `docs/current/` 中到底对应什么状态"。

## 与 `docs/current/` 的关系

- `docs/design_history/`：保存设计演化、架构意图、horizon 与收敛过程。
- `docs/current/`：定义当前 semantic contract、operational contract、draft/current/deferred 边界。
- `v12*` / `v13` 与 [current-boundary-map.md](./current-boundary-map.md)：负责把这两层接起来，避免把历史愿景误读为现行承诺。

## 当前能力边界

- 最安全的一句话结论：**当前项目不是 `v8-v11` 的全量实现，而是以 `v6` 的 lawful kernel 为底，以 [`../current/metamodel.md`](../current/metamodel.md) 为语义基座，以 `v7` 为主干骨架，并只选择性吸收 `v8` 中已能进入执行、审计与后续校准闭环的部分。**

## 阅读规则

- 读 `design_history/` 时，把它当作 append-only 设计史，而不是版本化产品说明书。
- 读 `docs/current/` 时，把它当作当前 contract surface；`current`、`draft`、`deferred` 标签比历史版本标题更重要。
- 当历史文本与当前 contract 看起来不一致时，先查 [`../current/metamodel.md`](../current/metamodel.md) 和 [current-boundary-map.md](./current-boundary-map.md)。
- 若目标是理解当前系统，优先走"`metamodel -> current-boundary-map -> v12* -> v13`"这条路径，而不是直接从 `v8-v11` 倒推现状。
