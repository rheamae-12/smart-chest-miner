import { C } from "../theme";

export default function StatusBadge({ active }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.05em",
        padding: "3px 8px",
        borderRadius: 4,
        background: active ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        color: active ? C.green : C.red,
        border: `1px solid ${active ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: active ? C.green : C.red,
          boxShadow: active ? `0 0 6px ${C.green}` : "none",
          animation: active ? "pulse 1.5s infinite" : "none",
        }}
      />
      {active ? "ONLINE" : "OFFLINE"}
    </span>
  );
}
