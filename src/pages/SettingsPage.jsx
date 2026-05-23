import { useState } from "react";
import { useAuth } from "../context/useAuth";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";

export default function SettingsPage({ miners, thresholds, setThresholds, pollingInterval, setPollingInterval }) {
  const { user, updateUser } = useAuth();
  const [account, setAccount] = useState({ name: user?.name || "Admin", email: user?.email || "admin@smartchestminer.io", role: user?.role || "Supervisor", shift: user?.shift || "Night Shift" });
  const [localThresholds, setLocalThresholds] = useState(thresholds);
  const [localInterval, setLocalInterval] = useState(pollingInterval);
  const [preferences, setPreferences] = useState({ critical: true, warning: true, offline: true, sound: false, retainDays: 30, staleSeconds: 75 });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = () => {
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim())) {
      setError("Enter a valid account email address.");
      return;
    }
    if (localThresholds.hrMin >= localThresholds.hrMax) {
      setError("Heart-rate minimum must be lower than maximum.");
      return;
    }
    if (localThresholds.spo2Min < 70 || localThresholds.spo2Min > 100) {
      setError("SpO2 minimum must be between 70 and 100.");
      return;
    }
    if (localInterval < 1 || localInterval > 60) {
      setError("Polling interval must be between 1 and 60 seconds.");
      return;
    }

    setThresholds(localThresholds);
    setPollingInterval(localInterval);
    updateUser({ name: account.name.trim(), email: account.email.trim().toLowerCase(), role: account.role, shift: account.shift });
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  };

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", gap: 12, height: "100%", minHeight: 0 }}>
        <header style={{ ...cardStyle, padding: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "end" }}>
          <div>
            <div style={moduleLabel}>System controls</div>
            <div style={{ color: C.text, fontSize: 26, fontWeight: 950, marginTop: 4 }}>System Configuration</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 5 }}>Account, safety thresholds, monitoring preferences, alerts, and device defaults.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <StatusPill label={`${miners.filter((miner) => miner.active).length}/${miners.length} online`} color={C.green} />
            <StatusPill label={`${miners.filter((miner) => !miner.active).length} offline`} color={C.offline} />
          </div>
        </header>

        <main className="hide-scrollbar" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, minHeight: 0, overflow: "auto" }}>
          <Section title="Account Settings" sub="Supervisor identity shown in session and audit labels">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <Field label="Full Name" value={account.name} onChange={(value) => setAccount({ ...account, name: value })} />
              <Field label="Email" value={account.email} onChange={(value) => setAccount({ ...account, email: value })} />
              <Field label="Role" value={account.role} onChange={(value) => setAccount({ ...account, role: value })} />
              <Field label="Assigned Shift" value={account.shift} onChange={(value) => setAccount({ ...account, shift: value })} />
            </div>
          </Section>

          <Section title="Safety Thresholds" sub="Live alert limits for miner vitals">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <Field type="number" label="HR Min (bpm)" value={localThresholds.hrMin} onChange={(value) => setLocalThresholds({ ...localThresholds, hrMin: Number(value) })} />
              <Field type="number" label="HR Max (bpm)" value={localThresholds.hrMax} onChange={(value) => setLocalThresholds({ ...localThresholds, hrMax: Number(value) })} />
              <Field type="number" label="SpO2 Min (%)" value={localThresholds.spo2Min} onChange={(value) => setLocalThresholds({ ...localThresholds, spo2Min: Number(value) })} />
            </div>
            <ThresholdPreview label="Heart Rate Safe Band" text={`${localThresholds.hrMin} to ${localThresholds.hrMax} bpm`} color={C.red} />
            <ThresholdPreview label="Oxygen Minimum" text={`${localThresholds.spo2Min}% and above`} color={C.primary} />
          </Section>

          <Section title="Monitoring Preferences" sub="How often the dashboard checks incoming telemetry">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <Field type="number" label="Polling Interval" value={localInterval} onChange={(value) => setLocalInterval(Number(value))} />
              <Field type="number" label="Stale Signal Window" value={preferences.staleSeconds} onChange={(value) => setPreferences({ ...preferences, staleSeconds: Number(value) })} />
              <Field type="number" label="Log Retention Days" value={preferences.retainDays} onChange={(value) => setPreferences({ ...preferences, retainDays: Number(value) })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 14 }}>
              <Preference label="Critical alerts" checked={preferences.critical} onChange={() => setPreferences({ ...preferences, critical: !preferences.critical })} />
              <Preference label="Warning alerts" checked={preferences.warning} onChange={() => setPreferences({ ...preferences, warning: !preferences.warning })} />
              <Preference label="Offline alerts" checked={preferences.offline} onChange={() => setPreferences({ ...preferences, offline: !preferences.offline })} />
            </div>
          </Section>

          <Section title="Alert Routing" sub="Escalation behavior for device warnings">
            <div style={{ display: "grid", gap: 9 }}>
              <RouteItem title="Manual Button Alert" text="Show critical banner and keep it visible until dismissed by supervisor." color={C.red} />
              <RouteItem title="No Chest Contact" text="Mark readings as invalid and keep the miner in review state." color={C.amber} />
              <RouteItem title="Offline Device" text="Move device to offline automatically when telemetry becomes stale." color={C.offline} />
              <RouteItem title="Normal Readings" text="Use green indicators when HR and SpO2 are inside the safety range." color={C.green} />
            </div>
          </Section>

          <Section title="Device Defaults" sub="Applied when new miner devices are registered">
            <div style={{ display: "grid", gap: 10 }}>
              <DefaultRow label="Device ID format" value="MCM-###" />
              <DefaultRow label="Default status" value="Offline until fresh telemetry arrives" />
              <DefaultRow label="Required sensors" value="Heart-rate + SpO2" />
              <DefaultRow label="Valid reading rule" value="Chest contact must be detected" />
            </div>
          </Section>

          <Section title="System Summary" sub="Current operational view">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <SummaryBox label="Registered Miners" value={miners.length} color={C.primary} />
              <SummaryBox label="Online" value={miners.filter((miner) => miner.active).length} color={C.green} />
              <SummaryBox label="Manual Alerts" value={miners.filter((miner) => miner.manual_alert).length} color={C.red} />
              <SummaryBox label="Contact Warnings" value={miners.filter((miner) => miner.finger === false).length} color={C.amber} />
            </div>
          </Section>
        </main>

        <footer style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={save} style={{ ...primaryButtonStyle, padding: "11px 24px", fontSize: 13 }}>Save Settings</button>
          <button style={{ ...ghostButtonStyle, padding: "11px 16px", fontSize: 13 }}>Reset Local Edits</button>
          {saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 800 }}>Settings saved successfully</span>}
          {error && <span style={{ fontSize: 12, color: C.red, fontWeight: 800 }}>{error}</span>}
        </footer>
      </div>
    </div>
  );
}

