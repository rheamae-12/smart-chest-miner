import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend } from "recharts";

// ─── Color & Style Constants ──────────────────────────────────────────────────
const C = {
  bg0: "#0a0c0e",
  bg1: "#111418",
  bg2: "#181d22",
  bg3: "#1e252c",
  border: "#2a3340",
  amber: "#f59e0b",
  amberD: "#92610a",
  cyan: "#06b6d4",
  cyanD: "#0e7490",
  red: "#ef4444",
  green: "#22c55e",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#94a3b8",
};

// ─── Simulated Miner Data ─────────────────────────────────────────────────────
const MINERS_INIT = [
  { id: "MCM-001", name: "Miner 1", location: "Shaft A - Level 3", active: true, lastSeen: new Date(), hr: 78, spo2: 97 },
  { id: "MCM-002", name: "Miner 2", location: "Shaft B - Level 1", active: true, lastSeen: new Date(), hr: 82, spo2: 96 },
  { id: "MCM-003", name: "Miner 3", location: "Shaft A - Level 5", active: false, lastSeen: new Date(Date.now() - 720000), hr: 0, spo2: 0 },
  { id: "MCM-004", name: "Miner 4", location: "Shaft C - Level 2", active: true, lastSeen: new Date(), hr: 91, spo2: 95 },
  { id: "MCM-005", name: "Miner 5", location: "Shaft B - Level 4", active: false, lastSeen: new Date(Date.now() - 3600000), hr: 0, spo2: 0 },
];

function generateReading(base, range) {
  return Math.round(base + (Math.random() - 0.5) * range);
}

