from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from .types import Event, Fact, Regulation
from .unify import dedup_facts, signature_full


@dataclass
class InduceOptions:
    min_events: int = 3
    context_keys: Tuple[str, ...] = ("env.os", "gpu.model", "driver.version", "device.kind")
    missing_pre_min_support: float = 0.6
    fact_min_support: float = 0.8
    max_pre_facts: int = 8
    max_eff_facts: int = 3


def _now_iso() -> str:
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _new_reg_id() -> str:
    return "reg_" + uuid.uuid4().hex[:8]


def _cluster_key(evt: Event, context_keys: Tuple[str, ...]) -> Tuple:
    # cluster primarily by unexplained_aspects signature (pred=value)
    ua = tuple(sorted([f"{f.pred}={f.value}" for f in evt.unexplained_aspects]))
    ctx = []
    for k in context_keys:
        if k in (evt.context or {}):
            ctx.append((k, evt.context.get(k)))
    return (ua, tuple(ctx))


def cluster_events(events: List[Event], options: InduceOptions) -> List[List[Event]]:
    buckets: Dict[Tuple, List[Event]] = {}
    for e in events:
        key = _cluster_key(e, options.context_keys)
        buckets.setdefault(key, []).append(e)
    # keep only meaningful clusters
    clusters = [v for v in buckets.values() if len(v) >= options.min_events]
    return clusters


def _facts_from_missing_pres(evt: Event) -> List[Fact]:
    if not evt.attempted_explanations:
        return []
    top = evt.attempted_explanations[0]
    missing = top.get("missing_pres") or []
    out: List[Fact] = []
    for d in missing:
        try:
            out.append(Fact.from_dict(d))
        except Exception:
            continue
    return out


def _facts_from_context(events: List[Event], context_keys: Tuple[str, ...]) -> List[Fact]:
    out: List[Fact] = []
    for k in context_keys:
        vals = [e.context.get(k) for e in events if k in e.context]
        if not vals:
            continue
        if all(v == vals[0] for v in vals):
            out.append(Fact(pred=k, args={}, value=vals[0]))
    return out


def _most_common_facts(facts_by_event: List[List[Fact]], min_support: float) -> List[Fact]:
    counts: Dict[Tuple, int] = {}
    n = len(facts_by_event)
    for facts in facts_by_event:
        seen = set()
        for f in facts:
            sig = signature_full(f)
            if sig in seen:
                continue
            seen.add(sig)
            counts[sig] = counts.get(sig, 0) + 1
    out: List[Fact] = []
    for sig, c in counts.items():
        if c / max(1, n) >= min_support:
            pred, args_items, value = sig
            args = dict(args_items)
            out.append(Fact(pred=pred, args=args, value=value))
    # deterministic ordering
    out.sort(key=lambda f: (f.pred, str(f.args), str(f.value)))
    return out


def induce_regulation(cluster: List[Event], options: InduceOptions) -> Regulation:
    """Induce a candidate regulation from a cluster of similar events (MVP heuristic)."""
    # Effect: common unexplained aspects
    ua_lists = [e.unexplained_aspects for e in cluster]
    eff = _most_common_facts(ua_lists, min_support=1.0)  # strict intersection
    if not eff:
        eff = _most_common_facts(ua_lists, min_support=options.missing_pre_min_support)[: options.max_eff_facts]
    eff = eff[: options.max_eff_facts]

    # Preconditions: (1) common context, (2) frequent missing preconditions from attempted explanations, (3) frequent observed facts
    pre: List[Fact] = []
    pre.extend(_facts_from_context(cluster, options.context_keys))

    missing_pres_lists = [_facts_from_missing_pres(e) for e in cluster]
    pre.extend(_most_common_facts(missing_pres_lists, min_support=options.missing_pre_min_support))

    # Prefer 'support facts' over goal facts: exclude observation.focus_facts (if provided)
    obs_fact_lists = []
    for e in cluster:
        focus = set(signature_full(f) for f in (e.observation.focus_facts or []))
        obs_fact_lists.append([f for f in e.observation.facts if signature_full(f) not in focus])
    pre.extend(_most_common_facts(obs_fact_lists, min_support=options.fact_min_support))

    # Remove any pre facts that are identical to effects
    eff_sigs = set(signature_full(f) for f in eff)
    pre = [f for f in dedup_facts(pre) if signature_full(f) not in eff_sigs]

    # Keep pre concise
    pre = pre[: options.max_pre_facts]

    reg = Regulation(
        regulation_id=_new_reg_id(),
        status="hypothesis",
        pre=pre,
        eff=eff,
        evidence_kind="observational",
        support_n=len(cluster),
        counterexample_n=0,
        explained_count=len(cluster),
        failed_predictions=0,
        last_used=None,
        scope={},  # you can also lift common context into scope instead
        description="Induced from event cluster (MVP heuristic).",
        cost=1.0,
        risk=1.0,
        origin={
            "induced_from_events": [e.event_id for e in cluster],
            "induced_at": _now_iso(),
            "induced_method": "cluster_intersection+missing_pre+common_context",
        },
        next_tests=[],
        tags=["induced"],
    )
    return reg
