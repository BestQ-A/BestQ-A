---
name: learn-from-debug
description: 从当前 debug 会话中自动提取因果知识。分析 git diff + 错误信息，提交观测到因果引擎，修复后自动 record_fix。让系统在后台持续学习你的 codebase 的因果模式。
---

# 从 Debug 中学习

## 目标

把每次 debug 变成因果引擎的训练数据：
1. 分析当前问题（git diff、错误日志、上下文）
2. 提交结构化观测到因果引擎
3. 修复后记录因果链
4. 如果积累足够，触发归纳学习

## 执行步骤

### Step 1：收集当前问题信息

用 Bash 工具执行：
```bash
# 获取最近的 git diff（当前改动）
git diff --stat HEAD
# 获取最近的错误日志（如果有）
git log --oneline -5
```

请用户描述当前遇到的问题。需要以下信息：
- **症状**：什么错误/异常？（错误消息、stack trace）
- **位置**：哪个文件/模块？
- **上下文**：什么操作触发的？

### Step 2：提交观测

根据收集到的信息，调用 `mcp__causal-learner__submit_observation`：

```json
{
  "observation": {
    "facts": [
      {"pred": "symptom", "value": "<错误描述>"},
      {"pred": "affected_module", "value": "<文件/模块路径>"},
      {"pred": "error_type", "value": "<异常类型，如 TypeError>"},
      {"pred": "trigger", "value": "<触发操作>"}
    ],
    "context": {
      "project": "<项目名>",
      "branch": "<当前分支>",
      "env": "<环境>"
    }
  }
}
```

记录返回的 `storyId`。

### Step 3：修复问题

正常 debug 和修复。修复完成后进入 Step 4。

### Step 4：记录修复

调用 `mcp__causal-learner__record_fix`：

```json
{
  "eventId": "<Step 2 的 storyId>",
  "fix": {
    "fixCommit": "<commit hash 或分支名>",
    "fixDescription": "<一句话描述修复了什么>",
    "filesChanged": ["<修改的文件列表>"],
    "testsPassed": true
  }
}
```

这会触发 v13 全治理链：
- AcceptedReconstruction（因果分段）
- BranchPoint（分叉治理）
- ConstitutionalLayer（宪法审计）
- ProofLineage（证明谱系）
- PresentSlice（当下切片）

### Step 5：检查是否该归纳

调用 `mcp__causal-learner__get_stats` 查看积累量。

如果 `eventCount >= 10` 且上次归纳后有新 events，调用：
```json
mcp__causal-learner__trigger_induction
{"options": {"minClusterSize": 2, "minSimilarity": 0.3, "autoValidate": false}}
```

### Step 6：报告

输出本次学习的摘要：
```
=== Debug 学习记录 ===
观测 ID: <storyId>
症状: <symptom>
根因: <fix description>
修复文件: <files>
治理对象: reconstruction ✓ | branchPoint ✓ | audit ✓
当前知识库: N observations, M events, K regulations
```

## 快捷用法

用户只需要说以下任意一句话即可触发：

- "学习这次 debug"
- "把这个 bug 记下来"
- "记录这次修复到因果引擎"
- "learn from this bug"
