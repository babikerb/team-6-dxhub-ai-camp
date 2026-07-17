**AI-Powered Software Request Intelligence and Institutional Knowledge Assistant**

An AI-powered rebuild of SDSU's software request review process — replacing a mandatory, high-touch interview with a guided digital intake, an AI chatbot, automated compliance flagging, and AI-generated risk reports, all backed by a serverless AWS pipeline.

**The Problem**

- Every software request requires a mandatory Zoom or in-person interview with IT staff to translate technical questions into plain English.
- Review findings are scattered across tickets, spreadsheets, and individual memory — nothing is searchable, so similar requests get re-reviewed from scratch.
- Requesters have no visibility into where their request stands.
- California requires tracking of AI-driven automated decision systems, but today that only happens after the fact, not at intake.

**What We Built**

Intake form → AI chatbot interview → automated ATI / Security / Integration flagging → AI-generated risk reports → reviewer dashboard.

A requester fills out a structured intake form, an AI chatbot conducts the follow-up interview in plain English (no IT jargon), and the system automatically flags the request for ATI (accessibility), Security, and Integration review using the same thresholds a human reviewer would apply. For flagged requests, an AI pipeline fetches the vendor's actual privacy policy, Terms of Service, VPAT, and HECVAT from the web and generates a risk report — and reviewers can always check, override, or attach documents themselves from a dashboard.

**Key Features**

- Guided AI chatbot intake (Amazon Bedrock) that replaces the manual reviewer interview
- Automatic ATI / Security / Integration flagging — no manual threshold-checking
- AI-generated compliance risk reports that read the vendor's actual privacy policy, ToS, VPAT, and HECVAT, auto-fetched from the web when not provided
- Reviewer dashboards for ATI, Security, and Integration teams to review evidence, upload or attach documents, and approve/override with a reason
- Automated email notifications at every stage — submission received, missing documents, reminders, final verdict
- Live status tracking so requesters can check progress without following up with IT

**Architecture**

![Architecture diagram](data/Architecture%20diagram.png)

How a request flows through the system:

1. The requester submits the intake form and AI chatbot interview through the React app (hosted on AWS Amplify).
2. Amplify calls a REST API (API Gateway), which routes to the right AWS Lambda function.
3. Lambda reads and writes request data in DynamoDB, and uses Amazon Bedrock for the chatbot's Q&A and for AI risk-report generation.
4. For flagged requests, Lambda fetches the vendor's compliance documents from the public web, generates a risk report with Bedrock, and stores supporting documents in S3.
5. Reviewers open the dashboard to review flagged requests, upload documents directly to S3, and approve or deny.
6. SES sends email notifications throughout — confirmations, reminders, missing-document alerts, and the final verdict.

**Tech Stack**

| Layer | Technology |
| --- | --- |
| Frontend | React (Vite), hosted on AWS Amplify |
| API | Amazon API Gateway |
| Compute | AWS Lambda (Python) |
| AI | Amazon Bedrock (Claude) |
| Data | Amazon DynamoDB, Amazon S3 |
| Notifications | Amazon SES, Amazon EventBridge (scheduled reminders) |

Everything is serverless — no servers to manage, and independent pieces deploy without stepping on each other.

**Getting Started**

Local development instructions live alongside each part of the app:

- [`frontend/README.md`](frontend/README.md) — running the React app locally
- [`backend/README.md`](backend/README.md) — backend overview
- [`backend/api/README.md`](backend/api/README.md) — running the API locally, endpoints
- [`backend/chatbot/README.md`](backend/chatbot/README.md) — Bedrock chatbot integration
