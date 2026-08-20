import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { firebaseConfigured } from "../firebase/config";
import logo from "../assets/smart-chest-miner-logo.png";
import { C, cardStyle, controlStyle, primaryButtonStyle } from "../theme";
import { passwordMeetsPolicy, passwordRequirements, passwordStrength } from "../utils/password";
import { isValidEmail } from "../utils/validation";

const PASSWORD_STRENGTH_SEGMENTS = ["length", "case", "number", "symbol"];
const PULSE_WAVE_KEYS = [
  "wave-01", "wave-02", "wave-03", "wave-04", "wave-05", "wave-06",
  "wave-07", "wave-08", "wave-09", "wave-10", "wave-11", "wave-12",
  "wave-13", "wave-14", "wave-15", "wave-16", "wave-17", "wave-18",
  "wave-19", "wave-20", "wave-21", "wave-22", "wave-23", "wave-24",
];

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [localError, setLocalError] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const { login, signUp, resetPassword, authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async () => {
    setLocalError("");
    setLocalMessage("");
    const email = form.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setLocalError("Enter a valid email address.");
      return;
    }
    if (mode === "login" && !form.password) {
      setLocalError("Password is required.");
      return;
    }
    if (mode === "signup") {
      if (form.name.trim().length < 2) {
        setLocalError("Full name is required.");
        return;
      }
      if (!passwordMeetsPolicy(form.password)) {
        setLocalError("Password must meet all the strength requirements below.");
        return;
      }
      if (form.password !== form.confirm) {
        setLocalError("Passwords do not match.");
        return;
      }
    }

    setBusy(true);
    const ok = mode === "login" ? await login(email, form.password, remember) : await signUp({ ...form, email });
    setBusy(false);
    if (ok) {
      const loggedOut = sessionStorage.getItem("smart-chest-miner-logged-out") === "true";
      sessionStorage.removeItem("smart-chest-miner-logged-out");
      navigate(loggedOut ? "/dashboard" : location.state?.from?.pathname || "/dashboard", { replace: true, state: null });
    }
  };

  const forgotPassword = async () => {
    setLocalError("");
    setLocalMessage("");
    const email = form.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setLocalError("Enter your account email above first, then tap Forgot password.");
      return;
    }
    if (!firebaseConfigured) {
      setLocalMessage("Password reset is handled by the system administrator for this prototype build.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email);
    } catch {
      // Swallow — never reveal whether an email is registered (anti-enumeration).
    } finally {
      setBusy(false);
      // Always show the same neutral confirmation regardless of outcome.
      setLocalMessage("If an account exists for that email, a password reset link has been sent.");
    }
  };

  const switchMode = () => {
    setLocalError("");
    setLocalMessage("");
    setForm((prev) => ({ ...prev, password: "", confirm: "" }));
    setMode((value) => (value === "login" ? "signup" : "login"));
  };

  return (
    <div className="login-stage" style={{ height: "100dvh", background: C.bg0, display: "grid", placeItems: "center", overflow: "hidden", position: "relative", padding: 24, boxSizing: "border-box" }}>
      <div className="login-gridline" />
      <div className="login-orb login-orb-a" />
      <div className="login-orb login-orb-b" />
      <div className="login-pulse-field" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div style={{ width: "min(500px, 100%)", position: "relative" }} className="soft-in">
          <div className="login-card" style={{ ...cardStyle, padding: 28, background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.028)), rgba(23,25,28,0.96)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -70, right: -60, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,106,0,0.12)", filter: "blur(4px)" }} />
            <div style={{ position: "absolute", bottom: -80, left: -70, width: 170, height: 170, borderRadius: "50%", background: "rgba(34,197,94,0.07)", filter: "blur(5px)" }} />
            <div style={{ position: "relative" }}>
            <div style={{ display: "grid", placeItems: "center", textAlign: "center", marginBottom: 24 }}>
              <Logo size={58} />
              <div style={{ color: C.text, fontSize: 18, fontWeight: 950, marginTop: 12 }}>Smart MinerGuard</div>
              <div style={{ color: C.textMuted, fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 4 }}>Secure sensor access</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ color: C.text, fontSize: 22, fontWeight: 900 }}>{mode === "login" ? "Welcome Back" : "Request Access"}</div>
              <div style={{ color: C.textMuted, fontSize: 12, marginTop: 6 }}>{mode === "login" ? "Sign in to monitor miner vitals and alerts." : "Create a supervisor profile for this browser."}</div>
            </div>

            <LivePulseInline />

            <div style={{ display: "grid", gap: 14 }}>
              {mode === "signup" && <Field label="Full Name" value={form.name} autoComplete="name" onChange={(name) => setForm({ ...form, name })} placeholder="Juan Cruz" />}
              <Field label="Email" value={form.email} autoComplete="email" onChange={(email) => setForm({ ...form, email })} placeholder="admin@smartchestminer.io" />
              <Field label="Password" type="password" value={form.password} autoComplete={mode === "login" ? "current-password" : "new-password"} onChange={(password) => setForm({ ...form, password })} placeholder={mode === "login" ? "password" : "create a strong password"} onEnter={submit} />
              {mode === "signup" && form.password && <PasswordStrength password={form.password} />}
              {mode === "signup" && (
                <Field label="Confirm Password" type="password" value={form.confirm} autoComplete="new-password" onChange={(confirm) => setForm({ ...form, confirm })} placeholder="re-enter password" onEnter={submit} />
              )}
              {mode === "signup" && form.confirm.length > 0 && <MatchHint match={form.password === form.confirm} />}
            </div>

            {mode === "login" && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 12 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.textMuted, fontSize: 11, cursor: "pointer" }}>
                  <input type="checkbox" checked={remember} onChange={() => setRemember((value) => !value)} style={{ minHeight: 0 }} />
                  <span>Remember me</span>
                </label>
                <button type="button" onClick={forgotPassword} style={{ border: "none", background: "transparent", color: C.primary, cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 800 }}>
                  Forgot password?
                </button>
              </div>
            )}

            {(localError || authError) && <Notice tone="danger">{localError || authError}</Notice>}
            {localMessage && <Notice tone="good">{localMessage}</Notice>}

            <button
              type="button"
              disabled={busy || (mode === "signup" && (!passwordMeetsPolicy(form.password) || form.password !== form.confirm || form.name.trim().length < 2))}
              onClick={submit}
              style={{ ...primaryButtonStyle, width: "100%", padding: 12, marginTop: 18, fontSize: 14, opacity: busy ? 0.7 : 1 }}
            >
              {submitButtonLabel(busy, mode)}
            </button>

            <div style={{ display: "flex", justifyContent: "center", gap: 6, color: C.textMuted, fontSize: 12, marginTop: 16 }}>
              <span>{mode === "login" ? "Don't have an account?" : "Already have an account?"}</span>
              <button type="button" onClick={switchMode} style={{ border: "none", background: "transparent", color: C.primary, cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 900 }}>
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </div>

            <div style={{ color: C.textMuted, fontSize: 10, textAlign: "center", marginTop: 22 }}>Smart MinerGuard © 2026</div>

            </div>
          </div>
      </div>
    </div>
  );
}

