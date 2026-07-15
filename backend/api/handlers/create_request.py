"""POST /requests -- create a request from the 18-question intake form."""

from . import store

REQUIRED_FIELDS = ["software_name", "requested_for_name", "requested_for_email"]


def handler(event, context=None):
    body = store.parse_body(event)

    missing = [f for f in REQUIRED_FIELDS if not body.get(f)]
    if missing:
        return store.error_response(400, f"Missing required field(s): {', '.join(missing)}")

    request_id = store.new_request_id()
    timestamp = store.now_iso()

    record = {
        "request_id": request_id,
        "status": "Submitted",
        "created_at": timestamp,
        "updated_at": timestamp,
        "requestor": {
            "requested_for_name": body.get("requested_for_name", ""),
            "requested_for_phone": body.get("requested_for_phone", ""),
            "requested_for_email": body.get("requested_for_email", ""),
            "department": body.get("department", ""),
            "user_types": body.get("user_types", []),
            "scope_of_usage": body.get("scope_of_usage", ""),
            "software_name": body.get("software_name", ""),
            "use_description": body.get("use_description", ""),
            "vendor_website": body.get("vendor_website", ""),
            "software_term": body.get("software_term", ""),
            "estimated_spend": body.get("estimated_spend", 0),
            "purchase_type": body.get("purchase_type", ""),
            "funding_source": body.get("funding_source", ""),
            "college_division": body.get("college_division", ""),
            "existing_requisition": body.get("existing_requisition", False),
            "needs_install_help": body.get("needs_install_help", False),
            "notify_list": body.get("notify_list", []),
            "additional_details": body.get("additional_details", ""),
        },
        "it_review": {},
        "flags": {},
        "admin": {
            "overrides": {
                "ati_flag": None,
                "security_flag": None,
                "integration_flag": None,
            },
            "override_reason": "",
            "overridden_by": "",
            "admin_notes": "",
        },
    }

    store.save_request(record)
    return store.response(201, record)
