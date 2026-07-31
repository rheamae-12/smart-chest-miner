import { useCountUp } from "../hooks/useCountUp";
import { C, cardStyle } from "../theme";

export default function StatCard({ label, value, unit, color, sub, tone = "neutral" }) {
  const accent = color || (tone === "warning" ? C.amber : tone === "danger" ? C.red : tone === "success" ? C.green : C.cyan);
  const displayed = useCountUp(value);

  return (
    <div className="card-shimmer stat-card" style={{ ...cardStyle, padding: "15px 16px", minWidth: 0, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: "0 auto 0 0", width: 3, background: `linear-gradient(180deg, ${accent}, ${accent}88)` }} />
      <div style={{ position: "absolute", top: -38, right: -34, width: 92, height: 92, borderRadius: "50%", background: `${accent}18`, pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
        <span className="dot-live" style={{ width: 7, height: 7, borderRadius: "50%", background: accent, boxShadow: `0 0 14px ${accent}` }} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0, flexWrap: "wrap" }}>
        <span className="num-glow" style={{ fontSize: 28, fontWeight: 900, color: accent, overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1 }}>{displayed}</span>
        {unit && <span style={{ fontSize: 12, color: C.textMuted }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
