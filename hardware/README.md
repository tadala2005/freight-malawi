# Freight Malawi — ESP32 Hardware

This folder contains the reference IoT firmware for a physical Freight
Malawi tracker. It is entirely optional for demonstrating the platform —
the `simulator/` folder reproduces the same telemetry contract without any
hardware.

## Files

- `esp32_fuel_tracker.ino` — the complete firmware sketch.
- `wiring.md` — pin map, bill of materials, and safety notes.

## 1. Install the Arduino IDE + ESP32 board support

1. Install the [Arduino IDE](https://www.arduino.cc/en/software).
2. In **File → Preferences**, add this Additional Board Manager URL:
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. In **Tools → Board → Boards Manager**, install "esp32 by Espressif Systems".

## 2. Install required libraries

Via **Tools → Manage Libraries**, install:
- `TinyGPSPlus` (by Mikal Hart)
- `ArduinoJson` (by Benoit Blanchon)

## 3. Configure the sketch

Open `esp32_fuel_tracker.ino` and edit the constants at the top:

```cpp
const char* WIFI_SSID       = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD   = "YOUR_WIFI_PASSWORD";
const char* API_URL         = "https://your-backend.onrender.com/api/telemetry/device";
const char* DEVICE_ID       = "ESP32-001";
const char* DEVICE_KEY      = "demo-key-001";
```

`DEVICE_ID` and `DEVICE_KEY` must exactly match a vehicle you have already
created in the Freight Malawi dashboard (Vehicles → Add vehicle → Device ID
/ Device key fields).

Calibrate the fuel sensor constants (`DISTANCE_EMPTY_CM`, `DISTANCE_FULL_CM`,
`TANK_CAPACITY_L`) per `wiring.md`.

## 4. Flash

1. Connect the ESP32 via USB.
2. Select the correct board (e.g. "ESP32 Dev Module") and COM/serial port.
3. Click Upload.
4. Open the Serial Monitor at 115200 baud to confirm Wi-Fi connection and
   telemetry POST responses.

## 5. Local demo without a live backend domain

For a local demo, point `API_URL` at your development machine's LAN IP,
e.g. `http://192.168.1.50:5000/api/telemetry/device` (the ESP32 and your
backend must be on the same Wi-Fi network). Note the sketch's `postOnce()`
function supports both `http://` and `https://` URLs.

## Known prototype limitations

- Ultrasonic fuel sensing and consumer GPS are not survey-grade or
  weighbridge-certified — see the root README's "System Limitations"
  section.
- The odometer is dead-reckoned from GPS speed between fixes, not a wheel
  sensor, so it will drift over long distances without periodic GPS
  correction.
- SIM800L SMS is optional and gated behind `ENABLE_SIM800L`; it depends on
  local GSM network availability and a valid SIM card with airtime.
