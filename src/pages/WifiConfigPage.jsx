import { useEffect, useMemo, useState } from "react";
import FilterToolbar, { FilterField, FilterSearch, FilterTabs } from "../components/FilterToolbar";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/useAuth";
import { removeWifiConnection, saveWifiConfiguration, subscribeToWifiConfigurations, subscribeToWifiConnectionHistory, writeActivityLog } from "../firebase/database";
import { C, cardStyle, controlStyle, ghostButtonStyle, moduleLabel, pageStyle, primaryButtonStyle } from "../theme";
import { formatSystemTimestamp, lastSeenValue } from "../utils/formatters";
import { compareMinersActiveFirst } from "../utils/minerOrdering";

const EMPTY_FORM = {
  deviceId: "",
  ssid: "",
  password: "",
  security: "WPA2",
  applyOnNextBoot: true,
};

// WifiConfigPage — WiFi provisioning table: assign, edit, and delete per-device network configurations
export default function WifiConfigPage({ miners }) {
  const { canManage } = useAuth();
  const [configs, setConfigs] = useState({});
  const [history, setHistory] = useState({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ ...EMPTY_FORM, deviceId: miners[0]?.id || "" });
  const [confirm, setConfirm] = useState(null);
  const [message, setMessage] = useState("");
  const [pageAlert, setPageAlert] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deleteRecord, setDeleteRecord] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

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

  const allRows = useMemo(
    () => buildRows(miners, history, configs, "", "all"),
    [configs, history, miners],
  );
  const rows = useMemo(
    () => buildRows(miners, history, configs, search, statusFilter),
    [configs, history, miners, search, statusFilter],
  );
  const sortedMiners = useMemo(() => [...miners].sort(compareMinersActiveFirst), [miners]);
  const latestMinerId = useMemo(
    () => sortedMiners.reduce(
      (latest, miner) => {
        const timestamp = lastSeenValue(miner);
        return !latest || timestamp > latest.timestamp ? { id: miner.id, timestamp } : latest;
      },
      null,
    )?.id || "",
    [sortedMiners],
  );

  // Fix: preserve orphaned device ID when editing a record whose device was removed
  const selectedDeviceId = resolveSelectedDeviceId(miners, form.deviceId, editingRecord, latestMinerId);

  const selectedMiner = miners.find((miner) => miner.id === selectedDeviceId);

  const openModal = () => {
    setMessage("");
    setConfirm(null);
    setEditingRecord(null);
    setShowPassword(false);
    setForm({ ...EMPTY_FORM, deviceId: latestMinerId });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setConfirm(null);
    setMessage("");
    setEditingRecord(null);
    setShowPassword(false);
  };

  const openEdit = (row) => {
    if (!row.config) return;
    setMessage("");
    setConfirm(null);
    setEditingRecord(row.config);
    setShowPassword(false);
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
      // Show success at page level so it's visible after the modal closes
      setPageAlert(editingRecord ? "WiFi configuration updated and queued for the device." : "WiFi configuration saved and queued for the device.");
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
      // Show success at page level so it's visible after the modal closes
      setPageAlert("WiFi connection row deleted.");
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
              <button type="button" onClick={closeModal} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Cancel</button>
              <button type="button" onClick={confirm ? save : requestSave} style={{ ...primaryButtonStyle, padding: "9px 15px" }}>{confirm ? "Confirm" : "Save"}</button>
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
                {/* Show orphaned device option when editing a config whose device no longer exists */}
                {editingRecord && !miners.some((m) => m.id === form.deviceId) && form.deviceId && (
                  <option value={form.deviceId}>{form.deviceId} (unregistered)</option>
                )}
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
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  disabled={form.security === "OPEN"}
                  placeholder={form.security === "OPEN" ? "Not required" : "Network password"}
                  style={{ ...controlStyle, width: "100%", paddingRight: 38, boxSizing: "border-box" }}
                />
                {form.security !== "OPEN" && (
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: 0, display: "flex", alignItems: "center" }}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                )}
              </div>
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
              <button type="button" onClick={() => setDeleteRecord(null)} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Cancel</button>
              <button type="button" onClick={confirmDelete} style={{ ...primaryButtonStyle, padding: "9px 15px" }}>Confirm Delete</button>
            </>
          }
        >
          <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.55 }}>
            Delete SSID <strong style={{ color: C.text }}>{deleteRecord.ssid}</strong> from the WiFi connection table?
          </div>
        </Modal>
      )}
      <div
        className="wifi-layout page-layout"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {pageAlert && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", background: `${C.green}14`, border: `1px solid ${C.green}44`, borderRadius: 10, color: C.green, fontSize: 13, fontWeight: 800 }}>
            <span>{pageAlert}</span>
            <button type="button" onClick={() => setPageAlert("")} style={{ background: "none", border: "none", cursor: "pointer", color: C.green, fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        )}
        <PageHeader
          label="Wireless provisioning"
          title="WiFi Configuration"
          titleSize={26}
          subtitle="Queue network settings per miner so devices can connect without hardcoded firmware credentials."
          right={
            <>
              <StatusPill label={`${allRows.filter((row) => row.config).length} connection rows`} color={C.primary} />
              <StatusPill label={`${miners.filter((miner) => miner.active && !miner.stale).length} online`} color={C.green} />
              {canManage && <button type="button" onClick={openModal} style={{ ...primaryButtonStyle, padding: "9px 13px", fontSize: 12 }}>Assign Connection</button>}
            </>
          }
        />

        <FilterToolbar
          summary={`WiFi queue · ${rows.length} of ${allRows.length} devices shown`}
          activeCount={Number(statusFilter !== "all") + Number(Boolean(search.trim()))}
          onReset={() => { setStatusFilter("all"); setSearch(""); }}
        >
          <FilterField label="Status">
            <FilterTabs
              ariaLabel="WiFi queue status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All", count: allRows.length },
                { value: "configured", label: "Configured", count: allRows.filter((row) => row.config).length },
                { value: "unconfigured", label: "Not configured", count: allRows.filter((row) => !row.config).length },
              ]}
            />
          </FilterField>
          <FilterField label="Search" wide>
            <FilterSearch value={search} onChange={setSearch} placeholder="Device, miner, or SSID" ariaLabel="Search WiFi queue" />
          </FilterField>
        </FilterToolbar>

        <main className="wifi-main" style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr)", gap: 12, flex: 1, minHeight: 0, overflow: "hidden" }}>
          <section style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
            <div style={{ padding: "13px 15px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>Device WiFi Queue</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Indicator label="Pending = queued until the device applies it" color={C.amber} />
              </div>
            </div>
            <div className="hide-scrollbar table-scroll-x" style={{ overflow: "auto", minHeight: 0 }}>
              <div className="table-header-sticky" style={tableHeader}>
                <span>Device</span>
                <span>Status</span>
                <span>SSID</span>
                <span>Security</span>
                <span>Queued At</span>
                <span>Actions</span>
              </div>
              {rows.map(({ miner, config }) => (
                <div key={config?.id || `empty-${miner.id}`} className="data-row" style={tableRow}>
                  <div>
                    <div style={{ color: C.text, fontWeight: 900 }}>{miner.name}</div>
                    <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id} / {miner.location}</div>
                  </div>
                  <StatusBadge status={miner.active && !miner.stale ? "online" : "offline"} label={miner.active && !miner.stale ? "ONLINE" : "OFFLINE"} detail={miner.stale ? "No recent device signal" : `Last seen ${formatSystemTimestamp(lastSeenValue(miner))}`} />
                  <span style={{ color: config?.ssid ? C.primary : C.textMuted, fontWeight: 900 }}>{config?.ssid || "Not configured"}</span>
                  <span style={{ color: C.textDim }}>{config?.security || "--"}</span>
                  <span style={{ color: C.textMuted }}>{config?.updatedAt ? formatSystemTimestamp(config.updatedAt) : "NEVER"}</span>
                  <span style={{ display: "flex", gap: 6 }}>
                    {!canManage && <span style={{ color: C.textMuted, fontSize: 11 }}>View only</span>}
                    {canManage && (
                      <>
                        <IconButton title="Edit connection" disabled={!config} onClick={() => openEdit({ miner, config })}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </IconButton>
                        <IconButton title="Delete connection" danger disabled={!config} onClick={() => setDeleteRecord(config)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </IconButton>
                      </>
                    )}
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

// Field — labelled form field wrapper used inside the assign/edit modal
function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ color: C.textMuted, fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

// StatusPill — outlined count pill shown in the page header (e.g. "3 connection rows")
function StatusPill({ label, color }) {
  return <span style={{ color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900 }}>{label}</span>;
}

// Indicator — glowing dot + label used to explain the "Pending" queue status
function Indicator({ label, color }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.textMuted, fontSize: 11 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} />
      {label}
    </div>
  );
}

// IconButton — 30×30 square icon button for Edit (pencil) and Delete (trash) WiFi rows
function IconButton({ children, danger, disabled, onClick, title }) {
  const borderColor = danger ? `${C.red}44` : C.borderSoft;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{
        width: 30,
        height: 30,
        border: `1px solid ${borderColor}`,
        borderRadius: 7,
        background: danger ? `${C.red}0A` : "transparent",
        color: danger ? C.red : C.textDim,
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// EyeIcon / EyeOffIcon — show/hide password toggle icons
function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// buildRows — merges history records + legacy device configs + unconfigured miners into a sortable table list
function resolveSelectedDeviceId(miners, formDeviceId, editingRecord, latestMinerId) {
  if (miners.some((miner) => miner.id === formDeviceId)) return formDeviceId;
  if (editingRecord && formDeviceId) return formDeviceId;
  return latestMinerId;
}

function buildRows(miners, history, configs, search, statusFilter = "all") {
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
      if (statusFilter === "configured" && !row.config) return false;
      if (statusFilter === "unconfigured" && row.config) return false;
      if (!needle) return true;
      const text = `${row.miner.name} ${row.miner.id} ${row.miner.location} ${row.config?.ssid || ""} ${row.config?.security || ""}`.toLowerCase();
      return text.includes(needle);
    })
    .sort((a, b) => compareMinersActiveFirst(a.miner, b.miner) || wifiRowTime(b) - wifiRowTime(a));
}

// isSuccessMessage — returns true when the status message indicates a completed operation (green text)
function isSuccessMessage(message) {
  return /saved|updated|deleted|queued/i.test(message);
}

// wifiRowTime — extracts the best available timestamp for sorting a WiFi table row
function wifiRowTime(row) {
  return Number(row.config?.updatedAt) || Number(row.config?.createdAt) || lastSeenValue(row.miner);
}

const tableHeader = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.75fr 1fr 0.7fr 1.15fr 72px",
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
  gridTemplateColumns: "1.2fr 0.75fr 1fr 0.7fr 1.15fr 72px",
  gap: 12,
  minWidth: 980,
  padding: "13px 14px",
  alignItems: "center",
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 12,
};
