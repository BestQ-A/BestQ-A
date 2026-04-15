# Current Boundary Map

This map is append-only and interpretive.
It does not rewrite older design-history files. It states how each design layer currently converges, if at all, into `docs/current`.

| Design history node | Present design role | Main `docs/current` anchors | Contract status | Implementation reality defensible from docs |
|---|---|---|---|---|
| v1 `recursive_decomposition` | decomposition lineage | `metamodel.md`, `pipeline-contract.md` | `current` | Present implicitly through `Strategy`, `Skill`, and pipeline sequencing; not treated as a separate current object family |
| v2 `abstraction_classes` | problem typing lineage | `metamodel.md` | `current` | Present through `ProblemClass` as an explicit routing object |
| v3 `semantic_chain` | understanding protocol lineage | `metamodel.md` | `current` | Present through `Strategy` and classify/contextualize/constrain/retrieve flow |
| v4 `composable_knowledge` | execution and composition lineage | `metamodel.md`, `pipeline-contract.md` | `current` | Present in `Skill` plus graph-centered compile flow, but no longer as the top architectural center |
| v5 `zettelkasten_dual_mode` | graph truth layer lineage | `metamodel.md`, `architecture-overview.md`, `memory-layer-contract.md` | `current` | Strongly present: `Atom / Ref / Shortcut`, dual-mode write/read split, evidence-linked graph model |
| v6 `categorical_relations` | lawful kernel | `ref-algebra-contract.md`, `hypothesis-contract.md`, `compile-promotion-contract.md`, `v6-world-model-contract.md` | mixed: core contracts `current`, world-model wrapper `draft` | Operational hard core. Relation law, promotion gates, and proof-carrying hypothesis semantics are current; the older v6 world-model wrapper is now mostly superseded by metamodel + v7 framing |
| v7 `world_model_dynamics` | implemented backbone | `v7-world-model-contract.md`, `reconstruction-contract.md`, `ontology-delta-contract.md`, `episode-event-contract.md`, `support-link-contract.md`, `action-execution-contract.md`, `outcome-record-contract.md` | mixed: `action-execution` `current`; most backbone contracts still `draft` | Mainline judged operational by `testing-roadmap-v7-to-v11.md` and `v7-world-model-contract.md`; reconstruction, ontology-delta, mechanism-instance bridge, and minimal action loop are described as materially closed, while full timeline objects (`StateSnapshot`, `Transition`) and deeper audit hardening remain incomplete |
| v8 `generative_ontology` | selective absorption frontier | `observation-model-contract.md`, `mechanism-program-contract.md`, `counterfactual-scenario-contract.md`, `experiment-design-contract.md`, `action-execution-contract.md`, `outcome-record-contract.md` | mixed: `observation-model` and `action-execution` `current`; others `draft` | Selectively absorbed. Observation projection is current. Minimal execution bridge is current. Mechanism programs, counterfactuals, experiment design, and structured outcomes are staged as draft objects. Roadmap still says v8 is placeholder-heavy overall |
| v9 `ontology_federation` | horizon layer | `testing-roadmap-v7-to-v11.md` | deferred | No current contract family governing federation as an implemented layer; roadmap states zero-code implementation |
| v10 `participatory_reflexive_world_engine` | horizon layer | `testing-roadmap-v7-to-v11.md`, `observation-model-contract.md` | deferred | 局部代码吸收已发生（`ObserverModel` 类型定义、`observer_models` 存储表、`filterObservations` 测试、`observerModelRef`/`instrumentModelRef` 字段），但 observer/instrument/deployment/institutional compile 未成为 operating center；仍属 horizon layer |
| v11 `reflexive_civilization_engine` | horizon layer | `testing-roadmap-v7-to-v11.md` | deferred | Failure-boundary archive, counterexample commons, proof-lineage civilization memory, and constitutional layer remain horizon only; roadmap states zero-code implementation |
| v12 `convergence_to_current_boundary` | present interpretive bridge | `metamodel.md`, `v7-world-model-contract.md`, `testing-roadmap-v7-to-v11.md`, `observation-model-contract.md`, `action-execution-contract.md` | current-boundary note | States the least misleading present reading: v6 lawful kernel + metamodel semantic base + v7 implemented backbone + selective v8 absorption; v9-v11 remain horizon commitments |
| v12a `objectization_of_v7` | explicit bridge for v7 decomposition into current object contracts | `v7-world-model-contract.md`, `reconstruction-contract.md`, `ontology-delta-contract.md`, `episode-event-contract.md`, `support-link-contract.md`, `action-execution-contract.md`, `outcome-record-contract.md` | current-boundary note | Makes the v7-to-current transition legible as an objectization step: coarse episode and proof semantics are split into auditable first-class objects, with some bridges already current and others still draft but structurally explicit |
| v12b `selective_v8_absorption` | explicit bridge for partial v8 convergence | `observation-model-contract.md`, `mechanism-program-contract.md`, `counterfactual-scenario-contract.md`, `experiment-design-contract.md`, `action-execution-contract.md`, `outcome-record-contract.md`, `testing-roadmap-v7-to-v11.md` | current-boundary note | States that current reality absorbs the v8 subset that can enter execution, audit, and future calibration loops, while keeping full predictive/interventional engine claims deferred |
| v12c `deferred_layers_v9_to_v11` | explicit bridge for horizon deferral discipline | `testing-roadmap-v7-to-v11.md` | current-boundary note | Makes the deferral boundary explicit: v9-v11 are retained as horizon layers with entry conditions, not erased from design history and not promoted into present capability claims |

## Boundary Summary

| Boundary slice | Status |
|---|---|
| lawful relation kernel | current |
| semantic base | current |
| v7 backbone | current in operational center, but still partly draft in specialized contracts |
| v8 generative stack | partial, selectively absorbed |
| v9-v11 layers | deferred as implementation commitments |

## Caution Notes

- `reconstruction-contract.md` and `ontology-delta-contract.md` remain `draft`, even though `v7-world-model-contract.md` describes their mainline gaps as closed. The safest reading is: operationally present, schema-hardening still in progress.
- `support-link-contract.md` remains `draft`, even though the `ObservationRecord -> ObservationModel` trace chain is described as already working.
- `ActionExecution` is `current`, but `OutcomeRecord`, `PredictionError`, and the deeper v8 calibration loop are not yet current.
