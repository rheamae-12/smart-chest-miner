#include <WiFi.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <FirebaseESP32.h>
#include "MAX30105.h"

#define WIFI_RETRY_LIMIT 10
#define PUSH_INTERVAL_MS 30000
#define OFFLINE_TIMEOUT_MS 30000
#define DEVICE_ID "MCM-001"
#define MINER_NAME "Miner 1"
#define MINER_LOCATION "Shaft A - Level 3"

#define SDA_PIN 16
#define SCL_PIN 17
#define BUTTON_PIN 33
#define STATUS_LED 2

#define FINGER_THRESHOLD 7000
#define DEBOUNCE_DELAY_MS 50

const char* WIFI_SSID = "PERSONAL SPACE 2G";
const char* WIFI_PASSWORD = "Acuzar0424";

#define FIREBASE_HOST "https://smart-chest-miner-default-rtdb.firebaseio.com/"
#define FIREBASE_AUTH "GJY8fpUA211duwUw7o92ks0EXlYOFdqWYz5rK6N5"

FirebaseData firebaseData;
FirebaseConfig config;
FirebaseAuth auth;
FirebaseJson json;

MAX30105 particleSensor;

unsigned long lastPush = 0;
unsigned long disconnectedSince = 0;
unsigned long lastButtonChange = 0;

bool manualAlert = false;
bool lastButtonState = HIGH;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("[WIFI] Connecting");
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < WIFI_RETRY_LIMIT) {
    delay(1000);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[WIFI] Failed. Restarting ESP32.");
    delay(30000);
    ESP.restart();
  }

  Serial.print("\n[WIFI] Connected. IP: ");
  Serial.println(WiFi.localIP());
}

void setupSensor() {
  Wire.begin(SDA_PIN, SCL_PIN);

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[SENSOR] MAX30102 not found. Check wiring.");
    pinMode(STATUS_LED, OUTPUT);

    while (true) {
      digitalWrite(STATUS_LED, HIGH);
      delay(2000);
      digitalWrite(STATUS_LED, LOW);
      delay(2000);
    }
  }

  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x1F);
  particleSensor.setPulseAmplitudeIR(0x1F);
  Serial.println("[SENSOR] MAX30102 ready.");
}

double currentEpochMillis() {
  time_t now;
  time(&now);

  if (now > 100000) {
    return (double)now * 1000.0;
  }

  return (double)millis();
}

bool hasChestContact() {
  long irValue = particleSensor.getIR();
  return irValue >= FINGER_THRESHOLD;
}

int readHeartRate(bool chestDetected) {
  if (!chestDetected) return 0;
  return 78 + random(-6, 7);
}

int readSpo2(bool chestDetected) {
  if (!chestDetected) return 0;
  return constrain(97 + random(-2, 3), 90, 100);
}

void handleManualAlertButton() {
  bool buttonState = digitalRead(BUTTON_PIN);

  if (buttonState != lastButtonState && millis() - lastButtonChange > DEBOUNCE_DELAY_MS) {
    lastButtonChange = millis();
    lastButtonState = buttonState;

    if (buttonState == LOW) {
      manualAlert = !manualAlert;
      lastPush = 0;
      Serial.println(manualAlert ? "[ALERT] Manual alert ON" : "[ALERT] Manual alert OFF");
    }
  }
}

void writeDeviceStatus(const char* status) {
  String base = "/devices/" + String(DEVICE_ID);
  Firebase.setString(firebaseData, base + "/status", status);
}

void pushReading() {
  bool chestDetected = hasChestContact();
  double timestamp = currentEpochMillis();
  int heartRate = readHeartRate(chestDetected);
  int spo2 = readSpo2(chestDetected);

  String base = "/devices/" + String(DEVICE_ID);

  json.clear();
  json.set("heartRate", heartRate);
  json.set("hr", heartRate);
  json.set("spo2", spo2);
  json.set("timestamp", timestamp);
  json.set("finger", chestDetected);
  json.set("manual_alert", manualAlert);
  json.set("sim_mode", true);

  bool ok = true;
  ok &= Firebase.setString(firebaseData, base + "/name", MINER_NAME);
  ok &= Firebase.setString(firebaseData, base + "/location", MINER_LOCATION);
  ok &= Firebase.setBool(firebaseData, base + "/active", true);
  ok &= Firebase.setJSON(firebaseData, base + "/live", json);
  ok &= Firebase.setString(firebaseData, base + "/status", "online");
  ok &= Firebase.setDouble(firebaseData, base + "/lastSeen", timestamp);

  if (ok) {
    Serial.print("[UPLOAD] ");
    Serial.print(DEVICE_ID);
    Serial.print(" HR=");
    Serial.print(heartRate);
    Serial.print(" SpO2=");
    Serial.print(spo2);
    Serial.print(" Chest=");
    Serial.print(chestDetected ? "YES" : "NO");
    Serial.print(" Manual=");
    Serial.println(manualAlert ? "YES" : "NO");
  } else {
    Serial.print("[UPLOAD] Failed: ");
    Serial.println(firebaseData.errorReason());
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED, OUTPUT);

  connectWiFi();

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  setupSensor();

  config.database_url = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  writeDeviceStatus("online");
  lastPush = 0;
}

void loop() {
  handleManualAlertButton();

  if (WiFi.status() != WL_CONNECTED) {
    if (disconnectedSince == 0) disconnectedSince = millis();

    if (millis() - disconnectedSince > OFFLINE_TIMEOUT_MS) {
      writeDeviceStatus("offline");
      connectWiFi();
      disconnectedSince = 0;
    }

    return;
  }

  disconnectedSince = 0;

  if (lastPush == 0 || millis() - lastPush >= PUSH_INTERVAL_MS) {
    pushReading();
    lastPush = millis();
  }
}
