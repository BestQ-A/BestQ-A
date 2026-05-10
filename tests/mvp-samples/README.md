# MVP 测试集

> 来自 [docs/mvp-llm-reasoning-guard-plan.md](../../docs/mvp-llm-reasoning-guard-plan.md) W1 T1.1。

## 来源

- LLM 预测：`predictions.json`（项目根，300 条）
- Gold 答案：`causal-learner/mcp-server/src/benchmark/data/swe-bench-lite.json`（300 条，一一对应）

## 筛选规则

从 300 个配对样本中挑选 10-15 个：
- **8 个明确错误样本**：`predicted != gold`，且 predicted patch 与 gold 差异明显（非格式差异）
- **3 个明确正确样本**：`predicted == gold`（用于测误报率）
- **2-4 个边缘样本**：predicted 命中部分 gold（partial fix）

## Schema

每个样本是 `S###.json`：

```json
{
  "id": "S001",
  "source": "predictions.json + swe-bench-lite.json",
  "instance_id": "astropy__astropy-12907",
  "problem_statement": "...",
  "predicted_patch": "...",
  "gold_patch": "...",
  "verdict": "wrong | correct | partial",
  "notes": "人工标注的关键问题，用作 MiniMax 审查命中率判定基准"
}
```

## 产物

- `S001.json` ~ `S015.json` — 样本
- `index.json` — 筛选元数据
- `extract.mjs` — 提取脚本（可复跑）
