---
kind: record
event: "2026-04-15 v13 project review kilo addendum"
recorded_at: 2026-04-15
immutable: true
---

# Kilo Audit Addendum

Scope: skeptical re-audit of `review-2026-04-15-v13-project-review.md` against the current workspace state.

Verification run in this turn:

- `npm run build` in `causal-learner/mcp-server` completed successfully (`tsc`).
- `npm test` in `causal-learner/mcp-server` completed successfully with `231` passing tests and `0` failures.
- The passing test run still emitted repeated `recordFix.constitutionalAudit best-effort` warnings, including failed mandatory constraints (`CC_has_premises`, `CC_has_conclusion`).

## FAILURES

- The prior review overstated `HIGH 3`. `FailureBoundaryArchive` and `CounterexampleCommons` are not absent from current reality. Evidence exists in current docs and code:
  - `docs/current/testing-roadmap-v7-to-v11.md:21` explicitly says v11 has partially absorbed objects and passing tests.
  - `causal-learner/mcp-server/src/core/pipeline.ts:1042-1075` writes `FailureBoundaryArchive` records during `recordFix`.
  - `causal-learner/mcp-server/src/core/failure-boundary-archive-store.ts:23-72` and `causal-learner/mcp-server/src/core/counterexample-commons.ts:42-156` implement the objects.
  - The correct claim is narrower: these assets exist, but they are not the operating center and are not yet closed into full v13 lineage governance.

- “HIGH 4 fixed” and “MEDIUM 6/7 fixed” appear in code comments, but those labels are not proof. They only show that new files were added:
  - `causal-learner/mcp-server/src/core/pipeline.ts:921`
  - `causal-learner/mcp-server/src/core/pipeline.ts:937`
  The implementation still needs contract alignment and dedicated verification.

## SKIPPED STEPS

- No `.kilocode/**/*.md` rules were available to inspect. The workspace contains `.kilo/plans/1776263856507-mighty-otter.md`, but `rg --files .kilocode` returned no files. Any claim that `.kilocode` instructions were followed would be uncheckable.

- No direct tests were found for the new governance persistence surfaces:
  - `rg -n "reconstruction-store|branch-point|BranchPoint|FutureBranch|reconstructions|branchPoints" causal-learner/mcp-server/src/tests` returned no matches.
  This means the new `ReconstructionStore`, `BranchPoint`, and `BranchPointStore` paths are only indirectly covered, if at all.

- No current contract was found for `BranchPoint` / `FutureBranch` / `ReconstructionStore` in `docs/current`.
  - `rg -n "branch-point|BranchPoint|FutureBranch|reconstruction-store|ReconstructionStore" docs/current` returned no matches.
  The new code is wired directly against design-history text, not a current contract surface.

## UNVERIFIED CLAIMS

- Before this addendum, any statement such as “tests pass” or “the fix is done” was unverified in this turn. The review relied on repository documents, not fresh command output.

- Passing tests do not prove constitutional enforcement. The current test run passed while still printing multiple warnings like:
  - `recordFix.constitutionalAudit best-effort failure`
  - failed mandatory constraints `CC_has_premises`
  - failed mandatory constraints `CC_has_conclusion`
  This means “the suite is green” is not enough to claim governance correctness.

## INCOMPLETE WORK

- Mandatory constitutional audit failures do not block `recordFix`.
  - `docs/current/v11-world-model-contract.md:60-85` defines mandatory constitutional constraints as required.
  - `causal-learner/mcp-server/src/core/pipeline.ts:923-934` audits the trace, but when `mandatoryPassed` is false it only calls `warnBestEffortFailure(...)` and continues.
  - This is a real semantic gap: mandatory constraints are treated as advisory warnings in the main pipeline path.

- The new branch-governance objects are reduced surrogates, not faithful v13 implementations.
  - v13 design requires:
    - `BranchPoint { lineageId, locationDescription, controllableFactors, uncontrollableFactors, historicalSensitivity }`
    - `FutureBranch { interventionIds, predictedTrajectory, predictedOutcomes, riskProfile[], informationGainEstimate? }`
    - Source: `docs/design_history/v13_historical_generative_ontology.md:394-414`
  - Current implementation provides:
    - `BranchPoint { episodeId, candidateCount, chosenBranchId, ... }`
    - `FutureBranch { pathAtomIds, predictedOutcome, riskProfile: string, score, status, pruneReason }`
    - Source: `causal-learner/mcp-server/src/core/branch-point.ts:17-92`
  - This is a simplified approximation. It does not yet carry lineage identity, historical sensitivity, intervention identity, predicted trajectory structure, or information-gain semantics.

- v13 compile-governance closure is still incomplete even after the new files landed.
  - No `LineageCompileProposal`, `HistoricalCompressionRecord`, `LineageConvergenceRecord`, or `PresentSlice` implementation exists in current code or current contracts.
  - `rg -n "LineageCompileProposal|HistoricalCompressionRecord|LineageConvergenceRecord|PresentSlice" docs/current causal-learner/mcp-server/src` returned no matches.

## VIOLATIONS

- Under the requested Kilo rule set, the English-only documentation/comments rule is currently violated by multiple active files:
  - `docs/review/review-2026-04-15-v13-project-review.md`
  - `docs/current/testing-roadmap-v7-to-v11.md:6-21`
  - `.kilo/plans/1776263856507-mighty-otter.md:1-10`
  - `causal-learner/mcp-server/src/core/pipeline.ts:360-368` and many later inline comments

- Under the same rule set, the codebase still uses in-memory defaults (`:memory:`) throughout pipeline storage configuration:
  - `causal-learner/mcp-server/src/core/pipeline.ts:376-405`
  This is not automatically wrong for tests, but it means no one should claim “absolutely no in-memory patterns” are currently enforced in the implementation.

## Bottom Line

- Show-me-the-logs verdict: build and tests were actually run in this turn, and both succeeded.
- Show-me-the-semantics verdict: governance is not “done”. The suite is green while mandatory constitutional failures are tolerated, branch governance is a reduced surrogate, and the current-contract layer still lags behind the code.
- This addendum supersedes the prior review wherever that review claimed v11 failure-memory objects were absent rather than partially absorbed.
