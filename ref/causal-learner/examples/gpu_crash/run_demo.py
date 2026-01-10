import os, sys
from pprint import pprint

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, ROOT)

from templates.storage import load_jsonl
from templates.types import Observation, Regulation
from templates.event_detector import DetectOptions, process_observation
from templates.inducer import InduceOptions, cluster_events, induce_regulation
from templates.validator import validate_regulation


def main():
    reg_path = os.path.join(HERE, "regulations.jsonl")
    obs_path = os.path.join(HERE, "observations.jsonl")

    regulations = [Regulation.from_dict(d) for d in load_jsonl(reg_path)]
    observations = [Observation.from_dict(d) for d in load_jsonl(obs_path)]

    detect_opt = DetectOptions(min_score=-2.2, max_assumptions=0)
    induce_opt = InduceOptions(min_events=3)

    # Pass 1: stream observations
    events = []
    explained = 0
    for obs in observations[:5]:
        status, evt = process_observation(obs, regulations, detect_opt)
        if status == "explained":
            explained += 1
        else:
            events.append(evt)

    print("\n=== PASS 1 ===")
    print(f"Explained: {explained}")
    print(f"Events created: {len(events)}")
    if events:
        print("Sample event unexplained_aspects:")
        pprint([f.to_dict() for f in events[0].unexplained_aspects])

    # Induce new regulations from events
    clusters = cluster_events(events, induce_opt)
    new_regs = []
    resolved_ids = set()

    print("\n=== INDUCTION ===")
    print(f"Clusters found: {len(clusters)}")
    for i, cluster in enumerate(clusters, 1):
        cand = induce_regulation(cluster, induce_opt)
        ok, reasons = validate_regulation(cand, cluster, regulations)
        print(f"\nCluster #{i} size={len(cluster)} -> candidate {cand.regulation_id} ok={ok}")
        if not ok:
            print("  reasons:", reasons)
            continue
        new_regs.append(cand)
        resolved_ids |= set(e.event_id for e in cluster)
        print("  pre:", [f.to_dict() for f in cand.pre])
        print("  eff:", [f.to_dict() for f in cand.eff])

    regulations.extend(new_regs)
    events = [e for e in events if e.event_id not in resolved_ids]

    # Pass 2: replay previously-failed obs + a new obs_006
    replay_obs = [e.observation for e in events] + [observations[5]]

    explained2 = 0
    events2 = []
    for obs in replay_obs:
        status, evt = process_observation(obs, regulations, detect_opt)
        if status == "explained":
            explained2 += 1
        else:
            events2.append(evt)

    print("\n=== PASS 2 (REPLAY) ===")
    print(f"Explained: {explained2}")
    print(f"Events created: {len(events2)}")

    print("\n=== REGULATIONS SUMMARY ===")
    for r in regulations:
        print(f"- {r.regulation_id} status={r.status} support={r.support_n} counter={r.counterexample_n}")

if __name__ == "__main__":
    main()
