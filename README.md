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

### Opportunity: AI-Powered Software Request Agent

The goal is to build an AI-powered agent that can enhance and accelerate this workflow by structuring historical review outcomes and contracts into a searchable institutional memory.

#### For Requesters:
- Immediate transparency showing existing licenses, campus-approved alternatives, and current status in the workflow
- Visibility into the 5 review steps and estimated time to completion to reduce follow-up traffic

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
