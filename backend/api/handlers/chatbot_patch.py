"""PATCH /requests/{id}/chatbot -- chatbot submits final structured it_review
answers. This handler computes flags and writes it_review + flags together
in one update, per Implementation_Plan.md section 2.

TEMPORARY: flags are computed with store._stub_compute_flags(). Swap this
for `from rules_engine.rules_engine import compute_flags` once Person 4
delivers backend/rules_engine/ -- same input/output shape, no other changes
needed here.

If security_flag comes back true, this marks security_review.status="pending"
synchronously so the dashboard reflects it immediately, then asynchronously
invokes the security-report worker Lambda (security_report.invoke_worker_async
-- a real, fire-and-forget Lambda invocation in deployed AWS; a no-op in
local dev, where local_server.py's chatbot_patch_route backgrounds the same
work itself via FastAPI BackgroundTasks instead). Either way, the requester's
submission never blocks on report generation.

After saving, sends:
  - Email 2: application received / under review
  - Email 3: missing required documents (when LLM cannot find them)
"""

import os
import sys

from . import emailer, evidence, security_report, store


def _find_missing_doc_types(record: dict, flags: dict) -> list[str]:
    """Return canonical doc types the LLM could not find among those required
    by the active flags. Already-uploaded requester evidence is treated as found.
    """
    required = evidence.required_doc_types(flags)
    if not required:
        return []

    already = evidence.fulfilled_doc_types(record)
    still_needed = [d for d in required if d not in already]
    if not still_needed:
        return []

    chatbot_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "chatbot")
    )
    if chatbot_dir not in sys.path:
        sys.path.insert(0, chatbot_dir)

    import parse as chatbot_parse  # noqa: E402

    vendor = (
        (record.get("requestor") or {}).get("software_name")
        or (record.get("requestor") or {}).get("vendor_website")
        or ""
    ).strip()
    if not vendor:
        return still_needed

    missing: list[str] = []
    for doc_type in still_needed:
        # integration_document is never publicly searchable in a reliable way.
        if doc_type == "integration_document":
            missing.append(doc_type)
            continue
        try:
            result = chatbot_parse.find_document(vendor, doc_type)
            if not result.get("found"):
                missing.append(doc_type)
        except Exception as exc:  # noqa: BLE001
            print(f"find_document({vendor!r}, {doc_type}) failed: {exc}")
            missing.append(doc_type)
    return missing


def handler(event, context=None):
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id:
        return store.error_response(400, "Missing request id in path")

    record = store.get_request(request_id)
    if record is None:
        return store.error_response(404, f"No request found with id {request_id}")

    body = store.parse_body(event)
    it_review = body.get("it_review")
    if not isinstance(it_review, dict):
        return store.error_response(400, "Body must include an 'it_review' object")

    # ATI uses requestor.scope_of_usage — keep it out of persisted it_review.
    scope = (record.get("requestor") or {}).get("scope_of_usage")
    flags = store._stub_compute_flags(it_review, scope_of_usage=scope)

    # Do not persist a duplicate scope on it_review if a client sent one.
    it_review.pop("scope_of_usage", None)

    record["it_review"] = it_review
    record["flags"] = flags
    record["status"] = "ITReview"
    record["updated_at"] = store.now_iso()
    if flags.get("security_flag"):
        record["security_review"] = {"status": "pending"}
    if flags.get("ati_flag"):
        record.setdefault("ati_review", {"status": "pending"})
    record.setdefault("notifications", {})
    record.setdefault("requester_documents", {})

    store.save_request(record)

    # Email 2 — application received
    try:
        if emailer.send_application_received_email(record):
            store.save_request(record)
    except Exception as exc:  # noqa: BLE001
        print(f"Application-received email failed for {request_id}: {exc}")

    # Email 3 — missing required documents for flagged reviews
    try:
        missing_types = _find_missing_doc_types(record, flags)
        if missing_types and emailer.send_missing_docs_email(
            record, missing_doc_types=missing_types
        ):
            store.save_request(record)
    except Exception as exc:  # noqa: BLE001
        print(f"Missing-docs email failed for {request_id}: {exc}")

    if flags.get("security_flag"):
        security_report.invoke_worker_async(request_id)

    return store.response(200, record)
