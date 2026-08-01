import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Icon from "../components/Icon";
import { C, cardStyle, controlStyle, moduleLabel, pageStyle } from "../theme";
import { buildAlerts, getVitalStatus } from "../utils/alertChecker";
import { dedupeConsecutiveLogs, formatLastSeen, formatReading, formatSystemTimestamp, uniqueChartLabels } from "../utils/formatters";
import { sortMinersActiveFirst } from "../utils/minerOrdering";
import { mergeSensorSeries } from "../utils/sensorSeries";

const TABS = [
  { key: "overview", label: "Overview", icon: "pulse" },
  { key: "logs", label: "Activity", icon: "clock" },
  { key: "signal", label: "Signal", icon: "contact" },
];

// CommandCenterPage — master/detail operations cockpit. Left rail lists the fleet;
// the right panel shows the selected miner's live vitals, trend, and detail tabs.
export default function CommandCenterPage({ miners = [], liveData = {}, activityLogs = [], thresholds, dismissedAlertIds = [], onDismissAlerts }) {
  const sorted = useMemo(
    // Keep the fleet rail stable while live status changes. Reordering an operator's
    // click target is both visually jarring and error-prone.
    () => sortMinersActiveFirst(miners),
    [miners],
  );
  const [search, setSearch] = useState("");
  const [connectionFilter, setConnectionFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(() => sorted.find((miner) => miner.active && !miner.stale)?.id || sorted[0]?.id || "");
  const [tab, setTab] = useState("overview");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((m) => {
      const matchesSearch = !q || `${m.name} ${m.id} ${m.location}`.toLowerCase().includes(q);
      const online = m.active && !m.stale;
      const matchesConnection = connectionFilter === "all"
        || (connectionFilter === "online" ? online : !online);
      return matchesSearch && matchesConnection;
    });
  }, [sorted, search, connectionFilter]);

  const selectedMiner = sorted.find((miner) => miner.id === selectedId);
  const onlineMiner = sorted.find((miner) => miner.active && !miner.stale);
  // Entering the live monitor immediately shows the first online device. Keep
  // an operator's explicit selection stable, including when it is offline.
  const effectiveSelectedId = !selectedMiner
    ? onlineMiner?.id || sorted[0]?.id || ""
    : selectedId;
  const selected = sorted.find((miner) => miner.id === effectiveSelectedId) || null;
  const alerts = useMemo(() => buildAlerts(miners, thresholds), [miners, thresholds]);
  const minerAlerts = selected ? alerts.filter((a) => a.deviceId === selected.id && !dismissedAlertIds.includes(a.id)) : [];

  const online = miners.filter((miner) => miner.active && !miner.stale).length;
  const alerting = new Set(alerts.map((a) => a.deviceId)).size;

  return (
    <div style={{ ...pageStyle, padding: "14px 16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 12, alignItems: "stretch", height: "100%", minHeight: 0, overflow: "hidden" }} className="cc-grid page-layout">

        {/* ── Fleet rail (master) ── */}
        <aside className="cc-fleet-column">
          <div className="cc-miners-card" style={{ ...cardStyle, display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", minHeight: 0, overflow: "hidden" }}>
          <div className="cc-miners-header" style={{ padding: "13px 14px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={moduleLabel}>Miners</div>
              <div style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ color: C.text, fontSize: 19, fontWeight: 950 }}>{online}<span style={{ color: C.textMuted, fontSize: 13 }}>/{miners.length}</span></span>
                <span style={{ color: C.textMuted, fontSize: 11 }}>online</span>
                {alerting > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.red, fontSize: 11, fontWeight: 900 }}>
                    <Icon name="alert" size={12} color={C.red} /> {alerting}
                  </span>
                )}
              </div>
            </div>
            <div className="cc-miner-connection-filter" role="group" aria-label="Filter miners by connection status">
              {["all", "online", "offline"].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={connectionFilter === filter ? "is-active" : ""}
                  onClick={() => setConnectionFilter(filter)}
                >
                  {filter[0].toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: "6px 8px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center" }}>
            <input
              placeholder="Search miners"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...controlStyle, width: "100%", margin: 0, boxSizing: "border-box", padding: "4px 9px", fontSize: 11.5 }}
            />
          </div>
          <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0, padding: 8 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: C.textMuted, fontSize: 12 }}>No miners match.</div>
            ) : (
              filtered.map((m) => (
                <FleetRow
                  key={m.id}
                  miner={m}
                  thresholds={thresholds}
                  active={selected?.id === m.id}
                  hasAlert={alerts.some((a) => a.deviceId === m.id)}
                  onSelect={() => setSelectedId(m.id)}
                />
              ))
            )}
          </div>
          </div>
          <div className="cc-alert-card" style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
            <div style={{ padding: "11px 13px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={moduleLabel}>Alerts</div>
              <button
                type="button"
                onClick={() => onDismissAlerts?.(minerAlerts.map((alert) => alert.id))}
                disabled={!minerAlerts.length}
                style={{ background: "transparent", border: `1px solid ${minerAlerts.length ? C.amber : C.borderSoft}55`, borderRadius: 6, color: minerAlerts.length ? C.amber : C.textMuted, cursor: minerAlerts.length ? "pointer" : "default", fontSize: 10, fontWeight: 900, padding: "4px 7px", opacity: minerAlerts.length ? 1 : 0.7 }}
              >
                {minerAlerts.length ? "Clear" : "Clear"}
              </button>
            </div>
            <div className="cc-rail-alert-stack">
          {minerAlerts.length > 0 && (
            <>
              {minerAlerts.map((a) => (
                <div key={a.id} style={{ ...cardStyle, padding: "10px 12px", display: "flex", alignItems: "center", gap: 9, borderLeft: `3px solid ${a.severity === "critical" ? C.red : C.amber}`, background: `${a.severity === "critical" ? C.red : C.amber}0E` }}>
                  <Icon name="alert" size={14} color={a.severity === "critical" ? C.red : C.amber} />
                  <span style={{ color: a.severity === "critical" ? C.red : C.amber, fontSize: 11, fontWeight: 900, flex: 1 }}>{a.message}</span>
                  <button onClick={() => onDismissAlerts?.([a.id])} style={{ background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 16, lineHeight: 1 }} title="Dismiss">×</button>
                </div>
              ))}
            </>
          )}
          {!minerAlerts.length && (
            <div className="cc-alert-empty">
              <Icon name="check" size={16} color={C.green} />
              <span>No active alerts</span>
              <small>Miner conditions are within the current monitoring rules.</small>
            </div>
          )}
            </div>
          </div>
        </aside>

        {/* ── Detail ── */}
        <aside className="cc-legacy-miner-fragment" style={{ display: "none" }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <input
              placeholder="Search miners…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...controlStyle, width: "100%", padding: "8px 11px", fontSize: 12 }}
            />
          </div>
          <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0, padding: 8 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: C.textMuted, fontSize: 12 }}>No miners match.</div>
            ) : (
              filtered.map((m) => (
                <FleetRow
                  key={m.id}
                  miner={m}
                  thresholds={thresholds}
                  active={selected?.id === m.id}
                  hasAlert={alerts.some((a) => a.deviceId === m.id)}
                  onSelect={() => setSelectedId(m.id)}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── Detail ── */}
        <section style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 12, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          {!selected ? (
            <div style={{ ...cardStyle, display: "grid", placeItems: "center", padding: 40, color: C.textMuted, fontSize: 13 }}>
              {miners.length ? "Select a miner from the list to view live monitoring." : "No miners registered yet."}
            </div>
          ) : (
            <>
              <div className="cc-live-detail-header">
                <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                <MinerHeader miner={selected} />
                <VitalsRow miner={selected} thresholds={thresholds} />
                </div>

                {minerAlerts.length > 0 && (
                  <div className="cc-detail-alert-stack">
                    {minerAlerts.map((a) => (
                      <div key={a.id} style={{ ...cardStyle, padding: "9px 13px", display: "flex", alignItems: "center", gap: 10, borderLeft: `3px solid ${a.severity === "critical" ? C.red : C.amber}`, background: `${a.severity === "critical" ? C.red : C.amber}0E` }}>
                        <Icon name="alert" size={14} color={a.severity === "critical" ? C.red : C.amber} />
                        <span style={{ color: a.severity === "critical" ? C.red : C.amber, fontSize: 12, fontWeight: 900, flex: 1 }}>{a.message}</span>
                        <button onClick={() => onDismissAlerts?.([a.id])} style={{ background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 16, lineHeight: 1 }} title="Dismiss">×</button>
                      </div>
                    ))}
                  </div>
                )}

              </div>

              <div style={{ ...cardStyle, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", gap: 4, padding: "10px 12px", borderBottom: `1px solid ${C.borderSoft}` }}>
                  {TABS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 7,
                        padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 900,
                        cursor: "pointer",
                        border: `1px solid ${tab === t.key ? `${C.primary}55` : "transparent"}`,
                        background: tab === t.key ? `${C.primary}12` : "transparent",
                        color: tab === t.key ? C.primary : C.textMuted,
                      }}
                    >
                      <Icon name={t.icon} size={14} />
                      {t.label}
                    </button>
                  ))}
                </div>
                <div
                  className={`hide-scrollbar cc-tab-content cc-tab-${tab}`}
                  style={{ padding: 14, minHeight: 0, overflow: tab === "overview" ? "hidden" : "auto" }}
                >
                  {tab === "overview" && <OverviewTab miner={selected} liveData={liveData} thresholds={thresholds} />}
                  {tab === "logs" && <ActivityTab miner={selected} activityLogs={activityLogs} />}
                  {tab === "signal" && <SignalTab miner={selected} />}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Fleet rail row ─────────────────────────────────────────────────────────

function FleetRow({ miner, active, hasAlert, onSelect }) {
  const dot = !miner.active ? C.offline : hasAlert ? C.red : C.green;
  return (
    <button
      onClick={onSelect}
      className="cc-fleet-row"
      style={{
        width: "100%", textAlign: "left", cursor: "pointer",
        display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 10,
        padding: "9px 11px", marginBottom: 4, borderRadius: 9,
        border: `1px solid ${active ? `${C.primary}45` : "transparent"}`,
        background: active ? "linear-gradient(90deg, rgba(255,106,0,0.14), rgba(255,106,0,0.03))" : "transparent",
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot, boxShadow: miner.active ? `0 0 8px ${dot}` : "none", flexShrink: 0 }} className={hasAlert && miner.active ? "dot-live" : undefined} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: active ? C.text : C.textDim, fontSize: 12.5, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{miner.name}</span>
        <span style={{ display: "block", color: C.textMuted, fontSize: 10, marginTop: 1 }}>{miner.id} · {miner.location}</span>
      </span>
      <span style={{ textAlign: "right", flexShrink: 0 }}>
        {miner.active ? (
          <>
            <span style={{ display: "block", color: C.oxygen, fontSize: 12, fontWeight: 900 }}>{formatReading(miner.spo2, 0)}%</span>
            <span style={{ display: "block", color: C.textMuted, fontSize: 10 }}>{formatReading(miner.hr, 0)} bpm</span>
          </>
        ) : (
          <span style={{ color: C.offline, fontSize: 10, fontWeight: 900 }}>OFFLINE</span>
        )}
      </span>
    </button>
  );
}

// ─── Detail: header ─────────────────────────────────────────────────────────

function MinerHeader({ miner }) {
  const online = miner.active && !miner.stale;
  const color = online ? C.green : C.offline;
  return (
    <div style={{ ...cardStyle, padding: "13px 16px", display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
      <div style={{ width: 3, alignSelf: "stretch", minHeight: 34, borderRadius: 3, background: C.primaryGradient, boxShadow: "0 0 14px rgba(255,106,0,0.4)", flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={moduleLabel}>{miner.id} · {miner.location || "Unassigned"}</div>
        <div style={{ color: C.text, fontSize: 22, fontWeight: 950, marginTop: 2, lineHeight: 1.1 }}>{miner.name}</div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color, border: `1px solid ${color}45`, background: `${color}12`, borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 900 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} className={online ? "dot-live" : undefined} />
          {online ? "Online" : miner.stale ? "Stale signal" : "Offline"}
        </span>
        <span style={{ color: C.textMuted, fontSize: 11 }}>Last seen {formatLastSeen(miner.lastSeen)}</span>
      </div>
    </div>
  );
}

// ─── Detail: vitals row ─────────────────────────────────────────────────────

function VitalsRow({ miner, thresholds }) {
  const live = miner.active && miner.finger !== false;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }} className="cc-vitals">
      <VitalTile label="Heart Rate" icon="heart" value={live ? formatReading(miner.hr, 0) : "--"} unit="bpm" color={C.red} status={live ? getVitalStatus(miner.hr, "hr", thresholds) : "OFFLINE"} />
      <VitalTile label="SpO2" icon="droplet" value={live ? formatReading(miner.spo2, 0) : "--"} unit="%" color={C.oxygen} status={live ? getVitalStatus(miner.spo2, "spo2", thresholds) : "OFFLINE"} />
      <VitalTile label="Temperature" icon="thermometer" value={live ? formatReading(miner.temp, 1) : "--"} unit="°C" color={C.teal} status={live ? getVitalStatus(miner.temp, "temp", thresholds) : "OFFLINE"} />
      <VitalTile label="Chest Contact" icon="contact" value={miner.active ? (miner.finger === false ? "No" : "Yes") : "--"} color={!miner.active ? C.offline : miner.finger === false ? C.amber : C.green} status={!miner.active ? "OFFLINE" : miner.finger === false ? "WARNING" : "NORMAL"} />
      <VitalTile label="Manual SOS" icon="siren" value={miner.active ? (miner.manual_alert ? "Pressed" : "Clear") : "--"} color={!miner.active ? C.offline : miner.manual_alert ? C.red : C.green} status={!miner.active ? "OFFLINE" : miner.manual_alert ? "PRESSED" : "NORMAL"} />
    </div>
  );
}

function VitalTile({ label, value, unit, color, status, icon }) {
  const statusColor = status === "NORMAL" ? C.green : status === "OFFLINE" ? C.offline : status === "CRITICAL" || status === "HIGH" ? C.red : C.amber;
  return (
    <div className="card-shimmer" style={{ ...cardStyle, padding: 13, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon && <Icon name={icon} size={13} color={color} />}
        <span style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ color, fontSize: 26, fontWeight: 950, marginTop: 8, lineHeight: 1 }}>
        {value}{unit && <span style={{ color: C.textMuted, fontSize: 11, marginLeft: 4 }}>{unit}</span>}
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, color: statusColor, fontSize: 9, fontWeight: 900, marginTop: 8, background: `${statusColor}14`, border: `1px solid ${statusColor}30`, borderRadius: 999, padding: "3px 8px" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
        {status || "NO DATA"}
      </div>
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

function OverviewTab({ miner, liveData, thresholds }) {
  const chartData = useMemo(() => {
    const rows = mergeSensorSeries(liveData[miner.id]);
    const labels = uniqueChartLabels(rows);
    return rows.map((row, index) => ({ ...row, time: labels[index] || row.time }));
  }, [liveData, miner.id]);
  const live = miner.active && miner.finger !== false;
  const hasData = live && chartData.some((d) => d.hr != null || d.spo2 != null || d.temp != null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 260px", gap: 14, alignItems: "stretch", height: "100%", minHeight: 0 }} className="cc-overview">
      <div className="cc-overview-readings" style={{ minWidth: 0, minHeight: 0 }}>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 950, marginBottom: 10 }}>Live Readings</div>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 22, left: 4, bottom: 26 }}>
              <CartesianGrid stroke={C.borderSoft} strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: C.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={34} height={34} label={{ value: "Time", fill: C.textMuted, fontSize: 9, position: "insideBottom", offset: -5 }} />
              <YAxis yAxisId="hr" domain={[40, 140]} tick={{ fill: C.red, fontSize: 10 }} axisLine={false} tickLine={false} width={42} label={{ value: "bpm", angle: -90, fill: C.red, fontSize: 10, position: "insideLeft" }} />
              <YAxis yAxisId="spo2" orientation="right" domain={[80, 100]} tick={{ fill: C.oxygen, fontSize: 10 }} axisLine={false} tickLine={false} width={38} label={{ value: "%", angle: 90, fill: C.oxygen, fontSize: 10, position: "insideRight" }} />
              <YAxis yAxisId="temp" orientation="right" domain={[34, 42]} hide />
              <Tooltip
                allowEscapeViewBox={{ x: false, y: false }}
                wrapperStyle={{ maxWidth: "calc(100% - 12px)", zIndex: 5 }}
                contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }}
              />
              <ReferenceLine yAxisId="spo2" y={thresholds?.spo2Min ?? 80} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.5} />
              <Line yAxisId="hr" type="monotone" dataKey="hr" name="HR" stroke={C.red} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              <Line yAxisId="spo2" type="monotone" dataKey="spo2" name="SpO2" stroke={C.oxygen} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temperature" stroke={C.teal} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="cc-overview-empty" style={{ display: "grid", placeItems: "center", border: `1px dashed ${C.border}`, borderRadius: 10, color: C.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>
            <div>
              <Icon name={miner.active ? "pulse" : "wifi"} size={24} color={miner.active ? C.amber : C.offline} />
              <div style={{ color: miner.active ? C.amber : C.offline, fontWeight: 900, marginTop: 10 }}>{miner.active ? "Waiting for valid readings" : "Device offline"}</div>
              <div style={{ marginTop: 6, maxWidth: 360, lineHeight: 1.5 }}>{miner.active ? "Verify chest contact and allow the sensors a moment to stabilize." : `Last contact ${formatLastSeen(miner.lastSeen)}. Live charts resume automatically when the device reconnects.`}</div>
            </div>
          </div>
        )}
      </div>
      <div className="cc-overview-status" style={{ ...cardStyle, padding: "8px 12px", display: "grid", gridTemplateRows: "auto repeat(4, minmax(0, 1fr))", gap: 0, minHeight: 0, height: "100%", alignSelf: "stretch", boxSizing: "border-box" }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 950, marginBottom: 2 }}>Status</div>
        <Indicator
          color={miner.active ? C.green : C.offline}
          label={miner.active ? "Readings online" : "Readings offline"}
          detail={miner.active ? `Last contact ${formatLastSeen(miner.lastSeen)}` : `Last contact ${formatLastSeen(miner.lastSeen)}`}
        />
        <Indicator
          color={!miner.active ? C.offline : miner.finger === false ? C.amber : C.green}
          label={!miner.active ? "Chest contact offline" : miner.finger === false ? "Chest contact missing" : "Chest contact normal"}
          detail={!miner.active ? "Waiting for the device to reconnect" : miner.finger === false ? "Re-seat the chest strap to restore readings" : "Sensor contact is stable"}
        />
        <Indicator
          color={!miner.active ? C.offline : miner.manual_alert ? C.red : C.green}
          label={!miner.active ? "Manual SOS offline" : miner.manual_alert ? "Manual SOS pressed" : "Manual SOS clear"}
          detail={miner.active ? "Current latched SOS state" : "SOS state unavailable while offline"}
        />
        <Indicator
          color={!miner.active ? C.offline : miner.temp > 0 ? C.teal : C.amber}
              label={!miner.active ? "Temperature offline" : miner.temp > 0 ? `Temperature ${formatReading(miner.temp, 1)}°C` : "Temperature waiting"}
          detail={!miner.active ? "No current temperature signal" : miner.temp > 0 ? "Within the live sensor stream" : "Waiting for a valid temperature"}
        />
      </div>
    </div>
  );
}

