---
kind: contract
status: draft
phase: 5
revision: 0.2
schema_version: 1
describes: "双通道 plugin 分发边界"
---

# Plugin Surface 合同：双通道分发与 host-agnostic 边界

> 本文档定义 BestQ-A 核心能力通过 **MCP server** 与 **opencode plugin** 双通道分发时的边界、命名不变量、状态共享规则与生命周期绑定。
> 核心原则：一份 host-agnostic TypeScript 核心 + 两层 thin adapter，禁止任一 adapter 层承载业务逻辑。
> 代码位置：`causal-learner/mcp-server/src/index.ts`（MCP 通道，已存在） + `packages/bestqa-opencode-plugin/`（opencode 通道，Phase 5 新建）
> 上游依赖：[pipeline-contract.md](pipeline-contract.md)、[memory-layer-current.md](memory-layer-current.md)、[memory-layer-target.md](memory-layer-target.md)、[artifact-contract.md](artifact-contract.md)、[compile-promotion-contract.md](compile-promotion-contract.md)
> SSOT 绑定：[../external-integration.md](../external-integration.md) 冲突 F
>
> **0.2 版**：与拆分后的 [memory-layer-current.md](memory-layer-current.md) / [memory-layer-target.md](memory-layer-target.md) 同步命名——§2 所有"检索能力"一列直接列 44 个真实 MCP tool 名，不再使用 `case_memory.*` / `regulation_store.*` / `knowledge_index.*` / `simplemem.*` 这些概念占位；并关闭 v0.1 遗留的 4 条 TBD 中可核实的 3 条。

---

## 1. Host-agnostic 核心边界

### 1.1 三层架构

```
┌──────────────────────────────────────────────────┐
│ Host runtime (Claude Code | opencode)            │  ← 宿主，不可触碰
├──────────────────────────────────────────────────┤
│ Adapter (mcp-server/src/index.ts |               │  ← thin：仅做协议转换
│          bestqa-opencode-plugin/src/index.ts)    │
├──────────────────────────────────────────────────┤
│ Core (causal-learner/mcp-server/src/core/*       │  ← SSOT：全部业务逻辑
│       causal-learner/mcp-server/src/tools/*)     │
└──────────────────────────────────────────────────┘
```

### 1.2 层级职责

| 层 | 必须做 | 禁止做 |
|----|-------|--------|
| Core | Pipeline 编排、RefAlgebra、Atom/Ref 写入、Case/Lesson/Regulation/KB 读写、fingerprint、retrieval 串行顺序 | 感知 host、感知协议（MCP/JSON-RPC/plugin hook）、写日志到 host console |
| Adapter | 协议转换（MCP `CallToolRequest` ↔ Core 函数调用 / opencode `ToolDefinition.execute` ↔ Core 函数调用）、参数 zod 校验、错误包装为宿主协议帧 | **任何业务逻辑**，包括：改写 retrieval order、合并/拆分结果、额外的缓存层、自定义 fingerprint、重写 compile promotion |

### 1.3 硬禁令

| # | 禁令 | 违反示例 | 处置 |
|---|------|----------|------|
| H1 | adapter 层不得 import Pipeline 以外的 core 子模块并重新编排 | adapter 自己调 `AtomGraph.explore` 再拼 story | code review 阶段 revert |
| H2 | adapter 层不得拥有独立状态（Map/WeakMap/文件/DB） | plugin 自己缓存 observation id | revert |
| H3 | adapter 层不得为不同 host 引入分支业务逻辑（`if host === 'opencode'`） | 分支给 opencode 跳过 classify | revert |
| H4 | core 层不得 import 任何 `@modelcontextprotocol/sdk` 或 `@opencode-ai/*` 包 | Pipeline 直接返回 MCP `Content[]` | revert |
| H5 | 任一通道不得自建 SQLite / SimpleMem 实例 | plugin 启动时 `createStorage()` 指向新路径 | revert |

---

