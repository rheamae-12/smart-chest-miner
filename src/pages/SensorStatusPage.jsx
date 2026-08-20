import { useEffect, useMemo, useState } from "react";
import { C, cardStyle, pageStyle } from "../theme";
import { formatLastSeen, formatReading, lastSeenValue } from "../utils/formatters";
import { readStoredValue, writeStoredValue } from "../utils/safeStorage";

const MANUAL_HEALTH_STORAGE_KEY = "smart-chest-miner:manual-sensor-health";
const MANUAL_HEALTH_COMPONENTS = [
  { key: "connection", label: "Device connection" },
  { key: "freshness", label: "Data freshness" },
  { key: "contact", label: "Chest contact" },
  { key: "heartRate", label: "Heart-rate sensor" },
  { key: "spo2", label: "SpO2 sensor" },
  { key: "temperature", label: "Temperature sensor" },
];

// Manual sensor health review. General events remain in Alert History and Command Center.
export default function SensorStatusPage({ miners = [] }) {
  const fleet = useMemo(
    () => [...miners].sort((a, b) => {
      const newestFirst = lastSeenValue(b) - lastSeenValue(a);
      return newestFirst || String(a.id || "").localeCompare(String(b.id || ""));
    }),
    [miners],
  );
  const isOnline = (miner) => miner.active && !miner.stale;
  const active = miners.filter(isOnline).length;
  const maintenance = fleet.map(buildMaintenanceItem);
  const [manualAssessments, setManualAssessments] = useState(readManualAssessments);
  useEffect(() => {
    writeStoredValue(MANUAL_HEALTH_STORAGE_KEY, manualAssessments);
  }, [manualAssessments]);
  const futureSlots = fleet.length < 2 ? 1 : 0;
  const nodeColumns = Math.min(Math.max(fleet.length + futureSlots, 2), 3);

  const updateManualAssessment = (minerId, componentKey, value) => {
    setManualAssessments((current) => ({
      ...current,
      [minerId]: {
        ...(current[minerId] || {}),
        [componentKey]: { value: Number(value), reviewed: true },
      },
    }));
  };

  const resetManualAssessment = (minerId) => {
    setManualAssessments((current) => {
      const next = { ...current };
      delete next[minerId];
      return next;
    });
  };

  return (
    <div style={pageStyle}>
      <div className="sensor-status-layout page-layout" style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <section className="cc-vitals" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
          <IntegrityTile label="HR Sensors" value={miners.filter((miner) => isOnline(miner) && miner.hr > 0).length} total={miners.length} color={C.red} />
          <IntegrityTile label="SpO2 Sensors" value={miners.filter((miner) => isOnline(miner) && miner.spo2 > 0).length} total={miners.length} color={C.oxygen} />
          <IntegrityTile label="Temp Sensors" value={miners.filter((miner) => isOnline(miner) && miner.temp > 0).length} total={miners.length} color={C.teal} />
          <IntegrityTile label="Chest Contact" value={miners.filter((miner) => isOnline(miner) && miner.finger !== false).length} total={miners.length} color={C.green} />
          <IntegrityTile label="Offline" value={miners.filter((miner) => !isOnline(miner)).length} total={miners.length} color={miners.some((miner) => !isOnline(miner)) ? C.offline : C.green} />
        </section>

        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>Sensor nodes</div>
            <Indicator color={active ? C.green : C.offline} label="Live signal status updates automatically" />
          </div>
          <div className="sensor-nodes-grid hide-scrollbar" style={{ display: "grid", gridTemplateColumns: `repeat(${nodeColumns}, minmax(310px, 1fr))`, gridTemplateRows: "auto", gap: 10, overflowX: "auto", overflowY: "hidden", minWidth: 0 }}>
            {fleet.map((miner) => <SensorNode key={miner.id} miner={miner} />)}
            {futureSlots > 0 && <FutureSensorNode />}
          </div>
        </section>

        <section className="sensor-support-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 0.8fr)", gap: 12, minHeight: 0, overflow: "hidden" }}>
          <div className="sensor-device-list" style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
            <div className="sensor-device-list-header">
              <PanelHeader
                title="Device List"
                subtitle="Device condition and sensor-specific checks, separate from the general event log."
                meta={`${maintenance.filter((item) => !item.healthy).length} need review`}
              />
            </div>
            <div className="sensor-device-list-scroll table-scroll-x hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
              <div style={{ padding: 10, display: "grid", gap: 7 }}>
              {maintenance.length > 0 && (
                <div className="maintenance-table-head sensor-device-column-header" style={{ display: "grid", gridTemplateColumns: "minmax(140px, 0.7fr) minmax(120px, 0.55fr) minmax(140px, 0.7fr) minmax(220px, 1.2fr)", gap: 12, padding: "0 12px 7px", color: C.textMuted, fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  <span>Device</span>
                  <span>Condition</span>
                  <span>Sensor status</span>
                  <span>Recommended action</span>
                </div>
              )}
              {maintenance.length
                ? maintenance.map((item) => <MaintenanceRow key={item.id} item={item} />)
                : <EmptyState text="Register a device to populate the device list." />}
              </div>
            </div>
          </div>

          <ManualSensorHealthPanel
            miners={fleet}
            assessments={manualAssessments}
            onChange={updateManualAssessment}
            onReset={resetManualAssessment}
          />
        </section>
      </div>
    </div>
  );
}

