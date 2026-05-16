import { C, cardStyle } from "../theme";

export default function StatCard({ label, value, unit, color, sub }) {
  return (
    <div style={{ ...cardStyle, padding: "14px 18px", minWidth: 120 }}>
      <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: color || C.text }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: C.textMuted }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
