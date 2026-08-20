import { useMemo, useState } from "react";
import FilterToolbar, { FilterField, FilterTabs } from "../components/FilterToolbar";
import Modal from "../components/Modal";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";
import { dedupeConsecutiveLogs, formatReading, formatSystemTimestamp } from "../utils/formatters";
import { DATE_RANGE_OPTIONS, isWithinDateRange, matchesAlertType, matchesSearch, resolveDateRange } from "../utils/filtering";

const PAGE_SIZE = 15;
const ALERT_FILTERS = [
  { value: "all", label: "All", longLabel: "All alert types" },
  { value: "critical", label: "Critical", longLabel: "Critical alerts" },
  { value: "warning", label: "Warning", longLabel: "Warning alerts" },
  { value: "offline", label: "Offline", longLabel: "Device offline alerts" },
  { value: "high-hr", label: "High HR", longLabel: "High heart-rate alerts" },
  { value: "low-spo2", label: "Low SpO2", longLabel: "Low SpO2 alerts" },
];

const tableHeader = {
  display: "grid",
  gridTemplateColumns: "150px 1fr 1fr 100px 110px",
  minWidth: 680,
  gap: 10,
  padding: "10px 14px",
  color: C.textMuted,
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  borderBottom: `1px solid ${C.borderSoft}`,
};

const tableRow = {
  display: "grid",
  gridTemplateColumns: "150px 1fr 1fr 100px 110px",
  minWidth: 680,
  gap: 10,
  padding: "11px 14px",
  alignItems: "center",
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 12,
};

// eslint-disable-next-line react-refresh/only-export-components
export function isAlertEntry(log) {
  if (log.type === "status" && log.status === "online") return false;
  if (log.type === "status" && log.status === "offline") return true;
  if (log.severity === "info") return false;
  return true;
}

function normalizeSessionStatusLogs(logs) {
  return logs.map((log) => {
    if (log.type !== "status" || log.status !== "offline") return log;
    // Offline is a session lifecycle state, not an alert level. If the operator
    // later marks the session interrupted, the explicit session-status event is
    // the actionable record shown in this page.
    return { ...log, severity: "info" };
  });
}

function deriveAlertType(log) {
  if (log.type === "manual_alert") return "Manual SOS";
  if (log.type === "status") return "Device Offline";
  const t = (log.title || "").toLowerCase();
  if (t.includes("heart rate") || t.includes("hr")) return log.status === "high" ? "High HR" : "Low HR";
  if (t.includes("spo2")) return log.status === "critical" ? "Critical SpO2" : "Low SpO2";
  if (t.includes("temp")) return log.status === "high" ? "High Temp" : "Low Temp";
  return log.title || "Alert";
}

// formatTimestamp — unified app timestamp, e.g. "JUNE 12, 2026 - 6:07 AM"
function formatTimestamp(ms) {
  if (!ms) return "—";
  return formatSystemTimestamp(ms);
}

