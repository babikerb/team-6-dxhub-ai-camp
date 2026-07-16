"""Scheduled job: send chatbot-reminder emails for stale Submitted requests.

Triggered every minute (EventBridge in AWS, background thread locally).
Looks for requests that:
  - status == "Submitted"  (chatbot not finished)
  - created_at older than REMINDER_DELAY_MINUTES (default 5)
  - notifications.reminder_sent_at / reminder_skipped_at is not set
"""

import os
from datetime import datetime, timedelta, timezone

from botocore.exceptions import ClientError

from . import emailer, store

REMINDER_DELAY_MINUTES = int(os.environ.get("REMINDER_DELAY_MINUTES", "5"))


def _parse_iso(value: str) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _reminder_done(record: dict) -> bool:
    notes = record.get("notifications") or {}
    return bool(notes.get("reminder_sent_at") or notes.get("reminder_skipped_at"))


def _skip_permanently(record: dict, reason: str) -> None:
    """Stop retrying this reminder (e.g. SES sandbox rejected the recipient)."""
    notes = emailer._notifications(record)
    notes["reminder_skipped_at"] = store.now_iso()
    notes["reminder_skip_reason"] = reason[:500]
    store.save_request(record)


def process_reminders() -> dict:
    """Scan Submitted requests and send overdue reminders. Returns a summary."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=REMINDER_DELAY_MINUTES)
    candidates = store.list_requests({"status": "Submitted"})

    checked = 0
    sent = 0
    skipped = 0
    failed = 0

    for record in candidates:
        checked += 1
        if _reminder_done(record):
            skipped += 1
            continue

        created = _parse_iso(record.get("created_at"))
        if created is None or created > cutoff:
            skipped += 1
            continue

        try:
            if emailer.send_reminder_email(record):
                store.save_request(record)
                sent += 1
                print(f"Reminder email sent for {record.get('request_id')}")
            else:
                skipped += 1
        except ClientError as exc:
            failed += 1
            code = (exc.response or {}).get("Error", {}).get("Code", "")
            msg = str(exc)
            print(f"Reminder email failed for {record.get('request_id')}: {msg}")
            # MessageRejected is permanent in SES sandbox (unverified recipient).
            if code == "MessageRejected":
                _skip_permanently(record, msg)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"Reminder email failed for {record.get('request_id')}: {exc}")

    summary = {
        "checked": checked,
        "sent": sent,
        "skipped": skipped,
        "failed": failed,
        "delay_minutes": REMINDER_DELAY_MINUTES,
    }
    print(f"reminder_check: {summary}")
    return summary


def handler(event=None, context=None):
    """Lambda / EventBridge entry point."""
    summary = process_reminders()
    return store.response(200, summary)
