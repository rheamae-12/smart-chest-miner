import { C, cardStyle } from "../theme";

export default function StatCard({ label, value, unit, color, sub, tone = "neutral" }) {
  const accent = color || (tone === "warning" ? C.amber : tone === "danger" ? C.red : tone === "success" ? C.green : C.cyan);

  return (
    <div style={{ ...cardStyle, padding: "15px 16px", minWidth: 0, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: "0 auto 0 0", width: 3, background: accent }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, boxShadow: `0 0 14px ${accent}` }} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 28, fontWeight: 850, color: accent, overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: C.textMuted }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
