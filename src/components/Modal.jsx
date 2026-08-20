import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { C } from "../theme";

const modalStack = [];
let savedBodyOverflow = "";

// Accessible, viewport-safe dialog with deterministic stacking and focus handling.
export default function Modal({ title, children, actions, onClose, width = 560, className = "" }) {
  const panelRef = useRef(null);
  const modalId = useRef(Symbol("modal"));
  const closeRef = useRef(onClose);
  const titleId = useId();
  const widthValue = typeof width === "number" ? `${width}px` : width;
  const panelWidth = `min(${widthValue}, calc(100vw - 32px))`;

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const id = modalId.current;
    const previouslyFocused = document.activeElement;
    if (modalStack.length === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    modalStack.push(id);

    const focusTimer = window.setTimeout(() => {
      const firstControl = panelRef.current?.querySelector(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      (firstControl || panelRef.current)?.focus();
    }, 0);

    const onKeyDown = (event) => {
      if (modalStack.at(-1) !== id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...(panelRef.current?.querySelectorAll(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ) || [])];
      if (!controls.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      const index = modalStack.lastIndexOf(id);
      if (index >= 0) modalStack.splice(index, 1);
      if (modalStack.length === 0) document.body.style.overflow = savedBodyOverflow;
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const dialog = (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.76)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000 + modalStack.length,
        padding: 16,
        backdropFilter: "blur(12px)",
      }}
    >
      <dialog
        open
        ref={panelRef}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`soft-in modal-panel ${className}`.trim()}
        style={{
          background: `linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02)), ${C.bg2}`,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          width: panelWidth,
          maxHeight: "min(88vh, 820px)",
          boxShadow: C.shadow,
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 22px 14px" }}>
          <div style={{ width: 7, height: 34, borderRadius: 999, background: C.primaryGradient, boxShadow: "0 0 22px rgba(255,106,0,0.28)", flexShrink: 0 }} />
          <div id={titleId} style={{ fontSize: 17, fontWeight: 900, color: C.text, letterSpacing: "0.01em", flex: 1 }}>{title}</div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              style={{ width: 30, height: 30, borderRadius: 7, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.textMuted, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, fontSize: 16, lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </header>
        <div className="modal-body hide-scrollbar" style={{ overflowY: "auto", overscrollBehavior: "contain", padding: "4px 22px 2px", minHeight: 0 }}>
          {children}
        </div>
        {actions && (
          <footer style={{ display: "flex", gap: 10, padding: "16px 22px 20px", justifyContent: "flex-end", flexWrap: "wrap", borderTop: `1px solid ${C.borderSoft}`, marginTop: 14 }}>
            {actions}
          </footer>
        )}
      </dialog>
    </div>
  );

  return createPortal(dialog, document.body);
}
