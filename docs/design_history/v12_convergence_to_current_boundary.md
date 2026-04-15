# Recursive Q&A System Design v12: Convergence To The Current Capability Boundary

## 1. Position

v12 is not a replacement for v11.

It is the append-only convergence note that states, with narrower discipline, which parts of the design line have already hardened into current contracts, which parts are being selectively absorbed, and which parts remain horizon architecture.

Its task is not to lower the ambition of v8-v11.
Its task is to prevent the repository from speaking as if the far horizon were already the present operating center.

---

## 2. Core Thesis

The system's durable asset is not the answer text.

The durable asset is an **evidence-carrying world model**:

- relations must be lawful before they are trusted
- semantic roles must be explicit before they are reused
- observations must remain distinguishable from claims
- accepted reconstructions must remain replayable
- ontology updates must remain auditable
- uncertainty, contradiction, and scope must remain preserved rather than flattened away

Therefore the primary product is not "a good answer" but a structured, evidence-linked, scope-bounded model of what was observed, what was inferred, what was rejected, and what can legally be promoted.

Answers remain necessary, but they are downstream renderings of that asset rather than the asset itself.

---

## 3. Why The Stack Converges As v6 + Metamodel + v7

### 3.1 v6 is the lawful kernel

The repository's hard floor is still v6's relation law.

v6 established the non-negotiable rule that relation composition is governed, not improvised:

- typed relation families
- legal, candidate-only, and forbidden compositions
- separation of evidential from explanatory force
- proof-carrying derivation rather than free-floating path rhetoric

Without that kernel, every higher layer becomes eloquent but unsafe.

### 3.2 The metamodel is the semantic base

`docs/current/metamodel.md` is the present semantic base because it defines the system's active module boundaries and invariants:

- `ProblemClass`
- `Strategy`
- `Skill`
- `Story`
- `Atom / Ref / Shortcut`
- `Evidence`
- `ContextScope`

This is where the repository currently says, in contract form, what the core objects are and how they may interact.

### 3.3 v7 is the implemented backbone

The current operational center is no longer "v11 as if already implemented".
The operational backbone is better described as:

```text
v6 lawful kernel
  + metamodel semantic base
  + v7 backbone, partially but materially implemented
```

That judgment is supported by current contracts and roadmap language:

- `v7-world-model-contract.md` states that the mainline v7 chain is running
- `testing-roadmap-v7-to-v11.md` marks v7 as the only post-v6 layer whose main chain is already operational
- the same documents still mark v8 as placeholder-heavy, and v9-v11 as zero-code horizon layers

So the present system is not "pre-v7" and not honestly "at v11".
It is a v7-centered system with selected v8 absorptions.

---

## 4. Which v8 Pieces Are Being Selectively Absorbed Now

v8 as a whole is not the present implementation commitment.
But several of its distinctions are being absorbed because they raise rigor without requiring the full generative stack.

### 4.1 Observation projection is already being absorbed

`docs/current/observation-model-contract.md` is `current`.

This imports a real v8 distinction into the active system:

- world state is not identical to observation
- an `ObservationRecord` should be tied to an `ObservationModel`
- support can be traced through observation projection rather than treating observations as raw truth

This is a concrete present-tense absorption of v8's "observation is projection" thesis.

### 4.2 The action loop is being absorbed at a minimal bridge level

`docs/current/action-execution-contract.md` is `current`, and `v7-world-model-contract.md` records that at least one minimal `ExperimentDesign -> ActionExecution -> new Episode` loop has run.

This means the repository is already absorbing the execution-side edge of v8's experiment loop, but only in a narrow bridge form.

### 4.3 The planning and simulation objects are being staged, not yet committed

`MechanismProgram`, `CounterfactualScenario`, `ExperimentDesign`, and `OutcomeRecord` all exist as explicit current-doc contracts, but they are still `draft`.

That is significant.

It means the repository has decided these are the next absorbable objects, but has not yet declared the full generative layer operational.

### 4.4 What is not yet absorbed

