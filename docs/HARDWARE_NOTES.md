# Smart Chest Miner — Hardware Notes

Engineering notes for the ESP32 device that feeds the dashboard. Covers the
circuit review, required fixes, the Firebase data contract the firmware must
publish, and the bring-up/test procedure.

> Status: web app is feature-complete; **hardware integration testing is the
> current phase** (full sensors + components, for accurate real data).

---

## 1. Hardware overview

| Block | Part | I2C addr | Purpose |
|-------|------|----------|---------|
| MCU | ESP32 DevKit (WROOM-32) | — | controller + WiFi |
| Display | OLED SSD1306 | `0x3C` | on-device readout |
| Pulse oximeter | MAX30102 | `0x57` | heart rate + SpO₂ (+ contact via IR) |
| Body temp | MAX30205 | `0x48` (A0→GND) | body temperature (°C) |
| Fuel gauge | MAX17043 | `0x36` | battery % over I2C |
| Charger | TP4056 | — | 18650 LiPo charging |
| Boost | MT3608 | — | battery → 5V rail |
| LDO | AMS1117-3.3 | — | 5V → clean 3.3V for sensors |
| Alerts | 3× active buzzer + 2N2222 | — | GPIO25/26/27 (HR / SpO₂ / temp) |
| Status | 2× LED (Green/Red) | — | GPIO32 / GPIO33 |
| Input | Momentary button | — | GPIO35 manual SOS |

**Power chain:** 3.7V 18650 → TP4056 → MT3608 (5V rail) → ESP32 VIN; AMS1117
taps the 5V rail for the 3.3V sensor rail.

**I2C bus:** SDA = GPIO21, SCL = GPIO22, single shared 4.7k pull-up pair to 3.3V.

---

## 2. Pin map (quick reference)

> ⚠️ **Two pinouts exist.** The full schematic (below) is the *target* design. The
> *current prototype firmware* (`firmware/smart_chest_miner/`) is wired
> differently and simpler. Reconcile before building the final board.

**Target design (schematic):**

| ESP32 pin | Connects to | Notes |
|-----------|-------------|-------|
| VIN (5V) | MT3608 VOUT+ | board's own LDO makes its 3.3V |
| GND | common GND rail | **one common ground for everything** |
| GPIO21 | SDA (OLED, MAX30102, MAX30205, MAX17043) | I2C data |
| GPIO22 | SCL (all I2C devices) | I2C clock |
| GPIO25 | buzzer driver A (1k → base) | HR alert |
| GPIO26 | buzzer driver B (1k → base) | SpO₂ alert |
| GPIO27 | buzzer driver C (1k → base) | temp alert |
| GPIO32 | 220R → Green LED anode | status |
| GPIO33 | 220R → Red LED anode | status |
| GPIO34 | battery divider midpoint (100k/100k) | **input-only, ADC1** |
| GPIO35 | button T1 (+10k pull-up to 3.3V) | **input-only, ext. pull-up required** |
| GPIO13 | MAX30102 INT | use `INPUT_PULLUP` |
| GPIO36 | MAX17043 ALRT | **input-only, no internal pull-up** |

**Current prototype (as in the firmware):**

| Signal | Pin | Notes |
|--------|-----|-------|
| I2C SDA / SCL | 16 / 17 | remapped (any GPIO works for I2C) |
| Green LED | 26 | single |
| Red LED | 25 | single |
| Buzzer | 27 | one buzzer (not three) |
| Button | 33 | uses `INPUT_PULLUP` (GPIO33 is not input-only) |

The prototype has **no MAX30205 (temp), no MAX17043 (battery), and one buzzer/LED
pair** — those come with the final board.

---

## 3. Circuit review

### What's correct (verified against the schematic)
- **Input-only pins (34/35/36) used only as inputs** — correct.
- **External 10k pull-up on the button** — required, since GPIO34–39 have no
  internal pull-ups. Press = LOW.
