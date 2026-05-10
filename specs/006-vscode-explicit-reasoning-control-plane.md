# Spec 006: VS Code Explicit Reasoning Control Plane

## Source

`docs/records/2026-05-10-explicit-implicit-reasoning-control-plane.md`.

## Goal

Turn BestQ-A plus the sibling ClearLoop VS Code project into one product loop:

```text
Task -> explicit plan -> controlled agent run -> captured evidence -> verification -> memory gate
```

This spec is about the VS Code / agent-runtime product bridge. It does not change BestQ-A core ontology rules directly.

## Product Principle

Use implicit LLM reasoning for generation and synthesis.

Use explicit BestQ-A objects for control, audit, replay, and memory.

The UI must show structured reasoning state, not hidden chain-of-thought.

## Boundary

```text
bestqa-core:
  semantic identity, evidence, RefAlgebra, memory, retrieval, promotion

agent-runtime:
  start/monitor/cancel Codex CLI, Claude Code CLI, and future agents

VS Code extension:
  human control plane and visual state

external providers:
  implicit reasoning and code generation candidates
```

## Required Data Objects

Minimum runtime objects:

- `TaskRecord`
- `PlanRecord`
- `PlanStep`
- `ActionExecution`
- `AgentProcess`
- `ExecutionArtifact`
- `VerificationResult`
- `MemoryPromotionDecision`

Each code-changing execution must include:

- command;
- cwd;
- provider/model;
- sandbox/permission mode;
- start/end timestamps;
- stdout/stderr or session log path;
- produced diff or explicit no-diff result;
- verification commands and outputs;
- exit/cancel status;
- memory promotion decision.

## Requirements

- Add a single product contract for agent execution records before expanding UI features.
- Make ClearLoop YOLO execution call a real agent runtime, not just `start_execution` metadata.
- Support at least two launch adapters:
  - Codex CLI through `codex exec`;
  - Claude Code through non-interactive print or plugin command mode.
- Capture produced diffs after the run.
- Capture verification command outputs.
- Persist an `ActionExecution`-like record into BestQ-A or a clearly named bridge store.
- Surface the run in VS Code as structured state: planned, running, verifying, failed, succeeded, promoted/skipped.
- Keep hidden model chain-of-thought out of persisted product artifacts.
- Persist only structured summaries, evidence, tool events, diffs, and verification outputs.
- Provide a manual approval gate before promoting a run into long-term memory.

## Non-Goals

- Do not rewrite BestQ-A core.
- Do not expose hidden chain-of-thought.
- Do not build a full symbolic planner before the runtime loop exists.
- Do not claim autonomous self-maintenance until diff capture and verification are real.
- Do not treat Traycer visual parity as sufficient product progress.

## Acceptance Criteria

- [ ] A single local command can start a Codex CLI run for a small fixture task and return an execution record.
- [ ] The execution record contains command, cwd, timestamps, model/provider, exit status, log path, and diff path.
- [ ] A failed verification is recorded as a failed outcome, not as an invisible chat failure.
- [ ] A successful run can be reviewed and either promoted or skipped for memory.
- [ ] VS Code can display the same execution state without inventing a second schema.
- [ ] The Claude adapter can run in dry-run or smoke mode without MCP.
- [ ] Documentation clearly distinguishes implicit model output from explicit BestQ-A state.

## Suggested First Slice

1. Define the execution record schema in docs and one runtime module.
2. Implement Codex CLI adapter first because the sibling `../ClearLoop` project already has a `CodexProvider` and CLI handoff scaffold.
3. Run one fixture task in a temp workspace.
4. Capture `git diff`, stdout/stderr/session log, and verification output.
5. Add VS Code display after the CLI record is stable.

## Output When Complete

`<promise>DONE</promise>`