The following remain beyond the current boundary:

- full mechanism-program-driven replay as the default reconstruction engine
- genuine counterfactual trajectory generation as routine system behavior
- real information-gain-based experiment selection
- prediction-error-driven calibration as a normal governance path
- a complete latent-state belief layer

Those are still v8 horizon commitments, even where contract shells now exist.

---

## 5. Why v9-v11 Remain Horizon Layers

The reason is not conceptual weakness.
It is contract and implementation honesty.

### 5.1 v9 remains horizon

`testing-roadmap-v7-to-v11.md` states v9 is zero-code implementation.

So ontology federation, translation functors, conflict preservation, and constitutional multi-ontology coordination remain design intent, not current system center.

### 5.2 v10 remains horizon

The same roadmap marks v10 as zero-code implementation.

Observer models, instrument models, deployment-shift modeling, and institutional compile as a live operating layer are therefore not current commitments, even if some precursor ideas have entered lighter contracts.

### 5.3 v11 remains horizon

The roadmap also marks v11 as zero-code implementation.

Failure-boundary archives, counterexample commons, proof-lineage as civilization memory, and constitutional red-team governance still define the architectural horizon, not the current repository boundary.

### 5.4 Horizon status does not mean irrelevance

These layers still matter because they shape selection pressure on present contracts.

They are horizon laws for direction.
They are not yet safe labels for present capability claims.

---

## 6. The Current Capability Boundary

The present boundary can be stated concretely.

### 6.1 What is current and defensible

The repository currently supports, at contract level and with at least partial implementation backing:

- a current semantic base in `metamodel.md`
- a current orchestration spine in `pipeline-contract.md`
- a current relation-law core in `ref-algebra-contract.md`, `hypothesis-contract.md`, and `compile-promotion-contract.md`
- evidence-carrying observation flow with `ObservationModel` as a current contract
- a minimally closed action bridge with `ActionExecution` as a current contract
- a v7-centered world-model loop in which observation, hypothesis, compile, reconstruction, and ontology-delta outputs are treated as first-class operating targets

### 6.2 What is materially present but not fully hardened

The current boundary also includes several features that are real enough to be named, but not fully stable enough to be called complete:

- `AcceptedReconstruction` is treated in `v7-world-model-contract.md` as a closed mainline gap, while `reconstruction-contract.md` still describes a stricter target schema and remains draft
- `OntologyDelta` is treated in `v7-world-model-contract.md` as a required output for completed episodes, while `ontology-delta-contract.md` remains draft and still records schema convergence work
- `SupportLink` has a functioning base chain through `ObservationRecord -> ObservationModel`, but its dedicated contract remains draft and explicitly calls out missing persistence and deeper audit
- `EpisodeEvent` exists as the current lightweight timeline substitute, while full `StateSnapshot` and `Transition` are still absent

So the system has crossed into v7 backbone territory, but not all v7 target objects are equally mature.

### 6.3 What is outside the present boundary

The current repository does not yet justify claiming:

- full v8 generative simulation as standard operation
- v9 ontology federation
- v10 participatory observer-instrument-deployment governance
- v11 civilization-memory infrastructure

Those remain explicit future layers.

---

## 7. Practical Reading Rule

When reading the repository now, the least misleading interpretation is:

```text
historical ascent:
  v1 -> v11

current convergence:
  v6 lawful kernel
  + metamodel semantic base
  + v7 implemented backbone
  + selected v8 absorptions

horizon beyond boundary:
  most of v8
  all of v9-v11 as implementation commitments
```

This preserves append-only design history while restoring a precise present-tense center of gravity.

---

## 8. Final Judgement

v12's judgment is simple:

- the asset is evidence-carrying world modeling, not answer text
- v6 remains the lawful kernel
- the metamodel remains the semantic base
- v7 is the implemented backbone
- v8 is being selectively absorbed, not wholesale declared complete
- v9-v11 remain horizon architecture

That is the current-era capability boundary the repository can defend without collapsing ambition into overclaim.
