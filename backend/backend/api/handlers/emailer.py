import os
import boto3


AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-west-2"
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173")
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


def send_ticket_created_email(record: dict):
    requestor = record.get("requestor", {})
    request_id = record.get("request_id")

    name = requestor.get("requested_for_name") or "there"
    to_email = requestor.get("requested_for_email")
    software_name = requestor.get("software_name") or "your software request"

    continue_link = f"{FRONTEND_BASE_URL}/chatbot/{request_id}"

    subject = f"Ticket created: {software_name}"

    body = f"""Hi {name},

Your software request ticket has been created.

Ticket ID: {request_id}
Software: {software_name}

Continue the next step here:
{continue_link}

Thank you,
Software Request Assistant
"""

    _send_email(to_email, subject, body)


def send_review_results_email(record: dict):
    requestor = record.get("requestor", {})
    flags = record.get("flags", {})
    request_id = record.get("request_id")

    name = requestor.get("requested_for_name") or "there"
    to_email = requestor.get("requested_for_email")
    software_name = requestor.get("software_name") or "your software request"

    needed_reviews = []

    if flags.get("ati_flag"):
        needed_reviews.append("ATI review")

    if flags.get("integration_flag"):
        needed_reviews.append("Data integration review")

    if flags.get("security_flag"):
        needed_reviews.append("Security review")

    if needed_reviews:
        review_message = "Your request will need: " + ", ".join(needed_reviews) + "."
    else:
        review_message = "No ATI, data integration, or security review was flagged based on your answers."

    subject = f"Review result: {software_name}"

    body = f"""Hi {name},

Your chatbot review is complete.

Ticket ID: {request_id}
Software: {software_name}

{review_message}

Flag reasons:
ATI: {flags.get("ati_flag_reason", "N/A")}
Data integration: {flags.get("integration_flag_reason", "N/A")}
Security: {flags.get("security_flag_reason", "N/A")}

Thank you,
Software Request Assistant
"""

    _send_email(to_email, subject, body)
