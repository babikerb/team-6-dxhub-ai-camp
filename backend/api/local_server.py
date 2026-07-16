"""
Local dev server for the SoftwareRequests API.

Wraps the same Lambda-shaped handlers that will run behind API Gateway, so
this file is the ONLY thing that changes when we move from local dev to a
real deployment (see template.yaml). Handlers themselves never change.

Run:
    pip install -r requirements.txt
    python local_server.py

Then hit http://localhost:8000 -- see README.md for endpoint list + curl examples.
"""

import json
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

# Load .env before importing handlers so env vars like REVIEW_DOCS_BUCKET are set.
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import uvicorn
from fastapi import BackgroundTasks, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from handlers import (
    admin_patch,
    ati_report,
    chatbot_assist,
    chatbot_converse,
    chatbot_find_document,
    chatbot_identify,
    chatbot_match,
    chatbot_parse,
    chatbot_patch,
    create_request,
    get_request,
    get_review_docs,
    list_requests,
    reminder_check,
    review_upload,
    security_report,
)

_REMINDER_POLL_SECONDS = int(os.environ.get("REMINDER_POLL_SECONDS", "60"))
_reminder_started = False


def _reminder_loop():
    """Background poll that mirrors the EventBridge schedule in AWS."""
    # Small startup delay so the server finishes binding before first scan.
    time.sleep(5)
    while True:
        try:
            reminder_check.process_reminders()
        except Exception as exc:  # noqa: BLE001
            print(f"reminder_check loop error: {exc}")
        time.sleep(_REMINDER_POLL_SECONDS)


def _ensure_reminder_thread():
    global _reminder_started
    if _reminder_started:
        return
    _reminder_started = True
    thread = threading.Thread(target=_reminder_loop, name="reminder-check", daemon=True)
    thread.start()
    print(f"Started reminder-check thread (every {_REMINDER_POLL_SECONDS}s)")


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    _ensure_reminder_thread()
    yield


app = FastAPI(title="SoftwareRequests API (local mock)", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _to_event(request: Request, path_params: dict | None = None) -> dict:
    body_bytes = await request.body()
    return {
        "httpMethod": request.method,
        "path": request.url.path,
        "pathParameters": path_params,
        "queryStringParameters": dict(request.query_params) or None,
        "headers": dict(request.headers),
        "body": body_bytes.decode("utf-8") if body_bytes else None,
    }


def _from_lambda_response(lambda_response: dict) -> Response:
    return Response(
        content=lambda_response["body"],
        status_code=lambda_response["statusCode"],
        media_type="application/json",
    )


@app.post("/requests")
async def create_request_route(request: Request):
    event = await _to_event(request)
    return _from_lambda_response(create_request.handler(event))


@app.get("/requests")
async def list_requests_route(request: Request):
    event = await _to_event(request)
    return _from_lambda_response(list_requests.handler(event))


@app.get("/requests/{request_id}")
async def get_request_route(request: Request, request_id: str):
    event = await _to_event(request, {"id": request_id})
    return _from_lambda_response(get_request.handler(event))


@app.patch("/requests/{request_id}/chatbot")
async def chatbot_patch_route(request: Request, request_id: str, background_tasks: BackgroundTasks):
    event = await _to_event(request, {"id": request_id})
    lambda_response = chatbot_patch.handler(event)
    if lambda_response["statusCode"] == 200:
        body = json.loads(lambda_response["body"])
        if body.get("flags", {}).get("security_flag"):
            # Fire-and-forget: the requester's response returns immediately;
            # the report finishes writing to DynamoDB on its own afterward.
            background_tasks.add_task(security_report.generate_and_save, request_id)
    return _from_lambda_response(lambda_response)


@app.post("/requests/{request_id}/security-report")
async def security_report_route(request_id: str, background_tasks: BackgroundTasks):
    event = {"pathParameters": {"id": request_id}}
    lambda_response = security_report.handler(event)
    if lambda_response["statusCode"] == 202:
        # handler() marked it pending and (in real Lambda only) fired the
        # async worker invoke, which no-ops locally -- background it here
        # instead so local dev still actually completes the report.
        background_tasks.add_task(security_report.generate_and_save, request_id)
    return _from_lambda_response(lambda_response)


@app.patch("/requests/{request_id}/admin")
async def admin_patch_route(request: Request, request_id: str):
    event = await _to_event(request, {"id": request_id})
    return _from_lambda_response(admin_patch.handler(event))


@app.get("/requests/{request_id}/review-docs")
async def get_review_docs_route(request: Request, request_id: str):
    event = await _to_event(request, {"id": request_id})
    return _from_lambda_response(get_review_docs.handler(event))


@app.post("/chatbot/parse")
async def chatbot_parse_route(request: Request):
    event = await _to_event(request)
    return _from_lambda_response(chatbot_parse.handler(event))


@app.post("/chatbot/converse")
async def chatbot_converse_route(request: Request):
    event = await _to_event(request)
    return _from_lambda_response(chatbot_converse.handler(event))


@app.post("/chatbot/assist")
async def chatbot_assist_route(request: Request):
    event = await _to_event(request)
    return _from_lambda_response(chatbot_assist.handler(event))


@app.post("/chatbot/match-software")
async def chatbot_match_route(request: Request):
    event = await _to_event(request)
    return _from_lambda_response(chatbot_match.handler(event))


@app.post("/chatbot/identify-software")
async def chatbot_identify_route(request: Request):
    event = await _to_event(request)
    return _from_lambda_response(chatbot_identify.handler(event))


@app.post("/requests/{request_id}/review-docs/upload-url")
async def review_upload_url_route(request: Request, request_id: str):
    event = await _to_event(request, {"id": request_id})
    return _from_lambda_response(review_upload.upload_url_handler(event))


@app.post("/requests/{request_id}/review-docs/confirm")
async def review_upload_confirm_route(request: Request, request_id: str):
    event = await _to_event(request, {"id": request_id})
    return _from_lambda_response(review_upload.confirm_handler(event))


@app.post("/requests/{request_id}/ati-documents")
async def ati_documents_route(request_id: str):
    """Step 1 — retrieve vendor documents. Synchronous: web searches only."""
    event = {"pathParameters": {"id": request_id}}
    return _from_lambda_response(ati_report.documents_handler(event))


@app.post("/requests/{request_id}/ati-report")
async def ati_report_route(request_id: str, background_tasks: BackgroundTasks):
    """Step 2 — generate the draft review."""
    event = {"pathParameters": {"id": request_id}}
    lambda_response = ati_report.handler(event)
    if lambda_response["statusCode"] == 202:
        # handler() marked it pending and (in real Lambda only) fired the async
        # worker invoke, which no-ops locally -- background it here instead so
        # local dev actually completes the report.
        background_tasks.add_task(ati_report.generate_and_save, request_id)
    return _from_lambda_response(lambda_response)


@app.post("/chatbot/find-document")
async def chatbot_find_document_route(request: Request):
    event = await _to_event(request)
    return _from_lambda_response(chatbot_find_document.handler(event))


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/internal/reminders")
async def run_reminders():
    """Manual trigger for the reminder job (local testing / ops)."""
    return _from_lambda_response(reminder_check.handler({}))


if __name__ == "__main__":
    uvicorn.run("local_server:app", host="0.0.0.0", port=8000, reload=True)
