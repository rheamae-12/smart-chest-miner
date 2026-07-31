import { useMemo } from "react";
import AlertBanner from "../components/AlertBanner";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { C, cardStyle, moduleLabel, pageStyle } from "../theme";
import { buildAlerts, getVitalStatus } from "../utils/alertChecker";
import { analyzeSpo2Trend } from "../utils/anomalyDetection";
import { average, formatLastSeen, formatReading } from "../utils/formatters";
import { sortMinersActiveFirst } from "../utils/minerOrdering";

// Fleet-level situational awareness. Single-miner investigation belongs in Command Center.
export default function DashboardPage({
  miners = [],
  liveData = {},
  thresholds,
  dismissedAlertIds = [],
  onDismissAlerts,
}) {
  const fleet = useMemo(
    () => sortMinersActiveFirst(miners),
    [miners],
  );
  const alerts = useMemo(() => buildAlerts(miners, thresholds), [miners, thresholds]);
  const visibleAlerts = alerts.filter((alert) => !dismissedAlertIds.includes(alert.id));
  const activeMiners = miners.filter((miner) => miner.active && !miner.stale);
  const readyCount = activeMiners.filter((miner) => !(miner.button_pressed || miner.manual_alert)).length;
  const sosCompliance = activeMiners.length ? Math.round((readyCount / activeMiners.length) * 100) : 0;
  const averageTemp = average(activeMiners.map((miner) => miner.temp));

  return (
    <div className="dashboard-page" style={pageStyle}>
      <div style={{ display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr) auto", gap: 12, height: "100%", minHeight: 0 }}>
        <PageHeader
          label="Fleet monitoring"
          title="Operations Dashboard"
          titleSize={22}
          subtitle="Fleet availability, live averages, Manual SOS compliance, and conditions needing attention."
          padding="13px 16px"
          right={
            <>
              <HeaderPill label={`${activeMiners.length}/${miners.length} active`} color={activeMiners.length ? C.green : C.offline} />
              <HeaderPill
                label={activeMiners.length ? `${sosCompliance}% SOS clear` : "SOS unavailable"}
                color={activeMiners.length ? (sosCompliance === 100 ? C.green : C.red) : C.offline}
              />
            </>
          }
        />

        <AlertBanner miners={miners} thresholds={thresholds} dismissedAlertIds={dismissedAlertIds} onDismissAlerts={onDismissAlerts} />

        <section className="dashboard-stats" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
          <StatCard label="Active Miners" value={activeMiners.length} unit={`/${miners.length}`} color={activeMiners.length ? C.green : C.offline} sub={`${readyCount} with SOS clear`} />
          <StatCard label="Average HR" value={formatReading(average(activeMiners.map((miner) => miner.hr)), 0)} unit="bpm" color={C.red} sub="active devices only" />
          <StatCard label="Average SpO2" value={formatReading(average(activeMiners.map((miner) => miner.spo2)), 0)} unit="%" color={C.oxygen} sub={`minimum ${thresholds.spo2Min}%`} />
          <StatCard label="Average Temp" value={formatReading(averageTemp, 1)} unit="°C" color={C.teal} sub="active devices only" />
          <StatCard
            label="Manual SOS"
            value={activeMiners.length ? (readyCount === activeMiners.length ? "Clear" : activeMiners.length - readyCount) : "--"}
            color={activeMiners.length ? (readyCount === activeMiners.length ? C.green : C.red) : C.offline}
            sub="only compliance measure"
          />
          <StatCard label="Open Conditions" value={visibleAlerts.length || "Clear"} color={visibleAlerts.length ? C.amber : C.green} sub="requires operator review" />
        </section>

        <section className="dashboard-fleet-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.15fr) minmax(280px, 0.85fr)", gap: 12, alignItems: "stretch", minHeight: 0, overflow: "hidden" }}>
          <div className="hide-scrollbar" style={{ ...cardStyle, overflow: "auto", minHeight: 0 }}>
            <SectionHeading
              title="Fleet deployment"
              subtitle="Active miners appear first; each status group stays ordered by device ID."
              meta={`${fleet.length} registered`}
            />
            <div className="fleet-table-head">
              <span>Miner</span><span>Connection</span><span>Live vitals</span><span>Safety</span><span>Last seen</span>
            </div>
            <div>
              {fleet.length ? fleet.map((miner) => (
                <FleetStatusRow
                  key={miner.id}
                  miner={miner}
                  thresholds={thresholds}
                  alerts={alerts.filter((alert) => alert.deviceId === miner.id)}
                  series={liveData[miner.id]}
                />
              )) : (
                <EmptyState title="No miners registered" text="Register a device to begin fleet monitoring." />
              )}
            </div>
            <div className="fleet-interpretation" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, padding: 10, borderTop: `1px solid ${C.borderSoft}`, background: "rgba(255,255,255,0.012)" }}>
              <FleetNote title="Active averages" text="Offline devices are excluded from fleet averages." />
              <FleetNote title="Safe placeholders" text="Stale readings are replaced with dashes, not old values." />
              <FleetNote title="Priority roster" text="Active miners stay above offline devices, then sort by device ID." />
            </div>
          </div>

          <div className="hide-scrollbar" style={{ display: "grid", gap: 12, alignContent: "start", minHeight: 0, overflow: "auto" }}>
            <ReadinessCard
              compliance={sosCompliance}
              readyCount={readyCount}
              online={activeMiners.length}
              total={miners.length}
              alerts={visibleAlerts.length}
            />
            <PriorityQueue alerts={visibleAlerts} miners={miners} />
          </div>
        </section>

        <section className="dashboard-insight-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <InsightCard
            icon="siren"
            color={readyCount === activeMiners.length && activeMiners.length ? C.green : C.red}
            title="SOS compliance"
            value={activeMiners.length ? `${readyCount}/${activeMiners.length}` : "--"}
            text={activeMiners.length ? "Manual SOS is the only miner compliance measure." : "No active miners are reporting."}
          />
          <InsightCard
            icon="pulse"
            color={visibleAlerts.length ? C.red : C.green}
            title="Clinical attention"
            value={visibleAlerts.length || "Clear"}
            text={visibleAlerts.length ? "Open live conditions are listed in the priority queue." : "No live threshold conditions detected."}
          />
          <InsightCard
            icon="wifi"
            color={activeMiners.length === miners.length && miners.length ? C.green : C.offline}
            title="Connectivity coverage"
            value={miners.length ? `${Math.round((activeMiners.length / miners.length) * 100)}%` : "--"}
            text={`${Math.max(0, miners.length - activeMiners.length)} device${miners.length - activeMiners.length === 1 ? "" : "s"} currently offline.`}
          />
        </section>
      </div>
    </div>
  );
}

