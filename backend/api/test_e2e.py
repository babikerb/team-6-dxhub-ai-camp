"""End-to-end handler flow against a mocked DynamoDB table (no AWS needed).

Exercises the full request-persistence pipeline:
POST /requests -> GET /requests/{id} -> GET /requests
-> PATCH /requests/{id}/chatbot -> PATCH /requests/{id}/admin
"""

import json

import boto3
import pytest
from moto import mock_aws


@pytest.fixture()
def dynamo_table(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-west-2")
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-west-2")
        dynamodb.create_table(
            TableName="SoftwareRequests",
            KeySchema=[{"AttributeName": "request_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "request_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        import handlers.store as store

        store._table = None  # force rebuild against the mocked resource
        yield


def _create(handler_module):
    return handler_module.handler(
        {
            "body": json.dumps(
                {
                    "requested_for_name": "Jane Doe",
                    "requested_for_email": "jdoe@sdsu.edu",
                    "department": "Biology",
                    "user_types": ["Faculty"],
                    "scope_of_usage": "Classroom",
                    "software_name": "Integration Test Tool",
                    "estimated_spend": 250,
                    "purchase_type": "new",
                    "funding_source": "SDSU stateside",
                    "notify_list": ["buddy@sdsu.edu"],
                }
            )
        }
    )


def test_full_pipeline(dynamo_table):
    from handlers import (
        admin_patch,
        chatbot_patch,
        create_request,
        get_request,
        list_requests,
    )

    created = _create(create_request)
    assert created["statusCode"] == 201
    record = json.loads(created["body"])
    rid = record["request_id"]
    assert record["status"] == "Submitted"
    assert record["requestor"]["software_name"] == "Integration Test Tool"
    assert record["it_review"] == {}

    fetched = get_request.handler({"pathParameters": {"id": rid}})
    assert fetched["statusCode"] == 200

    listed = list_requests.handler({"queryStringParameters": {}})
    assert listed["statusCode"] == 200
    body = json.loads(listed["body"])
    assert body["count"] >= 1
    assert any(i["request_id"] == rid for i in body["items"])

    chat = chatbot_patch.handler(
        {
            "pathParameters": {"id": rid},
            "body": json.dumps(
                {
                    "it_review": {
                        "estimated_users": "30-100",
                        "interaction_method": ["Computer", "Web browser"],
                        "software_category": "Cloud",
                        "shares_data_with_campus_system": False,
                        "integration_explanation": None,
                        "sso_capable": "true",
                        "level_1_data": False,
                        "level_1_categories": [],
                        "level_2_data": True,
                        "level_2_categories": ["FERPA"],
                        "other_data_category": None,
                        "compliance_requirements": False,
                        "compliance_note": None,
                        "vendor_privacy_policy_url": None,
                    }
                }
            ),
        }
    )
    assert chat["statusCode"] == 200
    chat_body = json.loads(chat["body"])
    assert chat_body["status"] == "ITReview"
    # Classroom scope + 30-100 users -> ATI flagged, using requestor scope
    assert chat_body["flags"]["ati_flag"] is True
    assert chat_body["flags"]["security_flag"] is True
    assert chat_body["flags"]["risk_level"] == "Medium"
    assert chat_body["flags"]["integration_flag"] is False
    # scope_of_usage must not leak into persisted it_review (frozen schema)
    assert "scope_of_usage" not in chat_body["it_review"]

    admin = admin_patch.handler(
        {
            "pathParameters": {"id": rid},
            "body": json.dumps(
                {
                    "overrides": {"ati_flag": False},
                    "override_reason": "Not needed for this class size",
                    "overridden_by": "jsmith@sdsu.edu",
                    "admin_notes": "Reviewed in camp demo",
                    "status": "AdditionalReview",
                }
            ),
        }
    )
    assert admin["statusCode"] == 200
    admin_body = json.loads(admin["body"])
    assert admin_body["status"] == "AdditionalReview"
    assert admin_body["admin"]["overrides"]["ati_flag"] is False
    assert admin_body["admin"]["overridden_by"] == "jsmith@sdsu.edu"


def test_review_completions(dynamo_table):
    from handlers import admin_patch, create_request
    import handlers.store as store

    created = _create(create_request)
    record = json.loads(created["body"])
    rid = record["request_id"]

    # New requests start with every review not yet completed.
    assert record["admin"]["review_completions"] == {
        "ati_flag": False,
        "security_flag": False,
        "integration_flag": False,
    }

    # Mark the ITSO (security) review completed; others stay untouched.
    res = admin_patch.handler(
        {
            "pathParameters": {"id": rid},
            "body": json.dumps({"review_completions": {"security_flag": True}}),
        }
    )
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["admin"]["review_completions"]["security_flag"] is True
    assert body["admin"]["review_completions"]["ati_flag"] is False

    # Unknown keys and non-boolean values are rejected.
    bad_key = admin_patch.handler(
        {
            "pathParameters": {"id": rid},
            "body": json.dumps({"review_completions": {"bogus_flag": True}}),
        }
    )
    assert bad_key["statusCode"] == 400
    bad_value = admin_patch.handler(
        {
            "pathParameters": {"id": rid},
            "body": json.dumps({"review_completions": {"ati_flag": "yes"}}),
        }
    )
    assert bad_value["statusCode"] == 400

    # Records created before review_completions existed are normalized on patch.
    legacy = store.get_request(rid)
    del legacy["admin"]["review_completions"]
    store.save_request(legacy)
    patched = admin_patch.handler(
        {
            "pathParameters": {"id": rid},
            "body": json.dumps({"review_completions": {"ati_flag": True}}),
        }
    )
    assert patched["statusCode"] == 200
    patched_body = json.loads(patched["body"])
    assert patched_body["admin"]["review_completions"] == {
        "ati_flag": True,
        "security_flag": False,
        "integration_flag": False,
    }
