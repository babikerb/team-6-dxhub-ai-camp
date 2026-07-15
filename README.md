# AI-Powered Software Request Intelligence and Institutional Knowledge Assistant

## Problem Statement

San Diego State University manages software requests through a fragmented, multi-step review process that creates decentralized, siloed knowledge. Requests are treated as isolated events. Without normalized data, teams struggle to identify duplicates, prior rejections, or existing campus licenses. Critical intelligence remains trapped in comments, ServiceNow tickets, and individual memories, leading to redundant evaluations, avoidable shadow costs, and inconsistent governance. The institution needs to transition from a reactive, memory-dependent workflow to a proactive, data-driven governance model.

### Key Pain Points

1. **No public/normalized catalog**: Checking for existing software requires manual ServiceNow queries by IT staff. Requesters cannot see if their software is already approved. Leads to redundant evaluations.

2. **Institutional knowledge is fragmented**: Review outcomes and contracts sit in decentralized document repositories, spreadsheets, email, and individual memory. Previous findings, precedents, and rejections are not searchable or accessible.

3. **High-touch, repetitive interview process**: IT support specialist conducts mandatory in-person or Zoom interview to translate technical criteria into plain English and collect details. This interview must happen for every request, even similar ones.

4. **Requesters lack transparency**: People constantly follow up asking "Where is this?" because there is no visibility into which step their request is at or estimated time to completion.

5. **Autonomous decision systems not tracked**: California requires tracking of autonomous decision systems. Currently tracked after the fact rather than at intake when software is requested.

### Current Workflow

Step 1: Customer submits basic software request in ServiceNow with simple questions they can answer (software name, basic details).

Step 2: IT support specialist conducts in-person or Zoom interview with the requester. During this meeting:
- IT staff asks technical questions (translated to plain English for the requester)
- Two main goals: (1) Check if we already have a software on campus that does what they need, and guide them to it. (2) Collect detailed data to determine if the request needs further review.
- Interview responses populate a ServiceNow form with built-in thresholds that automatically flag for:
  - ATI (Accessibility Technology Initiative) review: Is this a public application with more than 100 users? Does it handle FERPA/HIPAA data?
  - Security review: Vendor risk assessment, certifications, incident history
  - Integration review: What campus systems will it integrate with? What data access is needed?
- IT staff can also manually override and flag items for review if they see risk despite threshold answers

Step 3: If no special reviews are flagged, request goes straight to procurement.

If reviews are needed:
- ATI, Security, and Integration reviews happen in parallel
- Each team evaluates independently
- Security reviews (currently assisted by custom GPTs) pull vendor documentation (HECVAT, SOC2), check for CVEs and Better Business Bureau records, and grade against CSU standards and university risk context
- Integration reviews ensure data handling and system connections are appropriate

Step 4: Procurement to Pay (P2P) involvement for purchasing approval.

Step 5: Elevated review process (conducted by Deputy CIO) for requests that stakeholders want to push through despite concerns. This is a conversation to understand business need and find resolution or alternative solutions.

Exception: If there is a Master Equipment Agreement (MEA) through Chancellor's Office, the review process is bypassed and the Chancellor's Office handles approval.

## Project Objectives

- Transform a reactive, memory-dependent software request workflow into a proactive, data-driven governance model with consistent standards
- Enable structuring of historical review outcomes and contracts into a searchable "institutional memory" that surfaces prior findings, precedents, duplicates, and existing licenses
- Improve the experience for requesters (faculty/staff) with transparency into status and alternatives, and for reviewers by automating repetitive validation
- Reduce average review cycle time, decrease redundant evaluations, and increase utilization of existing licensed software
- Leave room to enhance individual sub-processes (Security, ATI, Integration) and track California-required autonomous decision systems at intake

### Opportunity: AI-Powered Software Request Agent

The goal is to build an AI-powered agent that can enhance and accelerate this workflow by structuring historical review outcomes and contracts into a searchable institutional memory.

#### Ideal Solution Vision:

An AI-powered "Software Request Agent" that functions as an interview/chat intake plus reviewer force-multiplier, optionally interfacing with ServiceNow (via a Jira-style external workflow) with a status/metrics view.

