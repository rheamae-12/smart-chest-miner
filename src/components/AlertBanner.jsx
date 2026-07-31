import { useMemo } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";
import { C, cardStyle, ghostButtonStyle } from "../theme";
import { buildAlerts } from "../utils/alertChecker";

export default function AlertBanner({ miners, thresholds, dismissedAlertIds = [], onDismissAlerts }) {
  const allAlerts = useMemo(
    () => buildAlerts(miners, thresholds).sort((a, b) => severityRank(a) - severityRank(b)),
    [miners, thresholds],
  );
  const dismissedIds = useMemo(() => new Set(dismissedAlertIds), [dismissedAlertIds]);
  const alerts = useMemo(() => allAlerts.filter((alert) => !dismissedIds.has(alert.id)), [allAlerts, dismissedIds]);
  const minerNames = useMemo(() => new Map(miners.map((miner) => [miner.id, miner.name])), [miners]);
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = alerts.length - criticalCount;
  const hasAlerts = alerts.length > 0;
  const hiddenOnly = !hasAlerts && allAlerts.length > 0;
  const color = hasAlerts ? (criticalCount ? C.red : C.amber) : hiddenOnly ? C.offline : C.green;
  const title = hasAlerts ? "Active conditions need review" : hiddenOnly ? "Banner alerts hidden" : "System normal";
  const summary = hasAlerts
    ? `${criticalCount ? `${criticalCount} critical` : ""}${criticalCount && warningCount ? " · " : ""}${warningCount ? `${warningCount} warning` : ""}`
    : hiddenOnly
      ? `${allAlerts.length} condition${allAlerts.length === 1 ? "" : "s"} still visible in device status`
      : "No active warning or critical conditions";

  return (
    <section
      aria-live="polite"
      style={{
        ...cardStyle,
        display: "grid",
        gap: hasAlerts ? 10 : 0,
        padding: "12px 14px",
        borderColor: `${color}55`,
        background: `linear-gradient(100deg, ${color}12, rgba(10,17,21,0.97) 52%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
        <span
          style={{
            display: "grid",
            width: 30,
            height: 30,
            flex: "0 0 30px",
            placeItems: "center",
            borderRadius: 9,
            color,
            background: `${color}17`,
            border: `1px solid ${color}42`,
          }}
        >
          <Icon name={hasAlerts || hiddenOnly ? "alert" : "check"} size={15} color={color} />
        </span>
        <div style={{ minWidth: 150, flex: "1 1 220px" }}>
          <div style={{ color, fontSize: 12, fontWeight: 950, letterSpacing: "0.04em", textTransform: "uppercase" }}>{title}</div>
          <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{summary}</div>
        </div>
        <Link
          to="/alert-history"
          style={{
            ...ghostButtonStyle,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 10px",
            color: C.textDim,
            fontSize: 11,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Review history
          <span aria-hidden="true">→</span>
        </Link>
        {hasAlerts && (
          <button
            type="button"
            onClick={() => onDismissAlerts?.(alerts.map((alert) => alert.id))}
            title="Hide these alerts from this banner only"
            style={{ ...ghostButtonStyle, padding: "7px 10px", color: C.textMuted, fontSize: 11 }}
          >
            Hide from banner
          </button>
        )}
      </div>

      {hasAlerts && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 7 }}>
          {alerts.slice(0, 3).map((alert) => {
            const alertColor = alert.severity === "critical" ? C.red : C.amber;
            const minerName = minerNames.get(alert.deviceId) || alert.deviceId;
            const detail = alert.message.replace(new RegExp(`^${escapeRegExp(minerName)}:\\s*`, "i"), "");
            return (
              <div
                key={alert.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  minWidth: 0,
                  padding: "8px 9px",
                  borderRadius: 8,
                  border: `1px solid ${alertColor}35`,
                  borderLeft: `3px solid ${alertColor}`,
                  background: `${alertColor}0C`,
                }}
              >
                <span style={{ color: alertColor, fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>{alert.severity}</span>
                <span style={{ minWidth: 0, flex: 1, color: C.textDim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <strong style={{ color: C.text }}>{minerName}:</strong>{" "}
                  {detail}
                </span>
                <button
                  type="button"
                  onClick={() => onDismissAlerts?.([alert.id])}
                  title="Hide from this banner"
                  aria-label={`Hide ${alert.message}`}
                  style={{ width: 24, height: 24, flex: "0 0 24px", padding: 0, border: `1px solid ${C.borderSoft}`, borderRadius: 6, background: "rgba(255,255,255,0.03)", color: C.textMuted, cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            );
          })}
          {alerts.length > 3 && (
            <Link to="/alert-history" style={{ alignSelf: "center", color: C.primary, fontSize: 11, fontWeight: 850, textDecoration: "none" }}>
              +{alerts.length - 3} more in Alert History
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function severityRank(alert) {
  return alert.severity === "critical" ? 0 : 1;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
