import { useMemo, useState } from "react";
import FilterToolbar, { FilterField, FilterSearch, FilterTabs } from "../components/FilterToolbar";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/useAuth";
import { registerDevice, removeDevice, updateDevice, writeActivityLog } from "../firebase/database";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";
import { formatLastSeen, formatReading } from "../utils/formatters";
import { matchesSearch } from "../utils/filtering";
import { compareMinersActiveFirst } from "../utils/minerOrdering";

const EMPTY_FORM = { id: "", name: "", location: "" };

const STATUS_FILTERS = [
  { value: "all", label: "All", countKey: "total" },
  { value: "online", label: "Online", countKey: "online" },
  { value: "offline", label: "Offline", countKey: "offline" },
  { value: "attention", label: "Attention", countKey: "attention" },
];

// DevicesPage — device registry: register, edit, and remove miners; shows live vitals per row
export default function DevicesPage({ miners, setMiners }) {
  const { canManage } = useAuth();
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
          const online = miner.active && !miner.stale;
          const matchText = matchesSearch(search, miner.name, miner.id, miner.location);
          const matchStatus = status === "all" || (status === "online" && online) || (status === "offline" && !online) || (status === "attention" && (miner.stale || miner.manual_alert || miner.button_pressed || miner.finger === false));
          return matchText && matchStatus;
        })
        .sort(compareMinersActiveFirst),
    [miners, search, status],
  );

  const stats = {
    total: miners.length,
    online: miners.filter((miner) => miner.active && !miner.stale).length,
    offline: miners.filter((miner) => !miner.active || miner.stale).length,
    attention: miners.filter((miner) => miner.stale || miner.manual_alert || miner.button_pressed || miner.finger === false).length,
  };
  const activeFilterCount = Number(Boolean(search.trim())) + Number(status !== "all");
  const statusLabel = STATUS_FILTERS.find((option) => option.value === status)?.label || "All devices";

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
        const newDevice = { ...payload, active: false, status: "offline", lastSeen: null, hr: 0, spo2: 0, temp: 0, finger: false, manual_alert: false };
        await registerDevice(newDevice);
        setMiners((prev) => {
          const existing = prev.some((m) => m.id === newDevice.id);
          return (existing
            ? prev.map((m) => (m.id === newDevice.id ? { ...m, ...newDevice } : m))
            : [...prev, newDevice]
          ).sort((a, b) => a.id.localeCompare(b.id));
        });
        await persist(() => writeActivityLog({ deviceId: newDevice.id, miner: newDevice.name, type: "crud", status: "registered", severity: "info", title: "Device registered", detail: `${newDevice.name} was added to the miner registry.` }));
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

      <div className="devices-layout page-layout" style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0, overflow: "hidden" }}>
        <PageHeader
          label="Device registry"
          title="Miner Device Management"
          titleSize={26}
          subtitle="Register devices, review latest vitals, and manage miner location assignments."
          right={
            canManage ? <Button primary onClick={openRegister}>Register Device</Button> : null
          }
        />

        <FilterToolbar
          summary={`${statusLabel} · ${filtered.length} of ${miners.length} shown${search.trim() ? ` · “${search.trim()}”` : ""}`}
          activeCount={activeFilterCount}
          onReset={() => { setSearch(""); setStatus("all"); }}
        >
          <FilterField label="Status">
            <FilterTabs
              ariaLabel="Device status"
              value={status}
              onChange={setStatus}
              options={STATUS_FILTERS.map((option) => ({ ...option, count: stats[option.countKey] }))}
            />
          </FilterField>
          <FilterField label="Search" wide>
            <FilterSearch
              value={search}
              onChange={setSearch}
              placeholder="Miner, device ID, or location"
              ariaLabel="Search registered devices"
            />
          </FilterField>
        </FilterToolbar>

        {notice && (
          <div style={{ padding: "9px 14px", background: `${C.green}0F`, border: `1px solid ${C.green}2A`, borderRadius: 8, color: C.green, fontSize: 12, fontWeight: 700 }}>
            {notice}
          </div>
        )}

        <section className="registry-main" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12, alignItems: "stretch", flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr)", gap: 12, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
            <div style={{ ...cardStyle, minWidth: 0, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Registered Miners</div>
              <div style={{ color: C.textMuted, fontSize: 11 }}>{filtered.length} shown</div>
            </div>
              <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
              <div className="table-header-sticky" style={tableHeader}>
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
                    <StatusBadge status={miner.stale ? "stale" : miner.active ? "online" : "offline"} detail={`Last seen ${formatLastSeen(miner.lastSeen)}`} />
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ color: C.red, fontWeight: 900 }}>HR {miner.active ? formatReading(miner.hr, 0) : "--"} bpm</span>
                    <span style={{ color: C.primary, fontWeight: 900 }}>SpO2 {miner.active ? formatReading(miner.spo2, 0) : "--"}%</span>
                    <span style={{ color: C.teal, fontWeight: 900 }}>Temp {miner.active && miner.temp > 0 ? `${formatReading(miner.temp, 1)}°C` : "--"}</span>
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    <StatePill label={miner.finger === false ? "No contact" : miner.active ? "Contact normal" : "No signal"} color={miner.finger === false ? C.amber : miner.active ? C.green : C.offline} />
                    <StatePill label={miner.active ? `Manual SOS ${miner.button_pressed || miner.manual_alert ? "pressed" : "clear"} (${miner.button_press_count || 0})` : "Manual SOS offline"} color={!miner.active ? C.offline : miner.button_pressed || miner.manual_alert ? C.red : C.green} />
                  </div>
                  <LastSeenCell miner={miner} />
                  <span style={{ display: "flex", gap: 6 }}>
                    {canManage ? (
                      <>
                        <IconButton title="Edit device" onClick={() => openEdit(miner)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </IconButton>
                        <IconButton title="Remove device" danger onClick={() => requestRemove(miner)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </IconButton>
                      </>
                    ) : (
                      <span style={{ color: C.textMuted, fontSize: 10, fontStyle: "italic" }}>View only</span>
                    )}
                  </span>
                </div>
              ))}
                {filtered.length === 0 && <div style={{ padding: 42, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No matching device found.</div>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// persist — fire-and-forget activity log write; failure is non-fatal and silently ignored
async function persist(action) {
  try { await action(); } catch { /* activity log failure is non-fatal */ }
}

// ConfirmBody — modal body for register/edit/remove confirmations; shows icon + detail + warning if remove
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

// DeviceForm — register/edit form fields for Device ID, Miner Name, and Location
function DeviceForm({ form, setForm, lockId }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Field label="Device ID" value={form.id} disabled={lockId} placeholder="MCM-001" onChange={(id) => setForm({ ...form, id })} />
      <Field label="Miner Name" value={form.name} placeholder="Miner 1" onChange={(name) => setForm({ ...form, name })} />
      <Field label="Location" value={form.location} placeholder="Shaft A - Level 3" onChange={(location) => setForm({ ...form, location })} />
    </div>
  );
}

// Field — labelled text input used inside DeviceForm
function Field({ label, value, onChange, placeholder, disabled }) {
  return (
    <label>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</div>
      <input disabled={disabled} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} style={{ ...controlStyle, width: "100%", background: disabled ? C.bg2 : C.bg3, color: disabled ? C.textMuted : C.text }} />
    </label>
  );
}

// Button — unified button supporting primary/ghost/danger variants with disabled state
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

// IconButton — 30×30 square icon button used for Edit (pencil) and Remove (trash) actions
function IconButton({ children, danger, title, onClick }) {
  const color = danger ? C.red : C.textDim;
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        border: `1px solid ${danger ? `${C.red}44` : C.border}`,
        background: danger ? `${C.red}0A` : "rgba(255,255,255,0.04)",
        color,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// StatePill — small colored pill for chest contact and manual alert states in the table
function StatePill({ label, color }) {
  return <span style={{ color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "3px 7px", fontSize: 10, fontWeight: 900, width: "fit-content" }}>{label}</span>;
}

// LastSeenCell — "Online/Offline + time ago" column cell derived from miner.lastSeen and stale flag
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
  gridTemplateColumns: "1.1fr 1fr 1fr 1.15fr 1fr 72px",
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
  gridTemplateColumns: "1.1fr 1fr 1fr 1.15fr 1fr 72px",
  gap: 12,
  minWidth: 900,
  padding: "12px 14px",
  borderBottom: `1px solid ${C.borderSoft}`,
  alignItems: "center",
  fontSize: 12,
};
