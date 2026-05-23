import { C } from "../theme";

export default function StatusBadge({ active }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.05em",
        padding: "4px 9px",
        borderRadius: 4,
        background: active ? "rgba(34,197,94,0.12)" : "rgba(107,114,128,0.12)",
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
          boxShadow: active ? `0 0 6px ${C.green}` : "none",
          animation: active ? "pulse 1.5s infinite" : "none",
        }}
      />
      {active ? "ONLINE" : "OFFLINE"}
    </span>
  );
}
