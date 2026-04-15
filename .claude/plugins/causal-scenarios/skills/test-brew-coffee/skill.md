---
name: test-brew-coffee
description: 通过 causal-learner MCP 工具执行 Scenario A：BrewCoffee 正常流程 + 断电失败观测 + 因果验证。无需编译。
---

# Scenario A — BrewCoffee MCP 集成测试

## 目标

通过 MCP 工具直接与 causal-learner 图数据库交互，验证：
1. 正常萃取观测能被正确记录和检索
2. 断电失败被关联到 `hasPower=false` 原因
3. `causal_search` 能找到 power_failure → brew_interrupted 链路

## Fact 结构规范

所有 `submit_observation` 调用中，`facts` 数组每项必须是：
```json
{ "pred": "<谓词名>", "value": "<值>", "args": { ... } }
```
不要使用 `type`/`description` 字段，那是旧格式。

## 执行步骤

### 准备：进入测试模式

调用 `mcp__causal-learner__set_test_mode` 设置隔离测试命名空间：
```json
{ "enabled": true }
```

调用 `mcp__causal-learner__graph_stats` 记录初始图状态（基线 atoms/refs 数量）。

### Step 1：提交正常萃取观测

调用 `mcp__causal-learner__submit_observation`，提交三条观测：

```json
观测 1:
{
  "facts": [{"pred": "phase_outcome", "value": "success", "args": {"phase": "heat_water", "signal": "waterTemp=hot"}}],
  "context": {"phase": "heat_water", "outcome": "success"}
}

观测 2:
{
  "facts": [{"pred": "phase_outcome", "value": "success", "args": {"phase": "pressurize", "signal": "pumpPressure=9.5"}}],
  "context": {"phase": "pressurize", "outcome": "success"}
}

观测 3:
{
  "facts": [{"pred": "brew_outcome", "value": "brew_success", "args": {"phase": "extract", "signal": "espressoVolume=30"}}],
  "context": {"phase": "extract", "outcome": "brew_success"}
}
```

**断言 A1**：三条观测均返回成功（含 eventId/storyId），无错误。

### Step 2：提交断电失败观测 + 修复

调用 `mcp__causal-learner__submit_observation`：
```json
{
  "facts": [{"pred": "brew_outcome", "value": "brew_failed", "args": {"hasPower": false, "failedAt": "heat_water"}}],
  "context": {"hasPower": false, "failedAt": "heat_water", "outcome": "brew_failed"}
}
```

记录返回的 eventId/storyId，调用 `mcp__causal-learner__record_fix`：
```json
{
  "eventId": "<上一步返回的 storyId>",
  "fix": {
    "fixCommit": "fix/hasPower-check",
    "fixDescription": "在 failsWhen 条件中检查 hasPower=false，提前中断程序",
    "filesChanged": ["BrewCoffee.ts"],
    "testsPassed": true
  }
}
```

**断言 A2**：record_fix 返回成功，事件状态变为 resolved。

### Step 3：触发归纳学习

调用 `mcp__causal-learner__trigger_induction`，让系统从已有观测中生成规律（regulations）：
```json
{}
```

等待归纳完成后，进行因果搜索。

### Step 4：因果搜索验证

调用 `mcp__causal-learner__causal_search`：
```
query: "power failure brew interrupted"
```

调用 `mcp__causal-learner__suggest_causes`：
```json
{
  "facts": [{"pred": "brew_outcome", "value": "brew_failed"}]
}
```

**断言 A3**：causal_search 返回结果包含与 power/hasPower 相关的记录，或返回归纳出的因果路径。
**断言 A4**：suggest_causes 的候选原因中包含 hasPower 相关条目；若图尚空则记 SKIP（非 FAIL）。

### Step 5：图统计对比

调用 `mcp__causal-learner__graph_stats` 获取最终图状态。

**断言 A5**：最终 atoms 数量 > 基线（新知识写入图）。

## 报告格式

执行完成后输出：

```
=== Scenario A: BrewCoffee MCP 集成测试 ===
断言 A1 (观测写入): PASS / FAIL
断言 A2 (fix 记录): PASS / FAIL
断言 A3 (因果搜索命中): PASS / FAIL / SKIP
断言 A4 (suggest_causes 命中): PASS / FAIL / SKIP
断言 A5 (图增长): PASS / FAIL — 基线 N atoms → 最终 M atoms (+X)

总计: X/5 通过
```

如有断言失败，输出实际返回值与期望值的对比。
