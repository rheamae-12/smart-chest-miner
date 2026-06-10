import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Modal from "./Modal";
import { useAuth } from "../context/useAuth";
import { C, controlStyle, ghostButtonStyle, pageLabels, primaryButtonStyle } from "../theme";
import { buildAlerts } from "../utils/alertChecker";
import { formatSystemTimestamp } from "../utils/formatters";

const CLEARED_NOTIFICATIONS_STORAGE_KEY = "smart-chest-miner-cleared-notifications";

// Navbar — top app bar with page title, connection status pills, notifications, security, and account
export default function Navbar({ miners, user, onLogout, usingRealtime, connectionError, activityLogs = [], thresholds, dismissedAlertIds = [], onDismissAlerts }) {
  const { updateUser, changePassword } = useAuth();
  const [time, setTime] = useState(new Date());
  const [securityOpen, setSecurityOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountTab, setAccountTab] = useState("profile");
  const [account, setAccount] = useState(() => accountFromUser(user));
  const [avatarSrc, setAvatarSrc] = useState(() => readAvatarSrc(user));
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const fileInputRef = useRef(null);
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
    setAvatarSrc(readAvatarSrc(user));
  }, [user?.uid, user?.email]);

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
    setAccountSaved(true);
  };

  // handleAvatarChange — reads the selected image file, crops+resizes to 200px, stores as base64
  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const SIZE = 200;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        const src = canvas.toDataURL("image/jpeg", 0.82);
        setAvatarSrc(src);
        writeAvatarSrc(user, src);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  // handlePasswordChange — validates fields, enforces requirements, then calls changePassword
  const handlePasswordChange = async () => {
    if (user?.source === "demo") {
      setPwError("Demo accounts cannot change their password.");
      return;
    }
    const cur = pw.current.trim();
    const next = pw.next.trim();
    const confirm = pw.confirm.trim();
    if (!cur) { setPwError("Enter your current password."); return; }
    if (!next) { setPwError("Enter a new password."); return; }
    const reqs = passwordRequirements(next);
    if (!reqs.every((r) => r.met)) { setPwError("New password does not meet all security requirements."); return; }
    if (next !== confirm) { setPwError("Passwords do not match."); return; }
    if (next === cur) { setPwError("New password must differ from the current one."); return; }
    setPwSaving(true);
    setPwError("");
    try {
      await changePassword(cur, next);
      setPwSaved(true);
      setPw({ current: "", next: "", confirm: "" });
    } catch (error) {
      const msg = String(error.message || "Password change failed.")
        .replace("Firebase: ", "")
        .replace(/\s*\(auth\/[^)]+\)\.?/, "")
        .trim();
      setPwError(msg || "Password change failed.");
    } finally {
      setPwSaving(false);
    }
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
        <>
          {/* Hidden file input for avatar upload */}
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
          <Modal
            title="Account Settings"
            onClose={() => { setAccountOpen(false); setAccountSaved(false); setPwSaved(false); }}
            actions={
              accountTab === "security" ? (
                pwSaved ? (
                  <button
                    onClick={() => { setPwSaved(false); setAccountTab("profile"); }}
                    style={{ ...primaryButtonStyle, padding: "9px 18px", background: `${C.green}22`, borderColor: `${C.green}55`, color: C.green }}
                  >
                    Done
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setAccountTab("profile"); setPwError(""); }} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Back</button>
                    <button disabled={pwSaving || user?.source === "demo"} onClick={handlePasswordChange} style={{ ...primaryButtonStyle, padding: "9px 18px", opacity: pwSaving ? 0.7 : 1 }}>
                      {pwSaving ? "Changing..." : "Change Password"}
                    </button>
                  </>
                )
              ) : accountSaved ? (
                <button onClick={() => { setAccountOpen(false); setAccountSaved(false); }} style={{ ...primaryButtonStyle, padding: "9px 18px", background: `${C.green}22`, borderColor: `${C.green}55`, color: C.green }}>
                  Close
                </button>
              ) : (
                <>
                  <button onClick={() => setAccountOpen(false)} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Cancel</button>
                  <button onClick={saveAccount} style={{ ...primaryButtonStyle, padding: "9px 18px" }}>Save Account</button>
                </>
              )
            }
          >
            <div style={{ display: "grid", gap: 14 }}>
              {/* Profile hero — avatar + live name/email + badges */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: `linear-gradient(135deg, ${C.primary}10 0%, ${C.primary}04 100%)`, border: `1px solid ${C.primary}28`, borderRadius: 10 }}>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  title="Click to change profile photo"
                  style={{ width: 56, height: 56, borderRadius: "50%", background: `${C.primary}18`, border: `2px solid ${C.primary}45`, display: "grid", placeItems: "center", fontSize: 16, color: C.primary, fontWeight: 900, flexShrink: 0, cursor: "pointer", overflow: "hidden", position: "relative" }}
                >
                  {avatarSrc
                    ? <img src={avatarSrc} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (initials || "AD")
                  }
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", opacity: 0, transition: "opacity 0.15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = 0; }}
                  >
                    <CameraIcon />
                  </div>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 950, lineHeight: 1.2 }}>{account.name || "Admin"}</div>
                  <div style={{ color: C.textMuted, fontSize: 11, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.email}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    <AccountBadge>{account.role || "Supervisor"}</AccountBadge>
                    <AccountBadge>{account.shift || "Night Shift"}</AccountBadge>
                    <AccountBadge accent={user?.source === "firebase"}>
                      {user?.source === "firebase" ? "Firebase" : user?.source === "local" ? "Local" : "Demo"}
                    </AccountBadge>
                  </div>
                </div>
              </div>

              {/* Tab switcher */}
              <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 3, gap: 2 }}>
                {["profile", "security"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setAccountTab(tab); setPwError(""); setAccountError(""); }}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", background: accountTab === tab ? "rgba(255,255,255,0.09)" : "transparent", color: accountTab === tab ? C.text : C.textMuted, fontSize: 12, fontWeight: accountTab === tab ? 900 : 600, cursor: "pointer" }}
                  >
                    {tab === "profile" ? "Profile" : "Security"}
                  </button>
                ))}
              </div>

              {/* ── Profile tab ── */}
              {accountTab === "profile" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, marginBottom: 10 }}>Edit Profile</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <AccountField label="Full Name" value={account.name} onChange={(name) => { setAccount({ ...account, name }); setAccountSaved(false); }} />
                      <AccountField label="Email" value={account.email} onChange={(email) => { setAccount({ ...account, email }); setAccountSaved(false); }} />
                      <AccountField label="Role" value={account.role} onChange={(role) => { setAccount({ ...account, role }); setAccountSaved(false); }} />
                      <AccountField label="Assigned Shift" value={account.shift} onChange={(shift) => { setAccount({ ...account, shift }); setAccountSaved(false); }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "rgba(255,255,255,0.025)", border: `1px solid ${C.borderSoft}`, borderRadius: 7 }}>
                    <span style={{ color: C.textMuted, fontSize: 11 }}>Account type</span>
                    <span style={{ color: user?.source === "firebase" ? C.green : C.amber, fontSize: 11, fontWeight: 900 }}>
                      {user?.source === "firebase" ? "Firebase authenticated" : user?.source === "local" ? "Local account" : "Demo supervisor"}
                    </span>
                  </div>
                  {accountError && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: `${C.amber}10`, border: `1px solid ${C.amber}35`, borderRadius: 7 }}>
                      <span style={{ color: C.amber, fontSize: 18, lineHeight: 1, fontWeight: 900 }}>!</span>
                      <span style={{ color: C.amber, fontSize: 12 }}>{accountError}</span>
                    </div>
                  )}
                  {accountSaved && !accountError && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: `${C.green}10`, border: `1px solid ${C.green}35`, borderRadius: 7 }}>
                      <span style={{ color: C.green, fontSize: 16, lineHeight: 1 }}>✓</span>
                      <span style={{ color: C.green, fontSize: 12 }}>Account settings saved successfully.</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Security tab ── */}
              {accountTab === "security" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 }}>Change Password</div>

                  {user?.source === "demo" ? (
                    <div style={{ padding: "12px 14px", background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 8, color: C.amber, fontSize: 12, lineHeight: 1.55 }}>
                      Demo accounts cannot change their password. Sign up for a full account to enable this feature.
                    </div>
                  ) : (
                    <>
                      <PasswordField
                        label="Current Password"
                        value={pw.current}
                        autoComplete="current-password"
                        onChange={(v) => { setPw({ ...pw, current: v }); setPwError(""); }}
                      />
                      <div style={{ display: "grid", gap: 8 }}>
                        <PasswordField
                          label="New Password"
                          value={pw.next}
                          autoComplete="new-password"
                          onChange={(v) => { setPw({ ...pw, next: v }); setPwError(""); setPwSaved(false); }}
                        />
                        {pw.next && (
                          <>
                            {/* Strength bar */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 3, flex: 1 }}>
                                {[0, 1, 2, 3].map((i) => {
                                  const { score, color } = passwordStrength(pw.next);
                                  return <div key={i} style={{ height: 4, borderRadius: 2, background: i < score ? color : `${C.borderSoft}`, transition: "background 0.2s" }} />;
                                })}
                              </div>
                              <span style={{ color: passwordStrength(pw.next).color, fontSize: 10, fontWeight: 900, minWidth: 56, textAlign: "right" }}>{passwordStrength(pw.next).label}</span>
                            </div>
                            {/* Requirements checklist */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                              {passwordRequirements(pw.next).map((req) => (
                                <div key={req.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ color: req.met ? C.green : C.textMuted, fontSize: 13, lineHeight: 1 }}>{req.met ? "✓" : "○"}</span>
                                  <span style={{ color: req.met ? C.green : C.textMuted, fontSize: 11 }}>{req.label}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      <PasswordField
                        label="Confirm New Password"
                        value={pw.confirm}
                        autoComplete="new-password"
                        onChange={(v) => { setPw({ ...pw, confirm: v }); setPwError(""); }}
                      />
                      {/* Confirm match indicator */}
                      {pw.confirm && pw.next && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ color: pw.next === pw.confirm ? C.green : C.red, fontSize: 13 }}>{pw.next === pw.confirm ? "✓" : "✗"}</span>
                          <span style={{ color: pw.next === pw.confirm ? C.green : C.red, fontSize: 11 }}>{pw.next === pw.confirm ? "Passwords match" : "Passwords do not match"}</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Security note */}
                  <div style={{ padding: "9px 12px", background: "rgba(255,255,255,0.02)", border: `1px solid ${C.borderSoft}`, borderRadius: 7 }}>
                    <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 900, marginBottom: 4 }}>Account Safety</div>
                    <div style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.55 }}>Use a strong, unique password. Never share credentials with others. You will need your current password to confirm any change.</div>
                  </div>

                  {/* Error / success feedback */}
                  {pwError && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: `${C.red}0E`, border: `1px solid ${C.red}35`, borderRadius: 7 }}>
                      <span style={{ color: C.red, fontSize: 18, lineHeight: 1, fontWeight: 900 }}>!</span>
                      <span style={{ color: C.red, fontSize: 12 }}>{pwError}</span>
                    </div>
                  )}
                  {pwSaved && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: `${C.green}10`, border: `1px solid ${C.green}35`, borderRadius: 7 }}>
                      <span style={{ color: C.green, fontSize: 16, lineHeight: 1 }}>✓</span>
                      <span style={{ color: C.green, fontSize: 12 }}>Password changed successfully. Keep it safe.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Modal>
        </>
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
            setAccountSaved(false);
            setAccountTab("profile");
            setPw({ current: "", next: "", confirm: "" });
            setPwError("");
            setPwSaved(false);
            setAccountOpen(true);
          }}
          title={user?.email}
          style={{ ...avatarStyle, cursor: "pointer", padding: 0, overflow: "hidden" }}
        >
          {avatarSrc
            ? <img src={avatarSrc} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            : (initials || "AD")
          }
        </button>
        <button onClick={onLogout} style={{ ...ghostButtonStyle, padding: "8px 11px", fontSize: 12, fontWeight: 800 }}>
          Logout
        </button>
      </header>
    </>
  );
}

