import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FilterToolbar, { FilterField, FilterTabs } from "../components/FilterToolbar";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/useAuth";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";
import { dedupeConsecutiveLogs, formatSystemTimestamp } from "../utils/formatters";
import { DATE_RANGE_OPTIONS, isWithinDateRange, matchesAlertType, matchesSearch, resolveDateRange } from "../utils/filtering";

const ALERT_STATUS_KEY = "smart-chest-miner-alert-statuses";
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
  gridTemplateColumns: "150px 1fr 1fr 100px 150px 110px",
  minWidth: 780,
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
  gridTemplateColumns: "150px 1fr 1fr 100px 150px 110px",
  minWidth: 780,
  gap: 10,
  padding: "11px 14px",
  alignItems: "center",
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 12,
};

function readStoredStatuses() {
  try {
    const value = JSON.parse(localStorage.getItem(ALERT_STATUS_KEY) || "{}");
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return {};
  }
}

function isAlertEntry(log) {
  if (log.severity === "info") return false;
  if (log.type === "status" && log.status === "online") return false;
  return true;
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

function formatDuration(ms) {
  if (!ms || ms <= 0) return "N/A";
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}m ${secs}s`;
}

function timeAgo(ms) {
  if (!ms) return null;
  const diff = Date.now() - ms;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
  return formatTimestamp(ms);
}

function getStatusSetAt(id, status, statuses) {
  if (status === "acknowledged") return statuses[`${id}__ackAt`] || null;
  if (status === "resolved") return statuses[`${id}__resolvedAt`] || null;
  return statuses[`${id}__unresolvedAt`] || null;
}

export default function AlertHistoryPage({ activityLogs = [], onClearActivityLogs }) {
  const { user } = useAuth();
  const [alertStatuses, setAlertStatuses] = useState(readStoredStatuses);
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

  useEffect(() => {
    localStorage.setItem(ALERT_STATUS_KEY, JSON.stringify(alertStatuses));
  }, [alertStatuses]);

  const alertLogs = useMemo(
    () => dedupeConsecutiveLogs(
      activityLogs
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

  const unresolvedCount = alertLogs.filter((log) => (alertStatuses[log.id] || "unresolved") === "unresolved").length;
  const resolvedCount = alertLogs.filter((log) => alertStatuses[log.id] === "resolved").length;
  const acknowledgedCount = alertLogs.filter((log) => alertStatuses[log.id] === "acknowledged").length;
  const resolutionRate = alertLogs.length ? Math.round((resolvedCount / alertLogs.length) * 100) : 0;
  const oldestUnresolved = alertLogs
    .filter((log) => (alertStatuses[log.id] || "unresolved") === "unresolved")
    .reduce((oldest, log) => (!oldest || Number(log.timestamp || 0) < Number(oldest.timestamp || 0) ? log : oldest), null);

  const avgResponseMs = useMemo(() => {
    const times = alertLogs
      .filter((log) => {
        const st = alertStatuses[log.id];
        return st === "acknowledged" || st === "resolved";
      })
      .map((log) => {
        const ackAt = alertStatuses[`${log.id}__ackAt`];
        if (!ackAt || !log.timestamp || log.timestamp <= 0) return null;
        const diff = ackAt - log.timestamp;
        return diff > 0 ? diff : null;
      })
      .filter((ms) => ms !== null);
    return times.length ? times.reduce((sum, ms) => sum + ms, 0) / times.length : null;
  }, [alertLogs, alertStatuses]);

  const setStatus = (id, status) => {
    const now = Date.now();
    const who = user?.name || user?.email || user?.displayName || "Unknown";
    setAlertStatuses((prev) => ({
      ...prev,
      [id]: status,
      ...(status === "acknowledged" ? {
        [`${id}__ackAt`]: prev[`${id}__ackAt`] || now,
        [`${id}__ackBy`]: prev[`${id}__ackBy`] || who,
      } : {}),
      ...(status === "resolved" ? {
        [`${id}__resolvedAt`]: now,
        [`${id}__resolvedBy`]: who,
      } : {}),
      ...(status === "unresolved" ? {
        [`${id}__unresolvedAt`]: now,
        [`${id}__unresolvedBy`]: who,
      } : {}),
    }));
  };

  return (
    <div style={pageStyle}>
      {clearLogsOpen && (
        <Modal
          title="Clear All Logs"
          onClose={() => { if (!clearingLogs) setClearLogsOpen(false); }}
          actions={
            <>
              <button disabled={clearingLogs} onClick={() => setClearLogsOpen(false)} style={{ ...ghostButtonStyle, padding: "9px 15px", opacity: clearingLogs ? 0.5 : 1 }}>
                Cancel
              </button>
              <button disabled={clearingLogs} onClick={confirmClearLogs} style={{ ...primaryButtonStyle, padding: "9px 15px", opacity: clearingLogs ? 0.75 : 1 }}>
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
          status={alertStatuses[snapshotLog.id] || "unresolved"}
          setAt={getStatusSetAt(snapshotLog.id, alertStatuses[snapshotLog.id] || "unresolved", alertStatuses)}
          ackBy={alertStatuses[`${snapshotLog.id}__ackBy`] || null}
          resolvedBy={alertStatuses[`${snapshotLog.id}__resolvedBy`] || null}
          resolvedAt={alertStatuses[`${snapshotLog.id}__resolvedAt`] || null}
          onSetStatus={(s) => setStatus(snapshotLog.id, s)}
          onClose={() => setSnapshotLog(null)}
        />
      )}

      <div style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>

        {/* Header */}
        <PageHeader
          label="IoT Vital Signs Monitoring"
          title="Alert History"
          titleSize={26}
          subtitle="Full log of all critical and warning events, device offline events, and manual SOS alerts."
          right={
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <HeaderStat label="Unresolved" value={unresolvedCount} color={unresolvedCount > 0 ? C.red : C.green} />
              <HeaderStat label="Total Alerts" value={alertLogs.length} color={C.primary} />
              <HeaderStat label="Avg Response" value={avgResponseMs !== null ? formatDuration(avgResponseMs) : "--"} color={C.amber} />
            </div>
          }
        />

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
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 12, alignItems: "stretch", minHeight: 0, overflow: "hidden" }}>

          {/* Table */}
          <div style={{ ...cardStyle, display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr) auto", minHeight: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Alert Records</div>
                <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>Timestamp, miner, alert type, severity, and response status</div>
              </div>
              <button
                disabled={!alertLogs.length || !onClearActivityLogs}
                onClick={() => { setClearLogsError(""); setClearLogsOpen(true); }}
                title={!onClearActivityLogs ? "View-only account" : undefined}
                style={{ ...ghostButtonStyle, padding: "8px 11px", fontSize: 11, opacity: alertLogs.length && onClearActivityLogs ? 1 : 0.5, cursor: alertLogs.length && onClearActivityLogs ? "pointer" : "not-allowed" }}
              >
                Clear All Logs
              </button>
            </div>
            <div className="table-header-sticky" style={tableHeader}>
              <span>Timestamp</span>
              <span>Miner Name</span>
              <span>Alert Type</span>
              <span>Severity</span>
              <span>Status</span>
              <span>Action</span>
            </div>

            <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
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
                    status={alertStatuses[log.id] || "unresolved"}
                    setAt={getStatusSetAt(log.id, alertStatuses[log.id] || "unresolved", alertStatuses)}
                    onSetStatus={(s) => setStatus(log.id, s)}
                    onViewSnapshot={() => setSnapshotLog(log)}
                  />
                ))
              )}
            </div>

            {/* Pagination footer */}
            <div style={{ borderTop: `1px solid ${C.borderSoft}`, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>
                {filtered.length === 0
                  ? "No entries"
                  : `Showing ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} of ${filtered.length} entries`}
              </span>
              <Pagination page={safePage} totalPages={totalPages} onPage={setPage} />
            </div>
          </div>

          {/* Aside */}
          <aside style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 12, minHeight: 0, overflow: "hidden" }}>

            <InfoCard title="Resolution Workflow">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, paddingBottom: 11 }}>
                <div>
                  <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Completion rate</div>
                  <div style={{ color: resolutionRate === 100 ? C.green : C.amber, fontSize: 28, fontWeight: 950, marginTop: 5 }}>{resolutionRate}%</div>
                </div>
                <div style={{ color: C.textMuted, fontSize: 10 }}>{resolvedCount}/{alertLogs.length} alerts</div>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: C.borderSoft, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ width: `${resolutionRate}%`, height: "100%", background: resolutionRate === 100 ? C.green : C.amber }} />
              </div>
              <SummaryMetric label="Acknowledged" value={acknowledgedCount} color={C.amber} />
              <SummaryMetric label="Resolved" value={resolvedCount} color={C.green} />
              <SummaryMetric label="Oldest open" value={oldestUnresolved ? timeAgo(oldestUnresolved.timestamp) : "None"} color={oldestUnresolved ? C.red : C.green} />
            </InfoCard>

            <InfoCard title="Recent Critical Alerts">
              <div className="hide-scrollbar" style={{ overflow: "auto", flex: 1, display: "grid", gap: 8, alignContent: "start", minHeight: 0 }}>
                {alertLogs.filter((l) => l.severity === "critical").slice(0, 8).map((log) => (
                  <RecentAlertNote
                    key={log.id}
                    log={log}
                    status={alertStatuses[log.id] || "unresolved"}
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

function AlertRow({ log, alertType, status, setAt, onSetStatus, onViewSnapshot }) {
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
      <strong style={{ color: log.severity === "critical" ? C.red : C.amber }}>
        {log.severity === "critical" ? "Critical" : "Warning"}
      </strong>
      <StatusCell
        status={status}
        setAt={setAt}
        isCritical={log.severity === "critical"}
        onSetStatus={onSetStatus}
      />
      <button
        onClick={onViewSnapshot}
        style={{ ...ghostButtonStyle, padding: "5px 10px", fontSize: 11 }}
      >
        View Details
      </button>
    </div>
  );
}

const STATUS_OPTIONS = [
  {
    key: "unresolved",
    label: "Unresolved",
    color: C.red,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    key: "acknowledged",
    label: "Acknowledged",
    color: C.amber,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    key: "resolved",
    label: "Resolved",
    color: C.green,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
];

function StatusCell({ status, setAt, isCritical, onSetStatus }) {
  const [open, setOpen] = useState(false);
  const [flyoutPos, setFlyoutPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const flyoutRef = useRef(null);

  const current = STATUS_OPTIONS.find((o) => o.key === status) || STATUS_OPTIONS[0];
  const isPulsing = status === "unresolved" && isCritical;
  const sinceLabel = timeAgo(setAt);

  const FLYOUT_WIDTH = 200;
  const FLYOUT_HEIGHT = 168;

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // Prefer left-aligned; flip right if it would overflow the right edge
      let left = rect.left;
      if (left + FLYOUT_WIDTH > window.innerWidth - 8) {
        left = rect.right - FLYOUT_WIDTH;
      }
      left = Math.max(8, left);
      // Prefer opening downward; flip upward if near the bottom
      let top = rect.bottom + 5;
      if (top + FLYOUT_HEIGHT > window.innerHeight - 8) {
        top = rect.top - FLYOUT_HEIGHT - 5;
      }
      setFlyoutPos({ top, left });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!btnRef.current?.contains(e.target) && !flyoutRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const flyout = open
    ? createPortal(
        <div
          ref={flyoutRef}
          style={{
            position: "fixed",
            top: flyoutPos.top,
            left: flyoutPos.left,
            zIndex: 9999,
            width: FLYOUT_WIDTH,
            background: C.bg3,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.35)",
          }}
        >
          {STATUS_OPTIONS.map((opt) => {
            const isActive = opt.key === status;
            return (
              <button
                key={opt.key}
                onClick={() => { onSetStatus(opt.key); setOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 14px",
                  background: isActive ? `${opt.color}14` : "transparent",
                  borderLeft: `3px solid ${isActive ? opt.color : "transparent"}`,
                  border: "none",
                  borderBottom: `1px solid ${C.borderSoft}`,
                  color: isActive ? opt.color : C.textDim,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: isActive ? 900 : 700,
                  textAlign: "left",
                }}
              >
                <span style={{ color: opt.color, flexShrink: 0 }}>{opt.icon}</span>
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isActive && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: opt.color, flexShrink: 0 }} />
                )}
              </button>
            );
          })}
          {/* Footer: since timestamp */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", color: C.textMuted, fontSize: 11 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            {sinceLabel ? `Since: ${sinceLabel}` : "Status not yet changed"}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={btnRef} style={{ position: "relative", display: "inline-flex" }}>
      {/* Status pill button */}
      <button
        onClick={handleOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 9px 5px 7px",
          borderRadius: 7,
          border: `1px solid ${current.color}38`,
          background: `${current.color}14`,
          color: current.color,
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}
      >
        <span
          className={isPulsing ? "dot-live" : undefined}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: current.color,
            flexShrink: 0,
            ...(isPulsing ? { boxShadow: `0 0 8px ${current.color}` } : {}),
          }}
        />
        {current.label}
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: 0.7, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {flyout}
    </div>
  );
}

function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  const pages = buildPageNumbers(page, totalPages);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        style={{ ...ghostButtonStyle, padding: "4px 10px", fontSize: 11, opacity: page === 1 ? 0.4 : 1 }}
      >
        Previous
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} style={{ color: C.textMuted, fontSize: 12, padding: "0 3px" }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p)}
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
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
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
    if (i > 0 && p - sorted[i - 1] > 1) result.push("…");
    result.push(p);
  });
  return result;
}

function HeaderStat({ label, value, color }) {
  return (
    <div style={{ ...cardStyle, padding: "10px 14px", minWidth: 110 }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 950, marginTop: 5 }}>{value}</div>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <section style={{ ...cardStyle, padding: 15, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ color: C.text, fontSize: 14, fontWeight: 950, paddingBottom: 11, marginBottom: 12, borderBottom: `1px solid ${C.borderSoft}`, flexShrink: 0 }}>{title}</div>
      {children}
    </section>
  );
}

function SummaryMetric({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={{ color: C.textMuted, fontSize: 12 }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

function RecentAlertNote({ log, status, onClick }) {
  const statusColors = { unresolved: C.red, acknowledged: C.amber, resolved: C.green };
  const accentColor = log.severity === "critical" ? C.red : C.amber;
  return (
    <button
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 5 }}>
        <span style={{ color: C.textMuted, fontSize: 10 }}>{formatTimestamp(log.timestamp)}</span>
        <strong style={{ color: statusColors[status] || C.red, fontSize: 10 }}>{status}</strong>
      </div>
    </button>
  );
}

function SnapshotModal({ log, status, setAt, ackBy, resolvedBy, resolvedAt, onSetStatus, onClose }) {
  const alertType = deriveAlertType(log);
  const isCritical = log.severity === "critical";
  const statusColors = { unresolved: C.red, acknowledged: C.amber, resolved: C.green };
  const sinceLabel = timeAgo(setAt);

  return (
    <Modal
      title="Alert Snapshot"
      onClose={onClose}
      actions={
        <button onClick={onClose} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Close</button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{
          borderLeft: `3px solid ${isCritical ? C.red : C.amber}`,
          paddingLeft: 12, paddingTop: 4, paddingBottom: 4,
        }}>
          <div style={{ color: isCritical ? C.red : C.amber, fontSize: 14, fontWeight: 950 }}>{alertType}</div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{log.detail}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <SnapField label="Miner" value={log.miner || "—"} />
          <SnapField label="Device ID" value={log.deviceId || "—"} />
          <SnapField label="Timestamp" value={formatTimestamp(log.timestamp)} />
          <SnapField label="Severity" value={isCritical ? "Critical" : "Warning"} valueColor={isCritical ? C.red : C.amber} />
          <SnapField label="Event Type" value={log.type || "—"} />
          <SnapField label="Current Status" value={status} valueColor={statusColors[status] || C.red} />
          {sinceLabel && <SnapField label="Status Since" value={sinceLabel} />}
          {ackBy && <SnapField label="Acknowledged by" value={ackBy} valueColor={C.amber} />}
          {resolvedBy && resolvedAt && (
            <SnapField
              label="Resolved by"
              value={`${resolvedBy} at ${formatTimestamp(resolvedAt)}`}
              valueColor={C.green}
            />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 900 }}>Update Status</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { key: "acknowledged", label: "Acknowledge", color: C.amber },
              { key: "resolved", label: "Resolved", color: C.green },
              { key: "unresolved", label: "Unresolved", color: C.red },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => onSetStatus(key)}
                style={{
                  ...ghostButtonStyle,
                  flex: 1, padding: "8px 10px", fontSize: 11,
                  border: `1px solid ${status === key ? color : C.border}`,
                  color: status === key ? color : C.textMuted,
                  background: status === key ? `rgba(0,0,0,0.2)` : "rgba(255,255,255,0.04)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
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