export default function AlertHistoryPage({ activityLogs = [], onClearActivityLogs }) {
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  const [clearLogsError, setClearLogsError] = useState("");
  const [clearingLogs, setClearingLogs] = useState(false);
  const [rangePreset, setRangePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [minerSearch, setMinerSearch] = useState("");
  const [page, setPage] = useState(1);
  const [snapshotLog, setSnapshotLog] = useState(null);

  const alertLogs = useMemo(
    () => dedupeConsecutiveLogs(
      normalizeSessionStatusLogs(activityLogs)
        .filter(isAlertEntry)
        .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)),
    ),
    [activityLogs],
  );

  const confirmClearLogs = async () => {
    setClearingLogs(true);
    setClearLogsError("");
    try {
      await onClearActivityLogs?.();
      setClearLogsOpen(false);
    } catch (error) {
      setClearLogsError(error.message || "Unable to clear activity logs.");
    } finally {
      setClearingLogs(false);
    }
  };

  const dateRange = useMemo(
    () => resolveDateRange(rangePreset, { from: dateFrom, to: dateTo }),
    [dateFrom, dateTo, rangePreset],
  );

  const filtered = useMemo(() => {
    return alertLogs.filter((log) => {
      if ((dateRange.start || dateRange.end) && !isWithinDateRange(log.timestamp, dateRange)) return false;
      if (!matchesAlertType(log, typeFilter)) return false;
      if (!matchesSearch(minerSearch, log.miner, log.deviceId, log.title, log.detail)) return false;
      return true;
    });
  }, [alertLogs, dateRange, typeFilter, minerSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const activeFilterCount = Number(rangePreset !== "all") + Number(typeFilter !== "all") + Number(Boolean(minerSearch.trim()));
  const filterTypeLabel = ALERT_FILTERS.find((option) => option.value === typeFilter)?.longLabel || "All alert types";
  const dateLabel = DATE_RANGE_OPTIONS.find((option) => option.value === rangePreset)?.label || "All time";

  return (
    <div style={pageStyle}>
      {clearLogsOpen && (
        <Modal
          title="Clear All Logs"
          onClose={() => { if (!clearingLogs) setClearLogsOpen(false); }}
          actions={
            <>
              <button type="button" disabled={clearingLogs} onClick={() => setClearLogsOpen(false)} style={{ ...ghostButtonStyle, padding: "9px 15px", opacity: clearingLogs ? 0.5 : 1 }}>
                Cancel
              </button>
              <button type="button" disabled={clearingLogs} onClick={confirmClearLogs} style={{ ...primaryButtonStyle, padding: "9px 15px", opacity: clearingLogs ? 0.75 : 1 }}>
                {clearingLogs ? "Clearing..." : "Confirm Clear"}
              </button>
            </>
          }
        >
          <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.55 }}>
            Clear all alert log entries from Firebase? This removes the stored records and cannot be undone.
          </div>
          {clearLogsError && <div style={{ color: C.amber, fontSize: 12, marginTop: 10 }}>{clearLogsError}</div>}
        </Modal>
      )}

      {snapshotLog && (
        <SnapshotModal
          log={snapshotLog}
          onClose={() => setSnapshotLog(null)}
        />
      )}

      <div className="alert-history-layout page-layout" style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        {/* Filters */}
        <FilterToolbar
          summary={`${filterTypeLabel} · ${dateLabel} · ${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
          activeCount={activeFilterCount}
          onReset={() => { setRangePreset("all"); setDateFrom(""); setDateTo(""); setTypeFilter("all"); setMinerSearch(""); setPage(1); }}
        >
          <FilterField label="Date range">
            <FilterTabs
              ariaLabel="Alert date range"
              value={rangePreset}
              onChange={(value) => { setRangePreset(value); setPage(1); }}
              options={DATE_RANGE_OPTIONS}
            />
          </FilterField>
          {rangePreset === "custom" && (
            <>
              <FilterField label="Start date">
                <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} style={{ ...controlStyle, width: 148, padding: "8px 10px" }} />
              </FilterField>
              <FilterField label="End date">
                <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} style={{ ...controlStyle, width: 148, padding: "8px 10px" }} />
              </FilterField>
            </>
          )}
          <FilterField label="Alert type">
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              style={{ ...controlStyle, width: 170 }}
            >
              <option value="all">All Types</option>
              <option value="critical">Critical Only</option>
              <option value="warning">Warning Only</option>
              <option value="high-hr">High HR</option>
              <option value="low-spo2">Low SpO2</option>
              <option value="offline">Device Offline</option>
            </select>
          </FilterField>
          <FilterField label="Search" wide>
            <input
              type="text"
              placeholder="Miner, device, or alert…"
              value={minerSearch}
              onChange={(e) => { setMinerSearch(e.target.value); setPage(1); }}
              style={{ ...controlStyle }}
            />
          </FilterField>
        </FilterToolbar>

        {/* Main + Aside */}
        <section className="alert-history-main" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 12, alignItems: "stretch", minHeight: 0, overflow: "hidden" }}>

          {/* Table */}
          <div style={{ ...cardStyle, display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr) auto", minHeight: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Alert Records</div>
                <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>Timestamp, miner, alert type, and level</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={{ color: C.textMuted, fontSize: 11, fontWeight: 800 }}>{alertLogs.length} total alert{alertLogs.length === 1 ? "" : "s"} recorded</span>
                <button
                  type="button"
                  disabled={!alertLogs.length || !onClearActivityLogs}
                  onClick={() => { setClearLogsError(""); setClearLogsOpen(true); }}
                  title={!onClearActivityLogs ? "View-only account" : undefined}
                  style={{ ...ghostButtonStyle, padding: "8px 11px", fontSize: 11, opacity: alertLogs.length && onClearActivityLogs ? 1 : 0.5, cursor: alertLogs.length && onClearActivityLogs ? "pointer" : "not-allowed" }}
                >
                  Clear All Logs
                </button>
              </div>
            </div>
            <div className="table-header-sticky" style={tableHeader}>
              <span>Timestamp</span>
              <span>Miner Name</span>
              <span>Alert Type</span>
              <span>Level</span>
              <span>Action</span>
            </div>

            <div className="hide-scrollbar table-scroll-x" style={{ overflow: "auto", minHeight: 0 }}>
              {pageRows.length === 0 ? (
                <div style={{ padding: 42, color: C.textMuted, textAlign: "center", fontSize: 13 }}>
                  No alert records match the current filters.
                </div>
              ) : (
                pageRows.map((log) => (
                  <AlertRow
                    key={log.id}
                    log={log}
                    alertType={deriveAlertType(log)}
                    onViewSnapshot={() => setSnapshotLog(log)}
                  />
                ))
              )}
            </div>

            {/* Pagination footer */}
            <div className="alert-history-pagination" style={{ borderTop: `1px solid ${C.borderSoft}`, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span className="alert-history-entry-summary" style={{ fontSize: 11, color: C.textMuted }}>
                {filtered.length === 0
                  ? "No entries"
                  : `Showing ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} of ${filtered.length} entries`}
              </span>
              <Pagination page={safePage} totalPages={totalPages} onPage={setPage} />
            </div>
          </div>

          {/* Aside */}
          <aside style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr)", gap: 12, minHeight: 0, overflow: "hidden" }}>
            <InfoCard title="Recent Critical Alerts">
              <div className="hide-scrollbar" style={{ overflow: "auto", flex: 1, display: "grid", gap: 8, alignContent: "start", minHeight: 0 }}>
                {alertLogs.filter((l) => l.severity === "critical").slice(0, 8).map((log) => (
                  <RecentAlertNote
                    key={log.id}
                    log={log}
                    onClick={() => setSnapshotLog(log)}
                  />
                ))}
                {alertLogs.filter((l) => l.severity === "critical").length === 0 && (
                  <div style={{ color: C.textMuted, fontSize: 12 }}>No critical alerts recorded.</div>
                )}
              </div>
            </InfoCard>

          </aside>
        </section>
      </div>
    </div>
  );
}

function AlertRow({ log, alertType, onViewSnapshot }) {
  const offline = log.type === "status" && log.status === "offline";
  const levelColor = alertLevelColor(offline, log.severity);
  const levelLabel = alertLevelLabel(offline, log.severity);
  return (
    <div className="data-row" style={tableRow}>
      <span style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11 }}>
        {formatTimestamp(log.timestamp)}
      </span>
      <div>
        <div style={{ color: C.text, fontWeight: 900 }}>{log.miner || "—"}</div>
        <div style={{ color: C.textMuted, fontSize: 10, marginTop: 2 }}>{log.deviceId}</div>
      </div>
      <span style={{ color: C.textDim }}>{alertType}</span>
      <strong style={{ color: levelColor }}>{levelLabel}</strong>
      <button
        type="button"
        onClick={onViewSnapshot}
        style={{ ...ghostButtonStyle, padding: "5px 10px", fontSize: 11 }}
      >
        View Details
      </button>
    </div>
  );
}

function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  const pages = buildPageNumbers(page, totalPages);

  return (
    <div className="alert-history-pagination-nav" style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
        className="pagination-button"
        style={{ ...ghostButtonStyle, padding: "4px 10px", fontSize: 11, opacity: page === 1 ? 0.4 : 1 }}
      >
        Previous
      </button>
      {pages.map((p) =>
        typeof p === "string" && p.startsWith("ellipsis-") ? (
          <span key={p} style={{ color: C.textMuted, fontSize: 12, padding: "0 3px" }}>…</span>
        ) : (
          <button
            type="button"
            key={p}
            onClick={() => onPage(p)}
            aria-label={`Go to page ${p}`}
            className={`pagination-button${p === page ? " is-current" : ""}`}
            style={{
              ...ghostButtonStyle,
              padding: "4px 9px",
              fontSize: 11,
              border: `1px solid ${p === page ? C.primary : C.border}`,
              color: p === page ? C.primary : C.textDim,
              background: p === page ? "rgba(255,106,0,0.12)" : "rgba(255,255,255,0.03)",
            }}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
        className="pagination-button"
        style={{ ...ghostButtonStyle, padding: "4px 10px", fontSize: 11, opacity: page === totalPages ? 0.4 : 1 }}
      >
        Next
      </button>
    </div>
  );
}

function buildPageNumbers(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, page, page - 1, page + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(`ellipsis-${sorted[i - 1]}-${p}`);
    result.push(p);
  });
  return result;
}

function InfoCard({ title, children }) {
  return (
    <section style={{ ...cardStyle, padding: 15, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ color: C.text, fontSize: 14, fontWeight: 950, paddingBottom: 11, marginBottom: 12, borderBottom: `1px solid ${C.borderSoft}`, flexShrink: 0 }}>{title}</div>
      {children}
    </section>
  );
}

function RecentAlertNote({ log, onClick }) {
  const accentColor = log.severity === "critical" ? C.red : C.amber;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        border: `1px solid ${C.borderSoft}`, borderLeft: `3px solid ${accentColor}`,
        borderRadius: 7, padding: "9px 12px",
        background: "rgba(255,255,255,0.02)", cursor: "pointer",
      }}
    >
      <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>{log.miner || log.deviceId}</div>
      <div style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.4, marginTop: 3 }}>{log.title}</div>
      <div style={{ color: C.textMuted, fontSize: 10, marginTop: 5 }}>{formatTimestamp(log.timestamp)}</div>
    </button>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatAlertReading(log) {
  const text = `${log?.title || ""} ${log?.detail || ""}`;
  const metric = alertMetric(text);
  const explicitUnit = normalizeAlertUnit(log?.unit || log?.readingUnit);
  const unit = explicitUnit || { hr: "bpm", spo2: "%", temp: "\u00b0C" }[metric] || "";
  const digits = metric === "temp" ? 1 : 0;
  const unitSuffix = unit ? ` ${unit}` : "";
  const directCandidates = [log?.reading, log?.readingValue, log?.value, log?.currentValue];
  const directValue = directCandidates
    .map((candidate) => {
      const numericValue = Number(candidate);
      if (Number.isFinite(numericValue)) return numericValue;
      const textValue = /-?\d+(?:\.\d+)?/.exec(String(candidate || ""));
      return textValue ? Number(textValue[0]) : 0;
    })
    .find((value) => Number.isFinite(value) && value > 0);
  if (directValue) return `${formatReading(directValue, digits)}${unitSuffix}`;

  const fieldValue = alertFieldValue(log, metric);
  const numericFieldValue = Number(fieldValue);
  if (Number.isFinite(numericFieldValue) && numericFieldValue > 0) {
    return `${formatReading(numericFieldValue, digits)}${unitSuffix}`;
  }

  // Older activity records did not persist a separate reading field. Recover
  // the value from their title/detail text so historical snapshots remain useful.
  const value = extractAlertReading(text, metric);
  if (!value) return "—";
  return `${formatReading(Number(value), digits)}${unitSuffix}`;
}

function normalizeAlertUnit(value) {
  const unit = String(value || "").trim().toLowerCase();
  if (unit.includes("bpm")) return "bpm";
  if (unit.includes("%")) return "%";
  const compactUnit = unit.replace(/[^a-z°]/g, "");
  if (compactUnit === "c" || compactUnit === "°c") return "°C";
  return "";
}

function alertMetric(text) {
  if (/\b(?:heart\s*rate|hr)\b/i.test(text)) return "hr";
  if (/(?:spo2|spo₂)/i.test(text)) return "spo2";
  if (/\b(?:temperature|temp)\b/i.test(text)) return "temp";
  return "";
}

function extractAlertReading(text, metric) {
  const units = { hr: "bpm", spo2: "%", temp: "c" };
  const unit = units[metric];
  if (!unit) return "";
  const unitIndex = text.toLowerCase().lastIndexOf(unit);
  if (unitIndex < 0) return "";
  const tokens = text.slice(0, unitIndex).split(/[^0-9.-]+/).filter(Boolean);
  return tokens.at(-1) || "";
}

function alertLevelColor(offline, severity) {
  if (offline) return C.offline;
  return severity === "critical" ? C.red : C.amber;
}

function alertLevelLabel(offline, severity) {
  if (offline) return "Offline";
  return severity === "critical" ? "Critical" : "Warning";
}

function snapshotLevelLabel(offline, critical) {
  if (offline) return "Offline";
  return critical ? "Critical" : "Warning";
}

function snapshotLevelColor(offline, critical) {
  if (offline) return C.offline;
  return critical ? C.red : C.amber;
}

function alertFieldValue(log, metric) {
  if (metric === "hr") return log?.hr;
  if (metric === "spo2") return log?.spo2;
  if (metric === "temp") return log?.temp;
  return null;
}

function SnapshotModal({ log, onClose }) {
  const alertType = deriveAlertType(log);
  const isCritical = log.severity === "critical";
  const isOffline = log.type === "status" && log.status === "offline";

  return (
    <Modal
      title="Alert Snapshot"
      onClose={onClose}
      width={620}
      actions={
        <button type="button" onClick={onClose} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Close</button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{
          borderLeft: `3px solid ${isCritical ? C.red : C.amber}`,
          padding: "12px 14px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.025)",
          borderTop: `1px solid ${C.borderSoft}`,
          borderRight: `1px solid ${C.borderSoft}`,
          borderBottom: `1px solid ${C.borderSoft}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ color: isCritical ? C.red : C.amber, fontSize: 14, fontWeight: 950 }}>{alertType}</div>
          </div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{log.detail}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <SnapField label="Miner" value={log.miner || "—"} />
          <SnapField label="Device ID" value={log.deviceId || "—"} />
          <SnapField label="Timestamp" value={formatTimestamp(log.timestamp)} />
          <SnapField label="Reading" value={formatAlertReading(log)} />
          <SnapField label="Level" value={snapshotLevelLabel(isOffline, isCritical)} valueColor={snapshotLevelColor(isOffline, isCritical)} />
          <SnapField label="Event Type" value={log.type || "—"} />
        </div>

      </div>
    </Modal>
  );
}

function SnapField({ label, value, valueColor }) {
  return (
    <div style={{ padding: "9px 12px", background: "rgba(255,255,255,0.025)", borderRadius: 8, border: `1px solid ${C.borderSoft}` }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 900, color: valueColor || C.text, marginTop: 4 }}>{value}</div>
    </div>
  );
}
