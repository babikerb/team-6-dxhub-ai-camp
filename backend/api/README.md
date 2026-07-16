# Backend API

Implements the 5 endpoints from the API Contract in `Implementation_Plan.md`.
Handlers are Lambda-shaped (`handler(event, context)` returning an API
Gateway proxy response) so the same code runs locally today and behind real
API Gateway later with no changes.

## Run locally

Requires AWS credentials with access to the `SoftwareRequests` DynamoDB
table (region `us-west-2`) -- ask a teammate for a profile, or run
`aws configure` yourself.

```
pip install -r requirements.txt
export AWS_PROFILE=<your-profile>      # PowerShell: $env:AWS_PROFILE="<your-profile>"
python local_server.py
```

Server starts at `http://localhost:8000` and reads/writes the **real**
`SoftwareRequests` DynamoDB table -- data persists across restarts and is
shared with anyone else pointing at the same table. There is no local-only
mode anymore; without valid credentials the server starts but every
request fails with a credentials error.

## Endpoints

| Endpoint | Method |
| --- | --- |
| `/requests` | POST |
| `/requests/{id}` | GET |
| `/requests` | GET (filters: `?status=`, `?department=`, `?flag=ati_flag\|security_flag\|integration_flag`, `?search=`) |
| `/requests/{id}/chatbot` | PATCH |
| `/requests/{id}/admin` | PATCH |

## curl examples

Create a request:

```
curl -X POST http://localhost:8000/requests \
  -H "Content-Type: application/json" \
  -d '{
    "requested_for_name": "Jane Doe",
    "requested_for_email": "jdoe@sdsu.edu",
    "department": "Biology",
    "software_name": "Example Tool",
    "scope_of_usage": "Classroom",
    "estimated_spend": 500
  }'
```

Copy the returned `request_id`, then fetch it:

```
curl http://localhost:8000/requests/<request_id>
```

List all requests:

```
curl http://localhost:8000/requests
curl "http://localhost:8000/requests?status=Submitted"
```

Submit chatbot answers (computes flags):

```
curl -X PATCH http://localhost:8000/requests/<request_id>/chatbot \
  -H "Content-Type: application/json" \
  -d '{
    "it_review": {
      "estimated_users": "30-100",
      "scope_of_usage": "Classroom",
      "shares_data_with_campus_system": false,
      "level_1_categories": [],
      "level_2_categories": ["FERPA"]
    }
  }'
```

Admin override:

```
curl -X PATCH http://localhost:8000/requests/<request_id>/admin \
  -H "Content-Type: application/json" \
  -d '{
    "overrides": {"security_flag": true},
    "override_reason": "Vendor has had a recent breach",
    "overridden_by": "jsmith@sdsu.edu",
    "status": "AdditionalReview"
  }'
```

## Requester evidence upload

Missing-document emails link to `/upload/<request_id>`. That page talks to:

| Endpoint | Method |
| --- | --- |
| `/requests/{id}/requester-docs/context` | GET |
| `/requests/{id}/requester-docs/upload-url` | POST |
| `/requests/{id}/requester-docs/confirm` | POST |
| `/requests/{id}/requester-docs/link` | POST |

Files are browser-PUTed straight to S3 under
`DataStored/<request_id>/<ATI|ITSO|Integration>/<doc_type>_...`.
Web links are fetched server-side (SSRF-safe) and archived the same way.
Confirm/link then regenerate the ATI or ITSO draft so the LLM re-reads the
new evidence.

### S3 CORS (required for browser PUTs)

The pre-existing review-docs bucket needs CORS allowing PUT from the frontend
origin. Apply once after deploy (adjust AllowedOrigins for Amplify):

```bash
cat > /tmp/review-docs-cors.json <<'EOF'
{
  "CORSRules": [
    {
      "AllowedOrigins": ["http://localhost:5173", "https://*"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF
aws s3api put-bucket-cors \
  --bucket dxhub-camp-2026-sdsu-software-request-and-institutional-c7fe61 \
  --cors-configuration file:///tmp/review-docs-cors.json \
  --region us-west-2
```

### S3 event notification (required for auto-indexing)

SAM cannot attach notifications to a pre-existing bucket. After deploy, wire
`S3EventFunction` to `s3:ObjectCreated:*` on prefix `DataStored/` (see
`Outputs.S3EventFunctionArn`). Confirm endpoints also re-list S3, so local
dev works without the trigger.

## Current status

- Storage: **real DynamoDB** (`handlers/store.py`, table `SoftwareRequests`
  in `us-west-2`, on-demand billing). Numbers are converted to/from
  `Decimal` automatically -- handlers just deal with plain dicts.
- Frontend wiring: Intake form `POST /requests`, chatbot
  `PATCH /requests/{id}/chatbot`, admin dashboard `GET /requests` +
  `PATCH /requests/{id}/admin`, requester upload `/upload/:id`. Point the UI
  at this API with `VITE_API_BASE_URL` (no trailing slash).
- Flags: computed by a **temporary stub** (`store._stub_compute_flags`)
  implementing the logic from `Chatbot_Questions_and_Flags.md` Part C.
  ATI scope is read from `requestor.scope_of_usage` (not duplicated on
  `it_review`). Swap for `from rules_engine.rules_engine import compute_flags`
  once Person 4 delivers `backend/rules_engine/` -- same input/output shape.
- Deployment: `template.yaml` is a ready-to-go AWS SAM template. Ask before
  running `sam deploy`, since it creates real billed AWS resources.
