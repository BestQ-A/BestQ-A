---
event: codesail-repo-split
recorded_at: 2026-05-10T00:00:00+08:00
immutable: true
---

# ClearLoop Repo Split

## Decision

The VS Code product is no longer treated as an embedded external directory inside BestQ-A.

It was first split under the prototype name CodeSail, then renamed to ClearLoop:

```text
E:\1_agents_space\9_AGI\ClearLoop
```

Previous location:

```text
E:\1_agents_space\9_AGI\BestQ-A\external\CodeSail
```

## Why

BestQ-A and ClearLoop now have different ownership boundaries.

BestQ-A should remain the reasoning, memory, retrieval, causal-learning, MCP, and CLI core.

ClearLoop should be the user-facing VS Code product:

- extension UI;
- Rust local backend;
- CLI agent orchestration;
- Codex CLI / Claude Code CLI handoff scaffolds;
- install, package, smoke, and Marketplace lifecycle.

Keeping the VS Code product under `external/` made the BestQ-A worktree noisy and blurred product responsibilities.

## Contract Between Projects

The shared product loop is:

```text
task -> explicit plan -> controlled agent run -> captured evidence -> verification -> memory gate
```

The first concrete interchange format is the local handoff directory:

```text
<workspace>/.bestqa/agent-runs/<run>/
  handoff.md
  manifest.json
  README.md
  result.md
```

ClearLoop owns creating and displaying this run scaffold.

BestQ-A owns future reasoning/memory/retrieval semantics that can consume or promote verified run records.

## Immediate Follow-Up

- Keep BestQ-A docs pointing to `../ClearLoop`, not `external/CodeSail`.
- Keep ClearLoop product documentation and VS Code validation inside the ClearLoop repository.
- Define the `.bestqa/agent-runs` schema before adding automatic execution adapters.
- Do not re-embed ClearLoop as a nested repo unless there is a deliberate monorepo decision.
