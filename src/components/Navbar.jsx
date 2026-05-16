import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { C, pageLabels } from "../theme";

export default function Navbar({ miners, user, onLogout, usingRealtime, connectionError }) {
  const [time, setTime] = useState(new Date());
  const { pathname } = useLocation();
  const onlineCount = miners.filter((miner) => miner.active).length;
  const initials = (user?.name || user?.email || "AD")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header
      style={{
        height: 52,
        background: C.bg1,
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 16,
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: "0.04em" }}>{pageLabels[pathname] || "Dashboard"}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textMuted }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: usingRealtime ? C.green : C.amber, boxShadow: usingRealtime ? `0 0 6px ${C.green}` : "none", display: "inline-block" }} />
        <span title={connectionError || ""}>{usingRealtime ? "Firebase live" : connectionError ? connectionError : "Waiting for Firebase"}</span>
      </div>
      <div style={{ width: 1, height: 20, background: C.border }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textMuted }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}`, display: "inline-block" }} />
        {onlineCount}/{miners.length} devices online
      </div>
      <div style={{ width: 1, height: 20, background: C.border }} />
      <div style={{ fontSize: 12, color: C.cyan }}>{time.toLocaleTimeString()}</div>
      <div style={{ width: 1, height: 20, background: C.border }} />
      <div
        title={user?.email}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "rgba(245,158,11,0.15)",
          border: `1px solid ${C.amberD}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: C.amber,
          fontWeight: 700,
        }}
      >
        {initials || "AD"}
      </div>
      <button
        onClick={onLogout}
        style={{
          padding: "7px 10px",
          borderRadius: 6,
          border: `1px solid ${C.border}`,
          background: "transparent",
          color: C.textMuted,
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        Logout
      </button>
    </header>
  );
}
