"""
Bedrock answer-parsing layer for the SDSU software-request chatbot.

Turns a requester's free-text reply into a structured answer for ONE question:

    {"answer": <enum|list|"unsure">, "confidence": 0.0-1.0,
     "reasoning": "...", "quote": "..."}

Design notes
------------
* Structured output is guaranteed via Bedrock **tool use** (tool_choice forces
  the `record_answer` tool), not free-text JSON parsing. The model cannot
  reply in prose.
* MODE switch (env CHATBOT_LLM_MODE):
    - "bedrock"  -> live Amazon Bedrock call (production + local dev w/ AWS creds)
    - "mock"     -> replay from mock_responses.json (DEMO-SAFE: no network, no
                    expiring token). Falls back to a deterministic heuristic if a
                    reply isn't in the recording.
* The enum for each question lives in QUESTIONS below, so the frontend and this
  file cannot drift. The human-readable guidance lives in bedrock_prompt.md.

Nothing here is SDSU-secret; safe for the public repo. AWS creds are read from
the environment / ~/.aws (never committed).
"""

import json
import os
import re
from pathlib import Path

_HERE = Path(__file__).parent
_PROMPT_FILE = _HERE / "bedrock_prompt.md"
_MOCK_FILE = _HERE / "mock_responses.json"

# ---- Config (safe to edit) -------------------------------------------------
MODE = os.environ.get("CHATBOT_LLM_MODE", "bedrock")  # "bedrock" | "mock"
# On this AWS account, Bedrock requires INFERENCE-PROFILE ids (us.anthropic.*),
# NOT the bare anthropic.claude-* model ids (those raise ValidationException).
MODEL_ID = os.environ.get(
    "CHATBOT_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
)
REGION = os.environ.get("AWS_REGION", "us-west-2")

# Frontend cascade thresholds (see bedrock_prompt.md).
CONFIRM_THRESHOLD = 0.75   # >= this: accept + one-line confirm
TREE_THRESHOLD = 0.40      # between this and CONFIRM: Layer-1 decision tree
                           # below this (or "unsure"): Layer-2 buttons

# ---- Question registry -----------------------------------------------------
# enum: allowed answers. multi=True means answer is a subset (list).
QUESTIONS = {
    "software_category": {
        "enum": ["cloud", "onprem-datacenter", "onprem-local", "addon", "unsure"],
        "prompt_section": "software_category",
    },
    "shares_data_with_campus_system": {
        "enum": ["yes", "no", "unsure"],
        "prompt_section": "shares_data_with_campus_system",
    },
    "estimated_users": {
        "enum": ["1-30", "30-100", "100+", "unsure"],
        "prompt_section": "estimated_users",
    },
    "interaction_method": {
        "enum": ["computer", "mobile", "browser"],
        "prompt_section": "interaction_method",
        "multi": True,
    },
    "sso_capable": {
        "enum": ["yes", "no", "unsure"],
        "prompt_section": "sso_capable",
    },
    # data-category yes/no questions all share the same shape
    **{
        q: {"enum": ["yes", "no", "unsure"], "prompt_section": "data-category blocks"}
        for q in [
            "la_health", "la_pii", "la_payment", "la_lawenforcement",
            "lb_coursework", "lb_employee", "lb_budget", "lb_research", "lb_legal",
        ]
    },
}


def _load_prompt_section(section: str) -> str:
    """Pull the system preamble + the relevant per-question block from the md."""
    text = _PROMPT_FILE.read_text(encoding="utf-8")
    # System preamble (between the '## System prompt' heading and the next '## ')
    preamble = ""
    m = re.search(r"## System prompt.*?\n(.*?)\n## ", text, re.S)
    if m:
        preamble = re.sub(r"^> ?", "", m.group(1), flags=re.M).strip()
    # The specific question block
    block = ""
    m = re.search(rf"### Q: {re.escape(section)}\b(.*?)(?:\n### |\n## |\Z)", text, re.S)
    if m:
        block = m.group(1).strip()
    return preamble, block


# ---- Structured-output tool spec (Bedrock tool use) ------------------------
def _tool_spec(enum, multi):
    answer_schema = (
        {"type": "array", "items": {"type": "string", "enum": [e for e in enum if e != "unsure"]}}
        if multi
        else {"type": "string", "enum": enum}
    )
    return {
        "name": "record_answer",
        "description": "Record the structured answer, confidence, and reasoning.",
        "input_schema": {
            "type": "object",
            "properties": {
                "answer": answer_schema,
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "reasoning": {"type": "string"},
                "quote": {"type": ["string", "null"]},
            },
            "required": ["answer", "confidence", "reasoning"],
        },
    }


def _build_messages(question_id, reply, intake_context):
    q = QUESTIONS[question_id]
    preamble, block = _load_prompt_section(q["prompt_section"])
    ctx = ""
    if intake_context:
        ctx = "\nIntake form already told us:\n" + "\n".join(
            f"- {k}: {v}" for k, v in intake_context.items() if v
        )
    user = (
        f"{block}\n{ctx}\n\n"
        f'The requester was asked the "{question_id}" question and replied:\n'
        f'"""{reply}"""\n\n'
        "Call record_answer with the best mapping. If the reply does not "
        "actually address this question, use \"unsure\" with low confidence."
    )
    return preamble, user


