import { useMemo, useState } from "react";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import { C, cardStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";
import { formatLastSeen, formatReading, formatSystemTimestamp, lastSeenValue } from "../utils/formatters";

// SensorStatusPage — sensor health diagnostics: per-miner readings, signal integrity, and activity event log
export default function SensorStatusPage({ miners, activityLogs = [], onClearActivityLogs }) {
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  const [clearLogsError, setClearLogsError] = useState("");
  const [clearingLogs, setClearingLogs] = useState(false);
  const active = miners.filter((miner) => miner.active).length;
  const sortedMiners = useMemo(() => [...miners].sort((a, b) => lastSeenValue(b) - lastSeenValue(a) || a.id.localeCompare(b.id)), [miners]);
  const sensorWarnings = miners.filter((miner) => miner.finger === false || miner.stale || !miner.active).length;
  const rawEvents = activityLogs.map(mapStoredEvent).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  const events = rawEvents.filter((event, index) => {
    if (index === 0) return true;
    const prev = rawEvents[index - 1];
    const timeDiff = Math.abs(Number(event.timestamp || 0) - Number(prev.timestamp || 0));
    return !(event.deviceId === prev.deviceId && event.title === prev.title && timeDiff < 60_000);
  });

  const confirmClearLogs = async () => {
    setClearingLogs(true);
    setClearLogsError("");

    try {
      await onClearActivityLogs?.();
      setClearLogsOpen(false);
    } catch (error) {
      setClearLogsError(error.message || "Unable to clear activity logs.");
    } finally {
      setClearingLogs(false);
    }
  };

  return (
    <div style={pageStyle}>
      {clearLogsOpen && (
        <Modal
          title="Clear Activity Logs"
          onClose={() => {
            if (!clearingLogs) setClearLogsOpen(false);
          }}
          actions={
            <>
              <button disabled={clearingLogs} onClick={() => setClearLogsOpen(false)} style={{ ...ghostButtonStyle, padding: "9px 15px", opacity: clearingLogs ? 0.5 : 1 }}>
                Cancel
              </button>
              <button disabled={clearingLogs} onClick={confirmClearLogs} style={{ ...primaryButtonStyle, padding: "9px 15px", opacity: clearingLogs ? 0.75 : 1 }}>
                {clearingLogs ? "Clearing..." : "Confirm Clear"}
              </button>
            </>
          }
        >
          <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.55 }}>
            Clear all miner activity records from the event log? This removes the stored log entries from Firebase.
          </div>
          {clearLogsError && <div style={{ color: C.amber, fontSize: 12, marginTop: 10 }}>{clearLogsError}</div>}
        </Modal>
      )}
      <div style={{ display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <PageHeader
          label="Sensor diagnostics"
          title="Sensor Status"
          titleSize={26}
          subtitle="Health of the heart-rate, SpO2, and body-temperature sensors attached to each Smart Chest Miner device."
          right={
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <HeaderStat label="Active miners" value={`${active}/${miners.length}`} color={C.green} />
              <HeaderStat label="Warnings" value={sensorWarnings} color={sensorWarnings ? C.amber : C.green} />
            </div>
          }
        />

        {/* Signal integrity — per-sensor-type roll-up as a visual stat strip */}
        <section className="cc-vitals" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
          <IntegrityTile label="HR Sensors" value={miners.filter((m) => m.active && m.hr > 0).length} total={miners.length} color={C.red} />
          <IntegrityTile label="SpO2 Sensors" value={miners.filter((m) => m.active && m.spo2 > 0).length} total={miners.length} color={C.primary} />
          <IntegrityTile label="Temp Sensors" value={miners.filter((m) => m.active && m.temp > 0).length} total={miners.length} color={C.teal} />
          <IntegrityTile label="Chest Contact" value={miners.filter((m) => m.active && m.finger !== false).length} total={miners.length} color={C.green} />
          <IntegrityTile label="Offline" value={miners.filter((m) => !m.active).length} total={miners.length} color={miners.some((m) => !m.active) ? C.offline : C.green} />
        </section>

        {/* Active sensor nodes — per-miner diagnostics, stretched to fill the row */}
        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>Active Sensor Nodes</div>
            <Indicator color={active ? C.green : C.offline} label="Live diagnostics update automatically" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            {sortedMiners.map((miner) => (
              <SensorNode key={miner.id} miner={miner} />
            ))}
          </div>
        </section>

        {/* Network activity log — full width so each row has room */}
        <section style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "12px 15px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>Network Activity Log</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: C.textMuted, fontSize: 11 }}>{events.length} event{events.length === 1 ? "" : "s"}</span>
              <button
                disabled={!events.length || !onClearActivityLogs}
                onClick={() => {
                  setClearLogsError("");
                  setClearLogsOpen(true);
                }}
                style={{ ...ghostButtonStyle, padding: "8px 11px", fontSize: 11, opacity: events.length && onClearActivityLogs ? 1 : 0.5, cursor: events.length && onClearActivityLogs ? "pointer" : "not-allowed" }}
              >
                Clear All Logs
              </button>
            </div>
          </div>
          <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0, padding: "0 15px" }}>
            {events.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: 13, padding: "18px 0" }}>No miner activity records are stored.</div>
            ) : (
              events.map((event) => (
                <EventRow key={event.id || `${event.deviceId}-${event.title}-${event.time}`} event={event} />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// mapStoredEvent — converts a raw Firebase activity log entry to a display-ready event object with color
function mapStoredEvent(event) {
  const color = event.severity === "critical" ? C.red : event.severity === "warning" ? C.amber : event.status === "online" ? C.green : event.status === "offline" ? C.offline : C.primary;
  return {
    id: event.id,
    deviceId: event.deviceId,
    miner: event.miner || event.deviceId,
    title: event.title,
    detail: event.detail,
    color,
    timestamp: event.timestamp,
    time: formatSystemTimestamp(event.timestamp),
  };
}

// HeaderStat — large-number stat card shown in the page header (Active miners, Warnings)
function HeaderStat({ label, value, color }) {
  return (
    <div style={{ ...cardStyle, padding: "10px 14px", minWidth: 132 }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 950, marginTop: 5 }}>{value}</div>
    </div>
  );
}

// SensorNode — per-miner card showing HR, SpO2, and body temp sensor states with contact and last-seen
function SensorNode({ miner }) {
  const statusColor = miner.active ? C.green : C.offline;
  return (
    <div style={{ ...cardStyle, padding: 13, borderLeft: `3px solid ${statusColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{miner.name}</div>
          <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id} / {miner.location}</div>
        </div>
        <span style={{ color: miner.active ? C.green : C.offline, fontSize: 10, fontWeight: 900 }}>{miner.active ? "ONLINE" : "OFFLINE"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
        <SensorMetric label="Heart-rate sensor" value={miner.active ? `${formatReading(miner.hr, 0)} bpm` : "--"} color={miner.active && miner.hr > 0 ? C.red : C.offline} state={miner.active && miner.hr > 0 ? "Reading" : "No signal"} />
        <SensorMetric label="SpO2 sensor" value={miner.active ? `${formatReading(miner.spo2, 0)}%` : "--"} color={miner.active && miner.spo2 > 0 ? C.primary : C.offline} state={miner.active && miner.spo2 > 0 ? "Reading" : "No signal"} />
        <SensorMetric label="Manual SOS" value={miner.active ? (miner.button_pressed || miner.manual_alert ? "Pressed" : "Clear") : "--"} color={miner.active && (miner.button_pressed || miner.manual_alert) ? C.red : miner.active ? C.green : C.offline} state={miner.active ? `${miner.button_press_count || 0} presses` : "No signal"} />
        <SensorMetric label="Body temp sensor" value={miner.active ? `${formatReading(miner.temp, 1)}°C` : "--"} color={miner.active && miner.temp > 0 ? C.teal : C.offline} state={miner.active && miner.temp > 0 ? "Reading" : "No signal"} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12, color: C.textMuted, fontSize: 11 }}>
        <span>Contact: <b style={{ color: miner.finger === false ? C.amber : miner.active ? C.green : C.offline }}>{miner.finger === false ? "Missing" : miner.active ? "Valid" : "Offline"}</b></span>
        <span>{formatLastSeen(miner.lastSeen)}</span>
      </div>
    </div>
  );
}

// SensorMetric — individual sensor tile inside SensorNode (HR sensor / SpO2 sensor / body temp sensor)
function SensorMetric({ label, value, color, state }) {
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: 9, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ color: C.textMuted, fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 950, marginTop: 6 }}>{value}</div>
      <div style={{ color, fontSize: 10, fontWeight: 900, marginTop: 5 }}>{state}</div>
    </div>
  );
}

// EventRow — single row in the Miner Activity Records log table
function EventRow({ event }) {
  return (
    <div className="data-row" style={{ display: "grid", gridTemplateColumns: "90px minmax(0, 1fr) 130px", gap: 12, padding: "11px 6px", borderTop: `1px solid ${C.borderSoft}`, alignItems: "center" }}>
      <span style={{ color: C.textMuted, fontSize: 11 }}>{event.time}</span>
      <div style={{ borderLeft: `3px solid ${event.color}`, paddingLeft: 10 }}>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 950 }}>{event.title}</div>
        <div style={{ color: C.textMuted, fontSize: 11, marginTop: 3 }}>{event.detail}</div>
      </div>
      <span style={{ color: C.primary, fontSize: 11, fontWeight: 900, textAlign: "right" }}>{event.miner}</span>
    </div>
  );
}

// Indicator — glowing dot + label for the "Active Sensor Nodes" live status line
function Indicator({ color, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.textMuted, fontSize: 11 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} />
      {label}
    </div>
  );
}

// IntegrityTile — per-sensor-type stat tile with a fill bar (online / total)
function IntegrityTile({ label, value, total, color }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ ...cardStyle, padding: "11px 14px", borderLeft: `3px solid ${color}` }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
        <span style={{ color, fontSize: 22, fontWeight: 950 }}>{value}</span>
        <span style={{ color: C.textMuted, fontSize: 12 }}>/{total}</span>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: C.border, marginTop: 9, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

