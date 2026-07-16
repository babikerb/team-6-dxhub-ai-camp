import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listRequests } from "../../api.js";
import RequestDetail from "./RequestDetail.jsx";
import { STATUS_ORDER, STATUS_LABELS, statusLabel } from "./statusConfig.js";
import { effectiveFlags } from "./flagsUtil.js";
import { useIsMobile } from "../../useIsMobile.js";

// ── Design tokens (matches RequesterChat.jsx / IntakeForm.jsx palette + type system) ──
const C = {
  ink: "var(--ink)",
  red: "var(--red)",
  redDark: "var(--red-dark)",
  paper: "var(--paper)",
  paperAlt: "var(--paper-alt)",
  line: "var(--line)",
  stone: "var(--stone)",
  stoneLight: "var(--stone-light)",
  white: "#ffffff",
  sans: "'IBM Plex Sans', sans-serif",
  mono: "'IBM Plex Mono', monospace",
  serif: "'Source Serif 4', serif",
};

// The three review dashboards reachable from each row. Order matches the
// flag columns so the eye tracks across the row consistently. `flagKey` is
// the effectiveFlags() key that gates whether this button is shown for a
// given request — a review link only makes sense once its flag is active.
const REVIEW_DASHBOARDS = [
  { type: "ati", label: "ATI", flagKey: "ati" },
  { type: "itso", label: "Security", flagKey: "security" },
  { type: "integration", label: "Data Integration", flagKey: "integration" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(level) {
  if (level === "High") return C.red;
  if (level === "Medium") return "#B5650B";
  return C.stone;
}

const GREEN = "#2E7D32"; // review completed

function FlagPill({ value, label, overridden, completed }) {
  const active = value === true;
  const done = active && completed;
  const state = !active
    ? "Not flagged — no review required"
    : done
    ? "Review completed"
    : "Review remaining";
  return (
    <span
      data-testid="flag-pill"
      title={overridden ? `${state} (staff override in effect)` : state}
      aria-label={overridden ? `${label}: ${state} (staff override in effect)` : `${label}: ${state}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "3px",
        minWidth: "48px",
        boxSizing: "border-box",
        padding: active ? "3px 8px" : "2px 7px",
        borderRadius: "999px",
        fontFamily: C.mono,
        fontSize: "10.5px",
        fontWeight: 700,
        letterSpacing: "0.03em",
        lineHeight: 1.3,
        background: done ? GREEN : active ? C.red : "transparent",
        // C.stone (not C.stoneLight) so muted labels still clear WCAG AA
        // (~5.3:1 on white) — stoneLight measured ~2.1:1 and failed review.
        color: active ? C.white : C.stone,
        border: active ? "none" : `1px dashed ${C.stone}`,
      }}
    >
      {done && (
        <span aria-hidden="true" style={{ fontSize: "9px", lineHeight: 1 }}>
          ✓
        </span>
      )}
      <span>{label}</span>
      {overridden && (
        // Corner badge instead of a box-shadow ring — a ring around an
        // already-colored pill read as a focus outline in review, not an
        // intentional "staff edited this" affordance.
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "-6px",
            right: "-6px",
            width: "13px",
            height: "13px",
            borderRadius: "50%",
            background: C.ink,
            color: C.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "8px",
            lineHeight: 1,
            border: `1.5px solid ${C.white}`,
          }}
        >
          ✎
        </span>
      )}
    </span>
  );
}

function LegendItem({ swatch, children }) {
  return (
    <span style={styles.legendItem}>
      {swatch && <span style={{ ...styles.legendSwatch, ...swatch }} />}
      {children}
    </span>
  );
}

function Legend() {
  return (
    <div style={styles.legend} aria-label="Color legend">
      <span style={styles.legendGroupLabel}>Flags:</span>
      <LegendItem swatch={{ background: "transparent", border: `1px dashed ${C.stone}` }}>
        Not flagged
      </LegendItem>
      <LegendItem swatch={{ background: C.red }}>Review remaining</LegendItem>
      <LegendItem swatch={{ background: GREEN }}>Review completed</LegendItem>
      <LegendItem>* Staff override</LegendItem>
      <span style={styles.legendGroupLabel}>Risk:</span>
      <LegendItem swatch={{ background: C.red }}>High</LegendItem>
      <LegendItem swatch={{ background: "#B5650B" }}>Medium</LegendItem>
      <LegendItem swatch={{ background: C.stone }}>Low</LegendItem>
    </div>
  );
}

// ── Sorting ───────────────────────────────────────────────────────────────────

const RISK_RANK = { High: 0, Medium: 1, Low: 2 }; // missing/"Pending" sorts last

function createdAtMs(r) {
  const t = Date.parse(r.created_at);
  return Number.isNaN(t) ? 0 : t;
}

// Empty values sort last regardless of direction.
function compareText(a, b) {
  const ta = (a || "").trim();
  const tb = (b || "").trim();
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  return ta.localeCompare(tb);
}

const SORT_COMPARATORS = {
  newest: (a, b) => createdAtMs(b) - createdAtMs(a),
  oldest: (a, b) => createdAtMs(a) - createdAtMs(b),
  risk: (a, b) =>
    (RISK_RANK[emptyFlags(a.flags).risk_level] ?? 3) -
      (RISK_RANK[emptyFlags(b.flags).risk_level] ?? 3) ||
    createdAtMs(b) - createdAtMs(a),
  department: (a, b) =>
    compareText(emptyRequestor(a.requestor).department, emptyRequestor(b.requestor).department) ||
    createdAtMs(b) - createdAtMs(a),
  software: (a, b) =>
    compareText(
      emptyRequestor(a.requestor).software_name,
      emptyRequestor(b.requestor).software_name
    ) || createdAtMs(b) - createdAtMs(a),
};

const SORT_OPTIONS = [
  ["newest", "Sort: Newest first"],
  ["oldest", "Sort: Oldest first"],
  ["risk", "Sort: Risk (High → Low)"],
  ["department", "Sort: Department (A–Z)"],
  ["software", "Sort: Software name (A–Z)"],
];

function Badge({ label, color }) {
  return (
    <span
      title={label}
      style={{
        display: "inline-block",
        maxWidth: "100%",
        padding: "3px 10px",
        borderRadius: "3px",
        fontFamily: C.mono,
        fontSize: "10.5px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: color,
        color: C.white,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        boxSizing: "border-box",
        verticalAlign: "top",
      }}
    >
      {label}
    </span>
  );
}

function emptyFlags(flags) {
  return flags && typeof flags === "object" ? flags : {};
}

function emptyRequestor(requestor) {
  return requestor && typeof requestor === "object" ? requestor : {};
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterFlag, setFilterFlag] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  // silent = background poll: no loading state, and a transient failure
  // must never wipe the rows already on screen.
  const loadRequests = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await listRequests();
      const items = Array.isArray(data.items) ? data.items : [];
      setRequests(items);
      setError(null);
      if (!silent) setLoading(false);
    } catch (err) {
      if (!silent) {
        setError(err.message || "Could not load requests.");
        setRequests([]);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Keep the list fresh without manual refreshes; paused while the edit
  // panel is open so the record being edited isn't swapped underneath it.
  useEffect(() => {
    if (selectedId !== null) return undefined;
    const timer = setInterval(() => loadRequests(true), 15000);
    return () => clearInterval(timer);
  }, [selectedId, loadRequests]);

  const departments = [
    ...new Set(
      requests
        .map((r) => emptyRequestor(r.requestor).department)
        .filter(Boolean)
    ),
  ].sort();

  const filtered = requests.filter((r) => {
    const requestor = emptyRequestor(r.requestor);
    const flags = emptyFlags(r.flags);
    const effective = effectiveFlags(flags, r.admin);

    if (filterStatus && r.status !== filterStatus) return false;
    if (filterFlag) {
      if (filterFlag === "ati" && !effective.ati.value) return false;
      if (filterFlag === "security" && !effective.security.value) return false;
      if (filterFlag === "integration" && !effective.integration.value) return false;
      if (filterFlag === "ai" && !effective.ai.value) return false;
    }
    if (filterDept && requestor.department !== filterDept) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !(requestor.software_name || "").toLowerCase().includes(q) &&
        !(requestor.requested_for_name || "").toLowerCase().includes(q) &&
        !(requestor.department || "").toLowerCase().includes(q) &&
        !(r.request_id || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const sorted = [...filtered].sort(SORT_COMPARATORS[sortBy] || SORT_COMPARATORS.newest);

  // Refresh a request in the list but keep the detail panel open -- used when
  // the security report finishes generating in the background, where closing
  // the panel would throw the reviewer out mid-task.
  function handleRefreshed(updatedRequest) {
    setRequests((prev) =>
      prev.map((r) => (r.request_id === updatedRequest.request_id ? updatedRequest : r))
    );
  }

  function handleSaved(updatedRequest) {
    handleRefreshed(updatedRequest);
    setSelectedId(null);
  }

  const selected = requests.find((r) => r.request_id === selectedId) ?? null;

  return (
    <div style={styles.page}>
      {/* ── Masthead ── */}
      <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : null) }}>
        <div style={styles.headerBadge}>SDSU</div>
        <div>
          <div style={styles.headerTitle}>Admin Dashboard</div>
          <div style={styles.headerSubtitle}>Software Request Review</div>
        </div>
        <button
          type="button"
          style={styles.refreshButton}
          onClick={() => loadRequests()}
          disabled={loading}
          aria-label="Refresh requests"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div style={{ ...styles.body, ...(isMobile ? styles.bodyMobile : null) }}>
        <div style={styles.filterBar}>
          <input
            style={styles.searchInput}
            placeholder="Search software, requestor, department, procurement ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search requests"
          />

          <select
            style={styles.select}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          <select
            style={styles.select}
            value={filterFlag}
            onChange={(e) => setFilterFlag(e.target.value)}
            aria-label="Filter by flag"
          >
            <option value="">All flags</option>
            <option value="ati">ATI flagged</option>
            <option value="security">ITSO flagged</option>
            <option value="integration">Integration flagged</option>
            <option value="ai">AI / ADS flagged</option>
          </select>

          <select
            style={styles.select}
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            style={styles.select}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {(filterStatus || filterFlag || filterDept || search) && (
            <button
              style={styles.clearButton}
              onClick={() => {
                setFilterStatus("");
                setFilterFlag("");
                setFilterDept("");
                setSearch("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {error && (
          <div style={styles.errorBanner} role="alert">
            {error}{" "}
            <button type="button" style={styles.retryLink} onClick={loadRequests}>
              Retry
            </button>
          </div>
        )}

        <div style={styles.resultCountRow}>
          <div style={styles.resultCount}>
            {loading
              ? "Loading requests…"
              : `${filtered.length} request${filtered.length !== 1 ? "s" : ""}`}
          </div>
          <Legend />
        </div>

        {isMobile ? (
          <div style={styles.cardList}>
            {loading ? (
              <div style={styles.emptyCell}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={styles.emptyCell}>
                {error
                  ? "Unable to load requests."
                  : requests.length === 0
                    ? "No requests yet. Submit one from the intake form."
                    : "No requests match the current filters."}
              </div>
            ) : (
              sorted.map((r) => {
                const requestor = emptyRequestor(r.requestor);
                const flags = emptyFlags(r.flags);
                const effective = effectiveFlags(flags, r.admin);
                const active = selectedId === r.request_id;
                const reviewsAvailable = REVIEW_DASHBOARDS.filter(
                  (d) => effective[d.flagKey].value === true
                );
                return (
                  <div
                    key={r.request_id}
                    style={{
                      ...styles.card,
                      borderLeftColor: active ? C.red : "transparent",
                      background: active ? "rgba(200, 16, 46, 0.05)" : C.white,
                    }}
                    onClick={() => setSelectedId(r.request_id)}
                  >
                    <div style={styles.cardTop}>
                      <div style={{ fontWeight: 600 }}>{requestor.software_name || "—"}</div>
                      <Badge label={statusLabel(r.status)} color="var(--stone)" />
                    </div>
                    <div style={styles.tdSub}>{r.request_id}</div>

                    <div style={styles.cardRow}>
                      <span style={styles.cardLabel}>Requestor</span>
                      <span>
                        {requestor.requested_for_name || "—"}
                        {requestor.requested_for_email ? ` · ${requestor.requested_for_email}` : ""}
                      </span>
                    </div>
                    <div style={styles.cardRow}>
                      <span style={styles.cardLabel}>Department</span>
                      <span>{requestor.department || "—"}</span>
                    </div>
                    <div style={styles.cardRow}>
                      <span style={styles.cardLabel}>Risk</span>
                      {flags.risk_level ? (
                        <Badge label={flags.risk_level} color={riskColor(flags.risk_level)} />
                      ) : (
                        <span style={{ color: C.stone, fontSize: "12px" }}>Pending</span>
                      )}
                    </div>

                    <div style={{ ...styles.flagsRow, marginTop: "8px" }}>
                      <FlagPill value={effective.ati.value} overridden={effective.ati.overridden} completed={effective.ati.completed} label="ATI" />
                      <FlagPill value={effective.security.value} overridden={effective.security.overridden} completed={effective.security.completed} label="ITSO" />
                      <FlagPill value={effective.integration.value} overridden={effective.integration.overridden} completed={effective.integration.completed} label="INT" />
                      <FlagPill value={effective.ai.value} overridden={effective.ai.overridden} completed={effective.ai.completed} label="AI" />
                    </div>

                    {reviewsAvailable.length > 0 && (
                      <div
                        style={styles.cardReviewBtns}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {reviewsAvailable.map((d) => (
                          <button
                            key={d.type}
                            style={styles.reviewBtn}
                            title={`Open the ${d.label} for this request`}
                            onClick={() => navigate(`/admin/${r.request_id}/review/${d.type}`)}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            {/* table-layout is fixed, so every column needs a <col> here — a
                column without one collapses to zero width. Widths total 100%. */}
            <colgroup>
              <col style={{ width: "15%" }} /> {/* Software */}
              <col style={{ width: "13%" }} /> {/* Requestor */}
              <col style={{ width: "12%" }} /> {/* Department */}
              <col style={{ width: "15%" }} /> {/* Status */}
              <col style={{ width: "16%" }} /> {/* Flags */}
              <col style={{ width: "10%" }} /> {/* Risk */}
              <col style={{ width: "19%" }} /> {/* Reviews */}
            </colgroup>
            <thead>
              <tr>
                <th style={styles.th}>Software</th>
                <th style={styles.th}>Requestor</th>
                <th style={styles.th}>Department</th>
                <th style={styles.th}>Status</th>
                <th style={{ ...styles.th, paddingLeft: "24px" }}>Flags</th>
                <th style={styles.th}>Risk</th>
                <th style={styles.th}>Reviews</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={styles.emptyCell}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={styles.emptyCell}>
                    {error
                      ? "Unable to load requests."
                      : requests.length === 0
                        ? "No requests yet. Submit one from the intake form."
                        : "No requests match the current filters."}
                  </td>
                </tr>
              ) : (
                sorted.map((r) => {
                  const requestor = emptyRequestor(r.requestor);
                  const flags = emptyFlags(r.flags);
                  const effective = effectiveFlags(flags, r.admin);
                  const active = selectedId === r.request_id || hoveredId === r.request_id;
                  // Use live review-docs data fetched from the endpoint; fall
                  // back to whatever is on the DynamoDB record if the fetch
                  // hasn't completed yet or failed for this request.
                  return (
                    <tr
                      key={r.request_id}
                      style={{
                        ...styles.tr,
                        borderLeftColor: active ? C.red : "transparent",
                        background:
                          selectedId === r.request_id ? "rgba(200, 16, 46, 0.05)" : C.white,
                      }}
                      onClick={() => setSelectedId(r.request_id)}
                      onMouseEnter={() => setHoveredId(r.request_id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <td style={{ ...styles.td, fontWeight: 600 }}>
                        {requestor.software_name || "—"}
                        <div style={styles.tdSub}>{r.request_id}</div>
                      </td>
                      <td style={styles.td}>
                        <div>{requestor.requested_for_name || "—"}</div>
                        <div style={styles.tdSub}>
                          {requestor.requested_for_email || ""}
                        </div>
                      </td>
                      <td style={styles.td}>{requestor.department || "—"}</td>
                      <td style={styles.td}>
                        {/* One neutral color on purpose — the label text carries the
                            meaning; color stays reserved for Flags and Risk. */}
                        <Badge label={statusLabel(r.status)} color="var(--stone)" />
                      </td>
                      <td style={{ ...styles.td, paddingLeft: "24px" }}>
                        <div style={styles.flagsRow}>
                          <FlagPill value={effective.ati.value} overridden={effective.ati.overridden} completed={effective.ati.completed} label="ATI" />
                          <FlagPill value={effective.security.value} overridden={effective.security.overridden} completed={effective.security.completed} label="ITSO" />
                          <FlagPill value={effective.integration.value} overridden={effective.integration.overridden} completed={effective.integration.completed} label="INT" />
                          <FlagPill value={effective.ai.value} overridden={effective.ai.overridden} completed={effective.ai.completed} label="AI" />
                        </div>
                      </td>
                      <td style={styles.td}>
                        {flags.risk_level ? (
                          <Badge
                            label={flags.risk_level}
                            color={riskColor(flags.risk_level)}
                          />
                        ) : (
                          <span style={{ color: C.stone, fontSize: "12px" }}>Pending</span>
                        )}
                      </td>
                      {/* stopPropagation: the row itself opens the detail panel,
                          and these buttons navigate somewhere else entirely.
                          Only requests actually flagged for a given review get
                          that review's button — ungated buttons for a request
                          with nothing to review just clutter the row. Because
                          this reads `effective` (computed + admin overrides),
                          ticking an override on immediately makes the button
                          appear with no extra wiring needed. */}
                      <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.reviewBtns}>
                          {REVIEW_DASHBOARDS.filter((d) => effective[d.flagKey].value === true).map((d) => (
                            <button
                              key={d.type}
                              style={styles.reviewBtn}
                              title={`Open the ${d.label} for this request`}
                              onClick={() => navigate(`/admin/${r.request_id}/review/${d.type}`)}
                            >
                              {d.label}
                            </button>
                          ))}
                          {REVIEW_DASHBOARDS.every((d) => effective[d.flagKey].value !== true) && (
                            <span style={styles.noReviewsNote}>No reviews required</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {selected && (
        <RequestDetail
          request={selected}
          onClose={() => setSelectedId(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    fontFamily: C.sans,
    color: C.ink,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "18px 28px",
    background: C.ink,
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  headerMobile: {
    padding: "14px 16px",
    gap: "10px",
  },
  headerBadge: {
    background: C.red,
    color: C.white,
    fontFamily: C.mono,
    fontWeight: 700,
    fontSize: "12px",
    letterSpacing: "0.06em",
    padding: "7px 11px",
    borderRadius: "6px",
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: C.serif,
    fontWeight: 600,
    fontSize: "19px",
    lineHeight: 1.2,
    color: C.white,
  },
  headerSubtitle: {
    marginTop: "3px",
    fontFamily: C.mono,
    fontSize: "11.5px",
    color: C.stoneLight,
  },
  refreshButton: {
    marginLeft: "auto",
    padding: "8px 14px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.35)",
    background: "transparent",
    color: C.white,
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: C.sans,
  },
  body: {
    padding: "28px",
    maxWidth: "1400px",
    margin: "0 auto",
  },
  bodyMobile: {
    padding: "14px",
  },
  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginBottom: "18px",
    alignItems: "center",
  },
  searchInput: {
    flex: "1 1 240px",
    padding: "9px 12px",
    borderRadius: "6px",
    border: `1.5px solid ${C.line}`,
    fontSize: "13.5px",
    fontFamily: C.sans,
    outline: "none",
    background: C.white,
    color: C.ink,
  },
  select: {
    padding: "9px 10px",
    borderRadius: "6px",
    border: `1.5px solid ${C.line}`,
    fontSize: "13px",
    fontFamily: C.sans,
    background: C.white,
    color: C.ink,
    cursor: "pointer",
    outline: "none",
  },
  clearButton: {
    padding: "9px 14px",
    borderRadius: "6px",
    border: `1.5px solid ${C.red}`,
    background: C.white,
    color: C.red,
    fontSize: "11.5px",
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    cursor: "pointer",
    fontFamily: C.mono,
  },
  errorBanner: {
    marginBottom: "12px",
    padding: "10px 12px",
    borderRadius: "8px",
    background: "#FFECEC",
    color: C.red,
    fontSize: "13px",
    fontWeight: 600,
  },
  retryLink: {
    marginLeft: "8px",
    background: "transparent",
    border: "none",
    color: C.red,
    textDecoration: "underline",
    cursor: "pointer",
    fontWeight: 700,
    fontFamily: C.sans,
  },
  resultCountRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
    marginBottom: "10px",
  },
  resultCount: {
    fontFamily: C.mono,
    fontSize: "11.5px",
    color: C.stone,
    letterSpacing: "0.02em",
  },
  legend: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
    fontFamily: C.mono,
    fontSize: "10.5px",
    color: C.stone,
  },
  legendGroupLabel: {
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontSize: "9.5px",
    color: C.ink,
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    whiteSpace: "nowrap",
  },
  legendSwatch: {
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "5px",
    boxSizing: "border-box",
  },
  tableWrapper: {
    background: C.white,
    border: `1px solid ${C.line}`,
    borderRadius: "10px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.08)",
    overflowX: "auto",
    // Keep the rounded corners visible while still clipping the scrollable area.
    WebkitOverflowScrolling: "touch",
  },
  table: {
    width: "100%",
    tableLayout: "fixed",
    borderCollapse: "collapse",
  },
  reviewBtns: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "4px",
    minWidth: "150px",
  },
  noReviewsNote: {
    fontFamily: C.mono,
    fontSize: "11px",
    fontStyle: "italic",
    color: C.stone,
  },
  reviewBtn: {
    fontFamily: C.mono,
    fontSize: "10.5px",
    fontWeight: 700,
    color: C.ink,
    backgroundColor: C.white,
    border: `1px solid ${C.line}`,
    paddingTop: "6px",
    paddingRight: "8px",
    paddingBottom: "6px",
    paddingLeft: "8px",
    cursor: "pointer",
    textAlign: "left",
    whiteSpace: "nowrap",
  },
  // ── Mobile card list — replaces the fixed-width table below the breakpoint,
  // since a table-layout:fixed table with 7 columns has no room to shrink into
  // a phone width without truncating everything.
  cardList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  card: {
    background: C.white,
    border: `1px solid ${C.line}`,
    borderLeft: "3px solid transparent",
    borderRadius: "10px",
    padding: "14px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    cursor: "pointer",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "10px",
    fontSize: "14px",
  },
  cardRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    padding: "6px 0",
    borderTop: `1px solid ${C.paperAlt}`,
    fontSize: "12.5px",
  },
  cardLabel: {
    fontFamily: C.mono,
    fontSize: "10.5px",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    color: C.stone,
    flexShrink: 0,
  },
  cardReviewBtns: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "10px",
    paddingTop: "10px",
    borderTop: `1px solid ${C.paperAlt}`,
  },
  th: {
    padding: "12px 16px",
    textAlign: "left",
    fontFamily: C.mono,
    fontSize: "10.5px",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: C.white,
    background: C.ink,
  },
  tr: {
    borderBottom: `1px solid ${C.line}`,
    borderLeft: "3px solid transparent",
    cursor: "pointer",
    transition: "background 0.15s ease, border-left-color 0.15s ease",
  },
  td: {
    padding: "14px 16px",
    fontSize: "13px",
    color: C.ink,
    verticalAlign: "top",
    overflowWrap: "break-word",
  },
  tdSub: {
    fontFamily: C.mono,
    fontSize: "11px",
    color: C.stone,
    marginTop: "2px",
  },
  flagsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, max-content)",
    gap: "6px 8px",
    alignItems: "center",
  },
  emptyCell: {
    padding: "40px",
    textAlign: "center",
    color: C.stone,
    fontSize: "14px",
    fontStyle: "italic",
  },
};
