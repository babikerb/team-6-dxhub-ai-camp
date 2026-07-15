"""
Shared helpers for the API Lambda handlers: DynamoDB data access, response
formatting, and a temporary flags stub.

TEMPORARY: _stub_compute_flags() implements the flag logic from
Chatbot_Questions_and_Flags.md Part C so the API is fully testable end to
end today. Once Person 4 delivers backend/rules_engine/, swap the call in
chatbot_patch.py to `from rules_engine.rules_engine import compute_flags`
and delete this stub -- the input/output shape already matches.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3

_TABLE_NAME = os.environ.get("TABLE_NAME", "SoftwareRequests")
_table = None


def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(_TABLE_NAME)
    return _table


VALID_STATUSES = {
    "Submitted",
    "ChatbotInProgress",
    "FlagsComputed",
    "UnderStaffReview",
    "Approved",
    "Denied",
}

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_request_id() -> str:
    return str(uuid.uuid4())


def parse_body(event: dict) -> dict:
    raw = event.get("body") or "{}"
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return {}


def response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body),
    }


def error_response(status_code: int, message: str) -> dict:
    return response(status_code, {"error": message})


def _to_decimal(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_decimal(v) for v in obj]
    return obj


def _from_decimal(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, dict):
        return {k: _from_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_from_decimal(v) for v in obj]
    return obj


def get_request(request_id: str) -> dict | None:
    item = _get_table().get_item(Key={"request_id": request_id}).get("Item")
    return _from_decimal(item) if item else None


def save_request(record: dict) -> None:
    _get_table().put_item(Item=_to_decimal(record))


def _scan_all() -> list[dict]:
    items = []
    kwargs = {}
    while True:
        resp = _get_table().scan(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return [_from_decimal(item) for item in items]


def list_requests(filters: dict) -> list[dict]:
    items = _scan_all()

    status = filters.get("status")
    if status:
        items = [r for r in items if r.get("status") == status]

    department = filters.get("department")
    if department:
        items = [r for r in items if r.get("requestor", {}).get("department") == department]

    flag = filters.get("flag")  # e.g. "ati_flag", "security_flag", "integration_flag"
    if flag:
        items = [r for r in items if r.get("flags", {}).get(flag) is True]

    search = filters.get("search")
    if search:
        needle = search.lower()
        items = [
            r for r in items
            if needle in r.get("requestor", {}).get("software_name", "").lower()
        ]

    return items


def _stub_compute_flags(it_review: dict, scope_of_usage: str | None = None) -> dict:
    """Compute ATI / Security / Integration flags.

    scope_of_usage comes from requestor (frozen schema keeps it out of
    it_review). Callers should pass record["requestor"]["scope_of_usage"].
    """
    estimated_users = it_review.get("estimated_users")
    # Prefer requestor scope; fall back to it_review only for older callers.
    scope = scope_of_usage or it_review.get("scope_of_usage")

    ati_flag = estimated_users in {"30-100", "100+"} and scope in {
        "University", "College", "Classroom",
    }
    ati_reason = (
        f"{estimated_users} users, scope: {scope}" if ati_flag else "Below ATI thresholds"
    )

    level_1_categories = it_review.get("level_1_categories") or []
    level_2_categories = it_review.get("level_2_categories") or []

    if level_1_categories:
        risk_level = "High"
        security_flag = True
        security_reason = f"Level 1 data: {', '.join(level_1_categories)}"
    elif level_2_categories:
        risk_level = "Medium"
        security_flag = True
        security_reason = f"Level 2 data: {', '.join(level_2_categories)}"
    else:
        risk_level = "Low"
        security_flag = False
        security_reason = "No Level 1 or Level 2 data reported"

    # Must be a real boolean — bool("no") is True in Python.
    shares = it_review.get("shares_data_with_campus_system")
    if isinstance(shares, str):
        integration_flag = shares.strip().lower() in {"yes", "true", "1"}
    else:
        integration_flag = bool(shares)

    integration_reason = (
        it_review.get("integration_explanation") or "Shares data with campus systems"
        if integration_flag
        else "No campus system integration reported"
    )

    return {
        "ati_flag": ati_flag,
        "ati_flag_reason": ati_reason,
        "security_flag": security_flag,
        "security_flag_reason": security_reason,
        "integration_flag": integration_flag,
        "integration_flag_reason": integration_reason,
        "risk_level": risk_level,
    }
