import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import logo from "../assets/smart-chest-miner-logo.png";
import { C, cardStyle, controlStyle, primaryButtonStyle } from "../theme";

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [localError, setLocalError] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const { login, signUp, authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async () => {
    setLocalError("");
    setLocalMessage("");
    const email = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLocalError("Enter a valid email address.");
      return;
    }
    if (form.password.length < (mode === "login" ? 1 : 6)) {
      setLocalError(mode === "login" ? "Password is required." : "Password must be at least 6 characters.");
      return;
    }
    if (mode === "signup" && form.name.trim().length < 2) {
      setLocalError("Full name is required.");
      return;
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

  const forgotPassword = () => {
    setLocalError("");
    setLocalMessage("Password reset is handled by the system administrator for this prototype.");
  };

  const switchMode = () => {
    setLocalError("");
    setLocalMessage("");
    setMode((value) => (value === "login" ? "signup" : "login"));
  };

  return (
    <div className="login-stage" style={{ height: "100vh", background: C.bg0, display: "grid", placeItems: "center", overflow: "hidden", position: "relative", padding: 24, boxSizing: "border-box" }}>
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
              <div style={{ color: C.text, fontSize: 18, fontWeight: 950, marginTop: 12 }}>Smart Chest Miner</div>
              <div style={{ color: C.textMuted, fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 4 }}>Secure sensor access</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ color: C.text, fontSize: 22, fontWeight: 900 }}>{mode === "login" ? "Welcome Back" : "Request Access"}</div>
              <div style={{ color: C.textMuted, fontSize: 12, marginTop: 6 }}>{mode === "login" ? "Sign in to monitor miner vitals and alerts." : "Create a supervisor profile for this browser."}</div>
            </div>

            <LivePulseInline />

            <div style={{ display: "grid", gap: 14 }}>
              {mode === "signup" && <Field label="Full Name" value={form.name} autoComplete="name" onChange={(name) => setForm({ ...form, name })} placeholder="Juan Dela Cruz" />}
              <Field label="Email" value={form.email} autoComplete="email" onChange={(email) => setForm({ ...form, email })} placeholder="admin@smartchestminer.io" />
              <Field label="Password" type="password" value={form.password} autoComplete={mode === "login" ? "current-password" : "new-password"} onChange={(password) => setForm({ ...form, password })} placeholder={mode === "login" ? "password" : "at least 6 characters"} onEnter={submit} />
            </div>

            {mode === "login" && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 12 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.textMuted, fontSize: 11, cursor: "pointer" }}>
                  <input type="checkbox" checked={remember} onChange={() => setRemember((value) => !value)} style={{ minHeight: 0 }} />
                  Remember me
                </label>
                <button onClick={forgotPassword} style={{ border: "none", background: "transparent", color: C.primary, cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 800 }}>
                  Forgot password?
                </button>
              </div>
            )}

            {(localError || authError) && <Notice tone="danger">{localError || authError}</Notice>}
            {localMessage && <Notice tone="good">{localMessage}</Notice>}

            <button disabled={busy} onClick={submit} style={{ ...primaryButtonStyle, width: "100%", padding: 12, marginTop: 18, fontSize: 14 }}>
              {busy ? "Checking..." : mode === "login" ? "Open Dashboard" : "Create Account"}
            </button>

            <div style={{ display: "flex", justifyContent: "center", gap: 6, color: C.textMuted, fontSize: 12, marginTop: 16 }}>
              <span>{mode === "login" ? "Don't have an account?" : "Already have an account?"}</span>
              <button onClick={switchMode} style={{ border: "none", background: "transparent", color: C.primary, cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 900 }}>
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </div>

            <div style={{ color: C.textMuted, fontSize: 10, textAlign: "center", marginTop: 22 }}>Smart Chest Miner © 2026</div>

            </div>
          </div>
      </div>
    </div>
  );
}

function Logo({ size }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 12, background: C.text, border: `1px solid rgba(255,106,0,0.42)`, display: "grid", placeItems: "center", overflow: "hidden", boxShadow: "0 0 24px rgba(255,106,0,0.2)", flexShrink: 0 }}>
      <img src={logo} alt="Smart Chest Miner" style={{ width: "92%", height: "92%", objectFit: "contain" }} />
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, autoComplete, onEnter }) {
  return (
    <label>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onEnter?.()}
        style={{ ...controlStyle, width: "100%", padding: "11px 13px" }}
      />
    </label>
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
        {Array.from({ length: 24 }).map((_, index) => (
          <span key={index} style={{ height: `${8 + Math.abs(Math.sin(index * 0.72)) * 24}px`, animationDelay: `${index * 0.045}s` }} />
        ))}
      </div>
    </div>
  );
}
