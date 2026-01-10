from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


Json = Dict[str, Any]


@dataclass(frozen=True)
class Fact:
    """A predicate fact: pred(args) == value

    - pred: predicate name (string)
    - args: dict of arguments (values can be concrete, variables like '?x', or wildcard '*')
    - value: typically bool, but can be string/number/enum
    """
    pred: str
    value: Any
    args: Dict[str, Any] = field(default_factory=dict)

    def signature(self, include_args: bool = True) -> Tuple:
        if include_args:
            return (self.pred, tuple(sorted(self.args.items())), self.value)
        return (self.pred, self.value)

    def to_dict(self) -> Json:
        d: Json = {"pred": self.pred, "value": self.value}
        if self.args:
            d["args"] = dict(self.args)
        return d

    @staticmethod
    def from_dict(d: Json) -> "Fact":
        return Fact(pred=d["pred"], value=d.get("value"), args=dict(d.get("args") or {}))


@dataclass
class Observation:
    observation_id: str
    timestamp: str
    facts: List[Fact]
    context: Dict[str, Any] = field(default_factory=dict)
    focus_facts: Optional[List[Fact]] = None
    raw_refs: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def goals(self) -> List[Fact]:
        return self.focus_facts if self.focus_facts is not None else self.facts

    def to_dict(self) -> Json:
        return {
            "observation_id": self.observation_id,
            "timestamp": self.timestamp,
            "context": dict(self.context) if self.context else {},
            "facts": [f.to_dict() for f in self.facts],
            **({"focus_facts": [f.to_dict() for f in self.focus_facts]} if self.focus_facts is not None else {}),
            **({"raw_refs": list(self.raw_refs)} if self.raw_refs else {}),
            **({"metadata": dict(self.metadata)} if self.metadata else {}),
        }

    @staticmethod
    def from_dict(d: Json) -> "Observation":
        return Observation(
            observation_id=d["observation_id"],
            timestamp=d["timestamp"],
            context=dict(d.get("context") or {}),
            facts=[Fact.from_dict(x) for x in (d.get("facts") or [])],
            focus_facts=[Fact.from_dict(x) for x in d.get("focus_facts", [])] if "focus_facts" in d else None,
            raw_refs=list(d.get("raw_refs") or []),
            metadata=dict(d.get("metadata") or {}),
        )


@dataclass
class Regulation:
    regulation_id: str
    status: str  # candidate | hypothesis | confirmed | retired
    pre: List[Fact]
    eff: List[Fact]
    evidence_kind: str = "observational"  # observational | intervention | quasi_experiment
    support_n: int = 0
    counterexample_n: int = 0
    explained_count: int = 0
    failed_predictions: int = 0
    last_used: Optional[str] = None
    scope: Dict[str, Any] = field(default_factory=dict)  # simplest: key-values must match observation.context
    description: str = ""
    cost: float = 1.0
    risk: float = 1.0
    origin: Dict[str, Any] = field(default_factory=dict)
    next_tests: List[Dict[str, Any]] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Json:
        return {
            "regulation_id": self.regulation_id,
            "status": self.status,
            **({"description": self.description} if self.description else {}),
            "pattern": {
                "pre": [f.to_dict() for f in self.pre],
                "eff": [f.to_dict() for f in self.eff],
            },
            **({"scope": dict(self.scope)} if self.scope else {}),
            "origin": dict(self.origin) if self.origin else {},
            "evidence": {
                "kind": self.evidence_kind,
                "explained_count": self.explained_count,
                "failed_predictions": self.failed_predictions,
                "support_n": self.support_n,
                "counterexample_n": self.counterexample_n,
                **({"last_used": self.last_used} if self.last_used else {}),
            },
            "cost": self.cost,
            "risk": self.risk,
            **({"next_tests": list(self.next_tests)} if self.next_tests else {}),
            **({"tags": list(self.tags)} if self.tags else {}),
            **({"metadata": dict(self.metadata)} if self.metadata else {}),
        }

    @staticmethod
    def from_dict(d: Json) -> "Regulation":
        pat = d.get("pattern") or {}
        ev = d.get("evidence") or {}
        return Regulation(
            regulation_id=d["regulation_id"],
            status=d.get("status", "hypothesis"),
            description=d.get("description", ""),
            pre=[Fact.from_dict(x) for x in (pat.get("pre") or [])],
            eff=[Fact.from_dict(x) for x in (pat.get("eff") or [])],
            evidence_kind=ev.get("kind", "observational"),
            support_n=int(ev.get("support_n", 0) or 0),
            counterexample_n=int(ev.get("counterexample_n", 0) or 0),
            explained_count=int(ev.get("explained_count", 0) or 0),
            failed_predictions=int(ev.get("failed_predictions", 0) or 0),
            last_used=ev.get("last_used"),
            scope=dict(d.get("scope") or {}),
            origin=dict(d.get("origin") or {}),
            cost=float(d.get("cost", 1.0) or 1.0),
            risk=float(d.get("risk", 1.0) or 1.0),
            next_tests=list(d.get("next_tests") or []),
            tags=list(d.get("tags") or []),
            metadata=dict(d.get("metadata") or {}),
        )


@dataclass
class Story:
    """An explanatory storyline: a chain of regulations plus missing preconditions (assumptions)."""
    regulation_ids: List[str]
    assumptions: List[Fact] = field(default_factory=list)
    score: float = 0.0  # higher is better (we use log-scores, so closer to 0 is better)
    notes: str = ""

    def to_attempt(self, regulation_id: str, failure_reason: str, missing_pres: List[Fact], uncovered_goals: List[Fact]) -> Json:
        return {
            "regulation_id": regulation_id,
            "score": self.score,
            "failure_reason": failure_reason,
            "used_rules": list(self.regulation_ids),
            "missing_pres": [f.to_dict() for f in missing_pres],
            "assumptions": [f.to_dict() for f in self.assumptions],
            "uncovered_goals": [f.to_dict() for f in uncovered_goals],
            "storyline": list(self.regulation_ids),
            **({"notes": self.notes} if self.notes else {}),
        }


@dataclass
class Event:
    event_id: str
    timestamp: str
    observation: Observation
    attempted_explanations: List[Dict[str, Any]]
    unexplained_aspects: List[Fact]
    context: Dict[str, Any] = field(default_factory=dict)
    status: str = "open"
    cluster_id: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> Json:
        return {
            "event_id": self.event_id,
            "timestamp": self.timestamp,
            "status": self.status,
            **({"cluster_id": self.cluster_id} if self.cluster_id else {}),
            "context": dict(self.context) if self.context else {},
            "observation": self.observation.to_dict(),
            "attempted_explanations": list(self.attempted_explanations),
            "unexplained_aspects": [f.to_dict() for f in self.unexplained_aspects],
            **({"tags": list(self.tags)} if self.tags else {}),
            **({"notes": self.notes} if self.notes else {}),
        }

    @staticmethod
    def from_dict(d: Json) -> "Event":
        obs = d.get("observation")
        if isinstance(obs, dict):
            observation = Observation.from_dict(obs)
        else:
            raise ValueError("Event.from_dict expects embedded observation object")
        return Event(
            event_id=d["event_id"],
            timestamp=d["timestamp"],
            status=d.get("status", "open"),
            cluster_id=d.get("cluster_id"),
            context=dict(d.get("context") or {}),
            observation=observation,
            attempted_explanations=list(d.get("attempted_explanations") or []),
            unexplained_aspects=[Fact.from_dict(x) for x in (d.get("unexplained_aspects") or [])],
            tags=list(d.get("tags") or []),
            notes=d.get("notes", ""),
        )
