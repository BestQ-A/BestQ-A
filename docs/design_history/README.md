# Design History Manifest

This folder contains the immutable history of the Recursive Q&A System design.
We follow an **Append-Only** philosophy: old designs are never overwritten, only superseded by new files.

## Versions

- **[v1_recursive_decomposition.md](./v1_recursive_decomposition.md)** (2026-01-14)

  - _Theme_: Basic Recursive Decomposition & Verification.
  - _Key Concept_: Break down high-level Qs into atomic tasks.

- **[v2_abstraction_classes.md](./v2_abstraction_classes.md)** (2026-01-14)

  - _Theme_: Abstraction & Conditions.
  - _Key Concept_: "Causal" means abstracting common problem classes.

- **[v3_semantic_chain.md](./v3_semantic_chain.md)** (2026-01-14)

  - _Theme_: Semantic Solitaire (Thinking Protocol).
  - _Key Concept_: Raw Requirement -> Abstract Class -> Contextual Retrieval.

- **[v4_composable_knowledge.md](./v4_composable_knowledge.md)** (2026-01-14)

  - _Theme_: Composable Knowledge Engine (The 80/19/1 Rule).
  - _Key Concept_: Atoms (reusable units) vs Composites (orchestrated trees) physical separation.

- **[v5_zettelkasten_dual_mode.md](./v5_zettelkasten_dual_mode.md)** (2026-04-10)

  - _Theme_: Zettelkasten Graph + Dual-Mode Engine (Explore / Compile).
  - _Key Concept_: Atom (fact node) + Ref (relation edge) + Shortcut (myelinated highway). Knowledge = graph structure, not rules.

- **Current Latest**: `v5_zettelkasten_dual_mode.md` (v5: Zettelkasten × Myelination)
  - _Key Concept_: Information (Atom) and how it's referenced (Ref) are two independent kinds of knowledge. Explore generates possibility, Compile solidifies certainty.
  - _Supersedes_: v4 (80/19/1 Rule) — v4's Atoms/Composites map naturally into v5's Atom/Shortcut.

- **[v6_categorical_relations.md](./v6_categorical_relations.md)** (2026-04-10)

  - _Theme_: Categorical Relations Engine (From Graph to Category).
  - _Key Concept_: RefType system with composition laws, PatternTemplate as small categories, Case as structure-preserving functor. Arrows have signatures and algebra; patterns emerge from legal composition.

## Semantic Contract

- **[`../current/metamodel.md`](../current/metamodel.md)** (2026-04-10)
  - _Not a version, but the convergence of v1-v6._
  - _Defines_: ProblemClass, Strategy, Skill, Story/Case, Atom/Ref/Shortcut as five parallel modules.
  - _Establishes_: system invariants, metrics, write permissions, invalidation rules, RefType composition algebra.
