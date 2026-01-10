from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

from .types import Event, Fact, Regulation
from .unify import signature_full


@dataclass
class ValidateOptions:
    min_pre_support_ratio: float = 0.8
    require_nonempty_pre: bool = True
    require_nonempty_eff: bool = True


def _fact_set(facts: List[Fact]) -> set:
    return set(signature_full(f) for f in facts)


def _pre_satisfied_in_event(reg: Regulation, evt: Event) -> bool:
    # naive satisfaction: all pre facts must be present in observation facts or context-as-facts
    fact_sigs = _fact_set(evt.observation.facts + [Fact(pred=k, args={}, value=v) for k, v in (evt.context or {}).items()])
    for p in reg.pre:
        if signature_full(p) not in fact_sigs:
            return False
    return True


def _eff_is_targeted(reg: Regulation, evt: Event) -> bool:
    ua = _fact_set(evt.unexplained_aspects)
    # at least one effect in unexplained aspects
    return any(signature_full(e) in ua for e in reg.eff)


def _is_duplicate(reg: Regulation, existing: Regulation) -> bool:
    return _fact_set(reg.pre) == _fact_set(existing.pre) and _fact_set(reg.eff) == _fact_set(existing.eff)


def validate_regulation(candidate: Regulation, cluster: List[Event], existing: List[Regulation], options: ValidateOptions = ValidateOptions()) -> Tuple[bool, List[str]]:
    reasons: List[str] = []

    if options.require_nonempty_eff and not candidate.eff:
        reasons.append("empty_eff")
    if options.require_nonempty_pre and not candidate.pre:
        reasons.append("empty_pre")

    for r in existing:
        if _is_duplicate(candidate, r):
            reasons.append(f"duplicate_of:{r.regulation_id}")
            break

    if cluster:
        # pre support ratio
        sat = sum(1 for e in cluster if _pre_satisfied_in_event(candidate, e))
        ratio = sat / max(1, len(cluster))
        if ratio < options.min_pre_support_ratio:
            reasons.append(f"pre_support_ratio_too_low:{ratio:.2f}")

        # ensure effect relates to cluster
        if not all(_eff_is_targeted(candidate, e) for e in cluster):
            reasons.append("eff_not_in_all_events_unexplained_aspects")

    ok = len(reasons) == 0
    return ok, reasons
