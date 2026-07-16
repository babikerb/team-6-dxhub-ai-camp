"""POST /requests/{id}/security-report -- generate (or regenerate) the
automated Security risk report for a request (Phase 1: narrative report,
see backend/chatbot/security_report_prompt.md).

generate_and_save() is called two different ways, same function either time:
  - directly, as a FastAPI background task right after chatbot submission
    when security_flag flips true (see local_server.py's chatbot_patch_route)
    -- fire-and-forget, the requester never waits on this.
  - via handler() below, a normal blocking call, for the dashboard's manual
    "Regenerate" button -- the admin waits with a spinner instead.
"""

import os
import sys

from . import store

_CHATBOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "chatbot")
)
if _CHATBOT_DIR not in sys.path:
    sys.path.insert(0, _CHATBOT_DIR)

import security_report_generator  # noqa: E402


def generate_and_save(request_id: str) -> dict | None:
    """Run the full report pipeline and persist the result. Re-fetches the
    record right before saving so an admin edit made while this was running
    (fetching documents + calling Bedrock can take a while) isn't clobbered.
    """
    record = store.get_request(request_id)
    if record is None:
        return None

    try:
        result = security_report_generator.generate_report(record)
        security_review = {
            "status": "complete",
            "generated_at": store.now_iso(),
            **result,
        }
    except Exception as exc:  # noqa: BLE001
        security_review = {
            "status": "failed",
            "generated_at": store.now_iso(),
            "error": str(exc)[:500],
        }

    fresh = store.get_request(request_id) or record
    fresh["security_review"] = security_review
    fresh["updated_at"] = store.now_iso()
    store.save_request(fresh)
    return fresh


def handler(event, context=None):
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id:
        return store.error_response(400, "Missing request id in path")

    record = store.get_request(request_id)
    if record is None:
        return store.error_response(404, f"No request found with id {request_id}")

    record.setdefault("security_review", {})["status"] = "pending"
    store.save_request(record)

    updated = generate_and_save(request_id)
    return store.response(200, updated)
