import { useState } from "react";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";

export default function SettingsPage({ miners, thresholds, setThresholds, pollingInterval, setPollingInterval }) {
  const [localThresholds, setLocalThresholds] = useState(thresholds);
  const [localInterval, setLocalInterval] = useState(pollingInterval);
  const [preferences, setPreferences] = useState({ critical: true, warning: true, offline: true, sound: false, retainDays: 30, staleSeconds: 75 });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);

  const requestSave = () => {
    setConfirmSave(true);
  };

  const save = () => {
    setError("");
    setConfirmSave(false);
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
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  };

  const resetLocalEdits = () => {
    setLocalThresholds(thresholds);
    setLocalInterval(pollingInterval);
    setError("");
    setConfirmSave(false);
  };

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", gap: 12, height: "100%", minHeight: 0, overflow: "hidden" }}>
        <header style={{ ...cardStyle, padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap", minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={moduleLabel}>System controls</div>
            <div style={{ color: C.text, fontSize: 22, fontWeight: 950, marginTop: 4 }}>System Configuration</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 5 }}>Account, safety thresholds, monitoring preferences, alerts, and device defaults.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatusPill label={`${miners.filter((miner) => miner.active).length}/${miners.length} online`} color={C.green} />
            <StatusPill label={`${miners.filter((miner) => !miner.active).length} offline`} color={C.offline} />
          </div>
        </header>

        <main style={settingsGrid}>
          <div style={settingsColumn}>
            <Section title="System Summary" sub="Current operational view" compact>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <SummaryBox label="Registered" value={miners.length} color={C.primary} />
                <SummaryBox label="Online" value={miners.filter((miner) => miner.active).length} color={C.green} />
                <SummaryBox label="Manual Alerts" value={miners.filter((miner) => miner.manual_alert).length} color={C.red} />
                <SummaryBox label="Contact Warn" value={miners.filter((miner) => miner.finger === false).length} color={C.amber} />
              </div>
            </Section>
          </div>

          <div style={settingsColumn}>
            <Section title="Safety Thresholds" sub="Alert limits for miner vitals">
              <div style={compactGrid}>
                <Field type="number" label="HR Min" value={localThresholds.hrMin} onChange={(value) => setLocalThresholds({ ...localThresholds, hrMin: Number(value) })} />
                <Field type="number" label="HR Max" value={localThresholds.hrMax} onChange={(value) => setLocalThresholds({ ...localThresholds, hrMax: Number(value) })} />
                <Field type="number" label="SpO2 Min" value={localThresholds.spo2Min} onChange={(value) => setLocalThresholds({ ...localThresholds, spo2Min: Number(value) })} />
              </div>
              <ThresholdPreview label="Heart Rate Safe Band" text={`${localThresholds.hrMin} to ${localThresholds.hrMax} BPM`} color={C.red} />
              <ThresholdPreview label="Oxygen Minimum" text={`${localThresholds.spo2Min}% and above`} color={C.primary} />
            </Section>

            <Section title="Monitoring Preferences" sub="Telemetry refresh and retention">
              <div style={compactGrid}>
                <Field type="number" label="Polling" value={localInterval} onChange={(value) => setLocalInterval(Number(value))} />
                <Field type="number" label="Offline Window" value={preferences.staleSeconds} onChange={(value) => setPreferences({ ...preferences, staleSeconds: Number(value) })} />
                <Field type="number" label="Retention Days" value={preferences.retainDays} onChange={(value) => setPreferences({ ...preferences, retainDays: Number(value) })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
                <Preference label="Critical" checked={preferences.critical} onChange={() => setPreferences({ ...preferences, critical: !preferences.critical })} />
                <Preference label="Warning" checked={preferences.warning} onChange={() => setPreferences({ ...preferences, warning: !preferences.warning })} />
                <Preference label="Offline" checked={preferences.offline} onChange={() => setPreferences({ ...preferences, offline: !preferences.offline })} />
              </div>
            </Section>
          </div>

          <div style={settingsColumn}>
            <Section title="Alert Routing" sub="Escalation behavior for warnings">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <RouteItem title="Manual Alert" text="Critical banner until reviewed." color={C.red} />
                <RouteItem title="No Chest Contact" text="Readings marked invalid." color={C.amber} />
                <RouteItem title="Offline Device" text="Old telemetry is labeled offline." color={C.offline} />
                <RouteItem title="Normal Readings" text="Green indicators inside range." color={C.green} />
              </div>
            </Section>

            <Section title="Device Defaults" sub="Applied to registered miners">
              <div style={{ display: "grid", gap: 8 }}>
                <DefaultRow label="Device ID format" value="MCM-###" />
                <DefaultRow label="Default status" value="Offline until telemetry arrives" />
                <DefaultRow label="Required sensors" value="Heart-rate + SpO2" />
                <DefaultRow label="Valid reading" value="Chest contact required" />
              </div>
            </Section>
          </div>
        </main>

        <footer style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
          <button onClick={requestSave} style={{ ...primaryButtonStyle, padding: "11px 24px", fontSize: 13 }}>Save Settings</button>
          <button onClick={resetLocalEdits} style={{ ...ghostButtonStyle, padding: "11px 16px", fontSize: 13 }}>Reset Local Edits</button>
          {confirmSave && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${C.amber}55`, background: `${C.amber}12`, color: C.textDim, borderRadius: 7, padding: "8px 10px", fontSize: 12, flexWrap: "wrap" }}>
              Confirm settings update?
              <button onClick={() => setConfirmSave(false)} style={{ ...ghostButtonStyle, padding: "5px 8px", fontSize: 11 }}>Cancel</button>
              <button onClick={save} style={{ ...primaryButtonStyle, padding: "5px 8px", fontSize: 11 }}>Confirm</button>
            </span>
          )}
          {saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 800 }}>Settings saved successfully</span>}
          {error && <span style={{ fontSize: 12, color: C.red, fontWeight: 800 }}>{error}</span>}
        </footer>
      </div>
    </div>
  );
}

function Section({ title, sub, children, compact }) {
  return (
    <section style={{ ...cardStyle, padding: compact ? "12px 14px" : "13px 15px", minWidth: 0, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 12, flexShrink: 0 }}>
        <div style={moduleLabel}>CFG-MOD</div>
        <div style={{ fontSize: 15, fontWeight: 950, color: C.text, marginTop: 3 }}>{title}</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>
      </div>
      <div style={{ minHeight: 0 }}>{children}</div>
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", flexWrap: "wrap" }}>
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
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 9px", borderRadius: 7, border: `1px solid ${checked ? "rgba(255,106,0,0.36)" : C.border}`, background: checked ? "rgba(255,106,0,0.08)" : "rgba(255,255,255,0.02)", minWidth: 0 }}>
      <span style={{ color: C.textDim, fontSize: 12, fontWeight: 800 }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}

function RouteItem({ title, text, color }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, padding: "8px 9px 8px 11px", background: "rgba(255,255,255,0.02)", borderRadius: 6, minWidth: 0 }}>
      <div style={{ color: C.text, fontSize: 12, fontWeight: 950 }}>{title}</div>
      <div style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.45, marginTop: 3 }}>{text}</div>
    </div>
  );
}

function DefaultRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.borderSoft}`, minWidth: 0 }}>
      <span style={{ color: C.textMuted, fontSize: 12, minWidth: 0 }}>{label}</span>
      <strong style={{ color: C.text, fontSize: 12, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{value}</strong>
    </div>
  );
}

function SummaryBox({ label, value, color }) {
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: 10, background: "rgba(255,255,255,0.02)", minWidth: 0 }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 950, marginTop: 5 }}>{value}</div>
    </div>
  );
}

function StatusPill({ label, color }) {
  return <span style={{ color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900 }}>{label}</span>;
}

const settingsGrid = {
  display: "grid",
  gridTemplateColumns: "0.95fr 1.45fr 1.45fr",
  gap: 12,
  minHeight: 0,
  overflow: "hidden",
};

const settingsColumn = {
  display: "grid",
  gridTemplateRows: "auto auto",
  alignContent: "start",
  gap: 12,
  minWidth: 0,
  minHeight: 0,
};

const compactGrid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 };
const moduleLabel = { color: C.primary, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 };
