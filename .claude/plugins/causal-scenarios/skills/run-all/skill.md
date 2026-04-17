---
name: run-all-scenarios
description: 依次运行所有 causal-learner 场景测试并汇总统计指标。用于回归验证和学习质量评估。
---

# Run All — causal-learner 场景测试套件

## 目标

依次执行所有已注册场景，汇总通过率和学习质量指标。

## 执行顺序

按以下顺序依次调用各场景 skill（通过 Skill 工具）：

1. **Scenario A**: `Skill("causal-scenarios:test-brew-coffee")`
2. **Scenario D**: `Skill("causal-scenarios:test-learning-loop")`

> 注：Scenario B（SWE 诊断）和 Scenario C（本体冲突）当前由 TypeScript E2E 套件覆盖。
> 在项目根目录运行 `cd causal-learner/mcp-server && node --test "dist/tests/**/*.test.js"` 可得到完整 TypeScript 覆盖。

## 最终汇总报告

所有场景完成后输出：

```
╔══════════════════════════════════════════════════╗
║       causal-learner 场景测试套件 — 汇总报告        ║
╚══════════════════════════════════════════════════╝

场景覆盖：
  Scenario A (BrewCoffee MCP):     X/5 断言通过
  Scenario D (学习闭环 MCP):        X/7 断言通过
  TypeScript E2E (220 tests):      运行 node --test 查看

MCP 集成断言总计:  X/12 通过

学习质量指标（跨场景汇总）：
  误差消除率: X%
  修订副作用率: X%
  知识密度增长: +N events, +M regulations
  修复效率: 平均 X 次 record_fix / 类误差

图数据库健康度：
  调用 mcp__causal-learner__get_dual_stats 获取短期/长期图统计
  调用 mcp__causal-learner__graph_stats 获取图结构指标
```

## 失败处理

如某个场景有断言失败：
1. 记录失败的断言 ID 和实际返回值
2. 继续执行后续场景（不提前终止）
3. 在汇总报告中标注哪些场景需要关注

## 新增场景指引

运行完成后提示用户：
```
如需添加新场景，运行：
  Skill("causal-scenarios:new-scenario")

场景文件位置：
  E:/1_agents_space/9_AGI/BestQ-A/.claude/plugins/causal-scenarios/skills/
  编辑 skill.md 后立即生效（无需编译）
```