function timeLabel() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:${d.getSeconds().toString().padStart(2,"0")}`;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ active }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11,
      fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.05em",
      padding: "3px 8px", borderRadius: 4,
      background: active ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
      color: active ? C.green : C.red,
      border: `1px solid ${active ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? C.green : C.red,
        boxShadow: active ? `0 0 6px ${C.green}` : "none",
        animation: active ? "pulse 1.5s infinite" : "none" }} />
      {active ? "ONLINE" : "OFFLINE"}
    </span>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, collapsed, setCollapsed }) {
  const nav = [
    { key: "dashboard", label: "Dashboard", icon: "⬡" },
    { key: "analytics", label: "Analytics", icon: "◈" },
    { key: "devices", label: "Devices", icon: "⊡" },
    { key: "settings", label: "Settings", icon: "⚙" },
  ];
  return (
    <aside style={{
      width: collapsed ? 56 : 220, minHeight: "100vh", background: C.bg1,
      borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
      transition: "width 0.2s ease", overflow: "hidden", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "18px 14px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${C.amber}, ${C.amberD})`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>⛏</div>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, letterSpacing: "0.12em", lineHeight: 1 }}>SMART CHEST</div>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.08em" }}>MINER MONITOR</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 8px" }}>
        {nav.map(n => (
          <button key={n.key} onClick={() => setPage(n.key)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px",
            borderRadius: 6, border: "none", cursor: "pointer", marginBottom: 2,
            background: page === n.key ? `rgba(245,158,11,0.12)` : "transparent",
            color: page === n.key ? C.amber : C.textMuted,
            borderLeft: page === n.key ? `2px solid ${C.amber}` : "2px solid transparent",
            transition: "all 0.15s",
          }}>
            <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{n.icon}</span>
            {!collapsed && <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{n.label}</span>}
          </button>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div style={{ padding: "12px 8px", borderTop: `1px solid ${C.border}` }}>
        <button onClick={() => setCollapsed(!collapsed)} style={{
          width: "100%", padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 13,
        }}>
          {collapsed ? "→" : "← Collapse"}
        </button>
      </div>
    </aside>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ page, miners }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  const active = miners.filter(m => m.active).length;
  const pageLabel = { dashboard: "Dashboard", analytics: "Analytics", devices: "Manage Devices", settings: "Settings" };

  return (
    <header style={{
      height: 52, background: C.bg1, borderBottom: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", padding: "0 20px", gap: 16, flexShrink: 0,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: "0.04em" }}>{pageLabel[page]}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textMuted }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}`, display: "inline-block" }} />
        {active}/{miners.length} devices online
      </div>
      <div style={{ width: 1, height: 20, background: C.border }} />
      <div style={{ fontFamily: "monospace", fontSize: 12, color: C.cyan }}>
        {time.toLocaleTimeString()}
      </div>
      <div style={{ width: 1, height: 20, background: C.border }} />
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: `rgba(245,158,11,0.15)`,
        border: `1px solid ${C.amberD}`, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, color: C.amber, fontWeight: 700 }}>AD</div>
    </header>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, unit, color, sub }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px", minWidth: 120 }}>
      <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: color || C.text, fontFamily: "monospace" }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: C.textMuted }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Live Chart Card ──────────────────────────────────────────────────────────
function LiveChartCard({ title, data, color, dataKey, unit, miner, yDomain }) {
  const latest = data[data.length - 1]?.[dataKey] ?? "--";
  const getStatus = (val, key) => {
    if (!val || val === 0) return null;
    if (key === "hr") return val > 100 ? "HIGH" : val < 60 ? "LOW" : "NORMAL";
    if (key === "spo2") return val < 94 ? "CRITICAL" : val < 96 ? "LOW" : "NORMAL";
    return "NORMAL";
  };
  const status = getStatus(latest, dataKey);
  const statusColor = status === "NORMAL" ? C.green : status === "HIGH" || status === "LOW" ? C.amber : C.red;

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{miner}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color }}>
          {latest}{unit}
        </div>
        {status && (
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: `${statusColor}18`,
            color: statusColor, border: `1px solid ${statusColor}40`, fontWeight: 700, letterSpacing: "0.06em" }}>
            {status}
          </span>
        )}
      </div>
      <div style={{ height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${dataKey}-${miner}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
            <YAxis domain={yDomain} tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.text }} />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
              fill={`url(#grad-${dataKey}-${miner})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Device Alert ─────────────────────────────────────────────────────────────
function DeviceAlert({ miners }) {
  const offline = miners.filter(m => !m.active);
  const critical = miners.filter(m => m.active && (m.spo2 < 94 || m.hr > 105 || m.hr < 55));
  if (offline.length === 0 && critical.length === 0) return null;
  return (
    <div style={{ background: C.bg2, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 8, letterSpacing: "0.08em" }}>⚠ SYSTEM ALERTS</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {offline.map(m => (
          <div key={m.id} style={{ fontSize: 11, color: "#fca5a5", background: "rgba(239,68,68,0.1)", padding: "4px 10px", borderRadius: 5 }}>
            {m.name}: DEVICE OFFLINE
          </div>
        ))}
        {critical.map(m => (
          <div key={m.id + "c"} style={{ fontSize: 11, color: C.amber, background: "rgba(245,158,11,0.1)", padding: "4px 10px", borderRadius: 5 }}>
            {m.name}: {m.spo2 < 94 ? `SpO₂ CRITICAL (${m.spo2}%)` : `HR ALERT (${m.hr} bpm)`}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DASHBOARD PAGE ───────────────────────────────────────────────────────────
function DashboardPage({ miners, liveData }) {
  const [selected, setSelected] = useState("MCM-001");
  const miner = miners.find(m => m.id === selected);
  const mdata = liveData[selected] || { hr: [], spo2: [] };

  return (
    <div style={{ padding: "20px 24px", overflow: "auto", height: "100%" }}>
      <DeviceAlert miners={miners} />

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Active Devices" value={miners.filter(m => m.active).length} unit={`/${miners.length}`} color={C.green} />
        <StatCard label="Avg Heart Rate" value={Math.round(miners.filter(m=>m.active).reduce((s,m)=>s+m.hr,0)/miners.filter(m=>m.active).length)} unit="bpm" color={C.red} />
        <StatCard label="Avg SpO₂" value={Math.round(miners.filter(m=>m.active).reduce((s,m)=>s+m.spo2,0)/miners.filter(m=>m.active).length)} unit="%" color={C.cyan} />
        <StatCard label="Alerts" value={miners.filter(m=>m.active&&(m.spo2<94||m.hr>105)).length} color={C.amber} sub="critical readings" />
      </div>

      {/* Device selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {miners.map(m => (
          <button key={m.id} onClick={() => setSelected(m.id)} style={{
            padding: "6px 14px", borderRadius: 6, border: `1px solid`,
            borderColor: selected === m.id ? C.amber : C.border,
            background: selected === m.id ? "rgba(245,158,11,0.1)" : "transparent",
            color: selected === m.id ? C.amber : C.textMuted,
            cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.active ? C.green : C.red, display: "inline-block" }} />
            {m.name}
          </button>
        ))}
      </div>

      {/* Miner info banner */}
      {miner && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 18px",
          display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.06em" }}>SELECTED DEVICE</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{miner.name}</div>
          </div>
          <div style={{ width: 1, height: 30, background: C.border }} />
          <div>
            <div style={{ fontSize: 11, color: C.textMuted }}>ID</div>
            <div style={{ fontSize: 12, fontFamily: "monospace", color: C.amber }}>{miner.id}</div>
          </div>
          <div style={{ width: 1, height: 30, background: C.border }} />
          <div>
            <div style={{ fontSize: 11, color: C.textMuted }}>Location</div>
            <div style={{ fontSize: 12, color: C.textDim }}>{miner.location}</div>
          </div>
          <div style={{ width: 1, height: 30, background: C.border }} />
          <StatusBadge active={miner.active} />
          <div style={{ marginLeft: "auto", fontSize: 11, color: C.textMuted }}>
            Last seen: {miner.active ? "Just now" : new Date(miner.lastSeen).toLocaleTimeString()}
          </div>
        </div>
      )}

      {/* Live charts */}
      {miner?.active ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <LiveChartCard title="Heart Rate" data={mdata.hr} color={C.red} dataKey="hr" unit=" bpm" miner={miner?.name} yDomain={[50, 130]} />
          <LiveChartCard title="Blood Oxygen (SpO₂)" data={mdata.spo2} color={C.cyan} dataKey="spo2" unit="%" miner={miner?.name} yDomain={[88, 100]} />
        </div>
      ) : (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⊘</div>
          <div style={{ fontSize: 14, color: C.textMuted }}>Device is offline. No live data available.</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>Last active: {new Date(miner?.lastSeen).toLocaleString()}</div>
        </div>
      )}

      {/* All miners quick view */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>All Devices — Quick View</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
          {miners.map(m => (
            <div key={m.id} onClick={() => setSelected(m.id)} style={{
              background: C.bg2, border: `1px solid ${selected === m.id ? C.amber : C.border}`,
              borderRadius: 8, padding: "10px 14px", cursor: "pointer",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{m.name}</span>
                <StatusBadge active={m.active} />
              </div>
              {m.active ? (
                <div style={{ display: "flex", gap: 14 }}>
                  <span style={{ fontSize: 11, color: C.textMuted }}>♥ <span style={{ color: C.red, fontFamily: "monospace", fontWeight: 700 }}>{m.hr}</span> bpm</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>O₂ <span style={{ color: C.cyan, fontFamily: "monospace", fontWeight: 700 }}>{m.spo2}</span>%</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: C.textMuted }}>No signal</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ANALYTICS PAGE ───────────────────────────────────────────────────────────
function AnalyticsPage({ miners, analyticsData }) {
  const [filter, setFilter] = useState({ miner: "all", sensor: "both", range: "60min" });

  const getFilteredData = () => {
    let data = {};
    miners.forEach(m => {
      if (filter.miner !== "all" && m.id !== filter.miner) return;
      data[m.id] = analyticsData[m.id] || [];
    });
    return data;
  };

  const filtered = getFilteredData();
  const allMiners = miners.filter(m => filter.miner === "all" || m.id === filter.miner);

  const avgSummary = (key) => {
    const vals = allMiners.filter(m => analyticsData[m.id]?.length > 0).map(m => {
      const d = analyticsData[m.id] || [];
      return d.reduce((s, r) => s + (r[key] || 0), 0) / (d.length || 1);
    });
    return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : "--";
  };

  const avgHR = avgSummary("hr");
  const avgSPO2 = avgSummary("spo2");

  const barData = allMiners.map(m => {
    const d = analyticsData[m.id] || [];
    const avgHR = d.length ? Math.round(d.reduce((s,r)=>s+(r.hr||0),0)/d.length) : 0;
    const avgSPO2 = d.length ? Math.round(d.reduce((s,r)=>s+(r.spo2||0),0)/d.length) : 0;
    return { name: m.name.replace("Miner ","M"), hr: avgHR, spo2: avgSPO2 };
  });

  return (
    <div style={{ padding: "20px 24px", overflow: "auto", height: "100%" }}>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 4 }}>Filters:</div>
        {["miner","sensor","range"].map(f => (
          <select key={f} value={filter[f]} onChange={e => setFilter({...filter, [f]: e.target.value})} style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text,
            padding: "6px 10px", fontSize: 12, cursor: "pointer",
          }}>
            {f === "miner" && [
              <option key="all" value="all">All Miners</option>,
              ...miners.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
            ]}
            {f === "sensor" && [
              <option key="b" value="both">Both Sensors</option>,
              <option key="hr" value="hr">Heart Rate</option>,
              <option key="spo2" value="spo2">SpO₂</option>,
            ]}
            {f === "range" && [
              <option key="60" value="60min">Last 60 min</option>,
              <option key="30" value="30min">Last 30 min</option>,
              <option key="today" value="today">Today</option>,
            ]}
          </select>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 11, color: C.textMuted, fontFamily: "monospace" }}>
          {new Date().toLocaleString()}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Avg Heart Rate" value={avgHR} unit="bpm" color={C.red} />
        <StatCard label="Avg SpO₂" value={avgSPO2} unit="%" color={C.cyan} />
        <StatCard label="Miners Tracked" value={allMiners.length} color={C.amber} />
        <StatCard label="Readings" value={Object.values(filtered).reduce((s,d)=>s+d.length,0)} sub="per minute" />
      </div>

      {/* HR Analytics */}
      {(filter.sensor === "both" || filter.sensor === "hr") && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.red, display: "inline-block" }} />
            Heart Rate — Per Minute Average (bpm)
          </div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} />
                <YAxis domain={[50,130]} tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} />
                <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
                <Legend />
                {allMiners.filter(m=>analyticsData[m.id]?.length>0).map((m,i) => (
                  <Line key={m.id} type="monotone" dataKey="hr" data={analyticsData[m.id]}
                    stroke={[C.red,"#f97316","#fb923c","#fbbf24","#facc15"][i%5]}
                    strokeWidth={1.5} dot={false} name={m.name} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* SpO2 Analytics */}
      {(filter.sensor === "both" || filter.sensor === "spo2") && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.cyan, display: "inline-block" }} />
            SpO₂ — Per Minute Average (%)
          </div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} />
                <YAxis domain={[88,100]} tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} />
                <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
                <Legend />
                {allMiners.filter(m=>analyticsData[m.id]?.length>0).map((m,i) => (
                  <Line key={m.id} type="monotone" dataKey="spo2" data={analyticsData[m.id]}
                    stroke={[C.cyan,"#38bdf8","#7dd3fc","#0ea5e9","#0284c7"][i%5]}
                    strokeWidth={1.5} dot={false} name={m.name} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bar Comparison */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 14 }}>Miner Comparison — Average Readings</div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.textMuted }} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} />
              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
              <Legend />
              {(filter.sensor === "both" || filter.sensor === "hr") && <Bar dataKey="hr" fill={C.red} radius={[4,4,0,0]} name="HR (bpm)" />}
              {(filter.sensor === "both" || filter.sensor === "spo2") && <Bar dataKey="spo2" fill={C.cyan} radius={[4,4,0,0]} name="SpO₂ (%)" />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── ADD DEVICE MODAL ─────────────────────────────────────────────────────────
function AddDeviceModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ name: "", location: "", id: "" });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, width: 380 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 20 }}>Register New Device</div>
        {[["Miner Name","name","e.g. Miner 6"], ["Device ID","id","e.g. MCM-006"], ["Location","location","e.g. Shaft D - Level 1"]].map(([lbl,key,ph]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5, letterSpacing: "0.06em" }}>{lbl.toUpperCase()}</div>
            <input placeholder={ph} value={form[key]} onChange={e => setForm({...form,[key]:e.target.value})}
              style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6,
                color: C.text, padding: "8px 12px", fontSize: 13, boxSizing: "border-box" }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => { if(form.name && form.id && form.location) { onAdd(form); onClose(); } }} style={{
            padding: "8px 16px", borderRadius: 6, border: "none", background: C.amber, color: "#000", fontWeight: 700, cursor: "pointer" }}>Register</button>
        </div>
      </div>
    </div>
  );
}

// ─── DEVICES PAGE ─────────────────────────────────────────────────────────────
function DevicesPage({ miners, setMiners }) {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = miners.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase()));

  const addDevice = (form) => {
    setMiners(prev => [...prev, {
      id: form.id, name: form.name, location: form.location,
      active: false, lastSeen: new Date(), hr: 0, spo2: 0
    }]);
  };

  const toggleActive = (id) => {
    setMiners(prev => prev.map(m => m.id === id ? {...m, active: !m.active, lastSeen: new Date()} : m));
  };

  const removeDevice = (id) => {
    setMiners(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div style={{ padding: "20px 24px", overflow: "auto", height: "100%" }}>
      {showModal && <AddDeviceModal onClose={() => setShowModal(false)} onAdd={addDevice} />}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <input placeholder="Search miners or device ID..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text,
            padding: "8px 14px", fontSize: 13 }} />
        <button onClick={() => setShowModal(true)} style={{
          padding: "8px 18px", borderRadius: 7, border: "none", background: C.amber, color: "#000",
          fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Register Device</button>
      </div>

      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1.5fr 1fr 1fr 100px",
          padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
          fontSize: 10, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          <span>Device ID</span><span>Miner</span><span>Location</span><span>Status</span><span>Last Seen</span><span>Actions</span>
        </div>
        {filtered.map(m => (
          <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1.5fr 1fr 1fr 100px",
            padding: "12px 16px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: C.amber }}>{m.id}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.name}</span>
            <span style={{ fontSize: 12, color: C.textDim }}>{m.location}</span>
            <StatusBadge active={m.active} />
            <span style={{ fontSize: 11, color: C.textMuted }}>{m.active ? "Just now" : new Date(m.lastSeen).toLocaleTimeString()}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => toggleActive(m.id)} style={{
                padding: "4px 8px", borderRadius: 5, border: `1px solid ${C.border}`,
                background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 11 }}>
                {m.active ? "Disable" : "Enable"}
              </button>
              <button onClick={() => removeDevice(m.id)} style={{
                padding: "4px 8px", borderRadius: 5, border: `1px solid rgba(239,68,68,0.3)`,
                background: "transparent", color: C.red, cursor: "pointer", fontSize: 11 }}>✕</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No devices found.</div>
        )}
      </div>
    </div>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage({ miners }) {
  const [hrAlert, setHrAlert] = useState({ min: 55, max: 105 });
  const [spo2Alert, setSpo2Alert] = useState({ min: 94 });
  const [interval, setInterval_] = useState(5);
  const [user, setUser] = useState({ name: "Admin", email: "admin@smartchestminer.io", role: "Supervisor" });
  const [saved, setSaved] = useState(false);

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  return (
    <div style={{ padding: "20px 24px", overflow: "auto", height: "100%", maxWidth: 700 }}>
      {/* User Management */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.amber, marginBottom: 16, letterSpacing: "0.06em", textTransform: "uppercase" }}>User Account</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[["Full Name","name"],["Email","email"],["Role","role"]].map(([lbl,key]) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5 }}>{lbl.toUpperCase()}</div>
              <input value={user[key]} onChange={e => setUser({...user,[key]:e.target.value})} style={{
                width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6,
                color: C.text, padding: "8px 12px", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
      </div>

      {/* Alert Thresholds */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.amber, marginBottom: 16, letterSpacing: "0.06em", textTransform: "uppercase" }}>Alert Thresholds</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5 }}>HR MIN (bpm)</div>
            <input type="number" value={hrAlert.min} onChange={e => setHrAlert({...hrAlert, min: +e.target.value})} style={{
              width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.text, padding: "8px 12px", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5 }}>HR MAX (bpm)</div>
            <input type="number" value={hrAlert.max} onChange={e => setHrAlert({...hrAlert, max: +e.target.value})} style={{
              width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.text, padding: "8px 12px", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5 }}>SpO₂ MIN (%)</div>
            <input type="number" value={spo2Alert.min} onChange={e => setSpo2Alert({min: +e.target.value})} style={{
              width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.text, padding: "8px 12px", fontSize: 13, boxSizing: "border-box" }} />
          </div>
        </div>
      </div>

      {/* System Settings */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.amber, marginBottom: 16, letterSpacing: "0.06em", textTransform: "uppercase" }}>System Settings</div>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5 }}>DATA POLLING INTERVAL (seconds)</div>
          <input type="number" value={interval} min={1} max={60} onChange={e => setInterval_(+e.target.value)} style={{
            width: 120, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.text, padding: "8px 12px", fontSize: 13 }} />
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>REGISTERED DEVICES ({miners.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {miners.map(m => (
              <span key={m.id} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5,
                background: m.active ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                color: m.active ? C.green : C.textMuted, border: `1px solid ${m.active ? "rgba(34,197,94,0.2)" : C.border}` }}>
                {m.name} ({m.id})
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={save} style={{
          padding: "10px 24px", borderRadius: 7, border: "none", background: C.amber, color: "#000",
          fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Save Settings</button>
        {saved && <span style={{ fontSize: 12, color: C.green }}>✓ Settings saved successfully</span>}
      </div>
    </div>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");

  const submit = () => {
    if (form.email === "admin@smartchestminer.io" && form.password === "admin123") onLogin();
    else setErr("Invalid credentials. Try: admin@smartchestminer.io / admin123");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>⛏</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.amber, letterSpacing: "0.12em" }}>SMART CHEST MINER</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, letterSpacing: "0.08em" }}>IOT VITAL SIGN MONITORING SYSTEM</div>
        </div>

        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 20 }}>Sign In</div>
          {[["Email","email","text","admin@smartchestminer.io"],["Password","password","password","••••••••"]].map(([lbl,key,type,ph]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5, letterSpacing: "0.06em" }}>{lbl.toUpperCase()}</div>
              <input type={type} placeholder={ph} value={form[key]} onChange={e => setForm({...form,[key]:e.target.value})}
                onKeyDown={e => e.key === "Enter" && submit()}
                style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7,
                  color: C.text, padding: "10px 14px", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          ))}
          {err && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{err}</div>}
          <button onClick={submit} style={{
            width: "100%", padding: "11px", borderRadius: 7, border: "none", background: C.amber,
            color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14, marginTop: 6 }}>Sign In</button>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 14, textAlign: "center" }}>
            Demo: admin@smartchestminer.io / admin123
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [miners, setMiners] = useState(MINERS_INIT);

  // Live data: last 30 readings per active miner
  const [liveData, setLiveData] = useState(() => {
    const d = {};
    MINERS_INIT.filter(m => m.active).forEach(m => {
      d[m.id] = { hr: [], spo2: [] };
    });
    return d;
  });

  // Analytics: per-minute averages per miner
  const [analyticsData, setAnalyticsData] = useState(() => {
    const d = {};
    MINERS_INIT.forEach(m => { d[m.id] = []; });
    return d;
  });

  const tickRef = useRef(0);
  const minersRef = useRef(miners);

  useEffect(() => {
    minersRef.current = miners;
  }, [miners]);

  useEffect(() => {
    if (!loggedIn) return;
    const interval = setInterval(() => {
      tickRef.current++;
      const t = timeLabel();
      const currentMiners = minersRef.current;

      setMiners(prev => prev.map(m => {
        if (!m.active) return m;
        const hr = generateReading(m.hr || 78, 8);
        const spo2 = Math.min(100, generateReading(m.spo2 || 97, 3));
        return { ...m, hr, spo2, lastSeen: new Date() };
      }));

      setLiveData(prev => {
        const next = { ...prev };
        currentMiners.filter(m => m.active).forEach(m => {
          const hr = generateReading(m.hr || 78, 8);
          const spo2 = Math.min(100, generateReading(m.spo2 || 97, 3));
          const cur = next[m.id] || { hr: [], spo2: [] };
          next[m.id] = {
            hr: [...cur.hr.slice(-29), { time: t, hr }],
            spo2: [...cur.spo2.slice(-29), { time: t, spo2 }],
          };
        });
        return next;
      });

      // Analytics: record every ~6 ticks (≈ per minute simulation)
      if (tickRef.current % 6 === 0) {
        setAnalyticsData(prev => {
          const next = { ...prev };
          currentMiners.forEach(m => {
            if (!m.active) return;
            const hr = generateReading(m.hr || 78, 5);
            const spo2 = Math.min(100, generateReading(m.spo2 || 97, 2));
            next[m.id] = [...(next[m.id] || []).slice(-30), { time: t, hr, spo2 }];
          });
          return next;
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [loggedIn]);

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg0, fontFamily: "'Courier New', monospace", color: C.text }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        * { box-sizing: border-box; }
        input, select { outline: none; }
        ::-webkit-scrollbar { width: 6px; background: ${C.bg1}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        button:hover { opacity: 0.85; }
      `}</style>

      <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Navbar page={page} miners={miners} />
        <main style={{ flex: 1, overflow: "hidden" }}>
          {page === "dashboard" && <DashboardPage miners={miners} liveData={liveData} />}
          {page === "analytics" && <AnalyticsPage miners={miners} analyticsData={analyticsData} />}
          {page === "devices" && <DevicesPage miners={miners} setMiners={setMiners} />}
          {page === "settings" && <SettingsPage miners={miners} />}
        </main>
      </div>
    </div>
  );
}
