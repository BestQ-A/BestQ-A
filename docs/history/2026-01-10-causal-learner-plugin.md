# Causal Learner MCP Plugin 开发记录

**日期**: 2026-01-10
**状态**: ✅ 完成并验证 - 所有功能正常

---

## 项目概述

创建一个 **MCP Server 插件**，实现异常驱动的因果学习系统，让 Claude Code 能够：
1. 从 SWE-bench 历史 issue/fix 中**学习因果规则**
2. 用学到的规则**辅助解决新问题**
3. 通过 SWE-bench 分数**验证系统效果**

---

## 核心设计哲学

来自 `docs/causal-learner-design.md`:

```
Event = 现有 Cause Regulation 解释不了的"意外"
不是记录一切，而是只记录边界。
```

### 三层数据流

```
Observation Stream (原始观测流)
        │
        ▼
Explainer / Event Detector
        │ explained? → update regulation evidence
        │
        ▼
Event Pool (解释不了的意外)
        │
        ▼ (periodic)
Event Clustering → Induction → Validation → new Regulation
```

### 核心对象

- **Observation**: 一次观测输入（facts + context + raw refs）
- **Regulation**: 因果规则（pre/eff + evidence + scope）
- **Event**: 意外（Observation + attempted_explanations + unexplained_aspects）

---

## 技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 语言 | TypeScript | MCP SDK 最成熟 |
| 存储 | SQLite | 单文件零配置，快速验证 |
| 部署 | 本地 stdio | 最简单 |
| 评估 | SWE-bench | 作为学习数据源 + 效果验证指标 |

---

## 插件结构

```
E:\1_agents_space\9_AGI\BestQ-A\causal-learner\
├── .claude-plugin/
│   └── plugin.json              # 插件清单
├── .mcp.json                    # MCP server 配置
├── mcp-server/                  # TypeScript MCP Server
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts             # MCP 入口
│   │   ├── core/
│   │   │   ├── types.ts         # 数据结构
│   │   │   ├── unify.ts         # 谓词匹配
│   │   │   ├── explainer.ts     # 解释器（Beam Search）
│   │   │   ├── detector.ts      # Event 检测
│   │   │   ├── inducer.ts       # 规则归纳
│   │   │   ├── validator.ts     # 规则验证
│   │   │   └── storage.ts       # SQLite 存储
│   │   └── tools/               # MCP Tools
│   │       ├── observation.ts   # submit_observation
│   │       ├── query.ts         # list/get events/regulations
│   │       ├── induction.ts     # trigger_induction
│   │       └── swebench.ts      # SWE-bench 集成
│   └── data/
│       └── .gitkeep
├── schemas/                      # JSON Schemas
│   ├── observation.schema.json
│   ├── event.schema.json
│   └── regulation.schema.json
├── skills/
│   └── causal-learning/
│       ├── SKILL.md
│       └── references/
│           └── predicates.md
├── examples/
│   └── swebench/
└── README.md
```

---

## MCP Tools 设计

### 核心循环 Tools

| Tool | 功能 |
|------|------|
| `submit_observation` | 提交观测，自动尝试解释，失败则创建 Event |
| `trigger_induction` | 从聚类 Events 归纳新规则 |
| `resolve_events` | 用新规则标记已解释的 Events |

### SWE-bench 集成 Tools

| Tool | 功能 |
|------|------|
| `import_swe_issue` | 从 SWE-bench issue 创建 Observation |
| `record_fix` | 记录修复，更新规则证据 |
| `suggest_causes` | 根据现有规则推测可能的 root cause |

### 查询管理 Tools

| Tool | 功能 |
|------|------|
| `list_events` | 列出 Events（按状态筛选）|
| `get_event` | Event 详情 |
| `list_regulations` | 列出规则（按状态筛选）|
| `get_regulation` | 规则详情 |
| `add_regulation` | 手动添加种子规则 |
| `get_stats` | 系统统计 |

---

## 参考实现

位置: `E:\1_agents_space\9_AGI\BestQ-A\ref\causal-learner\`

由 GPT 实现的 Python 版本，包含：
- `templates/types.py` - 数据结构
- `templates/explainer.py` - Beam Search 解释器
- `templates/inducer.py` - 规则归纳
- `schemas/*.json` - JSON Schema 定义

**策略**: 全部用 TypeScript 重写，参考但不复制

---

## 实现计划

使用多个 sub agent 并行实现：

1. **Agent 1**: 核心类型 + 存储层 (`types.ts`, `storage.ts`)
2. **Agent 2**: 解释器 + 检测器 (`explainer.ts`, `detector.ts`, `unify.ts`)
3. **Agent 3**: 归纳器 + 验证器 (`inducer.ts`, `validator.ts`)
4. **Agent 4**: MCP Tools (`tools/*.ts`, `index.ts`)
5. **Agent 5**: Skill 文档 (`SKILL.md`, `references/`)

---

## 进度跟踪

- [x] Phase 1: Discovery - 理解需求
- [x] Phase 2: Component Planning - 规划组件
- [x] Phase 3: Detailed Design - 详细设计
- [x] Phase 4: Plugin Structure Creation - 创建目录结构
- [x] Phase 5: Component Implementation - 实现组件 ✅
  - [x] types.ts (550+ 行)
  - [x] storage.ts (590+ 行)
  - [x] unify.ts (138 行)
  - [x] explainer.ts (251 行)
  - [x] detector.ts (207 行)
  - [x] inducer.ts (225 行)
  - [x] validator.ts (202 行)
  - [x] core/index.ts (导出模块)
  - [x] tools/observation.ts (186 行)
  - [x] tools/query.ts (300 行)
  - [x] tools/induction.ts (488 行)
  - [x] tools/swebench.ts (543 行)
  - [x] src/index.ts (MCP 服务器入口)
  - [x] SKILL.md
  - [x] README.md
- [x] Phase 6: Validation & Quality Check - TypeScript 编译通过 ✅
- [x] Phase 7: Testing & Verification - 功能测试通过 ✅
- [x] Phase 8: Documentation - 文档完善 ✅

**插件已完成并可用！**

---

## 待解决问题

1. SWE-bench 数据如何获取和解析？
2. 谓词体系如何设计（针对代码 bug 场景）？
3. 如何评估因果规则的有效性？

---

## 更新日志

### 2026-01-10 (完成) ✅

**实现完成**：
- 完成所有核心模块实现 (7个核心模块，4个工具模块)
- 修复类型不匹配和 API 签名问题
- 切换到 sql.js（纯 JS SQLite，无需原生编译）
- TypeScript 编译成功
- MCP 服务器入口完成，提供 16 个 MCP Tools
- 插件可以通过 `npm run build && npm start` 启动

**功能验证通过**：
- ✅ 观测提交和事件创建
- ✅ 事件聚类（3个相似事件 → 1个聚类）
- ✅ 规则归纳（从聚类归纳出因果规则）
- ✅ 事件解决（3个事件从 open → resolved）
- ✅ 证据更新和规则生命周期管理

**测试结果示例**：
```
Events: 3 → Clusters: 1 → Regulations created: 1
归纳规则: [error.type=AttributeError, error.message=...] → [test.failed=true]
```

### 2026-01-10
- 完成需求分析和设计
- 确定技术栈：TypeScript + SQLite + MCP
- 确定评估方式：SWE-bench
- 开始创建插件结构
