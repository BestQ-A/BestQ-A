from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple
from .types import Fact


Bindings = Dict[str, Any]


def is_var(x: Any) -> bool:
    return isinstance(x, str) and x.startswith("?")


def is_wildcard(x: Any) -> bool:
    return x == "*"


def unify_args(pattern_args: Dict[str, Any], fact_args: Dict[str, Any], bindings: Bindings) -> Optional[Bindings]:
    """Unify pattern_args with fact_args under current bindings."""
    b = dict(bindings)
    for k, pv in (pattern_args or {}).items():
        if k not in fact_args:
            return None
        fv = fact_args.get(k)
        if is_wildcard(pv):
            continue
        if is_var(pv):
            if pv in b and b[pv] != fv:
                return None
            b[pv] = fv
        else:
            if pv != fv:
                return None
    return b


def unify_fact(pattern: Fact, target: Fact, bindings: Bindings) -> Optional[Bindings]:
    """Unify a (possibly variable) pattern fact with a concrete target fact."""
    if pattern.pred != target.pred:
        return None
    if pattern.value != target.value and not is_wildcard(pattern.value):
        return None
    return unify_args(pattern.args or {}, target.args or {}, bindings)


def substitute_fact(f: Fact, bindings: Bindings) -> Fact:
    """Replace variables in args/value using bindings."""
    args = {}
    for k, v in (f.args or {}).items():
        if is_var(v) and v in bindings:
            args[k] = bindings[v]
        else:
            args[k] = v
    value = f.value
    if is_var(value) and value in bindings:
        value = bindings[value]
    return Fact(pred=f.pred, args=args, value=value)


def fact_entails(known: Iterable[Fact], goal: Fact, bindings: Bindings) -> Optional[Bindings]:
    """Return bindings if known facts entail goal under bindings."""
    for k in known:
        b2 = unify_fact(goal, k, bindings)
        if b2 is not None:
            return b2
    return None


def signature_pred_value(f: Fact) -> Tuple[str, Any]:
    return (f.pred, f.value)


def signature_full(f: Fact) -> Tuple:
    return f.signature(include_args=True)


def dedup_facts(facts: List[Fact]) -> List[Fact]:
    seen = set()
    out: List[Fact] = []
    for f in facts:
        sig = signature_full(f)
        if sig in seen:
            continue
        seen.add(sig)
        out.append(f)
    return out
