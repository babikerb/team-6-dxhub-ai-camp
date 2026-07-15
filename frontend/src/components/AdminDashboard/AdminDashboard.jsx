import { useState, useEffect, useCallback } from "react";
import { listRequests } from "../../api.js";
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

const ALL_STATUSES = [
  "Submitted",
  "ChatbotInProgress",
  "FlagsComputed",
  "UnderStaffReview",
  "Approved",
  "Denied",
];

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

  const [filterStatus, setFilterStatus] = useState("");
  const [filterFlag, setFilterFlag] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [search, setSearch] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRequests();
      setRequests(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Could not load requests.");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

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

    if (filterStatus && r.status !== filterStatus) return false;
    if (filterFlag) {
      if (filterFlag === "ati" && !flags.ati_flag) return false;
      if (filterFlag === "security" && !flags.security_flag) return false;
      if (filterFlag === "integration" && !flags.integration_flag) return false;
    }
    if (filterDept && requestor.department !== filterDept) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !(requestor.software_name || "").toLowerCase().includes(q) &&
        !(requestor.requested_for_name || "").toLowerCase().includes(q) &&
        !(requestor.department || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  function handleSaved(updatedRequest) {
    setRequests((prev) =>
      prev.map((r) => (r.request_id === updatedRequest.request_id ? updatedRequest : r))
    );
    setSelectedId(null);
  }

  const selected = requests.find((r) => r.request_id === selectedId) ?? null;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerBadge}>SDSU</div>
        <div>
          <div style={styles.headerTitle}>Admin Dashboard</div>
          <div style={styles.headerSubtitle}>Software Request Review</div>
        </div>
        <button
          type="button"
          style={styles.refreshButton}
          onClick={loadRequests}
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

        {error && (
          <div style={styles.errorBanner} role="alert">
            {error}{" "}
            <button type="button" style={styles.retryLink} onClick={loadRequests}>
              Retry
            </button>
          </div>
        )}

        <div style={styles.resultCount}>
          {loading
            ? "Loading requests…"
            : `${filtered.length} request${filtered.length !== 1 ? "s" : ""}`}
        </div>

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
                filtered.map((r) => {
                  const requestor = emptyRequestor(r.requestor);
                  const flags = emptyFlags(r.flags);
                  return (
                    <tr
                      key={r.request_id}
                      style={{
                        ...styles.tr,
                        background: selectedId === r.request_id ? "#FFF5F7" : C.white,
                      }}
                      onClick={() => setSelectedId(r.request_id)}
                    >
                      <td style={{ ...styles.td, fontWeight: 600 }}>
                        {requestor.software_name || "—"}
                      </td>
                      <td style={styles.td}>
                        <div>{requestor.requested_for_name || "—"}</div>
                        <div style={{ fontSize: "11px", color: C.mutedText }}>
                          {requestor.requested_for_email || ""}
                        </div>
                      </td>
                      <td style={styles.td}>{requestor.department || "—"}</td>
                      <td style={styles.td}>
                        <Badge label={r.status || "Unknown"} color={statusColor(r.status)} />
                      </td>
                      <td style={styles.td}>
                        <FlagPill value={flags.ati_flag} label="ATI" />
                        <FlagPill value={flags.security_flag} label="SEC" />
                        <FlagPill value={flags.integration_flag} label="INT" />
                      </td>
                      <td style={styles.td}>
                        {flags.risk_level ? (
                          <Badge
                            label={flags.risk_level}
                            color={riskColor(flags.risk_level)}
                          />
                        ) : (
                          <span style={{ color: C.subtleText, fontSize: "12px" }}>Pending</span>
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
    fontFamily: C.font,
  },
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
