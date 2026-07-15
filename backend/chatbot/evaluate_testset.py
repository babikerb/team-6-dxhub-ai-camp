"""
Evaluate the chatbot parser against real historical SDSU software requests.

Source of truth: the ServiceNow export (sc_req_item), where each row has a real
usage description AND the answer a requester/reviewer actually recorded for
software category and data-sharing. We feed the *description* to the parser and
compare its structured answer to the recorded label.

Two numbers this produces (both matter to the project's "saves IT time" claim):
  * RESOLUTION RATE  - how often the bot lands on a concrete answer (not
    "unsure") at high enough confidence to not need a human. Higher = fewer
    requests IT staff must chase down.
  * AGREEMENT RATE   - of those resolved, how often it matches the historical
    label. Note the historical labels are themselves noisy (requester-entered:
    e.g. Canva mislabeled as on-prem), so disagreements are logged for review,
    not assumed to be parser errors.

Usage:
    CHATBOT_LLM_MODE=bedrock python evaluate_testset.py test_set_30.json software_category
    CHATBOT_LLM_MODE=mock    python evaluate_testset.py labeled_full.json shares_data
"""

import json
import sys
from collections import Counter

import parse

# Map the CLI question keyword to (question_id, label field in the dataset)
QMAP = {
    "software_category": ("software_category", "label_category"),
    "shares_data": ("shares_data_with_campus_system", "label_shares_data"),
}


def run(dataset_path, which):
    question_id, label_field = QMAP[which]
    rows = json.load(open(dataset_path))
    rows = [r for r in rows if isinstance(r.get(label_field), str)]  # skip unlabeled/multi

    resolved = 0
    agree = 0
    disagreements = []
    unsure_rows = []
    confusion = Counter()

    for i, r in enumerate(rows, 1):
        reply = r["usage"]
        intake = {"software_name": r["software_name"]}
        res = parse.parse_answer(question_id, reply, intake_context=intake)
        action = parse.next_cascade_action(res)
        pred, label = res["answer"], r[label_field]

        is_resolved = action in ("confirm", "layer1_tree") and pred != "unsure"
        if is_resolved:
            resolved += 1
            if pred == label:
                agree += 1
            else:
                disagreements.append((r["software_name"], reply[:70], pred, label, res["confidence"]))
                confusion[f"{label}->{pred}"] += 1
        else:
            unsure_rows.append((r["software_name"], reply[:70], res["confidence"]))

        print(f"[{i:>3}/{len(rows)}] {pred:>17} (conf {res['confidence']:.2f}, {action:<13}) "
              f"vs label {label:<17} | {r['software_name'][:32]}")

    n = len(rows)
    print("\n" + "=" * 72)
    print(f"Question: {question_id}   Dataset: {dataset_path}   Mode: {parse.MODE}")
    print(f"Rows evaluated:       {n}")
    print(f"RESOLUTION RATE:      {resolved}/{n} = {resolved/n:.0%}  (bot gave a concrete answer)")
    if resolved:
        print(f"AGREEMENT (resolved): {agree}/{resolved} = {agree/resolved:.0%}  (matches historical label)")
    print(f"Sent to 'unsure'/buttons: {len(unsure_rows)}")
    if confusion:
        print("\nDisagreement patterns (label -> predicted):")
        for k, c in confusion.most_common():
            print(f"   {k}: {c}")
    if disagreements:
        print("\nDisagreements (review — some are historical mislabels, not parser errors):")
        for sw, txt, pred, label, conf in disagreements[:20]:
            print(f"   {sw[:28]:<28} pred={pred:<17} label={label:<17} ({conf:.2f}) :: {txt}")
    return {"n": n, "resolved": resolved, "agree": agree}


if __name__ == "__main__":
    dataset = sys.argv[1] if len(sys.argv) > 1 else "test_set_30.json"
    which = sys.argv[2] if len(sys.argv) > 2 else "software_category"
    run(dataset, which)