## 2. 双通道 Surface 映射表

源：`causal-learner/mcp-server/src/index.ts` 的 `TOOLS` 数组（共 **44** 个 tool，行号 L150–L664 逐项核对），每一项都必须同时在 opencode plugin 的 `Hooks.tool` 中有同名注册。

**命名 SSOT**：本合同 §2 与 [memory-layer-current.md](memory-layer-current.md) §2 的工具名一一对应，以 memory-layer-current §2 为 SSOT；任何检索层概念（如"case memory"、"kb index"）**禁止**以占位名出现在本表，只能以 `— (Phase N)` 形式标记目标列。

"当前 vs 目标"列语义：
- **current** = 此 tool 在 `src/index.ts` 的 `TOOLS` 数组中已注册
- **target (Phase N)** = 尚未实现，Phase N 落地后回表登记；当前该行 MCP 通道列写 `— (Phase N)`，opencode 通道列同步写 `— (Phase N)`

| # | 能力 | MCP 通道调用 | opencode plugin 通道调用 | 当前 vs 目标 | 语义不变量 |
|---|------|--------------|--------------------------|--------------|------------|
| 1 | 提交观测 | tool `submit_observation` | `tool.submit_observation` | current | 同名同参；返回 `ObservationResult`；必须创建 Event |
| 2 | 批量观测 | tool `batch_submit_observations` | `tool.batch_submit_observations` | current | 元素逐条等价于单次 submit_observation |
| 3 | 重评估事件 | tool `reevaluate_event` | `tool.reevaluate_event` | current | 幂等：状态未变则返回当前状态 |
| 4 | 列事件 | tool `list_events` | `tool.list_events` | current | status/limit 语义完全对齐 |
| 5 | 取事件 | tool `get_event` | `tool.get_event` | current | 空返回 `null` 而非 throw |
| 6 | 列规则 | tool `list_regulations` | `tool.list_regulations` | current | 同枚举 `candidate｜hypothesis｜confirmed｜retired` |
| 7 | 取规则 | tool `get_regulation` | `tool.get_regulation` | current | 同 5 |
| 8 | 添加规则 | tool `add_regulation` | `tool.add_regulation` | current | 走 compile-promotion-contract 的写入门控 |
| 9 | 更新事件状态 | tool `update_event_status` | `tool.update_event_status` | current | 受 Pipeline 不变量 O2 保护 |
| 10 | 更新规则 | tool `update_regulation` | `tool.update_regulation` | current | partial update 语义一致 |
| 11 | 删除规则 | tool `delete_regulation` | `tool.delete_regulation` | current | 软删或硬删需与核心一致 |
| 12 | 按效果查规则（检索：memory-layer-current §2） | tool `get_regulations_for_effect` | `tool.get_regulations_for_effect` | current | 按 effect 谓词精确查，只读 |
| 13 | 按前件查规则（检索：memory-layer-current §2） | tool `get_regulations_with_precondition` | `tool.get_regulations_with_precondition` | current | 按 precondition 谓词精确查，只读 |
| 14 | 单层统计 | tool `get_stats` | `tool.get_stats` | current | 同一 JSON schema（见 metrics-contract §1） |
| 15 | 搜事件（检索：memory-layer-current §2） | tool `search_events` | `tool.search_events` | current | 纯谓词匹配，只读 |
| 16 | 搜规则（检索：memory-layer-current §2） | tool `search_regulations` | `tool.search_regulations` | current | 纯谓词匹配，只读 |
| 17 | 触发归纳 | tool `trigger_induction` | `tool.trigger_induction` | current | options 必须完全对齐 |
| 18 | 手动聚簇 | tool `create_cluster` | `tool.create_cluster` | current | 返回 cluster + 可选 regulation |
| 19 | 导入 SWE issue | tool `import_swe_issue` | `tool.import_swe_issue` | current | 同 |
| 20 | 记录修复 | tool `record_fix` | `tool.record_fix` | current | 走 Pipeline recordFix 流程，不变量 O4/O5/O6/O7 |
| 21 | 建议原因（检索：memory-layer-current §2） | tool `suggest_causes` | `tool.suggest_causes` | current | 对给定效果返回候选原因集合，只读 |
| 22 | SWE 批量分析 | tool `analyze_swe_batch` | `tool.analyze_swe_batch` | current | 同 |
| 23 | 刷写长期 | tool `flush_to_longterm` | `tool.flush_to_longterm` | current | 仅 dual-layer 有效；test_mode 下被阻断 |
| 24 | 双层统计 | tool `get_dual_stats` | `tool.get_dual_stats` | current | 同一 JSON schema（metrics-contract §1 的采集入口） |
| 25 | 重置会话 | tool `reset_session` | `tool.reset_session` | current | 仅清短期，长期保留 |
| 26 | 长期统计 | tool `get_longterm_stats` | `tool.get_longterm_stats` | current | 同 |
| 27 | 因果搜索（检索：memory-layer-current §2） | tool `causal_search` | `tool.causal_search` | current | ReAct loop，strategy 枚举完全一致 |
| 28 | 模糊搜规则（检索：memory-layer-current §2） | tool `fuzzy_search_regulations` | `tool.fuzzy_search_regulations` | current | threshold 默认值统一 30 |
| 29 | 模糊搜事件（检索：memory-layer-current §2） | tool `fuzzy_search_events` | `tool.fuzzy_search_events` | current | 同 28 |
| 30 | 构建知识簇 | tool `build_knowledge_cluster` | `tool.build_knowledge_cluster` | current | 事件聚类，**不是** knowledge-source-contract 的 composites 索引 |
| 31 | 搜知识簇 | tool `search_knowledge_clusters` | `tool.search_knowledge_clusters` | current | 同 30 |
| 32 | 证据采样 | tool `sample_evidence` | `tool.sample_evidence` | current | topK 默认 3 |
| 33 | 加原子 | tool `add_atom` | `tool.add_atom` | current | kind 枚举对齐 |
| 34 | 加引用 | tool `add_ref` | `tool.add_ref` | current | kind 枚举对齐（9 种） |
| 35 | 发散探索（检索：memory-layer-current §2） | tool `explore_graph` | `tool.explore_graph` | current | maxDepth=3、maxPaths=10 默认统一 |
| 36 | 编译路径 | tool `compile_path` | `tool.compile_path` | current | 走 RefAlgebra 合法性门控 |
| 37 | 髓鞘化 | tool `myelinate_graph` | `tool.myelinate_graph` | current | 默认 minUseCount=3、minWeight=0.6 |
| 38 | 图查询（检索：memory-layer-current §2） | tool `query_graph` | `tool.query_graph` | current | operation 枚举完全对齐 |
| 39 | 查原子（检索：memory-layer-current §2） | tool `find_atoms` | `tool.find_atoms` | current | 同 |
| 40 | 图统计 | tool `graph_stats` | `tool.graph_stats` | current | 同一 JSON schema（metrics-contract §1） |
| 41 | 剪枝 | tool `prune_graph` | `tool.prune_graph` | current | 默认 minWeight=0.1 |
| 42 | 摄入事实 | tool `ingest_facts` | `tool.ingest_facts` | current | Atom 唯一写入口（Pipeline 不变量 O3） |
| 43 | 测试模式 | tool `set_test_mode` | `tool.set_test_mode` | current | 开启后 flush 必须被阻断 |
| 44 | 加载相关知识（检索：memory-layer-current §2） | tool `load_relevant_knowledge` | `tool.load_relevant_knowledge` | current | 仅 dual-layer 有效；**有**短期缓存写副作用（见 [memory-layer-current.md](memory-layer-current.md) §2） |
| T1 | Case memory lookup | — (Phase 3) | — (Phase 3) | target | 见 memory-layer-target §2 #1；待 `core/case-memory.ts` + `cases` 表落地后回表登记 |
| T2 | Lesson ledger append / query | — (Phase 3) | — (Phase 3) | target | 见 memory-layer-target §2 #5；待 `core/lesson-ledger.ts` + `lessons` 表落地后回表登记 |
| T3 | Knowledge index search（composites） | — (Phase 2) | — (Phase 2) | target | 见 memory-layer-target §2 #3；待 `core/knowledge-index.ts` + `kb_*` 表落地后回表登记（注意 #30/#31 的 `build_knowledge_cluster` / `search_knowledge_clusters` **不是**同一层） |
| T4 | SimpleMem semantic_search | — (Phase ≥2) | — (Phase ≥2) | target | 见 memory-layer-target §2 #4；只读兜底，仓内 0 集成点 |
| T5 | 统一 retrieve() 入口 | — (Phase 3) | — (Phase 3) | target | 见 [memory-layer-target.md](memory-layer-target.md) §2；五层串行命中即停的单点入口，当前各调用方自行组合 [memory-layer-current.md](memory-layer-current.md) §2 工具 |

