import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { C, cardStyle } from "../theme";

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const { login, signUp, authError, authMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async () => {
    const ok = mode === "login" ? await login(form.email, form.password) : await signUp(form);
    if (ok) navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.amber, letterSpacing: "0.12em" }}>SMART CHEST MINER</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, letterSpacing: "0.08em" }}>IOT VITAL SIGN MONITORING SYSTEM</div>
        </div>

        <div style={{ ...cardStyle, padding: 28 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <ModeButton active={mode === "login"} onClick={() => setMode("login")}>
              Log In
            </ModeButton>
            <ModeButton active={mode === "signup"} onClick={() => setMode("signup")}>
              Sign Up
            </ModeButton>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 20 }}>{mode === "login" ? "Log In" : "Create Account"}</div>
          {[
            ...(mode === "signup" ? [["Full Name", "name", "text", "Juan Dela Cruz"]] : []),
            ["Email", "email", "text", "admin@smartchestminer.io"],
            ["Password", "password", "password", mode === "login" ? "password" : "at least 6 characters"],
          ].map(([label, key, type, placeholder]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5, letterSpacing: "0.06em" }}>{label.toUpperCase()}</div>
              <input
                type={type}
                placeholder={placeholder}
                value={form[key]}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                onKeyDown={(event) => event.key === "Enter" && submit()}
                style={{ width: "100%", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: "10px 14px", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
          ))}
          {authError && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{authError}</div>}
          {authMessage && <div style={{ fontSize: 12, color: C.green, marginBottom: 12 }}>{authMessage}</div>}
          <button onClick={submit} style={{ width: "100%", padding: 11, borderRadius: 7, border: "none", background: C.amber, color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14, marginTop: 6 }}>
            {mode === "login" ? "Log In" : "Sign Up"}
          </button>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 14, textAlign: "center" }}>Demo: admin@smartchestminer.io / admin123</div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        border: `1px solid ${active ? C.amber : C.border}`,
        background: active ? "rgba(245,158,11,0.12)" : "transparent",
        color: active ? C.amber : C.textMuted,
        borderRadius: 7,
        padding: 9,
        cursor: "pointer",
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}
