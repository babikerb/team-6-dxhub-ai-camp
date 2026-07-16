"""End-to-end email-flow smoke test against the local API + live SES.

Creates a mock request for rgsarswat2002@gmail.com, backdates it so the
5-minute reminder fires immediately, then drives chatbot completion and
an Approved verdict.

Usage (server must already be running on :8000):
    cd backend/api && source .venv/bin/activate
    AWS_PROFILE=sdsu-dxhub python test_email_flow.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import boto3  # noqa: E402

API = os.environ.get("API_BASE", "http://localhost:8000")
TABLE = os.environ.get("TABLE_NAME", "SoftwareRequests")
REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-west-2"
TEST_EMAIL = "rgsarswat2002@gmail.com"


def _http(method: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"{method} {path} -> {exc.code}: {detail}") from exc


def main() -> None:
    print("1) Creating mock request...")
    created = _http(
        "POST",
        "/requests",
        {
            "requested_for_name": "Rakesh Saraswat",
            "requested_for_email": TEST_EMAIL,
            "requested_for_phone": "555-0100",
            "department": "Computer Science",
            "user_types": ["Faculty"],
            "scope_of_usage": "University",
            "software_name": "Zoom Pro Test",
            "use_description": "Email notification E2E test",
            "vendor_website": "https://zoom.us",
            "software_term": "1 year",
            "estimated_spend": 100,
            "purchase_type": "New",
            "funding_source": "Department",
            "college_division": "Sciences",
        },
    )
    request_id = created["request_id"]
    print(f"   request_id = {request_id}")

    print("2) Backdating created_at by 6 minutes (simulates 5-min wait)...")
    table = boto3.resource("dynamodb", region_name=REGION).Table(TABLE)
    past = (datetime.now(timezone.utc) - timedelta(minutes=6)).isoformat()
    table.update_item(
        Key={"request_id": request_id},
        UpdateExpression="SET created_at = :c",
        ExpressionAttributeValues={":c": past},
    )

    print("3) Triggering reminder check (Email 1)...")
    summary = _http("POST", "/internal/reminders")
    print(f"   reminder summary: {summary}")

    print("4) Completing chatbot (Emails 2 + 3)...")
    patched = _http(
        "PATCH",
        f"/requests/{request_id}/chatbot",
        {
            "it_review": {
                "estimated_users": "100+",
                "level_1_categories": ["SSN"],
                "level_2_categories": [],
                "shares_data_with_campus_system": False,
                "ai_capabilities": False,
                "ai_automated_decisions": False,
            }
        },
    )
    notes = patched.get("notifications") or {}
    print(f"   status={patched.get('status')} notifications={json.dumps(notes, indent=2)}")

    print("5) Setting Approved (Email 4)...")
    verdict = _http(
        "PATCH",
        f"/requests/{request_id}/admin",
        {"status": "Approved"},
    )
    notes = verdict.get("notifications") or {}
    print(f"   status={verdict.get('status')} notifications={json.dumps(notes, indent=2)}")

    print("6) Re-patching to confirm idempotency (no duplicate emails)...")
    again = _http(
        "PATCH",
        f"/requests/{request_id}/admin",
        {"status": "Approved", "admin_notes": "idempotency check"},
    )
    print(f"   notifications unchanged: {json.dumps(again.get('notifications') or {}, indent=2)}")

    print()
    print("Done. Check inbox for", TEST_EMAIL)
    print("  Resume link:   http://localhost:5173/chatbot/" + request_id)
    print("  Tracking link: http://localhost:5173/search?id=" + request_id)
    print("  Upload link:   http://localhost:5173/upload/" + request_id)


if __name__ == "__main__":
    try:
        _http("GET", "/health")
    except Exception as exc:  # noqa: BLE001
        print(f"API not reachable at {API}: {exc}", file=sys.stderr)
        sys.exit(1)
    main()
