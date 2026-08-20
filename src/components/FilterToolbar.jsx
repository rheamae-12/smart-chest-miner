import { C, cardStyle, controlStyle, ghostButtonStyle } from "../theme";

export default function FilterToolbar({
  children,
  summary,
  activeCount = 0,
  onReset,
  label = "Filter view",
}) {
  const activeBorder = activeCount ? `${C.primary}58` : C.borderSoft;
  return (
    <section className="filter-toolbar" style={{ ...cardStyle, padding: "11px 14px" }}>
      <div className="filter-toolbar-summary">
        <span className="filter-toolbar-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <strong style={{ color: C.text, fontSize: 12 }}>{label}</strong>
            <span
              style={{
                minWidth: 20,
                padding: "2px 6px",
                borderRadius: 999,
                color: activeCount ? C.primary : C.textMuted,
                border: `1px solid ${activeBorder}`,
                background: activeCount ? `${C.primary}14` : "rgba(255,255,255,0.025)",
                fontSize: 9,
                fontWeight: 900,
                textAlign: "center",
              }}
            >
              {activeCount ? `${activeCount} active` : "default"}
            </span>
          </div>
          <div className="filter-toolbar-description">{summary}</div>
        </div>
      </div>
      <div className="filter-toolbar-controls">
        {children}
        {activeCount > 0 && onReset && (
          <button
            type="button"
            className="filter-reset-button"
            onClick={onReset}
            style={{ ...ghostButtonStyle, padding: "8px 12px", fontSize: 11, whiteSpace: "nowrap" }}
          >
            Reset view
          </button>
        )}
      </div>
    </section>
  );
}

export function FilterField({ label, children, wide = false, className = "" }) {
  const fieldClass = wide ? "filter-field is-wide" : "filter-field";
  const extraClass = className ? ` ${className}` : "";
  return (
    <label className={`${fieldClass}${extraClass}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function FilterTabs({ value, onChange, options, ariaLabel }) {
  return (
    <fieldset className="filter-tabs" style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="sr-only">{ariaLabel}</legend>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            type="button"
            key={option.value}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={active ? "is-active" : ""}
          >
            {option.label}
            {option.count !== undefined && <span>{option.count}</span>}
          </button>
        );
      })}
    </fieldset>
  );
}

export function FilterSearch({ value, onChange, placeholder, ariaLabel = "Search" }) {
  return (
    <div className="filter-search">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={controlStyle}
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search" title="Clear search">
          ×
        </button>
      )}
    </div>
  );
}
