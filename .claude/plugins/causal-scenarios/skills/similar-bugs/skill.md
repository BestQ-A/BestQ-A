---
name: similar-bugs
description: 查找历史上类似的 bug 和对应的修复方案。从因果引擎的事件库和规律库中检索。
---

# 查找类似 Bug

## 执行步骤

### Step 1：理解当前问题

从用户描述中提取关键词。可以是：
- 错误消息
- 文件路径
- 功能描述
- 任何关键词

### Step 2：多维度搜索

**按错误类型搜索事件**：
```json
mcp__causal-learner__fuzzy_search_events
{"query": "<关键词>", "threshold": 15, "limit": 5}
```

**按规律搜索**：
```json
mcp__causal-learner__fuzzy_search_regulations
{"query": "<关键词>", "threshold": 15, "limit": 5}
```

**因果链搜索**：
```json
mcp__causal-learner__causal_search
{"query": "<关键词>", "strategy": "event_first"}
```

### Step 3：输出结果

```
=== 类似 Bug 搜索: "<关键词>" ===

🔍 历史事件 (按相似度排序):
  1. <eventId> [<状态>] 相似度 <score>
     症状: <unexplainedAspects>
     [如果 resolved] 修复: <fix 描述>

  2. ...

📏 相关规律:
  1. <regulationId> (支持 <N> 次)
     当 <pre> → <eff>

  [如果都没有]
  未找到类似记录。继续 debug，修复后用 /learn-from-debug 记录。
```