### 2.1 命名不变量

| 不变量 | 说明 |
|--------|------|
| **N1** | MCP tool `name` === opencode `Hooks.tool[key]`，**字符完全相等**（snake_case，无前缀） |
| **N2** | 参数字段名（如 `eventId`、`observationId`、`minScore`）在两通道 zod schema 内一致，禁止 camelCase ↔ snake_case 转换 |
| **N3** | 枚举值（`open｜clustered｜resolved｜archived` 等）必须 literal 对齐，不得本地化 |
| **N4** | 默认值对齐（见上表语义不变量列） |
| **N5** | 返回载荷结构完全一致；opencode adapter 需把 JSON string 化为 plugin 所需的 `string` 返回（`ToolDefinition.execute: Promise<string>`，见 `external/opencode/packages/plugin/src/tool.ts` L30-35），但原始 JSON 必须先经 core 返回再序列化 |
| **N6** | target 行（T1–T5）在落地前**不得**在任一通道伪造工具名占位——留空意味着调用方必须走 §2A 的真实工具 |

---

## 3. 持久化共享规则

### 3.1 单一物理存储

| 资源 | 唯一实例位置 | 两通道如何访问 |
|------|--------------|----------------|
| causal SQLite（单层） | `$CAUSAL_DB_PATH`，默认 `data/causal.db` | 两通道共用同一文件路径；**禁止** plugin 在 `packages/bestqa-opencode-plugin/data/` 下新建 db |
| 短期 SQLite（双层模式） | `:memory:`（进程内） | 同一 Node 进程内共享；跨进程时短期必须是空的 |
| 长期 SQLite（双层模式） | `$CAUSAL_LONGTERM_DB_PATH` | 两通道共用同一文件路径 |
| SimpleMem | 外部 MCP Server（见 external-integration.md #1） | 两通道通过 `memoryRef` 引用，**绝不**在两通道间复制原文 |
| knowledge_base composites | `docs/knowledge_base/composites/**` | 源码仓版本控制；plugin 绝不生成第二份 |

