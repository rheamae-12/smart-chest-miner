import { C, cardStyle, moduleLabel } from "../theme";

// PageHeader — standard page header card used across every page. Mirrors the
// navbar/sidebar accent-rail motif: an orange gradient rail, an uppercase module
// label, the page title, and an optional subtitle, with a right-side slot for
// stats, filters, or actions. Keeps all pages visually uniform.
export default function PageHeader({ label, title, subtitle, right, titleSize = 24, padding = 16 }) {
  return (
    <section
      className="page-header"
      style={{
        ...cardStyle,
        padding,
        display: "flex",
        justifyContent: "space-between",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div className="page-header-copy" style={{ display: "flex", alignItems: "stretch", gap: 13, minWidth: 0 }}>
        <div
          style={{
            width: 3,
            minHeight: 36,
            borderRadius: 3,
            background: C.primaryGradient,
            boxShadow: "0 0 14px rgba(255,106,0,0.4)",
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {label && <div style={moduleLabel}>{label}</div>}
          <div style={{ color: C.text, fontSize: titleSize, fontWeight: 950, marginTop: label ? 3 : 0, lineHeight: 1.12, letterSpacing: "0.01em" }}>{title}</div>
          {subtitle && <div style={{ color: C.textMuted, fontSize: 12, marginTop: 5, lineHeight: 1.5 }}>{subtitle}</div>}
        </div>
      </div>
      {right && (
        <div className="page-header-actions" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {right}
        </div>
      )}
    </section>
  );
}
