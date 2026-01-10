# Causal Learning Skill（异常驱动的因果学习）

> **核心理念：只学习"意外"**
>
> Event = 现有 Cause Regulation 解释不了的"意外"
>
> 不是记录一切，而是只记录边界。系统从"意外"中学习因果规则。

---

## 1. 核心概念

### 1.1 三层数据流

```
┌─────────────────────────────────────────────────────────────┐
│                    Cause Regulations                         │
│                 （当前能解释世界的规则集合）                    │
│                                                              │
│  candidate → hypothesis → confirmed → deprecated             │
└─────────────────────────────────────────────────────────────┘
        ↑ 归纳                           │ 解释
        │                                ↓
┌───────┴─────────────────────────────────────────────────────┐
│                       Event Pool                             │
│              （规则解释不了的"意外"，等待归纳）                 │
└─────────────────────────────────────────────────────────────┘
        ↑ 检测（解释失败）               │ 消解（被新规则解释）
        │                                ↓
┌───────┴─────────────────────────────────────────────────────┐
│                   Observation Stream                         │
│                     （所有原始观测）                           │
└─────────────────────────────────────────────────────────────┘
```

**核心不变式**：每个观测要么能被解释，要么变成 Event。没有中间态。

### 1.2 关键对象

#### Observation（原始观测）

系统的输入，由 facts（谓词事实）、context（环境上下文）和 raw_refs（原始数据引用）组成。

```json
{
  "obs_id": "obs_001",
  "facts": [
    {"pred": "test.failed", "args": {"name": "test_api"}, "value": true},
    {"pred": "error.type", "args": {"kind": "AttributeError"}, "value": true}
  ],
  "context": {
    "repo": "django/django",
    "file": "tests/test_api.py"
  }
}
```

#### Event（异常/意外）

现有规则解释不了的观测。记录了尝试解释的过程和未能解释的核心事实。

```json
{
  "event_id": "evt_001",
  "status": "pending",  // pending | clustered | resolved
  "observation": {...},
  "explanation_attempts": [...],  // 尝试过哪些规则、为什么失败
  "unexplained_core": [...]       // 具体哪些事实无法解释
}
```

#### Regulation（因果规则）

从 Events 中归纳出的因果模式，包含前提条件（pre）、触发动作（trigger）和效应（eff）。

```json
{
  "regulation_id": "reg_001",
  "status": "hypothesis",  // candidate → hypothesis → confirmed → deprecated
  "pattern": {
    "pre": [{"pred": "code.missing_import", "value": true}],
    "eff": [{"pred": "error.type", "args": {"kind": "ImportError"}, "value": true}]
  },
  "evidence": {
    "support": {"count": 5},
    "contradiction": {"count": 0}
  }
}
```

### 1.3 核心循环

**实时循环**（每条观测到来）：
1. 尝试用现有规则解释观测
2. 解释成功 → 更新规则证据
3. 解释失败 → 创建 Event 并入池

**定期循环**（积累足够 Events 后）：
1. 聚类相似 Events
2. 从 cluster 归纳候选规则
3. 验证并晋升规则
4. 消解被新规则解释的 Events

---

## 2. MCP Tools 使用指南

### 2.1 提交观测 (submit_observation)

将观测数据提交到系统，自动进行解释尝试和 Event 检测。

```typescript
// 调用方式
submit_observation({
  source: "swe_bench_runner",
  facts: [
    {pred: "test.failed", args: {name: "test_query"}, value: true},
    {pred: "error.type", args: {kind: "TypeError"}, value: true},
    {pred: "error.message", args: {text: "NoneType has no attribute"}, value: true}
  ],
  context: {
    repo: "django/django",
    issue_id: "django__django-12345",
    patch_applied: true
  }
})
```

**返回结果**：
- `explanation.success`: 是否成功解释
- `explanation.best_regulation`: 最佳匹配规则及解释链
- `event_created`: 如果解释失败，返回创建的 Event

### 2.2 触发归纳 (trigger_induction)

手动触发归纳流程，从 Event Pool 中发现新规则。

```typescript
trigger_induction({
  min_cluster_size: 3,        // 最小聚类大小
  similarity_threshold: 0.7   // 相似度阈值
})
```

**返回结果**：
- `clusters_found`: 发现的聚类数量
- `candidates_created`: 创建的候选规则列表

### 2.3 查询系统状态

#### 查询 Event Pool

```typescript
list_events({
  status: "pending",  // pending | clustered | resolved
  limit: 50
})
```

#### 查询规则库

```typescript
list_regulations({
  status: "confirmed"  // candidate | hypothesis | confirmed | deprecated
})

get_regulation({
  regulation_id: "reg_001"
})
```

#### 获取系统统计

```typescript
get_stats()
// 返回：event_pool_size, regulation_count, explanation_rate 等
```

### 2.4 SWE-bench 集成

在 SWE-bench 场景中，推荐的工作流程：

```typescript
// 1. 运行测试后提交观测
submit_observation({
  source: "swe_bench",
  facts: extractFactsFromTestResult(testResult),
  context: {
    repo: instance.repo,
    issue_id: instance.instance_id,
    base_commit: instance.base_commit
  }
})

// 2. 应用补丁后再次提交观测
submit_observation({
  source: "swe_bench",
  facts: extractFactsFromTestResult(patchedResult),
  context: {
    ...same_context,
    patch_applied: true,
    patch_content_hash: hashPatch(patch)
  }
})

// 3. 定期触发归纳（如每处理 10 个 issue 后）
trigger_induction({min_cluster_size: 3})
```

