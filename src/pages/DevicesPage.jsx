import { useState } from "react";
import StatusBadge from "../components/StatusBadge";
import { C, cardStyle } from "../theme";
import { formatLastSeen } from "../utils/formatters";

export default function DevicesPage({ miners }) {
  const [search, setSearch] = useState("");
  const filtered = miners.filter((miner) => `${miner.name} ${miner.id}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ padding: "20px 24px", overflow: "auto", height: "100%" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <input
          placeholder="Search Miner 1 or MCM-001..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ flex: 1, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: "8px 14px", fontSize: 13 }}
        />
      </div>

      <div style={{ ...cardStyle, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={tableRowHeader}>
            <span>Device ID</span>
            <span>Miner</span>
            <span>Location</span>
            <span>Status</span>
            <span>Last Seen</span>
            <span>Source</span>
          </div>
          {filtered.map((miner) => (
            <div key={miner.id} style={tableRow}>
              <span style={{ color: C.amber }}>{miner.id}</span>
              <span style={{ fontWeight: 500, color: C.text }}>{miner.name}</span>
              <span style={{ color: C.textDim }}>{miner.location}</span>
              <StatusBadge active={miner.active} />
              <span style={{ color: miner.stale ? C.amber : C.textMuted }}>{miner.stale ? "No recent update" : formatLastSeen(miner.lastSeen)}</span>
              <span style={{ color: C.textMuted }}>ESP32 / Firebase</span>
            </div>
          ))}
        </div>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No device found.</div>}
      </div>
    </div>
  );
}

const tableRowHeader = {
  display: "grid",
  gridTemplateColumns: "1fr 2fr 1.5fr 1fr 1fr 120px",
  minWidth: 760,
  gap: 12,
  padding: "10px 16px",
  borderBottom: `1px solid ${C.border}`,
  fontSize: 10,
  color: C.textMuted,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const tableRow = {
  display: "grid",
  gridTemplateColumns: "1fr 2fr 1.5fr 1fr 1fr 120px",
  minWidth: 760,
  gap: 12,
  padding: "12px 16px",
  borderBottom: `1px solid ${C.border}`,
  alignItems: "center",
  fontSize: 12,
};
