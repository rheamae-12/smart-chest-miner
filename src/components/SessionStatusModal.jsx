import Modal from "./Modal";
import { C } from "../theme";
import { formatLastSeen } from "../utils/formatters";

const OPTIONS = [
  {
    value: "completed",
    label: "Completed",
    description: "The miner intentionally stopped. Close the session normally.",
    color: C.green,
  },
  {
    value: "interrupted",
    label: "Interrupted",
    description: "The miner stopped unexpectedly. Record this as a disrupted session.",
    color: C.red,
  },
  {
    value: "offline",
    label: "Offline",
    description: "The device is unreachable. Keep the session marked offline until it reconnects.",
    color: C.offline,
  },
];

export default function SessionStatusModal({ session, onSelect }) {
  return (
    <Modal title="Session stopped sending data" width={620}>
      <div style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.55 }}>
        <strong style={{ color: C.text }}>{session.name}</strong> ({session.deviceId}) has not sent a reading within the offline timeout.
        Choose the status that best describes what happened.
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            style={{
              display: "grid",
              gridTemplateColumns: "10px minmax(0, 1fr) auto",
              alignItems: "center",
              gap: 11,
              width: "100%",
              padding: "13px 14px",
              textAlign: "left",
              border: `1px solid ${option.color}38`,
              borderLeft: `3px solid ${option.color}`,
              borderRadius: 10,
              background: `${option.color}0D`,
              color: C.text,
              cursor: "pointer",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: option.color, boxShadow: `0 0 10px ${option.color}` }} />
            <span>
              <strong style={{ display: "block", fontSize: 13 }}>{option.label}</strong>
              <span style={{ display: "block", marginTop: 3, color: C.textMuted, fontSize: 11, lineHeight: 1.4 }}>{option.description}</span>
            </span>
            <span style={{ color: option.color, fontSize: 18 }}>›</span>
          </button>
        ))}
      </div>

      <div style={{ color: C.textMuted, fontSize: 10, marginTop: 14 }}>
        Last contact: {formatLastSeen(session.lastSeen)}
      </div>
    </Modal>
  );
}
