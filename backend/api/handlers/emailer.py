"""SES email helpers for the software-request notification lifecycle.

Emails:
  1. Reminder          – 5 min after form submit if chatbot not finished
  2. Application received – after chatbot completion
  3. Missing documents – when LLM cannot find a required vendor doc
  4. Verdict           – Approved / Denied

Each send is idempotent: a timestamp is written under record["notifications"]
so the same email is never sent twice for a request.
"""

import os

import boto3

from . import store


AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-west-2"
SOURCE_EMAIL = os.environ.get("SES_SOURCE_EMAIL", "")
EMAILS_DISABLED = os.environ.get("EMAILS_DISABLED", "true").lower() == "true"
FRONTEND_BASE_URL = (
    os.environ.get("FRONTEND_BASE_URL") or "http://localhost:5173"
).rstrip("/")


# ── low-level send ────────────────────────────────────────────────────────────


def _send_email(to_email: str, subject: str, body: str):
    if not to_email:
        print("Email skipped: missing recipient email.")
        return False

    if EMAILS_DISABLED:
        print("\n===== EMAIL WOULD BE SENT =====")
        print("To:", to_email)
        print("Subject:", subject)
        print(body)
        print("===== END EMAIL =====\n")
        return True

    if not SOURCE_EMAIL:
        raise RuntimeError("Missing SES_SOURCE_EMAIL environment variable.")

    ses = boto3.client("ses", region_name=AWS_REGION)
    ses.send_email(
        Source=SOURCE_EMAIL,
        Destination={"ToAddresses": [to_email]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {
                "Text": {"Data": body, "Charset": "UTF-8"},
            },
        },
    )
    return True


# ── link builders ─────────────────────────────────────────────────────────────


def resume_link(request_id: str) -> str:
    return f"{FRONTEND_BASE_URL}/chatbot/{request_id}"


def tracking_link(request_id: str) -> str:
    return f"{FRONTEND_BASE_URL}/search?id={request_id}"


def upload_link(request_id: str) -> str:
    """Placeholder until a real upload page exists."""
    return f"{FRONTEND_BASE_URL}/upload/{request_id}"


# ── notifications helpers ─────────────────────────────────────────────────────


def _notifications(record: dict) -> dict:
    return record.setdefault("notifications", {})


def already_sent(record: dict, key: str) -> bool:
    return bool(_notifications(record).get(key))


def mark_sent(record: dict, key: str) -> None:
    _notifications(record)[key] = store.now_iso()


def _requestor_bits(record: dict):
    requestor = record.get("requestor") or {}
    return (
        requestor.get("requested_for_name") or "there",
        requestor.get("requested_for_email"),
        requestor.get("software_name") or "your software request",
        record.get("request_id"),
    )


def _format_submitted_at(record: dict) -> str:
    created = record.get("created_at") or ""
    if not created:
        return "unknown"
    # Keep ISO string readable; strip fractional seconds / timezone for email body.
    return created.replace("T", " ").split(".")[0].replace("+00:00", " UTC")


# ── Email 1: chatbot reminder ─────────────────────────────────────────────────


def send_reminder_email(record: dict) -> bool:
    """Remind the requester to finish the AI chatbot interview."""
    if already_sent(record, "reminder_sent_at"):
        return False

    name, to_email, software_name, request_id = _requestor_bits(record)
    subject = f"Reminder: finish your software request — {software_name}"
    body = f"""Hi {name},

You started a software request but still have steps left. Please finish the AI interview so we can process your application.

Procurement ID: {request_id}
Software: {software_name}
Submitted at: {_format_submitted_at(record)}

Resume your request here:
{resume_link(request_id)}

Thank you,
Software Request Assistant
"""
    sent = _send_email(to_email, subject, body)
    if sent:
        mark_sent(record, "reminder_sent_at")
    return sent


# ── Email 2: application received / under review ──────────────────────────────


def send_application_received_email(record: dict) -> bool:
    """Confirm the application was received and is under review."""
    if already_sent(record, "received_sent_at"):
        return False

    name, to_email, software_name, request_id = _requestor_bits(record)
    subject = f"Application received: {software_name}"
    body = f"""Hi {name},

We have received your software request. It is now under review.

Procurement ID: {request_id}
Software: {software_name}

Track your request here:
{tracking_link(request_id)}

Thank you,
Software Request Assistant
"""
    sent = _send_email(to_email, subject, body)
    if sent:
        mark_sent(record, "received_sent_at")
    return sent


# Backwards-compatible alias used by earlier branch commits.
send_ticket_received_email = send_application_received_email


# ── Email 3: missing required documents ───────────────────────────────────────


def send_missing_docs_email(record: dict, missing_docs: list[str]) -> bool:
    """Ask the requester to upload documents the LLM could not find."""
    if already_sent(record, "missing_docs_sent_at"):
        return False
    if not missing_docs:
        return False

    name, to_email, software_name, request_id = _requestor_bits(record)
    docs_list = "\n".join(f"  - {doc}" for doc in missing_docs)
    subject = f"Action needed: upload documents for {software_name}"
    body = f"""Hi {name},

We could not automatically locate one or more required review documents for your software request. Please upload them using the link below.

Procurement ID: {request_id}
Software: {software_name}

Missing document(s):
{docs_list}

Upload here:
{upload_link(request_id)}

Thank you,
Software Request Assistant
"""
    sent = _send_email(to_email, subject, body)
    if sent:
        mark_sent(record, "missing_docs_sent_at")
        _notifications(record)["missing_docs"] = list(missing_docs)
    return sent


# ── Email 4: final verdict ────────────────────────────────────────────────────


def send_verdict_email(record: dict) -> bool:
    """Notify the requester of Approved or Denied."""
    status = record.get("status")
    if status not in {"Approved", "Denied"}:
        return False
    if already_sent(record, "verdict_sent_at"):
        return False

    name, to_email, software_name, request_id = _requestor_bits(record)

    if status == "Approved":
        subject = f"Approved: {software_name}"
        outcome = (
            "Good news — your software request has been approved."
        )
    else:
        subject = f"Denied: {software_name}"
        outcome = (
            "Your software request has been denied. "
            "If you have questions, please contact your IT department."
        )

    body = f"""Hi {name},

{outcome}

Procurement ID: {request_id}
Software: {software_name}
Decision: {status}

View details here:
{tracking_link(request_id)}

Thank you,
Software Request Assistant
"""
    sent = _send_email(to_email, subject, body)
    if sent:
        mark_sent(record, "verdict_sent_at")
        _notifications(record)["verdict"] = status
    return sent
