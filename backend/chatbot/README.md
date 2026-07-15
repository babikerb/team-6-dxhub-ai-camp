# Chatbot — Bedrock answer-parsing layer (Person 2)

Turns a requester's plain-English reply into the structured `it_review` answers,
with a confidence-driven clarification cascade so non-technical faculty/staff
aren't forced to self-classify jargon (Cloud vs On-prem vs Add-on, Level 1/2
data, SSO) cold — which is where the current ServiceNow form goes wrong.

## Files
| file | what it is |
| --- | --- |
| `bedrock_prompt.md` | **The reviewable prompt.** Output contract, per-question mapping guidance, cascade thresholds, and a curated real-SDSU example bank. Tune this without touching code. |
| `parse.py` | The parsing layer. `parse_answer(question_id, reply, intake_context)` → `{answer, confidence, reasoning, quote}` via Bedrock **tool use** (guaranteed structured output). `next_cascade_action()` maps confidence → confirm / decision-tree / buttons / unsure. |
| `evaluate_testset.py` | Runs the parser over real historical requests and reports **resolution rate** + **agreement rate** (see below). |

## Model / access
- Bedrock, region `us-west-2`, model `us.anthropic.claude-haiku-4-5-20251001-v1:0`.
- **Use inference-profile IDs (`us.anthropic.*`), not bare `anthropic.claude-*`** — the bare IDs raise `ValidationException` ("on-demand throughput isn't supported") on this account.
- AWS creds come from the environment / `~/.aws` (temporary SSO creds, expire ~12h). **Never commit keys.**

## Demo-safe mode
`CHATBOT_LLM_MODE=mock` replays saved answers from `mock_responses.json` instead
of calling Bedrock — no live key, no network needed for a presentation. Default
is `bedrock` (live). A deterministic heuristic backs up any reply not in the
recording so mock mode never hard-fails.

## Test fixtures (not in this repo)
The historical data is real internal SDSU procurement data, so it's **gitignored**
and lives only locally. Regenerate from the private ServiceNow export
(`sc_req_item*.xlsx`): extract columns *Requested Software Name* (110),
*What will the technology be used for?* (140), *Additional Details* (9), plus the
requester-entered labels — software-category booleans (*Cloud Platforms* 19,
*On-prem Data Center* 87, *On-prem Local* 88, *Add-on/Plug-in* 10), *shares data*
(145), *level 1* (12), *level 2* (25) — into `labeled_full.json` /
`test_set_30.json` (list of `{software_name, usage, details, label_category,
label_shares_data, label_level1, label_level2}`).

## What the eval measures
Every historical row's category/data labels were entered by the **requester**
(not IT — the IT/reviewer fields are the bracketed `[FILLED BY …]` columns). So
the eval feeds the requester's own description back to the bot and checks:
- **Resolution rate** — how often the bot produces a concrete answer instead of
  routing to "unsure" (higher = fewer requests IT must chase down later).
- **Agreement rate** — of resolved answers, how often it matches what the
  requester recorded. Historical labels are noisy (e.g. Canva self-classified as
  on-prem), so disagreements are logged for review — several are cases where the
  bot is *more* correct than the human record.

```bash
# live
CHATBOT_LLM_MODE=bedrock python evaluate_testset.py test_set_30.json software_category
# offline
CHATBOT_LLM_MODE=mock    python evaluate_testset.py test_set_30.json software_category
```
