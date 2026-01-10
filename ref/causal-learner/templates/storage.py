from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Iterable, List, Optional

from .types import Event, Observation, Regulation


def load_jsonl(path: str) -> List[dict]:
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
    return out


def save_jsonl(path: str, items: Iterable[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")


@dataclass
class RegulationStore:
    regulations: List[Regulation] = field(default_factory=list)

    def add(self, reg: Regulation) -> None:
        self.regulations.append(reg)

    def all(self) -> List[Regulation]:
        return list(self.regulations)

    def save(self, path: str) -> None:
        save_jsonl(path, [r.to_dict() for r in self.regulations])

    @staticmethod
    def load(path: str) -> "RegulationStore":
        store = RegulationStore()
        for d in load_jsonl(path):
            store.add(Regulation.from_dict(d))
        return store


@dataclass
class EventPool:
    events: List[Event] = field(default_factory=list)

    def add(self, evt: Event) -> None:
        self.events.append(evt)

    def remove_by_ids(self, ids: List[str]) -> None:
        s = set(ids)
        self.events = [e for e in self.events if e.event_id not in s]

    def all(self) -> List[Event]:
        return list(self.events)

    def save(self, path: str) -> None:
        save_jsonl(path, [e.to_dict() for e in self.events])

    @staticmethod
    def load(path: str) -> "EventPool":
        pool = EventPool()
        for d in load_jsonl(path):
            pool.add(Event.from_dict(d))
        return pool
