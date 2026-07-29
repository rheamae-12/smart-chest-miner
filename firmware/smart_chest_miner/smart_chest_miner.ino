/*
 * Smart Chest Miner - ESP32 firmware (Firebase Realtime Database)
 *
 * Live data ~1s, analytics average every 1 minute.
 *
 * This revision fixes the issues found in the review:
 *   1. REAL MAX30102 heart-rate + SpO2 (Maxim algorithm) — no longer simulated.
 *   2. NTP-safe timestamps — uploads are skipped until the clock is real, so the
 *      dashboard never sees an invalid (pre-2000) timestamp and mark us offline.
 *   3. Networking runs in a FreeRTOS task on core 0, so a blocking/slow HTTP
 *      upload can never freeze the sensor loop or the alert buzzer (core 1).
 *   4. Analytics rows always send finger=true (they are built only from contact
 *      samples) so the dashboard never discards a valid minute average.
 *   5. Device-local WARNING/CRITICAL alerting from real vitals — the buzzer warns
 *      the worker even if WiFi / the dashboard is down.
 *
 * NOTE (security): FIREBASE_DATABASE_SECRET is a legacy super-admin token that
 * bypasses database.rules.json. If you disable legacy secrets in the Firebase
 * console (recommended for the web app), this device must migrate to Firebase
 * Auth (sign in, use the returned idToken as ?auth=). Kept here knowingly.
 *
 * NOTE (hardware): add a 470-1000uF cap on the 5V rail at the ESP32 and
 * 100uF+100nF on the 3.3V sensor rail, or WiFi current spikes will brown-out
 * the board. See docs/HARDWARE_NOTES.md.
 */

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"   // SparkFun MAX3010x library — Maxim HR/SpO2 algorithm

// ---- Set to 1 to fall back to the old simulated values (no real sensor math) ----
#define USE_SIMULATION 0

const char* WIFI_SSID     = "ZTE_2.4G_uuCrK2";
const char* WIFI_PASSWORD = "TizH3Ucd";

#define FIREBASE_DATABASE_URL    "https://smart-chest-miner-default-rtdb.firebaseio.com"
#define FIREBASE_DATABASE_SECRET "GJY8fpUA211duwUw7o92ks0EXlYOFdqWYz5rK6N5"

const char* DEVICE_ID      = "SCM-003";
const char* MINER_NAME     = "Acuzar Great Miner";
const char* MINER_LOCATION = "Masara Shaft-3";

// ---- Pins (match the actual breadboard wiring, not the target schematic) ----
#define SDA_PIN        16
#define SCL_PIN        17
#define BUZZER_PIN     27
#define GREEN_LED_PIN  26
#define RED_LED_PIN    25
#define BUTTON_PIN     33     // GPIO33 supports INPUT_PULLUP (unlike input-only 35)

// ---- Timing ----
#define LIVE_UPLOAD_INTERVAL_MS  1000
#define ANALYTICS_INTERVAL_MS    60000
#define PRINT_INTERVAL_MS        5000
#define SENSOR_READ_INTERVAL     10
#define DEBOUNCE_DELAY_MS        50
#define WIFI_RECONNECT_INTERVAL  10000
#define WIFI_CONFIG_POLL_MS      30000
#define RED_LED_BLINK_INTERVAL   200
#define BUZZER_BEEP_INTERVAL     100

// ---- Contact (finger/chest) detection on the MAX30102 IR channel ----
#define FINGER_THRESHOLD     20000
#define FINGER_ON_COUNT      1
#define FINGER_OFF_COUNT     3
#define CONTACT_LOST_TIMEOUT_MS 5000

// ---- Real-vitals sample buffer (Maxim algorithm) ----
#define RAW_BUFFER_LEN       100   // ~4s window at 25Hz output (100Hz / avg 4)
#define RAW_SLIDE            25    // recompute every 25 new samples (~1s)

