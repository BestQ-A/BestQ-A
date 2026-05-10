---
kind: test-brief
status: draft
verified: 2026-04-17
schema_version: 1
describes: "MVP LLM 推理链外挂 — 独立 agent 执行的四层验证测试任务书"
audience: "外部 AI agent（opencode / codex / 其他），零先验假设"
---

# MVP LLM 推理链外挂 — Agent 独立验证任务书

> 这是一份**自包含**任务书，独立 AI agent 可以脱离上下文直接执行。
> 所有路径、命令、验收标准、数据位置已在本文档中写清。

---

## 0. 项目上下文（必读，30 秒）

- **项目**：BestQ-A（因果学习驱动的 LLM 编程外挂）
- **MVP 目标**：给 LLM 编程套一个"外挂大脑"，用 MiniMax coding-plan model 对 LLM 产出的 patch 做逆向推理，识别跳步/证据缺失/API 幻觉等问题，返回 `pass / warn / block` 判定
- **甲方定位**：给自己用，弥补"LLM 编程缺乏显式逻辑连贯思维"
- **北极星**：推导链 + 重建保真度（不是 solve_rate）
- **详细设计**：[docs/mvp-llm-reasoning-guard-plan.md](./mvp-llm-reasoning-guard-plan.md)（含架构/验收标准/已达成指标）

## 1. 环境准备

### 1.1 项目路径
```
E:/1_agents_space/9_AGI/BestQ-A
```

### 1.2 关键依赖
- Node.js ≥ 18
- `.env` 文件已存在（根目录），含 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`
- MiniMax API 配额：甲方超大配额，可放心调用

### 1.3 已编译产物
```
causal-learner/mcp-server/dist/cli/bestqa.js          # CLI 入口
causal-learner/mcp-server/dist/core/minimax-reviewer.js  # 逆向审查
causal-learner/mcp-server/dist/core/reasoning-card-ingest.js  # 入库
```

如未编译：`cd causal-learner/mcp-server && npm run build`

### 1.4 环境变量注入方式（Windows bash）
```bash
cd /e/1_agents_space/9_AGI/BestQ-A
set -a && source .env && set +a
export MINIMAX_API_KEY="$LLM_API_KEY"
export MINIMAX_API_HOST="https://api.minimax.io"
export MINIMAX_MODEL="$LLM_MODEL"
```

### 1.5 CLI 基本用法
```bash
node causal-learner/mcp-server/dist/cli/bestqa.js check <patch-file> \
  [--problem <problem-file>] [--context <file1,file2>] [--force]

# 输出 JSON 的 ReasoningCard 到 stdout
# 退出码：0 = pass/warn；1 = block；2 = 参数错；3 = 运行错
```

---

## 2. 测试产出规范

在 `tests/agent-eval/` 目录下生成以下文件：

| 文件 | 内容 |
|------|------|
| `layer1-baseline.json` | 第一层回归结果 |
| `layer2-generalization.json` | 第二层泛化结果 |
| `layer3-adversarial.json` | 第三层对抗结果 |
| `layer3-patches/` | 对抗测试手写的 5 个 patch |
| `REPORT.md` | 汇总四层 + 一句话结论 |

**硬规则**：
- ❌ 不得修改 `causal-learner/mcp-server/src/` 下代码
- ❌ 不得 mock MiniMax API（必须真实调用）
- ❌ 不得跳过任何一层
- ✅ 只能新增文件到 `tests/agent-eval/`
- ✅ 如发现 bug，记录在 REPORT.md 的 "Issues Found" 章节，**不要自行修改**

---

## 3. 第一层：盒内回归（Baseline 守恒）

### 3.1 目的
确认现有 15 样本的六项指标没退化。这是"系统没坏"的最低证明。

### 3.2 动作
```bash
cd /e/1_agents_space/9_AGI/BestQ-A
set -a && source .env && set +a
MINIMAX_API_KEY="$LLM_API_KEY" MINIMAX_API_HOST="https://api.minimax.io" \
  MINIMAX_MODEL="$LLM_MODEL" node tests/mvp-samples/run-eval.mjs
