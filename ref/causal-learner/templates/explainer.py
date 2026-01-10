from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from .types import Fact, Observation, Regulation, Story
from .unify import Bindings, dedup_facts, fact_entails, substitute_fact, unify_fact


EVI_WEIGHT = {
    "intervention": 1.0,
    "quasi_experiment": 0.8,
    "observational": 0.5,
}

STATUS_WEIGHT = {
    "confirmed": 1.0,
    "hypothesis": 0.85,
    "candidate": 0.65,
    "retired": 0.1,
}


@dataclass
class ExplainOptions:
    top_k: int = 5
    beam_size: int = 20
    max_depth: int = 8
    max_assumptions: int = 10

    # penalties (in log space)
    assumption_penalty: float = 1.2
    length_penalty: float = 0.05


def context_to_facts(context: Dict[str, Any]) -> List[Fact]:
    return [Fact(pred=str(k), args={}, value=v) for k, v in (context or {}).items()]


def scope_compatible(rule: Regulation, obs_context: Dict[str, Any]) -> bool:
    # simplest: all scope key-values must match
    for k, v in (rule.scope or {}).items():
        if obs_context.get(k) != v:
            return False
    return True


def rep_weight(support_n: int, counterexample_n: int) -> float:
    base = 1.0 - math.exp(-max(0, support_n) / 5.0)  # 0..1
    base = max(0.05, base)
    penalty = math.exp(-max(0, counterexample_n))
    return max(0.05, base * penalty)


def spec_weight(rule: Regulation) -> float:
    size = len(rule.pre) + len(rule.eff)
    return min(1.0, 0.4 + 0.05 * size)


def rule_score(rule: Regulation) -> float:
    w_evi = EVI_WEIGHT.get(rule.evidence_kind, 0.5)
    w_rep = rep_weight(rule.support_n, rule.counterexample_n)
    w_spec = spec_weight(rule)
    w_stat = STATUS_WEIGHT.get(rule.status, 0.8)
    score = w_evi * w_rep * w_spec * w_stat
    return max(0.01, min(1.0, score))


class EffectIndex:
    """Index from (pred, value) -> regulations that can produce it."""
    def __init__(self, regulations: List[Regulation]):
        self._idx: Dict[Tuple[str, Any], List[Regulation]] = {}
        for r in regulations:
            for eff in r.eff:
                key = (eff.pred, eff.value)
                self._idx.setdefault(key, []).append(r)

    def candidates(self, goal: Fact) -> List[Regulation]:
        return list(self._idx.get((goal.pred, goal.value), []))


@dataclass
class _Node:
    goals: List[Fact]
    regulation_ids: List[str]
    assumptions: List[Fact]
    bindings: Bindings
    score_log: float
    used: set


def _choose_goal(goals: List[Fact], known: List[Fact], bindings: Bindings, idx: EffectIndex, obs_context: Dict[str, Any]) -> int:
    """Pick the next goal index to expand: prefer goals with fewer candidate rules.

    Note: We do NOT allow a goal to be satisfied directly just because it is observed.
    Only preconditions (subgoals) are allowed to be satisfied by known facts.
    """
    best_i = 0
    best_count = 10**9
    for i, g in enumerate(goals):
        cands = [r for r in idx.candidates(g) if scope_compatible(r, obs_context)]
        count = len(cands)
        if count < best_count:
            best_count = count
            best_i = i
    return best_i


def explain_observation(obs: Observation, regulations: List[Regulation], options: Optional[ExplainOptions] = None) -> List[Story]:
    """Explain observation goals by chaining regulations backward.

    Design note:
    - obs.goals() are facts you want to *explain* (even though they are observed).
    - known facts are used only to satisfy *preconditions* during chaining.
    """
    options = options or ExplainOptions()
    goals = dedup_facts(obs.goals())

    known = dedup_facts(list(obs.facts) + context_to_facts(obs.context))
    idx = EffectIndex(regulations)

    init = _Node(
        goals=list(goals),
        regulation_ids=[],
        assumptions=[],
        bindings={},
        score_log=0.0,
        used=set(),
    )

    beam: List[_Node] = [init]
    completed: List[_Node] = []

    for depth in range(options.max_depth):
        new_beam: List[_Node] = []

        for node in beam:
            if not node.goals:
                completed.append(node)
                continue

            gi = _choose_goal(node.goals, known, node.bindings, idx, obs.context)
            g = node.goals[gi]
            rest = node.goals[:gi] + node.goals[gi+1:]

            # try expand with candidate regulations
            expanded = False
            for r in idx.candidates(g):
                if r.regulation_id in node.used:
                    continue
                if not scope_compatible(r, obs.context):
                    continue

                # unify any effect with the goal
                for eff in r.eff:
                    b2 = unify_fact(eff, g, node.bindings)
                    if b2 is None:
                        continue
                    expanded = True

                    # add preconditions as new goals, but allow them to be satisfied by known facts immediately
                    new_goals: List[Fact] = []
                    for p in r.pre:
                        p2 = substitute_fact(p, b2)
                        b_known = fact_entails(known, p2, b2)
                        if b_known is not None:
                            b2 = b_known
                            continue
                        new_goals.append(p2)

                    merged = dedup_facts(new_goals + rest)

                    rs = rule_score(r)
                    child_score = node.score_log + math.log(rs) - options.length_penalty

                    new_beam.append(_Node(
                        goals=merged,
                        regulation_ids=node.regulation_ids + [r.regulation_id],
                        assumptions=list(node.assumptions),
                        bindings=b2,
                        score_log=child_score,
                        used=set(node.used) | {r.regulation_id},
                    ))

            if expanded:
                continue

            # no rule can produce this goal: treat as assumption (abduction)
            if len(node.assumptions) < options.max_assumptions:
                new_beam.append(_Node(
                    goals=list(rest),
                    regulation_ids=list(node.regulation_ids),
                    assumptions=node.assumptions + [g],
                    bindings=dict(node.bindings),
                    score_log=node.score_log - options.assumption_penalty,
                    used=set(node.used),
                ))

        # prune beam
        new_beam.sort(key=lambda n: n.score_log, reverse=True)  # higher is better
        beam = new_beam[: options.beam_size]

    # convert completed nodes to stories
    stories: List[Story] = []
    for n in completed:
        stories.append(Story(
            regulation_ids=list(n.regulation_ids),
            assumptions=list(n.assumptions),
            score=float(n.score_log) / max(1, len(n.regulation_ids)),
        ))

    # sort and return top_k
    stories.sort(key=lambda s: s.score, reverse=True)
    return stories[: options.top_k]
