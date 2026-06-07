import { C } from "../theme";

// StatusBadge — pill showing ONLINE (green) or OFFLINE (grey) for a miner row
export default function StatusBadge({ active }) {
  return (
    <span
      className={`status-badge ${active ? "is-online" : "is-offline"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.05em",
        padding: "4px 9px",
        borderRadius: 7,
        background: active ? `${C.green}21` : `${C.offline}1F`,
        color: active ? C.green : C.offline,
        border: `1px solid ${active ? `${C.green}52` : `${C.offline}52`}`,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: active ? C.green : C.offline,
          boxShadow: active ? `0 0 10px ${C.green}` : "none",
          animation: active ? "pulse 1.5s infinite, onlineHalo 2.4s ease-in-out infinite" : "none",
        }}
      />
      {active ? "ONLINE" : "OFFLINE"}
    </span>
  );
}
