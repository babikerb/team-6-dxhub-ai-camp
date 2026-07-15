"""POST /chatbot/converse -- one turn of the multi-turn clarification loop.

Unlike /chatbot/parse (single-shot classify), this keeps working with a
confused requester: it takes the full back-and-forth for ONE question and
returns the next move -- either a resolved answer to confirm, or a plain-English
follow-up question. It never accepts a wishy-washy answer as final and never
ends the conversation with a shrug (see backend/chatbot/parse.py: converse()).

Request body:
    {
      "question_id": "software_category",
      "question_text": "Where does this software actually run?",
      "history": [
        {"role": "user", "text": "maybe the cloud?"},
        {"role": "assistant", "text": "Do you install anything, or just log in?"},
        {"role": "user", "text": "i don't know"}
      ],
      "intake_context": {"software_name": "Canva"}
    }

Response:
    {"status": "resolved"|"clarify", "answer": <enum|null>, "confidence": float,
     "message": "what to say next", "show_options": bool}
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
    question_id = body.get("question_id")
    question_text = body.get("question_text") or ""
    history = body.get("history") or []
    intake_context = body.get("intake_context") or {}

    if not question_id or question_id not in chatbot_parse.QUESTIONS:
        return store.error_response(
            400, f"Unknown or missing question_id: {question_id!r}"
        )
    if not isinstance(history, list) or not history:
        return store.error_response(400, "Body must include a non-empty 'history'")

    try:
        result = chatbot_parse.converse(
            question_id, question_text, history, intake_context
        )
    except Exception as exc:  # noqa: BLE001
        return store.error_response(502, f"Converse failed: {exc}")

    return store.response(200, result)
