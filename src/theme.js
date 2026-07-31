// Design tokens — all colors, layout, and style constants used across the app.
// Import from here instead of hardcoding values inline.

// Color palette — semantic names map to the dark-panel UI
export const C = {
  // Backgrounds (darkest → lightest)
  bg0: "#070B0E",
  bg1: "#0B1115",
  bg2: "#10181D",
  bg3: "#162128",
  bg4: "#05080A",
  panel: "#10181D",
  sidebar: "rgba(8, 13, 17, 0.97)",
  navbar: "rgba(9, 15, 19, 0.91)",

  // Borders
  border: "#24343D",
  borderSoft: "rgba(184, 214, 226, 0.10)",

  // Brand / accent
  primary: "#FF7A1A",
  primaryHover: "#FF9B4A",
  orange: "#FF7A1A",
  amber: "#F6AD3C",
  amberD: "#C66E10",
  cyan: "#38BDF8",
  cyanD: "#0E7490",
  oxygen: "#38BDF8",
  blue: "#60A5FA",
  violet: "#A78BFA",

  // Status colors
  red: "#FB5B5B",
  green: "#35D07F",
  lime: "#84CC6A",
  teal: "#2DD4BF",   // body temperature sensor
  offline: "#63727B",

  // Typography
  text: "#EDF7FA",
  textMuted: "#81959F",
  textDim: "#C5D5DB",

  // Elevation
  shadow: "0 26px 80px rgba(0, 0, 0, 0.52)",
  primaryGradient: "linear-gradient(135deg, #FF9A3D 0%, #FF6A0A 58%, #D94B00 100%)",
};

// Sidebar route → navbar page title mapping
export const pageLabels = {
  "/command": "Command Center",
  "/dashboard": "Live Monitoring",
  "/analytics": "Analytics",
  "/devices": "Device Registry",
  "/health-logs": "Health Logs",
  "/sensor-status": "Sensor Status",
  "/wifi-config": "WiFi Configuration",
  "/alert-history": "Alert History",
  "/settings": "System Config",
};

// Base card style — used by every panel/section card in the app
export const cardStyle = {
  background: "linear-gradient(145deg, rgba(19,30,36,0.96), rgba(10,17,21,0.97))",
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025), 0 18px 44px rgba(0,0,0,0.24)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, background 0.2s ease",
};

// Page wrapper — scrollable, full-height, consistent padding
export const pageStyle = {
  padding: "20px 22px",
  overflow: "hidden",
  overflowX: "hidden",
  height: "100%",
  minHeight: 0,
  boxSizing: "border-box",
};

// Form control base — inputs, selects, textareas
export const controlStyle = {
  background: "rgba(5, 10, 13, 0.72)",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
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
  borderRadius: 10,
  background: C.primaryGradient,
  color: C.text,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 12px 28px rgba(255, 106, 0, 0.20), inset 0 1px 0 rgba(255,255,255,0.18)",
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
  borderRadius: 10,
  background: "rgba(183, 214, 226, 0.035)",
  color: C.textDim,
  cursor: "pointer",
  transition: "border-color 0.18s ease, color 0.18s ease, background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease",
};
