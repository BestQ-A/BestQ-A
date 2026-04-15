# BestQ-A

BestQ-A 当前应被理解为一个以证据驱动的 world modeling / reasoning engine：它围绕可审计的语义对象、闭环流程与证据记录来组织“观测、修复、搜索”，而不是一个普通的 LLM 问答工具。

## 当前系统如何工作

系统的现行结构可概括为四层：

- **接口层**：对外暴露工具、兼容接口与调用入口。
- **流程层**：负责编排 `ProblemClass`、`Strategy`、`Skill`、`Story` 等运行时对象。
- **真相层**：以 `Atom / Ref / Shortcut` 作为单一事实源，承载可查询、可编译的知识图结构。
- **证据层**：以 append-only 的 `Evidence` 记录每条关系为什么成立、在什么上下文成立。

围绕这四层，当前有三条核心流程：

- `submitObservation`：接收观测输入，拆成事实原子，进行问题分类，创建 `Story`，再在约束后的子图中搜索候选解释路径。
- `recordFix`：把一次修复动作写回系统，通过合法性检查后编译路径、记录证据，并刷新只读投影视图。
- `search`：先分类查询，再从相关原子与已编译关系中检索候选路径，而不是对整个图做无约束搜索。

这意味着当前系统的基本工作方式不是“把问题直接丢给模型求答案”，而是：先路由问题类型，再约束搜索空间，再在图真相层上生成候选解释，最后把成功修复沉淀为可追溯证据。

## 当前已收敛的语义与流程契约

当前语义基座由五个并列模块组成：

- `ProblemClass`：问题是什么，负责分类与路由。
- `Strategy`：怎么理解和检索，负责上下文化与搜索协议。
- `Skill`：怎么做，负责有输入输出契约的执行能力。
- `Story/Case`：经历了什么，负责记录一次完整闭环案例。
- `Atom/Ref/Shortcut`：知道什么，负责图真相层及其缓存结构。

它们通过现行 pipeline 合同接到一起：观测进入系统，修复回写系统，搜索从系统中取出候选解释。`docs/current/` 中的这些合同描述的是当前已收敛的 contract surface，而不是未来愿景的投影。

## 当前能力边界

理解当前边界时，最不误导的一句话是：

> `v6 lawful kernel + docs/current/metamodel.md semantic base + v7 backbone + selective v8 absorption`

这句话的含义是：

- 当前稳定内核来自 `v6` 的 lawful relation / compile 约束。
- 当前语义锚点以 `docs/current/metamodel.md` 为准，而不是直接按历史版本名理解系统。
- 当前主干读法已转向 `v7 backbone`，但相关 specialized contract 仍存在 `current` 与 `draft` 并存的边界。
- `v8` 只做选择性吸收；凡不能进入执行、审计和后续校准闭环的部分，不应被表述成现有能力。
- `v9-v11` 仍是 horizon，不应被写成当前实现或近期已兑现能力。

因此，BestQ-A 当前可以被准确描述为“证据驱动的世界建模 / 推理内核”，但不应被夸大成已经完整实现 `v8-v11` 全层栈。

## 文档地图

- `docs/current/metamodel.md`：当前语义底座，定义五个并列模块。
- `docs/current/architecture-overview.md`：当前架构总览，定义四层结构与读写路径。
- `docs/current/pipeline-contract.md`：当前流程合同，定义 `submitObservation`、`recordFix`、`search` 三条主流程。
- `docs/design_history/README.md`：设计史入口，说明“当前 contract”与“历史 horizon”应如何区分阅读。
- `docs/design_history/current-boundary-map.md`：把各历史版本映射到当前可辩护边界，回答哪些是 current、哪些只是 deferred horizon。

## 推荐阅读顺序

面向第一次接触项目的读者，建议按下面顺序阅读：

1. `docs/current/metamodel.md`：先建立当前对象语言，知道系统到底由哪些一等对象构成。
2. `docs/current/architecture-overview.md`：再看这些对象如何分布在四层结构里、读写路径怎么走。
3. `docs/current/pipeline-contract.md`：然后理解系统实际如何围绕三条主流程运转。
4. `docs/design_history/README.md`：再补设计史的阅读规则，避免把历史文本误当当前承诺。
5. `docs/design_history/current-boundary-map.md`：最后用边界映射表校准“现状、吸收部分、延后 horizon”之间的区别。

## 阅读这份仓库时的判断原则

- 先区分 **当前 contract** 与 **历史地平线**：前者看 `docs/current/`，后者看 `docs/design_history/`。
- 先用语义对象理解系统，再用版本名理解其来源；不要直接从 `v8-v11` 倒推现状。
- 任何超出 `docs/current/` 已收敛合同的表述，都应默认视为设计方向，而不是当前能力声明。
