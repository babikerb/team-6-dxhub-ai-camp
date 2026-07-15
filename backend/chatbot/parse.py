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
    "ai_capabilities": {
        "enum": ["yes", "no", "unsure"],
        "prompt_section": "ai_capabilities",
    },
    "ai_automated_decisions": {
        "enum": ["yes", "no", "unsure"],
        "prompt_section": "ai_automated_decisions",
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


# Plain-English explanation of each option, used when the model needs to "lay
# out the answers" for a confused requester (see converse() escalation rules).
OPTION_GUIDE = {
    "software_category": [
        ("cloud", "Something you log into online — a website or app, nothing to install (like Canva, Zoom, Kahoot)."),
        ("onprem-datacenter", "Campus IT installs and runs it on a server for lots of people (like a backup or database system)."),
        ("onprem-local", "You install it yourself on your own computer (often lab, instrument, or scientific software)."),
        ("addon", "A small add-on inside a program you already use (a browser extension, a Gmail or Acrobat add-in)."),
    ],
    "shares_data_with_campus_system": [
        ("yes", "It connects to another SDSU system — like Canvas, Oracle, or PeopleSoft/mySDSU — to send or pull information."),
        ("no", "It works on its own and doesn't exchange data with other campus systems."),
    ],
    "sso_capable": [
        ("yes", "You log in with your regular SDSUid — the same login as other campus systems."),
        ("no", "It has its own separate username and password, just for this tool."),
    ],
    "estimated_users": [
        ("1-30", "A small group — up to about 30 people."),
        ("30-100", "A medium group — roughly 30 to 100 people."),
        ("100+", "A large group — more than 100 people."),
    ],
    "ai_capabilities": [
        ("yes", "Yes — it uses AI: it writes or makes things, answers questions, gives suggestions, or figures things out on its own."),
        ("no", "No — it has no AI features; it just does what you tell it."),
        ("unsure", "Not sure whether it uses AI."),
    ],
    "ai_automated_decisions": [
        ("yes", "Yes — it helps decide things about people (who gets admitted or hired, who gets financial aid, or what grade someone gets)."),
        ("no", "No — it doesn't help make choices about people."),
        ("unsure", "Not sure whether it helps make choices about people."),
    ],
}
# The nine sensitive-data questions are all simple yes/no.
for _q in ["la_health", "la_pii", "la_payment", "la_lawenforcement",
           "lb_coursework", "lb_employee", "lb_budget", "lb_research", "lb_legal"]:
    OPTION_GUIDE[_q] = [("yes", "Yes, it does."), ("no", "No, it doesn't.")]


# Open-text (non-enum) questions: how to help a confused requester and what
# counts as a valid "I have nothing to add" answer. Used by assist_open_text().
HELP_HINTS = {
    "vendor_privacy_policy_url": {
        "help": "A vendor's privacy policy is almost always linked at the very "
                "bottom (the footer) of their website, usually labeled 'Privacy' "
                "or 'Privacy Policy'. Open the vendor's site, scroll to the "
                "bottom, and copy that link. If you truly can't find one, that's "
                "okay.",
        "opt_out": '"not sure"',
    },
    "integration_explanation": {
        "help": "Name the campus system(s) it would connect to — like Canvas, "
                "Oracle, or PeopleSoft/mySDSU — and what information would be "
                "shared (for example, a class roster or grades).",
        "opt_out": None,
    },
    "other_data_category": {
        "help": "This is asking whether the software touches any other sensitive "
                "information we haven't already covered. If nothing else comes to "
                "mind, that's fine.",
        "opt_out": '"no"',
    },
    "compliance_requirements": {
        "help": "This is about any legal or contractual strings attached — a "
                "research grant's rules, an international privacy law, or a "
                "contract requirement. If you don't know of any, that's fine.",
        "opt_out": '"no"',
    },
    "ai_use_description": {
        "help": "Describe in your own words what the AI part does and how you'd "
                "use it — for example, 'it drafts email replies' or 'it suggests "
                "grades on student quizzes.' Even a rough description helps.",
        "opt_out": None,
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


# ---- Conversational multi-turn engine --------------------------------------
# Escalation rules the model follows when clarifying. Kept here (not the .md)
# because they govern the turn logic; bedrock_prompt.md documents them too.
_CONVERSE_SYSTEM = """You are a patient, friendly assistant helping a non-technical San Diego State
University faculty or staff member answer ONE question while requesting software.
The requester may be confused. Your goal is to gently work with them until you
can map their situation to one of the fixed answer options — or until you can
correctly infer the answer for them from what they've said.

Hard rules:
- NEVER accept a vague or non-committal reply ("maybe", "I think so", "I guess",
  "I don't know", "not sure", "kind of") as a final answer. Ask a specific,
  concrete follow-up that moves toward exactly one option.
- Only set status "resolved" when you are genuinely confident, OR when the
  conversation gives you enough to correctly pick the option FOR them. When you
  resolve, your message must state your pick and ask them to confirm it
  ("It sounds like ___ — is that right?").
- If you're not there yet, set status "clarify" and ask ONE short, plain-English
  follow-up. Do not use jargon (cloud, on-prem, SSO, Level 1/2, FERPA, HIPAA) —
  translate everything into everyday language and concrete examples.
- Escalate with effort:
    * After the requester has given about TWO unhelpful answers, set
      show_options to true and briefly explain each option in plain English
      inside your message, then invite them to pick or describe more.
    * If they express confusion or keep saying "I don't know", FIRST ask
      whether the question itself makes sense to them (one short check), THEN
      lay the options out plainly (show_options true).
- NEVER shut the conversation down. Do not give up, and do not return "unsure"
  as a way to end it. Always either resolve or ask a constructive next question.
  There is always a next step you can take with them."""


def _converse_tool(enum):
    answerable = [e for e in enum if e != "unsure"]
    return {
        "name": "record_turn",
        "description": "Decide the next conversational move for this question.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["resolved", "clarify"]},
                "answer": {"type": ["string", "null"], "enum": answerable + [None]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "message": {
                    "type": "string",
                    "description": "What to say to the requester next — a confirmation if resolved, otherwise a plain-English follow-up question.",
                },
                "show_options": {
                    "type": "boolean",
                    "description": "True when the message lays out the options and the clickable choices should be shown.",
                },
            },
            "required": ["status", "confidence", "message", "show_options"],
        },
    }


def _options_text(question_id):
    guide = OPTION_GUIDE.get(question_id, [])
    return "\n".join(f'- "{val}": {plain}' for val, plain in guide)


def converse(question_id, question_text, history, intake_context=None):
    """One turn of the multi-turn clarification loop.

    question_id    : key in QUESTIONS
    question_text  : the question as shown to the requester
    history        : list of {"role": "user"|"assistant", "text": ...} for THIS
                     question only (oldest first; last entry is the newest user reply)
    intake_context : optional dict from the intake form

    Returns {status, answer, confidence, message, show_options}.
    """
    if question_id not in QUESTIONS:
        raise ValueError(f"Unknown question_id: {question_id}")
    q = QUESTIONS[question_id]

    if (MODE or "").lower() == "mock":
        return _converse_mock(question_id, question_text, history)

    import boto3

    _, guidance = _load_prompt_section(q["prompt_section"])
    user_attempts = sum(1 for h in history if h.get("role") == "user")
    ctx = ""
    if intake_context:
        ctx = "What the intake form already told us:\n" + "\n".join(
            f"- {k}: {v}" for k, v in intake_context.items() if v
        )
    transcript = "\n".join(
        f"{'Requester' if h.get('role') == 'user' else 'You'}: {h.get('text','')}"
        for h in history
    )
    escalation = ""
    if user_attempts >= 2:
        escalation = (
            "IMPORTANT: they have now struggled TWICE. Unless their latest reply "
            "clearly resolves the answer, you MUST set show_options to true and, in "
            "your message, first gently check that the question makes sense to them, "
            "then explain each option in plain English so they can simply pick one. "
            "Do not just ask another open-ended question."
        )
    user = f"""The question the requester is answering: "{question_text}"

The only valid answers, in plain English:
{_options_text(question_id)}

Extra guidance for mapping replies to these answers:
{guidance}

{ctx}

Conversation so far on this question:
{transcript}

The requester has given {user_attempts} answer(s) so far on this question.
Decide the next move and call record_turn. Remember: never accept a wishy-washy
answer as final, keep working with them, and escalate to explaining the options
plainly if they've struggled about twice.
{escalation}"""

    client = boto3.client("bedrock-runtime", region_name=REGION)
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 600,
        "system": _CONVERSE_SYSTEM,
        "messages": [{"role": "user", "content": user}],
        "tools": [_converse_tool(q["enum"])],
        "tool_choice": {"type": "tool", "name": "record_turn"},
    }
    resp = client.invoke_model(modelId=MODEL_ID, body=json.dumps(body))
    payload = json.loads(resp["body"].read())
    for blk in payload.get("content", []):
        if blk.get("type") == "tool_use" and blk.get("name") == "record_turn":
            return _normalize_turn(blk["input"], q, user_attempts)
    return {"status": "clarify", "answer": None, "confidence": 0.0,
            "message": "Sorry — could you tell me a bit more about that?",
            "show_options": user_attempts >= 2}


def _normalize_turn(raw, q, user_attempts=0):
    status = raw.get("status")
    answer = raw.get("answer")
    if status == "resolved" and answer not in q["enum"]:
        status = "clarify"  # can't resolve to a non-option
        answer = None
    status = status if status in ("resolved", "clarify") else "clarify"
    try:
        conf = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    # Backstop Alvin's rule: after ~2 struggles with no resolution, always
    # surface the options so the requester can just pick one.
    show_options = bool(raw.get("show_options", False))
    if status == "clarify" and user_attempts >= 2:
        show_options = True
    return {
        "status": status,
        "answer": answer if answer in q["enum"] else None,
        "confidence": max(0.0, min(1.0, conf)),
        "message": str(raw.get("message", "")).strip()[:600]
        or "Could you tell me a little more?",
        "show_options": show_options,
    }


def _converse_mock(question_id, question_text, history):
    """Offline stand-in: use the single-shot heuristic, phrased as a turn."""
    last = next((h["text"] for h in reversed(history) if h.get("role") == "user"), "")
    r = _heuristic(question_id, last)
    ans = r["answer"]
    attempts = sum(1 for h in history if h.get("role") == "user")
    if r["confidence"] >= CONFIRM_THRESHOLD and isinstance(ans, str) and ans != "unsure":
        label = dict(OPTION_GUIDE.get(question_id, [])).get(ans, ans)
        return {"status": "resolved", "answer": ans, "confidence": r["confidence"],
                "message": f"It sounds like: {label} Is that right?", "show_options": False}
    show = attempts >= 2
    opts = "\n".join(f"• {p}" for _, p in OPTION_GUIDE.get(question_id, []))
    msg = ("No worries — let me put the choices in plain terms:\n" + opts +
           "\nWhich of these sounds closest?") if show else \
          "Got it — can you tell me a bit more so I can point you to the right option?"
    return {"status": "clarify", "answer": None, "confidence": r["confidence"],
            "message": msg, "show_options": show}


# ---- Open-text assist (for non-enum questions) -----------------------------
# Stops a confused reply ("where would I find that?") from being silently saved
# as the answer. Decides: is this a real answer, or are they asking for help?
_ASSIST_SYSTEM = """You help a non-technical San Diego State University faculty/staff member fill
out one open-text field on a software request form. Given the question and their
reply, decide ONE thing: did they actually ANSWER it, or are they confused /
asking YOU a question / asking where to find something?

- A real answer includes a substantive response, a pasted link/URL, or a valid
  opt-out like "no", "none", "not sure", "n/a".
- If instead they ask a question back ("where do I find that?", "what do you
  mean?", "how?") or express confusion, that is NOT an answer. Write a short,
  warm, plain-English reply that actually helps them find or understand what's
  being asked, and tell them what to type. Never treat a question-back as the
  answer, and never end the conversation on it."""


def _assist_tool():
    return {
        "name": "record_assist",
        "description": "Decide whether the reply is a real answer or a request for help.",
        "input_schema": {
            "type": "object",
            "properties": {
                "is_answer": {"type": "boolean"},
                "message": {
                    "type": "string",
                    "description": "If is_answer is false, a short helpful reply guiding them to an answer.",
                },
            },
            "required": ["is_answer", "message"],
        },
    }


def assist_open_text(question_id, question_text, reply, intake_context=None):
    """One assist turn for an open-text question. Returns {is_answer, message}."""
    reply = (reply or "").strip()
    # Pasted URL or explicit short opt-out -> definitely an answer, skip the model.
    low = reply.lower()
    if re.match(r"https?://", low) or low in {"no", "none", "n/a", "na", "not sure", "unsure", "nope"}:
        return {"is_answer": True, "message": ""}

    if (MODE or "").lower() == "mock":
        # Offline: treat a reply ending in '?' or containing confusion words as a question.
        looks_confused = reply.endswith("?") or any(
            w in low for w in ["where", "what do you mean", "how do i", "not sure what", "don't understand", "dont understand"]
        )
        if looks_confused:
            hint = HELP_HINTS.get(question_id, {})
            msg = hint.get("help", "Here's what this is asking — take your best guess, or say what you know.")
            if hint.get("opt_out"):
                msg += f" If it doesn't apply, you can just type {hint['opt_out']}."
            return {"is_answer": False, "message": msg}
        return {"is_answer": True, "message": ""}

    import boto3

    hint = HELP_HINTS.get(question_id, {})
    guide = ""
    if hint.get("help"):
        guide = f"\nIf they need help, use this to guide them:\n{hint['help']}"
        if hint.get("opt_out"):
            guide += f"\nRemind them they may type {hint['opt_out']} if it doesn't apply."
    ctx = ""
    if intake_context:
        ctx = "\nContext from the form: " + ", ".join(
            f"{k}={v}" for k, v in intake_context.items() if v
        )
    user = (
        f'The question: "{question_text}"{ctx}{guide}\n\n'
        f'The requester replied:\n"""{reply}"""\n\nCall record_assist.'
    )
    client = boto3.client("bedrock-runtime", region_name=REGION)
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 400,
        "system": _ASSIST_SYSTEM,
        "messages": [{"role": "user", "content": user}],
        "tools": [_assist_tool()],
        "tool_choice": {"type": "tool", "name": "record_assist"},
    }
    resp = client.invoke_model(modelId=MODEL_ID, body=json.dumps(body))
    payload = json.loads(resp["body"].read())
    for blk in payload.get("content", []):
        if blk.get("type") == "tool_use" and blk.get("name") == "record_assist":
            raw = blk["input"]
            is_ans = bool(raw.get("is_answer", True))
            return {
                "is_answer": is_ans,
                "message": "" if is_ans else str(raw.get("message", ""))[:600],
            }
    return {"is_answer": True, "message": ""}  # fail open: accept the answer


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
