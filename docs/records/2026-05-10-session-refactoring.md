---
event: session-refactoring-product-definition
recorded_at: 2026-05-10T00:00:00+08:00
immutable: true
---

# Session Refactoring

## Definition

A completed AI or CLI session is raw material. It is comparable to a large source file that solved one goal but still mixes together problem definition, exploration, false starts, useful commands, evidence, implementation, tests, and final conclusions.

BestQ-A should not treat that raw session as the reusable unit. It should refactor the session into smaller, named, evidence-backed assets:

```text
raw AI/CLI session
  -> BestQuestion
  -> BestAnswer
  -> ContextFilter
  -> PlanPattern
  -> EvidencePath
  -> VerificationRecipe
  -> CausalPattern
```

In Chinese:

```text
Session Refactoring = 把一次不可复用的 AI/CLI 工作过程，重构成可复用的问题、答案、计划、证据、验收方法和因果模式。
```

## Code Analogy

```text
large code file
  -> functions
  -> modules
  -> interfaces
  -> tests
  -> reusable library

AI/CLI session
  -> questions
  -> answers
  -> context filters
  -> plans
  -> evidence
  -> verification recipes
  -> causal patterns
  -> reusable memory
```

This analogy matters because a transcript is not yet knowledge. A transcript is a trace. Knowledge begins when the trace is split into reusable, testable, named parts.

## Product Split

ClearLoop captures and controls the work session:

- user intent;
- handoff;
- plan;
- agent execution;
- commands;
- diffs;
- logs;
- verification;
- final result.

BestQ-A distills the verified run into reusable knowledge:

- best way to ask the recurring problem;
- best answer under known context;
- which evidence matters;
- which verification proves the fix;
- which causal pattern can be reused.

## Best Question And Answer

The target reusable object is not a chat message. It is closer to:

```text
BestQuestion:
In <context>, how should we diagnose <problem shape>?

BestAnswer:
Inspect <evidence path>. If <signal> appears, prefer <strategy>.
Verify with <verification recipe>. Do not reuse when <exception> holds.
```

This makes the name BestQ-A sharper: it is a system for deriving best questions and best answers from real verified work, not a generic Q&A notebook.

## Memory Gate

A session-derived asset can be promoted only if:

- it has a clear problem shape;
- the reusable context is explicit;
- evidence is linked back to the original run;
- verification passed or residual risk was accepted by a human;
- exceptions and failure cases are recorded.

Otherwise it should remain local run evidence, not reusable memory.

## Strategic Meaning

This is the bridge between the two repositories:

```text
ClearLoop = capture, control, and verify AI work
BestQ-A   = refactor verified work into reusable questions, answers, and causal memory
```

The goal is stable improvement. Each completed run should make the next similar run easier to frame, cheaper to execute, and safer to trust.
