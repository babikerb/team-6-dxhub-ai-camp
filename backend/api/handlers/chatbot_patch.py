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
"""

from . import security_report, store


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

    store.save_request(record)

    if flags.get("security_flag"):
        security_report.invoke_worker_async(request_id)

    return store.response(200, record)
