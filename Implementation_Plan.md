AI-Powered Software Request IT Reviewer Assistant
Implementation Plan — SDSU Challenge
Scope for this build: Automate the IT Reviewer task — intake form → AI chatbot → automated ATI/Security/Integration flagging → admin dashboard with edit capability.

Stack: React (frontend) · Python (Lambda) · Amazon Bedrock (Claude) · DynamoDB · API Gateway · S3

1. Architecture Overview
React Form (18 questions) ──▶ API Gateway ──▶ Lambda: create-request ──▶ DynamoDB
                                                                              │
React Chatbot (Bedrock) ───▶ API Gateway ──▶ Lambda: chatbot-handler
                                    │                    │
                                    ▼                    │ imports
                            Amazon Bedrock (Claude)       │
                       (phrasing + answer parsing)        ▼
                                             rules_engine.compute_flags()
                                                           │
                                                           ▼
                                            DynamoDB (it_review + flags, one write)

React Admin Dashboard ──▶ API Gateway ──▶ Lambda: admin-handler ──▶ DynamoDB (read + edit)
The chatbot Lambda does the calculating itself — it imports Person 4’s rules_engine module directly and calls compute_flags() right before it writes to DynamoDB, so it_review and flags land in the same write. No separate “compute flags” round-trip.

Everything is serverless. No servers to manage, easy for 6 people to deploy independent pieces without stepping on each other.

2. Data Model (frozen contract — do not change without telling the team)
DynamoDB Table: SoftwareRequests
Partition key: request_id (string, UUID v4)

{
  "request_id": "uuid",
  "status": "Submitted | ChatbotInProgress | FlagsComputed | UnderStaffReview | Approved | Denied",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",

  "requestor": {
    "requested_for_name": "string",
    "requested_for_phone": "string",
    "requested_for_email": "string",
    "department": "string",
    "user_types": ["Student","Faculty","Staff","Public"],
    "scope_of_usage": "University | College | Department | Classroom | Individual | Research Lab | Public",
    "software_name": "string",
    "use_description": "string",
    "vendor_website": "string",
    "software_term": "Monthly | 6mo or fewer | 1yr | 2yr | 3yr | 4yr | 5yr+",
    "estimated_spend": "number",
    "purchase_type": "renewal | new",
    "funding_source": "SDSU stateside | SDSU Research Foundation",
    "college_division": "string",
    "existing_requisition": "boolean",
    "needs_install_help": "boolean",
    "notify_list": ["string"],
    "additional_details": "string"
  },

  "it_review": {
    "estimated_users": "1-30 | 30-100 | 100+",
    "interaction_method": ["Computer","Mobile","Web browser","Not sure"],
    "software_category": "On-prem Data Center | On-prem Local | Cloud | Add-on/Plugin",
    "shares_data_with_campus_system": "boolean",
    "integration_explanation": "string | null",
    "sso_capable": "true | false | not_sure",
    "level_1_data": "boolean",
    "level_1_categories": ["HIPAA","PII","PCI DSS","GLBA","Law Enforcement Records"],
    "level_2_data": "boolean",
    "level_2_categories": ["FERPA","Employee Information","Financials","Research/IP","Attorney-Client"],
    "other_data_category": "string | null",
    "compliance_requirements": "boolean",
    "compliance_note": "string | null",
    "vendor_privacy_policy_url": "string | null"
  },

  "flags": {
    "ati_flag": "boolean",
    "ati_flag_reason": "string",
    "security_flag": "boolean",
    "security_flag_reason": "string",
    "integration_flag": "boolean",
    "integration_flag_reason": "string",
    "risk_level": "Low | Medium | High"
  },

  "admin": {
    "overrides": {
      "ati_flag": "boolean | null",
      "security_flag": "boolean | null",
      "integration_flag": "boolean | null"
    },
    "override_reason": "string",
    "overridden_by": "string",
    "admin_notes": "string"
  }
}
Why this shape: requestor / it_review / flags / admin are separate nested objects so each person’s Lambda only ever writes to its own section — no two people touch the same field, which avoids merge conflicts and race conditions when writing to DynamoDB.

Why it_review only has these fields: DynamoDB stores the final, structured answer for each question in the reference doc (Part B) — not the raw back-and-forth conversation with Bedrock. The chatbot’s job is to turn “around 50 people, mostly on their phones” into estimated_users: "30-100" and interaction_method: ["Mobile"] before it ever writes anything. If the team wants a full audit trail of the raw chat later, that’s a stretch goal writing transcripts to S3 (keyed by request_id) — DynamoDB stays lean and only holds what staff actually need to review a request.

