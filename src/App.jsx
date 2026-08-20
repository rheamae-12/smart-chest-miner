import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Modal from "./components/Modal";
import SessionStatusModal from "./components/SessionStatusModal";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/useAuth";
import { useMinerSystem } from "./hooks/useMinerSystem";
import { useAlertNotifications } from "./hooks/useAlertNotifications";
import { buildAlerts } from "./utils/alertChecker";
import { C, ghostButtonStyle, primaryButtonStyle } from "./theme";

const DISMISSED_ALERTS_STORAGE_KEY = "smart-chest-miner-dismissed-alerts";
const CommandCenterPage = lazy(() => import("./pages/CommandCenterPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const DevicesPage = lazy(() => import("./pages/DevicesPage"));
const HealthLogsPage = lazy(() => import("./pages/HealthLogsPage"));
const HealthAnalysisPage = lazy(() => import("./pages/HealthAnalysisPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SensorStatusPage = lazy(() => import("./pages/SensorStatusPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AlertHistoryPage = lazy(() => import("./pages/AlertHistoryPage"));

export default function App() {
  const { user, logout, authReady, canManage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const system = useMinerSystem(Boolean(user));
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [sosWarning, setSosWarning] = useState(null);
  const knownSosKeysRef = useRef(null);
  const liveAlerts = useMemo(() => (user ? buildAlerts(system.miners, system.thresholds) : []), [system.miners, system.thresholds, user]);
  useAlertNotifications(liveAlerts);
  const [dismissedAlertIds, setDismissedAlertIds] = useState(() => readStoredStringArray(DISMISSED_ALERTS_STORAGE_KEY));
  const dismissAlerts = (ids) => {
    setDismissedAlertIds((current) => [...new Set([...current, ...ids])]);
  };

  const confirmLogout = () => setLogoutOpen(true);
  const handleLogout = async () => {
    setLogoutOpen(false);
    sessionStorage.setItem("smart-chest-miner-logged-out", "true");
    await logout();
    navigate("/login", { replace: true, state: null });
  };

  useEffect(() => {
    localStorage.setItem(DISMISSED_ALERTS_STORAGE_KEY, JSON.stringify(dismissedAlertIds));
  }, [dismissedAlertIds]);

  useEffect(() => {
    let warningTimer;
    if (!user) {
      knownSosKeysRef.current = null;
      return undefined;
    }
    const activeSosAlerts = liveAlerts.filter((alert) => alert.id.endsWith("-manual"));
    const activeSosKeys = new Set(activeSosAlerts.map((alert) => sosAlertKey(alert, system.miners)));
    if (!knownSosKeysRef.current) {
      knownSosKeysRef.current = activeSosKeys;
      if (activeSosAlerts.length) warningTimer = window.setTimeout(() => setSosWarning(activeSosAlerts[0]), 0);
      return () => window.clearTimeout(warningTimer);
    }
    const newlyPressed = activeSosAlerts.find((alert) => !knownSosKeysRef.current.has(sosAlertKey(alert, system.miners)));
    if (newlyPressed) warningTimer = window.setTimeout(() => setSosWarning(newlyPressed), 0);
    knownSosKeysRef.current = activeSosKeys;
    return () => window.clearTimeout(warningTimer);
  }, [liveAlerts, system.miners, user]);

  if (!authReady) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <div className="spinner" />
        <span style={{ color: C.textMuted, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>Connecting…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <ProtectedRoute>
      {logoutOpen && (
        <Modal
          title="End Session"
          onClose={() => setLogoutOpen(false)}
          actions={
            <>
              <button type="button" onClick={() => setLogoutOpen(false)} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                style={{ ...primaryButtonStyle, padding: "9px 15px" }}
              >
                Log Out
              </button>
            </>
          }
        >
          <div style={{ color: C.textDim, fontSize: 13, lineHeight: 1.6 }}>Log out of the Smart MinerGuard console? Live device monitoring will stop for this browser session.</div>
        </Modal>
      )}
      {sosWarning && (
        <Modal
          title="Manual SOS activated"
          width={590}
          onClose={() => setSosWarning(null)}
          actions={(
            <>
              <button type="button" onClick={() => setSosWarning(null)} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>Acknowledge</button>
              <button type="button" onClick={() => { setSosWarning(null); navigate("/alert-history"); }} style={{ ...primaryButtonStyle, padding: "9px 15px" }}>Open Alert Logs</button>
            </>
          )}
        >
          <div className="sos-warning-modal" style={{ borderColor: `${C.red}55`, background: `${C.red}0d` }}>
            <div className="sos-warning-icon"><span>!</span></div>
            <div>
              <div style={{ color: C.red, fontSize: 15, fontWeight: 950 }}>{sosWarning.message?.split(":")[0] || "A miner"} needs immediate attention.</div>
              <div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.55, marginTop: 7 }}>The manual SOS button was pressed. Check the miner’s wellbeing now, confirm the sensor reading and location, and follow your site emergency response procedure.</div>
            </div>
          </div>
          <div style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.5, marginTop: 14 }}>This alert is recorded in Alert Logs. Sensor readings can support the response, but they cannot determine the cause of an SOS.</div>
        </Modal>
      )}
      {system.sessionPrompt && (
        <SessionStatusModal
          session={system.sessionPrompt}
          onSelect={(sessionStatus) => system.resolveSessionStatus(system.sessionPrompt, sessionStatus)}
        />
      )}
      <div
        className="app-shell"
        style={{
          display: "flex",
          height: "100dvh",
          background: C.bg0,
          color: C.text,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Sidebar />
        <div className="app-content" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          <Navbar
            miners={system.miners}
            user={user}
            onLogout={confirmLogout}
            usingRealtime={system.usingRealtime}
            connectionError={system.connectionError}
            activityLogs={system.activityLogs}
            thresholds={system.thresholds}
            dismissedAlertIds={dismissedAlertIds}
            onDismissAlerts={dismissAlerts}
          />
          <main className="app-main" style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
            {system.connectionError && (
              <div style={{ padding: "9px 22px", background: "rgba(245,158,11,0.12)", color: C.amber, borderBottom: `1px solid ${C.borderSoft}`, fontSize: 12, fontWeight: 700 }}>
                Firebase notice: {system.connectionError}
              </div>
            )}
            <Suspense fallback={<RouteFallback />}>
              <ErrorBoundary key={location.pathname}>
              <div className="app-route-content" style={{ height: "100%", display: "contents" }}>
              <Routes>
                <Route path="/" element={<Navigate to="/command" replace />} />
                <Route
                  path="/command"
                  element={<CommandCenterPage miners={system.miners} liveData={system.liveData} activityLogs={system.activityLogs} thresholds={system.thresholds} dismissedAlertIds={dismissedAlertIds} onDismissAlerts={dismissAlerts} />}
                />
                <Route
                  path="/dashboard"
                  element={<DashboardPage miners={system.miners} liveData={system.liveData} thresholds={system.thresholds} />}
                />
                <Route
                  path="/analytics"
                  element={<AnalyticsPage miners={system.miners} analyticsData={system.analyticsData} liveData={system.liveData} activityLogs={system.activityLogs} />}
                />
                <Route
                  path="/devices"
                  element={<DevicesPage miners={system.miners} setMiners={system.setMiners} onActivityLog={system.recordActivityLog} />}
                />
                <Route
                  path="/health-logs"
                  element={<HealthLogsPage miners={system.miners} analyticsData={system.analyticsData} liveData={system.liveData} sessionData={system.sessionData} activityLogs={system.activityLogs} thresholds={system.thresholds} onClearHealthLogs={canManage ? system.clearHealthLogs : undefined} />}
                />
                <Route
                  path="/health-analysis"
                  element={<HealthAnalysisPage miners={system.miners} analyticsData={system.analyticsData} liveData={system.liveData} sessionData={system.sessionData} activityLogs={system.activityLogs} thresholds={system.thresholds} />}
                />
                <Route
                  path="/sensor-status"
                  element={<SensorStatusPage miners={system.miners} activityLogs={system.activityLogs} onClearActivityLogs={canManage ? system.clearActivityLogs : undefined} />}
                />
                <Route
                  path="/settings"
                  element={
                    <SettingsPage
                      miners={system.miners}
                      staleSeconds={system.staleSeconds}
                    />
                  }
                />
                <Route
                  path="/alert-history"
                  element={<AlertHistoryPage activityLogs={system.activityLogs} onClearActivityLogs={canManage ? system.clearActivityLogs : undefined} />}
                />
                <Route path="*" element={<Navigate to="/command" replace />} />
              </Routes>
              </div>
              </ErrorBoundary>
            </Suspense>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

function RouteFallback() {
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: C.bg0 }}>
      <div className="spinner" />
      <span style={{ color: C.textMuted, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>Loading module…</span>
    </div>
  );
}

function readStoredStringArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function sosAlertKey(alert, miners) {
  const miner = miners.find((candidate) => candidate.id === alert.deviceId);
  return `${alert.id}:${Number(miner?.button_press_count || 0)}`;
}