### 3.2 共享模式

| 场景 | 约束 |
|------|------|
| Claude Code + opencode **同时运行** | 必须由同一个 BestQA 后端进程服务两侧；若分进程，则必须共享 `$CAUSAL_LONGTERM_DB_PATH` 且任一方开启 `test_mode` 时另一方不得 flush |
| `test_mode` 语义 | 两通道看到的 test_mode 状态必须一致，禁止 per-host 开关 |
| 写入并发 | SQLite WAL + core 层事务保证；adapter 不得自己加锁 |

### 3.3 硬禁令

- 禁止为 opencode 分发另建一份 knowledge_base（见 external-integration.md 冲突 F 第 3 条）
- 禁止 plugin 启动时做"数据迁移"
- 禁止 plugin `chat.message` hook 里写 Atom（必须走 `submit_observation` / `ingest_facts`）

---

## 4. 生命周期绑定

opencode plugin 是 `Plugin = (input, options) => Promise<Hooks>`，其中 `PluginInput = { client, project, directory, worktree, serverUrl, $ }`（源：`external/opencode/packages/plugin/src/index.ts` L27-34）。以下绑定必须成立：

### 4.1 启动绑定

| opencode hook / 时机 | 核心动作 | 约束 |
|--------------------|---------|------|
| `Plugin(input)` 首次调用 | 通过 `input.directory` + `input.worktree` 解析 `$CAUSAL_DB_PATH` / `$CAUSAL_LONGTERM_DB_PATH`；调用 core 的 `createStorage` / `createDualStorage` | **禁止**创建新 db；若 env 未设则落在 `<worktree>/data/causal.db`，与 MCP 通道默认路径对齐 |
| `config` hook | 读取 opencode 配置中的 BestQA 段（见 §5），验证版本兼容 | 不一致立即抛错，不得降级继续 |