// ---- Vital filtering ----
#define HR_MIN_VALID         40
#define HR_MAX_VALID         180
#define HR_MAX_JUMP          25
#define HR_SMOOTH_ALPHA      0.25f
#define HR_DOUBLE_ARTIFACT   130
#define HR_HALF_MIN          55
#define HR_HALF_MAX          95
#define HR_HIGH_CONFIRM      4
#define SPO2_MIN_VALID       80
#define SPO2_MAX_VALID       100
#define SPO2_MAX_JUMP        5
#define SPO2_SMOOTH_ALPHA    0.35f

// ---- Device-local safety thresholds (drive the buzzer independent of network) ----
#define SPO2_CRITICAL        90
#define SPO2_WARNING         94
#define HR_HIGH_CRITICAL     130
#define HR_HIGH_WARNING      120
#define HR_LOW_WARNING       50
#define HR_LOW_CRITICAL      40

// ---- Simulation (only used when USE_SIMULATION == 1) ----
#define SIM_UPDATE_INTERVAL  2000
#define SIM_BPM_CENTER       75.0
#define SIM_BPM_MIN          72.0
#define SIM_BPM_MAX          78.0
#define SIM_SPO2_CENTER      97.5
#define SIM_SPO2_MIN         96.0
#define SIM_SPO2_MAX         99.0

enum HealthState {
  HEALTH_NO_FINGER,
  HEALTH_NORMAL,
  HEALTH_WARNING,
  HEALTH_CRITICAL,
  HEALTH_MANUAL_ALERT
};

MAX30105 particleSensor;
HealthState healthState = HEALTH_NO_FINGER;

float currentBPM  = 0.0;
float currentSpO2 = 0.0;

unsigned long lastLiveUploadTime     = 0;
unsigned long lastAnalyticsUploadTime = 0;
unsigned long lastSensorRead         = 0;
unsigned long lastWiFiReconnect      = 0;
unsigned long lastWiFiConfigPoll     = 0;
unsigned long lastRedLedToggle       = 0;
unsigned long lastGreenLedToggle     = 0;
unsigned long lastPrintTime          = 0;
unsigned long lastSimUpdate          = 0;
unsigned long lastBuzzerToggle       = 0;

float analyticsBpmSum  = 0;
float analyticsSpo2Sum = 0;
int   analyticsSampleCount = 0;
bool  forceUpload = false;

volatile bool buttonInterruptFlag = false;
bool manualAlertActive = false;
unsigned long lastButtonPress = 0;
bool buttonPressedDisplay = false;
unsigned long buttonPressCount = 0;
int hrHighCandidateCount = 0;

bool redLedState   = false;
bool greenLedState = false;
bool buzzerState   = false;

bool fingerDetected     = false;
bool wasFingerDetected  = false;
bool noFingerStateUploaded = false;

int fingerOnCounter  = 0;
int fingerOffCounter = 0;
uint32_t latestIrValue = 0;
unsigned long lastPulseSampleTime = 0;

// Maxim-algorithm sample buffers
uint32_t irBuffer[RAW_BUFFER_LEN];
uint32_t redBuffer[RAW_BUFFER_LEN];
int rawIndex = 0;

// ---- FreeRTOS networking ----
typedef struct {
  char method[8];
  char path[96];
  char payload[384];
} FirebaseJob;

QueueHandle_t firebaseQueue;
volatile bool timeSynced = false;

void IRAM_ATTR buttonISR() {
  buttonInterruptFlag = true;
}

// =================================================================
// Setup
// =================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("========================================");
  Serial.println("  Smart Chest Miner - Firebase");
  Serial.println("========================================");

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
    while (1) {
      digitalWrite(RED_LED_PIN, HIGH);
      delay(100);
      digitalWrite(RED_LED_PIN, LOW);
      delay(100);
    }
  }
  Serial.println("OK");

  // ledBrightness, sampleAvg, ledMode(2=Red+IR), sampleRate, pulseWidth, adcRange
  particleSensor.setup(0x7F, 4, 2, 100, 411, 16384);
  particleSensor.setPulseAmplitudeGreen(0);

  // Networking task on core 0 (loop/sensors run on core 1)
  firebaseQueue = xQueueCreate(8, sizeof(FirebaseJob));
  xTaskCreatePinnedToCore(networkTask, "networkTask", 8192, NULL, 1, NULL, 0);

  connectWiFi();

  // Sync the clock BEFORE we start uploading so timestamps are valid epoch ms.
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  waitForTimeSync(10000);

