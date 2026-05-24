import { useEffect, useMemo, useState } from "react";
import StatusBadge from "../components/StatusBadge";
import { saveWifiConfiguration, subscribeToWifiConfigurations, writeActivityLog } from "../firebase/database";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";
import { formatSystemTimestamp } from "../utils/formatters";

const EMPTY_FORM = {
  deviceId: "",
  ssid: "",
  password: "",
  security: "WPA2",
  applyOnNextBoot: true,
};

export default function WifiConfigPage({ miners }) {
  const [configs, setConfigs] = useState({});
  const [form, setForm] = useState({ ...EMPTY_FORM, deviceId: miners[0]?.id || "" });
  const [confirm, setConfirm] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(
    () =>
      subscribeToWifiConfigurations(
        (value) => setConfigs(value || {}),
        (error) => setMessage(error),
      ),
    [],
  );

  const rows = useMemo(
    () =>
      miners.map((miner) => ({
        miner,
        config: configs[miner.id],
      })),
    [configs, miners],
  );

  const selectedDeviceId = miners.some((miner) => miner.id === form.deviceId) ? form.deviceId : miners[0]?.id || "";
  const selectedMiner = miners.find((miner) => miner.id === selectedDeviceId);

  const requestSave = () => {
    setMessage("");
    if (!selectedDeviceId || !form.ssid.trim()) {
      setMessage("Device and WiFi SSID are required.");
      return;
    }
    if (form.security !== "OPEN" && !form.password.trim()) {
      setMessage("Password is required for secured WiFi networks.");
      return;
    }
    setConfirm({
      title: "Confirm WiFi configuration",
      detail: `Send ${form.ssid.trim()} configuration to ${selectedMiner?.name || selectedDeviceId}?`,
    });
  };

  const save = async () => {
    const config = {
      ssid: form.ssid.trim(),
      password: form.security === "OPEN" ? "" : form.password,
      security: form.security,
      applyOnNextBoot: form.applyOnNextBoot,
    };

    try {
      await saveWifiConfiguration(selectedDeviceId, config);
      await writeActivityLog({
        deviceId: selectedDeviceId,
        miner: selectedMiner?.name || selectedDeviceId,
        type: "wifi",
        status: "pending",
        severity: "info",
        title: "WiFi configuration queued",
        detail: `${selectedMiner?.name || selectedDeviceId} was assigned to SSID ${config.ssid}.`,
      });
      setMessage("WiFi configuration saved and queued for the device.");
      setConfirm(null);
      setForm({ ...EMPTY_FORM, deviceId: selectedDeviceId });
    } catch (error) {
      setMessage(error.message || "WiFi configuration could not be saved.");
    }
  };

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <header style={{ ...cardStyle, padding: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "end" }}>
          <div>
            <div style={moduleLabel}>Wireless provisioning</div>
            <div style={{ color: C.text, fontSize: 26, fontWeight: 950, marginTop: 4 }}>WiFi Configuration</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 5 }}>Queue network settings per miner so devices can connect without hardcoded firmware credentials.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <StatusPill label={`${rows.filter((row) => row.config).length}/${miners.length} configured`} color={C.primary} />
            <StatusPill label={`${miners.filter((miner) => miner.active).length} online`} color={C.green} />
          </div>
        </header>

        <main style={{ display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: 12, minHeight: 0 }}>
          <section style={{ ...cardStyle, padding: 16, minHeight: 0 }}>
            <div style={moduleLabel}>Device network form</div>
            <div style={{ color: C.text, fontSize: 17, fontWeight: 950, marginTop: 5 }}>Assign Connection</div>
            <div style={{ display: "grid", gap: 12, marginTop: 15 }}>
              <Field label="Target Device">
                <select value={selectedDeviceId} onChange={(event) => setForm({ ...form, deviceId: event.target.value })} style={{ ...controlStyle, width: "100%" }}>
                  {miners.map((miner) => (
                    <option key={miner.id} value={miner.id}>{miner.name} ({miner.id})</option>
                  ))}
                </select>
              </Field>
              <Field label="WiFi SSID">
                <input value={form.ssid} onChange={(event) => setForm({ ...form, ssid: event.target.value })} placeholder="Network name" style={{ ...controlStyle, width: "100%" }} />
              </Field>
              <Field label="Security">
                <select value={form.security} onChange={(event) => setForm({ ...form, security: event.target.value })} style={{ ...controlStyle, width: "100%" }}>
                  <option value="WPA2">WPA2 / WPA3</option>
                  <option value="WPA">WPA</option>
                  <option value="OPEN">Open Network</option>
                </select>
              </Field>
              <Field label="Password">
                <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} disabled={form.security === "OPEN"} placeholder={form.security === "OPEN" ? "Not required" : "Network password"} style={{ ...controlStyle, width: "100%" }} />
              </Field>
              <label style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: "10px 11px" }}>
                <span style={{ color: C.textDim, fontSize: 12, fontWeight: 800 }}>Apply on next device boot</span>
                <input type="checkbox" checked={form.applyOnNextBoot} onChange={() => setForm({ ...form, applyOnNextBoot: !form.applyOnNextBoot })} />
              </label>
              <button onClick={requestSave} style={{ ...primaryButtonStyle, padding: "11px 16px", fontSize: 13 }}>Save WiFi Config</button>
            </div>

            {confirm && (
              <div style={{ marginTop: 13, border: `1px solid ${C.amber}55`, background: `${C.amber}12`, borderRadius: 7, padding: 12 }}>
                <div style={{ color: C.amber, fontSize: 12, fontWeight: 900 }}>{confirm.title}</div>
                <div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{confirm.detail}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                  <button onClick={() => setConfirm(null)} style={{ ...ghostButtonStyle, padding: "7px 10px", fontSize: 11 }}>Cancel</button>
                  <button onClick={save} style={{ ...primaryButtonStyle, padding: "7px 10px", fontSize: 11 }}>Confirm</button>
                </div>
              </div>
            )}
            {message && <div style={{ color: message.includes("saved") ? C.green : C.amber, fontSize: 12, fontWeight: 800, marginTop: 12 }}>{message}</div>}
          </section>

          <section style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
            <div style={{ padding: "13px 15px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={moduleLabel}>Connection table</div>
                <div style={{ color: C.text, fontSize: 16, fontWeight: 950, marginTop: 4 }}>Device WiFi Queue</div>
              </div>
              <Indicator label="Pending configs wait for firmware pickup" color={C.amber} />
            </div>
            <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
              <div style={tableHeader}>
                <span>Device</span>
                <span>Status</span>
                <span>SSID</span>
                <span>Security</span>
                <span>Queued At</span>
              </div>
              {rows.map(({ miner, config }) => (
                <div key={miner.id} style={tableRow}>
                  <div>
                    <div style={{ color: C.text, fontWeight: 900 }}>{miner.name}</div>
                    <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id} / {miner.location}</div>
                  </div>
                  <StatusBadge active={miner.active} />
                  <span style={{ color: config?.ssid ? C.primary : C.textMuted, fontWeight: 900 }}>{config?.ssid || "Not configured"}</span>
                  <span style={{ color: C.textDim }}>{config?.security || "--"}</span>
                  <span style={{ color: C.textMuted }}>{config?.updatedAt ? formatSystemTimestamp(config.updatedAt) : "NEVER"}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ color: C.textMuted, fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ label, color }) {
  return <span style={{ color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900 }}>{label}</span>;
}

function Indicator({ label, color }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.textMuted, fontSize: 11 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} />
      {label}
    </div>
  );
}

const tableHeader = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr 1.1fr 0.8fr 1.35fr",
  gap: 12,
  minWidth: 820,
  padding: "10px 14px",
  borderBottom: `1px solid ${C.borderSoft}`,
  color: C.textMuted,
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const tableRow = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr 1.1fr 0.8fr 1.35fr",
  gap: 12,
  minWidth: 820,
  padding: "13px 14px",
  alignItems: "center",
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 12,
};

const moduleLabel = { color: C.primary, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 };