Example scenario: A requester submits software that is already licensed on campus. The agent instantly flags the existing license or approved alternative and surfaces prior review findings, avoiding a full re-review. This addresses redundant evaluations and improves discoverability.

#### For Requesters:
- Immediate transparency showing existing licenses, campus-approved alternatives, and current status in the workflow
- Visibility into the 5 review steps and estimated time to completion to reduce follow-up traffic
- Faster turnaround time by avoiding duplicate reviews

#### For Reviewers:
- AI agent acts as a force multiplier, instantly surfacing historical findings, prior review outcomes, and relevant precedents
- Automated decision support for Security, ATI, and Integration reviews by grounding in policy documents and risk rubrics
- Reduces repetitive validation work so experts can focus on complex edge cases
- Searchable access to past approvals, rejections, and the reasoning behind them

#### Application Areas:
- Enhance the IT interview process to triage requests and identify duplicates
- Index and search prior requests, review comments, and outcomes
- Automate elements of Security, ATI, and Integration reviews using policy documents and risk rubrics
- Surface existing software and approved alternatives in real time
- Provide decision support by checking vendor risk profiles, incident history, certifications
- Generate transparency metrics and status summaries
- Support tracking of autonomous decision systems at intake
- Extensible design to enhance individual sub-processes without full rewrite

### Success Metrics

1. Reduction in average review cycle time
2. Percentage decrease in redundant software evaluations
3. Increase in utilization of existing licensed software and campus-approved alternatives
4. Improved consistency in security and ATI review outcomes

### Available Resources

- Historical ServiceNow software requests (exportable) with review comments and workflow data
- Software review records, procurement, and contract information
- Security, ATI, and Integration review outcomes and findings
- Approved software catalogs
- Institutional knowledge base articles and policy documentation
- Predefined IT interview question script and tutorial video
- Workflow diagrams and infographics
- Existing custom GPT instructions for cybersecurity risk assessment (to be shared)
- Risk rubric and one-page escalation document examples (pending confirmation)
- Subject matter experts: IT Review teams, Information Security analysts, ATI coordinators, Integration Services, Procurement staff

### Known Gaps and Constraints

- No public/normalized software catalog currently exists
- Master Equipment Agreement (MEA) data from Chancellor's Office not currently integrated
- Some integration reviews may need to remain manual
- Procurement to Pay (P2P) policy/requirements documentation pending confirmation

---

## Scope for This Build

The full vision above is large. This build targets one high-leverage slice of the workflow: **automating the IT Reviewer task** — replacing the mandatory, high-touch human interview (Step 2 of the current workflow) with a guided digital experience.

Concretely, the build delivers an end-to-end pipeline:

**Intake form → AI chatbot → automated ATI / Security / Integration flagging → admin dashboard with edit/override.**

A requester fills out a structured intake form, an AI chatbot conducts the follow-up "interview" in plain English (no IT jargon), a deterministic rules engine computes the review flags that a human reviewer would otherwise assign by hand, and IT staff review and override everything from a dashboard. This replaces the repetitive parts of the interview while keeping a human in the loop for judgment calls.

### Tech Stack

React (frontend) · Python on AWS Lambda (backend) · Amazon Bedrock / Claude (chatbot phrasing + answer parsing) · DynamoDB (storage) · API Gateway (routing) · S3 (assets / optional transcripts). Everything is serverless — no servers to manage, and independent pieces can be deployed without stepping on each other.

## Architecture Overview

```
React Form (18 questions) ──▶ API Gateway ──▶ Lambda: create-request ──▶ DynamoDB
                                                                            │
React Chatbot (Bedrock) ───▶ API Gateway ──▶ Lambda: chatbot-handler        │
                                    │                    │                   │
                                    ▼                    │ imports           │
                            Amazon Bedrock (Claude)      │                   │
                       (phrasing + answer parsing)       ▼                   │
                                            rules_engine.compute_flags()     │
                                                          │                  │
                                                          ▼                  │
                                       DynamoDB (it_review + flags, one write)

React Admin Dashboard ──▶ API Gateway ──▶ Lambda: admin-handler ──▶ DynamoDB (read + edit)
```

