# Causal Learner Skill（异常驱动的因果学习/规则归纳）

> 核心理念：**只学习“意外（Event）”**  
> - 能被现有规则解释的观测：只更新证据（support/failed）  
> - 解释不了的观测：进入 **Event Pool**，等待聚类与归纳  
> - 从 Event Pool 归纳出的新规则（Regulation）会反过来“吞掉”旧的事件，Event Pool 会自然变小

---

## 1. 概念总览

### 1.1 三层数据流

```
Observation Stream (原始观测流)
        │
        ▼
Explainer / Event Detector
        │ explained? ───────────────► update regulation evidence
        │
        ▼
Event Pool (解释不了的意外)
        │
        ▼ (periodic)
Event Clustering  ──► Induction ──► Validation ──► new Regulation
```

### 1.2 关键对象

- **Observation**：一次观测输入（facts + context + raw refs）
- **Regulation**：因果规则（pre/do/eff + evidence + scope），用于解释/预测
- **Event**：意外（Observation + attempted_explanations + unexplained_aspects）
- **Probe / Action**：只观测 or 干预，用于把“剧情”变成可验证/可切断的计划

---

## 2. 你会得到什么能力

### 2.1 实时循环（每条观测到来）
1) 解释：用 regulations 拼接“剧情链”解释 observation 的目标事实  
2) 判断：若解释足够好 → 更新证据；否则 → 生成 Event 并入池

### 2.2 定期循环（每 N 个事件 / 每 T 分钟）
1) 聚类：把相似 events 聚类（按 unexplained_aspects + context）  
2) 归纳：从 cluster 提炼候选规则（candidate regulation）  
3) 验证：用简单规则验证候选，合格则加入 regulation 集合  
4) 回收：被新规则解释掉的事件从 event_pool 移除（或标为 resolved）

---

## 3. 文件结构

```
causal-learner/
├── SKILL.md
├── schemas/
│   ├── observation.schema.json
│   ├── event.schema.json
│   ├── regulation.schema.json
│   └── test_result.schema.json
├── templates/
│   ├── __init__.py
│   ├── types.py              # dataclasses + (de)serialize helpers
│   ├── unify.py              # predicate unification / matching
│   ├── explainer.py          # backward-chaining + beam search “拼剧情”
│   ├── event_detector.py     # explained? -> update evidence / create Event
│   ├── inducer.py            # cluster events -> induce candidate regulation
│   ├── validator.py          # sanity checks for candidate regulations
│   ├── storage.py            # in-memory stores + jsonl persistence
│   └── demo_pipeline.py      # 一个可运行的端到端示例
└── examples/
    └── gpu_crash/
        ├── observations.jsonl
        ├── regulations.jsonl
        ├── README.md
        └── run_demo.py
```

---

## 4. “解释不了”的判定（Event Detector 默认策略）

- 先用 `explainer.explain()` 找到 top stories（每条 story 是一串 rules + 可能的 assumptions）
- 认为 **强解释（explained）** 的条件：
  - best_story.score >= `min_score`
  - best_story.assumptions_count <= `max_assumptions`（默认 0）
  - 且目标事实全部覆盖

否则创建 Event，记录：
- attempted_explanations：前 1~3 个候选剧情（含 missing_pres）
- unexplained_aspects：
  - 目标事实中“没有任何 rule 的 eff 能覆盖”的那些
  - 或者 best_story 仍覆盖不了的目标事实（若有）

---

## 5. 归纳（Induction）的默认策略（MVP）

### 5.1 聚类
- 主键：unexplained_aspects 的 `pred=value` 组合（可以先做精确分桶）
- 可选：再按关键 context（OS/GPU/driver/device_kind）做细分

### 5.2 归纳规则（从 event cluster 提炼 candidate）
- `eff`：cluster 中共同出现的 unexplained_aspects（交集；为空则取最高频）
- `pre`：由两部分组成：
  1) cluster 共同 context（交集）
  2) attempted_explanations 的 missing_pres 中“高频出现”的前提（>= 60%）
- `status`：candidate
- `origin.induced_from_events`：记录来源 events

### 5.3 验证（Validator）
- `eff` 不能为空
- `pre` 不能为空（避免过度泛化）
- pre 在 cluster 中满足比例 >= 80%
- candidate 不与现有规则完全重复（exact match）

---

## 6. 运行示例

在 `examples/gpu_crash/` 里有一个端到端 demo：

```bash
python run_demo.py
```

你会看到：
- 哪些 observation 被解释（证据累计）
- 哪些变成 event
- event 聚类后归纳出哪些 candidate regulations
- 新规则加入后，哪些 event 被“吞掉/解决”

---

## 7. 如何接入你自己的项目

### 7.1 你需要做的最小工作
1) 定义一小套 **Fact（谓词）**（50~150 个即可）
2) 把你的日志/指标解析成 `Observation.facts`（probe/解析器）
3) 写几条初始 Regulation（哪怕只有 observational 也行）

### 7.2 你会立刻得到的收益
- 不再“记录一切”，而是只把资源投入到 **边界/意外**
- 规则库会随着使用逐渐扩展，event_pool 会逐渐减少
- 推理输出天然是“半成品侦查报告”：剧情链 + 缺口 + 可验证测试

---

## 8. 下一步增强（建议路线）
- 将 induction 从“交集归纳”升级为：变量泛化（?x）、最小描述长度（MDL）、以及跨 cluster 的 negative test
- 将 explainer 从单一 beam search 升级为：多目标覆盖（set cover）+ 宏规则（frequent subchain）
- 引入漂移检测：不同版本段自动拆分 scope