### 4.2 会话/轮次绑定

| opencode hook | 核心动作 | 约束 |
|--------------|---------|------|
| `chat.message` | 可选：把用户消息转成 `submit_observation` 的候选 observation，但**默认关闭**，只在用户显式启用时才写 | 写入必须走 core `submitObservationTool`，禁止在 hook 内直接操作 storage |
| `tool.execute.before` | 记录即将调用的 tool name（用于审计）；对危险 tool（如 `delete_regulation`）调用 `ctx.ask` 征得许可 | 不得修改 `output.args` 里的业务字段 |
| `tool.execute.after` | 把 `output.output`（字符串）与 `output.metadata` 回写到 `artifacts/<run_id>/`（见 artifact-contract.md） | 禁止二次调用 core 生成额外数据 |
| `experimental.session.compacting` | **仅**在 `output.context` 追加 BestQA 的 lesson-ledger summary（append 语义）；**禁止**设置 `output.prompt`（会整体替换默认 compaction prompt，与 opencode 原生摘要冲突） | 见下方 R1；不触发 `flush_to_longterm`——compacting 语义是"压缩上下文"，与长期库刷写无关 |

> **R1（`experimental.session.compacting` 语义核对）**：
> 源 `external/opencode/packages/plugin/src/index.ts` L263-273 定义 `(input: {sessionID}, output: {context: string[]; prompt?: string}) => Promise<void>`，注释明确"Called before session compaction starts. Allows plugins to customize the compaction prompt. `context`: Additional context strings appended to the default prompt. `prompt`: If set, replaces the default compaction prompt entirely"。
> 结论：这是一个**在压缩开始前** customization hook，不是 flush 触发器。BestQA 的响应方式是**只**往 `output.context` push 一到两条字符串（例如近 N 条 lesson ledger 的摘要），**永远不要**写 `output.prompt`——后者会覆盖 opencode 原生 compaction prompt。flush_to_longterm 的触发点另见 §4.3。

### 4.3 关闭绑定

| 时机 | 动作 |
|------|------|
| 进程 SIGINT / SIGTERM | 与 MCP 通道 `shutdown()`（`mcp-server/src/index.ts:1063-1069`）语义对齐；若 dual-layer 且非 test_mode：在 signal handler 内 `flush_to_longterm` → `storage.close()` |
| opencode session 切换 / worktree 退出 | 不保证有回调（见 R2）；不得依赖 hook 做 flush |

> **R2（plugin dispose 路径）**：
> 核对 `external/opencode/packages/plugin/src/index.ts` L189-282 的 `Hooks` interface，**没有** `dispose` / `shutdown` / `close` / `onExit` 任何卸载回调；`PluginModule = { id?, server, tui? }`（L44-48）也没有模块级 dispose。opencode 目前依赖 Node 进程退出触发默认清理。
> 结论：BestQA plugin 不得假设存在显式 dispose 钩子。flush 策略只能绑定到以下两条路径之一：(a) 进程级 `process.on('SIGINT'|'SIGTERM')` handler（与 MCP 通道一致）；(b) `tool.execute.after` 的低频采样点（每 N 次调用做一次 `flush_to_longterm`）。优先选 (a)。
> 遗留 TBD：若 opencode 后续为 `Hooks` interface 追加 `dispose?: () => Promise<void>`，本合同 §4.3 回表登记并把 flush 迁入其中。

