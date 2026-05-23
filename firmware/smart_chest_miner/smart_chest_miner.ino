/*
 * pulse_monitor_sim.ino
 *
 * Same behavior as the original Google Sheets build, but uploads directly to
 * Firebase Realtime Database using the REST API.
 */

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "MAX30105.h"

// =============================================================
// CONFIGURATION - Edit these values to match your setup
// =============================================================

const char* WIFI_SSID     = "PLDTHOMEFIBR_RazielRenz";
const char* WIFI_PASSWORD = "kuanwalaypassword";

const char* FIREBASE_DATABASE_URL = "https://smart-chest-miner-default-rtdb.firebaseio.com";
const char* FIREBASE_DATABASE_SECRET = "GJY8fpUA211duwUw7o92ks0EXlYOFdqWYz5rK6N5";

const char* DEVICE_ID = "MCM-001";
const char* MINER_NAME = "Miner 1";
const char* MINER_LOCATION = "Shaft A - Level 3";

// =============================================================
// PIN DEFINITIONS
// =============================================================

#define SDA_PIN        16
#define SCL_PIN        17
#define BUZZER_PIN     27
#define GREEN_LED_PIN  26
#define RED_LED_PIN    25
#define BUTTON_PIN     33

// =============================================================
// TIMING CONSTANTS
// =============================================================

#define LIVE_UPLOAD_INTERVAL_MS  2000
#define ANALYTICS_INTERVAL_MS    60000
#define PRINT_INTERVAL_MS        5000
#define SENSOR_READ_INTERVAL     10
#define DEBOUNCE_DELAY_MS        50
#define WIFI_RECONNECT_INTERVAL  10000
#define RED_LED_BLINK_INTERVAL   200
#define BUZZER_BEEP_INTERVAL     100
#define SIM_UPDATE_INTERVAL      2000

// =============================================================
// SIMULATION CONFIGURATION
// =============================================================

#define SIM_BPM_CENTER    75.0
#define SIM_BPM_MIN       72.0
#define SIM_BPM_MAX       78.0
#define SIM_SPO2_CENTER   97.5
#define SIM_SPO2_MIN      96.0
#define SIM_SPO2_MAX      99.0

// =============================================================
// FINGER DETECTION
// =============================================================

#define FINGER_THRESHOLD  7000

// =============================================================
// HEALTH STATE DEFINITIONS
// =============================================================

enum HealthState {
  HEALTH_NO_FINGER,
  HEALTH_NORMAL,
  HEALTH_WARNING,
  HEALTH_CRITICAL,
  HEALTH_MANUAL_ALERT
};

// =============================================================
// GLOBAL VARIABLES
// =============================================================

MAX30105 particleSensor;

HealthState healthState = HEALTH_NO_FINGER;

float currentBPM = 0.0;
float currentSpO2 = 0.0;

unsigned long lastLiveUploadTime = 0;
unsigned long lastAnalyticsUploadTime = 0;
unsigned long lastSensorRead = 0;
unsigned long lastWiFiReconnect = 0;
unsigned long lastRedLedToggle = 0;
unsigned long lastGreenLedToggle = 0;
unsigned long lastPrintTime = 0;
unsigned long lastSimUpdate = 0;
unsigned long lastBuzzerToggle = 0;

float analyticsBpmSum = 0;
float analyticsSpo2Sum = 0;
int analyticsSampleCount = 0;
bool forceUpload = false;

volatile bool buttonInterruptFlag = false;
bool manualAlertActive = false;
unsigned long lastButtonPress = 0;

bool redLedState = false;
bool greenLedState = false;
bool buzzerState = false;

bool fingerDetected = false;
bool wasFingerDetected = false;
bool noFingerStateUploaded = false;

// =============================================================
// INTERRUPT SERVICE ROUTINE
// =============================================================

void IRAM_ATTR buttonISR() {
  buttonInterruptFlag = true;
}

