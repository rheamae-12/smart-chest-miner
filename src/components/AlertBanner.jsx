import { useMemo, useState } from "react";
import { C, cardStyle } from "../theme";
import { buildAlerts } from "../utils/alertChecker";

export default function AlertBanner({ miners, thresholds }) {
  const [dismissed, setDismissed] = useState([]);
  const alerts = useMemo(
    () => buildAlerts(miners, thresholds).filter((alert) => !dismissed.includes(alert.id)),
    [dismissed, miners, thresholds],
  );

  if (alerts.length === 0) return null;

  return (
    <div style={{ ...cardStyle, border: "1px solid rgba(239,68,68,0.4)", padding: "12px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.red, letterSpacing: "0.08em" }}>SYSTEM ALERTS</div>
        <button
          onClick={() => setDismissed(alerts.map((alert) => alert.id))}
          style={{ marginLeft: "auto", border: "none", background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 11 }}
        >
          Dismiss all
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {alerts.map((alert) => (
          <button
            key={alert.id}
            onClick={() => setDismissed((items) => [...items, alert.id])}
            style={{
              fontSize: 11,
              color: alert.severity === "critical" ? "#fca5a5" : C.amber,
              background: alert.severity === "critical" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
              padding: "4px 10px",
              borderRadius: 5,
              border: "none",
              cursor: "pointer",
            }}
          >
            {alert.message}
          </button>
        ))}
      </div>
    </div>
  );
}