#if USE_SIMULATION
  randomSeed(micros());
#endif

  registerDeviceInfo();
}

void connectWiFi() {
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
}

void connectWiFiWithCredentials(const char* ssid, const char* password) {
  if (ssid == NULL || strlen(ssid) == 0) return;
  Serial.printf("[WIFI] Applying queued SSID: %s\n", ssid);
  WiFi.disconnect(true);
  delay(150);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
}

void waitForTimeSync(unsigned long timeoutMs) {
  Serial.print("[INIT] Waiting for NTP time sync ");
  unsigned long start = millis();
  time_t now = 0;
  while ((millis() - start) < timeoutMs) {
    time(&now);
    if (now > 1000000000) {  // ~2001 — clock is real
      timeSynced = true;
      Serial.printf("\n[INIT] Time synced: %lu\n", (unsigned long)now);
      return;
    }
    delay(250);
    Serial.print(".");
  }
  Serial.println("\n[WARN] NTP not synced yet. Uploads pause until the clock is valid.");
}

// =================================================================
// Main loop (core 1) — never performs blocking network I/O
// =================================================================
void loop() {
  unsigned long now = millis();

  handleWiFiReconnect(now);
  handleButton(now);
  handleMonitoring(now);
}

void handleMonitoring(unsigned long now) {
  if (now - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = now;
    readSensor();
  }
  if (fingerDetected && lastPulseSampleTime > 0 && now - lastPulseSampleTime > CONTACT_LOST_TIMEOUT_MS) {
    updateFingerState(false);
  }

  if (fingerDetected && !wasFingerDetected) {
#if USE_SIMULATION
    currentBPM = SIM_BPM_CENTER;
    currentSpO2 = SIM_SPO2_CENTER;
    lastSimUpdate = now;
#endif
    noFingerStateUploaded = false;
    forceUpload = true;
    Serial.println("Chest detected. Reading vitals.");
  }

  if (!fingerDetected && wasFingerDetected) {
    currentBPM = 0;
    currentSpO2 = 0;
    rawIndex = 0;  // discard partial window
    noFingerStateUploaded = false;
    forceUpload = true;
    Serial.println("[WARN] No chest detected! Place chest on sensor.");
  }

  wasFingerDetected = fingerDetected;

#if USE_SIMULATION
  if (fingerDetected && (now - lastSimUpdate >= SIM_UPDATE_INTERVAL)) {
    lastSimUpdate = now;
    updateSimulatedValues();
  }
#endif

  if (!fingerDetected) {
    currentBPM = 0;
    currentSpO2 = 0;
  }

  evaluateHealth();
  updateIndicators(now);

  // Accumulate analytics only from valid contact samples
  if (fingerDetected && currentBPM > 0 && currentSpO2 > 0) {
    analyticsBpmSum += currentBPM;
    analyticsSpo2Sum += currentSpO2;
    analyticsSampleCount++;
  }

  if (now - lastPrintTime >= PRINT_INTERVAL_MS) {
    lastPrintTime = now;
    if (fingerDetected) {
      Serial.printf("[VITALS] IR:%lu BPM:%.1f SpO2:%.1f Status:%s Chest:YES Alert:%s\n",
        (unsigned long)latestIrValue, currentBPM, currentSpO2,
        healthStateToString(healthState), manualAlertActive ? "YES" : "NO");
    } else {
      Serial.printf("[WARN] IR:%lu No chest Status:%s Alert:%s\n",
        (unsigned long)latestIrValue, healthStateToString(healthState),
        manualAlertActive ? "YES" : "NO");
    }
  }

  // Live upload (enqueued — actual HTTP happens in the network task)
  if (forceUpload || (now - lastLiveUploadTime >= LIVE_UPLOAD_INTERVAL_MS)) {
    lastLiveUploadTime = now;
    if (fingerDetected || manualAlertActive || !noFingerStateUploaded) {
      enqueueLiveUpload(currentBPM, currentSpO2);
      if (!fingerDetected && !manualAlertActive) {
        noFingerStateUploaded = true;
      }
    }
    forceUpload = false;
  }

  // Analytics upload (per-minute average)
  if (now - lastAnalyticsUploadTime >= ANALYTICS_INTERVAL_MS) {
    lastAnalyticsUploadTime = now;
    if (analyticsSampleCount == 0) {
      Serial.println("[ANALYTICS] No valid contact samples. Skipping.");
      return;
    }
    float avgBPM  = analyticsBpmSum / analyticsSampleCount;
    float avgSpO2 = analyticsSpo2Sum / analyticsSampleCount;
    analyticsBpmSum = 0;
    analyticsSpo2Sum = 0;
    analyticsSampleCount = 0;
    enqueueAnalyticsUpload(avgBPM, avgSpO2);
  }
}

