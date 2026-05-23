import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Modal from "./components/Modal";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/useAuth";
import DashboardPage from "./pages/DashboardPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import DevicesPage from "./pages/DevicesPage";
import HealthLogsPage from "./pages/HealthLogsPage";
import LoginPage from "./pages/LoginPage";
import SensorStatusPage from "./pages/SensorStatusPage";
import SettingsPage from "./pages/SettingsPage";
import { useSimulatedMinerSystem } from "./hooks/useSimulatedMinerSystem";
import { C, ghostButtonStyle, primaryButtonStyle } from "./theme";

export default function App() {
  const { user, logout, authReady } = useAuth();
  const system = useSimulatedMinerSystem(Boolean(user));
  const [logoutOpen, setLogoutOpen] = useState(false);
  const confirmLogout = () => setLogoutOpen(true);

  if (!authReady) {
    return <div style={{ minHeight: "100vh", background: C.bg0 }} />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
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
                onClick={() => {
                  setLogoutOpen(false);
                  logout();
                }}
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
          />
          <main style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
            {system.connectionError && (
              <div style={{ padding: "9px 22px", background: "rgba(245,158,11,0.12)", color: C.amber, borderBottom: `1px solid ${C.borderSoft}`, fontSize: 12, fontWeight: 700 }}>
                Firebase notice: {system.connectionError}
              </div>
            )}
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={<DashboardPage miners={system.miners} liveData={system.liveData} thresholds={system.thresholds} />}
              />
              <Route
                path="/analytics"
                element={<AnalyticsPage miners={system.miners} analyticsData={system.analyticsData} />}
              />
              <Route
                path="/devices"
                element={<DevicesPage miners={system.miners} setMiners={system.setMiners} />}
              />
              <Route
                path="/health-logs"
                element={<HealthLogsPage miners={system.miners} analyticsData={system.analyticsData} />}
              />
              <Route
                path="/sensor-status"
                element={<SensorStatusPage miners={system.miners} />}
              />
              <Route
                path="/settings"
                element={
                  <SettingsPage
                    miners={system.miners}
                    thresholds={system.thresholds}
                    setThresholds={system.setThresholds}
                    pollingInterval={system.pollingInterval}
                    setPollingInterval={system.setPollingInterval}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