### 4.4 PluginModule 形态选择

opencode `PluginModule = { id?: string; server: Plugin; tui?: never }`（源：`external/opencode/packages/plugin/src/index.ts` L44-48）。当前 `tui?: never` 明确保留位——**不**是 opencode 直接支持 tui 插件；tui-side plugin module 需在 `external/opencode/packages/plugin/src/tui.ts` 另行构造（该文件存在，但目前只做 opentui 组件导出，不是 PluginModule 工厂）。

BestQA 插件：
- **必须**实现 `server` 形态（跑核心逻辑）
- **不**实现 `tui` 形态，直到 opencode 放宽 `PluginModule.tui` 类型

<!-- audit-ignore: missing-file: plugin/src/tui.ts -->
<!-- audit-ignore: missing-file: plugin/src/tool.ts -->

---

## 5. 配置与发现

### 5.1 插件清单字段

opencode `Config.plugin` 是 `Array<string | [string, PluginOptions]>`（源：`external/opencode/packages/plugin/src/index.ts` L38-40）。BestQA 插件的 options schema：

```jsonc
{
  "plugin": [
    ["bestqa-opencode-plugin", {
      "coreVersion": "^0.1.0",           // 与 core package.json 对齐
      "dbPath": "./data/causal.db",       // 可选，覆盖 $CAUSAL_DB_PATH
      "longtermDbPath": null,             // null=单层，string=启用双层
      "testMode": false,
      "enableObservationCapture": false,  // §4.2 chat.message 开关，默认关
      "retrievalLayers": "auto"           // 留给未来扩展；当前只能是 "auto"
    }]
  ]
}
```

### 5.2 版本兼容策略

| 维度 | 规则 |
|------|------|
| core version | `causal-learner/mcp-server/package.json` 的 `version` 是 SSOT |
| plugin version | `packages/bestqa-opencode-plugin/package.json`，**必须** `=== coreVersion` 或 caret 兼容 |
| MCP version | 同 core version |
| 三者 drift | CI 必须检查三个版本；drift > caret 兼容范围直接 fail |
| `@opencode-ai/plugin` peer | **锁定 `= 1.4.3`**（`external/opencode/packages/plugin/package.json` 当前 version）。Phase 5 启动时若上游已升至新 minor，走 ADR 之后再放宽到 `^1.4.3`；禁止写 `^1` 或 `*` |
| `@opencode-ai/sdk` peer | 上游以 `workspace:*` 依赖（`external/opencode/packages/plugin/package.json` L20），无独立 semver。BestQA 插件**不直接**依赖 `@opencode-ai/sdk`，所有 SDK 类型通过 `@opencode-ai/plugin` 的 re-export 间接引用。这条是对"绝不自行 npm install @opencode-ai/sdk"的硬约束 |
| `@opentui/core` / `@opentui/solid` peer | 上游声明 `>=0.1.97` optional（同 L26-34）；BestQA 插件 **不** 启用 tui 形态（§4.4），故不需要任何 opentui 依赖 |

### 5.3 发现顺序

1. opencode 读 `opencode.json` 的 `plugin` 数组
2. 对每个 spec 调 `loadPlugin(spec)` → 得 `PluginModule`
3. 若 `module.server`：在 Node 侧执行 `Plugin(input, options)` → 得 `Hooks`
4. opencode 把 `Hooks.tool` 合并进全局 tool 注册表
5. MCP 通道独立启动，不参与 opencode plugin 发现

---

## 6. 错误传播

