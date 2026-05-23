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
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.74)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(10px)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className="soft-in"
        style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, width: "min(460px, calc(100vw - 32px))", boxShadow: C.shadow }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 8, height: 32, borderRadius: 4, background: C.primaryGradient }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{title}</div>
        </div>
        {children}
        {actions && <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>{actions}</div>}
      </div>
    </div>
  );
}
