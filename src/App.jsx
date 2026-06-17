import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Modal from "./components/Modal";
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
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SensorStatusPage = lazy(() => import("./pages/SensorStatusPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const WifiConfigPage = lazy(() => import("./pages/WifiConfigPage"));
const AlertHistoryPage = lazy(() => import("./pages/AlertHistoryPage"));

export default function App() {
  const { user, logout, authReady, canManage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const system = useMinerSystem(Boolean(user));
  const [logoutOpen, setLogoutOpen] = useState(false);
  const liveAlerts = user ? buildAlerts(system.miners, system.thresholds) : [];
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
              <button onClick={() => setLogoutOpen(false)} style={{ ...ghostButtonStyle, padding: "9px 15px" }}>
                Cancel
              </button>
              <button
                onClick={handleLogout}
                style={{ ...primaryButtonStyle, padding: "9px 15px" }}
              >
                Log Out
              </button>
            </>
          }
        >
          <div style={{ color: C.textDim, fontSize: 13, lineHeight: 1.6 }}>Log out of the Smart Chest Miner console? Live device monitoring will stop for this browser session.</div>
        </Modal>
      )}
      <div
        className="app-shell"
        style={{
          display: "flex",
          height: "100vh",
          background: C.bg0,
          color: C.text,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Sidebar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
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
              <div style={{ height: "100%", display: "contents" }}>
              <Routes>
                <Route path="/" element={<Navigate to="/command" replace />} />
                <Route
                  path="/command"
                  element={<CommandCenterPage miners={system.miners} liveData={system.liveData} activityLogs={system.activityLogs} thresholds={system.thresholds} dismissedAlertIds={dismissedAlertIds} onDismissAlerts={dismissAlerts} />}
                />
                <Route
                  path="/dashboard"
                  element={<DashboardPage miners={system.miners} liveData={system.liveData} thresholds={system.thresholds} dismissedAlertIds={dismissedAlertIds} onDismissAlerts={dismissAlerts} />}
                />
                <Route
                  path="/analytics"
                  element={<AnalyticsPage miners={system.miners} analyticsData={system.analyticsData} activityLogs={system.activityLogs} />}
                />
                <Route
                  path="/devices"
                  element={<DevicesPage miners={system.miners} setMiners={system.setMiners} />}
                />
                <Route
                  path="/health-logs"
                  element={<HealthLogsPage miners={system.miners} analyticsData={system.analyticsData} activityLogs={system.activityLogs} thresholds={system.thresholds} onClearHealthLogs={canManage ? system.clearHealthLogs : undefined} />}
                />
                <Route
                  path="/sensor-status"
                  element={<SensorStatusPage miners={system.miners} activityLogs={system.activityLogs} onClearActivityLogs={canManage ? system.clearActivityLogs : undefined} />}
                />
                <Route
                  path="/wifi-config"
                  element={<WifiConfigPage miners={system.miners} />}
                />
                <Route
                  path="/settings"
                  element={
                    <SettingsPage
                      miners={system.miners}
                      thresholds={system.thresholds}
                      setThresholds={system.setThresholds}
                      staleSeconds={system.staleSeconds}
                      setStaleSeconds={system.setStaleSeconds}
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
