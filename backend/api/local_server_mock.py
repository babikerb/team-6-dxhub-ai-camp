"""Local dev server with NO AWS needed: an in-memory (moto) DynamoDB table
seeded with the frontend's mock requests, so /admin and /search have data
to click through immediately.

Run:
    pip install -r requirements.txt -r requirements-dev.txt
    python local_server_mock.py

Then start the frontend (cd ../../frontend && npm run dev) -- it already
points at http://localhost:8000 by default. Try a procurement ID like
bbb-002 in /search. Edits persist only while this process is running;
restarting reseeds the original mock data.
"""

import json
import os
import subprocess
import sys

os.environ.setdefault("AWS_DEFAULT_REGION", "us-west-2")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

from moto import mock_aws

mock_aws().start()

import boto3

boto3.resource("dynamodb", region_name="us-west-2").create_table(
    TableName="SoftwareRequests",
    KeySchema=[{"AttributeName": "request_id", "KeyType": "HASH"}],
    AttributeDefinitions=[{"AttributeName": "request_id", "AttributeType": "S"}],
    BillingMode="PAY_PER_REQUEST",
)

import handlers.store as store

store._table = None  # force rebuild against the mocked resource

MOCK_DATA_JS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "frontend", "src", "components", "AdminDashboard", "mockData.js",
)


def seed_mock_requests():
    """Load MOCK_REQUESTS from the frontend's mockData.js (via node) and
    write each record into the mocked table, so both apps share one dataset."""
    url = "file://" + os.path.abspath(MOCK_DATA_JS)
    dump = subprocess.run(
        ["node", "-e",
         f"import({json.dumps(url)}).then(m => process.stdout.write(JSON.stringify(m.MOCK_REQUESTS)))"],
        capture_output=True, text=True,
    )
    if dump.returncode != 0:
        sys.exit(f"Could not load mock data via node:\n{dump.stderr}")
    records = json.loads(dump.stdout)
    for record in records:
        store.save_request(record)
    print(f"Seeded {len(records)} mock requests:")
    for record in records:
        print(f"  {record['request_id']}  {record['status']:<17} {record['requestor']['software_name']}")


seed_mock_requests()

import uvicorn
from local_server import app

print("\nMock API ready on http://localhost:8000 (no AWS touched)")
uvicorn.run(app, host="127.0.0.1", port=8000)