API Contract (freeze this by end of Day 1)
Endpoint    Method    Owner    Purpose
/requests    POST    Person 3    Create request from the 18-question form
/requests/{id}    GET    Person 3    Fetch full record (used by chatbot + dashboard)
/requests/{id}/chatbot    PATCH    Person 3 (Lambda) + Person 2 (calling code)    Chatbot submits final structured it_review answers. The Lambda calls rules_engine.compute_flags() internally and writes it_review + flags together in one update — no separate flag-computation call.
/requests    GET    Person 3    List all requests (dashboard, supports filters)
/requests/{id}/admin    PATCH    Person 3    Admin dashboard edits/overrides
All Lambdas are owned/deployed by Person 3 (Backend/API), but the request/response JSON bodies above are frozen so everyone else can build against them immediately using mock data before the real endpoints exist.

3. Team Assignments (6 people, independent workstreams)
Person 1 — Intake Form (Frontend)
Owns: /frontend/src/components/IntakeForm/

Build the React form covering the 18 requestor questions exactly as listed in the questions doc (name, phone, email, department, user types, scope, software name, description, vendor site, term, spend, renewal/new, funding source, college/division, existing requisition, install help, notify list, additional details).
Client-side validation (required fields, email format, spend as number).
On submit: POST /requests with the requestor object, receive request_id, redirect to /chatbot/{request_id}.
Can start immediately — build against a mocked API response, swap in the real endpoint once Person 3 has it live.
Person 2 — Chatbot (Frontend + Bedrock integration)
Owns: /frontend/src/components/Chatbot/, /backend/chatbot/

Build the chat UI: one question at a time, following exactly the plain-English question list in Chatbot_Questions_and_Flags.md, Part B (Accessibility → How the software works → Login → Data & compliance).
Important: this is a scripted state machine, not a free-form agent. Bedrock/Claude is used only to (a) phrase each question conversationally and (b) parse the user’s free-text reply into the fixed answer options (e.g. map “around 50 people” → estimated_users: "30-100").
Branching logic lives in the chatbot flow itself: Data & compliance Block B (FERPA, Employee Info, Financials, Research/IP, Attorney-Client) is only asked if every Block A question (HIPAA, PII, PCI DSS, Law Enforcement) came back “no.” This skip logic is part of the conversation script, not something the rules engine decides after the fact.
Do NOT ask the requester the staff-only judgment questions (e.g. “IT reviewer recommends ATI review”) — those are computed, not asked. See Chatbot_Questions_and_Flags.md, Part D.
Calculates, not just collects: once all answers are gathered, import Person 4’s rules_engine.compute_flags() module directly into the chatbot Lambda and call it before writing to DynamoDB — see Part C of the reference doc for the exact logic. it_review and flags get written together in a single PATCH /requests/{id}/chatbot call.
Write the Bedrock prompt as a separate, reviewable file (/backend/chatbot/bedrock_prompt.md) so the team can tune it without touching code.
Person 3 — Backend API / Infrastructure Plumbing
Owns: /backend/api/, API Gateway + Lambda deployment, DynamoDB table creation

Stand up the DynamoDB table using the slimmed-down schema above (structured fields only — no raw chat transcripts).
Build and deploy all Lambda functions in the API Contract table, including wiring Person 4’s rules_engine module into the chatbot Lambda so flags get computed and written in the same request.
Own IAM roles/permissions (Lambda ↔ DynamoDB ↔ Bedrock ↔ S3).
This is the critical-path role — prioritize getting a bare-bones version of every endpoint live on Day 1 (even returning mock data) so Persons 1, 2, and 5 are never blocked.
Publish the live API base URL + Postman/curl examples to the team as soon as each endpoint works.
Person 4 — Rules Engine (pure Python, no AI)
Owns: /backend/rules_engine/

Deterministic Python module: given an it_review object, return the flags object. Deliver it as a plain, importable function — compute_flags(it_review: dict) -> dict — with zero AWS dependencies, so Person 2 can import it straight into the chatbot Lambda and Person 4 can unit-test it locally with plain pytest, completely independently.
Encode exactly the logic in Chatbot_Questions_and_Flags.md, Part C:
ATI flag: estimated_users in {"30-100","100+"} AND scope_of_usage in {University, College, Classroom} → True.
Security flag / risk level: any Block A answer (HIPAA/PII/PCI DSS/Law Enforcement) → level_1_data=True, risk High. Else any Block B answer (FERPA/Employee/Financials/Research-IP/Attorney-Client) → level_2_data=True, risk Medium. Else risk Low. Medium or High → security_flag = True.
Integration flag: shares_data_with_campus_system == True → True.
Reason strings matter for the admin dashboard — always return which category triggered the flag (e.g. "Level 1 data: PII, PCI DSS"), not just true/false.
Deliver test cases covering: low-risk renewal, high-risk new software with Level 1 data, 100+ user classroom tool, integration-only case, and a case where Block A is all “no” but Block B triggers Medium risk.
Person 5 — Admin Dashboard (Frontend, with edit)
Owns: /frontend/src/components/AdminDashboard/

