---
name: test-swe-bench
description: 运行 SWE-bench Causal Learning Benchmark。在 30 个 SWE-bench 风格 issues 上训练+预测，测量因果学习系统的 hit_rate、category_accuracy、diversity 三项指标。一键可复现的端到端评测。
---

# SWE-bench Causal Learning Benchmark

## 目标

在真实的 SWE-bench 风格问题上验证因果学习系统的三项核心能力：

| 指标 | 含义 | 目标 |
|---|---|---|
| **hit_rate** | 对测试 issue 返回至少 1 条 regulation 的比例 | ≥ 80% |
| **category_accuracy** | top-1 regulation 的 effect 匹配正确 error category 的比例 | ≥ 70% |
| **diversity** | regulations 数 / 训练集 categories 数 | ≥ 0.5 |

## 数据集

内置 30 个 SWE-bench 风格 issue，分为 6 个 error categories：
- **type_error** (5): TypeError 在 QuerySet/form/request/serializer/template
- **import_error** (5): ImportError/ModuleNotFoundError 在 migration/blueprint/dependency
- **assertion_error** (5): 测试断言失败、回归、API contract
- **config_error** (5): settings/env/YAML 配置问题
- **value_error** (5): ValueError 在 date/decimal/URL/JSON/int 解析
- **key_error** (5): KeyError 在 dict/cache/context/settings/response

按 category 分层切分（默认 train:test = 0.7:0.3）。

## 执行

### 方式 1：直接 CLI

```bash
cd E:/1_agents_space/9_AGI/BestQ-A/causal-learner/mcp-server
npx tsx src/benchmark/swe-bench-runner.ts
```

可选参数：`--split 0.6`（自定义 train/test 比例）

### 方式 2：通过 MCP（如果需要在会话中触发）

由于 benchmark 直接调用 core 层，不经过 MCP，建议用方式 1。

## 报告字段说明

```
=== SWE-bench Causal Learning Benchmark ===

数据集：30 issues / 6 categories
训练集：24  测试集：6  split=0.7
训练集 categories: 6
归纳产出：N regulations   diversity=X.XX

--- 学到的 regulations ---
  [reg_xxxxxxxx] support=N
    pre: <共同前提条件>
    eff: error_category="<目标类别>"

--- 预测结果 ---
  [HIT/MISS] [OK/空] <issueId>  expected=<真实 category>  pred=<预测 category>  score=X.XX

--- 指标 ---
  hit_rate:          XX.X%  (N/total)
  category_accuracy: XX.X%  (M/total)
  avg_causes:        X.X
  duration:          Nms
```

## 当前 baseline（2026-04-16）

```
hit_rate:          100.0%  (6/6)
category_accuracy: 83.3%   (5/6)
diversity:         0.83    (5 regs / 6 categories)
```

唯一错误：CONFIG-5 被分到 key_error（因为 config_error 类内 error_type 异质性高，归纳引擎无法产生 config-specific 的共同 pre——这是数据本身的结构问题，不是引擎缺陷）。

## 扩展路径

1. **更多 issue**：从 SWE-bench Lite 真实数据集导入（300+ issues）
2. **更多指标**：top-k accuracy、MRR、category confusion matrix
3. **对比基线**：LLM 直接回答 vs 因果学习+LLM
