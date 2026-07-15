"""POST /chatbot/find-document -- reviewer-side: search the web for a specific
public vendor document and return the best OFFICIAL, domain-validated URL.

Covers the docs the discovery call named for security/accessibility review:
privacy_policy, terms_of_service, vpat, hecvat, soc2. Michael Farley asked for
the bot to pull a HECVAT "if publicly available" — this does that. SOC 2 reports
are often NOT public, so found=false is a normal, honest outcome.

Request body:
    {"vendor_name": "Zoom", "doc_type": "hecvat"}   # doc_type from REVIEWER_DOC_TYPES

Response:
    {"found": bool, "url": <str|null>, "title": ..., "doc_type": ...,
     "note": ..., "results": [{title,url,snippet}]}
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
    vendor_name = body.get("vendor_name")
    doc_type = body.get("doc_type", "privacy_policy")

    if not isinstance(vendor_name, str) or not vendor_name.strip():
        return store.error_response(400, "Body must include a non-empty 'vendor_name'")
    if doc_type not in chatbot_parse.REVIEWER_DOC_TYPES:
        return store.error_response(
            400,
            f"Unknown doc_type {doc_type!r}. Valid: {sorted(chatbot_parse.REVIEWER_DOC_TYPES)}",
        )

    try:
        result = chatbot_parse.find_document(vendor_name, doc_type)
    except Exception as exc:  # noqa: BLE001
        return store.error_response(502, f"Find-document failed: {exc}")

    return store.response(200, result)
