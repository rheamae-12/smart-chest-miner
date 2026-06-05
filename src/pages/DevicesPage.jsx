import { useMemo, useState } from "react";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { registerDevice, removeDevice, updateDevice, writeActivityLog } from "../firebase/database";
import { C, cardStyle, controlStyle, ghostButtonStyle, moduleLabel, pageStyle, primaryButtonStyle } from "../theme";
import { formatLastSeen, formatReading, lastSeenValue } from "../utils/formatters";

const EMPTY_FORM = { id: "", name: "", location: "" };

export default function DevicesPage({ miners, setMiners }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [formModal, setFormModal] = useState(null); // "register" | "edit" | null
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [confirmModal, setConfirmModal] = useState(null); // { type, title, detail, payload?, error? }
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  const filtered = useMemo(
    () =>
      miners
        .filter((miner) => {
          const matchText = `${miner.name} ${miner.id} ${miner.location}`.toLowerCase().includes(search.toLowerCase());
          const matchStatus = status === "all" || (status === "online" && miner.active) || (status === "offline" && !miner.active) || (status === "attention" && (miner.stale || miner.manual_alert || miner.finger === false));
          return matchText && matchStatus;
        })
        .sort((a, b) => lastSeenValue(b) - lastSeenValue(a) || a.id.localeCompare(b.id)),
    [miners, search, status],
  );

  const stats = {
    total: miners.length,
    online: miners.filter((miner) => miner.active).length,
    offline: miners.filter((miner) => !miner.active).length,
    attention: miners.filter((miner) => miner.stale || miner.manual_alert || miner.finger === false).length,
  };

  const openRegister = () => {
    setFormError("");
    setForm(EMPTY_FORM);
    setFormModal("register");
  };

  const openEdit = (miner) => {
    setFormError("");
    setForm({ id: miner.id, name: miner.name, location: miner.location });
    setFormModal("edit");
  };

  const requestSave = () => {
    const next = {
      id: form.id.trim().toUpperCase(),
      name: form.name.trim(),
      location: form.location.trim(),
    };
    if (!next.id || !next.name || !next.location) {
      setFormError("Device ID, miner name, and location are required.");
      return;
    }
    if (formModal === "register" && miners.some((m) => m.id.toLowerCase() === next.id.toLowerCase())) {
      setFormError("A device with that ID already exists.");
      return;
    }
    setFormModal(null);
    setFormError("");
    setConfirmModal({
      type: formModal,
      title: formModal === "register" ? "Confirm Registration" : "Confirm Update",
      detail: formModal === "register"
        ? `Register ${next.name} as device ${next.id} at ${next.location}?`
        : `Save changes to ${next.name} (${next.id})?`,
      payload: next,
    });
  };

  const requestRemove = (miner) => {
    setConfirmModal({
      type: "remove",
      title: "Remove Device",
      detail: `Remove ${miner.name} (${miner.id}) from the registry? The device will be archived so it cannot automatically re-register.`,
      payload: { id: miner.id, name: miner.name, location: miner.location },
    });
  };

  const executeConfirmed = async () => {
    setSubmitting(true);
    const { type, payload } = confirmModal;

    try {
      if (type === "register") {
        const newDevice = { ...payload, active: false, status: "offline", lastSeen: null, hr: 0, spo2: 0, finger: false, manual_alert: false };
        await registerDevice(newDevice);
        setMiners((prev) => {
          const existing = prev.some((m) => m.id === newDevice.id);
          return (existing
            ? prev.map((m) => (m.id === newDevice.id ? { ...m, ...newDevice } : m))
            : [...prev, newDevice]
          ).sort((a, b) => a.id.localeCompare(b.id));
        });
        await persist(() => writeActivityLog({ deviceId: newDevice.id, miner: newDevice.name, type: "crud", status: "registered", severity: "info", title: "Device registered", detail: `${newDevice.name} was added to the miner registry.` }), "");
        showNotice(`${payload.name} registered successfully.`);

      } else if (type === "edit") {
        await updateDevice(payload.id, { name: payload.name, location: payload.location });
        setMiners((prev) => prev.map((m) => (m.id === payload.id ? { ...m, name: payload.name, location: payload.location } : m)));
        await persist(() => writeActivityLog({ deviceId: payload.id, miner: payload.name, type: "crud", status: "updated", severity: "info", title: "Device updated", detail: `${payload.name} registry details were updated.` }), "");
        showNotice(`${payload.name} updated successfully.`);

      } else if (type === "remove") {
        await removeDevice(payload.id);
        setMiners((prev) => prev.filter((m) => m.id !== payload.id));
        await persist(() => writeActivityLog({ deviceId: payload.id, miner: payload.name, type: "crud", status: "removed", severity: "warning", title: "Device removed", detail: `${payload.name} was removed from the miner registry.` }), "");
        showNotice(`${payload.name} removed.`);
      }

      setConfirmModal(null);
      setForm(EMPTY_FORM);
    } catch (error) {
      setConfirmModal((prev) => ({ ...prev, error: `Failed: ${error.message || "Check database rules and connection."}` }));
    } finally {
      setSubmitting(false);
    }
  };

  const showNotice = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 3000);
  };

  return (
    <div style={pageStyle}>

      {/* Form modal — register or edit */}
      {formModal && (
        <Modal
          title={formModal === "register" ? "Register New Device" : "Edit Device"}
          onClose={() => setFormModal(null)}
          actions={
            <>
              <Button onClick={() => setFormModal(null)}>Cancel</Button>
              <Button primary onClick={requestSave}>
                {formModal === "register" ? "Register" : "Save Changes"}
              </Button>
            </>
          }
        >
          <DeviceForm form={form} setForm={setForm} lockId={formModal === "edit"} />
          {formError && <div style={{ marginTop: 12, color: C.amber, fontSize: 12 }}>{formError}</div>}
        </Modal>
      )}

      {/* Confirmation modal — separate from form modal */}
      {confirmModal && (
        <Modal
          title={confirmModal.title}
          onClose={() => { if (!submitting) setConfirmModal(null); }}
          actions={
            <>
              <Button onClick={() => setConfirmModal(null)} disabled={submitting}>Cancel</Button>
              <Button
                primary={confirmModal.type !== "remove"}
                danger={confirmModal.type === "remove"}
                onClick={executeConfirmed}
                disabled={submitting}
              >
                {submitting
                  ? "Processing..."
                  : confirmModal.type === "remove"
                  ? "Remove Device"
                  : confirmModal.type === "register"
                  ? "Register"
                  : "Save Changes"}
              </Button>
            </>
          }
        >
          <ConfirmBody modal={confirmModal} />
          {confirmModal.error && (
            <div style={{ marginTop: 12, padding: "9px 12px", background: `${C.red}0D`, border: `1px solid ${C.red}2A`, borderRadius: 8, color: C.red, fontSize: 12 }}>
              {confirmModal.error}
            </div>
          )}
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

        {notice && (
          <div style={{ padding: "9px 14px", background: `${C.green}0F`, border: `1px solid ${C.green}2A`, borderRadius: 8, color: C.green, fontSize: 12, fontWeight: 700 }}>
            {notice}
          </div>
        )}

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
              <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.5, margin: "10px 0 0" }}>Use stable IDs like MCM-001. The device becomes online automatically when new sensor data is received.</p>
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
                <div key={miner.id} className="data-row" style={tableRow}>
                  <div>
                    <div style={{ color: C.primary, fontWeight: 900 }}>{miner.id}</div>
                    <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.location}</div>
                  </div>
                  <div>
                    <div style={{ color: C.text, fontWeight: 900 }}>{miner.name}</div>
                    <StatusBadge active={miner.active} />
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: C.red, fontWeight: 900 }}>HR {miner.active ? formatReading(miner.hr, 0) : "--"} bpm</span>
                    <span style={{ color: C.primary, fontWeight: 900 }}>SpO2 {miner.active ? formatReading(miner.spo2, 0) : "--"}%</span>
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    <StatePill label={miner.finger === false ? "No contact" : miner.active ? "Contact normal" : "No signal"} color={miner.finger === false ? C.amber : miner.active ? C.green : C.offline} />
                    <StatePill label={miner.manual_alert ? "Manual alert" : "Alert clear"} color={miner.manual_alert ? C.red : C.green} />
                  </div>
                  <LastSeenCell miner={miner} />
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button compact onClick={() => openEdit(miner)}>Edit</Button>
                    <Button compact danger onClick={() => requestRemove(miner)}>Delete</Button>
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

