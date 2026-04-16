---
name: ask-causes
description: 遇到 bug 时先问因果引擎——查询已知规律、历史类似问题和建议的根因方向。避免重复踩坑。
---

# 问因果引擎

## 目标

在开始 debug 前，先查因果引擎的知识库，看是否已有类似问题的因果规律。

## 执行步骤

### Step 1：构造查询

从用户描述中提取关键 facts，调用 `mcp__causal-learner__suggest_causes`：

```json
{
  "observation": {
    "facts": [
      {"pred": "<最明显的症状谓词>", "value": "<值>"}
    ]
  }
}
```

同时调用 `mcp__causal-learner__causal_search`：

```json
{
  "query": "<用户描述的关键词>",
  "strategy": "regulation_first"
}
```

### Step 2：解读结果

**如果有匹配的 regulation：**
```
已知因果规律：
  当 [pre 条件] 时 → 会导致 [eff 结果]
  支持证据: N 次历史观测
  建议: 检查 [pre 条件中的关键因素]
```

**如果无匹配：**
```
因果引擎暂无此类问题的规律。
建议正常 debug，修复后用 /learn-from-debug 记录。
```

### Step 3：查相似事件

调用 `mcp__causal-learner__fuzzy_search_events`：
```json
{"query": "<关键词>", "threshold": 20, "limit": 5}
```

如果有历史事件，展示最相关的 1-2 条作为参考。

## 快捷用法

- "这个 bug 引擎知道吗"
- "查一下有没有类似问题"
- "ask causes"
