import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "./Icon";
import Modal from "./Modal";
import { useAuth } from "../context/useAuth";
import { C, controlStyle, ghostButtonStyle, pageLabels, primaryButtonStyle } from "../theme";
import { buildAlerts } from "../utils/alertChecker";
import { formatSystemTimestamp } from "../utils/formatters";
import { conditionForAlertId, conditionForLog, dedupeNotificationEvents } from "../utils/notifications";
import { passwordRequirements, passwordStrength } from "../utils/password";
import { ROLE_OPTIONS, isViewOnlyRole } from "../utils/roles";

const CLEARED_NOTIFICATIONS_STORAGE_KEY = "smart-chest-miner-cleared-notifications";
const HIDDEN_NOTIFICATIONS_STORAGE_KEY = "smart-chest-miner-hidden-notifications";
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

// Navbar — top app bar with page title, connection status pills, notifications, security, and account
export default function Navbar({ miners, user, onLogout, usingRealtime, connectionError, activityLogs = [], thresholds, dismissedAlertIds = [], onDismissAlerts }) {
  const { updateUser, changePassword, canManage } = useAuth();
  const [time, setTime] = useState(new Date());
  const [securityOpen, setSecurityOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountTab, setAccountTab] = useState("profile");
  const [account, setAccount] = useState(() => accountFromUser(user));
  const [avatarError, setAvatarError] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const fileInputRef = useRef(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearedNotifications, setClearedNotifications] = useState(() => readStoredStringArray(CLEARED_NOTIFICATIONS_STORAGE_KEY));
  const [hiddenNotifications, setHiddenNotifications] = useState(() => readStoredStringArray(HIDDEN_NOTIFICATIONS_STORAGE_KEY));
  const { pathname } = useLocation();
  const onlineCount = miners.filter((miner) => miner.active && !miner.stale).length;
  const alerts = buildAlerts(miners, thresholds).filter((alert) => !dismissedAlertIds.includes(alert.id));
  const sortedLogs = [...activityLogs].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  const dedupedLogs = sortedLogs.filter((log, index) => {
    if (index === 0) return true;
    const prev = sortedLogs[index - 1];
    const timeDiff = Math.abs(Number(log.timestamp || 0) - Number(prev.timestamp || 0));
    return !(log.deviceId === prev.deviceId && log.title === prev.title && timeDiff < 60_000);
  });
  // A live alert and its recorded activity log can describe the same condition. Order
  // alerts before logs and dedupe by device+condition so the bell shows each once.
  const allEvents = dedupeNotificationEvents([
    ...alerts.map((alert) => ({
      id: alert.id,
      source: "alert",
      deviceId: alert.deviceId,
      condition: conditionForAlertId(alert.id),
      title: alert.message,
      detail: "Live miner condition requires supervisor review.",
      severity: alert.severity,
      timestamp: null,
    })),
    ...dedupedLogs.map((log) => ({ ...log, condition: conditionForLog(log) })),
  ]);
  // Cleared (hidden) notifications are removed from the feed entirely; read state is
  // a separate, reversible flag. Both are tracked locally by notification key.
  const hiddenSet = new Set(hiddenNotifications);
  const feedEvents = allEvents.filter((event) => !hiddenSet.has(notificationKey(event)));
  const readSet = new Set(clearedNotifications);
  const isRead = (event) => readSet.has(notificationKey(event));
  const notificationCount = feedEvents.reduce((count, event) => count + (isRead(event) ? 0 : 1), 0);
  const criticalCount = feedEvents.filter((event) => !isRead(event) && event.severity === "critical").length;
  const warningCount = feedEvents.filter((event) => !isRead(event) && event.severity === "warning").length;
  // Unread first (original order preserved within each group), capped for the panel.
  const orderedEvents = [...feedEvents].sort((a, b) => Number(isRead(a)) - Number(isRead(b)));
  const visibleEvents = (showUnreadOnly ? orderedEvents.filter((event) => !isRead(event)) : orderedEvents).slice(0, 30);

  const markRead = (event) => setClearedNotifications((items) => [...new Set([...items, notificationKey(event)])]);
  const markUnread = (event) => setClearedNotifications((items) => items.filter((key) => key !== notificationKey(event)));
  const toggleRead = (event) => (isRead(event) ? markUnread(event) : markRead(event));

  // clearNotification — removes a single row from the panel. Live alerts also clear
  // from the dashboard banner so the two stay consistent.
  const clearNotification = (event) => {
    if (event.source === "alert") onDismissAlerts?.([event.id]);
    setHiddenNotifications((items) => [...new Set([...items, notificationKey(event)])]);
  };

  // clearAllNotifications — removes every notification currently in the feed.
  const clearAllNotifications = () => {
    const alertIds = feedEvents.filter((event) => event.source === "alert").map((event) => event.id);
    if (alertIds.length) onDismissAlerts?.(alertIds);
    setHiddenNotifications((items) => [...new Set([...items, ...feedEvents.map(notificationKey)])]);
    setClearConfirmOpen(false);
  };

  // openNotification — clicking a row marks it read.
  const openNotification = (event) => markRead(event);
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

  useEffect(() => {
    localStorage.setItem(HIDDEN_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(hiddenNotifications));
  }, [hiddenNotifications]);

  const saveAccount = () => {
    const next = {
      name: account.name.trim() || "Admin",
      email: account.email.trim().toLowerCase(),
      role: account.role.trim() || "Supervisor",
      shift: account.shift.trim() || "Night Shift",
      photoURL: account.photoURL || "",
    };

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
      setAccountError("Enter a valid account email address.");
      return;
    }

    updateUser(next);
    setAccount(next);
    setAccountError("");
    setAvatarError("");
    setAccountSaved(true);
  };

  // handleAvatarChange — validates the chosen file, then center-crops and downscales
  // it to a 200px square JPEG (base64). The result is *staged* into the form
  // (account.photoURL) and only persisted when the user clicks Save Account, so it
  // matches the modal's Save/Cancel workflow. Reports a clear error on any failure.
  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarError("Choose an image file (PNG, JPG, or WEBP).");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Image is too large. Pick one under 8 MB.");
      return;
    }

    setAvatarError("");
    const reader = new FileReader();
    reader.onerror = () => setAvatarError("Could not read that file. Try another image.");
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => setAvatarError("That image appears to be corrupted.");
      img.onload = () => {
        const SIZE = 200;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        // Fill first so transparent PNGs don't turn black when flattened to JPEG.
        ctx.fillStyle = "#15181a";
        ctx.fillRect(0, 0, SIZE, SIZE);
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        const src = canvas.toDataURL("image/jpeg", 0.82);
        setAccount((prev) => ({ ...prev, photoURL: src }));
        setAccountSaved(false);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // removePhoto — stages photo removal; committed on Save Account.
  const removePhoto = () => {
    setAvatarError("");
    setAccount((prev) => ({ ...prev, photoURL: "" }));
    setAccountSaved(false);
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

  // markAllRead — marks every notification in the feed read (non-destructive; rows
  // stay visible, dimmed, and can be toggled back to unread).
  const markAllRead = () => {
    setClearedNotifications((items) => [...new Set([...items, ...feedEvents.map(notificationKey)])]);
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
            <SecurityRow label="Session" value={user?.source === "firebase" ? "Authenticated account" : user?.source === "local" ? "Local account mode" : "Demo supervisor"} good />
            <SecurityRow label="Access level" value={canManage ? "Full — can manage devices, settings & logs" : "View-only — monitoring access only"} good={canManage} />
            <SecurityRow label="Realtime source" value={usingRealtime ? "Live device stream active" : "Waiting for verified device data"} good={usingRealtime} />
            <SecurityRow label="Device alerts" value={`${alerts.length} condition${alerts.length === 1 ? "" : "s"} need review`} good={alerts.length === 0} />
            <SecurityRow label="Data policy" value="Secrets stay in environment variables; destructive device actions require confirmation." good />
            {connectionError && <div style={{ color: C.amber, fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{connectionError}</div>}
          </div>
        </Modal>
      )}

      {notificationsOpen && !clearConfirmOpen && (
        <Modal
          title="Miner Notifications"
          className="notification-modal-panel"
          onClose={() => setNotificationsOpen(false)}
          actions={
            <>
              <button
                onClick={() => setClearConfirmOpen(true)}
                disabled={visibleEvents.length === 0}
                style={{ ...ghostButtonStyle, padding: "9px 14px", color: C.red, borderColor: `${C.red}44`, opacity: visibleEvents.length ? 1 : 0.5, cursor: visibleEvents.length ? "pointer" : "not-allowed" }}
              >
                Clear all
              </button>
              <button
                onClick={markAllRead}
                disabled={notificationCount === 0}
                style={{ ...ghostButtonStyle, padding: "9px 14px", opacity: notificationCount ? 1 : 0.5, cursor: notificationCount ? "pointer" : "not-allowed" }}
              >
                Mark all read
              </button>
              <button onClick={() => setNotificationsOpen(false)} style={{ ...primaryButtonStyle, padding: "9px 16px" }}>
                Done
              </button>
            </>
          }
        >
          <div className="notification-modal-content">
          <div className="notification-modal-summary" style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 11 }}>
            {notificationCount === 0 ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.green, fontSize: 12, fontWeight: 800 }}>
                <Icon name="check" size={14} color={C.green} /> All caught up
              </span>
            ) : (
              <>
                <span style={{ color: C.textMuted, fontSize: 12 }}>{notificationCount} unread</span>
                {criticalCount > 0 && <CountChip color={C.red} label={`${criticalCount} critical`} />}
                {warningCount > 0 && <CountChip color={C.amber} label={`${warningCount} warning`} />}
              </>
            )}
            <button
              onClick={() => setShowUnreadOnly((value) => !value)}
              style={{ marginLeft: "auto", ...ghostButtonStyle, padding: "4px 10px", fontSize: 10, fontWeight: 900, color: showUnreadOnly ? C.primary : C.textMuted, borderColor: showUnreadOnly ? `${C.primary}55` : C.border }}
            >
              {showUnreadOnly ? "Showing unread" : "Show all"}
            </button>
          </div>
          <div className="notification-list hide-scrollbar" style={{ display: "grid", gap: 8, overflow: "auto" }}>
            {visibleEvents.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: 13 }}>
                {showUnreadOnly ? "No unread notifications." : "No miner activity has been recorded yet."}
              </div>
            ) : (
              visibleEvents.map((event) => (
                <NotificationRow
                  key={notificationKey(event)}
                  event={event}
                  read={isRead(event)}
                  onOpen={() => openNotification(event)}
                  onToggleRead={() => toggleRead(event)}
                  onClear={() => clearNotification(event)}
                />
              ))
            )}
          </div>
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
              <button onClick={clearAllNotifications} style={{ ...primaryButtonStyle, padding: "9px 16px", background: `${C.red}22`, borderColor: `${C.red}55`, color: C.red }}>
                Clear All
              </button>
            </>
          }
        >
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: `${C.red}18`, border: `1px solid ${C.red}44`, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <BellIcon color={C.red} />
            </div>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Clear all {visibleEvents.length} notification{visibleEvents.length === 1 ? "" : "s"}?</div>
              <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 6 }}>
                This removes them from the panel and clears any active alerts from the dashboard banner. A condition that is still live will reappear as a new notification when it next updates.
              </div>
            </div>
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
              {/* Profile hero — avatar + live name/email + badges + photo controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: `linear-gradient(135deg, ${C.primary}10 0%, ${C.primary}04 100%)`, border: `1px solid ${C.primary}28`, borderRadius: 10 }}>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  title="Click to change profile photo"
                  style={{ width: 56, height: 56, borderRadius: "50%", background: `${C.primary}18`, border: `2px solid ${C.primary}45`, display: "grid", placeItems: "center", fontSize: 16, color: C.primary, fontWeight: 900, flexShrink: 0, cursor: "pointer", overflow: "hidden", position: "relative" }}
                >
                  {account.photoURL
                    ? <img src={account.photoURL} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                    <AccessBadge viewOnly={isViewOnlyRole(account.role)} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                    <PhotoButton onClick={() => fileInputRef.current?.click()}>
                      <CameraIcon size={12} color={C.primary} />
                      {account.photoURL ? "Change photo" : "Upload photo"}
                    </PhotoButton>
                    {account.photoURL && (
                      <PhotoButton danger onClick={removePhoto}>Remove photo</PhotoButton>
                    )}
                  </div>
                </div>
              </div>

              {/* Avatar error / staged-change hint */}
              {avatarError ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: `${C.amber}10`, border: `1px solid ${C.amber}35`, borderRadius: 7, marginTop: -4 }}>
                  <span style={{ color: C.amber, fontSize: 16, lineHeight: 1, fontWeight: 900 }}>!</span>
                  <span style={{ color: C.amber, fontSize: 11.5 }}>{avatarError}</span>
                </div>
              ) : account.photoURL !== (user?.photoURL || "") ? (
                <div style={{ color: C.textMuted, fontSize: 11, marginTop: -4, paddingLeft: 2 }}>
                  Photo change is staged — click <strong style={{ color: C.text }}>Save Account</strong> to apply it.
                </div>
              ) : null}

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
                      <AccountSelectField
                        label="Role"
                        value={account.role}
                        options={ROLE_OPTIONS}
                        hint={isViewOnlyRole(account.role) ? "Read-only access" : "Can manage devices, settings & logs"}
                        onChange={(role) => { setAccount({ ...account, role }); setAccountSaved(false); }}
                      />
                      <AccountField label="Assigned Shift" value={account.shift} onChange={(shift) => { setAccount({ ...account, shift }); setAccountSaved(false); }} />
                    </div>
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
          minHeight: 60,
          background: C.navbar,
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 14,
          flexShrink: 0,
          position: "relative",
          zIndex: 60,
        }}
      >
        {/* Title with accent rail */}
        <div className="navbar-title" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{ width: 3, height: 32, borderRadius: 3, background: C.primaryGradient, boxShadow: "0 0 14px rgba(255,106,0,0.45)", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9.5, color: C.primary, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 900 }}>Smart Chest Miner</div>
            <div style={{ fontSize: 18, fontWeight: 950, color: C.text, marginTop: 1, lineHeight: 1.1, letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pageLabels[pathname] || "Live Monitoring"}</div>
          </div>
        </div>

        {/* Live status cluster */}
        <div className="navbar-status" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Pill tone={usingRealtime ? "good" : "warn"}>{usingRealtime ? "Firebase live" : connectionError ? "Firebase notice" : "Awaiting data"}</Pill>
          <Pill tone={onlineCount > 0 ? "good" : "danger"}>{onlineCount}/{miners.length} online</Pill>
        </div>

        <NavDivider />

        {/* Clock */}
        <div className="navbar-clock" style={{ display: "flex", alignItems: "center", gap: 7, color: C.primary, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>
          <ClockIcon />
          <span style={{ minWidth: 148, textAlign: "right" }}>{formatSystemTimestamp(time)}</span>
        </div>

        <NavDivider />

        {/* Actions */}
        <div className="navbar-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => { setClearConfirmOpen(false); setNotificationsOpen(true); }}
            title="Miner notifications"
            className="nav-icon-btn"
            style={{ ...ghostButtonStyle, width: 36, height: 36, padding: 0, display: "grid", placeItems: "center", position: "relative", flexShrink: 0 }}
          >
            <BellIcon />
            {notificationCount > 0 && (
              <span
                className={criticalCount > 0 ? "dot-live" : undefined}
                style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 4px", boxSizing: "border-box", borderRadius: 999, display: "grid", placeItems: "center", background: criticalCount > 0 ? C.red : C.primary, color: C.text, fontSize: 10, fontWeight: 900, border: `2px solid ${C.bg0}` }}
              >
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            )}
          </button>
          <button onClick={() => setSecurityOpen(true)} className="nav-action-btn navbar-security" style={{ ...ghostButtonStyle, padding: "8px 12px", fontSize: 12, fontWeight: 800, height: 36 }}>
            Security
          </button>
          <button
            onClick={() => {
              setAccount(accountFromUser(user));
              setAccountError("");
              setAvatarError("");
              setAccountSaved(false);
              setAccountTab("profile");
              setPw({ current: "", next: "", confirm: "" });
              setPwError("");
              setPwSaved(false);
              setAccountOpen(true);
            }}
            title={user?.email}
            className="nav-avatar-btn"
            style={{ ...avatarStyle, width: 36, height: 36, cursor: "pointer", padding: 0, overflow: "hidden" }}
          >
            {user?.photoURL
              ? <img src={user.photoURL} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
              : (initials || "AD")
            }
          </button>
          <button onClick={onLogout} className="nav-action-btn nav-action-danger navbar-logout" style={{ ...ghostButtonStyle, padding: "8px 12px", fontSize: 12, fontWeight: 800, height: 36 }}>
            <span className="navbar-logout-label">Logout</span>
            <span className="navbar-logout-icon" aria-hidden="true">↪</span>
          </button>
        </div>
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
    photoURL: user?.photoURL || "",
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

// AccountSelectField — labelled dropdown (used for Role) with a helper hint line
function AccountSelectField({ label, value, options, onChange, hint }) {
  const known = options.includes(value);
  return (
    <label>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</div>
      <select value={known ? value : ""} onChange={(event) => onChange(event.target.value)} style={{ ...controlStyle, width: "100%" }}>
        {!known && <option value="">{value || "Select role"}</option>}
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      {hint && <div style={{ color: C.textMuted, fontSize: 10, marginTop: 5, lineHeight: 1.4 }}>{hint}</div>}
    </label>
  );
}

// AccessBadge — shows the access level a role grants (manage vs read-only)
function AccessBadge({ viewOnly }) {
  const color = viewOnly ? C.amber : C.green;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 999,
      background: `${color}14`, border: `1px solid ${color}40`, color,
      fontSize: 10, fontWeight: 900,
    }}>
      <Icon name={viewOnly ? "shield" : "check"} size={11} color={color} />
      {viewOnly ? "View only" : "Can manage"}
    </span>
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

// CountChip — small severity/summary pill used in the notifications panel header
function CountChip({ color, label, icon }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" }}>
      {icon && <Icon name={icon} size={11} color={color} />}
      {label}
    </span>
  );
}

const NOTIFICATION_ICONS = { alert: "alert", status: "contact" };

// NotificationRow — single entry in the notifications panel. The whole row is
// clickable (opens it and marks it read), with an explicit read/unread toggle.
// Read rows are dimmed; unread rows show a dot.
function NotificationRow({ event, read, onOpen, onToggleRead, onClear }) {
  const color = event.severity === "critical" ? C.red : event.severity === "warning" ? C.amber : event.status === "online" ? C.green : C.textMuted;
  const label = event.severity || event.status || "info";
  const iconName = NOTIFICATION_ICONS[event.source] || (event.severity === "critical" ? "alert" : "clock");
  return (
    <div
      className="notification-row"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      style={{
        border: `1px solid ${C.borderSoft}`,
        borderLeft: `3px solid ${read ? `${color}55` : color}`,
        padding: 12,
        background: read ? "transparent" : "rgba(255,255,255,0.04)",
        borderRadius: 7,
        cursor: "pointer",
        opacity: read ? 0.62 : 1,
        transition: "opacity 0.15s, background 0.15s",
      }}
    >
      <div className="notification-row-main" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div className="notification-row-title" style={{ display: "flex", gap: 8, alignItems: "start", minWidth: 0 }}>
          <span style={{ marginTop: 1, flexShrink: 0, position: "relative" }}>
            <Icon name={iconName} size={14} color={color} />
            {!read && <span style={{ position: "absolute", top: -3, right: -3, width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />}
          </span>
          <div style={{ color: C.text, fontSize: 12, fontWeight: read ? 700 : 900, lineHeight: 1.35, minWidth: 0 }}>{event.title}</div>
        </div>
        <div className="notification-row-actions" style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <div style={{ color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontWeight: 900, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleRead(); }}
            title={read ? "Mark as unread" : "Mark as read"}
            aria-label={read ? "Mark as unread" : "Mark as read"}
            style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${C.borderSoft}`, background: "transparent", color: read ? C.textMuted : C.green, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, lineHeight: 0 }}
          >
            {read
              ? <span style={{ width: 9, height: 9, borderRadius: "50%", border: `2px solid ${C.textMuted}` }} />
              : <Icon name="check" size={13} color={C.green} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            title="Clear notification"
            aria-label="Clear notification"
            style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${C.borderSoft}`, background: "transparent", color: C.textMuted, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, lineHeight: 1, fontSize: 14 }}
          >
            ×
          </button>
        </div>
      </div>
      <div className="notification-row-detail" style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.45, marginTop: 4, paddingLeft: 22 }}>{event.detail}</div>
      <div className="notification-row-time" style={{ marginTop: 8, paddingLeft: 22 }}>
        <span style={{ color: C.textMuted, fontSize: 10 }}>{event.timestamp ? formatSystemTimestamp(event.timestamp) : "Current condition"}</span>
      </div>
    </div>
  );
}

// NavDivider — thin vertical separator between navbar clusters
function NavDivider() {
  return <div className="navbar-divider" style={{ width: 1, height: 26, background: C.borderSoft, flexShrink: 0 }} aria-hidden="true" />;
}


// ClockIcon — small clock glyph shown beside the live timestamp
function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
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

// CameraIcon — camera SVG shown on avatar hover overlay and photo buttons
function CameraIcon({ size = 16, color = "white" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

// PhotoButton — small pill button for the avatar upload / remove actions
function PhotoButton({ children, onClick, danger }) {
  const color = danger ? C.red : C.primary;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 11px", borderRadius: 7, cursor: "pointer",
        background: `${color}12`, border: `1px solid ${color}3a`, color,
        fontSize: 11, fontWeight: 800,
      }}
    >
      {children}
    </button>
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

