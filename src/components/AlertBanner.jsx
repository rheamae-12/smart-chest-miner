import { useMemo } from "react";
import { C, cardStyle } from "../theme";
import { buildAlerts } from "../utils/alertChecker";

// AlertBanner — fixed-height banner at the top of the Dashboard.
// Shows active alert pills (click to dismiss), a "dismissed" state, or green "System Normal".
export default function AlertBanner({ miners, thresholds, dismissedAlertIds = [], onDismissAlerts }) {
  // Derive full alert list and filter out already-dismissed IDs
  const allAlerts = useMemo(() => buildAlerts(miners, thresholds), [miners, thresholds]);
  const alerts = useMemo(
    () => allAlerts.filter((alert) => !dismissedAlertIds.includes(alert.id)),
    [allAlerts, dismissedAlertIds],
  );
  const hasAlerts = alerts.length > 0;
  const hasDismissedAlerts = !hasAlerts && allAlerts.length > 0;

  // Banner tone changes based on alert presence / dismissal state
  const toneColor = hasAlerts ? C.red : hasDismissedAlerts ? C.offline : C.green;
  const toneBorder = hasAlerts ? `${C.red}70` : hasDismissedAlerts ? `${C.offline}57` : `${C.green}47`;
  const toneBackground = hasAlerts ? `${C.red}1A` : hasDismissedAlerts ? `${C.offline}14` : `${C.green}0F`;

  return (
    <div
      style={{
        ...cardStyle,
        border: `1px solid ${toneBorder}`,
        padding: "12px 14px",
        background: toneBackground,
        height: 90,
        boxSizing: "border-box",
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: toneColor, boxShadow: hasDismissedAlerts ? "none" : `0 0 12px ${toneColor}` }} />
        <div style={{ fontSize: 12, fontWeight: 900, color: toneColor, letterSpacing: "0.08em" }}>{hasAlerts ? "SYSTEM ALERTS" : hasDismissedAlerts ? "ALERTS DISMISSED" : "SYSTEM NORMAL"}</div>
        <div style={{ color: C.textMuted, fontSize: 11 }}>{hasAlerts ? `${alerts.length} active condition${alerts.length === 1 ? "" : "s"}` : hasDismissedAlerts ? `${allAlerts.length} hidden condition${allAlerts.length === 1 ? "" : "s"}` : "No active banner conditions"}</div>
        {hasAlerts && (
          <button
            onClick={() => onDismissAlerts?.(alerts.map((alert) => alert.id))}
            title="Dismiss all active alerts from this banner"
            style={{ marginLeft: "auto", border: `1px solid ${C.border}`, borderRadius: 6, background: "rgba(255,255,255,0.03)", color: C.textMuted, cursor: "pointer", fontSize: 11, padding: "5px 8px" }}
          >
            Dismiss all
          </button>
        )}
      </div>
      <div className="hide-scrollbar" style={{ display: "flex", flexWrap: "wrap", gap: 8, overflow: "auto", minHeight: 0, alignContent: "start" }}>
        {hasAlerts ? (
          // Each pill dismisses a single alert on click
          alerts.map((alert) => (
            <button
              key={alert.id}
              onClick={() => onDismissAlerts?.([alert.id])}
              title={`Dismiss: ${alert.message}`}
              style={{
                fontSize: 11,
                color: alert.severity === "critical" ? C.red : C.amber,
                background: alert.severity === "critical" ? `${C.red}1F` : `${C.amber}1F`,
                padding: "6px 10px",
                borderRadius: 7,
                border: `1px solid ${alert.severity === "critical" ? `${C.red}59` : `${C.amber}59`}`,
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              {alert.message}
            </button>
          ))
        ) : hasDismissedAlerts ? (
          <span style={{ color: C.textMuted, fontSize: 12, alignSelf: "center" }}>Alerts are hidden only from this banner; device status is still offline or warning where shown.</span>
        ) : (
          <span style={{ color: C.textMuted, fontSize: 12, alignSelf: "center" }}>Live monitoring remains in the same layout while miner status changes.</span>
        )}
      </div>
    </div>
  );
}