### 6.1 核心 Error 类型

Core 层应**唯一**抛出以下族错误（现状：尚未统一，散落在各 tool.ts 里，Phase 5 前必须收敛）：

```
CoreError
├── InvariantViolation   // O1~O7 等 Pipeline 不变量
├── RefAlgebraRejection  // compile 路径非法
├── StorageError         // SQLite/SimpleMem I/O
├── NotFound             // id 查无
└── BadInput             // zod 校验失败
```

### 6.2 通道格式

| 通道 | 错误帧格式 | 出处 |
|------|------------|------|
| MCP | `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }` | `mcp-server/src/index.ts:1053-1058` |
| opencode plugin | `ToolDefinition.execute` throw（opencode 自己包装成 tool error part） | `external/opencode/packages/plugin/src/tool.ts:30-35` |

### 6.3 传播不变量

| # | 不变量 | 说明 |
|---|--------|------|
| E1 | Core 错误消息文本在两通道**完全相同** | adapter 不得改写 `err.message` |
| E2 | `InvariantViolation` 必须导致 tool 调用失败，不得被 adapter 降级为 warning | |
| E3 | `BadInput` 在 adapter 层由 zod 捕获后，错误字段路径必须携带到 host（两通道都带） | |
| E4 | `StorageError` 必须触发 dual-layer 的自动回滚（core 层职责），adapter 不得重试 | |

---

## 7. Phase 5 启动前置 Checklist

Phase 5 开工前必须勾完：

- [ ] **C1** [artifact-contract.md](artifact-contract.md) 冻结（plugin `tool.execute.after` 写产物依赖此）
- [x] **C2** [memory-layer-current.md](memory-layer-current.md) + [memory-layer-target.md](memory-layer-target.md) 冻结 + 命名映射闭合（本合同 §2 已与 memory-layer-current §2 一一对应，memory-layer-target §2 为 target 占位，N6 不变量硬约束 target 行禁止伪造工具名）
- [ ] **C3** [compile-promotion-contract.md](compile-promotion-contract.md) 冻结（`record_fix` 两通道语义一致的前提）
- [ ] **C4** [pipeline-contract.md](pipeline-contract.md) 的 7 条 Pipeline 不变量（O1~O7）全部在 core 层 assertion 化
- [ ] **C5** [knowledge-source-contract.md](knowledge-source-contract.md) 冻结（`kb_*` 表 schema 不再漂移）
- [ ] **C6** core 层收敛 Error 类型到 §6.1 的 5 族
- [ ] **C7** `causal-learner/mcp-server/src/core/*` 与 `src/tools/*` 清扫所有 `@modelcontextprotocol/sdk` 残留 import（当前 adapter 与 tool 层边界模糊，需审）
- [x] **C8** `experimental.session.compacting` 语义已核对（§4.2 R1，customize compaction prompt，不触发 flush）；opencode plugin dispose 路径已核对（§4.3 R2，`Hooks` interface 无卸载回调，绑进程信号）
- [x] **C9** 锁定 `@opencode-ai/plugin` 至 `= 1.4.3`，`@opencode-ai/sdk` 不直接依赖（§5.2）；遗留：上游若升 minor 仍需走 ADR 放宽
- [ ] **C10** 建立 44 个 tool 的 cross-channel contract test（同一输入 → 两通道返回完全相同的 JSON）

未勾满任何一条，Phase 5 不得开工；部分勾完启动 = 直接 revert 分支。

---

## 8. 变更流程

### 8.1 新增 tool

1. 先在 core 层（`src/tools/*.ts`）实现 + 单测
2. 在 MCP adapter (`mcp-server/src/index.ts` 的 `TOOLS` 数组 + switch case) 暴露
3. 在 opencode plugin adapter 同步暴露（**同名同参**）
4. 更新本合同 §2 表格追加一行
5. 在 cross-channel contract test 中追加一条
6. 若新 tool 属于 [memory-layer-current.md](memory-layer-current.md) §2 的检索面，必须同步在 [memory-layer-current.md](memory-layer-current.md) §2 登记

