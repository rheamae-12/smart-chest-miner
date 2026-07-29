import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AlertBanner from "../components/AlertBanner";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { C, cardStyle, moduleLabel, pageStyle } from "../theme";
import { buildAlerts, getVitalStatus } from "../utils/alertChecker";
import { analyzeSpo2Trend } from "../utils/anomalyDetection";
import { average, formatLastSeen, formatReading, lastSeenValue } from "../utils/formatters";

// DashboardPage — real-time vitals view: alert banner, stat cards, live chart, and miner list sidebar
export default function DashboardPage({ miners, liveData, thresholds, dismissedAlertIds = [], onDismissAlerts }) {
  const sortedMiners = useMemo(() => [...miners].sort((a, b) => lastSeenValue(b) - lastSeenValue(a) || a.id.localeCompare(b.id)), [miners]);
  const defaultMinerId = sortedMiners.find((item) => item.active)?.id || sortedMiners[0]?.id || "";
  const [selected, setSelected] = useState(defaultMinerId);
  const userSelectedRef = useRef(false);
  const selectedId = miners.some((item) => item.id === selected) ? selected : defaultMinerId;
  const miner = miners.find((item) => item.id === selectedId) || sortedMiners[0];
  const activeMiners = miners.filter((item) => item.active);
  const alerts = buildAlerts(miners, thresholds);
  const chartData = useMemo(() => mergeLiveSeries(liveData[miner?.id] || { hr: [], spo2: [], temp: [] }), [liveData, miner?.id]);
  const spo2Trend = useMemo(() => analyzeSpo2Trend((liveData[miner?.id] || {}).spo2), [liveData, miner?.id]);
  const activeVital = Boolean(miner?.active && miner.finger !== false);
  const contactCount = miners.filter((item) => item.active && item.finger !== false).length;

  useEffect(() => {
    if (!userSelectedRef.current || !miners.some((item) => item.id === selected)) {
      setSelected(defaultMinerId);
      userSelectedRef.current = false;
    }
  }, [defaultMinerId, miners, selected]);

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gridTemplateRows: "auto auto auto minmax(360px, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <PageHeader
          label="Live monitoring"
          title="Real-Time Vitals"
          titleSize={22}
          subtitle="Continuous HR, SpO2, and body-temperature tracking across the active miners."
          padding="13px 16px"
          right={
            <>
              <HeaderPill label={`${activeMiners.length}/${miners.length} active`} color={activeMiners.length ? C.green : C.offline} />
              <HeaderPill label={`${contactCount} chest contact`} color={contactCount ? C.green : C.amber} />
            </>
          }
        />
        <AlertBanner miners={miners} thresholds={thresholds} dismissedAlertIds={dismissedAlertIds} onDismissAlerts={onDismissAlerts} />

        <section className="stagger-1" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
          <StatCard label="Active Miners" value={activeMiners.length} unit={`/${miners.length}`} color={activeMiners.length ? C.green : C.offline} sub={`${contactCount} with chest contact`} />
          <StatCard label="Avg Heart Rate" value={formatReading(average(activeMiners.map((item) => item.hr)), 0)} unit="bpm" color={C.red} sub={`${thresholds.hrMin}-${thresholds.hrMax} normal range`} />
          <StatCard label="Avg SpO2" value={formatReading(average(activeMiners.map((item) => item.spo2)), 0)} unit="%" color={C.primary} sub={`minimum ${thresholds.spo2Min}%`} />
          <StatCard label="Avg Body Temp" value={formatReading(average(activeMiners.map((item) => item.temp)), 1)} unit="°C" color={C.teal} sub={`${thresholds.tempMin}–${thresholds.tempMax}°C normal`} />
          <StatCard label="Warnings" value={alerts.length ? alerts.length : "Clear"} color={alerts.length ? C.amber : C.green} sub="live conditions" />
        </section>

        <section className="stagger-2 cc-grid" style={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", gap: 12, minHeight: 0, overflow: "hidden" }}>
          {/* ── Fleet rail (master, left) ── */}
          <aside style={{ ...cardStyle, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>Miners</div>
              <span style={{ color: C.textMuted, fontSize: 11 }}>{sortedMiners.length} devices</span>
            </div>
            <div className="hide-scrollbar" style={{ display: "grid", gap: 6, overflow: "auto", minHeight: 0, alignContent: "start", padding: 8 }}>
              {sortedMiners.map((item) => {
                const isSelected = selectedId === item.id;
                const statusColor = item.active ? C.green : C.offline;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      userSelectedRef.current = true;
                      setSelected(item.id);
                    }}
                    className={isSelected ? "card-selected" : ""}
                    style={{
                      ...cardStyle,
                      padding: "10px 12px",
                      textAlign: "left",
                      cursor: "pointer",
                      borderColor: isSelected ? C.primary : C.border,
                      borderLeft: `3px solid ${statusColor}`,
                      background: isSelected ? "rgba(255,106,0,0.08)" : cardStyle.background,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.text, fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                        <span style={{ color: C.textMuted, fontSize: 10 }}>{item.id}</span>
                        <span style={{ color: C.red, fontSize: 10, fontWeight: 900 }}>{item.active ? `${formatReading(item.hr, 0)} bpm` : "--"}</span>
                        <span style={{ color: C.primary, fontSize: 10, fontWeight: 900 }}>{item.active ? `${formatReading(item.spo2, 0)}%` : "--"}</span>
                        <span style={{ color: C.teal, fontSize: 10, fontWeight: 900 }}>{item.active && item.temp > 0 ? `${formatReading(item.temp, 1)}°C` : "--"}</span>
                      </div>
                    </div>
                    <span style={{ color: statusColor, fontSize: 9, fontWeight: 900, letterSpacing: "0.06em", flexShrink: 0 }}>
                      {item.active ? "ONLINE" : "OFFLINE"}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Selected miner detail (right) — identity + chart merged in one card ── */}
          <main style={{ display: "grid", gridTemplateRows: "minmax(280px, 1fr) auto", gap: 12, minHeight: 0 }}>
            <div style={{ ...cardStyle, padding: 16, minHeight: 0, display: "grid", gridTemplateRows: "auto auto 1fr auto", gap: 12 }}>
              {/* Identity header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingBottom: 12, borderBottom: `1px solid ${C.borderSoft}` }}>
                <div style={{ width: 3, alignSelf: "stretch", minHeight: 44, borderRadius: 3, background: C.primaryGradient, boxShadow: "0 0 14px rgba(255,106,0,0.4)", flexShrink: 0 }} />
                <SpO2Gauge value={activeVital ? formatReading(miner.spo2, 0) : "--"} color={C.primary} size={58} />
                <div style={{ minWidth: 0 }}>
                  <div style={moduleLabel}>Selected miner</div>
                  <div style={{ color: C.text, fontSize: 21, fontWeight: 950, marginTop: 2, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{miner?.name || "No miner selected"}</div>
                  <div style={{ color: C.textMuted, fontSize: 11, marginTop: 3 }}>{miner ? `${miner.id} · ${miner.location}` : "Waiting for registered miner devices"}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <MinerStatusPill miner={miner} />
                    <span style={{ color: C.textMuted, fontSize: 11, whiteSpace: "nowrap" }}>Last seen {formatLastSeen(miner?.lastSeen)}</span>
                  </div>
                  <EcgWaveform color={miner?.active ? C.red : C.offline} />
                </div>
              </div>

              {/* Chart sub-header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>Live Vitals Trend</div>
                <span style={{ fontSize: 11, color: C.textMuted }}>
                  <b style={{ color: C.red }}>HR</b> bpm · <b style={{ color: C.primary }}>SpO2</b> % · <b style={{ color: C.teal }}>Temp</b> °C · <b style={{ color: C.amber }}>limits</b>
                </span>
              </div>

              <div style={{ minHeight: 180, border: `1px solid ${C.borderSoft}`, borderRadius: 8, background: "#151515", padding: 8, display: "grid" }}>
                {activeVital && chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 12, right: 24, left: 4, bottom: 18 }}>
                      <CartesianGrid stroke={C.borderSoft} vertical={false} />
                      <XAxis dataKey="time" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={22} label={{ value: "Time", fill: C.textMuted, fontSize: 10, position: "insideBottom", offset: -4 }} />
                      <YAxis yAxisId="hr" domain={[40, 140]} tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={42} label={{ value: "bpm", angle: -90, fill: C.textMuted, fontSize: 10, position: "insideLeft" }} />
                      <YAxis yAxisId="spo2" orientation="right" domain={[85, 100]} tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={40} label={{ value: "%", angle: 90, fill: C.textMuted, fontSize: 10, position: "insideRight" }} />
                      <YAxis yAxisId="temp" orientation="right" domain={[34, 42]} hide />
                      <ReferenceLine yAxisId="hr" y={thresholds.hrMax} stroke={C.amber} strokeDasharray="4 4" />
                      <ReferenceLine yAxisId="hr" y={thresholds.hrMin} stroke={C.amber} strokeDasharray="4 4" />
                      <ReferenceLine yAxisId="spo2" y={thresholds.spo2Min} stroke={C.primary} strokeDasharray="4 4" />
                      <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
                      <Line yAxisId="hr" type="monotone" dataKey="hr" name="Heart Rate (bpm)" stroke={C.red} strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls />
                      <Line yAxisId="spo2" type="monotone" dataKey="spo2" name="SpO2 (%)" stroke={C.primary} strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls />
                      <Line yAxisId="temp" type="monotone" dataKey="temp" name="Body Temp (°C)" stroke={C.teal} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    title={miner?.active ? "Waiting for valid chest contact" : "Device offline"}
                    text={miner?.active ? "The graph starts once both heart-rate and SpO2 readings are valid." : "No live HR or SpO2 data is being received from this miner."}
                  />
                )}
              </div>
              <div style={{ color: C.textMuted, fontSize: 10, paddingTop: 8 }}>
                TIME AXIS: {chartData.length ? chartData[chartData.length - 1].time : "WAITING FOR TIMESTAMP"}
              </div>
            </div>

            {/* Vitals (+ the unique SpO2 trend notice) under the miner they belong to */}
            <div style={{ display: "grid", gap: 10 }}>
              {activeVital && spo2Trend.declining && (
                <Indicator color={C.amber} label={`SpO₂ trending down — ${spo2Trend.netDrop}% over last ${spo2Trend.samples} readings`} />
              )}
              <div className="cc-vitals" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
              <VitalCard label="Heart Rate" icon="heart" value={activeVital ? formatReading(miner.hr, 0) : "--"} unit="bpm" color={C.red} status={activeVital ? getVitalStatus(miner.hr, "hr", thresholds) : "OFFLINE"} />
              <VitalCard label="SpO2" icon="droplet" value={activeVital ? formatReading(miner.spo2, 0) : "--"} unit="%" color={C.primary} status={activeVital ? getVitalStatus(miner.spo2, "spo2", thresholds) : "OFFLINE"} />
              <VitalCard label="Body Temp" icon="thermometer" value={activeVital ? formatReading(miner.temp, 1) : "--"} unit="°C" color={C.teal} status={activeVital ? getVitalStatus(miner.temp, "temp", thresholds) : "OFFLINE"} />
              <VitalCard label="Chest Contact" icon="contact" value={miner?.active ? (miner?.finger === false ? "No" : "Yes") : "--"} color={!miner?.active ? C.offline : miner?.finger === false ? C.amber : C.green} status={!miner?.active ? "OFFLINE" : miner?.finger === false ? "WARNING" : "NORMAL"} />
              <VitalCard label="Manual SOS" icon="siren" value={miner?.active ? (miner?.button_pressed || miner?.manual_alert ? "Pressed" : "Clear") : "--"} unit={miner?.active ? `${miner?.button_press_count || 0}x` : ""} color={!miner?.active ? C.offline : miner?.button_pressed || miner?.manual_alert ? C.red : C.green} status={!miner?.active ? "OFFLINE" : miner?.button_pressed || miner?.manual_alert ? "PRESSED" : "NORMAL"} />
              </div>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}

// mergeLiveSeries — zips hr/spo2/temp arrays into unified time-indexed chart rows (max 30 points)
function mergeLiveSeries(series) {
  const max = Math.max(series.hr?.length || 0, series.spo2?.length || 0, series.temp?.length || 0);
  const rows = [];
  for (let index = 0; index < max; index += 1) {
    const hrPoint = series.hr?.[index];
    const spo2Point = series.spo2?.[index];
    const tempPoint = series.temp?.[index];
    rows.push({
      time: hrPoint?.time || spo2Point?.time || tempPoint?.time || "",
      hr: Number.isFinite(Number(hrPoint?.hr)) ? Number(hrPoint.hr) : null,
      spo2: Number.isFinite(Number(spo2Point?.spo2)) ? Number(spo2Point.spo2) : null,
      temp: Number.isFinite(Number(tempPoint?.temp)) ? Number(tempPoint.temp) : null,
    });
  }
  return rows.slice(-30);
}

// EmptyState — placeholder shown inside the chart area when no valid readings are available
function EmptyState({ title, text }) {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", border: `1px dashed ${C.border}`, borderRadius: 8 }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ color: C.red, fontSize: 13, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>{title}</div>
        <div style={{ color: C.textMuted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{text}</div>
      </div>
    </div>
  );
}

// VitalCard — single vital reading card with status badge (NORMAL / WARNING / CRITICAL / OFFLINE)
function VitalCard({ label, value, unit, color, status, icon }) {
  const statusColor = status === "NORMAL" ? C.green : status === "OFFLINE" ? C.offline : status === "CRITICAL" || status === "HIGH" ? C.red : C.amber;
  const isLive = status !== "OFFLINE";
  return (
    <div className="card-shimmer" style={{ ...cardStyle, padding: 13, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon && <Icon name={icon} size={13} color={color} />}
        <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      </div>
      <div style={{ color, fontSize: 27, fontWeight: 950, marginTop: 8, lineHeight: 1 }}>
        {value}<span style={{ color: C.textMuted, fontSize: 11, marginLeft: 4 }}>{unit}</span>
      </div>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        color: statusColor, fontSize: 9, fontWeight: 900,
        marginTop: 8, background: `${statusColor}14`, border: `1px solid ${statusColor}30`,
        borderRadius: 999, padding: "3px 8px",
      }}>
        <span className={isLive ? "vital-ring" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, flexShrink: 0, color: statusColor }} />
        {status || "NO DATA"}
      </div>
    </div>
  );
}

// EcgWaveform — animated SVG ECG trace that draws across and loops
function EcgWaveform({ color = C.red, width = 110, height = 36 }) {
  return (
    <svg width={width} height={height} style={{ overflow: "visible", flexShrink: 0 }}>
      <path
        d={`M0,18 L18,18 L20,15 L22,12 L24,18 L26,11 L28,1 L30,35 L32,18 L34,14 L36,17 L38,18 L${width},18`}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ecg-wave"
        style={{ filter: `drop-shadow(0 0 3px ${color}88)` }}
      />
    </svg>
  );
}

// SpO2Gauge — circular arc gauge showing SpO2 percentage with animated progress ring
function SpO2Gauge({ value, color, size = 80 }) {
  const R = size * 0.375;
  const circ = 2 * Math.PI * R;
  const arc = circ * 0.75;
  const cx = size / 2;
  const cy = size / 2;
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const filled = arc * (safe / 100);
  const isLive = value !== "--" && safe > 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={`${color}20`} strokeWidth="5" strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" transform={`rotate(135, ${cx}, ${cy})`} />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={isLive ? `${filled} ${circ - filled}` : `0 ${circ}`}
          strokeLinecap="round" transform={`rotate(135, ${cx}, ${cy})`}
          style={{ transition: "stroke-dasharray 0.7s ease", filter: isLive ? `drop-shadow(0 0 5px ${color}99)` : "none" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ color, fontSize: size * 0.21, fontWeight: 950, lineHeight: 1 }}>{value}</span>
        <span style={{ color: C.textMuted, fontSize: size * 0.115, fontWeight: 800, marginTop: 2, letterSpacing: "0.06em" }}>SpO2%</span>
      </div>
    </div>
  );
}

// Indicator — colored row with a glowing dot used in the Warning Indicators section
function Indicator({ color, label }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 12px", marginTop: 7, borderRadius: 8,
      background: `${color}0A`, border: `1px solid ${color}22`,
      transition: "background 0.18s, border-color 0.18s",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}`, flexShrink: 0 }} />
      <span style={{ color: C.textDim, fontSize: 12 }}>{label}</span>
    </div>
  );
}

// HeaderPill — compact status pill shown in the dashboard page header
function HeaderPill({ label, color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color, border: `1px solid ${color}44`, background: `${color}12`, borderRadius: 999, padding: "6px 11px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </span>
  );
}

// MinerStatusPill — selected miner's live status: Online / Stale signal / Offline
function MinerStatusPill({ miner }) {
  const online = Boolean(miner?.active) && !miner?.stale;
  const color = online ? C.green : C.offline;
  const label = online ? "Online" : miner?.stale ? "Stale signal" : "Offline";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>
      <span className={online ? "dot-live" : undefined} style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: online ? `0 0 10px ${color}` : "none" }} />
      {label}
    </span>
  );
}

