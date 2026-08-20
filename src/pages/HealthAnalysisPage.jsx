import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { C, cardStyle, controlStyle, pageStyle } from "../theme";
import { DEFAULT_THRESHOLDS, getVitalStatus } from "../utils/alertChecker";
import { DATE_RANGE_OPTIONS, isWithinDateRange, resolveDateRange } from "../utils/filtering";
import { average, formatLastSeen, formatReading, formatSystemTimestamp, lastSeenValue } from "../utils/formatters";
import { compareMinersActiveFirst } from "../utils/minerOrdering";
import { buildSessions } from "./HealthLogsPage";

const METRICS = [
  { key: "hr", label: "Heart rate", unit: "bpm", color: C.red, digits: 0 },
  { key: "spo2", label: "SpO2", unit: "%", color: C.oxygen, digits: 0 },
  { key: "temp", label: "Temperature", unit: "°C", color: C.teal, digits: 1 },
];

export default function HealthAnalysisPage({ miners = [], analyticsData = {}, liveData = {}, sessionData = {}, activityLogs = [], thresholds = DEFAULT_THRESHOLDS }) {
  const [selectedId, setSelectedId] = useState("");
  const [rangePreset, setRangePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [throughDateTime, setThroughDateTime] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const sortedMiners = useMemo(() => [...miners].sort(compareMinersActiveFirst), [miners]);
  const currentId = sortedMiners.some((miner) => miner.id === selectedId) ? selectedId : sortedMiners[0]?.id || "";
  const selectedMiner = sortedMiners.find((miner) => miner.id === currentId) || null;
  const sessionOptions = useMemo(() => {
    if (!selectedMiner) return [];
    const rows = normalizeRows(selectedMiner, analyticsData[selectedMiner.id], liveData[selectedMiner.id]);
    const built = buildSessions(
      [selectedMiner],
      { [selectedMiner.id]: rows },
      activityLogs,
      thresholds,
      sessionData,
      {},
    );
    return built.sort((a, b) => Number(b.sortTimestamp || 0) - Number(a.sortTimestamp || 0));
  }, [activityLogs, analyticsData, liveData, selectedMiner, sessionData, thresholds]);
  const effectiveSessionId = sessionOptions.some((session) => session.id === selectedSessionId) ? selectedSessionId : "all";
  const selectedSession = sessionOptions.find((session) => session.id === effectiveSessionId) || null;
  const presetDateRange = useMemo(() => resolveDateRange(rangePreset, { from: dateFrom, to: dateTo }), [dateFrom, dateTo, rangePreset]);
  const dateTimeRange = useMemo(() => rangeThroughDateTime(throughDateTime), [throughDateTime]);
  const dateRange = useMemo(
    () => intersectDateRanges(
      presetDateRange,
      dateTimeRange,
      selectedSession ? { start: sessionTimestamp(selectedSession, "start"), end: sessionTimestamp(selectedSession, "end") } : {},
    ),
    [dateTimeRange, presetDateRange, selectedSession],
  );
  const rangeLabel = DATE_RANGE_OPTIONS.find((option) => option.value === rangePreset)?.label || "All time";
  const summaries = useMemo(
    () => sortedMiners.map((miner) => ({
      miner,
      analysis: buildHealthFindings(miner, analyticsData[miner.id], liveData[miner.id], activityLogs, thresholds, dateRange),
    })),
    [activityLogs, analyticsData, dateRange, liveData, sortedMiners, thresholds],
  );
  const selectedAnalysis = useMemo(
    () => selectedMiner
      ? buildHealthFindings(selectedMiner, analyticsData[selectedMiner.id], liveData[selectedMiner.id], activityLogs, thresholds, dateRange)
      : emptyAnalysis(),
    [activityLogs, analyticsData, dateRange, liveData, selectedMiner, thresholds],
  );

  return (
    <div style={pageStyle}>
      <div className="health-analysis-layout page-layout" style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <PageHeader
          label="Personnel health review"
          title="Health Analysis"
          subtitle="Sensor-pattern findings to support an early wellbeing check for each miner."
          right={(
            <label className="health-analysis-selector">
              <span>Review personnel</span>
              <select value={currentId} onChange={(event) => setSelectedId(event.target.value)} style={{ ...controlStyle, minWidth: 230 }}>
                {sortedMiners.length === 0 && <option value="">No personnel registered</option>}
                {sortedMiners.map((miner) => <option key={miner.id} value={miner.id}>{miner.name} ({miner.id})</option>)}
              </select>
            </label>
          )}
        />

        <section className="health-analysis-filterbar" aria-label="Health analysis date filter">
          <div className="health-analysis-filter-copy">
            <span>Analysis window</span>
            <strong>{rangeLabel}</strong>
          </div>
          <label className="health-analysis-date-field">
            <span>Date range</span>
            <select value={rangePreset} onChange={(event) => setRangePreset(event.target.value)} style={{ ...controlStyle, minWidth: 142 }}>
              {DATE_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {rangePreset === "custom" && (
            <>
              <label className="health-analysis-date-field"><span>From</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} style={{ ...controlStyle, minWidth: 142 }} /></label>
              <label className="health-analysis-date-field"><span>To</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} style={{ ...controlStyle, minWidth: 142 }} /></label>
            </>
          )}
          <label className="health-analysis-date-field health-analysis-session-field">
            <span>Session</span>
            <select value={effectiveSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} style={{ ...controlStyle, minWidth: 220 }}>
              <option value="all">All sessions</option>
              {sessionOptions.map((session) => <option key={session.id} value={session.id}>{session.start} · {session.duration} · {capitalize(session.sessionStatus)}</option>)}
            </select>
          </label>
          <label className="health-analysis-date-field health-analysis-datetime-field">
            <span>Through date &amp; time</span>
            <input type="datetime-local" value={throughDateTime} onChange={(event) => setThroughDateTime(event.target.value)} style={{ ...controlStyle, minWidth: 190 }} />
          </label>
          <span className="health-analysis-filter-note">Findings recalculate for every personnel profile.</span>
        </section>

        <section className="health-analysis-main" style={{ display: "grid", gridTemplateColumns: "minmax(250px, 0.72fr) minmax(0, 1.55fr)", gap: 12, minHeight: 0, overflow: "hidden" }}>
          <aside className="health-analysis-personnel" style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
            <PanelHeader inset title="Personnel signals" subtitle="Select a profile to review its reading behavior." meta={`${summaries.length} tracked`} />
            <div className="health-analysis-personnel-list hide-scrollbar" style={{ overflow: "auto", minHeight: 0, padding: 10, display: "grid", alignContent: "start", gap: 8 }}>
              {summaries.length === 0 ? (
                <EmptyState title="No personnel data" text="Register a miner and collect readings to begin a review." />
              ) : summaries.map(({ miner, analysis }) => (
                <button
                  type="button"
                  key={miner.id}
                  className={`health-analysis-personnel-card${miner.id === currentId ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(miner.id)}
                  style={{ borderLeftColor: analysis.posture.color }}
                >
                  <span className="health-analysis-personnel-copy">
                    <strong>{miner.name}</strong>
                    <small>{miner.id} · {miner.location || "Unassigned"}</small>
                  </span>
                  <span className="health-analysis-personnel-status" style={{ color: analysis.posture.color }}>
                    <span className="health-analysis-status-dot" style={{ background: analysis.posture.color }} />
                    {analysis.posture.shortLabel}
                  </span>
                  <span className="health-analysis-personnel-meta">{analysis.flaggedCount} flagged · {analysis.sampleCount} readings</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="health-analysis-detail hide-scrollbar" style={{ minHeight: 0, overflow: "auto", display: "grid", alignContent: "start", gap: 12 }}>
            {!selectedMiner ? (
              <div style={{ ...cardStyle, minHeight: 260, display: "grid", placeItems: "center" }}><EmptyState title="Waiting for readings" text="Health findings will appear when a personnel profile is available." /></div>
            ) : (
              <>
                <section className="health-analysis-hero" style={{ ...cardStyle, padding: 16, borderTop: `2px solid ${selectedAnalysis.posture.color}` }}>
                  <div className="health-analysis-hero-top">
                    <div>
                      <div style={{ color: C.primary, fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>Current review</div>
                      <h2>{selectedMiner.name}</h2>
                      <div className="health-analysis-subline">{selectedMiner.id} · Last contact {formatLastSeen(selectedMiner.lastSeen)}</div>
                    </div>
                    <PostureBadge posture={selectedAnalysis.posture} />
                  </div>
                  <div className="health-analysis-stat-grid">
                    <AnalysisStat label="Readings analyzed" value={selectedAnalysis.sampleCount} color={C.cyan} />
                    <AnalysisStat label="Flagged readings" value={selectedAnalysis.flaggedCount} color={selectedAnalysis.posture.color} />
                    <AnalysisStat label="SOS activations" value={selectedAnalysis.sosCount} color={selectedAnalysis.sosCount ? C.red : C.green} />
                    <AnalysisStat label="Pattern" value={selectedAnalysis.behaviorLabel} color={C.primary} />
                  </div>
                </section>

                <section style={{ ...cardStyle, padding: 15 }}>
                  <PanelHeader title="Findings and recommended checks" subtitle="Prioritized from the selected personnel’s recorded sensor behavior." meta={`${selectedAnalysis.findings.length} finding${selectedAnalysis.findings.length === 1 ? "" : "s"}`} />
                  <FactorLegend />
                  <div className="health-analysis-findings">
                    {selectedAnalysis.findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)}
                  </div>
                </section>

                <section style={{ ...cardStyle, padding: 15 }}>
                  <PanelHeader title="Reading behavior" subtitle="How the recorded signals behaved during available sessions." meta={selectedAnalysis.windowLabel} />
                  <div className="health-analysis-metric-grid">
                    {METRICS.map((metric) => <BehaviorMetric key={metric.key} metric={metric} data={selectedAnalysis.metrics[metric.key]} />)}
                  </div>
                  <div className="health-analysis-sample-strip" aria-label="Recent reading status sequence">
                    <span className="health-analysis-sample-label">Recent sequence</span>
                    {selectedAnalysis.samples.length ? selectedAnalysis.samples.map((sample) => (
                      <span key={sample.key} title={sample.label} className="health-analysis-sample" style={{ background: sample.color }} />
                    )) : <span style={{ color: C.textMuted, fontSize: 11 }}>No usable samples yet</span>}
                    <span className="health-analysis-sample-caption">oldest → newest</span>
                  </div>
                </section>

                <section className="health-analysis-method" style={{ ...cardStyle, padding: 14 }}>
                  <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>How this review is formed</div>
                  <div style={{ color: C.textMuted, fontSize: 10.5, lineHeight: 1.5, marginTop: 5 }}>The console compares valid HR, SpO2, and temperature samples with the configured thresholds, then looks for repeated out-of-range values, SOS activity, contact gaps, and directional change. A “stable” result means no pattern was detected in the available data; it does not mean a person is medically cleared.</div>
                </section>
              </>
            )}
          </main>
        </section>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildHealthFindings(miner, analyticsRows = [], liveSeries = {}, activityLogs = [], thresholds = DEFAULT_THRESHOLDS, dateRange = {}) {
  const rows = normalizeRows(miner, analyticsRows, liveSeries).filter((row) => isWithinDateRange(row.timestamp, dateRange));
  const validRows = rows.filter((row) => row.hr > 0 || row.spo2 > 0 || row.temp > 0);
  const scopedActivityLogs = (activityLogs || []).filter((log) => isWithinDateRange(log.timestamp, dateRange));
  const metrics = Object.fromEntries(METRICS.map((metric) => [metric.key, summarizeMetric(validRows, metric, thresholds)]));
  const sosCount = countSosSignals(miner, rows, scopedActivityLogs);
  const contactGaps = rows.filter((row) => row.finger === false).length + (miner.finger === false ? 1 : 0);
  const context = { miner, rows, validRows, scopedActivityLogs, metrics, thresholds, sosCount, contactGaps };
  const findings = buildHealthFindingList(context);

  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const posture = buildPosture(criticalCount, warningCount, findings);
  const lastValidRow = validRows.at(-1);
  return {
    metrics,
    findings,
    posture,
    sampleCount: validRows.length,
    flaggedCount: validRows.filter((row) => rowHasFlag(row, thresholds)).length,
    sosCount,
    behaviorLabel: behaviorLabel(metrics, validRows.length),
    windowLabel: validRows.length > 1 ? `${formatWindow(validRows[0].timestamp)} → ${formatWindow(lastValidRow.timestamp)}` : "Available window",
    samples: validRows.slice(-18).map((row) => ({ key: `${row.timestamp}-${row.hr}-${row.spo2}-${row.temp}`, label: sampleLabel(row, thresholds), color: sampleColor(row, thresholds) })),
  };
}

function buildHealthFindingList(context) {
  const findings = [
    ...buildSosFindings(context),
    ...buildSpo2Findings(context),
    ...buildHeartRateFindings(context),
    ...buildTemperatureFindings(context),
    ...buildTrendFindings(context),
  ];
  const fallback = findings.length ? findings : buildFallbackFindings(context);
  return fallback.map((finding) => ({
    ...finding,
    timestamp: finding.timestamp || findingTimestamp(finding.id, context.miner, context.rows, context.scopedActivityLogs, context.thresholds),
  }));
}

function buildSosFindings({ sosCount }) {
  if (sosCount <= 0) return [];
  return [{
    id: "manual-sos",
    severity: "critical",
    title: "Manual SOS activation recorded",
    reading: `${sosCount} activation${sosCount === 1 ? "" : "s"}`,
    context: "An SOS is an urgent human signal and cannot be explained by sensor values alone.",
    factors: "The person may need immediate assistance, or the button may have been activated accidentally.",
    action: "Check the miner immediately and follow the site emergency response procedure.",
  }];
}

function buildSpo2Findings({ metrics }) {
  if (metrics.spo2.criticalCount > 0) {
    return [{ id: "spo2-critical", severity: "critical", title: "Marked SpO2 concern", reading: `${metrics.spo2.criticalCount} critical sample${metrics.spo2.criticalCount === 1 ? "" : "s"}`, context: `Lowest recorded value: ${formatReading(metrics.spo2.min, 0)}%.`, factors: "May be associated with breathing difficulty, acute illness, or unreliable sensor contact.", action: "Verify placement and assess the person immediately; escalate persistent or symptomatic readings to a clinician or emergency response." }];
  }
  if (metrics.spo2.lowCount > 0) {
    return [{ id: "spo2-low", severity: "warning", title: "Repeated low SpO2 pattern", reading: `${metrics.spo2.lowCount} low sample${metrics.spo2.lowCount === 1 ? "" : "s"}`, context: `Average ${formatReading(metrics.spo2.average, 0)}% across ${metrics.spo2.count} valid samples.`, factors: "May reflect exertion, breathing strain, environmental conditions, or poor optical contact.", action: "Pause and re-check after confirming a stable sensor fit. Escalate if it persists or symptoms are present." }];
  }
  return [];
}

function buildHeartRateFindings({ metrics }) {
  if (metrics.hr.criticalCount > 0) {
    return [{ id: "hr-critical", severity: "critical", title: "Critical heart-rate sample", reading: `${metrics.hr.criticalCount} critical sample${metrics.hr.criticalCount === 1 ? "" : "s"}`, context: `Peak recorded value: ${formatReading(metrics.hr.max, 0)} bpm.`, factors: "May be associated with intense exertion, heat stress, dehydration, pain, anxiety, or another acute condition.", action: "Stop work, assess the person, and follow the medical escalation protocol for persistent or symptomatic readings." }];
  }
  if (metrics.hr.highCount > 0 || metrics.hr.lowCount > 0) {
    const direction = metrics.hr.highCount >= metrics.hr.lowCount ? "elevated" : "low";
    return [{ id: "hr-out-of-range", severity: "warning", title: `${direction[0].toUpperCase()}${direction.slice(1)} heart-rate pattern`, reading: `${metrics.hr.outOfRangeCount} out-of-range sample${metrics.hr.outOfRangeCount === 1 ? "" : "s"}`, context: `Observed range: ${formatReading(metrics.hr.min, 0)}–${formatReading(metrics.hr.max, 0)} bpm.`, factors: "Readings can shift with workload, heat, hydration, stress, recovery, medication, or an underlying condition.", action: "Allow a rest re-check with good contact and review the pattern with a qualified health professional if it remains unusual." }];
  }
  return [];
}

function buildTemperatureFindings({ metrics }) {
  if (metrics.temp.criticalCount > 0) {
    return [{ id: "temp-critical", severity: "critical", title: "Critical temperature sample", reading: `${metrics.temp.criticalCount} critical sample${metrics.temp.criticalCount === 1 ? "" : "s"}`, context: `Observed range: ${formatReading(metrics.temp.min, 1)}–${formatReading(metrics.temp.max, 1)}°C.`, factors: "May be associated with heat or cold exposure, illness, or probe placement error.", action: "Move the person to a safer environment, verify the probe, and use the site heat/cold response protocol." }];
  }
  if (metrics.temp.highCount > 0 || metrics.temp.lowCount > 0) {
    return [{ id: "temp-out-of-range", severity: "warning", title: "Temperature pattern needs review", reading: `${metrics.temp.outOfRangeCount} out-of-range sample${metrics.temp.outOfRangeCount === 1 ? "" : "s"}`, context: `Observed range: ${formatReading(metrics.temp.min, 1)}–${formatReading(metrics.temp.max, 1)}°C.`, factors: "Could reflect ambient exposure, heat strain, illness, or a probe that needs repositioning.", action: "Move out of exposure, confirm probe placement, and repeat the reading before clearing the finding." }];
  }
  return [];
}

function buildTrendFindings({ metrics }) {
  if (metrics.spo2.trend !== "falling" || metrics.spo2.count < 3 || metrics.spo2.criticalCount > 0) return [];
  return [{ id: "spo2-trend", severity: "warning", title: "SpO2 trend is moving down", reading: `${formatReading(metrics.spo2.firstAverage, 0)}% → ${formatReading(metrics.spo2.lastAverage, 0)}%`, context: "A directional change can matter even when individual samples have not crossed the critical threshold.", factors: "May be related to increasing exertion, breathing strain, or a changing sensor fit.", action: "Check the person and sensor contact now; repeat readings during rest." }];
}

function buildFallbackFindings({ contactGaps, validRows }) {
  if (contactGaps > 0) {
    return [{ id: "contact", severity: "observe", title: "Sensor contact is inconsistent", reading: `${contactGaps} contact gap${contactGaps === 1 ? "" : "s"}`, context: "Gaps can make HR and SpO2 findings less reliable.", factors: "Loose fit, sweat, movement, or sensor placement can interrupt contact.", action: "Re-seat the chest or optical sensor and collect a clean reading before drawing conclusions." }];
  }
  return [{ id: "stable", severity: "stable", title: "No concerning pattern detected", reading: stableReadingLabel(validRows.length), context: validRows.length ? "The available readings stayed within the configured review bands." : "There is not enough sensor data to form a finding.", factors: validRows.length ? "A stable sensor pattern is reassuring but is not a medical clearance." : "Offline devices, missing contact, or incomplete samples can limit the review.", action: validRows.length ? "Continue routine monitoring and investigate any symptoms reported by the miner." : "Restore contact or connectivity and collect readings before relying on this review." }];
}

function normalizeRows(miner, analyticsRows = [], liveSeries = {}) {
  const byTimestamp = new Map();
  (analyticsRows || []).forEach((row) => mergeRow(byTimestamp, row));
  ["hr", "spo2", "temp"].forEach((key) => (liveSeries?.[key] || []).forEach((point) => mergeRow(byTimestamp, { ...point, [key]: point[key] })));
  if (!byTimestamp.size && lastSeenValue(miner)) mergeRow(byTimestamp, { timestamp: lastSeenValue(miner), hr: miner.hr, spo2: miner.spo2, temp: miner.temp, finger: miner.finger, manual_alert: miner.manual_alert, button_press_count: miner.button_press_count });
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function mergeRow(byTimestamp, row = {}) {
  const timestamp = Number(row.timestamp || 0);
  if (!timestamp) return;
  const current = byTimestamp.get(timestamp) || { timestamp };
  ["hr", "spo2", "temp"].forEach((key) => {
    if (Number(row[key]) > 0) current[key] = Number(row[key]);
  });
  ["finger", "manual_alert", "button_pressed", "button_press_count", "sessionId"].forEach((key) => {
    if (row[key] !== undefined) current[key] = row[key];
  });
  byTimestamp.set(timestamp, current);
}

function summarizeMetric(rows, metric, thresholds) {
  const values = rows.map((row) => row[metric.key]).filter((value) => Number(value) > 0).map(Number);
  const statuses = values.map((value) => getVitalStatus(value, metric.key, thresholds));
  const midpoint = Math.max(1, Math.floor(values.length / 2));
  const firstAverage = values.length ? average(values.slice(0, midpoint)) : 0;
  const lastAverage = values.length ? average(values.slice(-midpoint)) : 0;
  const trend = metricTrend(values.length, firstAverage, lastAverage, metric.key);
  return {
    count: values.length,
    average: average(values, metric.digits),
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    outOfRangeCount: statuses.filter((status) => ["LOW", "HIGH", "CRITICAL"].includes(status)).length,
    lowCount: statuses.filter((status) => status === "LOW").length,
    highCount: statuses.filter((status) => status === "HIGH").length,
    criticalCount: statuses.filter((status) => status === "CRITICAL").length,
    firstAverage,
    lastAverage,
    trend,
  };
}

function countSosSignals(miner, rows, activityLogs) {
  const logSignals = (activityLogs || []).filter((log) => log.deviceId === miner.id && (log.type === "manual_alert" || /manual alert|button pressed|sos/i.test(`${log.title} ${log.detail}`)));
  const rowSignals = rows.filter((row, index, all) => row.manual_alert && !all[index - 1]?.manual_alert).length;
  const counter = rows.map((row) => Number(row.button_press_count || 0)).filter(Boolean);
  const counterSignals = counter.length ? Math.max(...counter) - Math.min(...counter) : 0;
  return Math.max(logSignals.length, rowSignals, counterSignals, miner.manual_alert ? 1 : 0);
}

function findingTimestamp(id, miner, rows, activityLogs, thresholds) {
  if (id === "manual-sos") return latestSosTimestamp(miner, rows, activityLogs);
  if (id === "spo2-critical") return latestMetricTimestamp(rows, "spo2", thresholds, "CRITICAL");
  if (id === "spo2-low") return latestMetricTimestamp(rows, "spo2", thresholds, "LOW");
  if (id === "hr-critical") return latestMetricTimestamp(rows, "hr", thresholds, "CRITICAL");
  if (id === "hr-out-of-range") return latestMetricTimestamp(rows, "hr", thresholds);
  if (id === "temp-critical") return latestMetricTimestamp(rows, "temp", thresholds, "CRITICAL");
  if (id === "temp-out-of-range") return latestMetricTimestamp(rows, "temp", thresholds);
  if (id === "contact") return rows.findLast((row) => row.finger === false)?.timestamp || lastSeenValue(miner);
  return rows.at(-1)?.timestamp || lastSeenValue(miner) || 0;
}

function latestMetricTimestamp(rows, key, thresholds, status) {
  return rows.findLast((row) => {
    const currentStatus = getVitalStatus(row[key], key, thresholds);
    return status ? currentStatus === status : ["LOW", "HIGH", "CRITICAL"].includes(currentStatus);
  })?.timestamp || rows.at(-1)?.timestamp || 0;
}

function latestSosTimestamp(miner, rows, activityLogs) {
  const latestLog = (activityLogs || []).findLast((log) => log.deviceId === miner.id && (log.type === "manual_alert" || /manual alert|button pressed|sos/i.test(`${log.title} ${log.detail}`)));
  const logTimestamp = Number(latestLog?.timestamp || 0);
  const rowTimestamp = rows.findLast((row) => row.manual_alert || Number(row.button_press_count || 0) > 0)?.timestamp || 0;
  return Math.max(logTimestamp, rowTimestamp, miner.manual_alert ? lastSeenValue(miner) : 0);
}

function rowHasFlag(row, thresholds) {
  return ["hr", "spo2", "temp"].some((key) => ["LOW", "HIGH", "CRITICAL"].includes(getVitalStatus(row[key], key, thresholds)));
}

function sampleLabel(row, thresholds) {
  const statuses = METRICS.map((metric) => getVitalStatus(row[metric.key], metric.key, thresholds)).filter(Boolean);
  if (statuses.includes("CRITICAL")) return "Critical";
  if (statuses.some((status) => ["LOW", "HIGH"].includes(status))) return "Warning";
  return "Within review band";
}

function sampleColor(row, thresholds) {
  const label = sampleLabel(row, thresholds);
  if (label === "Critical") return C.red;
  return label === "Warning" ? C.amber : C.green;
}

function behaviorLabel(metrics, sampleCount) {
  if (!sampleCount) return "Insufficient data";
  if (metrics.hr.trend === "rising" || metrics.temp.trend === "rising") return "Rising load";
  if (metrics.spo2.trend === "falling") return "Oxygen trend down";
  if (Object.values(metrics).some((metric) => metric.outOfRangeCount > 0)) return "Variable";
  return "Steady";
}

function formatWindow(timestamp) {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleString("en-US", { month: "short", day: "numeric" });
}

function rangeThroughDateTime(value) {
  if (!value) return {};
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return {};
  const date = new Date(timestamp);
  return {
    start: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
    end: timestamp,
  };
}

function intersectDateRanges(...ranges) {
  const startValues = ranges.map((range) => Number(range?.start || 0)).filter(Boolean);
  const endValues = ranges.map((range) => Number(range?.end || 0)).filter(Boolean);
  return {
    start: startValues.length ? Math.max(...startValues) : null,
    end: endValues.length ? Math.min(...endValues) : null,
  };
}

function sessionTimestamp(session, edge) {
  let timestamp = session?.endTimestamp || session?.sortTimestamp || 0;
  if (edge === "start") timestamp = session?.startTimestamp || 0;
  timestamp = Number(timestamp);
  return timestamp > 0 ? timestamp : null;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "Unknown";
}

function emptyAnalysis() {
  return buildHealthFindings({ id: "empty", name: "", lastSeen: 0 }, [], {}, [], DEFAULT_THRESHOLDS);
}

function buildPosture(criticalCount, warningCount, findings) {
  if (criticalCount) return { label: "Immediate review", shortLabel: "Immediate", color: C.red };
  if (warningCount) return { label: "Needs attention", shortLabel: "Attention", color: C.amber };
  if (findings.some((finding) => finding.severity === "observe")) return { label: "Monitor", shortLabel: "Monitor", color: C.cyan };
  return { label: "Stable pattern", shortLabel: "Stable", color: C.green };
}

function stableReadingLabel(count) {
  if (!count) return "No valid samples";
  const suffix = count === 1 ? "" : "s";
  return `${count} valid sample${suffix}`;
}

function metricTrend(count, firstAverage, lastAverage, key) {
  if (count < 3) return "steady";
  const threshold = key === "temp" ? 0.5 : 2;
  if (lastAverage - firstAverage > threshold) return "rising";
  if (firstAverage - lastAverage > threshold) return "falling";
  return "steady";
}

function PanelHeader({ title, subtitle, meta, inset = false }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, padding: inset ? "12px 15px" : "12px 0", marginBottom: 12, borderBottom: `1px solid ${C.borderSoft}` }}><div><div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{title}</div><div style={{ color: C.textMuted, fontSize: 10.5, lineHeight: 1.4, marginTop: 3 }}>{subtitle}</div></div>{meta && <span style={{ color: C.textMuted, fontSize: 10, whiteSpace: "nowrap" }}>{meta}</span>}</div>;
}

function PostureBadge({ posture }) {
  return <span className="health-analysis-posture" style={{ color: posture.color, borderColor: `${posture.color}50`, background: `${posture.color}12` }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: posture.color, boxShadow: `0 0 10px ${posture.color}` }} />{posture.label}</span>;
}

function AnalysisStat({ label, value, color }) {
  return <div className="health-analysis-stat"><span>{label}</span><strong style={{ color }}>{value}</strong></div>;
}

function FindingCard({ finding }) {
  const tone = findingTone(finding.severity);
  return (
    <article className="health-analysis-finding" style={{ borderLeftColor: tone, background: `${tone}08` }}>
      <div className="health-analysis-finding-top">
        <div>
          <span className="health-analysis-finding-level" style={{ color: tone }}>{finding.severity === "stable" ? "STABLE" : finding.severity.toUpperCase()}</span>
          <h3>{finding.title}</h3>
          <time className="health-analysis-finding-time" dateTime={finding.timestamp ? new Date(finding.timestamp).toISOString() : undefined}>
            {finding.timestamp ? formatSystemTimestamp(finding.timestamp) : "Timestamp unavailable"}
          </time>
        </div>
        <strong style={{ color: tone }}>{finding.reading}</strong>
      </div>
      <p>{finding.context}</p>
      <div className="health-analysis-finding-grid">
        <div><span>Possible factors</span><b>{finding.factors}</b></div>
        <div><span>Recommended check</span><b>{finding.action}</b></div>
      </div>
    </article>
  );
}

function FactorLegend() {
  return (
    <div className="health-analysis-factor-legend" aria-label="Factor level legend">
      <span className="health-analysis-factor-title">Factor level</span>
      <span><i style={{ background: C.green }} />Low</span>
      <span><i style={{ background: C.cyan }} />Moderate</span>
      <span><i style={{ background: C.amber }} />High</span>
      <span><i style={{ background: C.red }} />Critical</span>
    </div>
  );
}

function BehaviorMetric({ metric, data }) {
  const flagged = data.count ? Math.round((data.outOfRangeCount / data.count) * 100) : 0;
  const averageLabel = data.count ? `${formatReading(data.average, metric.digits)} ${metric.unit}` : "--";
  const rangeLabel = data.count ? `${data.min.toFixed(metric.digits)}–${data.max.toFixed(metric.digits)} ${metric.unit}` : "No readings";
  const trendLabel = data.count ? `${flagged}% flagged · ${data.trend}` : "Awaiting data";
  const meterColor = behaviorMeterColor(data.criticalCount, flagged);
  return (
    <div className="health-analysis-behavior">
      <div className="health-analysis-behavior-head"><span><i style={{ background: metric.color }} />{metric.label}</span><b style={{ color: metric.color }}>{averageLabel}</b></div>
      <div className="health-analysis-meter"><span style={{ width: `${Math.min(100, flagged)}%`, background: meterColor }} /></div>
      <div className="health-analysis-behavior-foot"><span>{rangeLabel}</span><span>{trendLabel}</span></div>
    </div>
  );
}

function behaviorMeterColor(criticalCount, flagged) {
  if (criticalCount) return C.red;
  return flagged ? C.amber : C.green;
}

function findingTone(severity) {
  if (severity === "critical") return C.red;
  if (severity === "warning") return C.amber;
  if (severity === "observe") return C.cyan;
  return C.green;
}

function EmptyState({ title, text }) {
  return <div style={{ padding: 24, textAlign: "center" }}><div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>{title}</div><div style={{ color: C.textMuted, fontSize: 10.5, lineHeight: 1.5, marginTop: 5 }}>{text}</div></div>;
}
