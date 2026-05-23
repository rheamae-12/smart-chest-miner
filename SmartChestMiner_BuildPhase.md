for# Smart Chest Miner — Build Phase Document

**Project Name:** Smart Chest Miner (SCM)  
**System Type:** IoT-Integrated Web Application — Miner Vital Sign Monitoring  
**Version:** 1.0.0  
**Date:** May 2026  
**Prepared By:** Boris and Yami 

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Build Phases](#4-build-phases)
   - [Phase 1 — Project Setup & Environment](#phase-1--project-setup--environment)
   - [Phase 2 — Hardware & Firmware (ESP32)](#phase-2--hardware--firmware-esp32)
   - [Phase 3 — Firebase Backend](#phase-3--firebase-backend)
   - [Phase 4 — Authentication System](#phase-4--authentication-system)
   - [Phase 5 — Core UI Components](#phase-5--core-ui-components)
   - [Phase 6 — Dashboard Page](#phase-6--dashboard-page)
   - [Phase 7 — Analytics Page](#phase-7--analytics-page)
   - [Phase 8 — Manage Devices Page](#phase-8--manage-devices-page)
   - [Phase 9 — Settings Page](#phase-9--settings-page)
   - [Phase 10 — Error Handling & Device Monitor](#phase-10--error-handling--device-monitor)
   - [Phase 11 — Testing & QA](#phase-11--testing--qa)
   - [Phase 12 — Deployment](#phase-12--deployment)
5. [Firebase Data Structure](#5-firebase-data-structure)
6. [ESP32 Sensor Configuration](#6-esp32-sensor-configuration)
7. [Alert Threshold Reference](#7-alert-threshold-reference)
8. [Device ID Convention](#8-device-id-convention)
9. [Project File Structure](#9-project-file-structure)
10. [Build Timeline Summary](#10-build-timeline-summary)
11. [Risk & Mitigation](#11-risk--mitigation)

---

## 1. Project Overview

Smart Chest Miner (SCM) is an IoT-integrated real-time monitoring web application designed to track the vital signs of underground mine workers. Each miner wears a chest-mounted ESP32 device equipped with a heart rate sensor and a pulse oximeter (SpO₂) sensor. Readings are transmitted to Firebase Realtime Database and visualized on a secure web dashboard accessible to mine supervisors.

### Goals

- Real-time display of heart rate (HR) and blood oxygen (SpO₂) per miner
- Support for multiple simultaneous devices (Miner 1, Miner 2, etc.)
- Device status monitoring — online/offline detection
- Historical analytics recorded per minute per sensor per device
- Secure role-based login for supervisors and administrators
- Alert system for critical vital sign readings

### Key Actors

| Admin | Miner |
|---|---|
| Mine Supervisor | Monitors dashboard in real time |
| System Administrator | Manages devices, users, system settings |
| ESP32 Device | Gathers sensor data and pushes to Firebase |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────┐
│               HARDWARE LAYER                    │
│                                                 │
│   ESP32                                         │
│   ├── MAX30102 (Heart Rate + SpO₂ Sensor)       │
│   └── WiFi Module (built-in)                    │
└───────────────────┬─────────────────────────────┘
                    │  HTTPS / Firebase REST API
                    ▼
┌─────────────────────────────────────────────────┐
│               BACKEND LAYER                     │
│                                                 │
│   Firebase Realtime Database                    │
│   ├── /devices/{deviceId}/live                  │
│   ├── /devices/{deviceId}/analytics             │
│   └── /devices/{deviceId}/status               │
│                                                 │
│   Firebase Authentication                       │
│   └── Email / Password Login                    │
└───────────────────┬─────────────────────────────┘
                    │  Firebase SDK (Web)
                    ▼
┌─────────────────────────────────────────────────┐
│               FRONTEND LAYER                    │
│                                                 │
│   React.js Web Application                      │
│   ├── Dashboard (live charts)                   │
│   ├── Analytics (per-minute records)            │
│   ├── Manage Devices (CRUD)                     │
│   └── Settings (thresholds, users, system)      │
└─────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Frontend

| Technology | Purpose |
|---|---|
| React.js (v18) | UI framework |
| Recharts | Live and historical data charts |
| Firebase Web SDK v9 | Realtime database + auth |
| React Router v6 | Page routing |
| Vite | Build tool and dev server |
| CSS Modules / Inline Styles | Component styling |

### Backend & Database

| Technology | Purpose |
|---|---|
| Firebase Realtime Database | Live sensor data storage and sync |
| Firebase Authentication | User login and role management |
| Firebase Security Rules | Data access control per user role |

### Hardware / Firmware

| Technology | Purpose |
|---|---|
| ESP32 (30-pin or 38-pin) | Microcontroller unit |
| MAX30102 Sensor | Heart rate and SpO₂ measurement |
| Arduino IDE | Firmware development and flashing |
| ArduinoJson Library | JSON payload serialization |
| FirebaseESP32 Library | Push data to Firebase from ESP32 |
| WiFi.h Library | WiFi connection management |

---

## 4. Build Phases

---

### Phase 1 — Project Setup & Environment

**Duration:** 2–3 days  
**Goal:** Initialize the development environment, tools, and repositories.

#### Tasks

- [ ] Create GitHub repository for the project (`smart-chest-miner`)
- [ ] Initialize React project using Vite
  ```bash
  npm create vite@latest smart-chest-miner -- --template react
  cd smart-chest-miner
  npm install
  ```
- [ ] Install core dependencies
  ```bash
  npm install firebase recharts react-router-dom
  ```
- [ ] Set up `.env` file for Firebase configuration
  ```
  VITE_FIREBASE_API_KEY=
  VITE_FIREBASE_AUTH_DOMAIN=
  VITE_FIREBASE_DATABASE_URL=
  VITE_FIREBASE_PROJECT_ID=
  VITE_FIREBASE_APP_ID=
  ```
- [ ] Create Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
- [ ] Enable Firebase Realtime Database and Authentication (Email/Password)
- [ ] Configure `.gitignore` to exclude `.env` and `node_modules`
- [ ] Set up project folder structure (see Section 9)
- [ ] Install Arduino IDE and required libraries for ESP32 development
  - FirebaseESP32
  - MAX30105 by SparkFun
  - ArduinoJson

#### Deliverables

- Running React development server
- Firebase project configured and accessible
- Arduino IDE ready for ESP32 firmware flashing

---

### Phase 2 — Hardware & Firmware (ESP32)

**Duration:** 4–5 days  
**Goal:** Wire the sensor, write the firmware, and transmit live data to Firebase.

#### Hardware Wiring (ESP32 ↔ MAX30102)

| MAX30102 Pin | ESP32 Pin |
|---|---|
| VIN | 3.3V |
| GND | GND |
| SDA | GPIO 21 |
| SCL | GPIO 22 |
| INT | Not required |

#### Firmware Tasks

- [ ] Connect ESP32 to WiFi using `WiFi.h`
- [ ] Initialize MAX30102 sensor using SparkFun library
- [ ] Read raw IR and Red LED values from the sensor
- [ ] Calculate heart rate (HR) using beat detection algorithm
- [ ] Calculate SpO₂ using ratio-of-ratios formula
- [ ] Serialize readings into JSON payload
  ```json
  {
    "deviceId": "MCM-001",
    "minerName": "Miner 1",
    "heartRate": 82,
    "spo2": 97,
    "timestamp": 1716800000,
    "status": "online"
  }
  ```
- [ ] Push data to Firebase Realtime Database every 5 seconds using FirebaseESP32
- [ ] Update device `lastSeen` timestamp on each push
- [ ] Handle WiFi reconnection logic (retry loop on connection failure)
- [ ] Set device `status` to `offline` via Firebase rules when no heartbeat received for 60 seconds
- [ ] Flash and test firmware on physical ESP32 device
- [ ] Verify data appearing correctly in Firebase console

#### Firebase Path Written by ESP32

```
/devices/MCM-001/live/heartRate    → 82
/devices/MCM-001/live/spo2         → 97
/devices/MCM-001/live/timestamp    → 1716800000
/devices/MCM-001/status            → "online"
/devices/MCM-001/lastSeen          → 1716800000
```

#### Deliverables

- Firmware source file: `smart_chest_miner.ino`
- ESP32 device transmitting live data to Firebase every 5 seconds
- Verified data visible in Firebase Realtime Database console

---

### Phase 3 — Firebase Backend

**Duration:** 2–3 days  
**Goal:** Define database structure, security rules, and analytics recording logic.

#### Tasks

- [ ] Define complete Firebase Realtime Database schema (see Section 5)
- [ ] Write Firebase Security Rules to restrict read/write by authenticated users only
  ```json
  {
    "rules": {
      "devices": {
        "$deviceId": {
          ".read": "auth != null",
          ".write": "auth != null && auth.token.role === 'admin'"
        }
      },
      "analytics": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
  ```
- [ ] Create Firebase Cloud Function (optional) to write per-minute analytics snapshots automatically
- [ ] Alternatively, implement client-side per-minute write logic in the React app
- [ ] Configure Firebase Authentication with at least one admin user
- [ ] Test read/write permissions with Postman or Firebase console

#### Deliverables

- Firebase database schema fully initialized
- Security rules deployed
- Analytics write logic confirmed working

---

### Phase 4 — Authentication System

**Duration:** 2 days  
**Goal:** Build the login page and protect all routes from unauthenticated access.

#### Tasks

- [ ] Create `LoginPage` component with email/password fields
- [ ] Integrate `signInWithEmailAndPassword` from Firebase Auth SDK
- [ ] Show error messages for invalid credentials
- [ ] Store authenticated user in React context (`AuthContext`)
- [ ] Create `ProtectedRoute` wrapper component — redirect to login if no user
- [ ] Add logout functionality accessible from the navbar
- [ ] (Optional) Add role field to Firebase user custom claims for admin vs. viewer roles

#### Component Files

```
src/
  pages/
    LoginPage.jsx
  context/
    AuthContext.jsx
  components/
    ProtectedRoute.jsx
```

#### Deliverables

- Functional login page
- All app routes protected
- Authenticated user state managed globally

---

### Phase 5 — Core UI Components

**Duration:** 3–4 days  
**Goal:** Build reusable layout components used across all pages.

#### 5.1 Sidebar Component

- [ ] Fixed left-side navigation panel
- [ ] Navigation links: Dashboard, Analytics, Devices, Settings
- [ ] Active page highlight with accent color
- [ ] Collapsible toggle — icon-only mode when collapsed
- [ ] Branding logo and system name at top

#### 5.2 Navbar Component

- [ ] Top horizontal bar
- [ ] Display current page title
- [ ] Live clock (updates every second)
- [ ] Device online count indicator (`X / Y online`)
- [ ] Logged-in user avatar/initials
- [ ] Logout button

#### 5.3 Modal Component

- [ ] Reusable modal overlay (backdrop + dialog box)
- [ ] Accepts title, body content, and action buttons as props
- [ ] Used for: Register Device, Confirm Delete, Edit Miner Name

#### 5.4 Status Badge Component

- [ ] Shows `ONLINE` (green, pulsing dot) or `OFFLINE` (red, static dot)
- [ ] Used in dashboard miner cards and device table

#### 5.5 Alert Banner Component

- [ ] Appears at top of dashboard when critical readings are detected
- [ ] Lists affected miners and the nature of the alert
- [ ] Dismissible per alert

#### Deliverables

- All shared components built and tested in isolation
- Sidebar and navbar integrated into app layout

---

### Phase 6 — Dashboard Page

**Duration:** 4–5 days  
**Goal:** Real-time display of live heart rate and SpO₂ readings per miner.

#### Layout

```
┌────────────────────────────────────────────────────┐
│ Alert Banner (if critical readings present)        │
├─────────┬──────────┬──────────┬────────────────────┤
│ Active  │ Avg HR   │ Avg SpO₂ │ Active Alerts      │
│ Devices │          │          │                    │
├────────────────────────────────────────────────────┤
│ Miner Selector Tabs  [M1] [M2] [M3] [M4] [M5]     │
├────────────────────────────────────────────────────┤
│ Selected Miner Info Banner                         │
│ (Name | ID | Location | Status | Last Seen)        │
├───────────────────────┬────────────────────────────┤
│ Heart Rate Live Chart │ SpO₂ Live Chart            │
│ (Area chart, 30pts)   │ (Area chart, 30pts)        │
├────────────────────────────────────────────────────┤
│ All Devices Quick View Grid                        │
│ (Card per miner — HR, SpO₂, Status)               │
└────────────────────────────────────────────────────┘
```

#### Tasks

- [ ] Subscribe to Firebase `onValue` listener for selected miner's `/live` path
- [ ] Maintain a rolling buffer of the last 30 readings in local state (for charting)
- [ ] Render separate `AreaChart` (Recharts) for heart rate and SpO₂
- [ ] Update charts in real time as new Firebase data arrives
- [ ] Show current HR and SpO₂ reading next to each chart header
- [ ] Display status badge (ONLINE / OFFLINE) per miner
- [ ] Show "Device Offline" placeholder when selected miner is inactive
- [ ] Render all-miners quick-view grid at the bottom
- [ ] Highlight miner cards with color when readings are abnormal

#### Firebase Listeners

```javascript
// Subscribe to live data for selected miner
const liveRef = ref(db, `devices/${deviceId}/live`);
onValue(liveRef, (snapshot) => {
  const data = snapshot.val();
  // update rolling chart buffer
});

// Subscribe to device status
const statusRef = ref(db, `devices/${deviceId}/status`);
onValue(statusRef, (snapshot) => {
  setIsOnline(snapshot.val() === 'online');
});
```

#### Deliverables

- Live-updating HR and SpO₂ charts per miner
- Working miner selector
- Device status indicator functional

---

### Phase 7 — Analytics Page

**Duration:** 3–4 days  
**Goal:** Display per-minute recorded sensor data with filter controls.

#### Layout

```
┌────────────────────────────────────────────────────┐
│ Filters: [Miner ▼] [Sensor ▼] [Time Range ▼]      │
├─────────┬──────────┬──────────┬────────────────────┤
│ Avg HR  │ Avg SpO₂ │ Tracked  │ Total Readings     │
├────────────────────────────────────────────────────┤
│ Heart Rate Line Chart (per-minute, multi-miner)    │
├────────────────────────────────────────────────────┤
│ SpO₂ Line Chart (per-minute, multi-miner)          │
├────────────────────────────────────────────────────┤
│ Bar Chart — Miner Comparison (avg HR vs avg SpO₂)  │
└────────────────────────────────────────────────────┘
```

#### Tasks

- [ ] Read analytics data from Firebase path `/analytics/{deviceId}`
- [ ] Display separate line charts for heart rate and SpO₂
- [ ] Support multiple miners on the same chart (one line per miner)
- [ ] Implement filter controls:
  - **Miner filter** — All Miners or specific miner
  - **Sensor filter** — Both, Heart Rate only, SpO₂ only
  - **Time range filter** — Last 30 min, Last 60 min, Today
- [ ] Compute and display summary stat cards (average per filter)
- [ ] Render miner comparison bar chart
- [ ] Per-minute analytics write logic (every 60 seconds, write average of live readings to `/analytics/{deviceId}`)

#### Analytics Write Logic (Client-Side)

```javascript
// Every 60 seconds, write the average of accumulated readings
const writeAnalytics = async (deviceId, avgHR, avgSpo2) => {
  const analyticsRef = ref(db, `analytics/${deviceId}/${Date.now()}`);
  await set(analyticsRef, {
    heartRate: avgHR,
    spo2: avgSpo2,
    timestamp: Date.now(),
  });
};
```

#### Deliverables

- Separate HR and SpO₂ analytics charts rendering correctly
- All filter controls working
- Per-minute data being written to Firebase

---

### Phase 8 — Manage Devices Page

**Duration:** 2–3 days  
**Goal:** Allow administrators to register, enable/disable, and remove ESP32 devices.

#### Layout

```
┌────────────────────────────────────────────────────┐
│ [Search bar]          [+ Register Device button]   │
├────────────────────────────────────────────────────┤
│ Device ID | Miner Name | Location | Status | Last  │
│           |            |          |        | Seen  │
│ MCM-001   | Miner 1    | Shaft A  | ONLINE | Now   │
│ MCM-002   | Miner 2    | Shaft B  | ONLINE | Now   │
│ MCM-003   | Miner 3    | Shaft A  | OFFLINE| 12min │
└────────────────────────────────────────────────────┘
```

#### Tasks

- [ ] Read registered devices from Firebase `/devices` path
- [ ] Display devices in a searchable table
- [ ] Search/filter by miner name or device ID
- [ ] Enable/Disable toggle — updates device `active` flag in Firebase
- [ ] Remove device — deletes device record from Firebase (with confirmation modal)
- [ ] Register Device modal form fields:
  - Miner Name (e.g., Miner 6)
  - Device ID (e.g., MCM-006)
  - Location (e.g., Shaft D — Level 1)
- [ ] Write new device entry to Firebase on register
- [ ] Show device last seen timestamp

#### Deliverables

- Full CRUD for device management
- Search and filter working
- Register Device modal functional

---

### Phase 9 — Settings Page

**Duration:** 2 days  
**Goal:** Allow administrators to configure user account, alert thresholds, and system settings.

#### Sections

**9.1 User Account**
- [ ] Display and edit logged-in user's name, email, and role
- [ ] Change password functionality (via Firebase Auth `updatePassword`)

**9.2 Alert Thresholds**
- [ ] Configure heart rate minimum (default: 55 bpm)
- [ ] Configure heart rate maximum (default: 105 bpm)
- [ ] Configure SpO₂ minimum (default: 94%)
- [ ] Save thresholds to Firebase `/settings/thresholds`
- [ ] Alert thresholds are read by the dashboard to trigger alert banners

**9.3 System Settings**
- [ ] Configure data polling interval (default: 5 seconds)
- [ ] View all registered devices (read-only list)
- [ ] Save button with success confirmation

#### Deliverables

- All settings forms saving to Firebase correctly
- Alert thresholds reflecting on the dashboard alert logic

---

### Phase 10 — Error Handling & Device Monitor

**Duration:** 2–3 days  
**Goal:** Detect and surface device connectivity issues and data anomalies throughout the system.

#### Tasks

**Device Offline Detection**
- [ ] Track `lastSeen` timestamp per device in Firebase
- [ ] If `Date.now() - lastSeen > 60000` ms → mark device as `offline` in UI
- [ ] Show OFFLINE badge and "No signal" in dashboard miner cards
- [ ] Show offline device alert in dashboard alert banner

**Critical Reading Alerts**
- [ ] HR < threshold min → display `LOW` badge, trigger alert banner
- [ ] HR > threshold max → display `HIGH` badge, trigger alert banner
- [ ] SpO₂ < threshold min → display `CRITICAL` badge, trigger red alert banner
- [ ] Alert banner lists all affected miners with the nature of the reading

**Firebase Connection Error Handling**
- [ ] Detect Firebase connection lost (`onValue` error callback)
- [ ] Show a toast/banner: "Connection lost — retrying…"
- [ ] Auto-reconnect when network is restored

**ESP32 Firmware Error Handling**
- [ ] Retry WiFi connection up to 10 times before sleeping 30 seconds
- [ ] Log sensor read failure to serial monitor
- [ ] If MAX30102 not detected — halt and blink onboard LED every 2 seconds
- [ ] Set Firebase `status` to `offline` if WiFi drops for more than 30 seconds

**General UI Error States**
- [ ] Empty state for no devices registered
- [ ] Empty state for no analytics data yet
- [ ] 404 route — redirect to dashboard

#### Deliverables

- Devices correctly shown as ONLINE or OFFLINE
- Critical readings triggering visible alerts
- Firebase disconnect handled gracefully in the UI
- ESP32 firmware handles sensor and network failures

---

### Phase 11 — Testing & QA

**Duration:** 3–4 days  
**Goal:** Validate all system components work correctly end-to-end.

#### Testing Areas

| Area | Test Cases |
|---|---|
| Authentication | Login with valid credentials, invalid credentials, logout, protected route redirect |
| Dashboard | Live chart updates, miner selector, offline device handling, alert banner appearance |
| Analytics | Filter by miner, filter by sensor, filter by time range, per-minute record writing |
| Devices | Register new device, enable/disable, delete device, search filter |
| Settings | Save thresholds, verify alert reflects change, update user info |
| ESP32 | Sensor readings accurate, WiFi disconnect recovery, data appears in Firebase |
| Device Monitor | Offline detection after 60s, alert banner displayed |
| Responsive UI | Test at 1280px, 1440px, and 1920px screen widths |

#### Deliverables

- All test cases passing
- No broken Firebase listeners on page navigation
- No memory leaks from `onValue` subscriptions (all unsubscribed on unmount)

---

### Phase 12 — Deployment

**Duration:** 1–2 days  
**Goal:** Deploy the web application to a production hosting environment.

#### Tasks

- [ ] Run production build
  ```bash
  npm run build
  ```
- [ ] Deploy to Firebase Hosting
  ```bash
  npm install -g firebase-tools
  firebase login
  firebase init hosting
  firebase deploy
  ```
- [ ] Configure Firebase Hosting to redirect all routes to `index.html` (SPA support)
  ```json
  {
    "hosting": {
      "public": "dist",
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
  }
  ```
- [ ] Set production Firebase Security Rules
- [ ] Verify HTTPS is active on deployed URL
- [ ] Test all pages on the live deployment
- [ ] Flash production firmware on all ESP32 devices with production Firebase credentials

#### Deliverables

- Web app live at Firebase Hosting URL
- All ESP32 devices transmitting to production Firebase project
- System operational end-to-end

---

## 5. Firebase Data Structure

```json
{
  "devices": {
    "MCM-001": {
      "name": "Miner 1",
      "location": "Shaft A — Level 3",
      "active": true,
      "status": "online",
      "lastSeen": 1716800000,
      "live": {
        "heartRate": 82,
        "spo2": 97,
        "timestamp": 1716800000
      }
    },
    "MCM-002": { "..." : "..." }
  },
  "analytics": {
    "MCM-001": {
      "1716796800000": {
        "heartRate": 80,
        "spo2": 96,
        "timestamp": 1716796800000
      },
      "1716796860000": {
        "heartRate": 83,
        "spo2": 97,
        "timestamp": 1716796860000
      }
    }
  },
  "settings": {
    "thresholds": {
      "hrMin": 55,
      "hrMax": 105,
      "spo2Min": 94
    },
    "pollingInterval": 5
  },
  "users": {
    "uid_admin_001": {
      "name": "Admin",
      "email": "admin@smartchestminer.io",
      "role": "admin"
    }
  }
}
```

---

## 6. ESP32 Sensor Configuration

### Arduino Libraries Required

```
FirebaseESP32       by Mobizt          v4.x
MAX30105            by SparkFun        v1.x
ArduinoJson         by Benoit Blanchon v6.x
WiFi                (built-in ESP32)
```

### Key Firmware Parameters

| Parameter | Value |
|---|---|
| Sensor I2C Address | `0x57` |
| Sample Rate | 100 samples/sec |
| LED Pulse Width | 411 µs |
| ADC Range | 4096 |
| Firebase Push Interval | Every 5 seconds |
| WiFi Retry Limit | 10 attempts |
| Offline Timeout | 30 seconds |

### Compilation Settings (Arduino IDE)

| Setting | Value |
|---|---|
| Board | ESP32 Dev Module |
| Upload Speed | 115200 |
| CPU Frequency | 240 MHz |
| Flash Size | 4MB (32Mb) |
| Partition Scheme | Default 4MB |

---

## 7. Alert Threshold Reference

| Vital Sign | Normal Range | Warning | Critical |
|---|---|---|---|
| Heart Rate | 60 – 100 bpm | < 60 or > 100 bpm | < 50 or > 120 bpm |
| SpO₂ | 96% – 100% | 94% – 95% | < 94% |

> SpO₂ below 90% is a medical emergency. The system must display a red critical alert immediately and the supervisor should initiate emergency response.

---

## 8. Device ID Convention

All ESP32 devices follow the naming convention:

```
MCM-{NNN}
```

Where `NNN` is a zero-padded three-digit number.

| Device ID | Miner Name | Location |
|---|---|---|
| MCM-001 | Miner 1 | Shaft A — Level 3 |
| MCM-002 | Miner 2 | Shaft B — Level 1 |
| MCM-003 | Miner 3 | Shaft A — Level 5 |
| MCM-004 | Miner 4 | Shaft C — Level 2 |
| MCM-005 | Miner 5 | Shaft B — Level 4 |

---

## 9. Project File Structure

```
smart-chest-miner/
├── public/
│   └── favicon.ico
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   ├── Navbar.jsx
│   │   ├── Modal.jsx
│   │   ├── StatusBadge.jsx
│   │   ├── AlertBanner.jsx
│   │   ├── StatCard.jsx
│   │   ├── LiveChartCard.jsx
│   │   └── ProtectedRoute.jsx
│   ├── context/
│   │   └── AuthContext.jsx
│   ├── firebase/
│   │   ├── config.js
│   │   ├── auth.js
│   │   └── database.js
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── AnalyticsPage.jsx
│   │   ├── DevicesPage.jsx
│   │   └── SettingsPage.jsx
│   ├── hooks/
│   │   ├── useLiveData.js
│   │   ├── useDeviceStatus.js
│   │   └── useAnalytics.js
│   ├── utils/
│   │   ├── alertChecker.js
│   │   └── formatters.js
│   ├── App.jsx
│   └── main.jsx
├── firmware/
│   └── smart_chest_miner/
│       └── smart_chest_miner.ino
├── .env
├── .gitignore
├── package.json
├── vite.config.js
└── README.md
```

---

## 10. Build Timeline Summary

| Phase | Name | Duration | Depends On |
|---|---|---|---|
| 1 | Project Setup & Environment | 2–3 days | — |
| 2 | Hardware & Firmware (ESP32) | 4–5 days | Phase 1 |
| 3 | Firebase Backend | 2–3 days | Phase 1 |
| 4 | Authentication System | 2 days | Phase 3 |
| 5 | Core UI Components | 3–4 days | Phase 4 |
| 6 | Dashboard Page | 4–5 days | Phases 2, 3, 5 |
| 7 | Analytics Page | 3–4 days | Phases 3, 5 |
| 8 | Manage Devices Page | 2–3 days | Phases 3, 5 |
| 9 | Settings Page | 2 days | Phases 3, 5 |
| 10 | Error Handling & Device Monitor | 2–3 days | Phases 6–9 |
| 11 | Testing & QA | 3–4 days | All Phases |
| 12 | Deployment | 1–2 days | Phase 11 |
| **Total** | | **~30–42 days** | |

---

## 11. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MAX30102 sensor returning inaccurate readings | Medium | High | Calibrate sensor placement; average over 4 readings per push |
| ESP32 WiFi signal loss underground | High | High | Implement retry logic; write last known values with stale flag |
| Firebase free-tier quota exceeded | Low | Medium | Monitor usage; upgrade to Blaze plan if needed |
| Real-time chart lag with many miners | Medium | Medium | Limit rolling buffer to 30 data points; use `isAnimationActive={false}` |
| Unauthorized access to sensor data | Low | High | Enforce Firebase Security Rules; use Firebase Auth on all reads |
| Browser tab losing Firebase listeners | Low | Medium | Clean up `onValue` subscriptions in `useEffect` return function |
| Device ID collision on registration | Low | Low | Validate device ID uniqueness before writing to Firebase |

---

*Document prepared for Smart Chest Miner v1.0.0 — IoT Vital Sign Monitoring System*  
*All timelines are estimates and may vary based on team size and hardware availability.*
