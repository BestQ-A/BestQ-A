---
name: new-scenario
description: 交互式创建新的 causal-learner 场景测试 skill。输入：场景名称、领域、失败条件、期望修复。输出：即用的 skill.md 文件。
---

# New Scenario — 创建新测试场景

## 目标

帮助用户快速将一个领域想法转化为可热加载的 causal-learner MCP 测试 skill。

## 执行步骤

### Step 1：收集场景信息

依次询问用户（每次只问一个）：

1. **场景名称**（用于文件夹名和 skill 名，如 `test-oven-control`）
2. **领域描述**（一句话，如 "工业烤箱温控程序"）
3. **正常执行流程**（几个阶段，如 preheat → bake → cooldown）
4. **已知失败条件**（如 `tempSensor=failed` 导致 `bake_failed`）
5. **期望的修复动作**（如 "在 failsWhen 中增加 tempSensor=failed 检查"）
6. **是否有误预测场景**（即系统原本会漏掉的失败条件）

### Step 2：生成 skill.md

根据收集的信息，生成以下结构的 `skill.md`：

```markdown
---
name: test-{场景名称}
description: {领域描述} MCP 集成测试。{正常流程} + {失败条件} 验证。
---

# Scenario X — {场景名称} MCP 集成测试

## 目标
...

## 执行步骤

### 准备
调用 mcp__causal-learner__set_test_mode ...

### Step 1：正常执行观测
调用 mcp__causal-learner__submit_observation ...

### Step 2：失败场景观测  
调用 mcp__causal-learner__submit_observation ...
调用 mcp__causal-learner__record_fix ...

### Step 3：因果验证
调用 mcp__causal-learner__suggest_causes ...
调用 mcp__causal-learner__causal_search ...

## 断言列表
- 断言 X1 (观测写入): ...
- 断言 X2 (修复记录): ...
- 断言 X3 (因果命中): ...

## 报告格式
...
```

### Step 3：写入文件

将生成的内容写入：
```
E:/1_agents_space/9_AGI/BestQ-A/.claude/plugins/causal-scenarios/skills/test-{场景名称}/skill.md
```

**写入完成后立即可用**，无需任何编译或重启步骤。

### Step 4：验证

调用 `Skill("causal-scenarios:test-{场景名称}")` 立即执行新场景。

## 设计原则

新场景 skill 应遵循：

1. **每个断言对应一个具体 MCP 调用结果**，不使用模糊断言
2. **正常 + 失败 + 修复** 三段结构缺一不可
3. **报告格式统一**：`断言 X1: PASS/FAIL + 学习指标汇总`
4. **测试命名空间隔离**：`set_test_mode` 的 namespace 使用场景名称

## 理论意义

每个新场景 = 一个新领域的认识论探针：
- 暴露 causal-learner 在该领域的理论盲区
- 验证 MCP 工具链的实际集成质量
- 积累跨领域的学习质量基准数据
