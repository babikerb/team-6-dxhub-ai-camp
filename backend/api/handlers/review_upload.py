"""Upload review documents to S3 — the write side of get_review_docs.py.

Reviewers need to add documents by hand: a VPAT the vendor emailed rather than
published, a HECVAT behind a login, and the final human-written review itself.
get_review_docs.py reads DataStored/<request_id>/<ReviewFolder>/; this writes to
the same place, so the existing S3 event trigger indexes uploads automatically
and no new structure is introduced.

Browser-direct upload via a presigned PUT, not a file POST through the API:
API Gateway caps request payloads at 10 MB and Lambda at 6 MB, and VPATs and
scanned policy PDFs run past that. Presigning keeps the bytes off the API
entirely.

Two calls, because a presigned PUT goes straight to S3 and the API never sees it:

    POST /requests/{id}/review-docs/upload-url
        -> {upload_url, key, filename}
        The signature covers content_type, so the browser MUST send exactly the
        same Content-Type header or S3 answers SignatureDoesNotMatch.

    POST /requests/{id}/review-docs/confirm
        Called after the PUT succeeds. Re-lists S3 and updates DynamoDB. In
        deployed AWS the S3 event trigger does this too and the two agree
        (both just re-list); locally there is no trigger, so this is what makes
        an upload show up at all.

"kind" separates the three columns of the review dashboard, which all live in
one S3 folder:
    "document"     — vendor evidence (VPAT, privacy policy...)  -> column 1
    "final_report" — the reviewer's own signed-off review        -> column 3
The final report's filename is recorded in DynamoDB
(review_docs.<type>.final_report) because S3 alone can't say which file it is.
"""

import os
import re
import sys

import boto3
from botocore.config import Config

from . import store
from .s3_event_handler import list_files

_S3_BUCKET = os.environ.get("REVIEW_DOCS_BUCKET", "")
_UPLOAD_URL_EXPIRY = int(os.environ.get("UPLOAD_URL_EXPIRY_SECONDS", "900"))  # 15 min

# Mirrors get_review_docs._REVIEW_TYPE_S3_FOLDER. Kept here rather than imported
# so a change there can't silently start writing to a folder that reads elsewhere.
_REVIEW_TYPE_S3_FOLDER = {
    "ati": "ATI",
    "itso": "ITSO",
    "integration": "Integration",
}

_KINDS = {"document", "final_report"}

# The request id is interpolated straight into an S3 key, so it has to be a uuid
# and nothing else.
_UUID_RE = re.compile(r"^[0-9a-fA-F-]{8,64}$")


def _safe_filename(name):
    """Reduce a client-supplied name to a single safe path segment.

    The filename lands in an S3 key. S3 has no ".." semantics, but it will
    happily create the literal key "DataStored/<id>/ATI/../../../evil.pdf", and
    anything later joining or normalising these keys would resolve it. Strip to
    a basename and allow only known-safe characters.
    """
    base = str(name or "").replace("\\", "/").split("/")[-1].strip()
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", base)
    base = base.lstrip(".") or "upload"
    return base[:180]


def _s3():
    # sigv4 explicitly: a presigned PUT signed with an older scheme is rejected
    # by this bucket.
    return boto3.client("s3", config=Config(signature_version="s3v4"))


def _validate(event):
    """Returns (request_id, review_key, body, error_response|None)."""
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id or not _UUID_RE.match(request_id):
        return None, None, None, store.error_response(400, "Missing or malformed request id")

    body = store.parse_body(event)
    review_key = str(body.get("review_type") or "").lower()
    if review_key not in _REVIEW_TYPE_S3_FOLDER:
        return None, None, None, store.error_response(
            400, f"review_type must be one of: {', '.join(sorted(_REVIEW_TYPE_S3_FOLDER))}"
        )
    if store.get_request(request_id) is None:
        return None, None, None, store.error_response(404, f"No request found with id {request_id}")
    return request_id, review_key, body, None


def upload_url_handler(event, context=None):
    """POST /requests/{id}/review-docs/upload-url -> presigned PUT."""
    request_id, review_key, body, err = _validate(event)
    if err:
        return err

    if not _S3_BUCKET:
        return store.error_response(500, "REVIEW_DOCS_BUCKET is not configured")

    filename = _safe_filename(body.get("filename"))
    content_type = str(body.get("content_type") or "application/octet-stream")
    kind = str(body.get("kind") or "document")
    if kind not in _KINDS:
        return store.error_response(400, f"kind must be one of: {', '.join(sorted(_KINDS))}")

    key = f"DataStored/{request_id}/{_REVIEW_TYPE_S3_FOLDER[review_key]}/{filename}"
    try:
        url = _s3().generate_presigned_url(
            "put_object",
            Params={"Bucket": _S3_BUCKET, "Key": key, "ContentType": content_type},
            ExpiresIn=_UPLOAD_URL_EXPIRY,
        )
    except Exception as exc:  # noqa: BLE001
        return store.error_response(502, f"Could not create upload URL: {exc}")

    return store.response(200, {
        "upload_url": url,
        "key": key,
        "filename": filename,
        "content_type": content_type,
        "expires_in": _UPLOAD_URL_EXPIRY,
    })


def confirm_handler(event, context=None):
    """POST /requests/{id}/review-docs/confirm — reconcile S3 into DynamoDB."""
    request_id, review_key, body, err = _validate(event)
    if err:
        return err

    kind = str(body.get("kind") or "document")
    if kind not in _KINDS:
        return store.error_response(400, f"kind must be one of: {', '.join(sorted(_KINDS))}")
    filename = _safe_filename(body.get("filename")) if body.get("filename") else None

    prefix = f"DataStored/{request_id}/{_REVIEW_TYPE_S3_FOLDER[review_key]}/"
    try:
        files = list_files(_s3(), _S3_BUCKET, prefix)
    except Exception as exc:  # noqa: BLE001
        return store.error_response(502, f"Could not list uploaded files: {exc}")

    record = store.get_request(request_id) or {}
    review_docs = record.get("review_docs") or {}
    review_docs[review_key] = {
        "status": "complete" if files else "no_docs",
        "files": files,
    }
    record["review_docs"] = review_docs

    # Which file is the final report is tracked OUTSIDE review_docs, in a
    # sibling map. s3_event_handler._update_review_docs replaces
    # review_docs.<type> wholesale ("SET review_docs.#rk = {status, files}"),
    # and it fires on every S3 upload event in deployed AWS -- so any extra key
    # stored inside that subtree is destroyed by the next upload. This would
    # have worked locally (no S3 events) and silently lost the pointer in
    # production.
    if kind == "final_report" and filename:
        final_reports = record.get("final_reports") or {}
        final_reports[review_key] = filename
        record["final_reports"] = final_reports

    record["updated_at"] = store.now_iso()
    store.save_request(record)

    return store.response(200, record)