// =============================================================
// SETUP
// =============================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("========================================");
  Serial.println("  ESP32 Pulse & SpO2 Monitor - Firebase");
  Serial.println("========================================");
  Serial.println();

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);

  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), buttonISR, FALLING);

  Wire.begin(SDA_PIN, SCL_PIN);

  Serial.print("[INIT] Initializing MAX30102... ");
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("FAILED!");
    Serial.println("[ERROR] MAX30102 not found. Check wiring.");
    while (1) {
      digitalWrite(RED_LED_PIN, HIGH);
      delay(100);
      digitalWrite(RED_LED_PIN, LOW);
      delay(100);
    }
  }
  Serial.println("OK");

  byte ledBrightness = 0x7F;
  byte sampleAverage = 4;
  byte ledMode = 2;
  byte sampleRate = 100;
  int pulseWidth = 411;
  int adcRange = 16384;

  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
  particleSensor.setPulseAmplitudeGreen(0);

  Serial.printf("[INIT] Connecting to WiFi: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - wifiStart) < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[INIT] WiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[WARN] WiFi connection failed. Will retry in loop.");
  }

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  waitForTimeSync();
  randomSeed(analogRead(0));

  registerDeviceInfo();
  Serial.println();
}

// =============================================================
// MAIN LOOP
// =============================================================

void loop() {
  unsigned long now = millis();

  handleWiFiReconnect(now);
  handleButton(now);
  handleMonitoring(now);
}

// =============================================================
// MONITORING
// =============================================================

void handleMonitoring(unsigned long now) {
  if (now - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = now;
    readSensorForFingerDetection();
  }

  if (fingerDetected && !wasFingerDetected) {
    currentBPM = SIM_BPM_CENTER;
    currentSpO2 = SIM_SPO2_CENTER;
    lastSimUpdate = now;
    noFingerStateUploaded = false;
    Serial.println("chest detected. Outputting readings.");
  }

  if (!fingerDetected && wasFingerDetected) {
    currentBPM = 0;
    currentSpO2 = 0;
    noFingerStateUploaded = false;
    forceUpload = true;
    Serial.println("[WARN] No chest detected! Place chest on sensor.");
  }
  wasFingerDetected = fingerDetected;

  if (fingerDetected && (now - lastSimUpdate >= SIM_UPDATE_INTERVAL)) {
    lastSimUpdate = now;
    updateSimulatedValues();
  }

  if (!fingerDetected) {
    currentBPM = 0;
    currentSpO2 = 0;
  }

  evaluateHealth();
  updateIndicators(now);

  if (fingerDetected && currentBPM > 0) {
    analyticsBpmSum += currentBPM;
    analyticsSpo2Sum += currentSpO2;
    analyticsSampleCount++;
  }

  if (now - lastPrintTime >= PRINT_INTERVAL_MS) {
    lastPrintTime = now;
    if (fingerDetected) {
      Serial.printf("[SIM]  BPM: %.1f  SpO2: %.1f  Status: %s  Chest: YES  Alert: %s\n",
        currentBPM, currentSpO2,
        healthStateToString(healthState),
        manualAlertActive ? "YES" : "NO"
      );
    } else {
      Serial.printf("[WARN] No chest detected  Status: %s  Alert: %s\n",
        healthStateToString(healthState),
        manualAlertActive ? "YES" : "NO"
      );
    }
  }

  if (forceUpload || (now - lastLiveUploadTime >= LIVE_UPLOAD_INTERVAL_MS)) {
    lastLiveUploadTime = now;
    if (fingerDetected || manualAlertActive || !noFingerStateUploaded) {
      uploadLiveToFirebase(currentBPM, currentSpO2);
      if (!fingerDetected && !manualAlertActive) {
        noFingerStateUploaded = true;
      }
    }
    drainSensorFifo();
  }

  if (forceUpload || (now - lastAnalyticsUploadTime >= ANALYTICS_INTERVAL_MS)) {
    lastAnalyticsUploadTime = now;
    forceUpload = false;

    if (analyticsSampleCount == 0) {
      Serial.println("[ANALYTICS] No valid chest contact samples. Skipping analytics upload.");
      return;
    }

    float avgBPM = analyticsBpmSum / analyticsSampleCount;
    float avgSpO2 = analyticsSpo2Sum / analyticsSampleCount;

    analyticsBpmSum = 0;
    analyticsSpo2Sum = 0;
    analyticsSampleCount = 0;

    uploadAnalyticsToFirebase(avgBPM, avgSpO2);
  }
}

// =============================================================
// FINGER DETECTION
// =============================================================

void readSensorForFingerDetection() {
  particleSensor.check();

  while (particleSensor.available()) {
    uint32_t irValue = particleSensor.getFIFOIR();
    particleSensor.getFIFORed();
    particleSensor.nextSample();

    fingerDetected = (irValue >= FINGER_THRESHOLD);
  }
}

void drainSensorFifo() {
  particleSensor.check();
  while (particleSensor.available()) {
    particleSensor.getFIFOIR();
    particleSensor.getFIFORed();
    particleSensor.nextSample();
  }
}

