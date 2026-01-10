from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .types import Event, Fact, Observation, Regulation
from .explainer import ExplainOptions, EffectIndex, explain_observation


@dataclass
class DetectOptions:
    min_score: float = -2.2         # log-space; closer to 0 is better
    max_assumptions: int = 0        # 0 = strict: no missing pres allowed for "explained"
    keep_top_attempts: int = 3
    explain_options: ExplainOptions = field(default_factory=lambda: ExplainOptions(top_k=5, beam_size=20, max_depth=8, max_assumptions=10))


def _now_iso() -> str:
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _new_event_id() -> str:
    return "evt_" + uuid.uuid4().hex[:8]


def _scope_gate(rule: Regulation, obs_context: Dict) -> bool:
    for k, v in (rule.scope or {}).items():
        if obs_context.get(k) != v:
            return False
    return True


def _unexplained_goal_facts(obs: Observation, regulations: List[Regulation]) -> List[Fact]:
    # any goal fact that has no regulation that can produce it (under scope)
    goals = obs.goals()
    idx = EffectIndex(regulations)
    unexplained: List[Fact] = []
    for g in goals:
        cands = [r for r in idx.candidates(g) if _scope_gate(r, obs.context)]
        if not cands:
            unexplained.append(g)
    return unexplained


def process_observation(obs: Observation, regulations: List[Regulation], options: Optional[DetectOptions] = None) -> Tuple[str, Optional[Event]]:
    """Process one observation:
    - try to explain it with existing regulations
    - if explained: update evidence
    - else: create an Event
    """
    options = options or DetectOptions()

    stories = explain_observation(obs, regulations, options.explain_options)
    best = stories[0] if stories else None

    if best and best.score >= options.min_score and len(best.assumptions) <= options.max_assumptions:
        # explained -> update evidence (support / explained_count)
        rid_set = set(best.regulation_ids)
        for r in regulations:
            if r.regulation_id in rid_set:
                r.support_n += 1
                r.explained_count += 1
                r.last_used = obs.timestamp
        return "explained", None

    # create event
    unexplained = _unexplained_goal_facts(obs, regulations)
    attempted = []
    for s in (stories[: options.keep_top_attempts] if stories else []):
        failure_reason = "unknown"
        if s.score < options.min_score:
            failure_reason = "low_score"
        elif s.assumptions:
            # assumptions are "missing pres" in the storyline
            failure_reason = "pre_not_satisfied"
        elif not s.regulation_ids:
            failure_reason = "no_covering_rule"

        regulation_id = s.regulation_ids[0] if s.regulation_ids else "none"
        attempted.append({
            "regulation_id": regulation_id,
            "score": s.score,
            "failure_reason": failure_reason,
            "used_rules": list(s.regulation_ids),
            "missing_pres": [f.to_dict() for f in s.assumptions],
            "assumptions": [f.to_dict() for f in s.assumptions],
            "uncovered_goals": [f.to_dict() for f in unexplained],
            "storyline": list(s.regulation_ids),
        })

    ev = Event(
        event_id=_new_event_id(),
        timestamp=_now_iso(),
        observation=obs,
        attempted_explanations=attempted,
        unexplained_aspects=unexplained if unexplained else obs.goals(),  # if everything has a candidate chain but missing pres, keep goals
        context=dict(obs.context),
        status="open",
    )
    return "event_created", ev
