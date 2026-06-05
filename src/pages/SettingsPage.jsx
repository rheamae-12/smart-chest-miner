import { useState } from "react";
import Modal from "../components/Modal";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";

const PUSH_ENABLED_KEY = "smart-chest-miner-push-enabled";

export default function SettingsPage({ miners, thresholds, setThresholds, staleSeconds, setStaleSeconds }) {
  const [localThresholds, setLocalThresholds] = useState(thresholds);
  const [localStaleSeconds, setLocalStaleSeconds] = useState(staleSeconds ?? 75);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem(PUSH_ENABLED_KEY) !== "false");

  const handlePushToggle = (enabled) => {
    setPushEnabled(enabled);
    localStorage.setItem(PUSH_ENABLED_KEY, String(enabled));
  };

  const setHr = (patch) => setLocalThresholds((prev) => ({ ...prev, ...patch }));

  const requestSave = () => {
    setError("");
    if (localThresholds.hrMin >= localThresholds.hrMax) {
      setError("Heart-rate minimum must be lower than the maximum.");
      return;
    }
    if (localThresholds.spo2Min < 70 || localThresholds.spo2Min > 100) {
      setError("SpO2 minimum must be between 70 and 100.");
      return;
    }
    if (localStaleSeconds < 10 || localStaleSeconds > 300) {
      setError("Offline timeout must be between 10 and 300 seconds.");
      return;
    }
    setConfirmOpen(true);
  };

  const executeSave = () => {
    setThresholds(localThresholds);
    setStaleSeconds?.(localStaleSeconds);
    setConfirmOpen(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2800);
  };

  const discard = () => {
    setLocalThresholds(thresholds);
    setLocalStaleSeconds(staleSeconds ?? 75);
    setError("");
  };

  const online = miners.filter((m) => m.active).length;
  const offline = miners.filter((m) => !m.active).length;
  const warnings = miners.filter((m) => m.finger === false || m.manual_alert).length;

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
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: `${C.primary}18`, border: `1px solid ${C.primary}40`, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <span style={{ color: C.primary, fontSize: 10, fontWeight: 900 }}>SAV</span>
            </div>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Apply these settings?</div>
              <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 6 }}>
                The new thresholds and offline timeout will take effect immediately for all connected miners.
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 7 }}>
            <SettingSummaryRow label="Heart Rate Range" value={`${localThresholds.hrMin} – ${localThresholds.hrMax} BPM`} color={C.red} />
            <SettingSummaryRow label="SpO2 Minimum" value={`${localThresholds.spo2Min}%`} color={C.primary} />
            <SettingSummaryRow label="Offline Timeout" value={`${localStaleSeconds} seconds`} color={C.amber} />
          </div>
        </Modal>
      )}

      <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 14, height: "100%", minHeight: 0 }}>

        <header style={{ ...cardStyle, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: C.primary, fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 900 }}>Configuration</div>
            <div style={{ color: C.text, fontSize: 22, fontWeight: 950, marginTop: 4 }}>System Settings</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>Adjust alert thresholds and monitoring behavior for all connected miners.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill value={online} label="Online" color={C.green} />
            <Pill value={offline} label="Offline" color={C.offline} />
            {warnings > 0 && <Pill value={warnings} label="Warnings" color={C.amber} />}
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignContent: "start", minHeight: 0 }}>

          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <SettingsCard
              number="01"
              title="Vital Alert Thresholds"
              description="Set the safe limits for heart rate and blood oxygen. Readings outside these bounds trigger alerts on connected miners."
            >
              <div style={{ display: "grid", gap: 10 }}>
                {/* Heart Rate row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 10, border: `1px solid ${C.red}30`, background: `${C.red}08` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 108 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, boxShadow: `0 0 8px ${C.red}`, flexShrink: 0 }} />
                    <span style={{ color: C.text, fontSize: 12, fontWeight: 950 }}>Heart Rate</span>
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <StepperField
                      label="Min"
                      value={localThresholds.hrMin}
                      onChange={(v) => setHr({ hrMin: Math.min(v, localThresholds.hrMax - 1) })}
                      min={20}
                      max={localThresholds.hrMax - 1}
                    />
                    <span style={{ color: C.textMuted, fontSize: 16, fontWeight: 300, alignSelf: "flex-end", paddingBottom: 3, userSelect: "none" }}>—</span>
                    <StepperField
                      label="Max"
                      value={localThresholds.hrMax}
                      onChange={(v) => setHr({ hrMax: Math.max(v, localThresholds.hrMin + 1) })}
                      min={localThresholds.hrMin + 1}
                      max={250}
                    />
                  </div>
                  <span style={{ color: C.red, fontSize: 11, fontWeight: 900, minWidth: 30, textAlign: "right" }}>BPM</span>
                </div>

                {/* SpO2 row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 10, border: `1px solid ${C.primary}30`, background: `${C.primary}08` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 108 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.primary, boxShadow: `0 0 8px ${C.primary}`, flexShrink: 0 }} />
                    <span style={{ color: C.text, fontSize: 12, fontWeight: 950 }}>Blood Oxygen</span>
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <StepperField
                      label="Min"
                      value={localThresholds.spo2Min}
                      onChange={(v) => setHr({ spo2Min: v })}
                      min={70}
                      max={100}
                    />
                    <span style={{ color: C.textMuted, fontSize: 11, alignSelf: "flex-end", paddingBottom: 6, userSelect: "none" }}>or above</span>
                  </div>
                  <span style={{ color: C.primary, fontSize: 11, fontWeight: 900, minWidth: 30, textAlign: "right" }}>%</span>
                </div>

                {/* Range preview bars */}
                <div style={{ display: "grid", gap: 7, padding: "6px 0 2px" }}>
                  <RangeBar label="HR safe band" valueText={`${localThresholds.hrMin} – ${localThresholds.hrMax} BPM`} color={C.red} />
                  <RangeBar label="SpO2 floor" valueText={`${localThresholds.spo2Min}% and above`} color={C.primary} />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              number="03"
              title="System Status"
              description="Live count of all registered miners and their current state."
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                <StatusBox label="Total Miners" value={miners.length} color={C.primary} desc="Registered" />
                <StatusBox label="Online Now" value={online} color={C.green} desc="Active" />
                <StatusBox label="Offline" value={offline} color={C.offline} desc="No signal" />
                <StatusBox label="Needs Attention" value={warnings} color={warnings ? C.amber : C.green} desc={warnings ? "Check required" : "All clear"} />
              </div>
            </SettingsCard>
          </div>

          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <SettingsCard
              number="02"
              title="Monitoring Timing"
              description="How long the system waits before marking a device as offline when it stops sending readings."
            >
              <div style={{ marginBottom: 14 }}>
                <SettingField
                  label="Offline Timeout"
                  unit="seconds"
                  value={localStaleSeconds}
                  onChange={(v) => setLocalStaleSeconds(Number(v))}
                  hint="Mark a miner offline after this many seconds with no data (10–300)"
                />
              </div>
              <InfoRow
                label="How it works"
                text="The sensor data stream is live — if a miner stops sending readings for longer than this timeout, it is automatically marked offline."
              />
            </SettingsCard>

            <SettingsCard
              number="04"
              title="Alert Notifications"
              description="Control how the system notifies you when a miner condition is triggered."
            >
              {/* Push notification toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.025)", marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>Push Notifications</div>
                  <div style={{ color: C.textMuted, fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>Alert beep and browser notification when conditions fire</div>
                </div>
                <Toggle value={pushEnabled} onChange={handlePushToggle} />
              </div>
              {!pushEnabled && (
                <div style={{ padding: "9px 12px", background: `${C.amber}0D`, border: `1px solid ${C.amber}2A`, borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ color: C.amber, fontSize: 11, fontWeight: 700 }}>Notifications are off — alerts will still appear on screen but no sound or browser pop-up will fire.</div>
                </div>
              )}
              {"Notification" in window && Notification.permission === "denied" && pushEnabled && (
                <div style={{ padding: "9px 12px", background: `${C.red}0D`, border: `1px solid ${C.red}2A`, borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ color: C.red, fontSize: 11, fontWeight: 700 }}>Browser notifications are blocked. Allow them in your browser settings to receive pop-up alerts.</div>
                </div>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                <AlertRow label="Critical Alert" description="Manual button pressed or SpO2 dangerously low" color={C.red} />
                <AlertRow label="Warning Alert" description="Heart rate out of range or chest contact lost" color={C.amber} />
                <AlertRow label="Device Offline" description="A miner stops sending data past the offline timeout" color={C.offline} />
              </div>
            </SettingsCard>
          </div>
        </div>

        <footer style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
          <button onClick={requestSave} style={{ ...primaryButtonStyle, padding: "11px 28px", fontSize: 13 }}>Save Changes</button>
          <button onClick={discard} style={{ ...ghostButtonStyle, padding: "11px 18px", fontSize: 13 }}>Discard Changes</button>
          {saved && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.green, fontWeight: 800 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block" }} />
              Settings saved
            </span>
          )}
          {error && <span style={{ fontSize: 12, color: C.red, fontWeight: 800 }}>{error}</span>}
        </footer>
      </div>
    </div>
  );
}

function StepperField({ label, value, onChange, min, max }) {
  const dec = () => onChange(Math.max(min ?? -Infinity, value - 1));
  const inc = () => onChange(Math.min(max ?? Infinity, value + 1));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <span style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 900 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={dec} style={stepBtnStyle} disabled={min !== undefined && value <= min}>−</button>
        <div style={{ color: C.text, fontSize: 22, fontWeight: 950, minWidth: 46, textAlign: "center", lineHeight: 1, userSelect: "none" }}>{value}</div>
        <button onClick={inc} style={stepBtnStyle} disabled={max !== undefined && value >= max}>+</button>
      </div>
    </div>
  );
}

const stepBtnStyle = {
  width: 28,
  height: 28,
  borderRadius: 7,
  background: "rgba(255,255,255,0.06)",
  border: `1px solid rgba(255,255,255,0.12)`,
  color: C.text,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  lineHeight: 1,
  flexShrink: 0,
};

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

function SettingsCard({ number, title, description, children }) {
  return (
    <section style={{ ...cardStyle, padding: "18px 20px", minWidth: 0 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${C.primary}1A`, border: `1px solid ${C.primary}44`, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <span style={{ color: C.primary, fontSize: 11, fontWeight: 900 }}>{number}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>{title}</div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{description}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function SettingField({ label, unit, value, onChange, hint }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</span>
        <span style={{ color: C.primary, fontSize: 9, fontWeight: 900, textTransform: "uppercase" }}>{unit}</span>
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...controlStyle, width: "100%", textAlign: "center", fontSize: 20, fontWeight: 950, padding: "10px 8px" }}
      />
      <span style={{ color: C.textMuted, fontSize: 10, lineHeight: 1.4 }}>{hint}</span>
    </label>
  );
}

function RangeBar({ label, valueText, color }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ color: C.textMuted, fontSize: 11 }}>{label}</span>
        <span style={{ color, fontSize: 11, fontWeight: 900 }}>{valueText}</span>
      </div>
      <div style={{ height: 3, borderRadius: 999, background: C.border, overflow: "hidden" }}>
        <div style={{ width: "68%", height: "100%", marginLeft: "16%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function StatusBox({ label, value, color, desc }) {
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: "11px 13px", background: "rgba(255,255,255,0.02)" }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color, fontSize: 26, fontWeight: 950, marginTop: 4 }}>{value}</div>
      <div style={{ color: C.textMuted, fontSize: 10, marginTop: 2 }}>{desc}</div>
    </div>
  );
}

function InfoRow({ label, text }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, padding: "9px 11px", background: "rgba(255,255,255,0.025)", borderRadius: 7, border: `1px solid ${C.borderSoft}` }}>
      <span style={{ color: C.primary, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap", paddingTop: 1 }}>{label}</span>
      <span style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function AlertRow({ label, description, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, border: `1px solid ${color}2A`, background: `${color}08` }}>
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

function SettingSummaryRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,0.025)", borderRadius: 7, border: `1px solid ${C.borderSoft}` }}>
      <span style={{ color: C.textMuted, fontSize: 12 }}>{label}</span>
      <strong style={{ color, fontSize: 12 }}>{value}</strong>
    </div>
  );
}
