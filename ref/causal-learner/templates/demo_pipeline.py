from __future__ import annotations

from typing import List, Tuple

from .types import Observation, Regulation, Event
from .event_detector import DetectOptions, process_observation
from .inducer import InduceOptions, cluster_events, induce_regulation
from .validator import validate_regulation


def run_pipeline(observations: List[Observation], regulations: List[Regulation],
                 detect_options: DetectOptions = DetectOptions(),
                 induce_options: InduceOptions = InduceOptions()) -> Tuple[List[Regulation], List[Event]]:
    """Run a simple end-to-end loop:
    - stream observations -> explained or events
    - cluster events -> induce candidates -> validate -> add regulations
    - remove events that are now explainable (optional: re-check)
    """
    event_pool: List[Event] = []

    # stream
    for obs in observations:
        status, evt = process_observation(obs, regulations, detect_options)
        if status == "event_created" and evt is not None:
            event_pool.append(evt)

    # induce
    clusters = cluster_events(event_pool, induce_options)
    new_regs: List[Regulation] = []
    resolved_event_ids: List[str] = []

    for cluster in clusters:
        cand = induce_regulation(cluster, induce_options)
        ok, reasons = validate_regulation(cand, cluster, regulations)
        if ok:
            new_regs.append(cand)
            resolved_event_ids.extend([e.event_id for e in cluster])
        else:
            # keep as candidate? For MVP we just skip.
            pass

    regulations.extend(new_regs)
    # "clear" events explained by newly added regulations (MVP: remove clustered ones we accepted)
    if resolved_event_ids:
        event_pool = [e for e in event_pool if e.event_id not in set(resolved_event_ids)]

    return regulations, event_pool