- **Battery ADC on GPIO34 = ADC1** — keeps working while WiFi is on (ADC2 would
  not).
- **No strapping pins on critical signals** (GPIO0/2/12/15 avoided).
- **I2C:** unique addresses, single pull-up pair, all devices at 3.3V → clean
  logic levels, no level shifter needed.
- **Buzzer drivers:** low-side NPN, 1k base (~2.6mA), 1N4148 flyback (stripe to
  +5V). Correct.
- **AMS1117 fed from the 5V rail, not the battery** — keeps 3.3V stable across
  the full battery range (a near-empty cell couldn't sustain 3.3V directly).

### Issues / verify (ordered by test-day risk)

**1. ESP32 brownout/reboot on WiFi (most likely failure).**
WiFi TX spikes ~350–500mA. With the boost rail + buzzers, the rail sags and the
ESP32 resets ("Brownout detector was triggered").
- Fix: **470–1000µF** electrolytic across 5V↔GND at the ESP32 VIN; **100µF +
  100nF** across 3.3V↔GND near the sensors. Short leads.

**2. MAX17043 ALRT → GPIO36 floats.**
ALRT is open-drain; GPIO36 has no internal pull-up.
- Fix: 10k from GPIO36 to 3.3V **only if** using the alert interrupt. Recommended:
  **poll battery % over I2C** instead and skip the ALRT wire.

**3. MAX30102 INT → GPIO13.**
- Fix: `pinMode(13, INPUT_PULLUP)`, or poll the FIFO and don't wire INT.

**4. TP4056 is not true load-sharing.**
Running the boost off OUT+ while charging can confuse charge termination.
- Fix (testing): power from a charged cell; charge separately.
- Fix (later): swap to an **IP5306** module (charge + 5V boost + load-share in one;
  replaces both TP4056 and MT3608).

**5. MAX30102 breakout at 3.3V.**
Purple GY-MAX30102 clones can fail to enumerate at 3.3V.
- Fix: run the I2C scanner first; if `0x57` is missing, it's the breakout — try a
  known-good module.

**6. MT3608 headroom.**
~1A realistic at 3.7V→5V. Set to **exactly 5.0V (ESP32 disconnected)** before use;
rely on the brownout caps for spikes.

---

## 4. Firmware → Firebase data contract

The dashboard reads this shape via `src/hooks/useMinerSystem.js`. Field names are
flexible where noted; pick one and stay consistent.

### Live node — `devices/{deviceId}`
```jsonc
{
  "name": "Miner 01",
  "location": "Tunnel B",
  "active": true,
  "status": "online",
  "lastSeen": 1749700000000,
  "live": {
    "hr": 78,              // bpm   (or "heartRate")
    "spo2": 97,            // %
    "temp": 36.8,          // °C    (or "temperature" / "bodyTemp")
    "finger": true,        // contact (or "chestDetected")
    "manual_alert": false, // SOS button (or "manualAlert")
    "battery": 84,         // %
    "status": "online",
    "timestamp": 1749700000000   // Unix MILLISECONDS
  }
}
```

### History node — `analytics/{deviceId}/{pushId}`
```jsonc
{
  "hr": 78, "spo2": 97, "temp": 36.8,
  "finger": true, "status": "online",
  "timestamp": 1749700000000
}
```

### Field source map
| Field | Source | Notes |
|-------|--------|-------|
| `hr` | MAX30102 | bpm |
| `spo2` | MAX30102 | % |
| `temp` | MAX30205 | °C |
| `battery` | MAX17043 | prefer over the ADC divider |
| `manual_alert` | button GPIO35 | press = LOW |
| `finger` | MAX30102 | derive from IR value above a contact threshold |

### Three gotchas that make a wired device read "offline"
1. **`timestamp` must be milliseconds** (rejected below year-2000 ms). Seconds →
   device shows offline. Use `time(nullptr) * 1000ULL`.
2. **NTP-sync the clock on boot** (`configTime(...)`). "Active" requires the
   timestamp to be within **75s** of the dashboard's current time.
3. **Publish at least every 75s** (ideally every 1–5s) or it goes stale → offline.

Also: analytics rows are **dropped unless** `finger === true && hr > 0 && spo2 > 0`
(intentional — keeps finger-off/warm-up noise out of history). On graceful
shutdown write `status: "offline"` to end the session cleanly.

---

## 5. Firmware status & mitigations

**Two sketches in `firmware/`:**
- `smart_chest_miner/` — prototype board (MAX30102 only; pins 16/17, 25/26/27/33).
- `smart_chest_miner_full/` — **complete schematic build**: MAX30102 + MAX30205
  (temp) + MAX17043 (battery) + SSD1306 OLED + 3 buzzers + 2 LEDs + GPIO35 button,
  schematic pinout (21/22). I2C devices are **auto-detected**, so this same sketch
  also runs on the prototype (missing sensors are simply skipped).
  Requires libs: *SparkFun MAX3010x*, *Adafruit SSD1306*, *Adafruit GFX*.

**Implemented in both firmware revisions:**
- ✅ **Real HR + SpO₂** via the Maxim algorithm (`spo2_algorithm.h`) over a sliding
  100-sample window — no longer simulated. (Set `USE_SIMULATION 1` to fall back.)
- ✅ **NTP-safe timestamps** — uploads pause until the clock is real epoch ms, so
  the dashboard never rejects a pre-2000 timestamp.
- ✅ **FreeRTOS network task (core 0)** — HTTP uploads run off a queue so a slow
  upload can't freeze the sensor loop or the alert buzzer (core 1).
- ✅ **Analytics rows send `finger:true`** (built only from contact samples) so the
  dashboard never discards a valid minute average.
- ✅ **Device-local WARNING/CRITICAL** alerting from real vitals — buzzer warns the
  worker even if WiFi/the dashboard is down.
- ✅ Threshold MAX30102 IR for `finger`; no contact → `finger:false`, HR/SpO₂ = 0.

**Coded in `smart_chest_miner_full/`, pending on-hardware verification:**
- ✅ MAX30205 → `temp` (°C), MAX17043 → `battery` (%, with GPIO34 divider fallback).
- ✅ OLED shows live vitals; 3 buzzers mapped to HR / SpO₂ / Temp; SOS sounds all.

**Still open:**
- Verify on the assembled board (I2C scan, brownout caps, real readings).
- Calibrate the GPIO34 divider fallback (`DIVIDER_RATIO`) if MAX17043 is absent.
- Decide device auth (legacy DB secret vs Firebase Auth idToken) — see Section 4.

---

## 6. Bring-up & test procedure
1. **I2C scanner first** — confirm `0x3C, 0x57, 0x48, 0x36` all appear.
2. Each sensor prints sane values to serial (HR 60–100, SpO₂ 95–100, temp 36–38 °C,
   battery %).
3. Add brownout caps → connect WiFi → confirm **no random reboots** under load.
4. NTP + ms-timestamp + Firebase write → device flips to **online** in Command
   Center within seconds.
5. **Register the device** in Device Registry with the *same* `deviceId` the
   firmware uses; the device must authenticate (DB rules require `auth != null`).
6. Set real **thresholds** in System Config for actual conditions (defaults are
   placeholders).

### "It's wired but shows offline" — check in this order
1. `timestamp` in seconds instead of ms.
2. Device clock not NTP-synced.
3. Not writing within the 75s window.
4. `deviceId` mismatch vs the registered device.
5. Auth/DB-rule failure on write.

---

## 7. Accurate-data tips (the goal of this phase)
- **MAX30205 (temp):** measures its own die temp — needs firm skin thermal contact
  and a settling period; average a few samples. Placement matters more than the
  sensor.
- **MAX30102 (HR/SpO₂):** motion and ambient light are the enemies. Shield from
  light, keep contact firm/still, average in firmware.
- **Battery %:** trust the MAX17043 fuel gauge; the ADC divider is jumpy.
