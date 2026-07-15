import { useState } from "react";
import { MOCK_REQUESTS } from "./mockData.js";
import RequestDetail from "./RequestDetail.jsx";

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

function statusColor(status) {
  const map = {
    Submitted: "#1565C0",
    ChatbotInProgress: "#6A1B9A",
    FlagsComputed: "#B5650B",
    UnderStaffReview: C.red,
    Approved: "#2E7D32",
    Denied: C.stone,
  };
  return map[status] || C.stone;
}

function FlagPill({ value, label }) {
  const active = value === true;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "3px",
        fontFamily: C.mono,
        fontSize: "10.5px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: active ? C.red : "transparent",
        color: active ? C.white : C.stoneLight,
        border: active ? "none" : `1px solid ${C.line}`,
        marginRight: "4px",
      }}
    >
      {label}
    </span>
  );
}

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

// ── Unique values for filter dropdowns ────────────────────────────────────────
const ALL_STATUSES = [
  "Submitted",
  "ChatbotInProgress",
  "FlagsComputed",
  "UnderStaffReview",
  "Approved",
  "Denied",
];

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  // In Phase 2 swap this for a real fetch from GET /requests
  const [requests, setRequests] = useState(MOCK_REQUESTS);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFlag, setFilterFlag] = useState("");   // "ati" | "security" | "integration" | ""
  const [filterDept, setFilterDept] = useState("");
  const [search, setSearch] = useState("");

  const departments = [...new Set(requests.map((r) => r.requestor.department))].sort();

  const filtered = requests.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterFlag) {
      if (filterFlag === "ati" && !r.flags.ati_flag) return false;
      if (filterFlag === "security" && !r.flags.security_flag) return false;
      if (filterFlag === "integration" && !r.flags.integration_flag) return false;
    }
    if (filterDept && r.requestor.department !== filterDept) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.requestor.software_name.toLowerCase().includes(q) &&
        !r.requestor.requested_for_name.toLowerCase().includes(q) &&
        !r.requestor.department.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // Called by RequestDetail after a successful PATCH /requests/{id}/admin
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
      </div>

      <div style={styles.body}>
        {/* ── Filters ── */}
        <div style={styles.filterBar}>
          <input
            style={styles.searchInput}
            placeholder="Search software, requestor, department…"
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
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
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
            <option value="security">Security flagged</option>
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

        {/* ── Results count ── */}
        <div style={styles.resultCount}>
          {filtered.length} request{filtered.length !== 1 ? "s" : ""}
        </div>

        {/* ── Table ── */}
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={styles.emptyCell}>
                    No requests match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
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
                        {r.requestor.software_name}
                      </td>
                      <td style={styles.td}>
                        <div>{r.requestor.requested_for_name}</div>
                        <div style={styles.tdSub}>
                          {r.requestor.requested_for_email}
                        </div>
                      </td>
                      <td style={styles.td}>{r.requestor.department}</td>
                      <td style={styles.td}>
                        <Badge
                          label={r.status}
                          color={statusColor(r.status)}
                        />
                      </td>
                      <td style={styles.td}>
                        <FlagPill value={r.flags.ati_flag} label="ATI" />
                        <FlagPill value={r.flags.security_flag} label="SEC" />
                        <FlagPill value={r.flags.integration_flag} label="INT" />
                      </td>
                      <td style={styles.td}>
                        <Badge
                          label={r.flags.risk_level}
                          color={riskColor(r.flags.risk_level)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detail panel (slide-in overlay) ── */}
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

// ── Styles ────────────────────────────────────────────────────────────────────
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
  body: {
    padding: "28px",
    maxWidth: "1140px",
    margin: "0 auto",
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
  resultCount: {
    fontFamily: C.mono,
    fontSize: "11.5px",
    color: C.stone,
    letterSpacing: "0.02em",
    marginBottom: "10px",
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
