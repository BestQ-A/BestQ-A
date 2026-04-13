---
kind: instance
conforms_to: docs/current/run-summary-contract.md
generated_by: scripts/eval.mjs
generated_at: 2026-04-13
---

# Eval 20260413-003

- commit: `b1917ce`
- phase: phase1
- dataset: placeholder
- n_instances: 0
- duration_sec: 2.175

## Conclusion

Run completed. 28 fields captured, 10 fields null (TBD or Phase-gated).

## Key deltas (dualStats)

- regulationsByStatus: candidate: 0→0, hypothesis: 0→0, confirmed: 0→0, retired: 0→0
- eventsByStatus: open: 0→0, clustered: 0→0, resolved: 0→0, archived: 0→0

## Verification

- build: ok
- test_basic: ok
- stats_before: ok
- stats_after: ok
- field_mapping_errors: 0

## Failed steps

- (none)

## Files

- `metrics.json` — 机器可读度量（字段见 metrics-contract.md §2）
- `verification_report.json` — 各步骤状态 + 字段映射错误
- `stats_before.json` — 运行前 causal-learner 四类 stats 快照
- `stats_after.json` — 运行后快照
- `run.log` — 完整 stdout/stderr
- `summary.md` — 本文件
