---
kind: instance
conforms_to: docs/current/run-summary-contract.md
generated_by: scripts/capture-baseline.mjs
generated_at: 2026-04-13
---

# Coverage Matrix

> 扫描 `causal-learner/mcp-server/src/core/*.ts`，检查 tests/ 目录下是否有文本引用。
> 这是极粗的"提及即覆盖"近似，不等价于行覆盖率。

| source | referenced by tests | hits |
|--------|--------------------|------|
| atom-graph.ts | yes | test-v6-algebra.mjs |
| detector.ts | no | - |
| dual-storage.ts | no | - |
| evidence.ts | yes | test-new-modules.mjs, test-v6-algebra.mjs |
| explainer.ts | no | - |
| fuzzy-matcher.ts | yes | test-new-modules.mjs |
| hypothesis.ts | no | - |
| index.ts | no | - |
| inducer.ts | yes | test-debug.mjs |
| keywords.ts | yes | test-new-modules.mjs |
| knowledge-cluster.ts | yes | test-new-modules.mjs |
| monte-carlo-sampler.ts | yes | test-new-modules.mjs |
| pattern-template.ts | yes | test-v6-algebra.mjs |
| pipeline.ts | no | - |
| problem-class.ts | yes | test-v6-algebra.mjs |
| react-search.ts | yes | test-new-modules.mjs |
| ref-algebra.ts | yes | test-v6-algebra.mjs |
| regulation-view.ts | yes | test-v6-algebra.mjs |
| skill.ts | yes | test-v6-algebra.mjs |
| storage.ts | yes | test-basic.mjs, test-debug.mjs, test-new-modules.mjs, test-with-viz.mjs |
| story.ts | yes | test-new-modules.mjs, test-v6-algebra.mjs |
| types.ts | no | - |
| unify.ts | no | - |
| validator.ts | no | - |
