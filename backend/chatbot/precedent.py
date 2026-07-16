"""ATI precedent lookup -- RC Job Task List step 5: "check the old software
database for previous reviews and notes."

Retrieval, NOT prediction. That distinction is deliberate and load-bearing:

  Of 996 historical ATI determinations, 984 are "No" and 12 are "Yes" -- and the
  12 are incoherent as a class (Windows 11 Pro, Parallels, a decorative stock
  ticker "mainly meant for decoration but it might be prudent"). Anything fitted
  to that label would learn to rubber-stamp. The historical risk tier doesn't
  exist at all -- the Low/Moderate/High checklist is new. So we never predict
  from this data; we hand the reviewer the facts for the SAME product and let
  the checklist do the reasoning.

Same-product precedent is reliable and worth a lot: Canva appears 38 times (28
renewals), every one 1-30 users with no ATI review recommended. That is the
39th reviewer's answer, already written down.

Index is built by build_precedent_index.py (gitignored -- real internal data).
Swap _load_index() for SDSU's live request DB and nothing else changes.
"""

import json
from pathlib import Path

_HERE = Path(__file__).parent
_INDEX_FILE = _HERE / "precedent_index.json"


def normalize_name(s):
    import re
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", str(s or "").lower())).strip()


def _load_index():
    """Read fresh each call so a rebuilt index takes effect without a restart."""
    try:
        return json.loads(_INDEX_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _candidate_keys(name):
    """Exact normalized name, then a first-token fallback so 'Canva Pro' finds
    the 'canva' history. Never collapses 'canva' into 'canvas' -- distinct keys.
    """
    n = normalize_name(name)
    if not n:
        return []
    keys = [n]
    first = n.split(" ")[0]
    if first and first != n and len(first) >= 4:
        keys.append(first)
    return keys


def find_precedents(software_name, limit=25):
    """Prior SDSU requests for this SAME product.

    Returns {found, match_type, software, total, renewals, prior:[...], summary}
    `summary` is a plain-language line the draft report can state directly.
    """
    index = _load_index()
    empty = {"found": False, "match_type": None, "software": software_name,
             "total": 0, "renewals": 0, "prior": [], "summary": ""}
    if not index or not software_name:
        return empty

    hits, match_type = None, None
    for i, key in enumerate(_candidate_keys(software_name)):
        if key in index:
            hits, match_type = index[key], ("exact" if i == 0 else "product_family")
            break
    if not hits:
        return empty

    renewals = sum(1 for r in hits if (r.get("renewal") or "").lower() == "renewal")
    reviewed = [r for r in hits if r.get("ati_review_recommended")]
    ati_yes = sum(1 for r in reviewed if r["ati_review_recommended"].lower() == "yes")
    elevated = sum(1 for r in hits if (r.get("ati_elevated_review") or "").lower() == "yes")
    user_buckets = sorted({r["users"] for r in hits if r.get("users")})

    bits = [f"SDSU has reviewed {hits[0]['software']} {len(hits)} time(s) before"]
    if renewals:
        bits.append(f"{renewals} of them renewals")
    if user_buckets:
        bits.append("prior user counts: " + ", ".join(user_buckets))
    if reviewed:
        bits.append(
            f"an ATI review was recommended on {ati_yes} of {len(reviewed)} where it was recorded"
        )
    bits.append(
        f"{elevated} prior request(s) were escalated for elevated ATI review"
        if elevated else "no prior request was escalated for elevated ATI review"
    )

    return {
        "found": True,
        "match_type": match_type,
        "software": hits[0]["software"],
        "total": len(hits),
        "renewals": renewals,
        "ati_recommended_count": ati_yes,
        "ati_recorded_count": len(reviewed),
        "elevated_count": elevated,
        "prior": hits[:limit],
        "summary": "; ".join(bits) + ".",
    }


def format_for_prompt(prec):
    """Render precedent as plain text for injection into ati_report_prompt.md's
    'Historical precedent' section. Facts only -- no conclusion, no scoring."""
    if not prec or not prec.get("found"):
        return "No prior SDSU requests found for this product."
    lines = [
        f"This is a request for software SDSU has ALREADY REVIEWED: {prec['summary']}",
        "",
        "Prior requests (most recent first):",
    ]
    for r in prec["prior"][:8]:
        lines.append(
            f"- {r.get('software')} | {r.get('department') or 'dept n/a'} | "
            f"{r.get('users') or 'users n/a'} | {r.get('renewal') or 'n/a'} | "
            f"ATI review recommended: {r.get('ati_review_recommended') or 'not recorded'}"
            + (f" | elevated: {r['ati_elevated_review']}" if r.get("ati_elevated_review") else "")
        )
        if r.get("ati_explanation"):
            lines.append(f"    reviewer note: {r['ati_explanation'][:200]}")
        if r.get("use"):
            lines.append(f"    stated use: {r['use'][:130]}")
    return "\n".join(lines)
