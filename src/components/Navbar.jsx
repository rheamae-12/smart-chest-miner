import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Modal from "./Modal";
import { C, ghostButtonStyle, pageLabels, primaryButtonStyle } from "../theme";
import { buildAlerts } from "../utils/alertChecker";
import { formatSystemTimestamp } from "../utils/formatters";

export default function Navbar({ miners, user, onLogout, usingRealtime, connectionError, activityLogs = [], thresholds }) {
  const [time, setTime] = useState(new Date());
  const [securityOpen, setSecurityOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { pathname } = useLocation();
  const onlineCount = miners.filter((miner) => miner.active).length;
  const alerts = buildAlerts(miners, thresholds);
  const alertCount = alerts.length;
  const recentEvents = [
    ...alerts.map((alert) => ({
      id: alert.id,
      title: alert.message,
      detail: "Live miner condition requires supervisor review.",
      severity: alert.severity,
      timestamp: time.getTime(),
    })),
    ...activityLogs,
  ].slice(0, 18);
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
    <>
      {securityOpen && (
        <Modal
          title="Security Status"
          onClose={() => setSecurityOpen(false)}
          actions={
            <button onClick={() => setSecurityOpen(false)} style={{ ...primaryButtonStyle, padding: "9px 16px" }}>
              Done
            </button>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <SecurityRow label="Session" value={user?.source === "firebase" ? "Firebase authenticated" : user?.source === "local" ? "Local account mode" : "Demo supervisor"} good />
            <SecurityRow label="Realtime source" value={usingRealtime ? "Firebase live stream active" : "Waiting for verified device data"} good={usingRealtime} />
            <SecurityRow label="Device alerts" value={`${alertCount} condition${alertCount === 1 ? "" : "s"} need review`} good={alertCount === 0} />
            <SecurityRow label="Data policy" value="Secrets stay in environment variables; destructive device actions require confirmation." good />
            {connectionError && <div style={{ color: C.amber, fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{connectionError}</div>}
          </div>
        </Modal>
      )}

      {notificationsOpen && (
        <Modal
          title="Miner Notifications"
          onClose={() => setNotificationsOpen(false)}
          actions={
            <button onClick={() => setNotificationsOpen(false)} style={{ ...primaryButtonStyle, padding: "9px 16px" }}>
              Done
            </button>
          }
        >
          <div className="hide-scrollbar" style={{ display: "grid", gap: 8, maxHeight: 390, overflow: "auto" }}>
            {recentEvents.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: 13 }}>No miner activity has been recorded yet.</div>
            ) : (
              recentEvents.map((event) => <NotificationRow key={`${event.id || event.deviceId}-${event.title}-${event.timestamp}`} event={event} />)
            )}
          </div>
        </Modal>
      )}

      <header
        style={{
          minHeight: 54,
          background: C.navbar,
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 12,
          flexShrink: 0,
          position: "relative",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: C.primary, letterSpacing: "0.1em", textTransform: "uppercase" }}>Smart Chest Miner</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginTop: 2 }}>{pageLabels[pathname] || "Live Monitoring"}</div>
        </div>
        <div style={{ flex: 1 }} />
        <Pill tone={usingRealtime ? "good" : "warn"}>{usingRealtime ? "Firebase live" : connectionError ? "Firebase notice" : "Awaiting data"}</Pill>
        <Pill tone={onlineCount > 0 ? "good" : "danger"}>
          {onlineCount}/{miners.length} online
        </Pill>
        <div style={{ color: C.primary, fontSize: 11, fontWeight: 800, minWidth: 176, textAlign: "right" }}>{formatSystemTimestamp(time)}</div>
        <button
          onClick={() => setNotificationsOpen(true)}
          title="Miner notifications"
          style={{
            ...ghostButtonStyle,
            width: 36,
            height: 34,
            padding: 0,
            display: "grid",
            placeItems: "center",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <BellIcon />
          {alertCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -5,
                right: -5,
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: C.red,
                color: C.text,
                fontSize: 10,
                fontWeight: 900,
                border: `1px solid ${C.bg0}`,
              }}
            >
              {alertCount}
            </span>
          )}
        </button>
        <button onClick={() => setSecurityOpen(true)} style={{ ...ghostButtonStyle, padding: "8px 11px", fontSize: 12, fontWeight: 800 }}>
          Security
        </button>
        <div
          title={user?.email}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "rgba(255,106,0,0.12)",
            border: `1px solid rgba(255,106,0,0.35)`,
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            color: C.primary,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {initials || "AD"}
        </div>
        <button onClick={onLogout} style={{ ...ghostButtonStyle, padding: "8px 11px", fontSize: 12, fontWeight: 800 }}>
          Logout
        </button>
      </header>
    </>
  );
}

function Pill({ children, tone }) {
  const color = tone === "good" ? C.green : tone === "danger" ? C.red : C.amber;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${color}45`, background: `${color}12`, color, borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 12px ${color}` }} />
      {children}
    </div>
  );
}

function SecurityRow({ label, value, good }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <div style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color: good ? C.green : C.amber, fontSize: 13, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function NotificationRow({ event }) {
  const color = event.severity === "critical" ? C.red : event.severity === "warning" ? C.amber : event.status === "online" ? C.green : C.textMuted;
  return (
    <div style={{ borderLeft: `3px solid ${color}`, padding: "9px 0 9px 11px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>{event.title}</div>
        <div style={{ color, fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>{event.severity || event.status || "info"}</div>
      </div>
      <div style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.45, marginTop: 4 }}>{event.detail}</div>
      <div style={{ color: C.textMuted, fontSize: 10, marginTop: 6 }}>{formatSystemTimestamp(event.timestamp)}</div>
    </div>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 17, height: 17, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
