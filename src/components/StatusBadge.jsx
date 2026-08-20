import { C } from "../theme";

const STATUS_TONES = {
  online: { label: "ONLINE", color: C.green },
  offline: { label: "OFFLINE", color: C.offline },
  stale: { label: "STALE", color: C.amber },
  pending: { label: "PENDING", color: C.amber },
  warning: { label: "WARNING", color: C.amber },
  critical: { label: "CRITICAL", color: C.red },
};

export default function StatusBadge({ active, status, label, detail }) {
  const normalized = status || (active ? "online" : "offline");
  const tone = STATUS_TONES[normalized] || STATUS_TONES.offline;
  const text = label || tone.label;
  const live = normalized === "online";
  const detailLabel = detail ? `: ${detail}` : "";

  return (
    <span
      className={`status-badge is-${normalized}`}
      title={detail || text}
      aria-label={`${text}${detailLabel}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 9px",
        borderRadius: 7,
        background: `${tone.color}1F`,
        color: tone.color,
        border: `1px solid ${tone.color}52`,
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: "0.06em",
      }}
    >
      <span
        aria-hidden="true"
        className={live ? "dot-live" : undefined}
        style={{
          width: 7,
          height: 7,
          flex: "0 0 7px",
          borderRadius: "50%",
          background: tone.color,
          boxShadow: live ? `0 0 9px ${tone.color}` : "none",
        }}
      />
      <span>{text}</span>
    </span>
  );
}
