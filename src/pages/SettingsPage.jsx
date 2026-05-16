import { useState } from "react";
import { useAuth } from "../context/useAuth";
import { C, cardStyle } from "../theme";

export default function SettingsPage({ miners, thresholds, setThresholds, pollingInterval, setPollingInterval }) {
  const { user, updateUser } = useAuth();
  const [account, setAccount] = useState({ name: user?.name || "Admin", email: user?.email || "admin@smartchestminer.io" });
  const [localThresholds, setLocalThresholds] = useState(thresholds);
  const [localInterval, setLocalInterval] = useState(pollingInterval);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setThresholds(localThresholds);
    setPollingInterval(localInterval);
    updateUser(account);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ padding: "20px 24px", overflow: "auto", height: "100%", maxWidth: 760 }}>
      <Section title="User Account">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          {[
            ["Full Name", "name"],
            ["Email", "email"],
          ].map(([label, key]) => (
            <Field key={key} label={label} value={account[key]} onChange={(value) => setAccount({ ...account, [key]: value })} />
          ))}
        </div>
      </Section>

      <Section title="Alert Thresholds">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
          <Field type="number" label="HR Min (bpm)" value={localThresholds.hrMin} onChange={(value) => setLocalThresholds({ ...localThresholds, hrMin: Number(value) })} />
          <Field type="number" label="HR Max (bpm)" value={localThresholds.hrMax} onChange={(value) => setLocalThresholds({ ...localThresholds, hrMax: Number(value) })} />
          <Field type="number" label="SpO2 Min (%)" value={localThresholds.spo2Min} onChange={(value) => setLocalThresholds({ ...localThresholds, spo2Min: Number(value) })} />
        </div>
      </Section>

      <Section title="System Settings">
        <Field type="number" label="Data Polling Interval (seconds)" value={localInterval} onChange={(value) => setLocalInterval(Number(value))} style={{ width: 140 }} />
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>REGISTERED DEVICES ({miners.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {miners.map((miner) => (
              <span key={miner.id} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5, background: miner.active ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: miner.active ? C.green : C.textMuted, border: `1px solid ${miner.active ? "rgba(34,197,94,0.2)" : C.border}` }}>
                {miner.name} ({miner.id})
              </span>
            ))}
          </div>
        </div>
      </Section>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={save} style={{ padding: "10px 24px", borderRadius: 7, border: "none", background: C.amber, color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
          Save Settings
        </button>
        {saved && <span style={{ fontSize: 12, color: C.green }}>Settings saved successfully</span>}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ ...cardStyle, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.amber, marginBottom: 16, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type = "text", style }) {
  return (
    <label>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5 }}>{label.toUpperCase()}</div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "8px 12px", fontSize: 13, boxSizing: "border-box", ...style }}
      />
    </label>
  );
}
