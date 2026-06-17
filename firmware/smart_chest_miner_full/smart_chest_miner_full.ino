/*
 * Smart Chest Miner - ESP32 firmware (COMPLETE / full hardware)
 * Based on the schematic: MAX30102 (HR/SpO2) + MAX30205 (body temp) +
 * MAX17043 (battery fuel gauge) + SSD1306 OLED + 3 buzzers + 2 LEDs + SOS button.
 *
 * Design notes:
 *  - Real HR + SpO2 via the Maxim algorithm (no simulation).
 *  - Body temperature from MAX30205 (°C). Battery % from MAX17043 (I2C),
 *    with the GPIO34 voltage divider as an automatic fallback.
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
 *   (MAX30205 and MAX17043 are read directly over I2C — no extra library.)
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

const char* WIFI_SSID     = "ZTE_2.4G_uuCrK2";
const char* WIFI_PASSWORD = "TizH3Ucd";

#define FIREBASE_DATABASE_URL    "placeholder"
#define FIREBASE_DATABASE_SECRET "placeholder"

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
#define BATTERY_ADC_PIN  34   // 100k/100k divider (fallback for MAX17043)

// ---- I2C addresses ----
#define ADDR_MAX30102    0x57
#define ADDR_MAX30205    0x48
#define ADDR_MAX17043    0x36
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
#define BATTERY_READ_INTERVAL    10000
#define DISPLAY_INTERVAL         500
#define DEBOUNCE_DELAY_MS        50
#define WIFI_RECONNECT_INTERVAL  10000
#define RED_LED_BLINK_INTERVAL   200
#define BUZZER_BEEP_INTERVAL     100

// ---- Contact detection ----
#define FINGER_THRESHOLD     7000
#define FINGER_ON_COUNT      1
#define FINGER_OFF_COUNT     10

// ---- Maxim sample buffer ----
#define RAW_BUFFER_LEN       100
#define RAW_SLIDE            25

// ---- Device-local safety thresholds (drive the buzzers without the network) ----
#define HR_HIGH_WARNING      105
#define HR_HIGH_CRITICAL     120
#define HR_LOW_WARNING       55
#define HR_LOW_CRITICAL      45
#define SPO2_WARNING         94
#define SPO2_CRITICAL        90
#define TEMP_HIGH_WARNING    38.0
#define TEMP_HIGH_CRITICAL   39.0
#define TEMP_LOW_WARNING     36.0
#define TEMP_LOW_CRITICAL    35.0
#define BATTERY_LOW_PCT      20

// ---- Battery divider calibration (Vbat = ratio * Vadc); tune on the bench ----
#define ADC_REF_V            3.3
#define DIVIDER_RATIO        2.0

enum HealthState { HEALTH_NO_FINGER, HEALTH_NORMAL, HEALTH_WARNING, HEALTH_CRITICAL, HEALTH_MANUAL_ALERT };

MAX30105 particleSensor;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ---- Detected hardware ----
bool hasPulseOx = false;
bool hasTemp    = false;
bool hasBattery = false;
bool hasDisplay = false;

HealthState healthState = HEALTH_NO_FINGER;
bool alertHR = false, alertSpO2 = false, alertTemp = false;  // per-vital (critical) for buzzers

float currentBPM    = 0.0;
float currentSpO2   = 0.0;
float currentTemp   = 0.0;   // °C
float currentBattery = 0.0;  // %

unsigned long lastLiveUploadTime = 0, lastAnalyticsUploadTime = 0;
unsigned long lastSensorRead = 0, lastTempRead = 0, lastBatteryRead = 0, lastDisplay = 0;
unsigned long lastWiFiReconnect = 0, lastRedLedToggle = 0, lastGreenLedToggle = 0;
unsigned long lastPrintTime = 0, lastBuzzerToggle = 0;

float analyticsBpmSum = 0, analyticsSpo2Sum = 0, analyticsTempSum = 0;
int   analyticsSampleCount = 0, analyticsTempCount = 0;
bool  forceUpload = false;

volatile bool buttonInterruptFlag = false;
bool manualAlertActive = false;
unsigned long lastButtonPress = 0;

bool redLedState = false, greenLedState = false, buzzerPhase = false;

bool fingerDetected = false, wasFingerDetected = false, noFingerStateUploaded = false;
int  fingerOnCounter = 0, fingerOffCounter = 0;
uint32_t latestIrValue = 0;

uint32_t irBuffer[RAW_BUFFER_LEN];
uint32_t redBuffer[RAW_BUFFER_LEN];
int rawIndex = 0;

typedef struct { char method[8]; char path[96]; char payload[448]; } FirebaseJob;
QueueHandle_t firebaseQueue;

void IRAM_ATTR buttonISR() { buttonInterruptFlag = true; }

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

  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), buttonISR, FALLING);

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
  registerDeviceInfo();
}

void scanI2C() {
  Serial.println("[I2C] Scanning...");
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("[I2C]  found 0x%02X\n", addr);
      if (addr == ADDR_MAX30205) hasTemp = true;
      if (addr == ADDR_MAX17043) hasBattery = true;
      if (addr == ADDR_OLED)     hasDisplay = true;
    }
  }
  Serial.printf("[I2C] temp:%s battery:%s oled:%s\n",
    hasTemp ? "yes" : "no", hasBattery ? "yes" : "no", hasDisplay ? "yes" : "no");
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
  if (hasTemp && now - lastTempRead >= TEMP_READ_INTERVAL) {
    lastTempRead = now;
    currentTemp = readBodyTemp();
  }
  if (now - lastBatteryRead >= BATTERY_READ_INTERVAL) {
    lastBatteryRead = now;
    currentBattery = readBattery();
  }

  if (fingerDetected && !wasFingerDetected) {
    noFingerStateUploaded = false; forceUpload = true;
    Serial.println("Chest detected. Reading vitals.");
  }
  if (!fingerDetected && wasFingerDetected) {
    currentBPM = 0; currentSpO2 = 0; rawIndex = 0;
    noFingerStateUploaded = false; forceUpload = true;
    Serial.println("[WARN] No chest detected!");
  }
  wasFingerDetected = fingerDetected;
  if (!fingerDetected) { currentBPM = 0; currentSpO2 = 0; }

  evaluateHealth();
  updateIndicators(now);

  if (fingerDetected && currentBPM > 0 && currentSpO2 > 0) {
    analyticsBpmSum += currentBPM; analyticsSpo2Sum += currentSpO2; analyticsSampleCount++;
    if (hasTemp && currentTemp > 0) { analyticsTempSum += currentTemp; analyticsTempCount++; }
  }

  if (hasDisplay && now - lastDisplay >= DISPLAY_INTERVAL) { lastDisplay = now; drawDisplay(); }

  if (now - lastPrintTime >= PRINT_INTERVAL_MS) {
    lastPrintTime = now;
    Serial.printf("[VITALS] IR:%lu BPM:%.1f SpO2:%.1f Temp:%.1f Batt:%.0f%% Chest:%s St:%s Alert:%s\n",
      (unsigned long)latestIrValue, currentBPM, currentSpO2, currentTemp, currentBattery,
      fingerDetected ? "YES" : "NO", healthStateToString(healthState),
      manualAlertActive ? "YES" : "NO");
  }

  if (forceUpload || (now - lastLiveUploadTime >= LIVE_UPLOAD_INTERVAL_MS)) {
    lastLiveUploadTime = now;
    if (fingerDetected || manualAlertActive || !noFingerStateUploaded) {
      enqueueLiveUpload();
      if (!fingerDetected && !manualAlertActive) noFingerStateUploaded = true;
    }
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
    if (ir >= FINGER_THRESHOLD) anyDetected = true;

    if (rawIndex < RAW_BUFFER_LEN) { irBuffer[rawIndex] = ir; redBuffer[rawIndex] = red; rawIndex++; }
    if (rawIndex >= RAW_BUFFER_LEN) {
      computeVitals();
      for (int i = RAW_SLIDE; i < RAW_BUFFER_LEN; i++) {
        irBuffer[i - RAW_SLIDE] = irBuffer[i]; redBuffer[i - RAW_SLIDE] = redBuffer[i];
      }
      rawIndex = RAW_BUFFER_LEN - RAW_SLIDE;
    }
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

void computeVitals() {
  int32_t spo2 = 0; int8_t validSpo2 = 0;
  int32_t hr = 0;   int8_t validHr = 0;
  maxim_heart_rate_and_oxygen_saturation(irBuffer, RAW_BUFFER_LEN, redBuffer,
                                         &spo2, &validSpo2, &hr, &validHr);
  if (!fingerDetected) return;
  if (validHr && hr > 30 && hr < 220)      currentBPM = (float)hr;
  if (validSpo2 && spo2 > 70 && spo2 <= 100) currentSpO2 = (float)spo2;
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

// Battery %: prefer MAX17043 SOC (reg 0x04); fall back to the GPIO34 divider.
float readBattery() {
  if (hasBattery) {
    Wire.beginTransmission(ADDR_MAX17043);
    Wire.write(0x04);
    if (Wire.endTransmission(false) == 0) {
      Wire.requestFrom((int)ADDR_MAX17043, 2);
      if (Wire.available() >= 2) {
        uint8_t hi = Wire.read(); uint8_t lo = Wire.read();
        float soc = hi + lo / 256.0f;
        return constrain(soc, 0.0f, 100.0f);
      }
    }
  }
  // Fallback: voltage divider -> rough % (3.0V=0%, 4.2V=100%)
  int raw = analogRead(BATTERY_ADC_PIN);
  float vbat = (raw / 4095.0f) * ADC_REF_V * DIVIDER_RATIO;
  return constrain((vbat - 3.0f) / (4.2f - 3.0f) * 100.0f, 0.0f, 100.0f);
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
  digitalWrite(BUZZER_HR_PIN,   (manual || alertHR)   ? buzzerPhase : LOW);
  digitalWrite(BUZZER_SPO2_PIN, (manual || alertSpO2) ? buzzerPhase : LOW);
  digitalWrite(BUZZER_TEMP_PIN, (manual || alertTemp) ? buzzerPhase : LOW);
}

void allBuzzers(uint8_t level) {
  digitalWrite(BUZZER_HR_PIN, level);
  digitalWrite(BUZZER_SPO2_PIN, level);
  digitalWrite(BUZZER_TEMP_PIN, level);
}

void drawDisplay() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.print(DEVICE_ID);
  display.setCursor(104, 0);
  display.print(WiFi.status() == WL_CONNECTED ? "ON" : "--");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  display.setCursor(0, 14);  display.printf("HR  : %s", fingerDetected && currentBPM > 0 ? String(currentBPM, 0).c_str() : "--");
  display.setCursor(70, 14); display.print("bpm");
  display.setCursor(0, 24);  display.printf("SpO2: %s", fingerDetected && currentSpO2 > 0 ? String(currentSpO2, 0).c_str() : "--");
  display.setCursor(70, 24); display.print("%");
  display.setCursor(0, 34);  display.printf("Temp: %s", hasTemp && currentTemp > 0 ? String(currentTemp, 1).c_str() : "--");
  display.setCursor(70, 34); display.print("C");
  display.setCursor(0, 44);  display.printf("Batt: %s", String(currentBattery, 0).c_str());
  display.setCursor(70, 44); display.print("%");

  display.drawLine(0, 54, 127, 54, SSD1306_WHITE);
  display.setCursor(0, 56);
  display.print(manualAlertActive ? "** SOS ALERT **" : healthStateToString(healthState));
  display.display();
}

void handleButton(unsigned long now) {
  if (buttonInterruptFlag) {
    buttonInterruptFlag = false;
    if (now - lastButtonPress >= DEBOUNCE_DELAY_MS) {
      lastButtonPress = now;
      manualAlertActive = !manualAlertActive;
      forceUpload = true;
      Serial.println(manualAlertActive ? "[ALERT] MANUAL ALERT ON" : "[ALERT] Manual alert OFF");
    }
  }
}

void handleWiFiReconnect(unsigned long now) {
  if (WiFi.status() != WL_CONNECTED && now - lastWiFiReconnect >= WIFI_RECONNECT_INTERVAL) {
    lastWiFiReconnect = now;
    Serial.println("[WIFI] Reconnecting...");
    WiFi.disconnect(); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// =================================================================
// Upload (build on core 1, send on core 0)
// =================================================================
void enqueueLiveUpload() {
  double ts = currentTimestampMs();
  if (ts <= 0) { Serial.println("[LIVE] Clock not ready, skip."); return; }
  String tsText = String(ts, 0);
  String live = buildReadingPayload(currentBPM, currentSpO2, currentTemp, currentBattery, tsText, fingerDetected);

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
  String payload = buildReadingPayload(avgBPM, avgSpO2, avgTemp, currentBattery, minuteText, true);
  enqueueJob("PUT", "/analytics/" + String(DEVICE_ID) + "/" + minuteText, payload);
}

String buildReadingPayload(float bpm, float spo2, float temp, float battery, String tsText, bool finger) {
  String p = "{";
  p += "\"heartRate\":" + String(bpm, 1) + ",";
  p += "\"hr\":" + String(bpm, 1) + ",";
  p += "\"spo2\":" + String(spo2, 1) + ",";
  if (hasTemp && temp > 0)    p += "\"temp\":" + String(temp, 1) + ",";
  if (hasBattery && battery > 0) p += "\"battery\":" + String(battery, 0) + ",";
  p += "\"status\":\"" + String(healthStateToString(healthState)) + "\",";
  p += "\"finger\":" + String(finger ? "true" : "false") + ",";
  p += "\"manual_alert\":" + String(manualAlertActive ? "true" : "false") + ",";
  p += "\"timestamp\":" + tsText + ",";
  p += "\"sim_mode\":false}";
  return p;
}

void registerDeviceInfo() {
  double ts = currentTimestampMs();
  if (ts <= 0) return;
  String payload = "{";
  payload += "\"name\":\"" + String(MINER_NAME) + "\",";
  payload += "\"location\":\"" + String(MINER_LOCATION) + "\",";
  payload += "\"active\":true,\"status\":\"online\",";
  payload += "\"lastSeen\":" + String(ts, 0) + "}";
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
  HTTPClient http;
  String url = String(FIREBASE_DATABASE_URL) + String(path) + ".json?auth=" + String(FIREBASE_DATABASE_SECRET);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(4000);
  int code = http.sendRequest(method, (uint8_t*)payload, strlen(payload));
  Serial.printf("[FIREBASE] %s %s -> HTTP %d\n", method, path, code);
  if (code < 200 || code >= 300) { Serial.println(http.getString()); http.end(); return false; }
  http.end();
  return true;
}

double currentTimestampMs() {
  time_t now; time(&now);
  if (now > 1000000000) return (double)now * 1000.0;
  return 0;
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
