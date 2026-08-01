import { useState } from "react";
import PageHeader from "../components/PageHeader";
import { testFirebaseConnection } from "../firebase/database";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle } from "../theme";

const PUSH_ENABLED_KEY = "smart-chest-miner-push-enabled";

export default function SettingsPage({ miners, staleSeconds }) {
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem(PUSH_ENABLED_KEY) !== "false");
  const [firebaseTest, setFirebaseTest] = useState(null);
  const [testingFirebase, setTestingFirebase] = useState(false);

  const online = miners.filter((miner) => miner.active && !miner.stale).length;
  const offline = miners.filter((miner) => !miner.active || miner.stale).length;
  const warnings = miners.filter((m) => m.finger === false || m.manual_alert).length;

  const handlePushToggle = (enabled) => {
    setPushEnabled(enabled);
    localStorage.setItem(PUSH_ENABLED_KEY, String(enabled));
  };

  const runFirebaseTest = async () => {
    setTestingFirebase(true);
    setFirebaseTest({ state: "checking" });
    try {
      const result = await testFirebaseConnection();
      const detectedDevices = Object.keys(result.devices || {}).length;
      const onlineDevices = miners.filter((miner) => miner.active && !miner.stale).length;
      setFirebaseTest({
        state: "success",
        source: result.source,
        detectedDevices,
        onlineDevices,
        offlineDevices: Math.max(0, detectedDevices - onlineDevices),
      });
    } catch (testError) {
      setFirebaseTest({ state: "error", message: testError.message || "Firebase device check failed." });
    } finally {
      setTestingFirebase(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div className="settings-layout page-layout" style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 10, height: "100%", minHeight: 0, overflow: "hidden" }}>
        <PageHeader
          label="Configuration"
          title="System Settings"
          titleSize={20}
          subtitle="Review fixed monitoring behavior and manage alert delivery for connected miners."
          padding="14px 18px"
          right={
            <>
              <Pill value={online} label="Online" color={C.green} />
              <Pill value={offline} label="Offline" color={C.offline} />
              {warnings > 0 && <Pill value={warnings} label="Warnings" color={C.amber} />}
            </>
          }
        />

        <div className="settings-grid hide-scrollbar" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, alignContent: "start", minHeight: 0, overflow: "auto" }}>
          <SettingsCard
            number="01"
            title="Monitoring Timing"
            description="How long the system waits before marking a device as offline when it stops sending readings."
          >
            <SettingField
              label="Offline Timeout"
              unit="seconds"
              value={staleSeconds ?? 75}
              hint="Fixed monitoring timeout used to identify devices that stop sending data."
            />
            <InfoRow
              label="Status"
              text="Vital limits are fixed in software and firmware so the website no longer exposes threshold configuration."
            />
            <div className="firebase-test-block">
              <button type="button" onClick={runFirebaseTest} disabled={testingFirebase} style={{ ...ghostButtonStyle, width: "100%", padding: "9px 11px", fontSize: 11, opacity: testingFirebase ? 0.7 : 1 }}>
                {testingFirebase ? "Testing Firebase..." : "Test Firebase Connection"}
              </button>
              {firebaseTest?.state === "checking" && <div className="firebase-test-result is-checking">Reading device status...</div>}
              {firebaseTest?.state === "success" && (
                <div className="firebase-test-result is-success">
                  <strong>Firebase reachable</strong>
                  <span>{firebaseTest.detectedDevices} detected · {firebaseTest.onlineDevices} online · {firebaseTest.offlineDevices} offline</span>
                  <small>{firebaseTest.source}</small>
                </div>
              )}
              {firebaseTest?.state === "error" && <div className="firebase-test-result is-error">{firebaseTest.message}</div>}
            </div>
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
              <AlertRow label="Critical Alert" description="Manual SOS button, low SpO2, or high temperature" color={C.red} />
              <AlertRow label="Warning Alert" description="Heart rate out of range, chest contact lost, or low temperature" color={C.amber} />
              <AlertRow label="Device Offline" description="A miner stops sending data past the offline timeout" color={C.offline} />
            </div>
          </SettingsCard>

          <SettingsCard
            number="03"
            title="State Lifecycle"
            description="A compact preview of how live device state changes under this configuration."
          >
            <LifecycleRow label="Receiving data" value="Online" color={C.green} text="Vitals and contact state update in real time." />
            <LifecycleRow label={`No data for ${staleSeconds ?? 75}s`} value="Offline" color={C.offline} text="The device is removed from active averages." />
            <LifecycleRow label="Stream resumes" value="Recovered" color={C.oxygen} text="The existing row updates in place without reordering." />
          </SettingsCard>
        </div>

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

function SettingField({ label, unit, value, hint }) {
  return (
    <label style={{ display: "grid", gap: 5, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</span>
        <span style={{ color: C.primary, fontSize: 9, fontWeight: 900, textTransform: "uppercase" }}>{unit}</span>
      </div>
      <div aria-label={`${label}: ${value} ${unit}`} style={{ ...controlStyle, width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 17, fontWeight: 950, padding: "8px", cursor: "default" }}>
        {value}
      </div>
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

function LifecycleRow({ label, value, color, text }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <div>
        <div style={{ color: C.text, fontSize: 11.5, fontWeight: 900 }}>{label}</div>
        <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>{text}</div>
      </div>
      <span style={{ color, fontSize: 10, fontWeight: 950, textTransform: "uppercase" }}>{value}</span>
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
