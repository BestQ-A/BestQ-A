# Causal Learner 插件

异常驱动的因果学习系统 - 从"意外"中学习因果规则。

## 核心理念

```
Event = 现有 Cause Regulation 解释不了的"意外"
```

**不是记录一切，而是只记录边界。**

- 能被现有规则解释的观测：只更新证据
- 解释不了的观测：进入 Event Pool，等待聚类与归纳
- 归纳出的新规则会"吞掉"旧事件，Event Pool 自然变小

---

## 安装方法

### 1. 克隆项目

```bash
git clone <repo-url>
cd causal-learner
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置 Claude Code

在 `.claude/settings.json` 中添加 MCP 服务器配置：

```json
{
  "mcpServers": {
    "causal-learner": {
      "command": "python",
      "args": ["-m", "causal_learner.server"],
      "cwd": "<path-to-causal-learner>"
    }
  }
}
```

---

## 快速开始

### 1. 定义谓词体系

参考 [skills/causal-learning/references/predicates.md](skills/causal-learning/references/predicates.md) 设计你的谓词。

### 2. 提交观测

```python
# 使用 MCP tool
submit_observation({
    "source": "my_monitor",
    "facts": [
        {"pred": "test.failed", "args": {"name": "test_api"}, "value": True},
        {"pred": "error.type", "args": {"kind": "TypeError"}, "value": True}
    ],
    "context": {
        "repo": "my/repo",
        "commit": "abc123"
    }
})
```

### 3. 查看结果

- 解释成功：规则证据更新
- 解释失败：创建 Event

### 4. 触发归纳

```python
# 积累足够 Events 后
trigger_induction({
    "min_cluster_size": 3,
    "similarity_threshold": 0.7
})
```

---

## MCP Tools 列表

| Tool | 描述 |
|------|------|
| `submit_observation` | 提交观测数据，自动进行解释和 Event 检测 |
| `trigger_induction` | 手动触发归纳流程 |
| `list_events` | 查询 Event Pool |
| `get_event` | 获取单个 Event 详情 |
| `list_regulations` | 查询规则库 |
| `get_regulation` | 获取单个规则详情 |
| `create_regulation` | 手动创建规则 |
| `update_regulation` | 更新规则 |
| `get_stats` | 获取系统统计信息 |
| `explain` | 尝试用规则解释一组事实（不产生副作用） |

---

## 配置说明

### 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CAUSAL_LEARNER_DB` | `sqlite:///causal.db` | 数据库连接字符串 |
| `CAUSAL_LEARNER_LOG_LEVEL` | `INFO` | 日志级别 |
| `MIN_EXPLANATION_SCORE` | `0.6` | 最小解释分数阈值 |
| `MAX_ASSUMPTIONS` | `0` | 解释时允许的最大假设数 |

### 配置文件 (config.yaml)

```yaml
# 解释器配置
explainer:
  min_score: 0.6
  max_assumptions: 0
  beam_width: 5

# 归纳器配置
inducer:
  min_cluster_size: 3
  similarity_threshold: 0.7
  max_pre_count: 5

# 验证器配置
validator:
  min_pre_satisfaction: 0.8
  allow_empty_pre: false

# 规则晋升配置
promotion:
  candidate_to_hypothesis:
    min_support: 3
    max_contradiction_rate: 0.2
  hypothesis_to_confirmed:
    min_support: 10
    max_contradiction_rate: 0.1
  deprecation:
    contradiction_rate_threshold: 0.3
```

---

## 目录结构

```
causal-learner/
├── README.md                 # 本文件
├── requirements.txt          # Python 依赖
├── config.yaml              # 默认配置
├── skills/
│   └── causal-learning/
│       ├── SKILL.md         # 主技能文档
│       └── references/
│           └── predicates.md # 谓词设计参考
├── src/
│   └── causal_learner/
│       ├── __init__.py
│       ├── server.py        # MCP 服务器入口
│       ├── models.py        # 数据模型
│       ├── explainer.py     # 解释器
│       ├── detector.py      # Event 检测器
│       ├── inducer.py       # 归纳器
│       ├── validator.py     # 验证器
│       └── storage.py       # 存储层
├── schemas/
│   ├── observation.schema.json
│   ├── event.schema.json
│   └── regulation.schema.json
└── examples/
    └── swe_bench/
        ├── predicates.yaml
        ├── seed_regulations.json
        └── demo.py
```

---

## 核心概念

### 三层架构

```
Regulations (长期记忆 - 已归纳的因果规则)
      ↑ 归纳        │ 解释
Event Pool (短期记忆 - 等待归纳的意外)
      ↑ 检测        │ 消解
Observation Stream (输入流 - 原始观测)
```

### 规则生命周期

```
candidate ──(3+ 支持)──→ hypothesis ──(10+ 支持, <10% 反例)──→ confirmed
    │                        │                                      │
    └──(2+ 反例)─────────────┴──────(>30% 反例)─────────────────────→ deprecated
```

### Event 状态

- `pending`: 等待归纳
- `clustered`: 已聚类，等待生成规则
- `resolved`: 已被新规则解释

---

## 使用场景

### SWE-bench 代码修复

监控测试结果，学习"什么样的代码问题导致什么样的错误"。

### GPU/显示系统调试

监控系统日志，学习"什么条件下会出现黑屏/闪烁/崩溃"。

### 生产系统故障分析

监控告警和指标，学习"什么征兆预示什么故障"。

---

## 相关文档

- [技能文档](skills/causal-learning/SKILL.md) - 详细使用指南
- [谓词参考](skills/causal-learning/references/predicates.md) - 谓词设计参考
- [设计文档](../docs/causal-learner-design.md) - 系统设计细节

---

## License

MIT
