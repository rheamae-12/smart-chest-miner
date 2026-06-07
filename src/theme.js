// Design tokens — all colors, layout, and style constants used across the app.
// Import from here instead of hardcoding values inline.

// Color palette — semantic names map to the dark-panel UI
export const C = {
  // Backgrounds (darkest → lightest)
  bg0: "#0D0F10",
  bg1: "#121416",
  bg2: "#17191C",
  bg3: "#1E2125",
  bg4: "#090A0B",
  panel: "#17191C",
  sidebar: "#111315",
  navbar: "rgba(18, 20, 22, 0.94)",

  // Borders
  border: "#2B3036",
  borderSoft: "rgba(226, 232, 240, 0.08)",

  // Brand / accent
  primary: "#FF6A00",
  primaryHover: "#FF8C1A",
  orange: "#FF6A00",
  amber: "#FF8C1A",
  amberD: "#CC5500",
  cyan: "#FF6A00",
  cyanD: "#FF8C1A",
  blue: "#FF8C1A",
  violet: "#FF8C1A",

  // Status colors
  red: "#EF4444",
  green: "#22C55E",
  lime: "#22C55E",
  teal: "#14B8A6",   // body temperature sensor
  offline: "#6B7280",

  // Typography
  text: "#F8FAFC",
  textMuted: "#94A3B8",
  textDim: "#CBD5E1",

  // Elevation
  shadow: "0 22px 70px rgba(0, 0, 0, 0.44)",
  primaryGradient: "linear-gradient(180deg, #FF8A1D 0%, #FF5A00 100%)",
};

// Sidebar route → navbar page title mapping
export const pageLabels = {
  "/dashboard": "Live Monitoring",
  "/analytics": "Analytics",
  "/devices": "Device Registry",
  "/health-logs": "Health Logs",
  "/sensor-status": "Sensor Status",
  "/wifi-config": "WiFi Configuration",
  "/settings": "System Config",
};

// Base card style — used by every panel/section card in the app
export const cardStyle = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.018))",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  boxShadow: "0 18px 42px rgba(0, 0, 0, 0.22)",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, background 0.2s ease",
};

// Page wrapper — scrollable, full-height, consistent padding
export const pageStyle = {
  padding: "18px 20px",
  overflow: "auto",
  overflowX: "hidden",
  height: "100%",
  boxSizing: "border-box",
};

// Form control base — inputs, selects, textareas
export const controlStyle = {
  background: C.bg3,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  padding: "10px 12px",
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
};

// Primary CTA button — orange gradient, use for save/confirm actions
export const primaryButtonStyle = {
  border: "none",
  borderRadius: 8,
  background: C.primaryGradient,
  color: C.text,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(255, 106, 0, 0.18)",
  transition: "background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease",
};

// Small uppercase section label — e.g. "Sensor analytics", "Live HR + SpO2 readings"
export const moduleLabel = {
  color: C.primary,
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 900,
};

// Secondary / outline button — use for cancel, discard, and secondary actions
export const ghostButtonStyle = {
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  background: "rgba(255, 255, 255, 0.04)",
  color: C.textDim,
  cursor: "pointer",
  transition: "border-color 0.18s ease, color 0.18s ease, background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease",
};
