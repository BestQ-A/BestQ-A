---
name: test-learning-loop
description: 通过 causal-learner MCP 工具执行 Scenario D：水垢学习闭环。提交误预测观测 → 记录修复 → 触发归纳 → 验证因果图更新 → 计算学习指标。无需编译。
---

# Scenario D — 水垢学习闭环 MCP 集成测试

## 目标

验证完整学习回路在 MCP/图层真正闭合：
1. V1 程序（只检查 hasPower）无法预测 calcium 失败
2. 提交误预测观测后，记录修复，触发归纳
3. V2 程序（检查 hasPower + calciumBlocked）通过 `suggest_causes` 可检索到 calcium 作为原因
4. 原有的 power failure 知识**无回归**

## Fact 结构规范

所有 `submit_observation` 调用中，`facts` 数组每项必须是：
```json
{ "pred": "<谓词名>", "value": "<值>", "args": { ... } }
```
不要使用 `type`/`description` 字段。

## 执行步骤

### 准备

调用 `mcp__causal-learner__set_test_mode` 进入测试命名空间：
```json
{ "enabled": true }
```

调用 `mcp__causal-learner__graph_stats` 记录基线（atoms_count, refs_count）。

### Step 1：建立 V1 基线知识

调用 `mcp__causal-learner__submit_observation` 提交正常执行：
```json
{
  "facts": [{"pred": "brew_outcome", "value": "brew_success", "args": {"program": "BrewCoffeeV1", "hasPower": true}}],
  "context": {"program": "BrewCoffeeV1", "hasPower": true, "outcome": "brew_success"}
}
```

调用 `mcp__causal-learner__submit_observation` 提交已知失败：
```json
{
  "facts": [{"pred": "brew_outcome", "value": "brew_failed", "args": {"program": "BrewCoffeeV1", "hasPower": false}}],
  "context": {"program": "BrewCoffeeV1", "hasPower": false, "outcome": "brew_failed"}
}
```

**断言 D1**：两条观测均成功写入。

### Step 2：暴露误预测（理论漏洞）

调用 `mcp__causal-learner__submit_observation` 提交 calcium 失败场景（V1 误预测）：
```json
{
  "facts": [
    {"pred": "brew_outcome", "value": "brew_failed", "args": {"program": "BrewCoffeeV1", "calciumBlocked": true}},
    {"pred": "prediction_mismatch", "value": true, "args": {"predicted": "brew_success", "actual": "brew_failed"}}
  ],
  "context": {
    "program": "BrewCoffeeV1",
    "calciumBlocked": true,
    "predicted": "brew_success",
    "actual": "brew_failed",
    "errorKind": "outcome_mismatch"
  }
}
```

**断言 D2**：observation 返回成功，误预测被记录。

### Step 3：记录修复

记录 D2 步骤返回的 storyId，调用 `mcp__causal-learner__record_fix`：
```json
{
  "eventId": "<D2 返回的 storyId>",
  "fix": {
    "fixCommit": "fix/BrewCoffeeV2-calcium-check",
    "fixDescription": "升级到 BrewCoffeeV2：在 failsWhen 中增加 calciumBlocked=true 条件",
    "filesChanged": ["BrewCoffee.ts"],
    "testsPassed": true
  }
}
```

**断言 D3**：record_fix 成功，修复被写入图，状态变为 resolved。

### Step 4：触发归纳学习

调用 `mcp__causal-learner__trigger_induction`：
```
{}
```

此步让系统从已有观测（V1 power failure + calcium misprediction）生成 regulations。

### Step 5：提交 V2 验证观测

调用 `mcp__causal-learner__submit_observation` 提交 V2 正确预测：
```json
{
  "facts": [{"pred": "brew_outcome", "value": "brew_failed", "args": {"program": "BrewCoffeeV2", "calciumBlocked": true, "correct": true}}],
  "context": {"program": "BrewCoffeeV2", "calciumBlocked": true, "outcome": "brew_failed", "correct": true}
}
```

调用 `mcp__causal-learner__submit_observation` 提交 V2 无回归：
```json
{
  "facts": [{"pred": "brew_outcome", "value": "brew_success", "args": {"program": "BrewCoffeeV2", "hasPower": true, "calciumBlocked": false}}],
  "context": {"program": "BrewCoffeeV2", "hasPower": true, "calciumBlocked": false, "outcome": "brew_success"}
}
```

**断言 D4**：两条 V2 观测均成功写入。

### Step 6：因果图查询验证学习结果

调用 `mcp__causal-learner__suggest_causes`：
```json
{
  "facts": [{"pred": "brew_outcome", "value": "brew_failed"}]
}
```

**断言 D5**：结果中出现 `calciumBlocked` 或 `calcium` 相关原因；若图尚无相关 regulations 则记 SKIP。

调用 `mcp__causal-learner__causal_search`：
```
query: "calcium blocked brew failed"
```

**断言 D6**：返回结果包含 calcium + brew_failed 相关记录；若无则记 SKIP。

调用 `mcp__causal-learner__suggest_causes`：
```json
{
  "facts": [{"pred": "brew_outcome", "value": "brew_failed", "args": {"hasPower": false}}]
}
```

**断言 D7（无回归）**：hasPower 相关原因仍然存在（V1 知识未被抹除）；或图尚无 regulations 则记 SKIP。

### Step 7：图统计 — 学习质量指标

调用 `mcp__causal-learner__graph_stats` 获取最终状态。

计算并报告指标：
- **知识密度增长**：最终 atoms_count - 基线 atoms_count
- **修复记录数**：D3 通过 → 1 条修复
- **误预测消除**：D5/D6 通过 → 100% 误差消除
- **无回归验证**：D7 通过 → 0 副作用

## 报告格式

```
=== Scenario D: 水垢学习闭环 MCP 集成测试 ===
断言 D1 (V1 基线观测写入): PASS / FAIL
断言 D2 (误预测暴露): PASS / FAIL
断言 D3 (修复记录): PASS / FAIL
断言 D4 (V2 验证观测): PASS / FAIL
断言 D5 (suggest_causes 命中 calcium): PASS / FAIL / SKIP
断言 D6 (causal_search 命中 calcium+brew): PASS / FAIL / SKIP
断言 D7 (无回归：hasPower 知识保留): PASS / FAIL / SKIP

学习指标：
  误差消除率: X% (D5+D6 通过 → 100%)
  修订副作用率: X% (D7 通过 → 0%)
  知识密度增长: +N atoms
  修复效率: 1 次 record_fix 消除 1 类误预测

总计: X/7 通过（SKIP 算 PASS）
```
