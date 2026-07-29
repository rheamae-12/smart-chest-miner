/*
 * Smart Chest Miner - ESP32 firmware (COMPLETE / full hardware)
 * Based on the schematic: MAX30102 (HR/SpO2) + MAX30205 (body temp) +
 * SSD1306 OLED + 3 buzzers + 2 LEDs + SOS button.
 *
 * Design notes:
 *  - Real HR + SpO2 via the Maxim algorithm (no simulation).
 *  - Body temperature from MAX30205 (°C).
 *  - OLED shows live vitals on-device.
 *  - 3 buzzers map to the 3 vitals (HR / SpO2 / Temp); the SOS button sounds all.
 *  - I2C devices are AUTO-DETECTED at boot, so this same sketch runs on the
 *    prototype (MAX30102 only) and the final board (all sensors) unchanged.
 *  - NTP-safe timestamps; Firebase HTTP runs in a FreeRTOS task on core 0 so a
 *    slow upload never freezes the sensor loop / alert buzzers on core 1.
 *
 * Required libraries (Library Manager):
 *   - SparkFun MAX3010x Pulse and Proximity Sensor   (MAX30105.h, spo2_algorithm.h)
 *   - Adafruit SSD1306  +  Adafruit GFX               (OLED)
 *   (MAX30205 is read directly over I2C — no extra library.)
 *
 * SECURITY: FIREBASE_DATABASE_SECRET is a legacy super-admin token that bypasses
 * database.rules.json. To disable legacy secrets, migrate to Firebase Auth and
 * use the returned idToken as ?auth=. Kept here knowingly.
 *
 * HARDWARE: add 470-1000uF on the 5V rail at the ESP32 and 100uF+100nF on the
 * 3.3V sensor rail or WiFi spikes will brown-out the board. See docs/HARDWARE_NOTES.md.
 */

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define USE_SIMULATION 0

const char* WIFI_SSID     = "Converge_2.4GHz_42BD";
const char* WIFI_PASSWORD = "bordersnigerald2025";

#define FIREBASE_DATABASE_URL    "https://smart-chest-miner-default-rtdb.firebaseio.com/"
#define FIREBASE_DATABASE_SECRET "GJY8fpUA211duwUw7o92ks0EXlYOFdqWYz5rK6N5"

const char* DEVICE_ID      = "SCM-003";
const char* MINER_NAME     = "Acuzar Great Miner";
const char* MINER_LOCATION = "Masara Shaft-3";

// ---- Pins (schematic / final board) ----
#define SDA_PIN          21
#define SCL_PIN          22
#define BUZZER_HR_PIN    25   // driver A — heart rate
#define BUZZER_SPO2_PIN  26   // driver B — SpO2
#define BUZZER_TEMP_PIN  27   // driver C — temperature
#define GREEN_LED_PIN    32
#define RED_LED_PIN      33
#define BUTTON_PIN       35   // input-only + external 10k pull-up -> INPUT (no pullup)
// ---- I2C addresses ----
#define ADDR_MAX30102    0x57
#define ADDR_MAX30205    0x48
#define ADDR_OLED        0x3C

// ---- OLED ----
#define SCREEN_WIDTH     128
#define SCREEN_HEIGHT    64
#define OLED_RESET       -1

// ---- Timing ----
#define LIVE_UPLOAD_INTERVAL_MS  1000
#define ANALYTICS_INTERVAL_MS    60000
#define PRINT_INTERVAL_MS        5000
#define SENSOR_READ_INTERVAL     10
#define TEMP_READ_INTERVAL       2000
#define DISPLAY_INTERVAL         500
#define DEBOUNCE_DELAY_MS        80
#define WIFI_RECONNECT_INTERVAL  10000
#define WIFI_CONFIG_POLL_MS      30000
#define RED_LED_BLINK_INTERVAL   200
#define BUZZER_BEEP_INTERVAL     100

// ---- Contact detection ----
#define FINGER_THRESHOLD     20000
#define FINGER_ON_COUNT      1
#define FINGER_OFF_COUNT     3
#define CONTACT_LOST_TIMEOUT_MS 5000

