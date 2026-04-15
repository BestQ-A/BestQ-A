---
name: test-v13-showcase
description: v13 全链路展示场景：从观测到文明记忆的完整治理闭环。演练九大对象联动：FailureBoundaryArchive、ReconstructionStore、BranchPoint、CounterexampleCommons、ProofLineage、ConstitutionalLayer、PresentSlice、LineageCompileProposal、HistoricalCompressionRecord。
---

# Scenario V13 — 全链路治理闭环展示

## 目标

在一个完整的故障诊断场景中，验证 v13 九大治理对象从观测到文明记忆的端到端闭环：

```
观测写入 → 归纳学习 → 修复记录 → 过程重建 → 因果分段
→ 分叉治理 → 宪法审计 → 证明谱系 → 当下切片 → 历史压缩
```

## Fact 结构规范

所有 `submit_observation` 调用中，`facts` 数组每项必须是：
```json
{ "pred": "<谓词名>", "value": "<值>", "args": { ... } }
```

## 执行步骤

### 准备

调用 `mcp__causal-learner__set_test_mode`：
```json
{ "enabled": true }
```

调用 `mcp__causal-learner__get_stats` 记录基线。

### Step 1：构建生产事故观测（多因多果）

提交 3 条相关观测，模拟一次生产事故的多层观察：

观测 1（配置层）：
```json
{
  "facts": [{"pred": "config_state", "value": "corrupted", "args": {"file": "app.yaml", "field": "db_host"}}],
  "context": {"env": "production", "team": "platform", "incident": "INC-V13-001"}
}
```

观测 2（服务层）：
```json
{
  "facts": [{"pred": "service_state", "value": "crash_loop", "args": {"service": "api-gateway", "restarts": 12}}],
  "context": {"env": "production", "team": "platform", "incident": "INC-V13-001"}
}
```

观测 3（用户影响层）：
```json
{
  "facts": [{"pred": "user_impact", "value": "503_errors", "args": {"rate": "100%", "duration": "15min"}}],
  "context": {"env": "production", "team": "platform", "incident": "INC-V13-001"}
}
```

**断言 V13-1**：三条观测均成功写入。

### Step 2：归纳学习 — 验证 regulation 产出

先提交第二组相似观测（触发聚类）：

观测 4（同类事故）：
```json
{
  "facts": [{"pred": "config_state", "value": "corrupted", "args": {"file": "db.yaml", "field": "connection_pool"}}],
  "context": {"env": "staging", "team": "platform", "incident": "INC-V13-002"}
}
```

观测 5（同类事故）：
```json
{
  "facts": [{"pred": "service_state", "value": "crash_loop", "args": {"service": "worker", "restarts": 8}}],
  "context": {"env": "staging", "team": "platform", "incident": "INC-V13-002"}
}
```

调用 `mcp__causal-learner__trigger_induction`：
```json
{ "options": { "minClusterSize": 2, "minSimilarity": 0.3, "autoValidate": false } }
```

**断言 V13-2**：`regulationsCreated.length > 0`，regulation 有 `pre`（从 context 动态提取）和 `eff`。

### Step 3：修复记录 — 触发 v13 全治理链

对 Step 1 第一条观测的 Story 调用 `mcp__causal-learner__record_fix`：
```json
{
  "eventId": "<Step 1 观测 1 的 storyId>",
  "fix": {
    "fixCommit": "fix/restore-config-and-add-validation",
    "fixDescription": "从 git 恢复 app.yaml + 新增 config validation pre-deploy hook",
    "filesChanged": ["app.yaml", "scripts/validate-config.sh", "ci/pre-deploy.yaml"],
    "testsPassed": true
  }
}
```

**断言 V13-3**（reconstruction）：
- `reconstruction.nearCauseSegment.length > 0`（近因非空）
- `reconstruction.deepCauseSegment.length > 0`（远因非空）
- `reconstruction.minimalityJustification !== null`

**断言 V13-4**（宪法审计）：
- `constitutionalAudit.mandatoryPassed === true`
- `constitutionalAudit.failedCount === 0`（mandatory 全通过）

### Step 4：因果查询 — 验证学习成果

调用 `mcp__causal-learner__suggest_causes`：
```json
{
  "facts": [{"pred": "service_state", "value": "crash_loop"}]
}
```

**断言 V13-5**：返回至少 1 条 regulation 命中。

调用 `mcp__causal-learner__causal_search`：
```json
{ "query": "config corrupted crash loop production", "strategy": "regulation_first" }
```

**断言 V13-6**：搜索结果非空。

### Step 5：最终统计

调用 `mcp__causal-learner__get_stats` 获取最终状态。

**断言 V13-7**：
- observations > 基线
- events > 基线
- regulations > 0

## 报告格式

```
=== Scenario V13: 全链路治理闭环展示 ===

--- 学习闭环 ---
断言 V13-1 (多层观测写入): PASS / FAIL
断言 V13-2 (归纳产出 regulation): PASS / FAIL
断言 V13-5 (suggest_causes 命中): PASS / FAIL
断言 V13-6 (causal_search 命中): PASS / FAIL / SKIP

--- v13 治理对象 ---
断言 V13-3 (reconstruction 三层分段 + minimality): PASS / FAIL
断言 V13-4 (宪法审计 mandatory 全通过): PASS / FAIL

--- 统计 ---
断言 V13-7 (知识增长): PASS / FAIL
  observations: 基线 → 最终
  events: 基线 → 最终
  regulations: 0 → N

v13 治理对象在 pipeline 中激活的证据：
  FailureBoundaryArchive: 失败路径记录数
  ReconstructionStore: 重建持久化
  BranchPoint: 分叉治理 (chosen/pruned)
  CounterexampleCommons: 归纳反例计数
  ProofLineage: 证明谱系构建
  ConstitutionalLayer: 审计结果
  PresentSlice: 当下切片构建
  LineageCompileProposal: 编译提案
  HistoricalCompressionRecord: 历史压缩记录

总计: X/7 通过
```
