import { useMemo } from "react";
import { C, cardStyle } from "../theme";
import { buildAlerts } from "../utils/alertChecker";

export default function AlertBanner({ miners, thresholds, dismissedAlertIds = [], onDismissAlerts }) {
  const allAlerts = useMemo(() => buildAlerts(miners, thresholds), [miners, thresholds]);
  const alerts = useMemo(
    () => allAlerts.filter((alert) => !dismissedAlertIds.includes(alert.id)),
    [allAlerts, dismissedAlertIds],
  );
  const hasAlerts = alerts.length > 0;
  const hasDismissedAlerts = !hasAlerts && allAlerts.length > 0;
  const toneColor = hasAlerts ? C.red : hasDismissedAlerts ? C.offline : C.green;
  const toneBorder = hasAlerts ? "rgba(244,63,94,0.44)" : hasDismissedAlerts ? "rgba(107,114,128,0.34)" : "rgba(34,197,94,0.28)";
  const toneBackground = hasAlerts ? "rgba(244,63,94,0.1)" : hasDismissedAlerts ? "rgba(107,114,128,0.08)" : "rgba(34,197,94,0.06)";

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
            style={{ marginLeft: "auto", border: `1px solid ${C.border}`, borderRadius: 6, background: "rgba(255,255,255,0.03)", color: C.textMuted, cursor: "pointer", fontSize: 11, padding: "5px 8px" }}
          >
            Dismiss all
          </button>
        )}
      </div>
      <div className="hide-scrollbar" style={{ display: "flex", flexWrap: "wrap", gap: 8, overflow: "auto", minHeight: 0, alignContent: "start" }}>
        {hasAlerts ? (
          alerts.map((alert) => (
            <button
              key={alert.id}
              onClick={() => onDismissAlerts?.([alert.id])}
              style={{
                fontSize: 11,
                color: alert.severity === "critical" ? C.red : C.amber,
                background: alert.severity === "critical" ? "rgba(244,63,94,0.12)" : "rgba(245,158,11,0.12)",
                padding: "6px 10px",
                borderRadius: 7,
                border: `1px solid ${alert.severity === "critical" ? "rgba(244,63,94,0.35)" : "rgba(245,158,11,0.35)"}`,
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