function FleetStatusRow({ miner, thresholds, alerts, series }) {
  const online = Boolean(miner.active && !miner.stale);
  const contact = online && miner.finger !== false;
  const sos = Boolean(miner.button_pressed || miner.manual_alert);
  const worst = alerts.some((alert) => alert.severity === "critical") ? "Critical" : alerts.length ? "Warning" : "Clear";
  const worstColor = worst === "Critical" ? C.red : worst === "Warning" ? C.amber : online ? C.green : C.offline;
  const trend = analyzeSpo2Trend(series?.spo2);

  return (
    <article className="fleet-status-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{miner.name}</div>
        <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id} · {miner.location || "Unassigned"}</div>
      </div>
      <StatusPill color={online ? C.green : C.offline} label={online ? "Online" : miner.stale ? "Stale" : "Offline"} />
      <div className="fleet-vitals">
        <Reading label="HR" value={online && contact ? `${formatReading(miner.hr, 0)} bpm` : "--"} color={C.red} />
        <Reading label="SpO2" value={online && contact ? `${formatReading(miner.spo2, 0)}%` : "--"} color={C.oxygen} />
        <Reading label="Temp" value={online && miner.temp > 0 ? `${formatReading(miner.temp, 1)}°C` : "--"} color={C.teal} />
      </div>
      <div>
        <div style={{ color: worstColor, fontSize: 11, fontWeight: 900 }}>{sos ? "SOS pressed" : worst}</div>
        <div style={{ color: C.textMuted, fontSize: 10, marginTop: 4 }}>
          {!online ? "Signals unavailable" : !contact ? "Contact missing" : trend.declining ? "SpO2 trending down" : getVitalStatus(miner.spo2, "spo2", thresholds) === "NORMAL" ? "Sensors reporting" : "Review vitals"}
        </div>
      </div>
      <div style={{ color: C.textMuted, fontSize: 10, lineHeight: 1.4 }}>{formatLastSeen(miner.lastSeen)}</div>
    </article>
  );
}

