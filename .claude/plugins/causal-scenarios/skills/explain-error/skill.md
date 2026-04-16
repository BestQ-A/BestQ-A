---
name: explain-error
description: 给一段 error log 或错误描述，因果引擎分析可能的根因、匹配已知规律、推荐修复方向。
---

# 解释错误

## 执行步骤

### Step 1：获取错误信息

如果用户粘贴了 error log，直接用。否则问：
- 错误消息是什么？
- 哪个文件/命令触发的？

### Step 2：提取 facts 并查询

从错误信息中提取关键 facts，然后**并行**调用三个工具：

**suggest_causes**：
```json
mcp__causal-learner__suggest_causes
{
  "observation": {
    "facts": [
      {"pred": "error_type", "value": "<异常类型>"},
      {"pred": "symptom", "value": "<错误消息摘要>"},
      {"pred": "affected_module", "value": "<文件路径>"}
    ]
  }
}
```

**causal_search**：
```json
mcp__causal-learner__causal_search
{"query": "<错误消息关键词>", "strategy": "regulation_first"}
```

**fuzzy_search_events**：
```json
mcp__causal-learner__fuzzy_search_events
{"query": "<错误消息关键词>", "threshold": 20, "limit": 3}
```

### Step 3：输出分析

```
=== 错误分析 ===

错误: <错误消息>
类型: <异常类型>
位置: <文件>

📋 已知规律匹配:
  [如果有 regulation 匹配]
  规律: 当 <pre> 时 → <eff>
  置信度: <score>
  建议: 检查 <pre 中的条件>

  [如果无匹配]
  引擎暂无此类错误的规律。

📂 历史类似问题:
  [如果有]
  - <eventId>: <描述> (状态: <open/resolved>)

  [如果无]
  无历史记录。

💡 建议:
  1. <基于 regulation 的具体修复方向>
  2. <基于历史事件的参考>
  3. 修复后用 /learn-from-debug 记录，帮助引擎学习
```
