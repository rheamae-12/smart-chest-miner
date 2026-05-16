import { C } from "../theme";

export default function Modal({ title, children, actions, onClose }) {
  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 28, width: "min(420px, calc(100vw - 32px))" }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 20 }}>{title}</div>
        {children}
        {actions && <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>{actions}</div>}
      </div>
    </div>
  );
}
