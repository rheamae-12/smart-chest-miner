import { C } from "../theme";

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
        background: active ? "rgba(34,197,94,0.13)" : "rgba(107,114,128,0.12)",
        color: active ? C.green : C.offline,
        border: `1px solid ${active ? "rgba(34,197,94,0.32)" : "rgba(107,114,128,0.32)"}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
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
