# MVP Agent Test Report

**Executor**: OpenCode (gpt-5.4)
**Date**: 2026-04-17
**Duration**: ~40 minutes wall-clock
**MiniMax calls**: 40

## Summary

One-sentence conclusion: "MVP is needs-work because baseline, generalization, and adversarial grading quality are all strong, but there are still real transport and CLI stability issues that make the current delivery not yet cleanly ship-ready."

## Layer Results

### Layer 1 — Baseline Regression

| Metric | Target | Actual | Pass/Fail |
|------|--------|--------|-----------|
| Hit rate | `>= 0.70` | `1.000` | Pass |
| FP rate | `<= 0.20` | `0.000` | Pass |
| Grading accuracy | `>= 0.80` | `1.000` | Pass |
| Traces stored | `>= 1` | `9` | Pass |
| Total nodes | `>= 50` | `62` | Pass |
| Min SL per card | `>= 1` | `3` | Pass |

Layer verdict: `regression_pass`

### Layer 2 — Generalization

| Metric | Target | Actual | Pass/Fail |
|------|--------|--------|-----------|
| Hit rate | `>= 0.60` | `0.833` | Pass |
| FP rate | `<= 0.30` | `0.000` | Pass |
| Grading accuracy | `>= 0.70` | `0.909` | Pass |
| Repo diversity | `>= 3 repos` | `11 repos` | Pass |

Layer verdict: `generalizes`

Notes:
- Samples `S016-S030` were generated from previously unused instance IDs.
- Distribution covered `pytest / sphinx / sympy / matplotlib / flask / requests / scikit-learn / pylint / seaborn / astropy / django`.
- One real call failed on `S030` with `fetch failed`, but aggregate metrics still passed the widened generalization gate.

### Layer 3 — Adversarial

| Case | Trap | Expected | Actual | Expected Code Hit | Trap Caught |
|------|------|----------|--------|-------------------|-------------|
| A01 | nonexistent API | `block` | `block` | Yes | Yes |
| A02 | one-line coarse patch | `warn/block` | `warn` | No | Yes |
| A03 | broken fallback chain | `block` | `block` | Yes | Yes |
| A04 | real gold patch | `pass/warn` | `warn` | N/A | Yes |
| A05 | import typo | `block` | `block` | Yes | Yes |

| Summary Metric | Target | Actual | Pass/Fail |
|------|--------|--------|-----------|
| Trap catch rate (`A01/A02/A03/A05`) | `>= 3/4` | `4/4` | Pass |
| Correct patch not blocked (`A04`) | `1/1` | `warn` | Pass |
| Expected code hit rate | `>= 3/5` | `0.6` | Pass |

Layer verdict: `adversarial_robust`

## Issues Found

- [ ] Layer 2 `S030` (`pytest-dev__pytest-5413`) returned `fetch failed`; this is a real runtime instability, not a grading miss.
- [ ] Layer 3 CLI runs produced valid JSON bodies but still exited with Windows assertion noise / abnormal exit codes such as `3221226505`; see `tests/agent-eval/layer3-patches/A04-result.json` tail.
- [ ] Correct gold patch `A04` was only graded as `warn`, not `pass`, because the reviewer could not verify exact context provenance for `has_add_permission`; this suggests support-link coverage is still conservative.

## Anomalies & Surprises

- Layer 2 had one partial sample (`S029`) graded as `pass`; it counted as a miss for grading expectation, but not enough to break the generalization gate.
- `A02` trap was caught by verdict severity, but the expected issue code `COARSE_CHAIN` did not appear; the reviewer preferred `LOW_CONFIDENCE_HYPOTHESIS` and `UNDECLARED_RISK`.
- The repo worktree was already dirty before this task. This run did not modify `causal-learner/mcp-server/src/`; all task-specific files were created under `tests/agent-eval/`.

## Reproduce

```powershell
cd E:/1_agents_space/9_AGI/BestQ-A

$envFile = ".env"
Get-Content $envFile |
  Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*=' } |
  ForEach-Object {
    $name, $value = $_ -split '=', 2
    $value = $value.Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [System.Environment]::SetEnvironmentVariable($name.Trim(), $value, 'Process')
  }

if (-not $env:MINIMAX_API_KEY) { $env:MINIMAX_API_KEY = $env:LLM_API_KEY }
if (-not $env:MINIMAX_MODEL) { $env:MINIMAX_MODEL = $env:LLM_MODEL }
if (-not $env:MINIMAX_API_HOST) { $env:MINIMAX_API_HOST = 'https://api.minimax.io' }

node tests/mvp-samples/run-eval.mjs
node tests/agent-eval/finalize-layer1.mjs
node tests/agent-eval/extract-v2.mjs
node tests/agent-eval/run-eval-v2.mjs
node tests/agent-eval/prepare-layer3.mjs
node tests/agent-eval/run-layer3.mjs
```

## Questions for PM

- Layer 3 是否应把 abnormal Windows exit code 视为 CLI blocker，即使 JSON 主体已经成功产出？
- Layer 2 的单次 `fetch failed` 是否允许按“外部服务抖动”单独重试，还是必须保留原样记入最终 gate？
