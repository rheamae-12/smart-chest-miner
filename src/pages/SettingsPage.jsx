import { useState } from "react";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/useAuth";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";

const PUSH_ENABLED_KEY = "smart-chest-miner-push-enabled";

export default function SettingsPage({ miners, staleSeconds, setStaleSeconds }) {
  const { canManage } = useAuth();
  const [localStaleSeconds, setLocalStaleSeconds] = useState(staleSeconds ?? 75);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem(PUSH_ENABLED_KEY) !== "false");

  const online = miners.filter((m) => m.active).length;
  const offline = miners.filter((m) => !m.active).length;
  const warnings = miners.filter((m) => m.finger === false || m.manual_alert || m.button_pressed).length;

  const handlePushToggle = (enabled) => {
    setPushEnabled(enabled);
    localStorage.setItem(PUSH_ENABLED_KEY, String(enabled));
  };

  const requestSave = () => {
    setError("");
    if (localStaleSeconds < 10 || localStaleSeconds > 300) {
      setError("Offline timeout must be between 10 and 300 seconds.");
      return;
    }
    setConfirmOpen(true);
  };

  const executeSave = () => {
    setStaleSeconds?.(localStaleSeconds);
    setConfirmOpen(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2800);
  };

  const discard = () => {
    setLocalStaleSeconds(staleSeconds ?? 75);
    setError("");
  };

  return (
    <div style={pageStyle}>
      {confirmOpen && (
        <Modal
          title="Save Settings"
          onClose={() => setConfirmOpen(false)}
          actions={
            <>
              <button onClick={() => setConfirmOpen(false)} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Cancel</button>
              <button onClick={executeSave} style={{ ...primaryButtonStyle, padding: "9px 15px" }}>Confirm Save</button>
            </>
          }
        >
          <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.6 }}>
            Apply an offline timeout of <strong style={{ color: C.text }}>{localStaleSeconds} seconds</strong> to connected miners?
          </div>
        </Modal>
      )}

      <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 10, height: "100%", minHeight: 0 }}>
        <PageHeader
          label="Configuration"
          title="System Settings"
          titleSize={20}
          subtitle="Adjust monitoring behavior and alert delivery for connected miners."
          padding="14px 18px"
          right={
            <>
              <Pill value={online} label="Online" color={C.green} />
              <Pill value={offline} label="Offline" color={C.offline} />
              {warnings > 0 && <Pill value={warnings} label="Warnings" color={C.amber} />}
            </>
          }
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignContent: "start", minHeight: 0 }}>
          <SettingsCard
            number="01"
            title="Monitoring Timing"
            description="How long the system waits before marking a device as offline when it stops sending readings."
          >
            <SettingField
              label="Offline Timeout"
              unit="seconds"
              value={localStaleSeconds}
              onChange={(v) => setLocalStaleSeconds(Number(v))}
              hint="Mark a miner offline after this many seconds with no data (10-300)."
            />
            <InfoRow
              label="Status"
              text="Vital limits are fixed in software and firmware so the website no longer exposes threshold configuration."
            />
          </SettingsCard>

          <SettingsCard
            number="02"
            title="Alert Notifications"
            description="Control how the system notifies you when a miner condition is triggered."
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.025)", marginBottom: 9 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>Push Notifications</div>
                <div style={{ color: C.textMuted, fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>Alert beep and browser notification when conditions fire</div>
              </div>
              <Toggle value={pushEnabled} onChange={handlePushToggle} />
            </div>
            {!pushEnabled && (
              <div style={{ padding: "9px 12px", background: `${C.amber}0D`, border: `1px solid ${C.amber}2A`, borderRadius: 8, marginBottom: 12 }}>
                <div style={{ color: C.amber, fontSize: 11, fontWeight: 700 }}>Notifications are off; alerts will still appear on screen.</div>
              </div>
            )}
            {"Notification" in window && Notification.permission === "denied" && pushEnabled && (
              <div style={{ padding: "9px 12px", background: `${C.red}0D`, border: `1px solid ${C.red}2A`, borderRadius: 8, marginBottom: 12 }}>
                <div style={{ color: C.red, fontSize: 11, fontWeight: 700 }}>Browser notifications are blocked. Allow them in browser settings to receive pop-up alerts.</div>
              </div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <AlertRow label="Critical Alert" description="Manual SOS button, low SpO2, or high body temperature" color={C.red} />
              <AlertRow label="Warning Alert" description="Heart rate out of range, chest contact lost, or low body temperature" color={C.amber} />
              <AlertRow label="Device Offline" description="A miner stops sending data past the offline timeout" color={C.offline} />
            </div>
          </SettingsCard>
        </div>

        <footer style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
          <button
            onClick={requestSave}
            disabled={!canManage}
            title={canManage ? undefined : "Your account is view-only"}
            style={{ ...primaryButtonStyle, padding: "11px 28px", fontSize: 13, opacity: canManage ? 1 : 0.5, cursor: canManage ? "pointer" : "not-allowed" }}
          >
            Save Changes
          </button>
          <button onClick={discard} disabled={!canManage} style={{ ...ghostButtonStyle, padding: "11px 18px", fontSize: 13, opacity: canManage ? 1 : 0.5, cursor: canManage ? "pointer" : "not-allowed" }}>Discard Changes</button>
          {!canManage && <span style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>View-only account; settings are read-only.</span>}
          {saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 800 }}>Settings saved</span>}
          {error && <span style={{ fontSize: 12, color: C.red, fontWeight: 800 }}>{error}</span>}
        </footer>
      </div>
    </div>
  );
}

function SettingsCard({ number, title, description, children }) {
  return (
    <section style={{ ...cardStyle, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: `${C.primary}1A`, border: `1px solid ${C.primary}44`, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <span style={{ color: C.primary, fontSize: 10, fontWeight: 900 }}>{number}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{title}</div>
          <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>{description}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function SettingField({ label, unit, value, onChange, hint }) {
  return (
    <label style={{ display: "grid", gap: 5, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</span>
        <span style={{ color: C.primary, fontSize: 9, fontWeight: 900, textTransform: "uppercase" }}>{unit}</span>
      </div>
      <input
        type="number"
        min={10}
        max={300}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...controlStyle, width: "100%", textAlign: "center", fontSize: 17, fontWeight: 950, padding: "8px" }}
      />
      <span style={{ color: C.textMuted, fontSize: 10, lineHeight: 1.4 }}>{hint}</span>
    </label>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: value ? C.green : "rgba(255,255,255,0.1)",
        border: `1px solid ${value ? C.green : "rgba(255,255,255,0.15)"}`,
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
        padding: 0,
        transition: "background 0.18s, border-color 0.18s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: value ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: C.text,
          transition: "left 0.18s",
        }}
      />
    </button>
  );
}

function InfoRow({ label, text }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, padding: "7px 9px", background: "rgba(255,255,255,0.025)", borderRadius: 7, border: `1px solid ${C.borderSoft}` }}>
      <span style={{ color: C.primary, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap", paddingTop: 1 }}>{label}</span>
      <span style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function AlertRow({ label, description, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 7, border: `1px solid ${color}2A`, background: `${color}08` }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>{label}</div>
        <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{description}</div>
      </div>
    </div>
  );
}

function Pill({ value, label, color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color, border: `1px solid ${color}44`, background: `${color}12`, borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 900 }}>
      <span style={{ fontSize: 15, fontWeight: 950 }}>{value}</span>
      {label}
    </span>
  );
}
