import os
import boto3

from . import store


AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-west-2"
SOURCE_EMAIL = os.environ.get("SES_SOURCE_EMAIL", "")
EMAILS_DISABLED = os.environ.get("EMAILS_DISABLED", "true").lower() == "true"


def _send_email(to_email: str, subject: str, body: str):
    if not to_email:
        print("Email skipped: missing recipient email.")
        return

    if EMAILS_DISABLED:
        print("\n===== EMAIL WOULD BE SENT =====")
        print("To:", to_email)
        print("Subject:", subject)
        print(body)
        print("===== END EMAIL =====\n")
        return

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


def _format_eta(days: int | None) -> str:
    if days is None:
        return "an estimate isn't available yet"
    if days <= 0:
        return "any day now"
    if days == 1:
        return "about 1 more day"
    return f"about {days} more days"


def send_ticket_received_email(record: dict):
    requestor = record.get("requestor", {})
    request_id = record.get("request_id")

    name = requestor.get("requested_for_name") or "there"
    to_email = requestor.get("requested_for_email")
    software_name = requestor.get("software_name") or "your software request"
    eta = _format_eta(store.estimate_days_remaining(record))

    subject = f"Ticket received: {software_name}"

    body = f"""Hi {name},

Your software request ticket has been received and is currently being processed.

Procurement ID: {request_id}
Software: {software_name}
Estimated wait time remaining: {eta}

Thank you,
Software Request Assistant
"""

    _send_email(to_email, subject, body)