// ---- Maxim sample buffer ----
#define RAW_BUFFER_LEN       100
#define RAW_SLIDE            25

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

// ---- Old working HR/SpO2 simulation profile ----
#define SIM_UPDATE_INTERVAL  2000
#define SIM_BPM_CENTER       75.0
#define SIM_BPM_MIN          72.0
#define SIM_BPM_MAX          78.0
#define SIM_SPO2_CENTER      97.5
#define SIM_SPO2_MIN         96.0
#define SIM_SPO2_MAX         99.0

// ---- Buzzer tones (passive buzzers) ----
#define BUZZER_HR_FREQ       1200
#define BUZZER_SPO2_FREQ     1800
#define BUZZER_TEMP_FREQ     650

// ---- Device-local safety thresholds (drive the buzzers without the network) ----
#define HR_HIGH_WARNING      105
#define HR_HIGH_CRITICAL     120
#define HR_LOW_WARNING       55
#define HR_LOW_CRITICAL      45
#define SPO2_WARNING         80
#define SPO2_CRITICAL        75
#define TEMP_HIGH_WARNING    38.0
#define TEMP_HIGH_CRITICAL   39.0
#define TEMP_LOW_WARNING     30.0
#define TEMP_LOW_CRITICAL    28.0
enum HealthState { HEALTH_NO_FINGER, HEALTH_NORMAL, HEALTH_WARNING, HEALTH_CRITICAL, HEALTH_MANUAL_ALERT };

MAX30105 particleSensor;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ---- Detected hardware ----
bool hasPulseOx = false;
bool hasTemp    = false;
bool hasDisplay = false;

HealthState healthState = HEALTH_NO_FINGER;
bool alertHR = false, alertSpO2 = false, alertTemp = false;  // per-vital (critical) for buzzers

float currentBPM    = 0.0;
float currentSpO2   = 0.0;
float currentTemp   = 0.0;   // °C
int hrHighCandidateCount = 0;

unsigned long lastLiveUploadTime = 0, lastAnalyticsUploadTime = 0;
unsigned long lastSensorRead = 0, lastTempRead = 0, lastDisplay = 0;
unsigned long lastWiFiReconnect = 0, lastWiFiConfigPoll = 0, lastRedLedToggle = 0, lastGreenLedToggle = 0;
unsigned long lastPrintTime = 0, lastBuzzerToggle = 0, lastSimUpdate = 0;

float analyticsBpmSum = 0, analyticsSpo2Sum = 0, analyticsTempSum = 0;
int   analyticsSampleCount = 0, analyticsTempCount = 0;
bool  forceUpload = false;

bool manualAlertActive = false;
unsigned long lastButtonPress = 0;
bool buttonPressedDisplay = false;
unsigned long buttonPressCount = 0;

bool redLedState = false, greenLedState = false, buzzerPhase = false;

bool fingerDetected = false, wasFingerDetected = false, noFingerStateUploaded = false;
int  fingerOnCounter = 0, fingerOffCounter = 0;
uint32_t latestIrValue = 0;
unsigned long lastPulseSampleTime = 0;

uint32_t irBuffer[RAW_BUFFER_LEN];
uint32_t redBuffer[RAW_BUFFER_LEN];
int rawIndex = 0;

typedef struct { char method[8]; char path[96]; char payload[448]; } FirebaseJob;
QueueHandle_t firebaseQueue;

// =================================================================
// Setup
// =================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========================================");
  Serial.println("  Smart Chest Miner - FULL hardware");
  Serial.println("========================================");

  pinMode(BUZZER_HR_PIN, OUTPUT);
  pinMode(BUZZER_SPO2_PIN, OUTPUT);
  pinMode(BUZZER_TEMP_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT);           // external pull-up on GPIO35
  allBuzzers(LOW);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);

  analogReadResolution(12);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  scanI2C();
  initSensors();

  firebaseQueue = xQueueCreate(8, sizeof(FirebaseJob));
  xTaskCreatePinnedToCore(networkTask, "networkTask", 8192, NULL, 1, NULL, 0);

  connectWiFi();
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  waitForTimeSync(10000);
  randomSeed(analogRead(0));
  registerDeviceInfo();
}