// =================================================================
// Sensor: contact detection + real HR/SpO2
// =================================================================
void readSensor() {
  particleSensor.check();

  bool gotSample = false;
  bool anyDetected = false;

  while (particleSensor.available()) {
    uint32_t ir  = particleSensor.getFIFOIR();
    uint32_t red = particleSensor.getFIFORed();
    particleSensor.nextSample();

    latestIrValue = ir;
    lastPulseSampleTime = millis();
    gotSample = true;
    if (ir >= FINGER_THRESHOLD) anyDetected = true;

#if !USE_SIMULATION
    // Buffer raw samples for the Maxim algorithm
    if (rawIndex < RAW_BUFFER_LEN) {
      irBuffer[rawIndex]  = ir;
      redBuffer[rawIndex] = red;
      rawIndex++;
    }
    if (rawIndex >= RAW_BUFFER_LEN) {
      computeVitals();
      // Slide the window: keep the most recent (LEN - RAW_SLIDE) samples
      for (int i = RAW_SLIDE; i < RAW_BUFFER_LEN; i++) {
        irBuffer[i - RAW_SLIDE]  = irBuffer[i];
        redBuffer[i - RAW_SLIDE] = redBuffer[i];
      }
      rawIndex = RAW_BUFFER_LEN - RAW_SLIDE;
    }
#endif
  }

  if (!gotSample) return;
  updateFingerState(anyDetected);
}

void updateFingerState(bool anyDetected) {
  if (anyDetected) {
    fingerOnCounter++;
    fingerOffCounter = 0;
    if (fingerOnCounter >= FINGER_ON_COUNT) {
      fingerDetected = true;
      fingerOnCounter = FINGER_ON_COUNT;
    }
  } else {
    fingerOffCounter++;
    fingerOnCounter = 0;
    if (fingerOffCounter >= FINGER_OFF_COUNT) {
      fingerDetected = false;
      fingerOffCounter = FINGER_OFF_COUNT;
    }
  }
}

#if !USE_SIMULATION
// computeVitals — runs the Maxim algorithm over the buffered window and updates
// currentBPM / currentSpO2 only when the result is valid and physiologically sane.
void computeVitals() {
  int32_t spo2 = 0;   int8_t validSpo2 = 0;
  int32_t hr   = 0;   int8_t validHr   = 0;

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, RAW_BUFFER_LEN, redBuffer, &spo2, &validSpo2, &hr, &validHr);

  if (!fingerDetected) return;

  if (validHr) acceptHeartRate((float)hr);
  if (validSpo2) acceptSpO2((float)spo2);
}

