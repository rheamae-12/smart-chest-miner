/*
 * Smart Chest Miner - Firebase Realtime Database
 * Live data every 2 seconds, analytics average every 1 minute.
 */

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include "MAX30105.h"

// =============================================================
// CONFIGURATION
// =============================================================

const char* DEFAULT_WIFI_SSID     = "yamete";
const char* DEFAULT_WIFI_PASSWORD = "kudasai";

const char* FIREBASE_DATABASE_URL = "https://smart-chest-miner-default-rtdb.firebaseio.com";
const char* FIREBASE_DATABASE_SECRET = "GJY8fpUA211duwUw7o92ks0EXlYOFdqWYz5rK6N5";

const char* DEVICE_ID = "SCM-001";
const char* MINER_NAME = "Guano Great Miner";
const char* MINER_LOCATION = "Masara Shaft-1";

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
#define WIFI_CONFIG_CHECK_INTERVAL 30000
#define WIFI_APPLY_TIMEOUT_MS    20000
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

#define FINGER_THRESHOLD  7000

enum HealthState {
  HEALTH_NO_FINGER,
  HEALTH_NORMAL,
  HEALTH_WARNING,
  HEALTH_CRITICAL,
  HEALTH_MANUAL_ALERT
};

MAX30105 particleSensor;
Preferences preferences;

HealthState healthState = HEALTH_NO_FINGER;

float currentBPM = 0.0;
float currentSpO2 = 0.0;

unsigned long lastLiveUploadTime = 0;
unsigned long lastAnalyticsUploadTime = 0;
unsigned long lastSensorRead = 0;
unsigned long lastWiFiReconnect = 0;
unsigned long lastWifiConfigCheck = 0;
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

char currentWifiSsid[64] = "";
char currentWifiPassword[96] = "";
char previousWifiSsid[64] = "";
char previousWifiPassword[96] = "";
String pendingWifiUpdatedAt = "";
bool wifiConfigApplyInProgress = false;
bool wifiConfigFailedMarkPending = false;
unsigned long wifiConfigApplyStarted = 0;

void IRAM_ATTR buttonISR() {
  buttonInterruptFlag = true;
}

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

  particleSensor.setup(0x7F, 4, 2, 100, 411, 16384);
  particleSensor.setPulseAmplitudeGreen(0);

  loadStoredWifiCredentials();
  connectToWiFi(20000);

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  waitForTimeSync();
  randomSeed(analogRead(0));

  registerDeviceInfo();
}

void loop() {
  unsigned long now = millis();

  handleWiFiReconnect(now);
  applyWifiConfigurationIfAvailable(now);
  handleButton(now);
  handleMonitoring(now);
}