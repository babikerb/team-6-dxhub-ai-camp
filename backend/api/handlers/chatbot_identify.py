"""POST /chatbot/identify-software -- "Canva -- online design platform. Is that right?"

Called by the intake form when the requester enters a software name and clicks
Next. Confirms we understood WHICH product they mean before the rest of the
form assumes it, and does RC Job Task List step 6 ("visit the vendor's website
to understand what the software does") automatically instead of by hand.

Web-search grounded: if the search can't identify the product, identified=false
and the form asks the requester to describe it rather than inventing a
description.

Request body:
    {
      "software_name": "Canva",
      "use_description": "flyers for events",   # optional, disambiguates
      "vendor_website": "https://canva.com"     # optional, narrows the search
    }

Response:
    {"identified": bool, "canonical_name": str, "one_liner": str|null,
     "source_url": str|null, "confidence": float}
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

    if not isinstance(software_name, str) or not software_name.strip():
        return store.error_response(400, "Body must include a non-empty 'software_name'")

    try:
        result = chatbot_parse.identify_software(
            software_name,
            body.get("use_description"),
            body.get("vendor_website"),
        )
    except Exception as exc:  # noqa: BLE001
        return store.error_response(502, f"Identify failed: {exc}")

    return store.response(200, result)