Key design decision: the chatbot Lambda computes the flags itself. It imports the pure-Python `rules_engine` module directly and calls `compute_flags()` right before writing to DynamoDB, so `it_review` answers and computed `flags` land in a **single write** — no separate "compute flags" round-trip.

## Data Model (frozen contract)

DynamoDB table `SoftwareRequests`, partition key `request_id` (UUID v4). The record is split into independent nested objects — `requestor`, `it_review`, `flags`, `admin` — so each part of the pipeline writes only to its own subtree, avoiding merge conflicts and race conditions.

`status` mirrors SDSU's actual review stages (see `data/Software Request Infographic.pdf`, `data/Software Request Workflow-v2.pdf`): a request moves through IT triage, then `AdditionalReview` if needed, ending in `Approved` or `Denied`. ATI, Security, and Integration review run independently and in parallel during `AdditionalReview` (not one after another), so which of them actually apply to a request is tracked by its `flags`, not by a separate status per review. Procurement (P2P) happens after this app's scope, in ServiceNow.

```jsonc
{
  "request_id": "uuid",
  "status": "Submitted | ITReview | AdditionalReview | Approved | Denied",
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
```

DynamoDB stores the **final structured answers**, not the raw chat transcript. The chatbot turns "around 50 people, mostly on their phones" into `estimated_users: "30-100"` and `interaction_method: ["Mobile"]` before anything is written. A full audit trail of raw conversations is a stretch goal (write transcripts to S3, keyed by `request_id`) — the table stays lean and holds only what reviewers need.

## API Contract