async function persist(action) {
  try { await action(); } catch { /* activity log failure is non-fatal */ }
}

function ConfirmBody({ modal }) {
  const isRemove = modal.type === "remove";
  const accentColor = isRemove ? C.red : C.primary;
  const iconLabel = isRemove ? "DEL" : modal.type === "register" ? "NEW" : "UPD";
  return (
    <div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: `${accentColor}18`, border: `1px solid ${accentColor}40`, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <span style={{ color: accentColor, fontSize: 10, fontWeight: 900, letterSpacing: "0.05em" }}>{iconLabel}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>{modal.title}</div>
          <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 6 }}>{modal.detail}</div>
        </div>
      </div>
      {isRemove && (
        <div style={{ marginTop: 14, padding: "10px 12px", background: `${C.red}0D`, border: `1px solid ${C.red}2A`, borderRadius: 8 }}>
          <div style={{ color: C.red, fontSize: 11, fontWeight: 700 }}>This action archives the device in Firebase. It will not automatically re-register.</div>
        </div>
      )}
    </div>
  );
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

function Button({ children, primary, danger, compact, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...(primary ? primaryButtonStyle : ghostButtonStyle),
        padding: compact ? "5px 10px" : "9px 15px",
        color: primary ? C.text : danger ? C.red : C.textDim,
        fontWeight: primary ? 900 : 800,
        fontSize: compact ? 11 : 13,
        whiteSpace: "nowrap",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...(danger && !primary && { borderColor: `${C.red}44`, background: `${C.red}0A` }),
      }}
    >
      {children}
    </button>
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

function LastSeenCell({ miner }) {
  const label = miner.active && !miner.stale ? "Online" : "Offline";
  const color = miner.active && !miner.stale ? C.green : C.offline;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={{ color, fontWeight: 900 }}>{label}</span>
      <span style={{ color: C.textMuted, fontSize: 10 }}>{formatLastSeen(miner.lastSeen)}</span>
    </div>
  );
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