// notificationKey — stable string key used to track which notifications have been cleared in localStorage
function notificationKey(event) {
  if (event.id) return String(event.id);
  return `${event.deviceId || "event"}-${event.title || "notification"}-${event.timestamp || 0}`;
}

// accountFromUser — maps the Firebase/local user object to editable account form fields
function accountFromUser(user) {
  return {
    name: user?.name || "Admin",
    email: user?.email || "admin@smartchestminer.io",
    role: user?.role || "Supervisor",
    shift: user?.shift || "Night Shift",
  };
}

// AccountField — labelled text input row inside the account edit modal
function AccountField({ label, value, onChange }) {
  return (
    <label>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</div>
      <input value={value} onChange={(event) => onChange(event.target.value)} style={{ ...controlStyle, width: "100%" }} />
    </label>
  );
}

// AccountBadge — small pill shown in the profile hero for role, shift, and account source
function AccountBadge({ children, accent }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 999,
      background: accent ? `${C.green}14` : `${C.primary}12`,
      border: `1px solid ${accent ? C.green : C.primary}28`,
      color: accent ? C.green : C.textMuted,
      fontSize: 10, fontWeight: 800,
    }}>
      {children}
    </span>
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

// readStoredStringArray — safely reads a JSON string array from localStorage; returns [] on error
function readStoredStringArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// Pill — status pill with a glowing dot; tone: "good" | "warn" | "danger"
function Pill({ children, tone }) {
  const color = tone === "good" ? C.green : tone === "danger" ? C.red : C.amber;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${color}45`, background: `${color}12`, color, borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 12px ${color}` }} />
      {children}
    </div>
  );
}