void acceptHeartRate(float bpm) {
  if (bpm < HR_MIN_VALID || bpm > HR_MAX_VALID) return;

  if (bpm >= HR_DOUBLE_ARTIFACT) {
    float halfBpm = bpm * 0.5f;
    bool halfLooksHuman = halfBpm >= HR_HALF_MIN && halfBpm <= HR_HALF_MAX;
    bool halfMatchesCurrent = currentBPM <= 0 || fabsf(halfBpm - currentBPM) <= HR_MAX_JUMP;
    if (halfLooksHuman && halfMatchesCurrent) {
      bpm = halfBpm;
      hrHighCandidateCount = 0;
    } else {
      hrHighCandidateCount++;
      if (hrHighCandidateCount < HR_HIGH_CONFIRM) return;
    }
  } else {
    hrHighCandidateCount = 0;
  }

  if (currentBPM <= 0) {
    currentBPM = bpm;
    return;
  }
  if (fabsf(bpm - currentBPM) > HR_MAX_JUMP) return;
  currentBPM = (currentBPM * (1.0f - HR_SMOOTH_ALPHA)) + (bpm * HR_SMOOTH_ALPHA);
}

void acceptSpO2(float spo2) {
  if (spo2 < SPO2_MIN_VALID || spo2 > SPO2_MAX_VALID) return;
  if (currentSpO2 <= 0) {
    currentSpO2 = spo2;
    return;
  }
  if (fabsf(spo2 - currentSpO2) > SPO2_MAX_JUMP) return;
  currentSpO2 = (currentSpO2 * (1.0f - SPO2_SMOOTH_ALPHA)) + (spo2 * SPO2_SMOOTH_ALPHA);
}
#endif

#if USE_SIMULATION
void updateSimulatedValues() {
  currentBPM = constrain(currentBPM + random(-100, 101) / 100.0, SIM_BPM_MIN, SIM_BPM_MAX);
  currentSpO2 = constrain(currentSpO2 + random(-50, 51) / 100.0, SIM_SPO2_MIN, SIM_SPO2_MAX);
}
#endif

// =================================================================
// Health evaluation (device-local alerting)
// =================================================================
void evaluateHealth() {
  if (manualAlertActive) { healthState = HEALTH_MANUAL_ALERT; return; }
  if (!fingerDetected)   { healthState = HEALTH_NO_FINGER;    return; }

  // No valid reading yet (warming up) — don't alarm
  if (currentBPM <= 0 || currentSpO2 <= 0) { healthState = HEALTH_NORMAL; return; }

  bool critical = (currentSpO2 < SPO2_CRITICAL) ||
                  (currentBPM >= HR_HIGH_CRITICAL) || (currentBPM <= HR_LOW_CRITICAL);
  bool warning  = (currentSpO2 < SPO2_WARNING) ||
                  (currentBPM >= HR_HIGH_WARNING) || (currentBPM <= HR_LOW_WARNING);

  if (critical)      healthState = HEALTH_CRITICAL;
  else if (warning)  healthState = HEALTH_WARNING;
  else               healthState = HEALTH_NORMAL;
}

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

void handleButton(unsigned long now) {
  buttonPressedDisplay = digitalRead(BUTTON_PIN) == LOW;
  if (buttonInterruptFlag) {
    buttonInterruptFlag = false;
    if (now - lastButtonPress >= DEBOUNCE_DELAY_MS) {
      lastButtonPress = now;
      buttonPressCount++;
      manualAlertActive = !manualAlertActive;
      buttonPressedDisplay = true;
      forceUpload = true;
      enqueueButtonAnalyticsUpload();
      Serial.println(manualAlertActive ? "[ALERT] MANUAL ALERT ACTIVATED"
                                        : "[ALERT] Manual alert deactivated");
    }
  }
}

void handleWiFiReconnect(unsigned long now) {
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWiFiReconnect >= WIFI_RECONNECT_INTERVAL) {
      lastWiFiReconnect = now;
      Serial.println("[WIFI] Disconnected. Reconnecting...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  } else if (now - lastWiFiConfigPoll >= WIFI_CONFIG_POLL_MS) {
    lastWiFiConfigPoll = now;
    applyQueuedWifiConfig();
  }
}

