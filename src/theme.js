export const C = {
  bg0: "#111111",
  bg1: "#181818",
  bg2: "#1B1B1B",
  bg3: "#202020",
  bg4: "#0C0C0C",
  panel: "#1B1B1B",
  sidebar: "#141414",
  navbar: "#181818",
  border: "#2A2A2A",
  borderSoft: "rgba(255, 255, 255, 0.08)",
  primary: "#FF6A00",
  primaryHover: "#FF8C1A",
  orange: "#FF6A00",
  amber: "#FF8C1A",
  amberD: "#CC5500",
  cyan: "#FF6A00",
  cyanD: "#FF8C1A",
  blue: "#FF8C1A",
  violet: "#FF8C1A",
  red: "#EF4444",
  green: "#22C55E",
  lime: "#22C55E",
  offline: "#6B7280",
  text: "#FFFFFF",
  textMuted: "#B0B0B0",
  textDim: "#E5E5E5",
  shadow: "0 18px 50px rgba(0, 0, 0, 0.38)",
  primaryGradient: "#FF6A00",
};

export const pageLabels = {
  "/dashboard": "Live Monitoring",
  "/analytics": "Analytics",
  "/devices": "Device Registry",
  "/health-logs": "Health Logs",
  "/sensor-status": "Sensor Status",
  "/wifi-config": "WiFi Configuration",
  "/settings": "System Config",
};

export const cardStyle = {
  background: "#171717",
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  boxShadow: "0 16px 34px rgba(0, 0, 0, 0.24)",
};

export const pageStyle = {
  padding: "16px 20px",
  overflow: "hidden",
  height: "100%",
  boxSizing: "border-box",
};

export const controlStyle = {
  background: C.bg3,
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  color: C.text,
  padding: "9px 12px",
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
};

export const primaryButtonStyle = {
  border: "none",
  borderRadius: 7,
  background: C.primary,
  color: C.text,
  fontWeight: 800,
  cursor: "pointer",
  transition: "background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease",
};

export const ghostButtonStyle = {
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  background: "rgba(255, 255, 255, 0.03)",
  color: C.textDim,
  cursor: "pointer",
  transition: "border-color 0.16s ease, color 0.16s ease, background 0.16s ease, transform 0.16s ease",
};