function ReadinessCard({ compliance, readyCount, total, online, alerts }) {
  const color = !online ? C.offline : compliance === 100 ? C.green : compliance >= 50 ? C.amber : C.red;
  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={moduleLabel}>Manual SOS compliance</div>
      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12, marginTop: 10 }}>
        <div style={{ color, fontSize: 38, lineHeight: 1, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{online ? `${compliance}%` : "--"}</div>
        <div style={{ color: C.textMuted, fontSize: 11 }}>{readyCount}/{online} clear</div>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: C.borderSoft, overflow: "hidden", margin: "13px 0 16px" }}>
        <div style={{ width: `${compliance}%`, height: "100%", background: color, borderRadius: 999, transition: "width 180ms ease" }} />
      </div>
      <MetricLine label="Connected" value={`${online}/${total}`} color={online === total && total ? C.green : C.offline} />
      <MetricLine label="Manual SOS clear" value={`${readyCount}/${online || 0}`} color={readyCount === online && online ? C.green : C.red} />
      <MetricLine label="Open conditions" value={alerts} color={alerts ? C.red : C.green} />
    </div>
  );
}

function PriorityQueue({ alerts, miners }) {
  const queue = alerts.slice(0, 4);
  return (
    <div style={{ ...cardStyle, overflow: "hidden" }}>
      <SectionHeading title="Priority queue" subtitle="Highest urgency live conditions." meta={`${alerts.length} open`} compact />
      <div style={{ padding: 10, display: "grid", gap: 7 }}>
        {queue.length ? queue.map((alert) => {
          const miner = miners.find((item) => item.id === alert.deviceId);
          const color = alert.severity === "critical" ? C.red : C.amber;
          return (
            <div key={alert.id} style={{ border: `1px solid ${C.borderSoft}`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "9px 10px", background: `${color}08` }}>
              <div style={{ color, fontSize: 10, fontWeight: 950, textTransform: "uppercase" }}>{alert.message}</div>
              <div style={{ color: C.textDim, fontSize: 11, marginTop: 4 }}>{miner?.name || alert.deviceId}</div>
            </div>
          );
        }) : (
          <EmptyState title="Queue clear" text="No live conditions require operator action." compact />
        )}
      </div>
    </div>
  );
}

function SectionHeading({ title, subtitle, meta, compact = false }) {
  return (
    <div style={{ padding: compact ? "12px 14px" : "13px 15px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "start", justifyContent: "space-between", gap: 14 }}>
      <div>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{title}</div>
        <div style={{ color: C.textMuted, fontSize: 10.5, marginTop: 3, lineHeight: 1.4 }}>{subtitle}</div>
      </div>
      <span style={{ color: C.textMuted, fontSize: 10, whiteSpace: "nowrap" }}>{meta}</span>
    </div>
  );
}

function InsightCard({ icon, color, title, value, text }) {
  return (
    <div style={{ ...cardStyle, padding: 15, display: "grid", gridTemplateColumns: "34px 1fr auto", alignItems: "center", gap: 12, borderTop: `2px solid ${color}` }}>
      <div style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 8, background: `${color}12`, border: `1px solid ${color}28` }}>
        <Icon name={icon} size={16} color={color} />
      </div>
      <div>
        <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900 }}>{title}</div>
        <div style={{ color: C.textMuted, fontSize: 10.5, marginTop: 3, lineHeight: 1.4 }}>{text}</div>
      </div>
      <div style={{ color, fontSize: 24, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function Reading({ label, value, color }) {
  return (
    <span>
      <span style={{ color: C.textMuted, fontSize: 9, textTransform: "uppercase" }}>{label}</span>
      <strong style={{ display: "block", color, fontSize: 11, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</strong>
    </span>
  );
}

function FleetNote({ title, text }) {
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: "9px 10px" }}>
      <div style={{ color: C.text, fontSize: 10.5, fontWeight: 900 }}>{title}</div>
      <div style={{ color: C.textMuted, fontSize: 9.5, lineHeight: 1.4, marginTop: 3 }}>{text}</div>
    </div>
  );
}

function StatusPill({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content", color, border: `1px solid ${color}40`, background: `${color}12`, borderRadius: 999, padding: "5px 8px", fontSize: 9.5, fontWeight: 900 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function MetricLine({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: `1px solid ${C.borderSoft}` }}>
      <span style={{ color: C.textMuted, fontSize: 11 }}>{label}</span>
      <strong style={{ color, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{value}</strong>
    </div>
  );
}

function EmptyState({ title, text, compact = false }) {
  return (
    <div style={{ padding: compact ? 14 : 28, textAlign: "center" }}>
      <div style={{ color: C.green, fontSize: 12, fontWeight: 900 }}>{title}</div>
      <div style={{ color: C.textMuted, fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

function HeaderPill({ label, color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color, border: `1px solid ${color}45`, background: `${color}12`, borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} />
      {label}
    </span>
  );
}
