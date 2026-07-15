"""POST /chatbot/assist -- confusion check for OPEN-TEXT questions (the ones
with no fixed options: vendor privacy policy, integration details, etc.).

Stops a confused reply ("where would I find that?") from being silently saved
as the answer and ending the form. Returns whether the reply is a real answer
or a request for help, plus a helpful message when it's the latter.

Request body:
    {
      "question_id": "vendor_privacy_policy_url",
      "question_text": "Do you have a link to the vendor's privacy policy? ...",
      "reply": "where would i find that?",
      "intake_context": {"software_name": "Canva"}
    }

Response:
    {"is_answer": false, "message": "A vendor's privacy policy is usually ..."}
"""

import os
import sys

from . import store

_CHATBOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "chatbot")
)
if _CHATBOT_DIR not in sys.path:
    sys.path.insert(0, _CHATBOT_DIR)

import parse as chatbot_parse  # noqa: E402


def handler(event, context=None):
    body = store.parse_body(event)
    question_id = body.get("question_id") or ""
    question_text = body.get("question_text") or ""
    reply = body.get("reply")
    intake_context = body.get("intake_context") or {}

    if not isinstance(reply, str) or not reply.strip():
        return store.error_response(400, "Body must include a non-empty 'reply'")

    try:
        result = chatbot_parse.assist_open_text(
            question_id, question_text, reply, intake_context
        )
    except Exception as exc:  # noqa: BLE001 - fail open so the form never wedges
        return store.response(200, {"is_answer": True, "message": ""})

    return store.response(200, result)
