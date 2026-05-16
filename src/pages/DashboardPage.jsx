import { useState } from "react";
import AlertBanner from "../components/AlertBanner";
import LiveChartCard from "../components/LiveChartCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { C, cardStyle } from "../theme";
import { buildAlerts, getVitalStatus } from "../utils/alertChecker";
import { average, formatLastSeen, formatReading } from "../utils/formatters";

export default function DashboardPage({ miners, liveData, thresholds }) {
  const [selected, setSelected] = useState(miners[0]?.id || "");
  const miner = miners.find((item) => item.id === selected) || miners[0];
  const selectedData = liveData[miner?.id] || { hr: [], spo2: [] };
  const activeMiners = miners.filter((item) => item.active);
  const alerts = buildAlerts(miners, thresholds);

  return (
    <div style={{ padding: "20px 24px", overflow: "auto", height: "100%" }}>
      <AlertBanner miners={miners} thresholds={thresholds} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Active Devices" value={activeMiners.length} unit={`/${miners.length}`} color={C.green} />
        <StatCard label="Avg Heart Rate" value={formatReading(average(activeMiners.map((item) => item.hr)))} unit="bpm" color={C.red} />
        <StatCard label="Avg SpO2" value={formatReading(average(activeMiners.map((item) => item.spo2)))} unit="%" color={C.cyan} />
        <StatCard label="Alerts" value={alerts.length} color={alerts.length ? C.amber : C.green} sub="active conditions" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {miners.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelected(item.id)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: `1px solid ${selected === item.id ? C.amber : C.border}`,
              background: selected === item.id ? "rgba(245,158,11,0.1)" : "transparent",
              color: selected === item.id ? C.amber : C.textMuted,
              cursor: "pointer",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.active ? C.green : C.red, display: "inline-block" }} />
            {item.name}
          </button>
        ))}
      </div>

      {miner && (
        <div style={{ ...cardStyle, padding: "12px 18px", display: "flex", alignItems: "center", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.06em" }}>SELECTED DEVICE</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{miner.name}</div>
          </div>
          <Divider />
          <Metric label="ID" value={miner.id} highlight />
          <Divider />
          <Metric label="Location" value={miner.location} />
          <Divider />
          <StatusBadge active={miner.active} />
          {miner.stale && <Tag color={C.amber}>Stale Signal</Tag>}
          {miner.finger === false && <Tag color={C.amber}>No Chest Contact</Tag>}
          {miner.manual_alert && <Tag color={C.amber}>Manual Alert</Tag>}
          <div style={{ marginLeft: "auto", fontSize: 11, color: C.textMuted }}>Last seen: {formatLastSeen(miner.lastSeen)}</div>
        </div>
      )}

      {miner?.active && miner.finger !== false ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <LiveChartCard title="Heart Rate" data={selectedData.hr} color={C.red} dataKey="hr" unit=" bpm" miner={miner.name} yDomain={[50, 130]} thresholds={thresholds} />
          <LiveChartCard title="Blood Oxygen (SpO2)" data={selectedData.spo2} color={C.cyan} dataKey="spo2" unit="%" miner={miner.name} yDomain={[88, 100]} thresholds={thresholds} />
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: C.textMuted }}>{miner?.active ? "No chest contact. Waiting for valid sensor data." : "Device is offline. No live data available."}</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>Last active: {formatLastSeen(miner?.lastSeen)}</div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12, color: C.textMuted, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>All Devices Quick View</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {miners.map((item) => {
            const abnormal =
              item.active &&
              (item.manual_alert || item.finger === false || getVitalStatus(item.hr, "hr", thresholds) !== "NORMAL" || getVitalStatus(item.spo2, "spo2", thresholds) !== "NORMAL");
            return (
              <div key={item.id} style={{ ...cardStyle, padding: 14, borderColor: abnormal ? C.amber : C.border }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>{item.id}</div>
                  </div>
                  <StatusBadge active={item.active} />
                </div>
                <div style={{ display: "flex", gap: 18, fontSize: 12 }}>
                  <span style={{ color: C.red }}>HR {item.active && item.finger !== false ? formatReading(item.hr) : "--"}</span>
                  <span style={{ color: C.cyan }}>SpO2 {item.active && item.finger !== false ? formatReading(item.spo2) : "--"}</span>
                </div>
                {item.stale && <div style={{ marginTop: 8, fontSize: 10, color: C.amber }}>No recent Firebase update</div>}
                {item.manual_alert && <div style={{ marginTop: 8, fontSize: 10, color: C.amber }}>Manual alert active</div>}
                {item.finger === false && <div style={{ marginTop: 8, fontSize: 10, color: C.amber }}>No chest contact</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 30, background: C.border }} />;
}

function Metric({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.textMuted }}>{label}</div>
      <div style={{ fontSize: 12, color: highlight ? C.amber : C.textDim }}>{value}</div>
    </div>
  );
}

function Tag({ children, color }) {
  return (
    <span
      style={{
        border: `1px solid ${color}`,
        borderRadius: 5,
        color,
        fontSize: 10,
        fontWeight: 700,
        padding: "4px 7px",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}
