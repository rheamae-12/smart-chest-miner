import { useEffect } from "react";
import { C } from "../theme";

export default function Modal({ title, children, actions, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(14px)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className="soft-in modal-panel"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02)), " + C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, width: "min(520px, calc(100vw - 32px))", boxShadow: C.shadow }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 8, height: 34, borderRadius: 999, background: C.primaryGradient, boxShadow: "0 0 22px rgba(255,106,0,0.28)" }} />
          <div style={{ fontSize: 17, fontWeight: 900, color: C.text, letterSpacing: "0.01em" }}>{title}</div>
        </div>
        {children}
        {actions && <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end", flexWrap: "wrap" }}>{actions}</div>}
      </div>
    </div>
  );
}
