import { useState, useEffect, useCallback } from "react";
import { listRequests } from "../../api.js";
import RequestDetail from "./RequestDetail.jsx";
import { STATUS_ORDER, STATUS_LABELS, statusLabel } from "./statusConfig.js";
import { effectiveFlags } from "./flagsUtil.js";

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
      title={overridden ? `${state} (staff override in effect)` : state}
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "3px",
        fontFamily: C.mono,
        fontSize: "10.5px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: done ? GREEN : active ? C.red : "transparent",
        color: active ? C.white : C.stoneLight,
        border: active ? "none" : `1px solid ${C.line}`,
        boxShadow: overridden ? `0 0 0 1.5px ${C.ink}` : "none",
        marginRight: "4px",
      }}
    >
      {label}
      {overridden && "*"}
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
      <LegendItem swatch={{ background: "transparent", border: `1px solid ${C.line}` }}>
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
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "3px",
        fontFamily: C.mono,
        fontSize: "10.5px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: color,
        color: C.white,
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
      setRequests(Array.isArray(data.items) ? data.items : []);
      setError(null);
    } catch (err) {
      if (!silent) {
        setError(err.message || "Could not load requests.");
        setRequests([]);
      }
    } finally {
      if (!silent) setLoading(false);
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

  function handleSaved(updatedRequest) {
    setRequests((prev) =>
      prev.map((r) => (r.request_id === updatedRequest.request_id ? updatedRequest : r))
    );
    setSelectedId(null);
  }

  const selected = requests.find((r) => r.request_id === selectedId) ?? null;

  return (
    <div style={styles.page}>
      {/* ── Masthead ── */}
      <div style={styles.header}>
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

      <div style={styles.body}>
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

        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Software</th>
                <th style={styles.th}>Requestor</th>
                <th style={styles.th}>Department</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Flags</th>
                <th style={styles.th}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={styles.emptyCell}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={styles.emptyCell}>
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
                      <td style={styles.td}>
                        <FlagPill value={effective.ati.value} overridden={effective.ati.overridden} completed={effective.ati.completed} label="ATI" />
                        <FlagPill value={effective.security.value} overridden={effective.security.overridden} completed={effective.security.completed} label="ITSO" />
                        <FlagPill value={effective.integration.value} overridden={effective.integration.overridden} completed={effective.integration.completed} label="INT" />
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
    borderRadius: "2px",
    boxSizing: "border-box",
  },
  tableWrapper: {
    background: C.white,
    border: `1px solid ${C.line}`,
    borderRadius: "10px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
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
  },
  tdSub: {
    fontFamily: C.mono,
    fontSize: "11px",
    color: C.stone,
    marginTop: "2px",
  },
  emptyCell: {
    padding: "40px",
    textAlign: "center",
    color: C.stone,
    fontSize: "14px",
    fontStyle: "italic",
  },
};
