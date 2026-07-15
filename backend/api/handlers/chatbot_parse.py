"""POST /chatbot/parse -- turn a requester's free-text reply into a structured
answer for ONE question, using the Bedrock parsing layer in backend/chatbot/.

Request body:
    {
      "question_id": "software_category",
      "reply": "we just log into their website",
      "intake_context": {"software_name": "Canva"}   # optional
    }

Response:
    {
      "answer": "cloud",
      "confidence": 0.95,
      "reasoning": "...",
      "quote": "...",
      "cascade_action": "confirm" | "layer1_tree" | "layer2_buttons"
    }

The heavy lifting lives in backend/chatbot/parse.py (single source of truth for
the prompt, enums, and cascade thresholds). This handler only adapts it to the
Lambda/API-Gateway shape the rest of the API uses.
"""

import os
import sys

from . import store

# parse.py lives in backend/chatbot/ (sibling of backend/api/); add it to path.
_CHATBOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "chatbot")
)
if _CHATBOT_DIR not in sys.path:
    sys.path.insert(0, _CHATBOT_DIR)

import parse as chatbot_parse  # noqa: E402


def handler(event, context=None):
    body = store.parse_body(event)
    question_id = body.get("question_id")
    reply = body.get("reply")
    intake_context = body.get("intake_context") or {}

    if not question_id or question_id not in chatbot_parse.QUESTIONS:
        return store.error_response(
            400, f"Unknown or missing question_id: {question_id!r}"
        )
    if not isinstance(reply, str) or not reply.strip():
        return store.error_response(400, "Body must include a non-empty 'reply'")

    try:
        result = chatbot_parse.parse_answer(question_id, reply, intake_context)
    except Exception as exc:  # noqa: BLE001 - surface a clean error to the UI
        return store.error_response(502, f"Parse failed: {exc}")

    result["cascade_action"] = chatbot_parse.next_cascade_action(result)
    return store.response(200, result)