```

### 3.3 验收（六项全绿）
| 指标 | 目标 | 上次实测 |
|------|------|----------|
| Hit rate | ≥ 0.70 | 0.857 |
| FP rate | ≤ 0.20 | 0.000 |
| Grading accuracy | ≥ 0.80 | 1.000 |
| Traces stored | ≥ 1 | 10 |
| Total nodes | ≥ 50 | 60 |
| Min SL per card | ≥ 1 | 3 |

### 3.4 产出 `layer1-baseline.json`
直接拷贝 `tests/mvp-samples/eval-report.json` 的内容到 `tests/agent-eval/layer1-baseline.json`，并追加一个 `agent_verdict` 字段：
- `"regression_pass"` — 六项全绿
- `"regression_fail"` — 任一项退化
- `"flaky"` — 指标接近目标线但单次跑到了（比如 Hit=0.70 刚好）

---

## 4. 第二层：盒外泛化（未见样本）

### 4.1 目的
证明"指标好"不是过拟合 15 个样本。挑 15 个**之前没用过**的样本重跑。

### 4.2 数据来源
- 总样本池：`predictions.json`（根目录，300 条）+ `causal-learner/mcp-server/src/benchmark/data/swe-bench-lite.json`（300 条）
- 已用 instance_id：查 `tests/mvp-samples/index.json` 的 `selected[].instance_id`
- 池子里还有 ~270 个可用（扣掉 15 已用 + 81 个空预测 + 30 partial ≈ 264）

### 4.3 动作

步骤 A — 生成 S016-S030 新样本：修改 `tests/mvp-samples/extract.mjs` 的副本放到 `tests/agent-eval/extract-v2.mjs`，关键改动：
```javascript
// 改动点 1：skip 已用的 instance_id
const USED_IDS = new Set(/* 从 tests/mvp-samples/index.json 读 */);
// ...
for (const [id, predPatch] of Object.entries(preds)) {
  if (USED_IDS.has(id)) continue;
  // ... 原逻辑
}

// 改动点 2：输出到 tests/agent-eval/samples-v2/ 下 S016-S030.json
const outDir = join(__dirname, 'samples-v2');

// 改动点 3：优先取非 django 的样本（原批次 all-django）
// 按 instance_id 前缀去重分布，保证样本来自至少 3 个不同 repo
```

步骤 B — 拷贝并改造 `run-eval.mjs` → `tests/agent-eval/run-eval-v2.mjs`：
- 读 `tests/agent-eval/samples-v2/S*.json`
- STORE_PATH 改为 `causal-learner/data/mvp-causal-learner-v2.sqlite`（不污染第一层 DB）
- 其余逻辑完全相同

步骤 C — 跑：
```bash
node tests/agent-eval/extract-v2.mjs
node tests/agent-eval/run-eval-v2.mjs
```

### 4.4 验收（泛化可宽容 20%）
| 指标 | 目标（泛化宽容版） |
|------|----------------|
| Hit rate | ≥ 0.60 |
| FP rate | ≤ 0.30 |
| Grading accuracy | ≥ 0.70 |
| Repo 多样性 | ≥ 3 个不同 repo（不全是 django） |

### 4.5 产出 `layer2-generalization.json`
同第一层格式，加 `agent_verdict`：
- `"generalizes"` — 指标达标且样本多样
- `"overfits"` — 新样本指标大幅下降（>20%）
- `"sample_biased"` — 样本全部来自同一 repo

---

## 5. 第三层：对抗测试（手写陷阱 patch）

### 5.1 目的
你（agent）故意写 5 个带典型陷阱的 patch，看 MiniMax 能否按预期分类。这是**从外部红队视角**验证 grading 规则。

### 5.2 手写 5 个 patch 到 `tests/agent-eval/layer3-patches/`

| 编号 | 陷阱类型 | 预期 verdict | 预期 issue code |
|------|---------|-------------|----------------|
| A01.patch | 调用**不存在的 API** | block | PHANTOM_API |
| A02.patch | 只改 1 行，无推理链 | warn/block | COARSE_CHAIN |
| A03.patch | 去掉 error handling fallback，无说明 | block | BROKEN_CHAIN |
| A04.patch | **真正正确**的 patch（从 swe-bench gold 挑一个） | pass/warn | 0 fatal issues |
| A05.patch | import 路径错误（typo） | block | PHANTOM_API 或 BROKEN_CHAIN |

**patch 具体写法要求**：
- 每个 patch 必须是有效的 unified diff 格式（`diff --git a/... b/...` 开头）
- 每个 patch 配一个 `A0X-problem.txt` 说明 Problem Statement（2-5 行描述要解决的问题）
- A04 要从 `swe-bench-lite.json` 直接取 `.patch` 字段做真实 gold

### 5.3 跑 5 个 patch

对每个 patch：
```bash
node causal-learner/mcp-server/dist/cli/bestqa.js check \
  tests/agent-eval/layer3-patches/A0X.patch \
  --problem tests/agent-eval/layer3-patches/A0X-problem.txt \
  > tests/agent-eval/layer3-patches/A0X-result.json 2>&1
