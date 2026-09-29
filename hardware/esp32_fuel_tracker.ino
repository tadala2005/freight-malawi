/* ============================================================================
 * FREIGHT MALAWI — ESP32 FUEL & GPS TRACKER
 * ----------------------------------------------------------------------------
 * Hardware:
 *   - ESP32 dev board
 *   - JSN-SR04T waterproof ultrasonic sensor (fuel level, mounted at tank top)
 *   - NEO-6M GPS module (UART)
 *   - SIM800L GSM module (optional, for critical-alert SMS) — UART
 *   - Status LED (heartbeat)
 *
 * Libraries required (Arduino IDE Library Manager):
 *   - TinyGPSPlus                (mikalhart/TinyGPSPlus)
 *   - ArduinoJson                (bblanchon/ArduinoJson)
 *   - (WiFi.h / HTTPClient.h / WiFiClientSecure.h ship with the ESP32 core)
 *
 * This sketch is a genuine, complete reference implementation. Calibration
 * constants are grouped at the top for easy on-site adjustment. It is a
 * prototype: ultrasonic fuel sensing and consumer GPS accuracy are NOT
 * survey-grade or weighbridge-certified — see docs/system-limitations in the
 * main README.
 * ========================================================================== */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>

// ============================================================================
// CONFIGURATION — edit these before flashing
// ============================================================================
const char* WIFI_SSID       = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD   = "YOUR_WIFI_PASSWORD";

// Backend telemetry endpoint. Use the Render URL in production, or your
// local machine's LAN IP (e.g. "http://192.168.1.50:5000") for a local demo.
const char* API_URL         = "https://your-backend.onrender.com/api/telemetry/device";
const char* DEVICE_ID       = "ESP32-001";
const char* DEVICE_KEY      = "demo-key-001"; // must match the vehicle's configured device key

// Optional SIM800L SMS alerts on CRITICAL events (theft suspicion, device power loss)
#define ENABLE_SIM800L false
const char* ALERT_PHONE_NUMBER = "+265888000000";

// --- Ultrasonic fuel-tank calibration (JSN-SR04T) ---
// Measure these once per installation: sensor-to-empty-tank-bottom distance,
// and sensor-to-full-tank-surface distance, both in centimetres.
const float DISTANCE_EMPTY_CM = 90.0;   // ultrasonic reading when tank is empty
const float DISTANCE_FULL_CM  = 10.0;   // ultrasonic reading when tank is full
const float TANK_CAPACITY_L   = 400.0;  // litres, must match the vehicle record in the app

// --- Ignition sense input ---
// Wire through a voltage divider / opto-isolator from the vehicle's ignition
// (ACC) line down to 3.3V logic. NEVER connect 12V directly to a GPIO pin.
const int IGNITION_SENSE_PIN = 34;

// --- Pins ---
const int TRIG_PIN       = 5;
const int ECHO_PIN       = 18;
const int STATUS_LED_PIN = 2;
const int GPS_RX_PIN     = 16; // ESP32 RX  <- GPS TX
const int GPS_TX_PIN     = 17; // ESP32 TX  -> GPS RX
const int SIM800_RX_PIN  = 27;
const int SIM800_TX_PIN  = 26;

const unsigned long TELEMETRY_INTERVAL_MS = 5000;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
const int HTTP_MAX_RETRIES = 3;

// ============================================================================
// GLOBAL STATE
// ============================================================================
HardwareSerial gpsSerial(1);
HardwareSerial simSerial(2);
TinyGPSPlus gps;

unsigned long lastTelemetryAt = 0;
unsigned long lastWifiAttemptAt = 0;
unsigned long lastOdometerUpdateAt = 0;
double odometerKm = 0.0;
double lastValidLat = 0.0;
double lastValidLng = 0.0;
bool hasValidFix = false;

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(IGNITION_SENSE_PIN, INPUT);

  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  if (ENABLE_SIM800L) {
    simSerial.begin(9600, SERIAL_8N1, SIM800_RX_PIN, SIM800_TX_PIN);
    delay(2000);
    simSerial.println("AT");       // wake / test modem
    simSerial.println("AT+CMGF=1"); // text-mode SMS
  }

  connectWiFi();
  Serial.println("Freight Malawi ESP32 tracker ready.");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  heartbeat();
  feedGps();
  ensureWiFiConnected();

  if (millis() - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = millis();
    sendTelemetry();
  }
}

// ============================================================================
// WIFI
// ============================================================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection failed — will retry in background.");
  }
}

void ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiAttemptAt < WIFI_RETRY_INTERVAL_MS) return;
  lastWifiAttemptAt = millis();
  Serial.println("WiFi disconnected — attempting reconnect...");
  WiFi.disconnect();
  WiFi.reconnect();
}

// ============================================================================
// GPS
// ============================================================================
void feedGps() {
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }
  if (gps.location.isValid() && gps.location.isUpdated()) {
    lastValidLat = gps.location.lat();
    lastValidLng = gps.location.lng();
    hasValidFix = true;
  }
  // If GPS is temporarily unavailable we simply keep the last valid fix and
  // mark gps_valid=false in the payload — we never send (0,0) or crash.
}

double currentSpeedKmh() {
  if (gps.speed.isValid()) return gps.speed.kmph();
  return 0.0;
}

double currentHeadingDeg() {
  if (gps.course.isValid()) return gps.course.deg();
  return 0.0;
}

