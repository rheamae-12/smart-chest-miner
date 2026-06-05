import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Modal from "./Modal";
import { useAuth } from "../context/useAuth";
import { C, controlStyle, ghostButtonStyle, pageLabels, primaryButtonStyle } from "../theme";
import { buildAlerts } from "../utils/alertChecker";
import { formatSystemTimestamp } from "../utils/formatters";

const CLEARED_NOTIFICATIONS_STORAGE_KEY = "smart-chest-miner-cleared-notifications";

export default function Navbar({ miners, user, onLogout, usingRealtime, connectionError, activityLogs = [], thresholds, dismissedAlertIds = [], onDismissAlerts }) {
  const { updateUser } = useAuth();
  const [time, setTime] = useState(new Date());
  const [securityOpen, setSecurityOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [account, setAccount] = useState(() => accountFromUser(user));
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearedNotifications, setClearedNotifications] = useState(() => readStoredStringArray(CLEARED_NOTIFICATIONS_STORAGE_KEY));
  const { pathname } = useLocation();
  const onlineCount = miners.filter((miner) => miner.active).length;
  const alerts = buildAlerts(miners, thresholds).filter((alert) => !dismissedAlertIds.includes(alert.id));
  const sortedLogs = [...activityLogs].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  const dedupedLogs = sortedLogs.filter((log, index) => {
    if (index === 0) return true;
    const prev = sortedLogs[index - 1];
    const timeDiff = Math.abs(Number(log.timestamp || 0) - Number(prev.timestamp || 0));
    return !(log.deviceId === prev.deviceId && log.title === prev.title && timeDiff < 60_000);
  });
  const allEvents = [
    ...alerts.map((alert) => ({
      id: alert.id,
      source: "alert",
      title: alert.message,
      detail: "Live miner condition requires supervisor review.",
      severity: alert.severity,
      timestamp: null,
    })),
    ...dedupedLogs,
  ];
  const unreadEvents = allEvents.filter((event) => !clearedNotifications.includes(notificationKey(event)));
  const recentEvents = unreadEvents.slice(0, 18);
  const notificationCount = unreadEvents.length;
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

  useEffect(() => {
    localStorage.setItem(CLEARED_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(clearedNotifications));
  }, [clearedNotifications]);

  const saveAccount = () => {
    const next = {
      name: account.name.trim() || "Admin",
      email: account.email.trim().toLowerCase(),
      role: account.role.trim() || "Supervisor",
      shift: account.shift.trim() || "Night Shift",
    };

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
      setAccountError("Enter a valid account email address.");
      return;
    }

    updateUser(next);
    setAccount(next);
    setAccountError("");
    setAccountOpen(false);
  };

  const clearAllNotifications = () => {
    const alertIds = unreadEvents.filter((event) => event.source === "alert").map((event) => event.id);
    const activityKeys = unreadEvents.filter((event) => event.source !== "alert").map(notificationKey);

    if (alertIds.length) onDismissAlerts?.(alertIds);
    if (activityKeys.length) {
      setClearedNotifications((items) => [...new Set([...items, ...activityKeys])]);
    }

    setClearConfirmOpen(false);
  };

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
            <SecurityRow label="Device alerts" value={`${alerts.length} condition${alerts.length === 1 ? "" : "s"} need review`} good={alerts.length === 0} />
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
            <>
              <button
                onClick={() => setClearConfirmOpen(true)}
                disabled={notificationCount === 0}
                style={{ ...ghostButtonStyle, padding: "9px 16px", opacity: notificationCount ? 1 : 0.5, cursor: notificationCount ? "pointer" : "not-allowed" }}
              >
                Clear
              </button>
              <button onClick={() => setNotificationsOpen(false)} style={{ ...primaryButtonStyle, padding: "9px 16px" }}>
                Done
              </button>
            </>
          }
        >
          <div style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.45, marginBottom: 10 }}>
            {notificationCount ? `${notificationCount} unread miner notification${notificationCount === 1 ? "" : "s"}.` : "All miner notifications are clear."}
          </div>
          <div className="hide-scrollbar" style={{ display: "grid", gap: 8, maxHeight: 390, overflow: "auto" }}>
            {recentEvents.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: 13 }}>No unread miner activity has been recorded yet.</div>
            ) : (
              recentEvents.map((event) => <NotificationRow key={notificationKey(event)} event={event} />)
            )}
          </div>
        </Modal>
      )}

      {clearConfirmOpen && (
        <Modal
          title="Clear Notifications"
          onClose={() => setClearConfirmOpen(false)}
          actions={
            <>
              <button onClick={() => setClearConfirmOpen(false)} style={{ ...ghostButtonStyle, padding: "9px 16px" }}>
                Cancel
              </button>
              <button onClick={clearAllNotifications} style={{ ...primaryButtonStyle, padding: "9px 16px" }}>
                Confirm Clear
              </button>
            </>
          }
        >
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: `${C.amber}18`, border: `1px solid ${C.amber}44`, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <BellIcon color={C.amber} />
            </div>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Clear all notifications?</div>
              <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 6 }}>
                This will dismiss all {notificationCount} unread notification{notificationCount === 1 ? "" : "s"}, including device alert banners tied to live conditions.
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: "10px 12px", background: `${C.amber}0D`, border: `1px solid ${C.amber}2A`, borderRadius: 8 }}>
            <div style={{ color: C.amber, fontSize: 11, fontWeight: 700 }}>Active alerts will be dismissed from the dashboard banner until the condition changes again.</div>
          </div>
        </Modal>
      )}

      {accountOpen && (
        <Modal
          title="User Account"
          onClose={() => setAccountOpen(false)}
          actions={
            <>
              <button onClick={() => setAccountOpen(false)} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Cancel</button>
              <button onClick={saveAccount} style={{ ...primaryButtonStyle, padding: "9px 15px" }}>Save Account</button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 4 }}>
              <div style={{ ...avatarStyle, width: 42, height: 42, fontSize: 13 }}>{initials || "AD"}</div>
              <div>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{account.name || "Admin"}</div>
                <div style={{ color: C.textMuted, fontSize: 11 }}>{account.email}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
              <AccountField label="Full Name" value={account.name} onChange={(name) => setAccount({ ...account, name })} />
              <AccountField label="Email" value={account.email} onChange={(email) => setAccount({ ...account, email })} />
              <AccountField label="Role" value={account.role} onChange={(role) => setAccount({ ...account, role })} />
              <AccountField label="Assigned Shift" value={account.shift} onChange={(shift) => setAccount({ ...account, shift })} />
            </div>
            {accountError && <div style={{ color: C.amber, fontSize: 12 }}>{accountError}</div>}
          </div>
        </Modal>
      )}

      <header
        className="app-navbar"
        style={{
          minHeight: 58,
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
          <div style={{ fontSize: 17, fontWeight: 900, color: C.text, marginTop: 2, lineHeight: 1.1 }}>{pageLabels[pathname] || "Live Monitoring"}</div>
        </div>
        <div style={{ flex: 1 }} />
        <Pill tone={usingRealtime ? "good" : "warn"}>{usingRealtime ? "Firebase live" : connectionError ? "Firebase notice" : "Awaiting data"}</Pill>
        <Pill tone={onlineCount > 0 ? "good" : "danger"}>
          {onlineCount}/{miners.length} online
        </Pill>
        <div style={{ color: C.primary, fontSize: 11, fontWeight: 900, minWidth: 176, textAlign: "right" }}>{formatSystemTimestamp(time)}</div>
        <button
          onClick={() => {
            setClearConfirmOpen(false);
            setNotificationsOpen(true);
          }}
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
          {notificationCount > 0 && (
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
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </button>
        <button onClick={() => setSecurityOpen(true)} style={{ ...ghostButtonStyle, padding: "8px 11px", fontSize: 12, fontWeight: 800 }}>
          Security
        </button>
        <button
          onClick={() => {
            setAccount(accountFromUser(user));
            setAccountError("");
            setAccountOpen(true);
          }}
          title={user?.email}
          style={{
            ...avatarStyle,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {initials || "AD"}
        </button>
        <button onClick={onLogout} style={{ ...ghostButtonStyle, padding: "8px 11px", fontSize: 12, fontWeight: 800 }}>
          Logout
        </button>
      </header>
    </>
  );
}

function notificationKey(event) {
  if (event.id) return String(event.id);
  return `${event.deviceId || "event"}-${event.title || "notification"}-${event.timestamp || 0}`;
}

function accountFromUser(user) {
  return {
    name: user?.name || "Admin",
    email: user?.email || "admin@smartchestminer.io",
    role: user?.role || "Supervisor",
    shift: user?.shift || "Night Shift",
  };
}

function AccountField({ label, value, onChange }) {
  return (
    <label>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</div>
      <input value={value} onChange={(event) => onChange(event.target.value)} style={{ ...controlStyle, width: "100%" }} />
    </label>
  );
}

const avatarStyle = {
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
};

function readStoredStringArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function Pill({ children, tone }) {
  const color = tone === "good" ? C.green : tone === "danger" ? C.red : C.amber;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${color}45`, background: `${color}12`, color, borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 12px ${color}` }} />
      {children}
    </div>
  );
}

function SecurityRow({ label, value, good }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "start", padding: "10px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 2 }}>{label}</div>
      <div style={{ color: good ? C.green : C.amber, fontSize: 13, fontWeight: 700, textTransform: "none", lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}

function NotificationRow({ event }) {
  const color = event.severity === "critical" ? C.red : event.severity === "warning" ? C.amber : event.status === "online" ? C.green : C.textMuted;
  const label = event.severity || event.status || "info";
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderLeft: `3px solid ${color}`, padding: 12, background: "rgba(255,255,255,0.025)", borderRadius: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 900, lineHeight: 1.35 }}>{event.title}</div>
        <div style={{ color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontWeight: 900, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
      </div>
      <div style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.45, marginTop: 4 }}>{event.detail}</div>
      <div style={{ color: C.textMuted, fontSize: 10, marginTop: 8 }}>{event.timestamp ? formatSystemTimestamp(event.timestamp) : "Current condition"}</div>
    </div>
  );
}

function BellIcon({ color = "currentColor" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 17, height: 17, fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