```

### 5.4 验收
| 条件 | 目标 |
|------|------|
| 陷阱命中率（A01-A03+A05 应 warn 或 block） | ≥ 3/4 |
| 正确 patch 不误报（A04 应 pass 或 warn） | 1/1 |
| 指定 issue code 至少出现 1 个 | ≥ 3/5 |

### 5.5 产出 `layer3-adversarial.json`
```json
{
  "cases": [
    {
      "id": "A01",
      "trap_type": "PHANTOM_API",
      "expected_verdict": "block",
      "actual_verdict": "...",
      "expected_codes": ["PHANTOM_API"],
      "actual_codes": [...],
      "trap_caught": true/false
    },
    // ... A02-A05
  ],
  "summary": {
    "traps_caught": 4,
    "false_positive_on_correct": false,
    "expected_codes_hit_rate": 0.6
  },
  "agent_verdict": "adversarial_robust | brittle | random"
}
```

---

## 6. 汇总报告 `REPORT.md`

用以下模板：

```markdown
# MVP Agent Test Report

**Executor**: <agent name, e.g. opencode / codex>
**Date**: <YYYY-MM-DD>
**Duration**: <total wall-clock time>
**MiniMax calls**: <total count>

## Summary
One-sentence conclusion: "MVP is [ship-ready | needs-work | broken] because [reason]."

## Layer Results

### Layer 1 — Baseline Regression
<table of 6 metrics, targets, actuals, pass/fail>

### Layer 2 — Generalization
<same table + repo diversity>

### Layer 3 — Adversarial
<5 cases table + trap-caught rate>

## Issues Found
(如果发现 bug/异常，列在这里，不要自行 fix)
- [ ] Issue 1: ...
- [ ] Issue 2: ...

## Anomalies & Surprises
(非硬指标但值得甲方注意的观察)
- 例：MiniMax 对某类 patch 响应时间超过 60s
- 例：某 issue code 从未出现过（可能不触发）

## Reproduce
```
# 重跑本测试的命令
cd /e/1_agents_space/9_AGI/BestQ-A
... 环境变量 ...
node tests/agent-eval/run-eval-v2.mjs
...
```
```

---

## 7. 预期时长与成本

- Layer 1：~8 分钟（15 次 MiniMax，每次 ~30s）
- Layer 2：~10 分钟（15 次 MiniMax + 样本构造）
- Layer 3：~3 分钟（5 次 MiniMax + 手写 patch）
- 报告汇总：~2 分钟
- **总计**：~25 分钟真实 wall-clock
- **MiniMax 调用**：~35 次（甲方配额充足，不必担心）

---

## 8. 重要警告

1. **不要用 Claude API 辅助审查**——这会污染测试。MiniMax 是唯一审查器，Claude（或 GPT）仅负责执行步骤和写报告。
2. **不要因为"看起来更好"而调整 prompt**——MVP 当前 prompt 是上线版本，调整会让测试不可信。
3. **不要跳过 JSON 解析错误**——如果遇到 "MiniMax returned non-JSON"，记录为 error，保留原样。
4. **不要修改已入库的 SQLite DB**——第二层用独立 DB (`mvp-causal-learner-v2.sqlite`)，避免污染。

---

## 9. 交付确认

完成后，检查：
- [ ] `tests/agent-eval/layer1-baseline.json` 存在且含 `agent_verdict`
- [ ] `tests/agent-eval/layer2-generalization.json` 存在且含 `agent_verdict` + repo 分布
- [ ] `tests/agent-eval/layer3-adversarial.json` 存在且含 5 个 case
- [ ] `tests/agent-eval/layer3-patches/` 下 5 个 .patch + 5 个 -problem.txt + 5 个 -result.json
- [ ] `tests/agent-eval/REPORT.md` 存在且一句话结论明确
- [ ] 没有修改 `causal-learner/mcp-server/src/` 任何文件（git status 确认）

---

## 10. 联系信息

- **甲方**：胡飞扬（feiyang.hu@optix.cn）
- **项目 PM（AI）**：Claude Code
- **任务下达时间**：2026-04-17

执行过程中遇到任务书本身的歧义 → 记录在 REPORT.md 的 "Questions for PM" 章节，不要自行裁决。
