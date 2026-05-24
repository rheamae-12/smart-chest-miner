import { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { removeWifiConnection, saveWifiConfiguration, subscribeToWifiConfigurations, subscribeToWifiConnectionHistory, writeActivityLog } from "../firebase/database";
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
  const [history, setHistory] = useState({});
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM, deviceId: miners[0]?.id || "" });
  const [confirm, setConfirm] = useState(null);
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deleteRecord, setDeleteRecord] = useState(null);

  useEffect(
    () =>
      subscribeToWifiConfigurations(
        (value) => setConfigs(value || {}),
        (error) => setMessage(error),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeToWifiConnectionHistory(
        (value) => setHistory(value || {}),
        (error) => setMessage(error),
      ),
    [],
  );

  const rows = useMemo(
    () => buildRows(miners, history, configs, search),
    [configs, history, miners, search],
  );
  const sortedMiners = useMemo(() => [...miners].sort((a, b) => lastSeenValue(b) - lastSeenValue(a) || a.id.localeCompare(b.id)), [miners]);

  const selectedDeviceId = miners.some((miner) => miner.id === form.deviceId) ? form.deviceId : miners[0]?.id || "";
  const selectedMiner = miners.find((miner) => miner.id === selectedDeviceId);

  const openModal = () => {
    setMessage("");
    setConfirm(null);
    setEditingRecord(null);
    setForm({ ...EMPTY_FORM, deviceId: sortedMiners[0]?.id || miners[0]?.id || "" });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setConfirm(null);
    setMessage("");
    setEditingRecord(null);
  };

  const openEdit = (row) => {
    if (!row.config) return;
    setMessage("");
    setConfirm(null);
    setEditingRecord(row.config);
    setForm({
      deviceId: row.config.deviceId,
      ssid: row.config.ssid || "",
      password: row.config.password || "",
      security: row.config.security || "WPA2",
      applyOnNextBoot: row.config.applyOnNextBoot ?? true,
    });
    setModalOpen(true);
  };

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
      detail: `${editingRecord ? "Update" : "Send"} ${form.ssid.trim()} configuration to ${selectedMiner?.name || selectedDeviceId}?`,
    });
  };

  const save = async () => {
    const config = {
      ssid: form.ssid.trim(),
      password: form.security === "OPEN" ? "" : form.password,
      security: form.security,
      applyOnNextBoot: form.applyOnNextBoot,
      createdAt: editingRecord?.createdAt,
    };

    try {
      await saveWifiConfiguration(selectedDeviceId, config, editingRecord?.id);
      await writeActivityLog({
        deviceId: selectedDeviceId,
        miner: selectedMiner?.name || selectedDeviceId,
        type: "wifi",
        status: "pending",
        severity: "info",
        title: editingRecord ? "WiFi configuration updated" : "WiFi configuration queued",
        detail: `${selectedMiner?.name || selectedDeviceId} was assigned to SSID ${config.ssid}.`,
      });
      setMessage(editingRecord ? "WiFi configuration updated and queued for the device." : "WiFi configuration saved and queued for the device.");
      setConfirm(null);
      setForm({ ...EMPTY_FORM, deviceId: selectedDeviceId });
      setEditingRecord(null);
      setModalOpen(false);
    } catch (error) {
      setMessage(error.message || "WiFi configuration could not be saved.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteRecord) return;
    const currentConfig = configs[deleteRecord.deviceId];
    const isDeviceQueue = currentConfig?.sourceRecordId === deleteRecord.id || (!currentConfig?.sourceRecordId && deleteRecord.id === `${deleteRecord.deviceId}-current`);

    try {
      await removeWifiConnection(deleteRecord, isDeviceQueue);
      await writeActivityLog({
        deviceId: deleteRecord.deviceId,
        miner: miners.find((miner) => miner.id === deleteRecord.deviceId)?.name || deleteRecord.deviceId,
        type: "wifi",
        status: "removed",
        severity: "warning",
        title: "WiFi configuration deleted",
        detail: `SSID ${deleteRecord.ssid} was removed from WiFi history.`,
      });
      setDeleteRecord(null);
      setMessage("WiFi connection row deleted.");
    } catch (error) {
      setMessage(error.message || "WiFi connection could not be deleted.");
    }
  };

  return (
    <div style={pageStyle}>
      {modalOpen && (
        <Modal
          title={editingRecord ? "Edit Connection" : "Assign Connection"}
          onClose={closeModal}
          actions={
            <>
              <button onClick={closeModal} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Cancel</button>
              <button onClick={confirm ? save : requestSave} style={{ ...primaryButtonStyle, padding: "9px 15px" }}>{confirm ? "Confirm" : "Save"}</button>
            </>
          }
        >
          <div style={moduleLabel}>Device network form</div>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <Field label="Target Device">
              <select value={selectedDeviceId} onChange={(event) => setForm({ ...form, deviceId: event.target.value })} style={{ ...controlStyle, width: "100%" }}>
                {sortedMiners.map((miner) => (
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
          </div>

          {confirm && (
            <div style={{ marginTop: 13, border: `1px solid ${C.amber}55`, background: `${C.amber}12`, borderRadius: 7, padding: 12 }}>
              <div style={{ color: C.amber, fontSize: 12, fontWeight: 900 }}>{confirm.title}</div>
              <div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{confirm.detail}</div>
            </div>
          )}
          {message && <div style={{ color: isSuccessMessage(message) ? C.green : C.amber, fontSize: 12, fontWeight: 800, marginTop: 12 }}>{message}</div>}
        </Modal>
      )}
      {deleteRecord && (
        <Modal
          title="Delete WiFi Connection"
          onClose={() => setDeleteRecord(null)}
          actions={
            <>
              <button onClick={() => setDeleteRecord(null)} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Cancel</button>
              <button onClick={confirmDelete} style={{ ...primaryButtonStyle, padding: "9px 15px" }}>Confirm Delete</button>
            </>
          }
        >
          <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.55 }}>
            Delete SSID <strong style={{ color: C.text }}>{deleteRecord.ssid}</strong> from the WiFi connection table?
          </div>
        </Modal>
      )}
      <div style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <header style={{ ...cardStyle, padding: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "end" }}>
          <div>
            <div style={moduleLabel}>Wireless provisioning</div>
            <div style={{ color: C.text, fontSize: 26, fontWeight: 950, marginTop: 4 }}>WiFi Configuration</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 5 }}>Queue network settings per miner so devices can connect without hardcoded firmware credentials.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <StatusPill label={`${rows.filter((row) => row.config).length} connection rows`} color={C.primary} />
            <StatusPill label={`${miners.filter((miner) => miner.active).length} online`} color={C.green} />
            <button onClick={openModal} style={{ ...primaryButtonStyle, padding: "9px 13px", fontSize: 12 }}>Assign Connection</button>
          </div>
        </header>

        <main style={{ display: "grid", minHeight: 0 }}>
          <section style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
            <div style={{ padding: "13px 15px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
              <div>
                <div style={moduleLabel}>Connection table</div>
                <div style={{ color: C.text, fontSize: 16, fontWeight: 950, marginTop: 4 }}>Device WiFi Queue</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search device, miner, SSID..." style={{ ...controlStyle, width: 260 }} />
                <Indicator label="Pending means queued until the device applies it" color={C.amber} />
              </div>
            </div>
            <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
              <div style={tableHeader}>
                <span>Device</span>
                <span>Status</span>
                <span>SSID</span>
                <span>Security</span>
                <span>Queued At</span>
                <span>Actions</span>
              </div>
              {rows.map(({ miner, config }) => (
                <div key={config?.id || `empty-${miner.id}`} style={tableRow}>
                  <div>
                    <div style={{ color: C.text, fontWeight: 900 }}>{miner.name}</div>
                    <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id} / {miner.location}</div>
                  </div>
                  <StatusBadge active={miner.active} />
                  <span style={{ color: config?.ssid ? C.primary : C.textMuted, fontWeight: 900 }}>{config?.ssid || "Not configured"}</span>
                  <span style={{ color: C.textDim }}>{config?.security || "--"}</span>
                  <span style={{ color: C.textMuted }}>{config?.updatedAt ? formatSystemTimestamp(config.updatedAt) : "NEVER"}</span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <ActionButton disabled={!config} onClick={() => openEdit({ miner, config })}>Edit</ActionButton>
                    <ActionButton danger disabled={!config} onClick={() => setDeleteRecord(config)}>Delete</ActionButton>
                  </span>
                </div>
              ))}
              {rows.length === 0 && <div style={{ padding: 42, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No WiFi connections match your search.</div>}
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

function ActionButton({ children, danger, disabled, onClick }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        ...ghostButtonStyle,
        padding: "6px 8px",
        color: danger ? C.red : C.textDim,
        fontSize: 11,
        fontWeight: 900,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function buildRows(miners, history, configs, search) {
  const minerById = new Map(miners.map((miner) => [miner.id, miner]));
  const historyRows = Object.entries(history || {}).map(([id, config]) => {
    const deviceId = config.deviceId || "";
    return {
      miner: minerById.get(deviceId) || { id: deviceId, name: deviceId || "Unknown device", location: "Unassigned", active: false },
      config: { ...config, id },
    };
  });

  const historyIds = new Set(historyRows.map((row) => row.config.id));
  const legacyRows = Object.entries(configs || {})
    .filter(([, config]) => config?.ssid && !historyIds.has(config.sourceRecordId))
    .map(([deviceId, config]) => ({
      miner: minerById.get(deviceId) || { id: deviceId, name: deviceId, location: "Unassigned", active: false },
      config: { ...config, id: config.sourceRecordId || `${deviceId}-current` },
    }));

  const configuredDeviceIds = new Set([...historyRows, ...legacyRows].map((row) => row.miner.id));
  const emptyRows = miners
    .filter((miner) => !configuredDeviceIds.has(miner.id))
    .map((miner) => ({ miner, config: null }));

  const needle = search.trim().toLowerCase();
  return [...historyRows, ...legacyRows, ...emptyRows]
    .filter((row) => {
      if (!needle) return true;
      const text = `${row.miner.name} ${row.miner.id} ${row.miner.location} ${row.config?.ssid || ""} ${row.config?.security || ""}`.toLowerCase();
      return text.includes(needle);
    })
    .sort((a, b) => wifiRowTime(b) - wifiRowTime(a) || a.miner.id.localeCompare(b.miner.id));
}

function isSuccessMessage(message) {
  return /saved|updated|deleted|queued/i.test(message);
}

function wifiRowTime(row) {
  return Number(row.config?.updatedAt) || Number(row.config?.createdAt) || lastSeenValue(row.miner);
}

function lastSeenValue(miner) {
  return miner.lastSeen?.getTime?.() || Number(miner.lastSeen) || 0;
}

const tableHeader = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.75fr 1fr 0.7fr 1.15fr 110px",
  gap: 12,
  minWidth: 980,
  padding: "10px 14px",
  borderBottom: `1px solid ${C.borderSoft}`,
  color: C.textMuted,
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const tableRow = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.75fr 1fr 0.7fr 1.15fr 110px",
  gap: 12,
  minWidth: 980,
  padding: "13px 14px",
  alignItems: "center",
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 12,
};

const moduleLabel = { color: C.primary, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 };