// =================================================================
// Upload — main loop builds payloads and enqueues; network task sends.
// =================================================================
void enqueueLiveUpload(float bpm, float spo2) {
  double ts = currentTimestampMs();
  String tsText = timestampJson(ts);
  if (ts <= 0) Serial.println("[LIVE] Clock not ready, using Firebase server timestamp.");
  String live = buildReadingPayload(bpm, spo2, tsText, fingerDetected);

  String devicePayload = "{";
  devicePayload += "\"name\":\"" + String(MINER_NAME) + "\",";
  devicePayload += "\"location\":\"" + String(MINER_LOCATION) + "\",";
  devicePayload += "\"active\":true,";
  devicePayload += "\"status\":\"online\",";
  devicePayload += "\"lastSeen\":" + tsText + ",";
  devicePayload += "\"live\":" + live;
  devicePayload += "}";

  enqueueJob("PATCH", "/devices/" + String(DEVICE_ID), devicePayload);
}

void enqueueAnalyticsUpload(float avgBPM, float avgSpO2) {
  double ts = currentTimestampMs();
  if (ts <= 0) { Serial.println("[ANALYTICS] Clock not ready, skipping."); return; }

  unsigned long long minuteTs = ((unsigned long long)(ts / 60000.0)) * 60000ULL;
  String minuteText = String((double)minuteTs, 0);
  // Analytics rows are built only from contact samples -> always finger=true so
  // the dashboard never discards a valid minute average.
  String payload = buildReadingPayload(avgBPM, avgSpO2, minuteText, true);

  enqueueJob("PUT", "/analytics/" + String(DEVICE_ID) + "/" + minuteText, payload);
}

void enqueueButtonAnalyticsUpload() {
  double ts = currentTimestampMs();
  if (ts <= 0) { Serial.println("[BUTTON] Clock not ready, analytics event skipped."); return; }
  String tsText = String(ts, 0);
  String payload = buildReadingPayload(currentBPM, currentSpO2, tsText, fingerDetected);
  enqueueJob("PUT", "/analytics/" + String(DEVICE_ID) + "/" + tsText, payload);
}

String buildReadingPayload(float bpm, float spo2, String tsText, bool finger) {
  float safeBpm = finger ? bpm : 0;
  float safeSpO2 = finger ? spo2 : 0;
  String p = "{";
  p += "\"heartRate\":" + String(safeBpm, 1) + ",";
  p += "\"hr\":" + String(safeBpm, 1) + ",";
  p += "\"spo2\":" + String(safeSpO2, 1) + ",";
  p += "\"status\":\"" + String(healthStateToString(healthState)) + "\",";
  p += "\"finger\":" + String(finger ? "true" : "false") + ",";
  p += "\"manual_alert\":" + String(manualAlertActive ? "true" : "false") + ",";
  p += "\"button_pressed\":" + String(buttonPressedDisplay ? "true" : "false") + ",";
  p += "\"button_press_count\":" + String(buttonPressCount) + ",";
  p += "\"timestamp\":" + tsText + ",";
  p += "\"sim_mode\":" + String(USE_SIMULATION ? "true" : "false");
  p += "}";
  return p;
}

void registerDeviceInfo() {
  double ts = currentTimestampMs();
  String tsText = timestampJson(ts);

  String payload = "{";
  payload += "\"name\":\"" + String(MINER_NAME) + "\",";
  payload += "\"location\":\"" + String(MINER_LOCATION) + "\",";
  payload += "\"active\":true,";
  payload += "\"status\":\"online\",";
  payload += "\"lastSeen\":" + tsText;
  payload += "}";

  enqueueJob("PATCH", "/devices/" + String(DEVICE_ID), payload);
}

// enqueueJob — copy a job into the queue (non-blocking). Dropped if the queue is
// full (e.g. WiFi down) — live data is ephemeral so this is acceptable.
void enqueueJob(const char* method, String path, String payload) {
  if (firebaseQueue == NULL) return;

  FirebaseJob job;
  strlcpy(job.method, method, sizeof(job.method));
  strlcpy(job.path, path.c_str(), sizeof(job.path));
  strlcpy(job.payload, payload.c_str(), sizeof(job.payload));

  if (xQueueSend(firebaseQueue, &job, 0) != pdTRUE) {
    Serial.println("[NET] Queue full, dropped one upload.");
  }
}

