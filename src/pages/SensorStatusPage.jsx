import { useMemo, useState } from "react";
import Modal from "../components/Modal";
import { C, cardStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";
import { formatLastSeen, formatReading, formatSystemTimestamp } from "../utils/formatters";

export default function SensorStatusPage({ miners, activityLogs = [], onClearActivityLogs }) {
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  const [clearLogsError, setClearLogsError] = useState("");
  const [clearingLogs, setClearingLogs] = useState(false);
  const active = miners.filter((miner) => miner.active).length;
  const sortedMiners = useMemo(() => [...miners].sort((a, b) => lastSeenValue(b) - lastSeenValue(a) || a.id.localeCompare(b.id)), [miners]);
  const sensorWarnings = miners.filter((miner) => miner.finger === false || miner.stale || !miner.active).length;
  const events = activityLogs.map(mapStoredEvent).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

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
      <div style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <section style={{ ...cardStyle, padding: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "end" }}>
          <div>
            <div style={moduleLabel}>Sensor diagnostics</div>
            <div style={{ color: C.text, fontSize: 26, fontWeight: 950, marginTop: 4 }}>Sensor Status</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 5 }}>Health of the SpO2 and heart-rate sensors attached to each Smart Chest Miner device.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <HeaderStat label="Active miners" value={`${active}/${miners.length}`} color={C.green} />
            <HeaderStat label="Warnings" value={sensorWarnings} color={sensorWarnings ? C.amber : C.green} />
          </div>
        </section>

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>Active Sensor Nodes</div>
            <Indicator color={active ? C.green : C.offline} label="Live diagnostics update automatically" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {sortedMiners.map((miner) => (
              <SensorNode key={miner.id} miner={miner} />
            ))}
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 12, minHeight: 0 }}>
          <div style={{ ...cardStyle, padding: 15, minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={moduleLabel}>Network event log</div>
                <div style={{ color: C.text, fontSize: 16, fontWeight: 950, marginTop: 4 }}>Miner Activity Records</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Indicator color={sensorWarnings ? C.amber : C.green} label={`${events.length} recorded events`} />
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
            <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
              {events.length === 0 ? (
                <div style={{ color: C.textMuted, fontSize: 13, padding: "18px 0", borderTop: `1px solid ${C.borderSoft}` }}>No miner activity records are stored.</div>
              ) : (
                events.map((event) => (
                  <EventRow key={event.id || `${event.deviceId}-${event.title}-${event.time}`} event={event} />
                ))
              )}
            </div>
          </div>

          <aside style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 12, minHeight: 0 }}>
            <section style={{ ...cardStyle, padding: 15 }}>
              <div style={moduleLabel}>Signal integrity</div>
              <Integrity label="Heart-rate sensors online" value={`${miners.filter((miner) => miner.active && miner.hr > 0).length}/${miners.length}`} color={C.red} />
              <Integrity label="SpO2 sensors online" value={`${miners.filter((miner) => miner.active && miner.spo2 > 0).length}/${miners.length}`} color={C.primary} />
              <Integrity label="Chest contact valid" value={`${miners.filter((miner) => miner.active && miner.finger !== false).length}/${miners.length}`} color={C.green} />
              <Integrity label="Offline signals" value={miners.filter((miner) => miner.stale).length} color={miners.some((miner) => miner.stale) ? C.offline : C.green} />
            </section>
            <section style={{ ...cardStyle, padding: 15, minHeight: 0 }}>
              <div style={moduleLabel}>Sensor notes</div>
              <div className="hide-scrollbar" style={{ display: "grid", gap: 8, marginTop: 12, overflow: "auto", maxHeight: "100%" }}>
                {sortedMiners.map((miner) => (
                  <Note key={miner.id} miner={miner} />
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}

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

function HeaderStat({ label, value, color }) {
  return (
    <div style={{ ...cardStyle, padding: "10px 14px", minWidth: 132 }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 950, marginTop: 5 }}>{value}</div>
    </div>
  );
}

function SensorNode({ miner }) {
  return (
    <div style={{ ...cardStyle, padding: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{miner.name}</div>
          <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id} / {miner.location}</div>
        </div>
        <span style={{ color: miner.active ? C.green : C.offline, fontSize: 10, fontWeight: 900 }}>{miner.active ? "ONLINE" : "OFFLINE"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <SensorMetric label="Heart-rate sensor" value={miner.active ? `${formatReading(miner.hr, 0)} bpm` : "--"} color={miner.active && miner.hr > 0 ? C.red : C.offline} state={miner.active && miner.hr > 0 ? "Reading" : "No signal"} />
        <SensorMetric label="SpO2 sensor" value={miner.active ? `${formatReading(miner.spo2, 0)}%` : "--"} color={miner.active && miner.spo2 > 0 ? C.primary : C.offline} state={miner.active && miner.spo2 > 0 ? "Reading" : "No signal"} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12, color: C.textMuted, fontSize: 11 }}>
        <span>Contact: <b style={{ color: miner.finger === false ? C.amber : miner.active ? C.green : C.offline }}>{miner.finger === false ? "Missing" : miner.active ? "Valid" : "Offline"}</b></span>
        <span>{formatLastSeen(miner.lastSeen)}</span>
      </div>
    </div>
  );
}

function SensorMetric({ label, value, color, state }) {
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: 9, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ color: C.textMuted, fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 950, marginTop: 6 }}>{value}</div>
      <div style={{ color, fontSize: 10, fontWeight: 900, marginTop: 5 }}>{state}</div>
    </div>
  );
}

function EventRow({ event }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0, 1fr) 130px", gap: 12, padding: "11px 0", borderTop: `1px solid ${C.borderSoft}`, alignItems: "center" }}>
      <span style={{ color: C.textMuted, fontSize: 11 }}>{event.time}</span>
      <div style={{ borderLeft: `3px solid ${event.color}`, paddingLeft: 10 }}>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 950 }}>{event.title}</div>
        <div style={{ color: C.textMuted, fontSize: 11, marginTop: 3 }}>{event.detail}</div>
      </div>
      <span style={{ color: C.primary, fontSize: 11, fontWeight: 900, textAlign: "right" }}>{event.miner}</span>
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

function Integrity({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={{ color: C.textMuted, fontSize: 12 }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

function Note({ miner }) {
  const text = miner.active ? "Both sensor channels are evaluated against the current fresh-signal window." : "Sensor checks will resume automatically when new telemetry arrives.";
  return <div style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.45, border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: 10 }}>{miner.name}: {text}</div>;
}

function lastSeenValue(miner) {
  return miner.lastSeen?.getTime?.() || Number(miner.lastSeen) || 0;
}

const moduleLabel = { color: C.primary, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 };
