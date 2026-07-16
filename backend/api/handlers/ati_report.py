"""Draft ATI accessibility report: document retrieval + trigger/worker split.

Deliberately mirrors handlers/security_report.py, because it has the same
shape and the same production constraint:

  1. API Gateway has a HARD 29-second integration timeout that cannot be
     raised. Generating this report fetches vendor documents AND makes a
     large Bedrock call, so it will exceed that.
  2. Lambda has no equivalent of FastAPI's BackgroundTasks -- once a handler
     returns, the execution environment can be frozen. Work "after the
     return" is not reliable.

So generation is split into an API-facing trigger that returns 202 immediately
and an async worker that does the real work. Locally there's no worker Lambda,
so local_server.py backgrounds generate_and_save itself (same as security).

Three entry points, matching the reviewer's two buttons:

  documents_handler  -- POST /requests/{id}/ati-documents
      Step 1, "Retrieve Existing Documents". Synchronous: it's a handful of
      web searches, not a Bedrock call, so it fits inside 29s. Shown to the
      reviewer before they spend a generation -- on a renewal the docs are
      usually the same as last time.

  handler            -- POST /requests/{id}/ati-report
      Step 2, "Generate Draft ATI Review". Marks pending, fires the worker,
      returns 202.

  worker_handler     -- async-invoked only. Does generate_and_save().
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

import ati_report_generator  # noqa: E402


def generate_and_save(request_id: str) -> dict | None:
    """Run the report pipeline and persist. Re-fetches the record right before
    saving so an admin edit made during the (slow) run isn't clobbered."""
    record = store.get_request(request_id)
    if record is None:
        return None

    try:
        result = ati_report_generator.generate_report(record)
        ati_review = {"status": "complete", "generated_at": store.now_iso(), **result}
    except Exception as exc:  # noqa: BLE001
        ati_review = {
            "status": "failed",
            "generated_at": store.now_iso(),
            "error": str(exc)[:500],
        }

    fresh = store.get_request(request_id) or record
    fresh["ati_review"] = ati_review
    fresh["updated_at"] = store.now_iso()
    store.save_request(fresh)
    return fresh


def invoke_worker_async(request_id: str) -> None:
    """Fire-and-forget async invoke of the worker Lambda. No-ops when
    ATI_REPORT_WORKER_FUNCTION_NAME isn't set (local dev) -- local_server.py
    backgrounds the work instead. Never raises: a failed invoke should leave
    ati_review at "pending" rather than crash the caller, since the
    Generate button can simply be pressed again."""
    function_name = os.environ.get("ATI_REPORT_WORKER_FUNCTION_NAME")
    if not function_name:
        return
    try:
        import boto3

        boto3.client("lambda").invoke(
            FunctionName=function_name,
            InvocationType="Event",
            Payload=json.dumps({"request_id": request_id}).encode("utf-8"),
        )
    except Exception:  # noqa: BLE001
        pass


def documents_handler(event, context=None):
    """Step 1 -- retrieve vendor documents. Synchronous (no Bedrock call)."""
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id:
        return store.error_response(400, "Missing request id in path")

    record = store.get_request(request_id)
    if record is None:
        return store.error_response(404, f"No request found with id {request_id}")

    try:
        result = ati_report_generator.retrieve_documents(record)
    except Exception as exc:  # noqa: BLE001
        return store.error_response(502, f"Document retrieval failed: {exc}")

    fresh = store.get_request(request_id) or record
    existing = fresh.get("ati_review") or {}
    # Keep any previously generated report; this only refreshes the documents.
    existing["documents"] = result["documents"]
    existing["documents_retrieved_at"] = store.now_iso()
    existing.setdefault("status", "documents_only")
    fresh["ati_review"] = existing
    fresh["updated_at"] = store.now_iso()
    store.save_request(fresh)
    return store.response(200, fresh)


def handler(event, context=None):
    """Step 2 -- trigger generation. Returns 202; worker does the work."""
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id:
        return store.error_response(400, "Missing request id in path")

    record = store.get_request(request_id)
    if record is None:
        return store.error_response(404, f"No request found with id {request_id}")

    prior = record.get("ati_review") or {}
    record["ati_review"] = {
        "status": "pending",
        # Don't throw away Step 1's work just because Step 2 started.
        **({"documents": prior["documents"]} if prior.get("documents") else {}),
    }
    store.save_request(record)

    invoke_worker_async(request_id)
    return store.response(202, record)


def worker_handler(event, context=None):
    """Async-invoked only (Lambda Event invocation) -- see invoke_worker_async."""
    request_id = event.get("request_id")
    if request_id:
        generate_and_save(request_id)
    return {"statusCode": 200}
