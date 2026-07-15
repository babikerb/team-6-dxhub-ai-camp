"""POST /chatbot/match-software -- fuzzy/semantic match of a requested software
name against SDSU's approved catalog, PLUS approved-alternative suggestions.

Handles what the intake form's keyword matcher can't: variants, editions,
typos, abbreviations, rebrands ("MS Word" -> Microsoft 365, "Zooom" -> Zoom),
and "we don't offer that, but here's an approved tool that does the same thing"
(a request for "Claude" -> the catalog's AI assistants).

Request body:
    {
      "software_name": "Claude Code",
      "use_description": "coding help",         # optional, improves alternatives
      "catalog": [ ... ]                        # optional; defaults to bundled sdsu_catalog.json
    }

Response:
    {"status": "offered"|"alternative_available"|"not_found",
     "matched_name": <str|null>, "match_confidence": float,
     "alternatives": [{"name","why"}], "reasoning": str}
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
    software_name = body.get("software_name")
    use_description = body.get("use_description")
    catalog = body.get("catalog")  # optional override; else bundled catalog

    if not isinstance(software_name, str) or not software_name.strip():
        return store.error_response(400, "Body must include a non-empty 'software_name'")

    try:
        result = chatbot_parse.match_software(software_name, use_description, catalog)
    except Exception as exc:  # noqa: BLE001
        return store.error_response(502, f"Match failed: {exc}")

    return store.response(200, result)
