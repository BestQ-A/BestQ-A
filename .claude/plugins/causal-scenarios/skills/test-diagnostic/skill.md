---
name: test-diagnostic
description: 测试诊断推理引擎的完整闭环：种子知识→不完整信息诊断→追问→补充→收敛→建议。
---

# 诊断推理引擎测试

## 目标

验证因果引擎能做到：
1. 给不完整信息 → 识别信息缺口 → 生成追问
2. 补充信息后 → 置信度提升 → 收敛到解释
3. 收敛后 → 给出改进建议

## 执行步骤

### Phase 1：建立知识库（种子数据）

调用 `mcp__causal-learner__set_test_mode` 进入测试模式：
```json
{ "enabled": true }
```

提交 6 条观测，建立两类已知问题的知识：

**类别 A：配置错误导致服务崩溃**

观测 A1:
```json
mcp__causal-learner__submit_observation
{
  "observation": {
    "facts": [
      {"pred": "error_type", "value": "ConfigError"},
      {"pred": "symptom", "value": "service_crash"},
      {"pred": "affected_module", "value": "config-loader"},
      {"pred": "root_cause", "value": "missing_env_variable"}
    ],
    "context": {"project": "web-app", "env": "production"}
  }
}
```

观测 A2（类似）:
```json
{
  "observation": {
    "facts": [
      {"pred": "error_type", "value": "ConfigError"},
      {"pred": "symptom", "value": "service_crash"},
      {"pred": "affected_module", "value": "db-connector"},
      {"pred": "root_cause", "value": "missing_env_variable"}
    ],
    "context": {"project": "api-service", "env": "staging"}
  }
}
```

观测 A3:
```json
{
  "observation": {
    "facts": [
      {"pred": "error_type", "value": "ConfigError"},
      {"pred": "symptom", "value": "startup_failure"},
      {"pred": "affected_module", "value": "auth-service"},
      {"pred": "root_cause", "value": "invalid_config_format"}
    ],
    "context": {"project": "web-app", "env": "local"}
  }
}
```

**类别 B：空指针/类型错误导致请求失败**

观测 B1:
```json
{
  "observation": {
    "facts": [
      {"pred": "error_type", "value": "TypeError"},
      {"pred": "symptom", "value": "500_error"},
      {"pred": "affected_module", "value": "user-handler"},
      {"pred": "root_cause", "value": "null_reference"}
    ],
    "context": {"project": "web-app", "env": "production"}
  }
}
```

观测 B2:
```json
{
  "observation": {
    "facts": [
      {"pred": "error_type", "value": "TypeError"},
      {"pred": "symptom", "value": "500_error"},
      {"pred": "affected_module", "value": "order-handler"},
      {"pred": "root_cause", "value": "null_reference"}
    ],
    "context": {"project": "api-service", "env": "production"}
  }
}
```

观测 B3:
```json
{
  "observation": {
    "facts": [
      {"pred": "error_type", "value": "TypeError"},
      {"pred": "symptom", "value": "request_timeout"},
      {"pred": "affected_module", "value": "payment-handler"},
      {"pred": "root_cause", "value": "undefined_property_access"}
    ],
    "context": {"project": "web-app", "env": "staging"}
  }
}
```

**断言 T1**: 6 条观测均成功写入。

### Phase 2：触发归纳

```json
mcp__causal-learner__trigger_induction
{ "options": { "minClusterSize": 2, "minSimilarity": 0.3, "autoValidate": false } }
```

**断言 T2**: regulations > 0，应学到至少 2 条规律（ConfigError 类 + TypeError 类）。

### Phase 3：诊断测试 — 不完整信息

现在模拟用户只说了"服务崩了"：

尝试调用 `mcp__causal-learner__diagnose_problem`（如果可用）：
```json
{
  "facts": [
    {"pred": "symptom", "value": "service_crash"}
  ]
}
```

如果 `diagnose_problem` 不可用，用 `mcp__causal-learner__suggest_causes` 替代：
```json
{
  "observation": {
    "facts": [{"pred": "symptom", "value": "service_crash"}]
  }
}
```

**断言 T3**: 返回候选解释（应匹配 ConfigError 类规律）。

**期望行为**: 引擎应该识别出"知道 symptom=service_crash，但不知道 error_type 和 affected_module"，
建议追问这些信息。

### Phase 4：补充信息后重新诊断

用户补充："错误类型是 ConfigError"

再次调用 suggest_causes，加上补充信息：
```json
{
  "observation": {
    "facts": [
      {"pred": "symptom", "value": "service_crash"},
      {"pred": "error_type", "value": "ConfigError"}
    ]
  }
}
```

**断言 T4**: 置信度应该比 T3 更高，候选应该收敛到 ConfigError 类规律。

### Phase 5：统计

```json
mcp__causal-learner__get_stats
```

**断言 T5**: observations >= 6, regulations >= 2。

## 报告格式

```
=== 诊断推理引擎测试 ===

Phase 1 (种子数据):    T1 PASS/FAIL — N 条观测写入
Phase 2 (归纳学习):    T2 PASS/FAIL — M 条 regulation 学到
Phase 3 (不完整诊断):  T3 PASS/FAIL — 候选 N 个，是否识别信息缺口
Phase 4 (补充后诊断):  T4 PASS/FAIL — 置信度提升，候选收敛
Phase 5 (知识库状态):  T5 PASS/FAIL — 统计正确

诊断能力评估:
  信息缺口识别: YES/NO
  追问生成: YES/NO（diagnose_problem 可用时）
  置信度收敛: YES/NO
  改进建议: YES/NO

总计: X/5 通过
```