Freeze these request/response bodies early so frontend work can build against mocks before the real endpoints exist.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/requests` | POST | Create a request from the 18-question intake form |
| `/requests/{id}` | GET | Fetch a full record (used by chatbot + dashboard) |
| `/requests/{id}/chatbot` | PATCH | Submit final structured `it_review` answers. The Lambda calls `rules_engine.compute_flags()` internally and writes `it_review` + `flags` together in one update |
| `/requests` | GET | List all requests (dashboard, supports filters) |
| `/requests/{id}/admin` | PATCH | Admin dashboard edits / overrides |

## Flag Computation Logic

A deterministic, AI-free Python function: `compute_flags(it_review: dict) -> dict`. It has zero AWS dependencies so it can be imported straight into the chatbot Lambda and unit-tested locally with `pytest`.

**ATI flag** — `estimated_users` in `{"30-100", "100+"}` **and** `scope_of_usage` in `{University, College, Classroom}` → `True`.

**Security flag & risk level:**
- Any Level 1 answer (HIPAA / PII / PCI DSS / Law Enforcement) → `level_1_data = True`, `risk_level = "High"`, `security_flag = True`.
- Else any Level 2 answer (FERPA / Employee Info / Financials / Research-IP / Attorney-Client) → `level_2_data = True`, `risk_level = "Medium"`, `security_flag = True`.
- Else `risk_level = "Low"`, `security_flag = False`.

**Integration flag** — `shares_data_with_campus_system == True` → `True`.

Reason strings matter for the dashboard — always return *which* category triggered a flag (e.g. `"Level 1 data: PII, PCI DSS"`), not just `true`/`false`. IT staff can still manually recommend any review even when the computed flag is false — that path is an admin override, not a chatbot question.

## Chatbot Behavior

The chatbot is a **scripted state machine, not a free-form agent.** Bedrock/Claude is used only to (a) phrase each fixed question conversationally and (b) parse the user's free-text reply into the fixed answer options. It never surfaces internal jargon (Level 1/2, ATI, SSO) and never asks the requester staff-only judgment questions — those are computed or filled in later by a reviewer.

It walks four topics in order — Accessibility → How the software works → Login → Data & compliance. Branching lives in the script: the Level 2 data questions (FERPA, Employee Info, Financials, Research/IP, Attorney-Client) are asked **only if every Level 1 question** (HIPAA, PII, PCI DSS, Law Enforcement) came back "no."

> The exact question wording, answer buckets, branching, and flag logic live in `Chatbot_Questions_and_Flags.md` — the single source of truth for intake form questions, chatbot questions, and flag computation.

## Workstreams (Tasks)

The build breaks into independent, parallelizable tasks. Each owns its own folder so file-level conflicts are near zero.

1. **Intake Form** — `frontend/src/components/IntakeForm/`. React form for the 18 requestor questions, client-side validation, `POST /requests` on submit, then redirect to the chatbot with the returned `request_id`.

2. **Chatbot** — `frontend/src/components/Chatbot/`, `backend/chatbot/`. Chat UI (one question at a time) plus Bedrock integration for phrasing and answer parsing. Applies the Level 1/Level 2 branching, imports `compute_flags()`, and writes `it_review` + `flags` in one `PATCH /requests/{id}/chatbot`. Keep the Bedrock prompt in a separate reviewable file (`backend/chatbot/bedrock_prompt.md`) so it can be tuned without touching code.

3. **Backend API / Infrastructure** — `backend/api/`, plus API Gateway, Lambda deployment, and DynamoDB table creation. Owns the endpoints in the API contract, IAM roles (Lambda ↔ DynamoDB ↔ Bedrock ↔ S3), and wiring `compute_flags()` into the chatbot Lambda. Critical path: get a stubbed version of every endpoint live first so nothing is blocked.

4. **Rules Engine** — `backend/rules_engine/`. Pure Python, no AWS. Implements `compute_flags()` per the logic above and ships with tests covering: low-risk renewal, high-risk new software with Level 1 data, 100+ user classroom tool, integration-only case, and a Level-1-clear-but-Level-2-triggered case.

5. **Admin Dashboard** — `frontend/src/components/AdminDashboard/`. List view (`GET /requests`) with software name, requestor, status, computed flags, risk level; filter/search by status, flag type, department; detail view with full record; edit/override that requires an `override_reason` and shows the computed flag next to the override so nothing is silently overwritten (`PATCH /requests/{id}/admin`).

6. **Data & Integration Testing** — `data/`, `scripts/seed/`. Clean and load a sample of the historical ServiceNow xlsx export to seed realistic test data and validate the rules engine against real past reviewer decisions. Own end-to-end testing once the pieces are live, and log/triage bugs to the owning workstream.

## Build Order

**Phase 1 — Lock the contract, unblock everyone.** Review and freeze the data model and API contract. Stand up the DynamoDB table and stub every endpoint with mock data. Write and unit-test the rules engine. Scaffold all React components against mocked responses matching the frozen contract. Clean and sample the historical data and draft test cases.

**Phase 2 — Real integration.** Swap stubbed Lambda responses for real DynamoDB reads/writes. Bring Bedrock online so the chatbot asks real questions, applies branching, and calls `compute_flags()` before writing. Point the form and dashboard at the real endpoints. Run the first request end-to-end (form → chatbot → flags → dashboard) and log every bug.

**Phase 3 — Bug fixes and polish.** Fix integration bugs, re-run test cases end-to-end and confirm flag outputs match real historical outcomes, polish dashboard UX, and confirm endpoint stability under the full pipeline.

## Avoiding Conflicts

- Nested DynamoDB structure means each write touches only its own subtree — no two pieces of code touch the same field.
- Freezing the API contract early lets frontend work proceed against mocks and swap in real URLs later.
- The rules engine is a pure function — no AWS setup needed to build or test it.
- Separate folders per workstream keep git conflicts near zero.
- Post "endpoint X is live" / "schema field Y changed" the moment it happens — most integration pain comes from stale assumptions, not bad code.

## Stretch Goals

Only after the core pipeline works end-to-end:

- **Duplicate / catalog check** — fuzzy-match new software names against the cleaned historical dataset to flag "already licensed" cases (directly addresses redundant evaluations).
- **Security risk report generator** — adapt the SDSU Vendor Risk Review prompt into a Bedrock-powered report.
- **Requester status view** — a "step 2 of 5" progress tracker for requesters, not just admins.
- **Raw transcript audit trail** — write full chatbot conversations to S3, keyed by `request_id`.
