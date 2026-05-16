import { NavLink } from "react-router-dom";
import { useState } from "react";
import { C } from "../theme";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: "D" },
  { to: "/analytics", label: "Analytics", icon: "A" },
  { to: "/devices", label: "Devices", icon: "M" },
  { to: "/settings", label: "Settings", icon: "S" },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      style={{
        width: collapsed ? 56 : 220,
        minHeight: "100vh",
        background: C.bg1,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "18px 14px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: `linear-gradient(135deg, ${C.amber}, ${C.amberD})`,
            color: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          SCM
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, letterSpacing: "0.12em", lineHeight: 1 }}>SMART CHEST</div>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.08em" }}>MINER MONITOR</div>
          </div>
        )}
      </div>

      <nav style={{ flex: 1, padding: "12px 8px" }}>
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 8px",
              borderRadius: 6,
              marginBottom: 2,
              textDecoration: "none",
              background: isActive ? "rgba(245,158,11,0.12)" : "transparent",
              color: isActive ? C.amber : C.textMuted,
              borderLeft: isActive ? `2px solid ${C.amber}` : "2px solid transparent",
            })}
          >
            <span style={{ fontSize: 12, width: 20, textAlign: "center", flexShrink: 0, fontWeight: 800 }}>{item.icon}</span>
            {!collapsed && <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: "12px 8px", borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={() => setCollapsed((value) => !value)}
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: C.textMuted,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {collapsed ? ">" : "< Collapse"}
        </button>
      </div>
    </aside>
  );
}
