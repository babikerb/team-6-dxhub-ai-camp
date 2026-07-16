"""Requester-facing evidence upload APIs.

Endpoints (request-id scoped; no PII in responses):
  GET  /requests/{id}/requester-docs/context
  POST /requests/{id}/requester-docs/upload-url
  POST /requests/{id}/requester-docs/confirm
  POST /requests/{id}/requester-docs/link

Files go straight to S3 via a presigned PUT (same reason as review_upload.py —
API Gateway's 10 MB payload cap). Web links are fetched server-side, archived
to S3, then indexed. After indexing, the affected ATI/ITSO draft is regenerated
asynchronously so the uploaded evidence is actually consumed by the LLMs.
"""

from __future__ import annotations

import ipaddress
import os
import re
import socket
from urllib.parse import urlparse

import boto3
from botocore.config import Config

from . import ati_report, evidence, security_report, store
from .s3_event_handler import list_files

_S3_BUCKET = os.environ.get("REVIEW_DOCS_BUCKET") or os.environ.get("DATA_BUCKET", "")
_UPLOAD_URL_EXPIRY = int(os.environ.get("UPLOAD_URL_EXPIRY_SECONDS", "900"))
_UUID_RE = re.compile(r"^[0-9a-fA-F-]{8,64}$")
_MAX_REDIRECTS = 3
_FETCH_TIMEOUT = 15.0


def _s3():
    return boto3.client("s3", config=Config(signature_version="s3v4"))


def _safe_filename(name: str) -> str:
    base = str(name or "").replace("\\", "/").split("/")[-1].strip()
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", base)
    base = base.lstrip(".") or "upload"
    return base[:160]


def _load_request(event):
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id or not _UUID_RE.match(request_id):
        return None, None, store.error_response(400, "Missing or malformed request id")
    record = store.get_request(request_id)
    if record is None:
        return None, None, store.error_response(404, f"No request found with id {request_id}")
    return request_id, record, None


def _allowed_doc_types(record: dict) -> list[str]:
    """Docs the requester may still upload: currently missing, or already
    required by flags even if fulfilled (so they can replace)."""
    flags = record.get("flags") or {}
    required = evidence.required_doc_types(flags)
    # If flags aren't computed yet (edge case), allow the full set so the page
    # can still accept a VPAT/HECVAT the email asked for.
    return required or list(evidence.DOC_TYPES.keys())


def _validate_doc_type(record: dict, doc_type: str) -> tuple[str | None, dict | None]:
    if doc_type not in evidence.DOC_TYPES:
        return None, store.error_response(
            400, f"doc_type must be one of: {', '.join(sorted(evidence.DOC_TYPES))}"
        )
    allowed = _allowed_doc_types(record)
    if doc_type not in allowed:
        return None, store.error_response(
            400, f"Document type {doc_type!r} is not required for this request"
        )
    return doc_type, None


def _extension_ok(doc_type: str, filename: str) -> bool:
    allowed = evidence.DOC_TYPES[doc_type]["extensions"]
    lower = filename.lower()
    return any(lower.endswith(ext) for ext in allowed)


def _index_evidence(
    record: dict,
    *,
    doc_type: str,
    filename: str,
    s3_key: str,
    content_type: str,
    size_bytes: int | None,
    source: str,
    source_url: str | None = None,
) -> dict:
    """Persist requester_documents + review_docs and mark the missing type fulfilled."""
    request_id = record["request_id"]
    review_type = evidence.review_type_for(doc_type)
    folder = evidence.REVIEW_TYPE_S3_FOLDER[review_type]

    requester_documents = dict(record.get("requester_documents") or {})
    requester_documents[doc_type] = {
        "doc_type": doc_type,
        "review_type": review_type,
        "s3_key": s3_key,
        "filename": filename,
        "content_type": content_type,
        "size_bytes": size_bytes,
        "source": source,
        "source_url": source_url,
        "status": "uploaded",
        "uploaded_at": store.now_iso(),
    }
    record["requester_documents"] = requester_documents

    # Keep review_docs in sync so existing admin dashboards keep working.
    prefix = f"DataStored/{request_id}/{folder}/"
    try:
        files = list_files(_s3(), _S3_BUCKET, prefix) if _S3_BUCKET else [filename]
    except Exception:  # noqa: BLE001
        files = [filename]
    if filename not in files:
        files.append(filename)

    review_docs = dict(record.get("review_docs") or {})
    review_docs[review_type] = {
        "status": "complete" if files else "no_docs",
        "files": files,
        "message": None,
    }
    record["review_docs"] = review_docs

    # Update missing-doc bookkeeping without wiping the original email audit.
    notes = record.setdefault("notifications", {})
    missing = evidence.missing_doc_types(record)
    notes["missing_doc_types"] = missing
    notes["missing_docs"] = [evidence.label_for(d) for d in missing]
    if not missing:
        notes["missing_docs_fulfilled_at"] = store.now_iso()

    record["updated_at"] = store.now_iso()
    store.save_request(record)
    return record


