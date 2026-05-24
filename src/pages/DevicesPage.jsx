import { useMemo, useState } from "react";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { registerDevice, removeDevice, updateDevice, writeActivityLog } from "../firebase/database";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";
import { formatLastSeen, formatReading } from "../utils/formatters";

const EMPTY_FORM = { id: "", name: "", location: "" };

export default function DevicesPage({ miners, setMiners }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(null);

  const filtered = useMemo(
    () =>
      miners.filter((miner) => {
        const matchText = `${miner.name} ${miner.id} ${miner.location}`.toLowerCase().includes(search.toLowerCase());
        const matchStatus = status === "all" || (status === "online" && miner.active) || (status === "offline" && !miner.active) || (status === "attention" && (miner.stale || miner.manual_alert || miner.finger === false));
        return matchText && matchStatus;
      }),
    [miners, search, status],
  );

  const stats = {
    total: miners.length,
    online: miners.filter((miner) => miner.active).length,
    offline: miners.filter((miner) => !miner.active).length,
    attention: miners.filter((miner) => miner.stale || miner.manual_alert || miner.finger === false).length,
  };

  const openRegister = () => {
    setMessage("");
    setConfirm(null);
    setForm(EMPTY_FORM);
    setModal("register");
  };

  const openEdit = (miner) => {
    setMessage("");
    setConfirm(null);
    setForm({ id: miner.id, name: miner.name, location: miner.location });
    setModal("edit");
  };

  const requestSaveDevice = () => {
    const next = {
      id: form.id.trim().toUpperCase(),
      name: form.name.trim(),
      location: form.location.trim(),
    };

    if (!next.id || !next.name || !next.location) {
      setMessage("Device ID, miner name, and location are required.");
      return;
    }
    if (modal === "register" && miners.some((miner) => miner.id.toLowerCase() === next.id.toLowerCase())) {
      setMessage("A device with that ID already exists.");
      return;
    }

    setConfirm({
      action: "save",
      title: modal === "register" ? "Confirm device registration" : "Confirm device update",
      detail: modal === "register" ? `Register ${next.name} as ${next.id}?` : `Save changes for ${next.name}?`,
      payload: next,
    });
  };

  const saveDevice = async (next) => {
    if (modal === "register") {
      const newDevice = {
        ...next,
        active: false,
        status: "offline",
        lastSeen: null,
        hr: 0,
        spo2: 0,
        finger: false,
        manual_alert: false,
      };
      setMiners((prev) => [...prev, newDevice].sort((a, b) => a.id.localeCompare(b.id)));
      setNotice(await persist(() => registerDevice(newDevice), "Device registered locally. Firebase write was not available."));
      await persist(
        () =>
          writeActivityLog({
            deviceId: newDevice.id,
            miner: newDevice.name,
            type: "crud",
            status: "registered",
            severity: "info",
            title: "Device registered",
            detail: `${newDevice.name} was added to the miner registry.`,
          }),
        "",
      );
    } else {
      setMiners((prev) => prev.map((miner) => (miner.id === form.id ? { ...miner, name: next.name, location: next.location } : miner)));
      setNotice(await persist(() => updateDevice(form.id, { name: next.name, location: next.location }), "Device updated locally. Firebase write was not available."));
      await persist(
        () =>
          writeActivityLog({
            deviceId: form.id,
            miner: next.name,
            type: "crud",
            status: "updated",
            severity: "info",
            title: "Device updated",
            detail: `${next.name} registry details were updated.`,
          }),
        "",
      );
    }

    setConfirm(null);
    setModal(null);
    setForm(EMPTY_FORM);
  };

  const confirmRemove = (miner) => {
    setMessage("");
    setConfirm(null);
    setForm({ id: miner.id, name: miner.name, location: miner.location });
    setModal("remove");
  };

  const requestDeleteDevice = () => {
    setConfirm({
      action: "remove",
      title: "Confirm device removal",
      detail: `Remove ${form.name} (${form.id}) from the registry and Firebase when available?`,
    });
  };

  const deleteDevice = async () => {
    setMiners((prev) => prev.filter((miner) => miner.id !== form.id));
    setNotice(await persist(() => removeDevice(form.id), "Device removed locally. Firebase write was not available."));
    await persist(
      () =>
        writeActivityLog({
          deviceId: form.id,
          miner: form.name,
          type: "crud",
          status: "removed",
          severity: "warning",
          title: "Device removed",
          detail: `${form.name} was removed from the miner registry.`,
        }),
      "",
    );
    setConfirm(null);
    setModal(null);
    setForm(EMPTY_FORM);
  };

  const title = modal === "register" ? "Register Device" : modal === "edit" ? "Edit Device" : "Remove Device";

  return (
    <div style={pageStyle}>
      {modal && (
        <Modal
          title={title}
          onClose={() => setModal(null)}
          actions={
            <>
              <Button onClick={() => setModal(null)}>Cancel</Button>
              {modal === "remove" ? <Button danger onClick={requestDeleteDevice}>Remove</Button> : <Button primary onClick={requestSaveDevice}>Save</Button>}
            </>
          }
        >
          {modal === "remove" ? (
            <div style={{ color: C.textDim, fontSize: 13, lineHeight: 1.6 }}>
              Remove <strong style={{ color: C.text }}>{form.name}</strong> from the registry? The device will be archived in Firebase so active hardware cannot automatically add it back.
            </div>
          ) : (
            <DeviceForm form={form} setForm={setForm} lockId={modal === "edit"} />
          )}
          {confirm && (
            <ConfirmationStrip
              confirm={confirm}
              onCancel={() => setConfirm(null)}
              onConfirm={() => (confirm.action === "remove" ? deleteDevice() : saveDevice(confirm.payload))}
            />
          )}
          {message && <div style={{ marginTop: 12, color: C.amber, fontSize: 12 }}>{message}</div>}
        </Modal>
      )}

      <div style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <section style={{ ...cardStyle, padding: 16, display: "flex", gap: 12, alignItems: "end", justifyContent: "space-between" }}>
          <div>
            <div style={moduleLabel}>Device registry</div>
            <div style={{ color: C.text, fontSize: 24, fontWeight: 950, marginTop: 4 }}>Miner Device Management</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>Register devices, review latest vitals, and manage miner location assignments.</div>
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "end", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <input placeholder="Search miner, device ID, or location..." value={search} onChange={(event) => setSearch(event.target.value)} style={{ ...controlStyle, width: 280 }} />
            <select value={status} onChange={(event) => setStatus(event.target.value)} style={{ ...controlStyle, width: 138 }}>
              <option value="all">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="attention">Needs Attention</option>
            </select>
            <Button primary onClick={openRegister}>Register Device</Button>
          </div>
        </section>

        {notice && <div style={{ color: C.amber, fontSize: 12 }}>{notice}</div>}

        <section style={{ display: "grid", gridTemplateColumns: "210px minmax(0, 1fr)", gap: 12, minHeight: 0 }}>
          <aside style={{ display: "grid", gridTemplateRows: "auto auto 1fr", gap: 12, minHeight: 0 }}>
            <div style={{ ...cardStyle, padding: 14 }}>
              <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Fleet Health</div>
              <RegistryMetric label="Total devices" value={stats.total} color={C.primary} />
              <RegistryMetric label="Online" value={stats.online} color={C.green} />
              <RegistryMetric label="Offline" value={stats.offline} color={C.offline} />
              <RegistryMetric label="Needs attention" value={stats.attention} color={stats.attention ? C.amber : C.green} />
            </div>
            <div style={{ ...cardStyle, padding: 14 }}>
              <div style={moduleLabel}>Registration guide</div>
              <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.5, margin: "10px 0 0" }}>Use stable IDs like MCM-001. The device becomes online automatically when fresh telemetry is received.</p>
            </div>
          </aside>

          <div style={{ ...cardStyle, minWidth: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Registered Miners</div>
              <div style={{ color: C.textMuted, fontSize: 11 }}>{filtered.length} shown</div>
            </div>
            <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
              <div style={tableHeader}>
                <span>Device</span>
                <span>Miner</span>
                <span>Vitals</span>
                <span>Sensor State</span>
                <span>Last Seen</span>
                <span>Actions</span>
              </div>
              {filtered.map((miner) => (
                <div key={miner.id} style={tableRow}>
                  <div>
                    <div style={{ color: C.primary, fontWeight: 900 }}>{miner.id}</div>
                    <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.location}</div>
                  </div>
                  <div>
                    <div style={{ color: C.text, fontWeight: 900 }}>{miner.name}</div>
                    <StatusBadge active={miner.active} />
                    <div style={{ color: miner.active ? C.green : C.offline, fontSize: 10, fontWeight: 900, marginTop: 4 }}>{miner.active ? "ONLINE IN FIREBASE" : "OFFLINE IN FIREBASE"}</div>
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: C.red, fontWeight: 900 }}>HR {miner.active ? formatReading(miner.hr, 0) : "--"} bpm</span>
                    <span style={{ color: C.primary, fontWeight: 900 }}>SpO2 {miner.active ? formatReading(miner.spo2, 0) : "--"}%</span>
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    <StatePill label={miner.finger === false ? "No contact" : miner.active ? "Contact normal" : "No signal"} color={miner.finger === false ? C.amber : miner.active ? C.green : C.offline} />
                    <StatePill label={miner.manual_alert ? "Manual alert" : "Alert clear"} color={miner.manual_alert ? C.red : C.green} />
                  </div>
                  <span style={{ color: miner.stale ? C.amber : C.textMuted }}>{miner.stale ? "Stale signal" : formatLastSeen(miner.lastSeen)}</span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button compact onClick={() => openEdit(miner)}>Edit</Button>
                    <Button compact danger onClick={() => confirmRemove(miner)}>Delete</Button>
                  </span>
                </div>
              ))}
              {filtered.length === 0 && <div style={{ padding: 42, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No matching device found.</div>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

async function persist(action, fallbackMessage) {
  try {
    const saved = await action();
    if (saved === false) return fallbackMessage;
  } catch {
    return fallbackMessage;
  }
  return "";
}

function DeviceForm({ form, setForm, lockId }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Field label="Device ID" value={form.id} disabled={lockId} placeholder="MCM-001" onChange={(id) => setForm({ ...form, id })} />
      <Field label="Miner Name" value={form.name} placeholder="Miner 1" onChange={(name) => setForm({ ...form, name })} />
      <Field label="Location" value={form.location} placeholder="Shaft A - Level 3" onChange={(location) => setForm({ ...form, location })} />
    </div>
  );
}

function Field({ label, value, onChange, placeholder, disabled }) {
  return (
    <label>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</div>
      <input disabled={disabled} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} style={{ ...controlStyle, width: "100%", background: disabled ? C.bg2 : C.bg3, color: disabled ? C.textMuted : C.text }} />
    </label>
  );
}

function Button({ children, primary, danger, compact, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...(primary ? primaryButtonStyle : ghostButtonStyle),
        padding: compact ? "6px 8px" : "9px 15px",
        color: primary ? C.text : danger ? C.red : C.textDim,
        fontWeight: primary ? 900 : 800,
        fontSize: compact ? 11 : 13,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function ConfirmationStrip({ confirm, onCancel, onConfirm }) {
  return (
    <div style={{ marginTop: 13, border: `1px solid ${C.amber}55`, background: `${C.amber}12`, borderRadius: 7, padding: 12 }}>
      <div style={{ color: C.amber, fontSize: 12, fontWeight: 900 }}>{confirm.title}</div>
      <div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{confirm.detail}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
        <Button compact onClick={onCancel}>Cancel</Button>
        <Button compact primary onClick={onConfirm}>Confirm</Button>
      </div>
    </div>
  );
}

function RegistryMetric({ label, value, color }) {
  return (
    <div style={{ padding: "9px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontSize: 21, fontWeight: 950, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function StatePill({ label, color }) {
  return <span style={{ color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "3px 7px", fontSize: 10, fontWeight: 900, width: "fit-content" }}>{label}</span>;
}

const tableHeader = {
  display: "grid",
  gridTemplateColumns: "1.1fr 1fr 1fr 1.15fr 1fr 110px",
  gap: 12,
  minWidth: 900,
  padding: "10px 14px",
  borderBottom: `1px solid ${C.borderSoft}`,
  color: C.textMuted,
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const tableRow = {
  display: "grid",
  gridTemplateColumns: "1.1fr 1fr 1fr 1.15fr 1fr 110px",
  gap: 12,
  minWidth: 900,
  padding: "13px 14px",
  borderBottom: `1px solid ${C.borderSoft}`,
  alignItems: "center",
  fontSize: 12,
};

const moduleLabel = { color: C.primary, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 };
