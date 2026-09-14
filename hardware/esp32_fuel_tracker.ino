/*
 * Freight Malawi — ESP32 Fuel Tracker
 * MUBAS Final Year Project — Prototype IoT-Based Fuel Management System
 *
 * Hardware:
 *   - ESP32 dev board
 *   - JSN-SR04T waterproof ultrasonic sensor (fuel level, top-mounted)
 *   - NEO-6M GPS module (UART)
 *   - SIM800L GSM/GPRS module (SMS alerts)
 *   - Status LED (heartbeat)
 *
 * Required libraries (Arduino Library Manager):
 *   - TinyGPSPlus        (mikalhart/TinyGPSPlus)
 *   - ArduinoJson        (bblanchon/ArduinoJson, v6.x)
 *   - HTTPClient / WiFi  (bundled with ESP32 board package)
 *
 * This firmware posts telemetry to the SAME backend endpoint used by the
 * Node.js simulator:
 *
 *   POST /api/telemetry/device
 *
 * so the ESP32 and the simulator are interchangeable telemetry sources for
 * the Freight Malawi platform.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TinyGPSPlus.h>
#include <HardwareSerial.h>

// ============================================================
// CONFIGURATION — edit these for your deployment
// ============================================================

// --- Wi-Fi ---
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// --- Backend ---
const char* BACKEND_HOST = "http://192.168.1.100:5000"; // change to your backend's LAN/public address
const char* DEVICE_ID    = "ESP32-001";                 // must match a vehicle's device_id in the app

// --- Fuel tank calibration (two-point linear interpolation) ---
// distance_empty: ultrasonic reading (cm) when tank is EMPTY (sensor to tank bottom)
// distance_full:  ultrasonic reading (cm) when tank is FULL (sensor to fuel surface when full)
const float DISTANCE_EMPTY_CM = 120.0;
const float DISTANCE_FULL_CM  = 15.0;
const float TANK_CAPACITY_L   = 400.0;

// --- SIM800L SMS alert ---
const char* ALERT_PHONE_NUMBER = "+265888000000"; // configurable recipient for critical SMS alerts

// --- Timing ---
const unsigned long TELEMETRY_INTERVAL_MS = 5000;   // send telemetry every 5 seconds
const unsigned long WIFI_RETRY_INTERVAL_MS = 5000;

// --- Pins ---
const int PIN_LED           = 2;   // onboard/status LED
const int PIN_ULTRASONIC_TRIG = 5;
const int PIN_ULTRASONIC_ECHO = 18;
const int PIN_GPS_RX = 16; // ESP32 RX <- NEO-6M TX
const int PIN_GPS_TX = 17; // ESP32 TX -> NEO-6M RX
const int PIN_SIM800_RX = 26; // ESP32 RX <- SIM800L TX
const int PIN_SIM800_TX = 27; // ESP32 TX -> SIM800L RX

// ============================================================
// GLOBALS
// ============================================================

HardwareSerial gpsSerial(1);
HardwareSerial simSerial(2);
TinyGPSPlus gps;

unsigned long lastTelemetryAt = 0;
unsigned long lastWifiRetryAt = 0;
bool ledState = false;

// ============================================================
// WI-FI
// ============================================================

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("Wi-Fi connection failed, will retry.");
  }
}

void ensureWiFiConnected() {
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long now = millis();
    if (now - lastWifiRetryAt >= WIFI_RETRY_INTERVAL_MS) {
      lastWifiRetryAt = now;
      Serial.println("Wi-Fi disconnected, reconnecting...");
      connectWiFi();
    }
  }
}

// ============================================================
// ULTRASONIC FUEL SENSOR (JSN-SR04T) — median-of-5 filtering
// ============================================================

// Single raw distance reading in cm, or -1.0 on timeout/failure.
float readUltrasonicOnce() {
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_ULTRASONIC_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);

  // JSN-SR04T timeout ~ 38ms for ~6.5m range; use a generous 30ms window
  long durationUs = pulseIn(PIN_ULTRASONIC_ECHO, HIGH, 30000UL);
  if (durationUs == 0) {
    return -1.0; // no echo received
  }

  // Speed of sound ~ 0.0343 cm/us; divide by 2 for round trip
  float distanceCm = (durationUs * 0.0343f) / 2.0f;
  return distanceCm;
}

// Simple insertion sort for a 5-element array (used to find the median).
void sortFive(float arr[5]) {
  for (int i = 1; i < 5; i++) {
    float key = arr[i];
    int j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
}

// Takes 5 ultrasonic readings and returns the median, filtering out
// sensor noise caused by fuel sloshing while the vehicle is moving.
// Returns -1.0 if fewer than 3 of the 5 readings were valid.
float readUltrasonicMedianOf5() {
  float readings[5];
  int validCount = 0;

  for (int i = 0; i < 5; i++) {
    float r = readUltrasonicOnce();
    if (r > 0) {
      readings[validCount] = r;
      validCount++;
    }
    delay(20); // brief pause between pings to avoid cross-echo
  }

  if (validCount < 3) {
    return -1.0; // not enough good samples this cycle
  }

  // Sort only the valid readings, then take their median.
  for (int i = validCount; i < 5; i++) readings[i] = readings[validCount - 1];
  sortFive(readings);
  return readings[2]; // median of 5
}

// Converts a distance reading (cm) to litres using two-point linear
// interpolation between the calibrated empty/full distances.
float distanceToLitres(float distanceCm) {
  float clamped = distanceCm;
  if (clamped > DISTANCE_EMPTY_CM) clamped = DISTANCE_EMPTY_CM;
  if (clamped < DISTANCE_FULL_CM) clamped = DISTANCE_FULL_CM;

  // As distance decreases from EMPTY toward FULL, fuel litres increase.
  float fraction = (DISTANCE_EMPTY_CM - clamped) / (DISTANCE_EMPTY_CM - DISTANCE_FULL_CM);
  return fraction * TANK_CAPACITY_L;
}

// ============================================================
// GPS (NEO-6M via TinyGPSPlus)
// ============================================================

void pollGps() {
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }
}

// ============================================================
// SIM800L — SMS alerting via AT commands
// ============================================================

void simSendCommand(const char* command, unsigned long waitMs) {
  simSerial.println(command);
  delay(waitMs);
  while (simSerial.available()) {
    Serial.write(simSerial.read()); // echo module response to serial monitor
  }
}

// Sends a critical fuel-event SMS using the classic AT command sequence:
//   AT+CMGF=1        -> switch to text mode
//   AT+CMGS="number"  -> begin message to number
//   <message text>
//   Ctrl+Z (0x1A)     -> send
void sendCriticalAlertSms(const String& message) {
  Serial.println("Sending critical alert SMS via SIM800L...");

  simSendCommand("AT", 500);
  simSendCommand("AT+CMGF=1", 500); // text mode

  simSerial.print("AT+CMGS=\"");
  simSerial.print(ALERT_PHONE_NUMBER);
  simSerial.println("\"");
  delay(500);

  simSerial.print(message);
  delay(200);

  simSerial.write(0x1A); // Ctrl+Z terminates and sends the SMS
  delay(3000);

  while (simSerial.available()) {
    Serial.write(simSerial.read());
  }

  Serial.println("SMS send sequence complete.");
}

// ============================================================
// TELEMETRY POST
// ============================================================

void sendTelemetry(float latitude, float longitude, float speedKmh,
                    float headingDeg, float fuelLitres, float fuelPercent) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping telemetry send: Wi-Fi not connected.");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_HOST) + "/api/telemetry/device";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["latitude"] = latitude;
  doc["longitude"] = longitude;
  doc["speed"] = speedKmh;
  doc["heading"] = headingDeg;
  doc["fuelLevelLitres"] = fuelLitres;
  doc["fuelPercent"] = fuelPercent;
  // timestamp intentionally omitted — the backend stamps server-side time
  // when the ESP32's RTC/NTP time cannot be trusted in the field.

  String body;
  serializeJson(doc, body);

  int statusCode = http.POST(body);

  if (statusCode > 0) {
    String response = http.getString();
    Serial.printf("Telemetry POST -> HTTP %d\n", statusCode);
    Serial.println(response);

    // Parse the response to see if the backend flagged a critical alert.
    StaticJsonDocument<256> respDoc;
    DeserializationError err = deserializeJson(respDoc, response);
    if (!err) {
      bool alertFlag = respDoc["alert"] | false;
      const char* alertMessage = respDoc["message"] | "";
      if (alertFlag) {
        sendCriticalAlertSms(String("Freight Malawi alert: ") + alertMessage);
      }
    }
  } else {
    Serial.printf("Telemetry POST failed, error: %s\n", http.errorToString(statusCode).c_str());
  }

  http.end();
}

// ============================================================
// SETUP / LOOP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_ULTRASONIC_TRIG, OUTPUT);
  pinMode(PIN_ULTRASONIC_ECHO, INPUT);

  gpsSerial.begin(9600, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
  simSerial.begin(9600, SERIAL_8N1, PIN_SIM800_RX, PIN_SIM800_TX);

  connectWiFi();

  Serial.println("Freight Malawi ESP32 fuel tracker ready.");
}

void loop() {
  ensureWiFiConnected();
  pollGps();

  // Heartbeat LED: blink continuously to show the firmware is alive,
  // independent of Wi-Fi/GPS/telemetry state.
  unsigned long nowMs = millis();
  static unsigned long lastBlinkAt = 0;
  if (nowMs - lastBlinkAt >= 1000) {
    lastBlinkAt = nowMs;
    ledState = !ledState;
    digitalWrite(PIN_LED, ledState ? HIGH : LOW);
  }

  if (nowMs - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = nowMs;

    // --- Fuel level ---
    float distanceCm = readUltrasonicMedianOf5();
    float fuelLitres = 0;
    float fuelPercent = 0;
    if (distanceCm > 0) {
      fuelLitres = distanceToLitres(distanceCm);
      fuelPercent = (fuelLitres / TANK_CAPACITY_L) * 100.0f;
    } else {
      Serial.println("Ultrasonic sensor: insufficient valid samples this cycle, reusing last known fuel reading.");
    }

    // --- GPS ---
    float latitude = 0;
    float longitude = 0;
    float speedKmh = 0;
    float headingDeg = 0;

    if (gps.location.isValid()) {
      latitude = gps.location.lat();
      longitude = gps.location.lng();
    } else {
      Serial.println("GPS: no valid fix yet, sending last known / zeroed position.");
    }
    if (gps.speed.isValid()) {
      speedKmh = gps.speed.kmph();
    }
    if (gps.course.isValid()) {
      headingDeg = gps.course.deg();
    }

    Serial.printf("Fuel: %.1f L (%.1f%%)  GPS: %.6f, %.6f  Speed: %.1f km/h  Heading: %.1f\n",
                  fuelLitres, fuelPercent, latitude, longitude, speedKmh, headingDeg);

    sendTelemetry(latitude, longitude, speedKmh, headingDeg, fuelLitres, fuelPercent);
  }
}