def _trigger_affected_review(record: dict, doc_type: str) -> None:
    """Kick ATI / ITSO regeneration so the LLM re-reads the new evidence."""
    request_id = record["request_id"]
    review_type = evidence.review_type_for(doc_type)
    try:
        if review_type == "ati":
            prior = record.get("ati_review") or {}
            record["ati_review"] = {
                "status": "pending",
                **({"documents": prior["documents"]} if prior.get("documents") else {}),
            }
            store.save_request(record)
            ati_report.invoke_worker_async(request_id)
        elif review_type == "itso":
            record["security_review"] = {"status": "pending"}
            store.save_request(record)
            security_report.invoke_worker_async(request_id)
        # Integration has no LLM generator today — evidence is for human review.
    except Exception as exc:  # noqa: BLE001
        print(f"Auto-regenerate after upload failed for {request_id}/{doc_type}: {exc}")


# ── GET context ───────────────────────────────────────────────────────────────


def context_handler(event, context=None):
    """GET /requests/{id}/requester-docs/context — no PII."""
    request_id, record, err = _load_request(event)
    if err:
        return err

    flags = record.get("flags") or {}
    required = evidence.required_doc_types(flags)
    fulfilled = evidence.fulfilled_doc_types(record)
    docs = []
    for doc_type in required or list(evidence.DOC_TYPES.keys()):
        entry = (record.get("requester_documents") or {}).get(doc_type) or {}
        docs.append({
            "doc_type": doc_type,
            "label": evidence.label_for(doc_type),
            "review_type": evidence.review_type_for(doc_type),
            "required": doc_type in required if required else True,
            "fulfilled": doc_type in fulfilled,
            "filename": entry.get("filename"),
            "source": entry.get("source"),
            "source_url": entry.get("source_url"),
            "uploaded_at": entry.get("uploaded_at"),
        })

    return store.response(200, {
        "request_id": request_id,
        "software_name": (record.get("requestor") or {}).get("software_name") or "",
        "status": record.get("status"),
        "documents": docs,
        "max_upload_bytes": evidence.MAX_UPLOAD_BYTES,
    })


# ── POST upload-url ───────────────────────────────────────────────────────────


def upload_url_handler(event, context=None):
    """POST /requests/{id}/requester-docs/upload-url -> presigned PUT."""
    request_id, record, err = _load_request(event)
    if err:
        return err
    if not _S3_BUCKET:
        return store.error_response(500, "REVIEW_DOCS_BUCKET is not configured")

    body = store.parse_body(event)
    doc_type, err = _validate_doc_type(record, str(body.get("doc_type") or "").strip())
    if err:
        return err

    original = _safe_filename(body.get("filename"))
    if not _extension_ok(doc_type, original):
        allowed = ", ".join(evidence.DOC_TYPES[doc_type]["extensions"])
        return store.error_response(400, f"Unsupported file type for {doc_type}. Allowed: {allowed}")

    content_type = str(body.get("content_type") or "application/octet-stream").strip()
    if content_type and content_type not in evidence.ALLOWED_MIME_TYPES:
        return store.error_response(400, f"Unsupported content_type: {content_type}")

    filename = evidence.evidence_filename(doc_type, original)
    folder = evidence.s3_folder_for(doc_type)
    key = f"DataStored/{request_id}/{folder}/{filename}"

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
        "doc_type": doc_type,
        "review_type": evidence.review_type_for(doc_type),
        "content_type": content_type,
        "expires_in": _UPLOAD_URL_EXPIRY,
        "max_upload_bytes": evidence.MAX_UPLOAD_BYTES,
    })


# ── POST confirm ──────────────────────────────────────────────────────────────


def confirm_handler(event, context=None):
    """POST /requests/{id}/requester-docs/confirm — verify S3 object + index."""
    request_id, record, err = _load_request(event)
    if err:
        return err
    if not _S3_BUCKET:
        return store.error_response(500, "REVIEW_DOCS_BUCKET is not configured")

    body = store.parse_body(event)
    doc_type, err = _validate_doc_type(record, str(body.get("doc_type") or "").strip())
    if err:
        return err

    filename = _safe_filename(body.get("filename"))
    if not filename.startswith(f"{doc_type}_") and not filename.startswith(f"{doc_type}."):
        filename = evidence.evidence_filename(doc_type, filename)

    folder = evidence.s3_folder_for(doc_type)
    key = f"DataStored/{request_id}/{folder}/{filename}"

    try:
        head = _s3().head_object(Bucket=_S3_BUCKET, Key=key)
    except Exception:  # noqa: BLE001
        return store.error_response(400, f"Uploaded object not found at {key}")

    size = int(head.get("ContentLength") or 0)
    if size <= 0:
        return store.error_response(400, "Uploaded object is empty")
    if size > evidence.MAX_UPLOAD_BYTES:
        return store.error_response(400, f"File exceeds {evidence.MAX_UPLOAD_BYTES} byte limit")

    content_type = head.get("ContentType") or str(body.get("content_type") or "application/octet-stream")
    record = _index_evidence(
        record,
        doc_type=doc_type,
        filename=filename,
        s3_key=key,
        content_type=content_type,
        size_bytes=size,
        source="requester_upload",
    )
    _trigger_affected_review(record, doc_type)

    # Return a limited payload — never leak full admin/contact records.
    return store.response(200, {
        "request_id": request_id,
        "doc_type": doc_type,
        "filename": filename,
        "s3_key": key,
        "status": "uploaded",
        "missing_doc_types": evidence.missing_doc_types(record),
    })


