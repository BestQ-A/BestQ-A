---
name: discover-patterns
description: 扫描因果引擎知识库，自动发现用户没注意到的跨条目规律和潜在风险。这是 Markdown 表格做不到的——从散落的实验记录中挖出隐藏模式。
---

# 发现隐藏模式

## 核心价值

用户做了 90 个实验，每个单独看都懂。但跨实验的隐藏模式——"每次改 X 超过阈值 Y 都会导致 Z 退化"——人脑很难从表格里看出来。这就是引擎的价值。

## 执行步骤

### Step 1：获取全部知识

```json
mcp__causal-learner__get_stats
mcp__causal-learner__list_regulations {"limit": 100}
mcp__causal-learner__list_events {"limit": 200}
```

### Step 2：分析模式

从 regulations 和 events 中寻找以下模式：

**2a. 参数敏感性**
找出哪些参数变化最常出现在因果链中：
- 统计每个 `cause` pred 出现的频率
- 高频 cause = 系统对该参数敏感

**2b. 共现退化**
找出哪些改善总是伴随其他指标退化：
- 扫描 direction=improved 的观测
- 检查同期是否有 direction=degraded 的观测
- 如果 A 改善时 B 总是退化 → tradeoff 模式

**2c. 未覆盖区域**
基于已有观测的参数范围，找出从未测试过的参数组合：
- 列出所有出现过的参数名
- 列出每个参数测试过的值域
- 交叉检查：哪些组合没测过？

**2d. 规律冲突**
检查 regulations 中是否有矛盾：
- regulation A: X → Y improved
- regulation B: X → Y degraded
- 冲突可能暗示遗漏的条件变量

### Step 3：输出报告

```
=== 隐藏模式发现 ===

🔍 参数敏感性排名:
  1. <param> — 出现在 N 条因果链中（最敏感）
  2. <param> — 出现在 M 条因果链中
  ...

⚖️ Tradeoff 发现:
  - <A> 改善时 <B> 总是退化（N 次共现）
  - 建议: 寻找 A 和 B 的帕累托前沿

🕳️ 未探索区域:
  - <param1>=<range> × <param2>=<range> 从未测试
  - 建议: 如果关心 <effect>，这个组合值得试

⚠️ 规律冲突:
  - <reg1> 和 <reg2> 对 <effect> 的预测相反
  - 可能原因: 遗漏了控制变量 <推测>

💡 下一步建议:
  1. <最高优先级的实验建议>
  2. <需要确认的 tradeoff>
```

## 触发词

- "发现模式"
- "有什么规律"
- "分析一下知识库"
- "跨实验有什么发现"