// =============================================================
// SIMULATED VALUE GENERATION
// =============================================================

void updateSimulatedValues() {
  float bpmDelta = (random(-100, 101) / 100.0);
  currentBPM += bpmDelta;
  currentBPM = constrain(currentBPM, SIM_BPM_MIN, SIM_BPM_MAX);

  float spo2Delta = (random(-50, 51) / 100.0);
  currentSpO2 += spo2Delta;
  currentSpO2 = constrain(currentSpO2, SIM_SPO2_MIN, SIM_SPO2_MAX);
}

// =============================================================
// HEALTH EVALUATION
// =============================================================

void evaluateHealth() {
  if (manualAlertActive) {
    healthState = HEALTH_MANUAL_ALERT;
    return;
  }

  if (!fingerDetected) {
    healthState = HEALTH_NO_FINGER;
    return;
  }

  healthState = HEALTH_NORMAL;
}

// =============================================================
// LED & BUZZER CONTROL
// =============================================================

void updateIndicators(unsigned long now) {
  switch (healthState) {
    case HEALTH_NO_FINGER:
      if (now - lastGreenLedToggle >= 1000) {
        lastGreenLedToggle = now;
        greenLedState = !greenLedState;
        digitalWrite(GREEN_LED_PIN, greenLedState ? HIGH : LOW);
      }
      digitalWrite(RED_LED_PIN, LOW);
      digitalWrite(BUZZER_PIN, LOW);
      break;

    case HEALTH_NORMAL:
      digitalWrite(GREEN_LED_PIN, HIGH);
      digitalWrite(RED_LED_PIN, LOW);
      digitalWrite(BUZZER_PIN, LOW);
      break;

    case HEALTH_WARNING:
      digitalWrite(GREEN_LED_PIN, LOW);
      digitalWrite(RED_LED_PIN, HIGH);
      digitalWrite(BUZZER_PIN, LOW);
      break;

    case HEALTH_CRITICAL:
    case HEALTH_MANUAL_ALERT:
      digitalWrite(GREEN_LED_PIN, LOW);
      if (now - lastRedLedToggle >= RED_LED_BLINK_INTERVAL) {
        lastRedLedToggle = now;
        redLedState = !redLedState;
        digitalWrite(RED_LED_PIN, redLedState ? HIGH : LOW);
      }
      if (now - lastBuzzerToggle >= BUZZER_BEEP_INTERVAL) {
        lastBuzzerToggle = now;
        buzzerState = !buzzerState;
        digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
      }
      break;
  }
}

// =============================================================
// BUTTON HANDLING
// =============================================================

void handleButton(unsigned long now) {
  if (buttonInterruptFlag) {
    buttonInterruptFlag = false;
    if (now - lastButtonPress >= DEBOUNCE_DELAY_MS) {
      lastButtonPress = now;
      manualAlertActive = !manualAlertActive;
      forceUpload = true;

      if (manualAlertActive) {
        Serial.println("[ALERT] MANUAL ALERT ACTIVATED (press button again to deactivate)");
      } else {
        Serial.println("[ALERT] Manual alert deactivated");
      }
    }
  }
}

// =============================================================
// WIFI RECONNECTION
// =============================================================

void handleWiFiReconnect(unsigned long now) {
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWiFiReconnect >= WIFI_RECONNECT_INTERVAL) {
      lastWiFiReconnect = now;
      Serial.println("[WIFI] Disconnected. Attempting reconnect...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  }
}

// =============================================================
// FIREBASE REST UPLOAD
// =============================================================

void uploadLiveToFirebase(float bpm, float spo2) {
  Serial.printf("[LIVE] Sending BPM: %.1f  SpO2: %.1f  Status: %s  Alert: %s\n",
    bpm, spo2,
    healthStateToString(healthState),
    manualAlertActive ? "YES" : "NO"
  );

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[LIVE] WiFi not connected, skipping upload");
    return;
  }

  double timestamp = currentTimestampMs();
  String timestampText = String(timestamp, 0);
  String livePayload = buildReadingPayload(bpm, spo2, timestampText);

  String devicePayload = "{";
  devicePayload += "\"name\":\"" + String(MINER_NAME) + "\",";
  devicePayload += "\"location\":\"" + String(MINER_LOCATION) + "\",";
  devicePayload += "\"active\":true,";
  devicePayload += "\"status\":\"online\",";
  devicePayload += "\"lastSeen\":" + timestampText + ",";
  devicePayload += "\"live\":" + livePayload;
  devicePayload += "}";

  bool deviceOk = firebasePatch("/devices/" + String(DEVICE_ID), devicePayload);

  if (deviceOk) {
    Serial.println("[LIVE] Firebase success");
  } else {
    Serial.println("[LIVE] Firebase failed. Check HTTP code above, database URL, secret, and rules.");
  }
}