function Section({ title, sub, children }) {
  return (
    <section style={{ ...cardStyle, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={moduleLabel}>CFG-MOD</div>
        <div style={{ fontSize: 15, fontWeight: 950, color: C.text, marginTop: 3 }}>{title}</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</div>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={{ ...controlStyle, width: "100%" }} />
    </label>
  );
}

function ThresholdPreview({ label, text, color }) {
  return (
    <div style={{ marginTop: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        <span>{label}</span>
        <span>{text}</span>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: C.border, marginTop: 7, overflow: "hidden" }}>
        <div style={{ width: "72%", height: "100%", marginLeft: "14%", background: color }} />
      </div>
    </div>
  );
}

function Preference({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 10px", borderRadius: 7, border: `1px solid ${checked ? "rgba(255,106,0,0.36)" : C.border}`, background: checked ? "rgba(255,106,0,0.08)" : "rgba(255,255,255,0.02)" }}>
      <span style={{ color: C.textDim, fontSize: 12, fontWeight: 800 }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}

function RouteItem({ title, text, color }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, padding: "8px 0 8px 11px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
      <div style={{ color: C.text, fontSize: 12, fontWeight: 950 }}>{title}</div>
      <div style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.45, marginTop: 3 }}>{text}</div>
    </div>
  );
}

function DefaultRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={{ color: C.textMuted, fontSize: 12 }}>{label}</span>
      <strong style={{ color: C.text, fontSize: 12, textAlign: "right" }}>{value}</strong>
    </div>
  );
}

function SummaryBox({ label, value, color }) {
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: 11, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color, fontSize: 23, fontWeight: 950, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function StatusPill({ label, color }) {
  return <span style={{ color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900 }}>{label}</span>;
}

const moduleLabel = { color: C.primary, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 };
