import { useState } from "react";
import { MOCK_REQUESTS } from "./mockData.js";
import RequestDetail from "./RequestDetail.jsx";

// ── Color tokens (matches RequesterChat.jsx palette) ──────────────────────────
const C = {
  red: "#C8102E",
  dark: "#1A1A1A",
  darkGrey: "#3A3A3A",
  white: "#ffffff",
  pageBg: "#F2F2F2",
  cardBg: "#ffffff",
  lightGrey: "#FAFAFA",
  borderGrey: "#EDEDED",
  inputBorder: "#DDD",
  mutedText: "#666",
  subtleText: "#B3B3B3",
  font: "'Segoe UI', Arial, sans-serif",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(level) {
  if (level === "High") return C.red;
  if (level === "Medium") return "#E87C00";
  return C.darkGrey;
}

function statusColor(status) {
  const map = {
    Submitted: "#1565C0",
    ChatbotInProgress: "#6A1B9A",
    FlagsComputed: "#E87C00",
    UnderStaffReview: C.red,
    Approved: "#2E7D32",
    Denied: C.darkGrey,
  };
  return map[status] || C.darkGrey;
}

function FlagPill({ value, label }) {
  const active = value === true;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
        background: active ? C.red : C.borderGrey,
        color: active ? C.white : C.mutedText,
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
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
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
      {/* ── Header ── */}
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
              <tr style={styles.thead}>
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
                filtered.map((r) => (
                  <tr
                    key={r.request_id}
                    style={{
                      ...styles.tr,
                      background:
                        selectedId === r.request_id ? "#FFF5F7" : C.white,
                    }}
                    onClick={() => setSelectedId(r.request_id)}
                  >
                    <td style={{ ...styles.td, fontWeight: 600 }}>
                      {r.requestor.software_name}
                    </td>
                    <td style={styles.td}>
                      <div>{r.requestor.requested_for_name}</div>
                      <div style={{ fontSize: "11px", color: C.mutedText }}>
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
                ))
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
    background: C.pageBg,
    fontFamily: C.font,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px 24px",
    background: C.dark,
    color: C.white,
  },
  headerBadge: {
    background: C.red,
    color: C.white,
    fontWeight: 700,
    fontSize: "12px",
    padding: "6px 10px",
    borderRadius: "8px",
    letterSpacing: "0.5px",
  },
  headerTitle: { fontWeight: 600, fontSize: "15px" },
  headerSubtitle: { fontSize: "12px", color: C.subtleText },
  body: {
    padding: "24px",
    maxWidth: "1100px",
    margin: "0 auto",
  },
  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginBottom: "16px",
    alignItems: "center",
  },
  searchInput: {
    flex: "1 1 220px",
    padding: "9px 12px",
    borderRadius: "8px",
    border: `1.5px solid ${C.inputBorder}`,
    fontSize: "13px",
    fontFamily: C.font,
    outline: "none",
    background: C.white,
  },
  select: {
    padding: "9px 10px",
    borderRadius: "8px",
    border: `1.5px solid ${C.inputBorder}`,
    fontSize: "13px",
    fontFamily: C.font,
    background: C.white,
    cursor: "pointer",
    outline: "none",
  },
  clearButton: {
    padding: "9px 14px",
    borderRadius: "8px",
    border: `1.5px solid ${C.red}`,
    background: C.white,
    color: C.red,
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: C.font,
  },
  resultCount: {
    fontSize: "13px",
    color: C.mutedText,
    marginBottom: "10px",
  },
  tableWrapper: {
    background: C.white,
    borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  thead: {
    background: C.dark,
    color: C.white,
  },
  th: {
    padding: "12px 16px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.4px",
    textTransform: "uppercase",
  },
  tr: {
    borderBottom: `1px solid ${C.borderGrey}`,
    cursor: "pointer",
    transition: "background 0.15s",
  },
  td: {
    padding: "14px 16px",
    fontSize: "13px",
    color: C.dark,
    verticalAlign: "top",
  },
  emptyCell: {
    padding: "32px",
    textAlign: "center",
    color: C.mutedText,
    fontSize: "14px",
  },
};
