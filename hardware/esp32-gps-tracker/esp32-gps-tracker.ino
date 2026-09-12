#include <HTTPClient.h>
#include <TinyGPSPlus.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// Replace these locally. Never commit the production Wi-Fi password or token.
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* GPS_DEVICE_TOKEN = "YOUR_GPS_DEVICE_TOKEN";
const char* DEVICE_ID = "IMPEX-TRUCK-01";
const char* GPS_ENDPOINT =
    "https://api.impexengineering.org/api/deliveries/active/location";

// Replace this with the root CA certificate for api.impexengineering.org.
// Do not use setInsecure() in production firmware.
const char ROOT_CA[] PROGMEM = R"CERT(
-----BEGIN CERTIFICATE-----
REPLACE_WITH_API_ROOT_CA_CERTIFICATE
-----END CERTIFICATE-----
)CERT";

constexpr int GPS_RX_PIN = 16;
constexpr int GPS_TX_PIN = 17;
constexpr uint32_t GPS_BAUD = 9600;
constexpr unsigned long SEND_INTERVAL_MS = 15000;

TinyGPSPlus gps;
HardwareSerial gpsSerial(2);
unsigned long lastSendAt = 0;

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 20000) {
    delay(250);
  }
}

String gpsPayload() {
  String payload = "{\"deviceId\":\"" + String(DEVICE_ID) + "\"";
  payload += ",\"latitude\":" + String(gps.location.lat(), 6);
  payload += ",\"longitude\":" + String(gps.location.lng(), 6);

  if (gps.speed.isValid()) {
    payload += ",\"speedKmph\":" + String(gps.speed.kmph(), 2);
  }
  if (gps.course.isValid()) {
    payload += ",\"heading\":" + String(gps.course.deg(), 2);
  }
  if (gps.satellites.isValid()) {
    payload += ",\"satellites\":" + String(gps.satellites.value());
  }
  payload += "}";
  return payload;
}

void sendLocation() {
  if (!gps.location.isValid() || gps.location.age() > 10000) return;

  connectWifi();
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setCACert(ROOT_CA);

  HTTPClient http;
  if (!http.begin(client, GPS_ENDPOINT)) return;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-GPS-Token", GPS_DEVICE_TOKEN);
  const int status = http.POST(gpsPayload());
  Serial.printf("GPS POST status: %d\n", status);
  if (status > 0) {
    Serial.println(http.getString());
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  connectWifi();
}

void loop() {
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  if (millis() - lastSendAt >= SEND_INTERVAL_MS) {
    lastSendAt = millis();
    sendLocation();
  }
  delay(10);
}