List view: GET /requests — table of all requests with columns for software name, requestor, status, computed flags, risk level.
Filter/search by status, flag type, department.
Detail view: click a row → full record (requestor answers, IT review answers, computed flags with reasons).
Edit/override capability: staff can toggle ati_flag / security_flag / integration_flag and must enter an override_reason — call PATCH /requests/{id}/admin. Show computed flag and override side by side so it’s clear an override happened (don’t silently overwrite).
Can build against mocked list/detail data immediately.
Person 6 — Data & Integration Testing
Owns: /data/, /scripts/seed/, end-to-end testing

Clean and load a sample of the real historical xlsx (from ServiceNow export) into a reference file — used to seed realistic test data and validate the rules engine against real historical outcomes (does your rules engine’s output match what the real reviewers actually decided on past tickets?).
Own end-to-end integration testing once Persons 1-5 have working pieces — run a request all the way through form → chatbot → flags → dashboard.
Log and triage bugs found during integration, routing each one to the person who owns that piece.
Build a small set of realistic test cases (one clean/low-risk, one high-risk with Level 1 data, one multi-flag case) using the scenarios in Chatbot_Questions_and_Flags.md, Part C, to test every piece against.
4. Build Order (single day, no calendar — just sequence)
The team moves through three back-to-back phases. Nobody needs to fully finish a phase before starting the next one on their own piece — but the contract-freeze step at the start of Phase 1 has to happen before anyone writes real integration code.

Phase 1 — Lock the contract, unblock everyone
All: Review and lock the data model/API contract in Sections 2-3. Raise any disagreement now — it’s frozen the moment Phase 2 starts.
Person 3: DynamoDB table live, all Lambda endpoints deployed (stubbed with mock data is fine to start).
Person 4: Rules engine function written and unit-tested locally.
Person 1, 2, 5: Scaffold React components, build against mocked responses matching the frozen contract.
Person 6: Historical data cleaned and sampled; test cases drafted.
Nobody should be blocked waiting on someone else during this phase — everyone builds against the frozen contract with mock data.

Phase 2 — Real integration
Person 3: Swap mock Lambda responses for real DynamoDB reads/writes.
Person 2: Bedrock integration live, chatbot asking real questions, applying Block A/B branching logic, calling Person 4’s compute_flags() before writing.
Person 4: Rules engine handed off and confirmed working inside Person 2’s chatbot Lambda (imported directly, not a separate call).
Person 1: Form submitting to real /requests endpoint.
Person 5: Dashboard reading real data, edit/override wired to real PATCH endpoint.
Person 6: First end-to-end run — file a request through the whole pipeline, log every bug found and route it to the owner.
Phase 3 — Bug fixes and polish
All: Fix bugs surfaced in Phase 2 integration.
Person 6: Re-run the test cases end-to-end, confirm flag outputs make sense against real historical outcomes.
Person 5: Polish dashboard UI/UX.
Person 3: Confirm all endpoints are stable under the full pipeline running end-to-end.
5. How to avoid conflicts
Nested DynamoDB object structure (Section 2) means each Lambda writes to its own subtree — no two people’s code touches the same field.
API contract frozen on Day 1 means frontend people (1, 2, 5) never need to wait on backend (3) — build against mocks, swap the URL later.
Rules engine is a pure function (Person 4) — no AWS setup needed to develop or test it; hand it to Person 2 as a plain Python file to import directly into the chatbot Lambda. Person 4 never needs to touch AWS at all.
DynamoDB stays lean — only structured, review-relevant fields get written (Section 2). This keeps the admin dashboard fast and simple since there’s no raw conversation data to filter through.
Separate folders per person (see “Owns” above) — almost zero file-level git conflicts if everyone stays in their folder.
Use a shared #dev-updates Slack/Discord channel: post “endpoint X is live” or “schema field Y changed” the moment it happens — most integration pain comes from stale assumptions, not bad code.
6. Stretch goals (only if the core pipeline is done with time to spare)
Duplicate/catalog check: fuzzy-match new software name against the historical dataset (Person 6’s cleaned data) to flag “already licensed” cases.
Adapt the SDSU Vendor Risk Review Prompt into a Bedrock-powered security risk report generator.
Status-tracking view for requesters (not just admins) showing “step 2 of 5.”