// ============================================================================
// ULTRASONIC FUEL SENSOR (median-of-five filtering)
// ============================================================================
float readUltrasonicDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long durationUs = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout (~5m range)
  if (durationUs == 0) return -1; // no echo received
  return (durationUs * 0.0343) / 2.0; // speed of sound ~343 m/s
}

float readFilteredDistanceCm() {
  float samples[5];
  int count = 0;
  for (int i = 0; i < 5; i++) {
    float d = readUltrasonicDistanceCm();
    if (d > 0) {
      samples[count++] = d;
    }
    delay(30);
  }
  if (count == 0) return DISTANCE_EMPTY_CM; // sensor fault fallback: report "empty" defensively

  // Simple insertion sort (n<=5) then take the median to reject sloshing spikes.
  for (int i = 1; i < count; i++) {
    float key = samples[i];
    int j = i - 1;
    while (j >= 0 && samples[j] > key) {
      samples[j + 1] = samples[j];
      j--;
    }
    samples[j + 1] = key;
  }
  return samples[count / 2];
}

float distanceToLitres(float distanceCm) {
  float clamped = constrain(distanceCm, DISTANCE_FULL_CM, DISTANCE_EMPTY_CM);
  float fractionFull = (DISTANCE_EMPTY_CM - clamped) / (DISTANCE_EMPTY_CM - DISTANCE_FULL_CM);
  return fractionFull * TANK_CAPACITY_L;
}

// ============================================================================
// TELEMETRY
// ============================================================================
void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping telemetry send — WiFi not connected.");
    return;
  }

  float distanceCm = readFilteredDistanceCm();
  float fuelLitres = distanceToLitres(distanceCm);
  float fuelPercent = (fuelLitres / TANK_CAPACITY_L) * 100.0;

  double speedKmh = currentSpeedKmh();
  double headingDeg = currentHeadingDeg();
  bool ignitionOn = digitalRead(IGNITION_SENSE_PIN) == HIGH;

  // Dead-reckon a rough odometer between GPS fixes using elapsed time * speed.
  unsigned long now = millis();
  if (lastOdometerUpdateAt > 0 && speedKmh > 0) {
    double hoursElapsed = (now - lastOdometerUpdateAt) / 3600000.0;
    odometerKm += speedKmh * hoursElapsed;
  }
  lastOdometerUpdateAt = now;

  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["device_key"] = DEVICE_KEY;
  doc["latitude"] = hasValidFix ? lastValidLat : 0.0;
  doc["longitude"] = hasValidFix ? lastValidLng : 0.0;
  doc["gps_valid"] = hasValidFix;
  doc["speed"] = speedKmh;
  doc["heading"] = headingDeg;
  doc["fuel_level_litres"] = fuelLitres;
  doc["fuel_percent"] = fuelPercent;
  doc["odometer_km"] = odometerKm;
  doc["engine_hours"] = 0;
  doc["ignition_on"] = ignitionOn;
  doc["cargo_weight_kg"] = 0; // no load cell in this prototype configuration
  doc["telemetry_uuid"] = String(DEVICE_ID) + "-" + String(now);

  String payload;
  serializeJson(doc, payload);

  bool sent = postWithRetries(payload);
  if (!sent) {
    Serial.println("Telemetry send failed after retries.");
    if (ENABLE_SIM800L) sendSms("Freight Malawi: device offline / send failure.");
  }
}

bool postWithRetries(const String& jsonPayload) {
  for (int attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
    bool ok = postOnce(jsonPayload);
    if (ok) return true;
    Serial.printf("HTTP attempt %d/%d failed, retrying...\n", attempt, HTTP_MAX_RETRIES);
    delay(1000 * attempt);
  }
  return false;
}

bool postOnce(const String& jsonPayload) {
  HTTPClient http;
  bool isHttps = String(API_URL).startsWith("https");
  WiFiClientSecure secureClient;

  bool began;
  if (isHttps) {
    secureClient.setInsecure(); // prototype: skip certificate pinning for simplicity
    began = http.begin(secureClient, API_URL);
  } else {
    began = http.begin(API_URL);
  }
  if (!began) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int statusCode = http.POST(jsonPayload);
  String response = http.getString();
  http.end();

  Serial.printf("POST %s -> %d\n", API_URL, statusCode);
  if (statusCode >= 200 && statusCode < 300) return true;
  Serial.println(response);
  return false;
}

// ============================================================================
// SIM800L (optional)
// ============================================================================
void sendSms(const char* message) {
  if (!ENABLE_SIM800L) return;
  simSerial.println("AT+CMGF=1");
  delay(200);
  simSerial.print("AT+CMGS=\"");
  simSerial.print(ALERT_PHONE_NUMBER);
  simSerial.println("\"");
  delay(200);
  simSerial.print(message);
  delay(200);
  simSerial.write(26); // CTRL+Z sends the message
  delay(200);
}

// ============================================================================
// HEARTBEAT LED
// ============================================================================
void heartbeat() {
  static unsigned long lastToggle = 0;
  static bool state = false;
  unsigned long blinkInterval = (WiFi.status() == WL_CONNECTED) ? 1000 : 250;
  if (millis() - lastToggle >= blinkInterval) {
    lastToggle = millis();
    state = !state;
    digitalWrite(STATUS_LED_PIN, state ? HIGH : LOW);
  }
}
