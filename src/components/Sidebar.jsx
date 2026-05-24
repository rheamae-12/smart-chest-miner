import { useState } from "react";
import { NavLink } from "react-router-dom";
import logo from "../assets/smart-chest-miner-logo.png";
import { C } from "../theme";

const nav = [
  { to: "/dashboard", label: "Live Monitor", icon: "monitor" },
  { to: "/analytics", label: "Analytics", icon: "analytics" },
  { to: "/devices", label: "Device Registry", icon: "device" },
  { to: "/health-logs", label: "Health Logs", icon: "history" },
  { to: "/sensor-status", label: "Sensor Status", icon: "network" },
  { to: "/wifi-config", label: "WiFi Config", icon: "wifi" },
  { to: "/settings", label: "System Config", icon: "settings" },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="app-sidebar"
      style={{
        width: collapsed ? 64 : 172,
        minHeight: "100vh",
        background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012)), " + C.sidebar,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: collapsed ? "12px 9px" : "14px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <LogoMark compact={collapsed} />
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.text, lineHeight: 1 }}>Smart Chest</div>
            <div style={{ fontSize: 9, color: C.textMuted, marginTop: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Vitals Active</div>
          </div>
        )}
      </div>

      <nav style={{ flex: 1, padding: "14px 9px", overflow: "auto" }}>
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 11,
              minHeight: 38,
              padding: collapsed ? "0 8px" : "0 11px",
              borderRadius: 10,
              marginBottom: 5,
              textDecoration: "none",
              background: isActive ? "linear-gradient(90deg, rgba(255,106,0,0.18), rgba(255,106,0,0.06))" : "transparent",
              color: isActive ? C.text : C.textMuted,
              border: `1px solid ${isActive ? "rgba(255,106,0,0.4)" : "transparent"}`,
              boxShadow: isActive ? "inset 3px 0 0 #FF6A00, 0 10px 20px rgba(255,106,0,0.08)" : "none",
            })}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                display: "grid",
                placeItems: "center",
                background: "rgba(255,255,255,0.04)",
                color: C.primary,
                flexShrink: 0,
              }}
            >
              <NavIcon name={item.icon} />
            </span>
            {!collapsed && <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div style={{ margin: "0 12px 12px", padding: 12, borderRadius: 10, border: `1px solid rgba(255,106,0,0.24)`, background: "linear-gradient(180deg, rgba(255,106,0,0.10), rgba(255,255,255,0.025))" }}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Safety Mode</div>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 800, marginTop: 5 }}>System Health</div>
          <div style={{ height: 4, borderRadius: 999, background: C.border, marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: "82%", height: "100%", background: C.primaryGradient }} />
          </div>
        </div>
      )}

      <div style={{ padding: "12px 10px", borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            width: "100%",
            minHeight: 36,
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            background: "rgba(255,255,255,0.03)",
            color: C.textDim,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {collapsed ? ">" : "< Collapse"}
        </button>
      </div>
    </aside>
  );
}

function LogoMark({ compact }) {
  return (
    <div
      style={{
        width: compact ? 42 : 46,
        height: compact ? 42 : 46,
        borderRadius: 9,
        border: `1px solid rgba(255,106,0,0.42)`,
        background: C.text,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        flexShrink: 0,
        boxShadow: "0 0 28px rgba(255,106,0,0.22)",
      }}
    >
      <img src={logo} alt="Smart Chest Miner" style={{ width: "92%", height: "92%", objectFit: "contain" }} />
    </div>
  );
}

function NavIcon({ name }) {
  const common = { width: 17, height: 17, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

  if (name === "monitor") {
    return (
      <svg viewBox="0 0 24 24" style={common} aria-hidden="true">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 11h3l2-4 2 8 2-4h1" />
      </svg>
    );
  }
  if (name === "analytics") {
    return (
      <svg viewBox="0 0 24 24" style={common} aria-hidden="true">
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 16v-5" />
        <path d="M12 16V8" />
        <path d="M16 16v-3" />
      </svg>
    );
  }
  if (name === "device") {
    return (
      <svg viewBox="0 0 24 24" style={common} aria-hidden="true">
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 7h2" />
        <path d="M10 17h4" />
        <path d="M3 9h2" />
        <path d="M19 9h2" />
      </svg>
    );
  }
  if (name === "history") {
    return (
      <svg viewBox="0 0 24 24" style={common} aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (name === "network") {
    return (
      <svg viewBox="0 0 24 24" style={common} aria-hidden="true">
        <circle cx="12" cy="5" r="2" />
        <circle cx="5" cy="19" r="2" />
        <circle cx="19" cy="19" r="2" />
        <path d="M12 7v4" />
        <path d="m6.5 17 4-5" />
        <path d="m17.5 17-4-5" />
      </svg>
    );
  }
  if (name === "wifi") {
    return (
      <svg viewBox="0 0 24 24" style={common} aria-hidden="true">
        <path d="M5 13a10 10 0 0 1 14 0" />
        <path d="M8.5 16.5a5 5 0 0 1 7 0" />
        <path d="M12 20h.01" />
        <path d="M2 9a15 15 0 0 1 20 0" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" style={common} aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2 2 0 0 1-2.83 2.83l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21a2 2 0 0 1-4 0v-.06A1.8 1.8 0 0 0 8.75 19.3a1.8 1.8 0 0 0-1.98.36l-.04.04a2 2 0 0 1-2.83-2.83l.04-.04A1.8 1.8 0 0 0 4.3 15a1.8 1.8 0 0 0-1.65-1.1H2.6a2 2 0 0 1 0-4h.06A1.8 1.8 0 0 0 4.3 8.75a1.8 1.8 0 0 0-.36-1.98l-.04-.04A2 2 0 0 1 6.73 3.9l.04.04A1.8 1.8 0 0 0 8.75 4.3a1.8 1.8 0 0 0 1.1-1.65V2.6a2 2 0 0 1 4 0v.06A1.8 1.8 0 0 0 15 4.3a1.8 1.8 0 0 0 1.98-.36l.04-.04a2 2 0 0 1 2.83 2.83l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1h.06a2 2 0 0 1 0 4h-.06A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}
