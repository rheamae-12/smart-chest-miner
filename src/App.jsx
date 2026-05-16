import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/useAuth";
import DashboardPage from "./pages/DashboardPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import DevicesPage from "./pages/DevicesPage";
import LoginPage from "./pages/LoginPage";
import SettingsPage from "./pages/SettingsPage";
import { useSimulatedMinerSystem } from "./hooks/useSimulatedMinerSystem";
import { C } from "./theme";

export default function App() {
  const { user, logout, authReady } = useAuth();
  const system = useSimulatedMinerSystem(Boolean(user));
  const confirmLogout = () => {
    if (window.confirm("Log out of Smart Chest Miner?")) {
      logout();
    }
  };

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
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: C.bg0,
          color: C.text,
        }}
      >
        <Sidebar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Navbar
            miners={system.miners}
            user={user}
            onLogout={confirmLogout}
            usingRealtime={system.usingRealtime}
            connectionError={system.connectionError}
          />
          <main style={{ flex: 1, overflow: "hidden" }}>
            {system.connectionError && (
              <div style={{ padding: "8px 20px", background: "rgba(245,158,11,0.12)", color: C.amber, borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
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