# ---- Bedrock call ----------------------------------------------------------
def _call_bedrock(question_id, reply, intake_context):
    import boto3  # imported lazily so mock mode needs no boto3

    q = QUESTIONS[question_id]
    system, user = _build_messages(question_id, reply, intake_context)
    tool = _tool_spec(q["enum"], q.get("multi", False))

    client = boto3.client("bedrock-runtime", region_name=REGION)
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 512,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "tools": [tool],
        "tool_choice": {"type": "tool", "name": "record_answer"},
    }
    resp = client.invoke_model(modelId=MODEL_ID, body=json.dumps(body))
    payload = json.loads(resp["body"].read())
    for block in payload.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "record_answer":
            return _normalize(block["input"], q)
    # Should not happen with forced tool_choice; fail safe to unsure.
    return {"answer": "unsure", "confidence": 0.0,
            "reasoning": "Model did not return a structured answer.", "quote": None}


# ---- Mock / demo mode ------------------------------------------------------
def _mock_key(question_id, reply):
    return f"{question_id}::{reply.strip().lower()}"


def _call_mock(question_id, reply, intake_context):
    recordings = {}
    if _MOCK_FILE.exists():
        recordings = json.loads(_MOCK_FILE.read_text(encoding="utf-8"))
    hit = recordings.get(_mock_key(question_id, reply))
    if hit:
        return _normalize(hit, QUESTIONS[question_id])
    return _heuristic(question_id, reply)


def _heuristic(question_id, reply):
    """Deterministic fallback so mock mode always returns *something* sensible."""
    r = reply.lower()
    if question_id == "software_category":
        if any(w in r for w in ["website", "web app", "log in", "online", "cloud", "browser", "saas"]):
            return _mk("cloud", 0.6, "Sounds web-based.")
        if any(w in r for w in ["install", "my laptop", "my computer", "desktop", "instrument", "microscope"]):
            return _mk("onprem-local", 0.6, "Sounds installed locally.")
        if any(w in r for w in ["server", "data center", "it sets up", "it installs"]):
            return _mk("onprem-datacenter", 0.6, "Sounds like a campus server install.")
        if any(w in r for w in ["extension", "add-on", "add on", "plugin", "plug-in", "add-in"]):
            return _mk("addon", 0.6, "Sounds like an add-on.")
        return _mk("unsure", 0.2, "Reply describes use, not how it runs.")
    if question_id in ("shares_data_with_campus_system", "sso_capable") or question_id.startswith(("la_", "lb_")):
        if re.search(r"\byes\b|\bcanvas\b|\boracle\b|\bpeoplesoft\b|\bintegrat", r):
            return _mk("yes", 0.6, "Reply indicates yes.")
        if re.search(r"\bno\b|standalone|doesn'?t|does not", r):
            return _mk("no", 0.6, "Reply indicates no.")
        return _mk("unsure", 0.2, "Not addressed.")
    if question_id == "estimated_users":
        nums = [int(n) for n in re.findall(r"\d+", r)]
        n = max(nums) if nums else None
        if n is not None:
            b = "1-30" if n <= 30 else "30-100" if n <= 100 else "100+"
            return _mk(b, 0.7, f"~{n} users.")
        if any(w in r for w in ["just me", "handful", "my lab"]):
            return _mk("1-30", 0.6, "Small group.")
        if any(w in r for w in ["campus", "whole college", "hundreds", "everyone"]):
            return _mk("100+", 0.6, "Large group.")
        return _mk("unsure", 0.2, "No count given.")
    if question_id == "interaction_method":
        picks = []
        if any(w in r for w in ["phone", "mobile", "tablet"]): picks.append("mobile")
        if "browser" in r or "web" in r: picks.append("browser")
        if any(w in r for w in ["computer", "laptop", "desktop"]): picks.append("computer")
        return _mk(picks or ["computer"], 0.5 if picks else 0.2, "Heuristic guess.")
    return _mk("unsure", 0.2, "No heuristic.")


def _mk(answer, conf, reasoning, quote=None):
    return {"answer": answer, "confidence": conf, "reasoning": reasoning, "quote": quote}


# ---- Normalization / validation --------------------------------------------
def _normalize(raw, q):
    answer = raw.get("answer")
    if q.get("multi"):
        if isinstance(answer, str):
            answer = [answer]
        answer = [a for a in (answer or []) if a in q["enum"]]
    else:
        if answer not in q["enum"]:
            answer = "unsure"
    try:
        conf = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))
    return {
        "answer": answer,
        "confidence": conf,
        "reasoning": str(raw.get("reasoning", ""))[:300],
        "quote": raw.get("quote"),
    }


# ---- Public API ------------------------------------------------------------
def parse_answer(question_id, reply, intake_context=None, mode=None):
    """Parse ONE free-text reply into a structured answer.

    question_id     : key in QUESTIONS
    reply           : the requester's plain-text answer
    intake_context  : optional dict from the intake form (software_name,
                      use_description, vendor_website, scope_of_usage) used for
                      the propose-then-confirm flow
    mode            : override MODE ("bedrock" | "mock")
    """
    if question_id not in QUESTIONS:
        raise ValueError(f"Unknown question_id: {question_id}")
    active = (mode or MODE).lower()
    if active == "mock":
        return _call_mock(question_id, reply, intake_context or {})
    return _call_bedrock(question_id, reply, intake_context or {})


def next_cascade_action(result):
    """Map a parse result to the frontend's next move (see bedrock_prompt.md)."""
    if result["answer"] == "unsure" or (
        isinstance(result["answer"], list) and not result["answer"]
    ):
        return "layer2_buttons"
    c = result["confidence"]
    if c >= CONFIRM_THRESHOLD:
        return "confirm"
    if c >= TREE_THRESHOLD:
        return "layer1_tree"
    return "layer2_buttons"


if __name__ == "__main__":
    import sys
    qid = sys.argv[1] if len(sys.argv) > 1 else "software_category"
    txt = sys.argv[2] if len(sys.argv) > 2 else "we just log into their website"
    res = parse_answer(qid, txt)
    print(json.dumps(res, indent=2))
    print("cascade ->", next_cascade_action(res))
