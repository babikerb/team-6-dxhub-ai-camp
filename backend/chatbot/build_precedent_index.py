"""Build the ATI precedent index from SDSU's historical ServiceNow export.

This is RC Job Task List step 5 -- "check the old software database for previous
reviews and notes" -- made queryable. For a request whose software SDSU has seen
before, the reviewer gets the prior determinations instead of starting over.
(Canva alone appears 38 times in the export, 28 of them renewals, every one
resolved the same way.)

Run locally against the private export; the generated index is gitignored
(backend/chatbot/.gitignore ignores *.json except the two public snapshots),
because it contains real internal procurement data and this repo is public.

In production this module is the seam: swap _rows_from_export() for a query
against SDSU's live request database and nothing downstream changes.

Usage:
    python build_precedent_index.py "/path/to/sc_req_item (7.7.2026).xlsx"
    -> writes precedent_index.json next to this file
"""

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

_HERE = Path(__file__).parent
OUT = _HERE / "precedent_index.json"

# Column indexes in the ServiceNow export.
C_NAME = 110          # Requested Software Name
C_DEPT = 6            # Department
C_USERS = 35          # Estimated number of users
C_SCOPE = 115         # Scope of usage
C_USE = 140           # What will the technology be used for?
C_RENEWAL = 67        # Is this a renewal or new purchase:
C_ATI_REC = 71        # The IT reviewer recommends an ATI review of this software
C_ATI_ELEVATED = 123  # [FILLED BY ATI ONLY] requires elevated review
C_ATI_EXPL = 37       # Explanation for ATI review
C_STATE = 4           # State
C_CREATED = 150       # Created


def normalize_name(s):
    """Lowercase, strip punctuation/extra space. Keeps 'canva' and 'canvas'
    distinct -- they are different products and must never collapse together."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", str(s or "").lower())).strip()


def _cell(row, i):
    v = row[i] if i < len(row) else None
    return str(v).strip() if v not in (None, "") else None


def _rows_from_export(path):
    import openpyxl

    ws = openpyxl.load_workbook(path, read_only=True).active
    return list(ws.iter_rows(min_row=2, values_only=True))


def build(path):
    index = defaultdict(list)
    for row in _rows_from_export(path):
        name = _cell(row, C_NAME)
        if not name:
            continue
        index[normalize_name(name)].append({
            "software": name,
            "department": _cell(row, C_DEPT),
            "users": _cell(row, C_USERS),
            "scope": _cell(row, C_SCOPE),
            "use": (_cell(row, C_USE) or "")[:240],
            "renewal": _cell(row, C_RENEWAL),
            "ati_review_recommended": _cell(row, C_ATI_REC),
            "ati_elevated_review": _cell(row, C_ATI_ELEVATED),
            "ati_explanation": _cell(row, C_ATI_EXPL),
            "state": _cell(row, C_STATE),
            "created": _cell(row, C_CREATED),
        })
    return {k: v for k, v in index.items() if k}


if __name__ == "__main__":
    # Path is required rather than defaulted: the export is internal SDSU data
    # that lives outside this (public) repo, and its location differs per person.
    src = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SDSU_REQUEST_EXPORT")
    if not src:
        sys.exit(
            "Usage: python build_precedent_index.py <path/to/request-export.xlsx>\n"
            "   or: SDSU_REQUEST_EXPORT=<path> python build_precedent_index.py"
        )
    idx = build(src)
    OUT.write_text(json.dumps(idx, indent=1), encoding="utf-8")
    multi = {k: v for k, v in idx.items() if len(v) > 1}
    print(f"wrote {OUT}")
    print(f"  {sum(len(v) for v in idx.values())} past requests, {len(idx)} distinct products")
    print(f"  {len(multi)} products seen more than once "
          f"({sum(len(v) for v in multi.values())} requests have precedent)")
    print("  top:", sorted(((len(v), k) for k, v in idx.items()), reverse=True)[:5])