### 8.2 改 tool 签名

1. 走 ADR
2. 同步两通道 adapter + 本合同 §2 + 版本号 bump（core/MCP/plugin 一起 bump）
3. CI 的 cross-channel test 必须先挂红再修复，证明改动被捕获

### 8.3 删 tool

1. 先标 deprecated（两通道同时）
2. 保留 1 个 minor version 的双写期
3. 删除时在本合同 §2 表格保留一行标记 "removed in vX.Y"

### 8.4 target 行迁 current

1. target 行（T1–T5 或后续追加）落地时，必须同步 [memory-layer-current.md](memory-layer-current.md) §2 与本合同 §2
2. MCP 通道列与 opencode 通道列从 `— (Phase N)` 改写成真实 tool 名
3. 新建 cross-channel contract test

### 8.5 改配置 schema

1. `coreVersion` 必须 bump minor
2. 本合同 §5.1 必须先更新，再改代码
3. opencode 插件 options 的字段名**不得**与 MCP 环境变量冲突（例：`dbPath` ↔ `CAUSAL_DB_PATH` 是允许的别名，但不得语义不一致）

---

## 9. 变更记录

| 版本 | 日期 | 变更 |
|------|------|------|
| 0.1 (draft) | 2026-04-13 | 初稿：双通道边界、44 tool 映射、生命周期、持久化共享、Phase 5 前置 checklist |
| 0.2 (draft) | 2026-04-13 | 与重写后的 memory-layer-contract.md 同步命名；删除 §2.2 红字 TODO 与 4 类概念占位（`case_memory.*` / `regulation_store.*` / `knowledge_index.*` / `simplemem.*`），新增 N6 不变量；§2 表格新增"当前 vs 目标"列并追加 5 行 target 占位（T1–T5）；关闭 §4.2 / §4.3 / §5.2 共 3 条 TBD（核 `experimental.session.compacting` 语义、`Hooks` 无 dispose 回调、锁 `@opencode-ai/plugin = 1.4.3`），§4.3 剩余一条 TBD 改写为精确的"上游若追加 dispose 则迁入"；checklist C2/C8/C9 标记 ✅；修正 `tool.ts` / `tui.ts` 引用路径为 `external/opencode/packages/plugin/src/...`，并加 `audit-ignore` 压制 audit 对旧 basename 的 warning |

---

## 参考

- [pipeline-contract.md](pipeline-contract.md) — Pipeline 编排与不变量 O1~O7
- [memory-layer-current.md](memory-layer-current.md) — 现状 retrieval surface 与 regulation 写入闭环
- [memory-layer-target.md](memory-layer-target.md) — Phase 3+ 五层串行 retrieval 目标设计
- [metrics-contract.md](metrics-contract.md) — §1 stats 真实来源；`get_stats` / `get_dual_stats` / `graph_stats` 的采集口径
- [artifact-contract.md](artifact-contract.md) — `tool.execute.after` 的写入规范
- [compile-promotion-contract.md](compile-promotion-contract.md) — `record_fix` 走的路径合法性门控
- [contract-audit-contract.md](contract-audit-contract.md) — status / audit-ignore 规则
- [../external-integration.md](../external-integration.md) 冲突 F — 宿主运行时 / 分发通道重叠裁决
- `external/opencode/packages/plugin/src/index.ts` — opencode plugin API 权威定义（Hooks L189-282、PluginModule L44-48、experimental.session.compacting L263-273）
- `external/opencode/packages/plugin/src/tool.ts` — `ToolDefinition.execute: Promise<string>` 签名 L30-35
- `external/opencode/packages/plugin/package.json` — `@opencode-ai/plugin` v1.4.3 的 dependency 与 peer 声明
- `causal-learner/mcp-server/src/index.ts` — MCP 通道现有实现，`TOOLS` 数组 L150-664
