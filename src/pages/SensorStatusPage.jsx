import { useMemo } from "react";
import PageHeader from "../components/PageHeader";
import { C, cardStyle, pageStyle } from "../theme";
import { formatLastSeen, formatReading } from "../utils/formatters";
import { sortMinersActiveFirst } from "../utils/minerOrdering";

// Dedicated sensor diagnostics. General events remain in Alert History and Command Center.
export default function SensorStatusPage({ miners = [] }) {
  const fleet = useMemo(
    () => sortMinersActiveFirst(miners),
    [miners],
  );
  const isOnline = (miner) => miner.active && !miner.stale;
  const active = miners.filter(isOnline).length;
  const warnings = miners.filter((miner) => miner.finger === false || miner.stale || !miner.active).length;
  const maintenance = fleet.map(buildMaintenanceItem);

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <PageHeader
          label="Sensor diagnostics"
          title="Sensor Status"
          titleSize={26}
          subtitle="Signal integrity, contact quality, and guided recovery for every registered device."
          right={
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <HeaderStat label="Active miners" value={`${active}/${miners.length}`} color={active ? C.green : C.offline} />
              <HeaderStat label="Need review" value={warnings} color={warnings ? C.amber : C.green} />
            </div>
          }
        />

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
            <Indicator color={active ? C.green : C.offline} label="Diagnostics update automatically" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 10 }}>
            {fleet.map((miner) => <SensorNode key={miner.id} miner={miner} />)}
          </div>
        </section>

        <section className="sensor-support-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 0.8fr)", gap: 12, minHeight: 0, overflow: "hidden" }}>
          <div className="hide-scrollbar" style={{ ...cardStyle, overflow: "auto", minHeight: 0 }}>
            <PanelHeader
              title="Maintenance queue"
              subtitle="Sensor-specific checks, separate from the general event log."
              meta={`${maintenance.filter((item) => !item.healthy).length} need review`}
            />
            <div style={{ padding: 10, display: "grid", gap: 7 }}>
              {maintenance.length
                ? maintenance.map((item) => <MaintenanceRow key={item.id} item={item} />)
                : <EmptyState text="Register a device to create a sensor maintenance queue." />}
            </div>
          </div>

          <div className="hide-scrollbar" style={{ ...cardStyle, overflow: "auto", minHeight: 0 }}>
            <PanelHeader title="Diagnostic guide" subtitle="Recommended recovery sequence." />
            <div style={{ padding: "8px 14px 14px" }}>
              <GuideStep number="01" title="Restore connection" text="Confirm power and WiFi before evaluating individual sensors." />
              <GuideStep number="02" title="Verify chest contact" text="Poor contact can suppress both HR and SpO2 while the device remains online." />
              <GuideStep number="03" title="Validate readings" text="Wait for stable HR, SpO2, and temperature values before clearing a warning." />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SensorNode({ miner }) {
  const online = Boolean(miner.active && !miner.stale);
  const statusColor = online ? C.green : C.offline;
  return (
    <article style={{ ...cardStyle, padding: 13, borderLeft: `3px solid ${statusColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{miner.name}</div>
          <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id} · {miner.location}</div>
        </div>
        <span style={{ color: statusColor, fontSize: 10, fontWeight: 900 }}>{online ? "ONLINE" : miner.stale ? "STALE" : "OFFLINE"}</span>
      </div>
      <div className="sensor-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
        <SensorMetric label="Heart rate" value={online && miner.hr > 0 ? `${formatReading(miner.hr, 0)} bpm` : "--"} color={online && miner.hr > 0 ? C.red : C.offline} state={online && miner.hr > 0 ? "Reading" : "No signal"} />
        <SensorMetric label="SpO2" value={online && miner.spo2 > 0 ? `${formatReading(miner.spo2, 0)}%` : "--"} color={online && miner.spo2 > 0 ? C.oxygen : C.offline} state={online && miner.spo2 > 0 ? "Reading" : "No signal"} />
        <SensorMetric label="Manual SOS" value={online ? (miner.button_pressed || miner.manual_alert ? "Pressed" : "Clear") : "--"} color={online && (miner.button_pressed || miner.manual_alert) ? C.red : online ? C.green : C.offline} state={online ? `${miner.button_press_count || 0} presses` : "No signal"} />
        <SensorMetric label="Body temp" value={online && miner.temp > 0 ? `${formatReading(miner.temp, 1)}°C` : "--"} color={online && miner.temp > 0 ? C.teal : C.offline} state={online && miner.temp > 0 ? "Reading" : "No signal"} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12, color: C.textMuted, fontSize: 11 }}>
        <span>Contact: <b style={{ color: miner.finger === false ? C.amber : online ? C.green : C.offline }}>{miner.finger === false ? "Missing" : online ? "Valid" : "Offline"}</b></span>
        <span>{formatLastSeen(miner.lastSeen)}</span>
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
  if (!miner.active) return { id: miner.id, miner: miner.name, healthy: false, color: C.offline, issue: "Device offline", action: "Check power, then confirm queued WiFi credentials." };
  if (miner.stale) return { id: miner.id, miner: miner.name, healthy: false, color: C.amber, issue: "Stale stream", action: "Restart the stream if last seen exceeds the timeout." };
  if (miner.finger === false) return { id: miner.id, miner: miner.name, healthy: false, color: C.amber, issue: "Contact missing", action: "Re-seat the strap and verify skin contact." };
  if (!(miner.hr > 0) || !(miner.spo2 > 0)) return { id: miner.id, miner: miner.name, healthy: false, color: C.red, issue: "Optical sensor incomplete", action: "Inspect HR/SpO2 sensor placement and wiring." };
  if (!(miner.temp > 0)) return { id: miner.id, miner: miner.name, healthy: false, color: C.amber, issue: "Temperature unavailable", action: "Inspect the probe and allow it to settle." };
  return { id: miner.id, miner: miner.name, healthy: true, color: C.green, issue: "All sensors reporting", action: "No maintenance action is required." };
}

function MaintenanceRow({ item }) {
  return (
    <div className="maintenance-row" style={{ display: "grid", gridTemplateColumns: "minmax(140px, 0.7fr) minmax(140px, 0.7fr) minmax(220px, 1.2fr)", gap: 12, alignItems: "center", border: `1px solid ${C.borderSoft}`, borderLeft: `3px solid ${item.color}`, borderRadius: 8, padding: "10px 12px", background: `${item.color}07` }}>
      <div>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>{item.miner}</div>
        <div style={{ color: C.textMuted, fontSize: 9.5, marginTop: 3 }}>{item.id}</div>
      </div>
      <div style={{ color: item.color, fontSize: 11, fontWeight: 900 }}>{item.issue}</div>
      <div style={{ color: C.textMuted, fontSize: 10.5, lineHeight: 1.45 }}>{item.action}</div>
    </div>
  );
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

function GuideStep({ number, title, text }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "30px 1fr", gap: 10, padding: "11px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={{ color: C.primary, fontSize: 10, fontWeight: 950 }}>{number}</span>
      <div>
        <div style={{ color: C.text, fontSize: 11.5, fontWeight: 900 }}>{title}</div>
        <div style={{ color: C.textMuted, fontSize: 10.5, lineHeight: 1.45, marginTop: 3 }}>{text}</div>
      </div>
    </div>
  );
}

function HeaderStat({ label, value, color }) {
  return (
    <div style={{ ...cardStyle, padding: "10px 14px", minWidth: 132 }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 950, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>{value}</div>
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