# ── POST link (server-side fetch + archive) ───────────────────────────────────


def _is_public_ip(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return False
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return False
    return True


def _safe_fetch(url: str) -> tuple[bytes | None, str | None, str | None]:
    """Fetch a public HTTP(S) URL with SSRF protections. Returns
    (raw_bytes, content_type, error_message)."""
    import httpx

    current = url.strip()
    for _ in range(_MAX_REDIRECTS + 1):
        parsed = urlparse(current)
        if parsed.scheme not in {"http", "https"}:
            return None, None, "URL must start with http:// or https://"
        if not parsed.hostname:
            return None, None, "URL is missing a hostname"
        if parsed.username or parsed.password:
            return None, None, "URLs with credentials are not allowed"
        if not _is_public_ip(parsed.hostname):
            return None, None, "URL resolves to a non-public address"

        try:
            with httpx.Client(
                follow_redirects=False,
                timeout=_FETCH_TIMEOUT,
                headers={"User-Agent": "SDSU-SoftwareRequest-Uploader/1.0"},
            ) as client:
                resp = client.get(current)
        except Exception as exc:  # noqa: BLE001
            return None, None, f"Could not fetch URL: {exc}"

        if resp.status_code in {301, 302, 303, 307, 308}:
            location = resp.headers.get("Location")
            if not location:
                return None, None, "Redirect without Location header"
            # Resolve relative redirects against the current URL.
            from urllib.parse import urljoin

            current = urljoin(current, location)
            continue

        if resp.status_code >= 400:
            return None, None, f"URL returned HTTP {resp.status_code}"

        content_type = (resp.headers.get("content-type") or "application/octet-stream").split(";")[0].strip()
        raw = resp.content
        if len(raw) > evidence.MAX_UPLOAD_BYTES:
            return None, None, f"Remote file exceeds {evidence.MAX_UPLOAD_BYTES} byte limit"
        if not raw:
            return None, None, "Remote file is empty"
        # Soft MIME check — allow octet-stream / missing; reject clearly unsafe types.
        if content_type and content_type not in evidence.ALLOWED_MIME_TYPES and not content_type.startswith("text/"):
            return None, None, f"Unsupported remote content type: {content_type}"
        return raw, content_type, None

    return None, None, "Too many redirects"


def link_handler(event, context=None):
    """POST /requests/{id}/requester-docs/link — fetch URL, archive, index."""
    request_id, record, err = _load_request(event)
    if err:
        return err
    if not _S3_BUCKET:
        return store.error_response(500, "REVIEW_DOCS_BUCKET is not configured")

    body = store.parse_body(event)
    doc_type, err = _validate_doc_type(record, str(body.get("doc_type") or "").strip())
    if err:
        return err

    url = str(body.get("url") or "").strip()
    if not url:
        return store.error_response(400, "Body must include a non-empty 'url'")

    raw, content_type, fetch_err = _safe_fetch(url)
    if fetch_err:
        return store.error_response(400, fetch_err)

    # Derive a filename from the URL path / host, then prefix with doc_type.
    parsed_url = urlparse(url)
    path_name = parsed_url.path.rsplit("/", 1)[-1]
    if not path_name or "." not in path_name:
        host_stem = (parsed_url.hostname or "document").split(".")[0]
        if "pdf" in (content_type or ""):
            ext = "pdf"
        elif "html" in (content_type or "") or "text/" in (content_type or ""):
            ext = "html"
        else:
            ext = "bin"
        path_name = f"{host_stem}.{ext}"
    filename = evidence.evidence_filename(doc_type, _safe_filename(path_name))
    folder = evidence.s3_folder_for(doc_type)
    key = f"DataStored/{request_id}/{folder}/{filename}"

    try:
        _s3().put_object(
            Bucket=_S3_BUCKET,
            Key=key,
            Body=raw,
            ContentType=content_type or "application/octet-stream",
            Metadata={"source-url": url[:1024], "uploaded-by": "requester"},
        )
    except Exception as exc:  # noqa: BLE001
        return store.error_response(502, f"Could not archive document to S3: {exc}")

    record = _index_evidence(
        record,
        doc_type=doc_type,
        filename=filename,
        s3_key=key,
        content_type=content_type or "application/octet-stream",
        size_bytes=len(raw),
        source="requester_link",
        source_url=url,
    )
    _trigger_affected_review(record, doc_type)

    return store.response(200, {
        "request_id": request_id,
        "doc_type": doc_type,
        "filename": filename,
        "s3_key": key,
        "source_url": url,
        "status": "uploaded",
        "missing_doc_types": evidence.missing_doc_types(record),
    })