void uploadAnalyticsToFirebase(float avgBPM, float avgSpO2) {
  Serial.printf("[ANALYTICS] Sending 1-min avg BPM: %.1f  avg SpO2: %.1f\n", avgBPM, avgSpO2);

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ANALYTICS] WiFi not connected, skipping upload");
    return;
  }

  double timestamp = currentTimestampMs();
  unsigned long long minuteTimestamp = ((unsigned long long)(timestamp / 60000.0)) * 60000ULL;
  String minuteTimestampText = String((double)minuteTimestamp, 0);
  String payload = buildReadingPayload(avgBPM, avgSpO2, minuteTimestampText);

  bool analyticsOk = firebasePut("/analytics/" + String(DEVICE_ID) + "/" + minuteTimestampText, payload);
  if (analyticsOk) {
    Serial.println("[ANALYTICS] Firebase success");
  } else {
    Serial.println("[ANALYTICS] Firebase failed. Check HTTP code above.");
  }
}

String buildReadingPayload(float bpm, float spo2, String timestampText) {
  String payload = "{";
  payload += "\"heartRate\":" + String(bpm, 1) + ",";
  payload += "\"hr\":" + String(bpm, 1) + ",";
  payload += "\"spo2\":" + String(spo2, 1) + ",";
  payload += "\"status\":\"" + String(healthStateToString(healthState)) + "\",";
  payload += "\"finger\":" + String(fingerDetected ? "true" : "false") + ",";
  payload += "\"manual_alert\":" + String(manualAlertActive ? "true" : "false") + ",";
  payload += "\"timestamp\":" + timestampText + ",";
  payload += "\"sim_mode\":true";
  payload += "}";
  return payload;
}

void registerDeviceInfo() {
  if (WiFi.status() != WL_CONNECTED) return;

  String timestamp = String(currentTimestampMs(), 0);
  String payload = "{";
  payload += "\"name\":\"" + String(MINER_NAME) + "\",";
  payload += "\"location\":\"" + String(MINER_LOCATION) + "\",";
  payload += "\"active\":true,";
  payload += "\"status\":\"online\",";
  payload += "\"lastSeen\":" + timestamp;
  payload += "}";

  firebasePatch("/devices/" + String(DEVICE_ID), payload);
}

bool firebasePut(String path, String payload) {
  return firebaseWrite("PUT", path, payload);
}

bool firebasePatch(String path, String payload) {
  return firebaseWrite("PATCH", path, payload);
}

bool firebaseWrite(String method, String path, String payload) {
  HTTPClient http;
  String url = String(FIREBASE_DATABASE_URL) + path + ".json?auth=" + String(FIREBASE_DATABASE_SECRET);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  int httpCode = http.sendRequest(method.c_str(), payload);
  String response = http.getString();
  http.end();

  Serial.printf("[FIREBASE] %s %s -> HTTP %d\n", method.c_str(), path.c_str(), httpCode);
  if (httpCode < 200 || httpCode >= 300) {
    Serial.println(response);
    return false;
  }

  return true;
}

double currentTimestampMs() {
  time_t now;
  time(&now);

  if (now > 100000) {
    return (double)now * 1000.0;
  }

  return (double)millis();
}

void waitForTimeSync() {
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.print("[TIME] Synchronizing clock");
  unsigned long started = millis();
  time_t now;
  time(&now);

  while (now <= 100000 && millis() - started < 10000) {
    delay(500);
    Serial.print(".");
    time(&now);
  }

  if (now > 100000) {
    Serial.println(" OK");
  } else {
    Serial.println(" skipped; uploads will retry with device uptime until NTP is available");
  }
}

// =============================================================
// UTILITY FUNCTIONS
// =============================================================

const char* healthStateToString(HealthState state) {
  switch (state) {
    case HEALTH_NO_FINGER:    return "NO_FINGER";
    case HEALTH_NORMAL:       return "NORMAL";
    case HEALTH_WARNING:      return "WARNING";
    case HEALTH_CRITICAL:     return "CRITICAL";
    case HEALTH_MANUAL_ALERT: return "MANUAL_ALERT";
    default:                  return "UNKNOWN";
  }
}