---

## 3. 谓词设计指南

### 3.1 命名规范

采用层级命名：`{domain}.{entity}.{attribute}` 或 `{domain}.{attribute}`

```
test.failed              // 测试层
error.type               // 错误层
code.missing_import      // 代码层
patch.changes_file       // 补丁层
env.python_version       // 环境层
```

### 3.2 层次结构

建议按以下层次组织谓词：

| 层次 | 描述 | 示例谓词 |
|------|------|----------|
| 现象层 | 可直接观测的结果 | `test.failed`, `build.error` |
| 错误层 | 错误类型和消息 | `error.type`, `error.location` |
| 代码层 | 代码结构特征 | `code.missing_import`, `code.undefined_var` |
| 补丁层 | 修改内容特征 | `patch.adds_method`, `patch.modifies_test` |
| 环境层 | 运行环境上下文 | `env.os`, `env.python_version` |

### 3.3 SWE-bench 场景的谓词示例

详见 [references/predicates.md](references/predicates.md)

---

## 4. 最佳实践

### 4.1 如何设计初始规则

从已知的、高频的因果模式开始：

```json
{
  "name": "Missing Import Causes ImportError",
  "status": "confirmed",
  "pattern": {
    "pre": [{"pred": "code.missing_import", "value": true}],
    "eff": [{"pred": "error.type", "args": {"kind": "ImportError"}, "value": true}]
  }
}
```

**原则**：
- 宁可从少量高置信度规则开始
- 让系统从 Events 中自动发现更多规则
- 避免过度泛化（pre 不能为空）

### 4.2 何时触发归纳

推荐的触发时机：
- Event Pool 积累到 N 个（如 20 个）
- 固定时间间隔（如每小时）
- 完成一批任务后（如处理完 10 个 SWE-bench issue）

### 4.3 如何解读结果

**解释成功时**：
```
observation → [reg_003] → [reg_007] → target_fact
```
这是一条因果链，说明观测到的现象可以被现有规则解释。

**解释失败时**：
```
unexplained_core: [
  {pred: "error.type", args: {kind: "RecursionError"}, value: true}
]
```
这些是规则库的"盲区"，是学习新规则的线索。

**归纳出新规则后**：
检查 `origin.from_events` 了解规则来源，评估规则的合理性。

---

## 5. 示例场景

### 场景：SWE-bench Django Issue

**步骤 1：运行测试，提交观测**

```typescript
submit_observation({
  source: "swe_bench",
  facts: [
    {pred: "test.failed", args: {name: "test_queryset_filter"}, value: true},
    {pred: "error.type", args: {kind: "AttributeError"}, value: true},
    {pred: "error.message", args: {text: "'NoneType' object has no attribute 'pk'"}, value: true},
    {pred: "error.location", args: {file: "django/db/models/query.py", line: 1234}, value: true}
  ],
  context: {
    repo: "django/django",
    issue_id: "django__django-15790"
  }
})
```

**步骤 2：系统尝试解释**

假设没有规则能解释 `AttributeError` + `NoneType.pk` 的组合，系统创建 Event：

```json
{
  "event_id": "evt_042",
  "unexplained_core": [
    {pred: "error.message", args: {text: "'NoneType' object has no attribute 'pk'"}}
  ]
}
```

**步骤 3：积累更多相似 Events 后触发归纳**

```typescript
trigger_induction({min_cluster_size: 3})
```

系统发现 3 个 Events 都有相似的 `NoneType.pk` 错误，归纳出候选规则：

```json
{
  "regulation_id": "reg_candidate_012",
  "pattern": {
    "pre": [
      {pred: "code.nullable_fk_access", value: true},
      {pred: "code.missing_null_check", value: true}
    ],
    "eff": [
      {pred: "error.type", args: {kind: "AttributeError"}, value: true},
      {pred: "error.pattern", args: {pattern: "NoneType.*pk"}, value: true}
    ]
  }
}
```

**步骤 4：新规则验证并晋升**

随着更多观测支持这个规则，它会从 `candidate` → `hypothesis` → `confirmed`。

---

## 6. 系统哲学

### 为什么是"Event 驱动"？

| 传统方式 | Event 驱动 |
|---------|-----------|
| 记录所有观测 | 只记录"意外" |
| 存储成本高 | 存储成本低 |
| 规则是静态的 | 规则从 Events 生长 |
| 不知道知识边界 | Events = 知识边界的可视化 |

### 与人类学习的类比

```
人类                          系统
────────────────────────────────────────
遇到意外 → 困惑               检测到 Event
积累相似经验                  Event 聚类
"哦我明白了"                  归纳出 Regulation
下次遇到不再意外              Event 被消解
知识过时/错误                 Regulation deprecated
```

### 系统的"记忆"

- **短期记忆**：Event Pool（等待归纳的意外）
- **长期记忆**：Cause Regulations（已归纳的规则）
- **遗忘机制**：Events 被消解、Regulations 被 deprecated