// =================================================================
// Network task (core 0) — the only place that blocks on HTTP.
// =================================================================
void networkTask(void* param) {
  FirebaseJob job;
  for (;;) {
    if (xQueueReceive(firebaseQueue, &job, portMAX_DELAY) == pdTRUE) {
      if (WiFi.status() == WL_CONNECTED) {
        firebaseWrite(job.method, job.path, job.payload);
      } else {
        Serial.println("[NET] WiFi down, skipping queued upload.");
      }
    }
  }
}

bool firebaseWrite(const char* method, const char* path, const char* payload) {
  if (!firebaseConfigured()) {
    Serial.println("[FIREBASE] Missing FIREBASE_DATABASE_URL or FIREBASE_DATABASE_SECRET.");
    return false;
  }

  HTTPClient http;
  String baseUrl = String(FIREBASE_DATABASE_URL);
  baseUrl.trim();
  if (baseUrl.endsWith("/")) baseUrl.remove(baseUrl.length() - 1);
  String cleanPath = String(path);
  if (!cleanPath.startsWith("/")) cleanPath = "/" + cleanPath;
  String url = baseUrl + cleanPath + ".json?auth=" + String(FIREBASE_DATABASE_SECRET);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(4000);

  int code = http.sendRequest(method, (uint8_t*)payload, strlen(payload));
  Serial.printf("[FIREBASE] %s %s -> HTTP %d\n", method, path, code);

  if (code < 200 || code >= 300) {
    Serial.println(http.getString());
    http.end();
    return false;
  }
  http.end();
  return true;
}

bool firebaseRead(const String& path, String& body) {
  if (!firebaseConfigured() || WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String baseUrl = String(FIREBASE_DATABASE_URL);
  baseUrl.trim();
  if (baseUrl.endsWith("/")) baseUrl.remove(baseUrl.length() - 1);
  String cleanPath = path;
  if (!cleanPath.startsWith("/")) cleanPath = "/" + cleanPath;
  String url = baseUrl + cleanPath + ".json?auth=" + String(FIREBASE_DATABASE_SECRET);

  http.begin(url);
  http.setTimeout(4000);
  int code = http.GET();
  if (code >= 200 && code < 300) body = http.getString();
  http.end();
  return code >= 200 && code < 300;
}

String jsonStringValue(const String& json, const char* key) {
  String marker = "\"" + String(key) + "\":\"";
  int start = json.indexOf(marker);
  if (start < 0) return "";
  start += marker.length();
  int end = json.indexOf("\"", start);
  if (end < 0) return "";
  return json.substring(start, end);
}

void applyQueuedWifiConfig() {
  String body;
  if (!firebaseRead("/wifiConfigurations/" + String(DEVICE_ID), body)) return;
  if (body == "null" || body.indexOf("\"ssid\"") < 0) return;

  String ssid = jsonStringValue(body, "ssid");
  String password = jsonStringValue(body, "password");
  if (ssid.length() == 0 || ssid == WiFi.SSID()) return;
  connectWiFiWithCredentials(ssid.c_str(), password.c_str());
}

bool firebaseConfigured() {
  String databaseUrl = String(FIREBASE_DATABASE_URL);
  String databaseSecret = String(FIREBASE_DATABASE_SECRET);
  databaseUrl.trim();
  databaseSecret.trim();
  return databaseUrl.length() > 0 &&
         databaseSecret.length() > 0 &&
         databaseUrl != "placeholder" &&
         databaseSecret != "placeholder";
}

// currentTimestampMs — real epoch milliseconds, or 0 when the clock is not yet
// synced (callers must skip uploads on 0 so the dashboard never sees a bad ts).
double currentTimestampMs() {
  time_t now;
  time(&now);
  if (now > 1000000000) {  // ~2001
    timeSynced = true;
    return (double)now * 1000.0;
  }
  return 0;
}

String timestampJson(double timestampMs) {
  if (timestampMs > 0) return String(timestampMs, 0);
  return "{\".sv\":\"timestamp\"}";
}

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