void scanI2C() {
  Serial.println("[I2C] Scanning...");
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("[I2C]  found 0x%02X\n", addr);
      if (addr == ADDR_MAX30205) hasTemp = true;
      if (addr == ADDR_OLED)     hasDisplay = true;
    }
  }
  Serial.printf("[I2C] temp:%s oled:%s\n",
    hasTemp ? "yes" : "no", hasDisplay ? "yes" : "no");
}

void initSensors() {
  Serial.print("[INIT] MAX30102... ");
  if (particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    particleSensor.setup(0x7F, 4, 2, 100, 411, 16384);  // Red+IR, 100Hz/avg4
    particleSensor.setPulseAmplitudeGreen(0);
    hasPulseOx = true;
    Serial.println("OK");
  } else {
    Serial.println("NOT FOUND (HR/SpO2 disabled)");
  }

  if (hasDisplay) {
    if (display.begin(SSD1306_SWITCHCAPVCC, ADDR_OLED)) {
      display.clearDisplay();
      display.setTextColor(SSD1306_WHITE);
      display.setTextSize(1);
      display.setCursor(0, 0);
      display.println("Smart Chest Miner");
      display.println("Booting...");
      display.display();
    } else {
      hasDisplay = false;
    }
  }
}

void connectWiFi() {
  Serial.printf("[INIT] WiFi: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < 20000) { delay(500); Serial.print("."); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) Serial.printf("[INIT] WiFi OK: %s\n", WiFi.localIP().toString().c_str());
  else Serial.println("[WARN] WiFi failed; will retry in loop.");
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
  Serial.print("[INIT] NTP sync ");
  unsigned long start = millis();
  time_t now = 0;
  while ((millis() - start) < timeoutMs) {
    time(&now);
    if (now > 1000000000) { Serial.printf("\n[INIT] Time: %lu\n", (unsigned long)now); return; }
    delay(250); Serial.print(".");
  }
  Serial.println("\n[WARN] NTP not synced; uploads pause until the clock is valid.");
}

// =================================================================
// Main loop (core 1)
// =================================================================
void loop() {
  unsigned long now = millis();
  handleWiFiReconnect(now);
  handleButton(now);
  handleMonitoring(now);
}

void handleMonitoring(unsigned long now) {
  if (hasPulseOx && now - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = now;
    readPulseOx();
  }
  if (fingerDetected && lastPulseSampleTime > 0 && now - lastPulseSampleTime > CONTACT_LOST_TIMEOUT_MS) {
    updateFingerState(false);
  }
  if (hasTemp && now - lastTempRead >= TEMP_READ_INTERVAL) {
    lastTempRead = now;
    currentTemp = readBodyTemp();
  }
  if (fingerDetected && !wasFingerDetected) {
#if USE_SIMULATION
    currentBPM = SIM_BPM_CENTER;
    currentSpO2 = SIM_SPO2_CENTER;
    lastSimUpdate = now;
#endif
    noFingerStateUploaded = false; forceUpload = true;
    Serial.println("Chest detected. Reading vitals.");
  }
  if (!fingerDetected && wasFingerDetected) {
    clearContactReadings();
    noFingerStateUploaded = false; forceUpload = true;
    Serial.println("[WARN] No chest detected!");
  }
  wasFingerDetected = fingerDetected;
#if USE_SIMULATION
  if (fingerDetected && now - lastSimUpdate >= SIM_UPDATE_INTERVAL) {
    lastSimUpdate = now;
    updateSimulatedValues();
  }
#endif
  if (!fingerDetected) clearContactReadings();

  evaluateHealth();
  updateIndicators(now);

  if (fingerDetected && currentBPM > 0 && currentSpO2 > 0) {
    analyticsBpmSum += currentBPM; analyticsSpo2Sum += currentSpO2; analyticsSampleCount++;
    if (hasTemp && currentTemp > 0) { analyticsTempSum += currentTemp; analyticsTempCount++; }
  }

  if (hasDisplay && now - lastDisplay >= DISPLAY_INTERVAL) { lastDisplay = now; drawDisplay(); }

  if (now - lastPrintTime >= PRINT_INTERVAL_MS) {
    lastPrintTime = now;
    Serial.printf("[VITALS] IR:%lu BPM:%.1f SpO2:%.1f Temp:%.1f Chest:%s St:%s Alert:%s\n",
      (unsigned long)latestIrValue, currentBPM, currentSpO2, currentTemp,
      fingerDetected ? "YES" : "NO", healthStateToString(healthState),
      manualAlertActive ? "YES" : "NO");
  }

  if (forceUpload || (now - lastLiveUploadTime >= LIVE_UPLOAD_INTERVAL_MS)) {
    lastLiveUploadTime = now;
    enqueueLiveUpload();
    if (!fingerDetected && !manualAlertActive) noFingerStateUploaded = true;
    forceUpload = false;
  }

  if (now - lastAnalyticsUploadTime >= ANALYTICS_INTERVAL_MS) {
    lastAnalyticsUploadTime = now;
    if (analyticsSampleCount == 0) { Serial.println("[ANALYTICS] No contact samples. Skip."); return; }
    float avgBPM = analyticsBpmSum / analyticsSampleCount;
    float avgSpO2 = analyticsSpo2Sum / analyticsSampleCount;
    float avgTemp = analyticsTempCount ? (analyticsTempSum / analyticsTempCount) : 0;
    analyticsBpmSum = analyticsSpo2Sum = analyticsTempSum = 0;
    analyticsSampleCount = analyticsTempCount = 0;
    enqueueAnalyticsUpload(avgBPM, avgSpO2, avgTemp);
  }
}

// =================================================================
// Sensors
// =================================================================
void readPulseOx() {
  particleSensor.check();
  bool gotSample = false, anyDetected = false;
  while (particleSensor.available()) {
    uint32_t ir = particleSensor.getFIFOIR();
    uint32_t red = particleSensor.getFIFORed();
    particleSensor.nextSample();
    latestIrValue = ir; gotSample = true;
    lastPulseSampleTime = millis();
    if (ir >= FINGER_THRESHOLD) anyDetected = true;

#if !USE_SIMULATION
    if (rawIndex < RAW_BUFFER_LEN) { irBuffer[rawIndex] = ir; redBuffer[rawIndex] = red; rawIndex++; }
    if (rawIndex >= RAW_BUFFER_LEN) {
      computeVitals();
      for (int i = RAW_SLIDE; i < RAW_BUFFER_LEN; i++) {
        irBuffer[i - RAW_SLIDE] = irBuffer[i]; redBuffer[i - RAW_SLIDE] = redBuffer[i];
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
    fingerOnCounter++; fingerOffCounter = 0;
    if (fingerOnCounter >= FINGER_ON_COUNT) { fingerDetected = true; fingerOnCounter = FINGER_ON_COUNT; }
  } else {
    fingerOffCounter++; fingerOnCounter = 0;
    if (fingerOffCounter >= FINGER_OFF_COUNT) { fingerDetected = false; fingerOffCounter = FINGER_OFF_COUNT; }
  }
}

void clearContactReadings() {
  currentBPM = 0;
  currentSpO2 = 0;
  rawIndex = 0;
  hrHighCandidateCount = 0;
}

#if !USE_SIMULATION
void computeVitals() {
  int32_t spo2 = 0; int8_t validSpo2 = 0;
  int32_t hr = 0;   int8_t validHr = 0;
  maxim_heart_rate_and_oxygen_saturation(irBuffer, RAW_BUFFER_LEN, redBuffer,
                                         &spo2, &validSpo2, &hr, &validHr);
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

void updateSimulatedValues() {
  currentBPM = constrain(currentBPM + random(-100, 101) / 100.0, SIM_BPM_MIN, SIM_BPM_MAX);
  currentSpO2 = constrain(currentSpO2 + random(-50, 51) / 100.0, SIM_SPO2_MIN, SIM_SPO2_MAX);
}

// MAX30205 body temperature (register 0x00, 1 LSB = 1/256 °C)
float readBodyTemp() {
  Wire.beginTransmission(ADDR_MAX30205);
  Wire.write(0x00);
  if (Wire.endTransmission(false) != 0) return currentTemp;
  Wire.requestFrom((int)ADDR_MAX30205, 2);
  if (Wire.available() < 2) return currentTemp;
  int16_t raw = ((int16_t)Wire.read() << 8) | Wire.read();
  return raw * 0.00390625f;
}

// =================================================================
// Health evaluation + indicators
// =================================================================
void evaluateHealth() {
  alertHR = alertSpO2 = alertTemp = false;

  if (manualAlertActive) { healthState = HEALTH_MANUAL_ALERT; return; }
  if (!fingerDetected)   { healthState = HEALTH_NO_FINGER;    return; }
  if (currentBPM <= 0 || currentSpO2 <= 0) { healthState = HEALTH_NORMAL; return; }

  bool hrCrit  = currentBPM >= HR_HIGH_CRITICAL || currentBPM <= HR_LOW_CRITICAL;
  bool hrWarn  = currentBPM >= HR_HIGH_WARNING  || currentBPM <= HR_LOW_WARNING;
  bool spoCrit = currentSpO2 <  SPO2_CRITICAL;
  bool spoWarn = currentSpO2 <  SPO2_WARNING;
  bool tCrit = hasTemp && currentTemp > 0 && (currentTemp >= TEMP_HIGH_CRITICAL || currentTemp <= TEMP_LOW_CRITICAL);
  bool tWarn = hasTemp && currentTemp > 0 && (currentTemp >= TEMP_HIGH_WARNING  || currentTemp <= TEMP_LOW_WARNING);

  alertHR = hrCrit; alertSpO2 = spoCrit; alertTemp = tCrit;

  if (hrCrit || spoCrit || tCrit)      healthState = HEALTH_CRITICAL;
  else if (hrWarn || spoWarn || tWarn) healthState = HEALTH_WARNING;
  else                                 healthState = HEALTH_NORMAL;
}

void updateIndicators(unsigned long now) {
  bool manual = (healthState == HEALTH_MANUAL_ALERT);

  // LEDs
  switch (healthState) {
    case HEALTH_NO_FINGER:
      if (now - lastGreenLedToggle >= 1000) { lastGreenLedToggle = now; greenLedState = !greenLedState; digitalWrite(GREEN_LED_PIN, greenLedState); }
      digitalWrite(RED_LED_PIN, LOW);
      break;
    case HEALTH_NORMAL:
      digitalWrite(GREEN_LED_PIN, HIGH); digitalWrite(RED_LED_PIN, LOW);
      break;
    case HEALTH_WARNING:
      digitalWrite(GREEN_LED_PIN, LOW); digitalWrite(RED_LED_PIN, HIGH);
      break;
    case HEALTH_CRITICAL:
    case HEALTH_MANUAL_ALERT:
      digitalWrite(GREEN_LED_PIN, LOW);
      if (now - lastRedLedToggle >= RED_LED_BLINK_INTERVAL) { lastRedLedToggle = now; redLedState = !redLedState; digitalWrite(RED_LED_PIN, redLedState); }
      break;
  }

  // Buzzers — beep in unison; each sounds only for its own critical vital (or SOS).
  if (now - lastBuzzerToggle >= BUZZER_BEEP_INTERVAL) { lastBuzzerToggle = now; buzzerPhase = !buzzerPhase; }
  playBuzzerTone(BUZZER_HR_PIN,   (manual || alertHR)   && buzzerPhase, BUZZER_HR_FREQ);
  playBuzzerTone(BUZZER_SPO2_PIN, (manual || alertSpO2) && buzzerPhase, BUZZER_SPO2_FREQ);
  playBuzzerTone(BUZZER_TEMP_PIN, (manual || alertTemp) && buzzerPhase, BUZZER_TEMP_FREQ);
}

void allBuzzers(uint8_t level) {
  if (level == LOW) {
    noTone(BUZZER_HR_PIN);
    noTone(BUZZER_SPO2_PIN);
    noTone(BUZZER_TEMP_PIN);
  }
  digitalWrite(BUZZER_HR_PIN, level);
  digitalWrite(BUZZER_SPO2_PIN, level);
  digitalWrite(BUZZER_TEMP_PIN, level);
}

void playBuzzerTone(uint8_t pin, bool active, int frequency) {
  if (active) tone(pin, frequency);
  else {
    noTone(pin);
    digitalWrite(pin, LOW);
  }
}

void drawDisplay() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.print(DEVICE_ID);
  display.setCursor(54, 0);
  display.print(fingerDetected ? "CONTACT" : "NO FINGER");
  display.setCursor(110, 0);
  display.print(WiFi.status() == WL_CONNECTED ? "W" : "-");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  display.setCursor(0, 14);
  display.print("HR  ");
  display.setCursor(32, 14);
  if (!fingerDetected) display.print("NO FINGER");
  else if (currentBPM > 0) { display.print(String(currentBPM, 0)); display.print(" bpm"); }
  else display.print("STABILIZING");

  display.setCursor(0, 26);
  display.print("SpO2");
  display.setCursor(32, 26);
  if (!fingerDetected) display.print("NO FINGER");
  else if (currentSpO2 > 0) { display.print(String(currentSpO2, 0)); display.print("%"); }
  else display.print("STABILIZING");

  display.setCursor(0, 38);
  display.print("Temp");
  display.setCursor(32, 38);
  if (hasTemp && currentTemp > 0) { display.print(String(currentTemp, 1)); display.print(" C"); }
  else display.print("--");

  display.drawLine(0, 50, 127, 50, SSD1306_WHITE);
  display.setCursor(0, 54);
  if (buttonPressedDisplay) display.print("BUTTON PRESSED");
  else if (manualAlertActive) display.print("SOS ACTIVE");
  else if (!fingerDetected) display.print("Place finger/chest");
  else display.print(healthStateToString(healthState));
  display.display();
}

void handleButton(unsigned long now) {
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  buttonPressedDisplay = pressed;

  if (pressed && now - lastButtonPress >= DEBOUNCE_DELAY_MS) {
    lastButtonPress = now;
    buttonPressCount++;
    manualAlertActive = !manualAlertActive;
    buttonPressedDisplay = true;
    forceUpload = true;
    enqueueButtonAnalyticsUpload();
    Serial.println(manualAlertActive ? "[ALERT] MANUAL ALERT ON" : "[ALERT] Manual alert OFF");
  }
}

void handleWiFiReconnect(unsigned long now) {
  if (WiFi.status() != WL_CONNECTED && now - lastWiFiReconnect >= WIFI_RECONNECT_INTERVAL) {
    lastWiFiReconnect = now;
    Serial.println("[WIFI] Reconnecting...");
    WiFi.disconnect(); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  } else if (WiFi.status() == WL_CONNECTED && now - lastWiFiConfigPoll >= WIFI_CONFIG_POLL_MS) {
    lastWiFiConfigPoll = now;
    applyQueuedWifiConfig();
  }
}

// =================================================================
// Upload (build on core 1, send on core 0)
// =================================================================
void enqueueLiveUpload() {
  double ts = currentTimestampMs();
  String tsText = timestampJson(ts);
  if (ts <= 0) Serial.println("[LIVE] Clock not ready, using Firebase server timestamp.");
  String live = buildReadingPayload(currentBPM, currentSpO2, currentTemp, tsText, fingerDetected);

  String dev = "{";
  dev += "\"name\":\"" + String(MINER_NAME) + "\",";
  dev += "\"location\":\"" + String(MINER_LOCATION) + "\",";
  dev += "\"active\":true,\"status\":\"online\",";
  dev += "\"lastSeen\":" + tsText + ",";
  dev += "\"live\":" + live + "}";
  enqueueJob("PATCH", "/devices/" + String(DEVICE_ID), dev);
}

void enqueueAnalyticsUpload(float avgBPM, float avgSpO2, float avgTemp) {
  double ts = currentTimestampMs();
  if (ts <= 0) { Serial.println("[ANALYTICS] Clock not ready, skip."); return; }
  unsigned long long minuteTs = ((unsigned long long)(ts / 60000.0)) * 60000ULL;
  String minuteText = String((double)minuteTs, 0);
  // Built only from contact samples -> finger:true so the dashboard keeps the row.
  String payload = buildReadingPayload(avgBPM, avgSpO2, avgTemp, minuteText, true);
  enqueueJob("PUT", "/analytics/" + String(DEVICE_ID) + "/" + minuteText, payload);
}

void enqueueButtonAnalyticsUpload() {
  double ts = currentTimestampMs();
  if (ts <= 0) { Serial.println("[BUTTON] Clock not ready, analytics event skipped."); return; }
  String tsText = String(ts, 0);
  String payload = buildReadingPayload(currentBPM, currentSpO2, currentTemp, tsText, fingerDetected);
  enqueueJob("PUT", "/analytics/" + String(DEVICE_ID) + "/" + tsText, payload);
}

String buildReadingPayload(float bpm, float spo2, float temp, String tsText, bool finger) {
  float safeBpm = finger ? bpm : 0;
  float safeSpO2 = finger ? spo2 : 0;
  String p = "{";
  p += "\"heartRate\":" + String(safeBpm, 1) + ",";
  p += "\"hr\":" + String(safeBpm, 1) + ",";
  p += "\"spo2\":" + String(safeSpO2, 1) + ",";
  if (hasTemp && temp > 0)    p += "\"temp\":" + String(temp, 1) + ",";
  p += "\"status\":\"" + String(healthStateToString(healthState)) + "\",";
  p += "\"finger\":" + String(finger ? "true" : "false") + ",";
  p += "\"manual_alert\":" + String(manualAlertActive ? "true" : "false") + ",";
  p += "\"button_pressed\":" + String(buttonPressedDisplay ? "true" : "false") + ",";
  p += "\"button_press_count\":" + String(buttonPressCount) + ",";
  p += "\"timestamp\":" + tsText + ",";
  p += "\"sim_mode\":false}";
  return p;
}

void registerDeviceInfo() {
  double ts = currentTimestampMs();
  String tsText = timestampJson(ts);
  String payload = "{";
  payload += "\"name\":\"" + String(MINER_NAME) + "\",";
  payload += "\"location\":\"" + String(MINER_LOCATION) + "\",";
  payload += "\"active\":true,\"status\":\"online\",";
  payload += "\"lastSeen\":" + tsText + "}";
  enqueueJob("PATCH", "/devices/" + String(DEVICE_ID), payload);
}

void enqueueJob(const char* method, String path, String payload) {
  if (firebaseQueue == NULL) return;
  FirebaseJob job;
  strlcpy(job.method, method, sizeof(job.method));
  strlcpy(job.path, path.c_str(), sizeof(job.path));
  strlcpy(job.payload, payload.c_str(), sizeof(job.payload));
  if (xQueueSend(firebaseQueue, &job, 0) != pdTRUE) Serial.println("[NET] Queue full, dropped upload.");
}

void networkTask(void* param) {
  FirebaseJob job;
  for (;;) {
    if (xQueueReceive(firebaseQueue, &job, portMAX_DELAY) == pdTRUE) {
      if (WiFi.status() == WL_CONNECTED) firebaseWrite(job.method, job.path, job.payload);
      else Serial.println("[NET] WiFi down, skip queued upload.");
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
  if (code < 200 || code >= 300) { Serial.println(http.getString()); http.end(); return false; }
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

double currentTimestampMs() {
  time_t now; time(&now);
  if (now > 1000000000) return (double)now * 1000.0;
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
