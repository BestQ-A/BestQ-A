# 🧠 Causal Learner - 异常驱动的因果学习系统

**Claude Code MCP 插件** | 从"意外"中学习因果规律

[![Status](https://img.shields.io/badge/status-beta-blue)]()
[![Platform](https://img.shields.io/badge/platform-WSL%20%7C%20Linux-green)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

---

## 🎯 核心理念

### 异常驱动学习

```
Event = 现有 Cause Regulation 解释不了的"意外"
```

**不是记录一切，而是只记录边界。**

- ✅ 能解释的观测 → 更新规则证据
- ⚠️ 无法解释的观测 → 创建 Event，等待学习
- 🔄 新规则 → 解决旧 Events（知识缺口被填补）

### 谓词自然涌现

**不预定义谓词体系**，从原始描述中让结构自然涌现：

```
自然语言描述 (Phase 0)
   ↓ 关键词提取
关键词向量 (Phase 1)
   ↓ 统计聚类
候选谓词 (Phase 2)
   ↓ 验证晋升
结构化谓词体系 (Phase 3)
```

**类比人类学习**：先积累具体经验 → 发现模式 → 抽象概念

详见：[docs/predicate-evolution-philosophy.md](docs/predicate-evolution-philosophy.md)

---

## 🚀 快速开始

### 推荐环境：WSL / Linux

**为什么？**
- better-sqlite3 原生性能（5-10x 提升）
- 无编码问题（UTF-8 原生）
- 更好的工具链兼容性

**Windows 用户**：
1. 阅读 [`MIGRATE-TO-WSL.md`](MIGRATE-TO-WSL.md) - 详细迁移指南
2. 或查看 [`WSL-QUICK-REF.md`](WSL-QUICK-REF.md) - 快速参考卡片

### 30 秒快速开始（WSL）

```bash
cd /mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner/mcp-server

# 安装并构建
npm install && npm run build

# 运行测试
node test-basic.mjs

# 预期：✅ 8 observations → 2 regulations → 8 events resolved
```

### 完整工作流（5 分钟）

```bash
# 1. 下载 SWE-bench 数据
cd /mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner
pip3 install datasets huggingface_hub
python3 scripts/download-swebench.py

# 2. 批量导入和学习
cd mcp-server
node scripts/import-swebench.mjs ../data/swebench/swebench_verified.json 50

# 3. 性能评估
node scripts/evaluate.mjs ../data/swebench/swebench_verified.json 50

# 4. 可视化
node scripts/visualize.mjs data/causal.db
# 打开：visualization/dashboard.html
```

---

## 📊 功能特性

### ✅ 已实现

**核心引擎**：
- 🔍 Beam Search 解释器（后向链推理）
- 🎯 Event 检测器（识别知识缺口）
- 📊 规则归纳器（聚类学习）
- ✓ 规则验证器（证据管理、生命周期）
- 💾 SQLite 存储（sql.js / better-sqlite3）

**谓词演化**（Phase 1）：
- 🔤 TF-IDF 关键词提取
- 📐 余弦相似度聚类
- 🧬 混合特征（error patterns + keywords）
- 🌱 候选谓词发现（从统计模式涌现）

**SWE-bench 集成**：
- 📥 数据下载（Hugging Face）
- 🔄 批量导入（500 samples）
- 📈 性能评估框架
- 🎨 可视化 dashboard

**MCP Tools**（16 个）：
- `submit_observation`, `trigger_induction`
- `list_events`, `list_regulations`
- `import_swe_issue`, `suggest_causes`
- 等（完整列表见 QUICKSTART.md）

### 🔜 规划中

- Phase 2-3：谓词结构化演化
- 增强可视化（D3.js 规则网络图）
- SWE-bench 分数对比测试
- 增量学习优化

---

## 📂 项目结构

```
causal-learner/
├── README.md                           # 本文件
├── QUICKSTART.md                       # 使用指南
├── STATUS.md                           # 当前状态
├── MIGRATE-TO-WSL.md                   # WSL 迁移指南 ⭐
├── WSL-QUICK-REF.md                    # WSL 快速参考 ⭐
│
├── .claude-plugin/
│   └── plugin.json                     # Claude Code 插件配置
├── .mcp.json                           # MCP Server 配置
│
├── mcp-server/                         # TypeScript 实现
│   ├── src/
│   │   ├── core/                       # 核心引擎
│   │   │   ├── types.ts                # 数据结构
│   │   │   ├── storage.ts              # 存储层
│   │   │   ├── keywords.ts             # 关键词系统 ⭐
│   │   │   ├── explainer.ts            # Beam Search
│   │   │   ├── detector.ts             # Event 检测
│   │   │   ├── inducer.ts              # 规则归纳
│   │   │   └── validator.ts            # 规则验证
│   │   ├── tools/                      # MCP Tools
│   │   │   ├── observation.ts
│   │   │   ├── query.ts
│   │   │   ├── induction.ts
│   │   │   └── swebench.ts             # SWE-bench 集成
│   │   └── index.ts                    # MCP Server 入口
│   ├── scripts/                        # 批量工具 ⭐
│   │   ├── import-swebench.mjs         # 数据导入
│   │   ├── evaluate.mjs                # 性能评估
│   │   └── visualize.mjs               # 可视化生成
│   └── test-*.mjs                      # 测试脚本
│
├── scripts/
│   └── download-swebench.py            # 数据下载 ⭐
│
├── skills/causal-learning/             # Claude Code Skill
│   ├── SKILL.md                        # 使用文档
│   └── references/predicates.md        # 谓词参考
│
└── docs/                               # 设计文档
    ├── causal-learner-design.md        # 原始设计
    ├── predicate-evolution-philosophy.md  # 谓词演化 ⭐
    ├── WSL-OPTIMIZATIONS.md            # WSL 优化建议
    └── history/                        # 开发记录
```

⭐ = 新增/重要文档

---

## 🎓 核心概念

### 三层数据流

```
┌─────────────────────────────────────────────┐
│          Cause Regulations                   │
│       （已学习的因果规则库）                    │
│   candidate → hypothesis → confirmed         │
└─────────────────────────────────────────────┘
      ↑ 归纳                    │ 解释
      │                         ↓
┌─────┴─────────────────────────────────────┐
│           Event Pool                       │
│      （无法解释的异常，知识缺口）              │
└───────────────────────────────────────────┘
      ↑ 检测                    │ 消解
      │                         ↓
┌─────┴─────────────────────────────────────┐
│       Observation Stream                   │
│         （所有原始观测）                      │
└───────────────────────────────────────────┘
```

**核心循环**：
1. Observation 进入 → 尝试解释
2. 无法解释 → Event Pool
3. Events 聚类 → 归纳新 Regulation
4. 新 Regulation → 解决旧 Events

### 数据对象

**Observation** (观测)：
```typescript
{
  observationId: "obs_001",
  facts: [
    {pred: "test.failed", value: true},
    {pred: "keyword", value: "attributeerror"}
  ],
  context: {repo: "django/django"},
  rawRefs: ["完整的自然语言描述..."]
}
```

**Event** (异常)：
```typescript
{
  eventId: "evt_001",
  status: "open",
  observation: {...},
  attemptedExplanations: [...],  // 尝试过的规则
  unexplainedAspects: [...]      // 无法解释的部分
}
```

**Regulation** (因果规则)：
```typescript
{
  regulationId: "reg_001",
  status: "hypothesis",
  pre: [{pred: "keyword", value: "null"}, ...],  // 前提
  eff: [{pred: "keyword", value: "error"}, ...], // 结果
  supportN: 5,              // 支持证据数
  counterexampleN: 0        // 反例数
}
```

---

## 📚 文档导航

### 入门文档

| 文档 | 适用场景 |
|------|----------|
| **README.md** | 项目概览（本文档） |
| **[QUICKSTART.md](QUICKSTART.md)** | 功能使用和工作流 |
| **[WSL-QUICK-REF.md](WSL-QUICK-REF.md)** | WSL 环境快速参考 ⭐ |

### 迁移文档

| 文档 | 适用场景 |
|------|----------|
| **[MIGRATE-TO-WSL.md](MIGRATE-TO-WSL.md)** | Windows → WSL 详细步骤 ⭐ |
| **[docs/WSL-OPTIMIZATIONS.md](docs/WSL-OPTIMIZATIONS.md)** | WSL 性能优化技巧 |

### 设计文档

| 文档 | 适用场景 |
|------|----------|
| **[docs/predicate-evolution-philosophy.md](docs/predicate-evolution-philosophy.md)** | 谓词演化核心理念 ⭐⭐ |
| **[docs/causal-learner-design.md](docs/causal-learner-design.md)** | 系统架构设计 |
| **[skills/causal-learning/SKILL.md](skills/causal-learning/SKILL.md)** | MCP 使用文档 |

### 开发记录

| 文档 | 适用场景 |
|------|----------|
| **[STATUS.md](STATUS.md)** | 当前实现状态和功能清单 |
| **[docs/history/2026-01-10-causal-learner-plugin.md](docs/history/2026-01-10-causal-learner-plugin.md)** | 详细开发记录 |

---

## 🧪 测试验证

### 基础功能测试

```bash
cd mcp-server

# 1. 基础测试（8 observations）
node test-basic.mjs

# 预期：
# ✅ 8 observations → 8 events
# ✅ 1 cluster found
# ✅ 2 regulations created
# ✅ 8 events resolved (100%)
```

### SWE-bench 评估（需先下载数据）

```bash
# 50 样本测试
node scripts/evaluate.mjs ../data/swebench/swebench_verified.json 50

# 预期：
# ✅ 45-48 events created
# ✅ 10-15 clusters found
# ✅ 8-12 regulations induced
# ✅ 60-80% resolution rate
```

---

## 💡 使用示例

### 作为 MCP Server

```bash
# 启动服务器
cd mcp-server
npm start

# Claude Code 通过 .mcp.json 自动连接
# 可以使用 16 个 MCP tools
```

### 提交观测

```typescript
// 在 Claude Code 中调用
submit_observation({
  observation: {
    facts: [
      {pred: "keyword", value: "error"},
      {pred: "keyword", value: "null"},
      {pred: "test.failed", value: true}
    ],
    context: {
      repo: "my-project",
      file: "test.py"
    },
    rawRefs: ["完整的错误描述..."]
  }
})
```

### 触发学习

```typescript
// 积累足够 Events 后
trigger_induction({
  minClusterSize: 2,
  minSimilarity: 0.3
})
```

### 查询规则

```typescript
// 查看学到的规则
list_regulations({status: "confirmed"})

// 搜索特定模式
search_regulations({predPattern: "null"})
```

---

## 📊 性能指标

### 当前验证结果（8 samples）

| 指标 | 值 |
|------|-----|
| Observations | 8 |
| Events Created | 8 |
| Clusters Found | 2 |
| Regulations Induced | 2 |
| Resolution Rate | 100% |
| Learning Efficiency | 0.25 reg/event |

### 预期性能（WSL + 50 samples）

| 指标 | Windows (sql.js) | WSL (better-sqlite3) |
|------|------------------|----------------------|
| 导入 50 issues | ~10-15 秒 | ~2-3 秒 ⚡ |
| 归纳处理 | ~2-3 秒 | ~0.5 秒 ⚡ |
| 查询 1000 条 | ~1 秒 | ~0.1 秒 ⚡ |

**总体提升**：3-5 倍性能改进

---

## 🛠️ 技术栈

- **语言**: TypeScript (Node.js)
- **MCP SDK**: @modelcontextprotocol/sdk
- **存储**: SQLite (better-sqlite3 / sql.js)
- **数据集**: SWE-bench (Hugging Face)
- **关键词**: TF-IDF + 余弦相似度
- **可视化**: HTML + inline charts

---

## 📖 MCP Tools 概览

**核心循环**：
- `submit_observation` - 提交观测
- `trigger_induction` - 触发学习
- `reevaluate_event` - 重新评估

**查询管理**：
- `list_events` / `get_event` - Event Pool
- `list_regulations` / `get_regulation` - 规则库
- `add_regulation` - 手动添加种子规则
- `get_stats` - 系统统计
- `search_events` / `search_regulations` - 模式搜索

**SWE-bench**：
- `import_swe_issue` - 导入 issue
- `record_fix` - 记录修复
- `suggest_causes` - 推荐原因
- `analyze_swe_batch` - 批量分析

详见：[QUICKSTART.md](QUICKSTART.md)

---

## 🎯 应用场景

### 1. 代码调试助手（SWE-bench）

学习"什么样的代码问题导致什么样的错误"：
- Import 错误模式
- Null pointer 问题
- Type 不匹配
- API 误用模式

### 2. GPU/系统故障诊断

监控系统日志，学习"什么条件预示什么故障"：
- 驱动兼容性问题
- 内存泄漏模式
- 硬件冲突规律

### 3. 生产环境告警关联

从告警日志学习"什么征兆预示什么故障"：
- 性能下降先兆
- 服务崩溃前兆
- 级联故障模式

---

## 🔬 核心创新

### 1. 只记录边界（Boundary Recording）

传统系统记录一切 → 存储爆炸
本系统只记录无法解释的异常 → 高效

```
1000 observations
  → 950 explained (只更新证据)
  → 50 events (真正有价值的信息)
```

### 2. 知识缺口可视化

Event Pool = 当前系统不懂什么
- 聚类大的区域 = 需要优先学习的领域
- 孤立 Events = 噪声或罕见case

### 3. 谓词从数据涌现

不需要专家定义谓词 → 系统自己发现
- Phase 1: 关键词相关性（像搜索引擎）
- Phase 2-3: 统计抽象 → 结构化谓词
- Phase 4: 成熟的逻辑体系

**类比生物进化**：从简单到复杂，适者生存

---

## 📈 学习曲线预期

```
Observations:    0 ──→ 50 ──→ 200 ──→ 500+
                 │      │      │       │
Regulations:     0      8      25      50+
Explanation Rate 0%     5%     20%     40%+
Resolution Rate  -      70%    80%     85%+
```

**冷启动**（0-50）：主要创建 Events，发现基本模式
**快速学习**（50-200）：规则互相协作，解释率快速上升
**成熟阶段**（200+）：谓词开始结构化，形成知识网络

---

## 🤝 贡献

欢迎贡献：
- 🐛 Bug 报告
- 💡 新特性建议
- 📝 文档改进
- 🧪 测试用例

---

## 📄 License

MIT License

---

## 🙏 致谢

- SWE-bench 团队提供优秀的评估数据集
- MCP SDK 团队提供强大的协议支持
- Claude Code 提供灵活的插件系统

---

## ⚡ 快速链接

- 🚀 [QUICKSTART.md](QUICKSTART.md) - 开始使用
- 🐧 [WSL-QUICK-REF.md](WSL-QUICK-REF.md) - WSL 一页搞定
- 🧠 [谓词演化哲学](docs/predicate-evolution-philosophy.md) - 核心理念
- 📊 [STATUS.md](STATUS.md) - 当前状态

---

**Start learning from exceptions!** 🎯