// SecurityRow — two-column row in the Security Status modal
function SecurityRow({ label, value, good }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "start", padding: "10px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 2 }}>{label}</div>
      <div style={{ color: good ? C.green : C.amber, fontSize: 13, fontWeight: 700, textTransform: "none", lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}

// NotificationRow — single entry in the notifications panel; color-coded by severity
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

// BellIcon — notification bell SVG, inherits currentColor by default
function BellIcon({ color = "currentColor" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 17, height: 17, fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

// CameraIcon — camera SVG shown on avatar hover overlay
function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

// PasswordField — labelled password input with show/hide toggle
function PasswordField({ label, value, autoComplete, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <label>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...controlStyle, width: "100%", paddingRight: 36, boxSizing: "border-box" }}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: 0, display: "flex", alignItems: "center" }}
        >
          {show
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          }
        </button>
      </div>
    </label>
  );
}

// passwordRequirements — returns checklist of password rules with met boolean
function passwordRequirements(password) {
  return [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number or symbol", met: /[\d!@#$%^&*()_+\-=[\]{};':|,.<>/?]/.test(password) },
  ];
}

// passwordStrength — returns score (1–4), color, and label for the strength bar
function passwordStrength(password) {
  const score = passwordRequirements(password).filter((r) => r.met).length;
  if (score <= 1) return { score: 1, color: C.red, label: "Weak" };
  if (score === 2) return { score: 2, color: C.amber, label: "Fair" };
  if (score === 3) return { score: 3, color: C.primary, label: "Good" };
  return { score: 4, color: C.green, label: "Strong" };
}

// readAvatarSrc — reads a user's uploaded avatar from localStorage
function readAvatarSrc(user) {
  if (!user?.uid && !user?.email) return "";
  try {
    return localStorage.getItem(`smart-chest-miner-avatar-${user.uid || user.email}`) || "";
  } catch {
    return "";
  }
}

// writeAvatarSrc — persists a user's avatar base64 string to localStorage
function writeAvatarSrc(user, src) {
  if (!user?.uid && !user?.email) return;
  try {
    localStorage.setItem(`smart-chest-miner-avatar-${user.uid || user.email}`, src);
  } catch { /* storage quota exceeded — silently skip */ }
}
