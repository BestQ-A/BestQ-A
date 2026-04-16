---
name: learn-natural
description: 零摩擦因果知识录入——用户说一句自然语言，引擎自动结构化并存储。不需要构造 JSON，不需要知道 facts/pred/value 格式。
---

# 自然语言录入

## 核心理念

用户只需要说一句话，引擎负责理解和结构化。

## 示例输入

以下任何表述都行：
- "改了 d_cp 从 3.2 到 3.8，精度从 1.2px 降到 0.8px"
- "加了 CERES_NO_SPARSE 宏定义后 build 成功了"
- "sector_weight 超过 0.5 会让 n_cornea 退化"
- "这次 crash 是因为 fwd_init_yaw 没做零初始化"
- "Option C 比 Option A 精度好 0.3px 但速度慢 2x"

## 执行步骤

### Step 1：解析用户输入

从用户的自然语言中提取以下结构（用 Claude 自身的理解力，不需要外部 LLM）：

- **条件/原因**（what changed / what was the cause）
- **结果/效果**（what happened / what was the effect）
- **方向**（改善/退化/修复/破坏）
- **量化**（数值变化，如果有）
- **上下文**（项目、模块、环境）

### Step 2：构造 facts 并提交

将解析结果转为 MCP 调用：

```json
mcp__causal-learner__submit_observation
{
  "observation": {
    "facts": [
      {"pred": "cause", "value": "<提取的原因>"},
      {"pred": "effect", "value": "<提取的效果>"},
      {"pred": "direction", "value": "improved|degraded|fixed|broken"},
      {"pred": "magnitude", "value": "<数值变化>"},
      {"pred": "affected_module", "value": "<模块>"}
    ],
    "context": {
      "project": "<从 git 或用户上下文推断>",
      "source": "natural_language"
    }
  }
}
```

### Step 3：确认

```
✅ 已记录到因果引擎：
   原因: <cause>
   效果: <effect> (<direction>)
   [数值: <magnitude>]

💡 当前知识库: N 条观测, M 条规律
```

不要问"要不要记录"——直接记。用户说了就是要记。

## 高级：批量录入

如果用户粘贴了一个实验结果表格：

```
| 参数 | 值 | 精度(px) |
|------|-----|----------|
| d_cp=3.2 | baseline | 1.2 |
| d_cp=3.5 | | 0.9 |
| d_cp=3.8 | | 0.8 |
```

自动逐行提交，每行一条观测：
- `{cause: "d_cp=3.5", effect: "accuracy=0.9px", direction: "improved", magnitude: "-0.3px vs baseline"}`
- `{cause: "d_cp=3.8", effect: "accuracy=0.8px", direction: "improved", magnitude: "-0.4px vs baseline"}`

## 触发词

- "记一下"
- "学习一下"
- "记录这个发现"
- 或者直接说实验结果，引擎自动识别
