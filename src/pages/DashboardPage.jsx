import { useMemo } from "react";
import AlertBanner from "../components/AlertBanner";
import Icon from "../components/Icon";
import StatCard from "../components/StatCard";
import { C, cardStyle, pageStyle } from "../theme";
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
  const readyCount = activeMiners.filter((miner) => !miner.manual_alert).length;
  const averageTemp = average(activeMiners.map((miner) => miner.temp));

  return (
    <div className="dashboard-page" style={pageStyle}>
      <div className="dashboard-layout page-layout" style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr) auto", gap: 12, height: "100%", minHeight: 0 }}>
        <AlertBanner miners={miners} thresholds={thresholds} dismissedAlertIds={dismissedAlertIds} onDismissAlerts={onDismissAlerts} />

        <section className="dashboard-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
          <StatCard label="Active Miners" value={activeMiners.length} unit={`/${miners.length}`} color={activeMiners.length ? C.green : C.offline} sub={`${readyCount} with SOS clear`} />
          <StatCard label="Average HR" value={formatReading(average(activeMiners.map((miner) => miner.hr)), 0)} unit="bpm" color={C.red} sub="active devices only" />
          <StatCard label="Average SpO2" value={formatReading(average(activeMiners.map((miner) => miner.spo2)), 0)} unit="%" color={C.oxygen} sub={`minimum ${thresholds.spo2Min}%`} />
          <StatCard label="Average Temp" value={formatReading(averageTemp, 1)} unit="°C" color={C.teal} sub="active devices only" />
          <StatCard
            label="Manual SOS"
            value={manualSosValue(activeMiners.length, readyCount)}
            color={manualSosColor(activeMiners.length, readyCount)}
            sub="active SOS miners"
          />
        </section>

        <section className="dashboard-fleet-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12, alignItems: "stretch", minHeight: 0, overflow: "hidden" }}>
          <div className="dashboard-fleet-panel" style={{ ...cardStyle, overflow: "hidden", minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
            <div className="dashboard-fleet-heading">
              <SectionHeading
                title="Miners"
                subtitle="Active miners appear first; each status group stays ordered by device ID."
                meta={`${fleet.length} registered`}
              />
            </div>
            <div className="dashboard-fleet-scroll table-scroll-x hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
              <div className="fleet-table-head dashboard-fleet-column-head">
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
            </div>
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
  const sos = Boolean(miner.manual_alert);
  const worst = worstStatus(alerts);
  const worstColor = worstColorFor(worst, online);
  const trend = analyzeSpo2Trend(series?.spo2);

  return (
    <article className="fleet-status-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{miner.name}</div>
        <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id} · {miner.location || "Unassigned"}</div>
      </div>
      <StatusPill color={online ? C.green : C.offline} label={fleetConnectionLabel(online, miner.stale)} />
      <div className="fleet-vitals">
        <Reading label="HR" value={online && contact ? `${formatReading(miner.hr, 0)} bpm` : "--"} color={C.red} />
        <Reading label="SpO2" value={online && contact ? `${formatReading(miner.spo2, 0)}%` : "--"} color={C.oxygen} />
        <Reading label="Temp" value={online && miner.temp > 0 ? `${formatReading(miner.temp, 1)}°C` : "--"} color={C.teal} />
      </div>
      <div>
        <div style={{ color: worstColor, fontSize: 11, fontWeight: 900 }}>{sos ? "SOS pressed" : worst}</div>
        <div style={{ color: C.textMuted, fontSize: 10, marginTop: 4 }}>
          {vitalsSummary(online, contact, trend, miner, thresholds)}
        </div>
      </div>
      <div style={{ color: C.textMuted, fontSize: 10, lineHeight: 1.4 }}>{formatLastSeen(miner.lastSeen)}</div>
    </article>
  );
}

function manualSosValue(activeCount, readyCount) {
  if (!activeCount) return "--";
  return readyCount === activeCount ? "Clear" : String(activeCount - readyCount);
}

function worstStatus(alerts) {
  if (alerts.some((alert) => alert.severity === "critical")) return "Critical";
  return alerts.length ? "Warning" : "Clear";
}

function fleetConnectionLabel(online, stale) {
  if (online) return "Online";
  return stale ? "Stale" : "Offline";
}

function manualSosColor(activeCount, readyCount) {
  if (!activeCount) return C.offline;
  return readyCount === activeCount ? C.green : C.red;
}

function worstColorFor(worst, online) {
  if (worst === "Critical") return C.red;
  if (worst === "Warning") return C.amber;
  return online ? C.green : C.offline;
}

function vitalsSummary(online, contact, trend, miner, thresholds) {
  if (!online) return "Signals unavailable";
  if (!contact) return "Contact missing";
  if (trend.declining) return "SpO2 trending down";
  return getVitalStatus(miner.spo2, "spo2", thresholds) === "NORMAL" ? "Sensors reporting" : "Review vitals";
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
    <div className="dashboard-insight-card" style={{ ...cardStyle, padding: 15, display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) auto", alignItems: "center", gap: 12, borderTop: `2px solid ${color}` }}>
      <div style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 8, background: `${color}12`, border: `1px solid ${color}28` }}>
        <Icon name={icon} size={16} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900 }}>{title}</div>
        <div style={{ color: C.textMuted, fontSize: 10.5, marginTop: 3, lineHeight: 1.4 }}>{text}</div>
      </div>
      <div className="dashboard-insight-value" style={{ color, fontSize: 24, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{value}</div>
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

function StatusPill({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content", color, border: `1px solid ${color}40`, background: `${color}12`, borderRadius: 999, padding: "5px 8px", fontSize: 9.5, fontWeight: 900 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
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

