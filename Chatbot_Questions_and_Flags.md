# Software Request Assistant — Questions, Answers & Flag Logic Reference

This is the single source of truth for what gets asked, in what order, and how each answer turns into a computed flag. The intake form, the chatbot, and the rules engine should all build directly from this document.

## Part A — Intake Form (React form, 18 questions)

These are asked exactly as written — no translation needed. This is what the requester fills out before the chatbot starts.

| # | Question | Answer type | Field |
| --- | --- | --- | --- |
| 1 | Who is this software requested on behalf of? | text | `requested_for_name` |
| 2 | What is their phone number? | text | `requested_for_phone` |
| 3 | What is their email address? | text | `requested_for_email` |
| 4 | What department are they in? | text | `department` |
| 5 | Who will use this software? (Student, Faculty, Staff, Public) | multi-select | `user_types` |
| 6 | Scope of usage (University/campus-wide, College/School, Department/Office, Classroom, Individual, Research Lab/Project, Public) | single-select | `scope_of_usage` |
| 7 | Requested software name | text | `software_name` |
| 8 | What will the technology be used for? Brief explanation. | text | `use_description` |
| 9 | Enter the vendor's website | text/URL | `vendor_website` |
| 10 | Software term (Monthly, 6mo or fewer, 1yr, 2yr, 3yr, 4yr, 5yr+) | single-select | `software_term` |
| 11 | Estimated total spend for the software term | number | `estimated_spend` |
| 12 | Is this a renewal or new purchase? | single-select | `purchase_type` |
| 13 | What is the funding source? (SDSU stateside / SDSU Research Foundation) | single-select | `funding_source` |
| 14 | What College/Division will be procuring the software? | single-select | `college_division` |
| 15 | Is there already a requisition for this software? | yes/no | `existing_requisition` |
| 16 | Do you need help with installation? | yes/no | `needs_install_help` |
| 17 | Who else should be notified about the progress of this request? | multi-select (people) | `notify_list` |
| 18 | Additional details / supporting documentation (e.g. vendor quote) | text/file | `additional_details` |

Submitting this form creates the record (`POST /requests`) and generates `request_id`, which the chatbot uses for every subsequent write.

## Part B — Chatbot Questions (plain-English translation)

The chatbot never surfaces internal jargon (Level 1/2, ATI, SSO, PL1/PL2) or asks the requester to make a judgment call reserved for staff. It asks concrete, plain questions and the rules engine (Part C) does the interpretation.

### B1. Accessibility

| Ask | Answer type | Sets |
| --- | --- | --- |
| Roughly how many people, total, will use this software? | number | `estimated_users` (bucketed: 1-30 / 30-100 / 100+) |
| Will people mainly use it on a computer, a phone or tablet, through a web browser, or a mix? | multi-select | `interaction_method` |

### B2. How the software works

| Ask | Answer type | Sets |
| --- | --- | --- |
| Where does this software actually run — installed by IT on a campus server, installed on your own computer, something you log into online (a website/cloud app), or a small add-on inside another app you already use? | single-select | `software_category` |
| Will this software need to send or receive information with any other SDSU system, like Canvas, Oracle, or PeopleSoft/mySDSU? | yes/no | `shares_data_with_campus_system` |
| (if yes) Which system(s), and what kind of information would be shared? | text | `integration_explanation` |

### B3. Login

| Ask | Answer type | Sets |
| --- | --- | --- |
| Can people log in with their regular SDSUid (same login as other campus systems), or does it use a separate username/password? | yes / no / not sure | `sso_capable` |

### B4. Data & compliance

**Block A** — check first, any "yes" here sets High risk:

| Ask | Sets if yes |
| --- | --- |
| Will it handle health or medical information — the kind a doctor's office or student health center would keep? | `level_1_data = true` (HIPAA) |
| Will it store personal ID details like Social Security numbers, driver's license numbers, or dates of birth? | `level_1_data = true` (PII) |
| Will it process credit card payments or store banking/payment information? | `level_1_data = true` (PCI DSS / GLBA) |
| Will it store or access law enforcement or campus police records? | `level_1_data = true` (Law Enforcement Records) |

**Block B** — only asked if Block A was all "no":

| Ask | Sets if yes |
| --- | --- |
| Will students use this for coursework, grading, or advising? | `level_2_data = true` (FERPA) |
| Will it store employee info — personnel files, salaries, performance reviews? | `level_2_data = true` (Employee Information) |
| Will it access campus budgets or internal financial records (not card payments)? | `level_2_data = true` (Financials) |
| Will it involve research data or IP — unpublished research, patents, grant data? | `level_2_data = true` (Research/IP) |
| Will it involve communication with SDSU's legal counsel? | `level_2_data = true` (Attorney-client) |

**Catch-alls** — always asked:

| Ask | Answer type | Sets |
| --- | --- | --- |
| Is there any other sensitive information this software touches that we haven't covered? | text | `other_data_category` |
| Is this tied to a research grant, an international privacy rule, or any other legal/contractual requirement you know of? | text | `compliance_requirements = true` + note |
| Do you have a link to the vendor's privacy policy? (Paste it, or say "not sure.") | text/URL | `vendor_privacy_policy_url` |

## Part C — Flag Computation Logic (pure Python, no AI)

This runs once the chatbot finishes, via `compute_flags(it_review) -> flags`.

### ATI flag

```python
ati_flag = (
    estimated_users in ["30-100", "100+"]
    and scope_of_usage in ["University", "College", "Classroom"]
)
ati_flag_reason = f"{estimated_users} users, {scope_of_usage} scope"
```

Note: IT staff can still manually recommend an ATI review even when this is false — that's an admin override, not a chatbot question.

### Security flag & risk level

```python
if any(Block A answers) == yes:
    level_1_data = true
    risk_level = "High"
    security_flag = true
    security_flag_reason = "Level 1 data: " + [triggered categories]

elif any(Block B answers) == yes:
    level_2_data = true
    risk_level = "Medium"
    security_flag = true
    security_flag_reason = "Level 2 data: " + [triggered categories]

else:
    risk_level = "Low"
    security_flag = false
    security_flag_reason = "No Level 1 or Level 2 data identified"
```

Note: IT staff can still manually recommend a security review even at Low risk (e.g. brand-new-to-campus software) — that's an admin override, not computed here.

### Integration flag

```python
integration_flag = shares_data_with_campus_system == true
integration_flag_reason = integration_explanation or "Shares data with another campus system"
```

### Output written to the record

```json
"flags": {
  "ati_flag": true,
  "ati_flag_reason": "100+ users, University scope",
  "security_flag": true,
  "security_flag_reason": "Level 1 data: PII, PCI DSS",
  "integration_flag": false,
  "integration_flag_reason": null,
  "risk_level": "High"
}
```

## Part D — Staff-only fields (never asked to the requester)

These exist in the original SDSU form but are explicitly marked staff-only. They are not part of the chatbot flow — they're either computed (Part C) or filled in later by a human reviewer on the admin dashboard as an override.

| Original field | Who fills it | Where |
| --- | --- | --- |
| "The IT reviewer recommends an ATI review" | Computed, or staff override | `flags.ati_flag`, `admin.overrides.ati_flag` |
| "IT review recommends an integration review" | Computed, or staff override | `flags.integration_flag`, `admin.overrides.integration_flag` |
| "IT review recommends a security review" | Computed, or staff override | `flags.security_flag`, `admin.overrides.security_flag` |
| Explanation for ATI/integration review | Auto-generated reason, editable by staff | `flags.*_reason`, `admin.admin_notes` |
