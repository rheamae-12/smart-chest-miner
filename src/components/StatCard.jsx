import { C, cardStyle } from "../theme";

export default function StatCard({ label, value, unit, color, sub }) {
  return (
    <div style={{ ...cardStyle, padding: "14px 18px", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: color || C.text, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: C.textMuted }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
