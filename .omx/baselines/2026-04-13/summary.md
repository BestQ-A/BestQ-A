---
kind: instance
conforms_to: docs/current/run-summary-contract.md
generated_by: scripts/capture-baseline.mjs
generated_at: 2026-04-13
---

# Baseline 2026-04-13

- commit: `ff82b76`
- out: `.omx/baselines/2026-04-13/`
- Stats capture status: **OK** — ok=[storageStats, dualStats, longtermStats, graphStats, pipelineStats] error=[none]

## Conclusion

Build OK, 5 test files passed. Baseline is reproducible for re-run.

## Files

- `commit.txt` — git HEAD short sha
- `tests.log` — build + test 全量输出
- `stats.json` — causal-learner stats 快照（真实字段：storageStats / dualStats / longtermStats / graphStats / pipelineStats，均基于空 :memory: 实例）
- `coverage-matrix.md` — core/*.ts 与 tests 的粗粒度关联表
- `summary.md` — 本文件

## Steps

- OK   mkdir baseline dir — E:\1_agents_space\9_AGI\BestQ-A\.omx\baselines\2026-04-13
- OK   capture git HEAD — ff82b76
- OK   mcp-server build
- OK   mcp-server tests — 5 ok / 0 fail
- OK   stats snapshot — OK: 5 ok / 0 error
- OK   coverage matrix — 24 source files scanned

## Failed Steps

- (none)

## Captured

- stats.json: OK
  - ok fields: storageStats, dualStats, longtermStats, graphStats, pipelineStats
  - error fields: (none)
  - 注：当前对空 :memory: 实例采集，所有计数为 0 属正常；字段结构真实来自 storage/dual-storage/atom-graph/pipeline.getStats()

## Known Gaps

- stats 采集目前面向空内存实例，只固化"结构 + 零值"，不反映真实长期库内容
- 覆盖率是文本近似，不是行覆盖率
- swebench-10.json 未生成（路线图 Phase 0 列的 swebench 快照尚未脚本化）