function SensorNode({ miner }) {
  const online = Boolean(miner.active && !miner.stale);
  const statusColor = online ? C.green : C.offline;
  const metrics = sensorMetrics(miner, online);
  return (
    <article style={{ ...cardStyle, padding: 13, borderLeft: `3px solid ${statusColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{miner.name}</div>
          <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id} · {miner.location}</div>
        </div>
        <span style={{ color: statusColor, fontSize: 10, fontWeight: 900 }}>{sensorStatusLabel(online, miner.stale)}</span>
      </div>
      <div className="sensor-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
        {metrics.map((metric) => <SensorMetric key={metric.label} {...metric} />)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12, color: C.textMuted, fontSize: 11 }}>
        <span>Contact: <b style={{ color: contactColor(miner.finger, online) }}>{contactLabel(miner.finger, online)}</b></span>
        <span>{formatLastSeen(miner.lastSeen)}</span>
      </div>
    </article>
  );
}

function sensorMetrics(miner, online) {
  return [
    readingMetric("Heart rate", miner.hr, online, C.red, "bpm", 0),
    readingMetric("SpO2", miner.spo2, online, C.oxygen, "%", 0),
    { label: "Manual SOS", value: manualSosLabel(online, miner.manual_alert), color: manualSosColor(online, miner.manual_alert), state: online ? `${miner.button_press_count || 0} activations` : "No signal" },
    readingMetric("Temperature", miner.temp, online, C.teal, "\u00b0C", 1),
  ];
}

function readingMetric(label, value, online, color, unit, digits) {
  const numericValue = Number(value || 0);
  if (!online || numericValue <= 0) return { label, value: "--", color: C.offline, state: "No signal" };
  const suffix = unit === "%" ? "%" : ` ${unit}`;
  return { label, value: `${formatReading(numericValue, digits)}${suffix}`, color, state: "Reading" };
}

function sensorStatusLabel(online, stale) {
  if (online) return "ONLINE";
  return stale ? "STALE" : "OFFLINE";
}

function manualSosLabel(online, pressed) {
  if (!online) return "--";
  return pressed ? "Pressed" : "Clear";
}

function manualSosColor(online, pressed) {
  if (!online) return C.offline;
  return pressed ? C.red : C.green;
}

function contactColor(finger, online) {
  if (finger === false) return C.amber;
  return online ? C.green : C.offline;
}

function contactLabel(finger, online) {
  if (finger === false) return "Missing";
  return online ? "Valid" : "Offline";
}

function FutureSensorNode() {
  return (
    <article className="sensor-future-node" style={{ ...cardStyle, padding: 13, border: `1px dashed ${C.border}`, background: "rgba(255,255,255,0.012)", display: "grid", alignContent: "center", minHeight: 174 }}>
      <div style={{ display: "grid", placeItems: "center", gap: 8, textAlign: "center" }}>
        <div style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, borderRadius: 10, color: C.textMuted, fontSize: 22, lineHeight: 1 }}>+</div>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>Future device slot</div>
        <div style={{ maxWidth: 220, color: C.textMuted, fontSize: 10.5, lineHeight: 1.45 }}>Register another miner to activate this sensor node.</div>
      </div>
    </article>
  );
}

function SensorMetric({ label, value, color, state }) {
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: 9, background: "rgba(255,255,255,0.02)", minWidth: 0 }}>
      <div style={{ color: C.textMuted, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 950, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ color, fontSize: 10, fontWeight: 900, marginTop: 5 }}>{state}</div>
    </div>
  );
}

function buildMaintenanceItem(miner) {
  if (!miner.active) return { id: miner.id, miner: miner.name, healthy: false, color: C.offline, condition: "Offline", issue: "Device offline", action: "Check power, then confirm queued WiFi credentials." };
  if (miner.stale) return { id: miner.id, miner: miner.name, healthy: false, color: C.amber, condition: "Attention", issue: "Stale stream", action: "Restart the stream if last seen exceeds the timeout." };
  if (miner.finger === false) return { id: miner.id, miner: miner.name, healthy: false, color: C.amber, condition: "Attention", issue: "Contact missing", action: "Re-seat the strap and verify skin contact." };
  if (miner.hr <= 0 || miner.spo2 <= 0) return { id: miner.id, miner: miner.name, healthy: false, color: C.red, condition: "Attention", issue: "Optical sensor incomplete", action: "Inspect HR/SpO2 sensor placement and wiring." };
  if (miner.temp <= 0) return { id: miner.id, miner: miner.name, healthy: false, color: C.amber, condition: "Attention", issue: "Temperature unavailable", action: "Inspect the probe and allow it to settle." };
  if (miner.manual_alert) return { id: miner.id, miner: miner.name, healthy: false, color: C.amber, condition: "Good", issue: "Manual SOS active", action: "Review the alert in Alert Logs before closing the check." };
  return { id: miner.id, miner: miner.name, healthy: true, color: C.green, condition: "Excellent", issue: "All sensors reporting", action: "No maintenance action is required." };
}

function MaintenanceRow({ item }) {
  return (
    <div className="maintenance-row" style={{ display: "grid", gridTemplateColumns: "minmax(140px, 0.7fr) minmax(120px, 0.55fr) minmax(140px, 0.7fr) minmax(220px, 1.2fr)", gap: 12, alignItems: "center", border: `1px solid ${C.borderSoft}`, borderLeft: `3px solid ${item.color}`, borderRadius: 8, padding: "10px 12px", background: `${item.color}07` }}>
      <div>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>{item.miner}</div>
        <div style={{ color: C.textMuted, fontSize: 9.5, marginTop: 3 }}>{item.id}</div>
      </div>
      <div style={{ color: item.color, fontSize: 11, fontWeight: 950 }}>{item.condition}</div>
      <div style={{ color: item.color, fontSize: 11, fontWeight: 900 }}>{item.issue}</div>
      <div style={{ color: C.textMuted, fontSize: 10.5, lineHeight: 1.45 }}>{item.action}</div>
    </div>
  );
}

function readManualAssessments() {
  const stored = readStoredValue(MANUAL_HEALTH_STORAGE_KEY, null);
  if (stored && typeof stored === "object" && !Array.isArray(stored)) return stored;

  // Migrate assessments created by the earlier session-only implementation.
  // The manual review belongs to the device, so it should survive an auth
  // logout/login cycle and a browser restart until an operator resets it.
  if (typeof window !== "undefined") {
    const legacy = readStoredValue(MANUAL_HEALTH_STORAGE_KEY, null, window.sessionStorage);
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
      writeStoredValue(MANUAL_HEALTH_STORAGE_KEY, legacy);
      return legacy;
    }
  }
  return {};
}

function ManualSensorHealthPanel({ miners, assessments, onChange, onReset }) {
  const reviewedDevices = miners.filter((miner) => manualAssessmentSummary(assessments[miner.id]).reviewed > 0).length;
  return (
    <div className="manual-sensor-health-panel" style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
      <div className="manual-sensor-health-header">
        <PanelHeader title="Manual sensor health" subtitle="Drag each bar to record the condition you checked." meta={`${reviewedDevices}/${miners.length} reviewed`} />
      </div>
      <div className="manual-sensor-health-list hide-scrollbar">
        {miners.length
          ? miners.map((miner) => (
            <ManualSensorHealthRow
              key={miner.id}
              miner={miner}
              assessment={assessments[miner.id] || {}}
              onChange={onChange}
              onReset={onReset}
            />
          ))
          : <EmptyState text="Register a device to begin manual sensor health checks." />}
      </div>
    </div>
  );
}

function ManualSensorHealthRow({ miner, assessment, onChange, onReset }) {
  const summary = manualAssessmentSummary(assessment);
  return (
    <article className="manual-sensor-health-row">
      <div className="manual-sensor-health-row-top">
        <div>
          <strong>{miner.name}</strong>
          <span>{miner.id} · {summary.reviewed}/{MANUAL_HEALTH_COMPONENTS.length} checks recorded</span>
        </div>
        <span className="manual-sensor-health-score" style={{ color: summary.color, borderColor: `${summary.color}55`, background: `${summary.color}12` }}>{summary.display}</span>
      </div>
      <div className="manual-sensor-health-checks">
        {MANUAL_HEALTH_COMPONENTS.map((component) => (
          <ManualSensorHealthBar
            key={component.key}
            component={component}
            entry={assessment[component.key]}
            onChange={(value) => onChange(miner.id, component.key, value)}
          />
        ))}
      </div>
      <div className="manual-sensor-health-row-footer">
        <span>{summary.reviewed ? `${summary.reviewed} of ${MANUAL_HEALTH_COMPONENTS.length} checks set` : "No manual checks set yet"}</span>
        <button type="button" className="manual-sensor-health-reset" onClick={() => onReset(miner.id)} disabled={!summary.reviewed}>Reset</button>
      </div>
    </article>
  );
}

function ManualSensorHealthBar({ component, entry, onChange }) {
  const reviewed = Boolean(entry?.reviewed);
  const value = clampManualValue(entry?.value);
  const status = manualValueStatus(value, reviewed);

  return (
    <label className="manual-sensor-health-check">
      <div className="manual-sensor-health-check-top">
        <span>{component.label}</span>
        <strong style={{ color: status.color }}>{status.label}</strong>
      </div>
      <div className="manual-sensor-health-range-wrap">
        <span>Low</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={value}
          aria-label={`${component.label} manual health status`}
          onChange={(event) => onChange(event.target.value)}
          style={{ "--manual-health-fill": `${reviewed ? value : 0}%`, "--manual-health-color": status.color }}
        />
        <span>Good</span>
      </div>
      <div className="manual-sensor-health-check-foot"><span>{reviewed ? `${value}%` : "Drag to set"}</span><span>{status.helper}</span></div>
    </label>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function manualAssessmentSummary(assessment = {}) {
  const entries = MANUAL_HEALTH_COMPONENTS.map((component) => assessment[component.key]).filter((entry) => entry?.reviewed);
  const reviewed = entries.length;
  if (!reviewed) return { reviewed: 0, display: "Not reviewed", color: C.offline };
  const average = Math.round(entries.reduce((total, entry) => total + clampManualValue(entry.value), 0) / reviewed);
  const status = manualValueStatus(average, reviewed === MANUAL_HEALTH_COMPONENTS.length);
  return { reviewed, display: reviewed === MANUAL_HEALTH_COMPONENTS.length ? `${average}% · ${status.label}` : `${reviewed}/${MANUAL_HEALTH_COMPONENTS.length} set`, color: status.color };
}

function clampManualValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

// eslint-disable-next-line react-refresh/only-export-components
export function manualValueStatus(value, reviewed) {
  if (!reviewed) return { label: "Not reviewed", helper: "Set status", color: C.offline };
  if (value < 25) return { label: "Critical", helper: "Needs action", color: C.red };
  if (value < 50) return { label: "Poor", helper: "Inspect", color: C.amber };
  if (value < 75) return { label: "Fair", helper: "Watch", color: C.cyan };
  return { label: "Good", helper: "Acceptable", color: C.green };
}

function PanelHeader({ title, subtitle, meta }) {
  return (
    <div style={{ padding: "12px 15px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{title}</div>
        <div style={{ color: C.textMuted, fontSize: 10.5, marginTop: 3 }}>{subtitle}</div>
      </div>
      {meta && <span style={{ color: C.textMuted, fontSize: 10, whiteSpace: "nowrap" }}>{meta}</span>}
    </div>
  );
}

function Indicator({ color, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.textMuted, fontSize: 11 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} />
      {label}
    </div>
  );
}

function IntegrityTile({ label, value, total, color }) {
  const percentage = total ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ ...cardStyle, padding: "11px 14px", borderLeft: `3px solid ${color}` }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
        <span style={{ color, fontSize: 22, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        <span style={{ color: C.textMuted, fontSize: 12 }}>/{total}</span>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: C.border, marginTop: 9, overflow: "hidden" }}>
        <div style={{ width: `${percentage}%`, height: "100%", background: color, borderRadius: 999, transition: "width 180ms ease" }} />
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ color: C.textMuted, fontSize: 12, textAlign: "center", padding: 18 }}>{text}</div>;
}