function submitButtonLabel(busy, mode) {
  if (busy) return "Checking...";
  return mode === "login" ? "Open Dashboard" : "Create Account";
}

function fieldInputType(isPassword, show, type) {
  if (!isPassword) return type;
  return show ? "text" : "password";
}

function Logo({ size }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 12, background: C.text, border: `1px solid rgba(255,106,0,0.42)`, display: "grid", placeItems: "center", overflow: "hidden", boxShadow: "0 0 24px rgba(255,106,0,0.2)", flexShrink: 0 }}>
      <img src={logo} alt="Smart MinerGuard" style={{ width: "92%", height: "92%", objectFit: "contain" }} />
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, autoComplete, onEnter }) {
  const [show, setShow] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const isPassword = type === "password";
  const handleKey = (event) => {
    if (typeof event.getModifierState === "function") setCapsOn(event.getModifierState("CapsLock"));
    if (event.key === "Enter") onEnter?.();
  };
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ position: "relative" }}>
        <input
          type={fieldInputType(isPassword, show, type)}
          placeholder={placeholder}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKey}
          onKeyUp={handleKey}
          onBlur={() => setCapsOn(false)}
          style={{ ...controlStyle, width: "100%", padding: isPassword ? "11px 42px 11px 13px" : "11px 13px", boxSizing: "border-box" }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            style={{
              position: "absolute",
              right: 11,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: show ? C.primary : C.textMuted,
              padding: 4,
              display: "flex",
              alignItems: "center",
              lineHeight: 0,
              transition: "color 0.15s ease",
            }}
            title={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {isPassword && capsOn && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: C.amber, fontSize: 10, fontWeight: 700, marginTop: 6 }}>
          <span aria-hidden="true">⚠</span> Caps Lock is on
        </div>
      )}
    </label>
  );
}

// PasswordStrength — live strength meter + requirement checklist shown during sign-up
function PasswordStrength({ password }) {
  const { score, color, label } = passwordStrength(password);
  const reqs = passwordRequirements(password);
  return (
    <div style={{ display: "grid", gap: 8, marginTop: -4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3, flex: 1 }}>
          {PASSWORD_STRENGTH_SEGMENTS.map((segment, index) => (
            <div key={segment} style={{ height: 4, borderRadius: 2, background: index < score ? color : C.borderSoft, transition: "background 0.2s" }} />
          ))}
        </div>
        <span style={{ color, fontSize: 10, fontWeight: 900, minWidth: 50, textAlign: "right" }}>{label}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
        {reqs.map((req) => (
          <div key={req.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: req.met ? C.green : C.textMuted, fontSize: 12, lineHeight: 1 }}>{req.met ? "✓" : "○"}</span>
            <span style={{ color: req.met ? C.green : C.textMuted, fontSize: 10 }}>{req.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// MatchHint — confirm-password match indicator
function MatchHint({ match }) {
  const color = match ? C.green : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: -4 }}>
      <span style={{ color, fontSize: 12 }}>{match ? "✓" : "✗"}</span>
      <span style={{ color, fontSize: 10 }}>{match ? "Passwords match" : "Passwords do not match"}</span>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function Notice({ tone, children }) {
  const color = tone === "good" ? C.green : C.red;
  return <div style={{ color, background: `${color}12`, border: `1px solid ${color}35`, borderRadius: 7, padding: "9px 11px", fontSize: 12, marginTop: 14 }}>{children}</div>;
}

function LivePulseInline() {
  return (
    <div className="login-inline-pulse">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ color: C.textMuted, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>Live Pulse</div>
          <div style={{ color: C.green, fontSize: 12, fontWeight: 900, marginTop: 3 }}>Sensor standby</div>
        </div>
        <span className="login-live-dot" />
      </div>
      <div className="login-wave compact" aria-hidden="true">
        {PULSE_WAVE_KEYS.map((key, index) => (
          <span key={key} style={{ height: `${8 + Math.abs(Math.sin(index * 0.72)) * 24}px`, animationDelay: `${index * 0.045}s` }} />
        ))}
      </div>
    </div>
  );
}
