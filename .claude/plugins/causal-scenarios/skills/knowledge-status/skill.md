---
name: knowledge-status
description: 查看因果引擎当前学了多少、学了什么。显示观测数、事件数、规律数、知识分布。
---

# 知识库状态

## 执行步骤

### Step 1：获取统计

```json
mcp__causal-learner__get_stats
```

### Step 2：获取规律列表

```json
mcp__causal-learner__list_regulations
{"limit": 20}
```

### Step 3：输出报告

```
=== 因果引擎知识库 ===

📊 总量:
  观测: <N>
  事件: <N> (open: <n>, resolved: <n>)
  规律: <N> (candidate: <n>, hypothesis: <n>, confirmed: <n>)

📏 学到的因果规律:
  [按 supportN 排序，列出 top 10]
  1. [<status>] 当 <pre 摘要> → <eff 摘要> (支持 <N>)
  2. ...

  [如果 regulation 为 0]
  尚未学到任何规律。多用 /learn-from-debug 积累数据。

💡 建议:
  - [如果 events > 10 且 regulations == 0] 试试手动触发归纳：告诉我 "归纳学习一下"
  - [如果 regulations > 0] 引擎已有知识，遇到 bug 可以先 /ask-causes 查询
  - [如果 observations < 5] 知识库还很稀疏，多记录几次 debug 经验
```
