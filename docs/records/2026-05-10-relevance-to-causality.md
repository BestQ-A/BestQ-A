---
event: relevance-to-causality-product-definition
recorded_at: 2026-05-10T00:00:00+08:00
immutable: true
---

# Relevance to Causality

## Definition

BestQ-A and ClearLoop use this product definition:

```text
causality = structured, reusable relevance
```

In Chinese:

```text
因果性，是被结构化后可复用的相关性。
```

AI is strong at producing relevance. It can connect symptoms, files, commands, APIs, prior cases, and plausible fixes. But relevance alone is not yet an engineering object. It is hard to inspect, control, verify, or reuse.

Causality is the next layer: relevance made concrete, clear, structured, evidence-bearing, and stable enough to be reused.

## Homomorphism Claim

The structure is not decoration. It is an attempted homomorphism from real correlations in the world into software objects:

```text
real-world correlation
  -> observed evidence
  -> causal hypothesis
  -> action
  -> outcome
  -> verification
  -> reusable memory
```

The better this mapping is, the more reliably the system can improve itself.

## Product Split

BestQ-A owns the reasoning, memory, retrieval, causal-learning, MCP, and CLI semantics.

ClearLoop owns the human-facing VS Code control plane:

- make AI relevance visible;
- organize it into explicit causal work records;
- run Codex CLI / Claude Code CLI through auditable handoffs;
- capture evidence, outputs, diffs, logs, and verification;
- promote only verified lessons into reusable memory.

The product goal is not to expose hidden model chain-of-thought. The goal is to combine implicit model intelligence with explicit causal state so humans can control, correct, and steadily improve the system.