function ActivityTab({ miner, activityLogs }) {
  const logs = useMemo(
    () => dedupeConsecutiveLogs(activityLogs.filter((l) => l.deviceId === miner.id).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))).slice(0, 40),
    [activityLogs, miner.id],
  );
  if (logs.length === 0) {
    return <div style={{ padding: 28, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No recorded activity for {miner.name} yet.</div>;
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {logs.map((log) => {
        const color = log.severity === "critical" ? C.red : log.severity === "warning" ? C.amber : log.status === "online" ? C.green : C.textMuted;
        return (
          <div key={log.id} style={{ border: `1px solid ${C.borderSoft}`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "10px 13px", background: "rgba(255,255,255,0.02)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
              <span style={{ color: C.text, fontSize: 12.5, fontWeight: 900 }}>{log.title}</span>
              <span style={{ color, fontSize: 9, fontWeight: 900, textTransform: "uppercase", border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>{log.severity || log.status || "info"}</span>
            </div>
            {log.detail && <div style={{ color: C.textMuted, fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>{log.detail}</div>}
            <div style={{ color: C.textMuted, fontSize: 10, marginTop: 6 }}>{formatSystemTimestamp(log.timestamp)}</div>
          </div>
        );
      })}
    </div>
  );
}

function SignalTab({ miner }) {
  const rows = [
    { label: "Connection", value: miner.active && !miner.stale ? "Live stream active" : miner.stale ? "Stale — no recent data" : "Offline", good: miner.active && !miner.stale },
    { label: "Chest contact", value: miner.finger === false ? "Not detected" : miner.active ? "Detected" : "—", good: miner.active && miner.finger !== false },
    { label: "Heart-rate sensor", value: miner.active ? (miner.hr > 0 ? "Reporting" : "No reading") : "—", good: miner.active && miner.hr > 0 },
    { label: "SpO2 sensor", value: miner.active ? (miner.spo2 > 0 ? "Reporting" : "No reading") : "—", good: miner.active && miner.spo2 > 0 },
    { label: "Body-temp sensor", value: miner.active ? (miner.temp > 0 ? "Reporting" : "No reading") : "—", good: miner.active && miner.temp > 0 },
    { label: "Last reading", value: formatLastSeen(miner.lastSeen), good: miner.active },
  ];
  const healthy = rows.filter((row) => row.good).length;
  const score = Math.round((healthy / rows.length) * 100);
  return (
    <div className="cc-signal-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(250px, 0.75fr)", gap: 14, alignItems: "stretch", height: "100%", minHeight: 0 }}>
      <div className="cc-signal-list" style={{ display: "grid", gap: 8, minHeight: 0 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 14px", border: `1px solid ${C.borderSoft}`, borderRadius: 9, background: "rgba(255,255,255,0.02)" }}>
            <span style={{ color: C.textMuted, fontSize: 12 }}>{r.label}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: r.good ? C.green : C.amber, fontSize: 12, fontWeight: 900, textAlign: "right" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: r.good ? C.green : C.amber, flexShrink: 0 }} />
              {r.value}
            </span>
          </div>
        ))}
      </div>
      <div className="cc-signal-readiness" style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 16, background: "rgba(255,255,255,0.02)", minHeight: 0 }}>
        <div style={moduleLabel}>Signal readiness</div>
        <div className="cc-signal-score-row">
          <div style={{ color: score === 100 ? C.green : C.amber, fontSize: 34, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{score}%</div>
          <span>{healthy}/{rows.length} checks healthy</span>
        </div>
        <div className="cc-signal-progress" style={{ height: 6, background: C.borderSoft, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${score}%`, height: "100%", background: score === 100 ? C.green : C.amber }} />
        </div>
        <div className="cc-signal-readiness-copy" style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.6 }}>
          {miner.active
            ? `${healthy} of ${rows.length} signal checks are healthy. Review amber rows before relying on the live readings.`
            : "The last known state is preserved here. Confirm power and queued WiFi settings before restarting the device."}
        </div>
        <div className="cc-signal-readiness-details">
          <div className="cc-signal-readiness-detail">
            <span>Needs review</span>
            <strong>{rows.length - healthy}</strong>
          </div>
          <div className="cc-signal-readiness-detail">
            <span>Connection</span>
            <strong>{miner.active && !miner.stale ? "Online" : miner.stale ? "Stale" : "Offline"}</strong>
          </div>
          <div className="cc-signal-readiness-detail">
            <span>Chest contact</span>
            <strong>{miner.active && miner.finger !== false ? "Detected" : "Missing"}</strong>
          </div>
          <div className="cc-signal-readiness-detail">
            <span>Last reading</span>
            <strong>{formatLastSeen(miner.lastSeen)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function Indicator({ color, label, detail }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "8px minmax(0, 1fr)", alignContent: "center", columnGap: 10, minHeight: 35, padding: "7px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}`, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.textDim, fontSize: 12, fontWeight: 800 }}>{label}</div>
        {detail && <div style={{ color: C.textMuted, fontSize: 10, lineHeight: 1.35, marginTop: 3 }}>{detail}</div>}
      </div>
    </div>
  );
}
