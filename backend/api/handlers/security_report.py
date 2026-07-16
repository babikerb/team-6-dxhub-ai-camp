"""Security risk report: trigger + worker split.

Report generation fetches up to 4 documents (web searches included) and
calls Bedrock -- it can take anywhere from 5 to 90+ seconds. That's fine
locally (FastAPI has no request timeout), but two real-AWS constraints
make a single synchronous handler wrong once this is behind API Gateway:

  1. API Gateway has a HARD 29-second integration timeout that cannot be
     raised. A slow report would just come back as a Gateway Timeout.
  2. Lambda has no equivalent of FastAPI's BackgroundTasks -- once a
     handler returns and the response is sent, the execution environment
     can be frozen/reclaimed. Code "after the return" is not reliable.

So this is split into two Lambda-shaped entry points:

  handler(event, context)         -- API Gateway-facing (POST
    /requests/{id}/security-report and the automatic post-chatbot
    trigger). Marks security_review pending, asynchronously invokes the
    worker (Lambda "Event" invocation type -- fire-and-forget, no
    timeout pressure), and returns immediately. In local dev (no
    SECURITY_REPORT_WORKER_FUNCTION_NAME env var), the async invoke is a
    no-op -- local_server.py's own FastAPI BackgroundTasks does the work
    instead; see chatbot_patch_route / security_report_route there.

  worker_handler(event, context)  -- invoked only via the async Lambda
    invocation above (never through API Gateway, so no 29s limit --
    only this function's own configured Lambda timeout applies, set
    long in template.yaml). Does the actual generate_and_save().
"""

import json
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


def invoke_worker_async(request_id: str) -> None:
    """Fire-and-forget async invocation of the worker Lambda. No-ops when
    SECURITY_REPORT_WORKER_FUNCTION_NAME isn't set (local dev) -- the
    caller is responsible for backgrounding the work itself in that case
    (see local_server.py). Never raises: a failed async invoke should
    leave security_review at "pending" rather than crash the caller (the
    dashboard's "Regenerate" button still works to retry).
    """
    function_name = os.environ.get("SECURITY_REPORT_WORKER_FUNCTION_NAME")
    if not function_name:
        return
    try:
        import boto3

        boto3.client("lambda").invoke(
            FunctionName=function_name,
            InvocationType="Event",
            Payload=json.dumps({"request_id": request_id}).encode("utf-8"),
        )
    except Exception:
        pass


def handler(event, context=None):
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id:
        return store.error_response(400, "Missing request id in path")

    record = store.get_request(request_id)
    if record is None:
        return store.error_response(404, f"No request found with id {request_id}")

    record["security_review"] = {"status": "pending"}
    store.save_request(record)

    invoke_worker_async(request_id)
    return store.response(202, record)


def worker_handler(event, context=None):
    """Async-invoked only (Lambda Event invocation) -- see invoke_worker_async."""
    request_id = event.get("request_id")
    if request_id:
        generate_and_save(request_id)
    return {"statusCode": 200}
