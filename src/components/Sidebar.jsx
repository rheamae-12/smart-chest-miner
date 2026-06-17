import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import Icon from "./Icon";
import logo from "../assets/smart-chest-miner-logo.png";
import { C } from "../theme";

// Grouped navigation — sections give the rail clear hierarchy.
const navGroups = [
  {
    label: "Monitoring",
    items: [
      { to: "/command", label: "Command Center", icon: "grid" },
      { to: "/dashboard", label: "Live Dashboard", icon: "pulse" },
      { to: "/analytics", label: "Analytics", icon: "chart" },
      { to: "/health-logs", label: "Health Logs", icon: "clock" },
      { to: "/sensor-status", label: "Sensor Status", icon: "network" },
      { to: "/alert-history", label: "Alert History", icon: "alert" },
    ],
  },
  {
    label: "Management",
    items: [
      { to: "/devices", label: "Device Registry", icon: "device" },
      { to: "/wifi-config", label: "WiFi Config", icon: "wifi" },
      { to: "/settings", label: "System Config", icon: "settings" },
    ],
  },
];

// Sidebar — collapsible left navigation with brand, grouped nav rail, and collapse toggle
export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="app-sidebar"
      style={{
        width: collapsed ? 66 : 192,
        minHeight: "100vh",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.012)), " + C.sidebar,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        transition: "width 0.24s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
      }}
    >
      {/* Top brand accent */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, rgba(255,106,0,0.75), transparent)" }} />

      {/* Brand */}
      <div style={{ padding: collapsed ? "15px 9px" : "16px 14px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", gap: 11 }}>
        <LogoMark compact={collapsed} />
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 950, color: C.text, lineHeight: 1, letterSpacing: "0.01em" }}>Smart Chest</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
              <span className="dot-live" style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 8px ${C.green}`, flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 800 }}>Vitals Active</span>
            </div>
          </div>
        )}
      </div>

      {/* Grouped nav */}
      <nav className="hide-scrollbar" style={{ flex: 1, padding: collapsed ? "12px 9px" : "12px 11px", overflow: "auto" }}>
        {navGroups.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi === 0 ? 0 : collapsed ? 6 : 16 }}>
            {!collapsed ? (
              <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 900, padding: "0 9px 8px", opacity: 0.55 }}>{group.label}</div>
            ) : (
              gi > 0 && <div style={{ height: 1, background: C.borderSoft, margin: "2px 7px 9px" }} />
            )}
            {group.items.map((item) => (
              <NavItem key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      {/* Collapse */}
      <div style={{ padding: collapsed ? "12px 9px" : "12px 11px", borderTop: `1px solid ${C.borderSoft}` }}>
        <button
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="sidebar-collapse-btn"
          style={{
            width: "100%",
            minHeight: 36,
            borderRadius: 9,
            border: `1px solid ${C.border}`,
            background: "rgba(255,255,255,0.03)",
            color: C.textMuted,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.24s ease", flexShrink: 0 }}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {!collapsed && <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em" }}>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

// NavItem — single nav row: icon chip + label, with a glowing active rail
function NavItem({ item, collapsed }) {
  const { pathname } = useLocation();
  const isActive = pathname === item.to || pathname.startsWith(item.to + "/");
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={`sidebar-nav-item${isActive ? "" : " sidebar-nav-inactive"}`}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 11,
        minHeight: 40,
        padding: collapsed ? "0 8px" : "0 11px",
        borderRadius: 10,
        marginBottom: 3,
        textDecoration: "none",
        justifyContent: collapsed ? "center" : "flex-start",
        background: isActive ? "linear-gradient(90deg, rgba(255,106,0,0.17), rgba(255,106,0,0.03))" : "transparent",
        color: isActive ? C.text : C.textMuted,
        border: `1px solid ${isActive ? "rgba(255,106,0,0.34)" : "transparent"}`,
        boxShadow: isActive ? "0 8px 20px rgba(255,106,0,0.10)" : "none",
      }}
    >
      {isActive && (
        <span style={{ position: "absolute", left: collapsed ? 3 : -1, top: "50%", transform: "translateY(-50%)", width: 3, height: 18, borderRadius: 3, background: C.primaryGradient, boxShadow: "0 0 10px rgba(255,106,0,0.7)" }} />
      )}
      <span
        className="sidebar-icon-wrap"
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          display: "grid",
          placeItems: "center",
          background: isActive ? "rgba(255,106,0,0.18)" : "rgba(255,255,255,0.04)",
          color: isActive ? C.primary : C.textMuted,
          flexShrink: 0,
          transition: "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
          boxShadow: isActive ? "0 0 0 1px rgba(255,106,0,0.25), 0 4px 10px rgba(255,106,0,0.18)" : "none",
        }}
      >
        <Icon name={item.icon} size={16} />
      </span>
      {!collapsed && (
        <span style={{ fontSize: 13, fontWeight: isActive ? 800 : 600, whiteSpace: "nowrap", letterSpacing: "0.01em", textTransform: "none", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          {item.label}
        </span>
      )}
    </NavLink>
  );
}

// LogoMark — app logo box; shrinks slightly when sidebar is collapsed
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
