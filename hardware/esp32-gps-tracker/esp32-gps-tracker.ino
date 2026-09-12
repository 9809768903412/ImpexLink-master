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

// ISRG Root X1 currently anchors the Let's Encrypt certificate chain used by
// api.impexengineering.org. Do not use setInsecure() in production firmware.
const char ROOT_CA[] PROGMEM = R"CERT(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
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

  Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 20000) {
    delay(250);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.printf("[WiFi] Connection failed. Status: %d\n", WiFi.status());
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
  Serial.printf(
      "[GPS] Reading attempt. chars=%lu valid=%s age=%lums satellites=%lu\n",
      gps.charsProcessed(),
      gps.location.isValid() ? "yes" : "no",
      gps.location.isValid() ? gps.location.age() : 0,
      gps.satellites.isValid() ? gps.satellites.value() : 0);

  if (!gps.location.isValid()) {
    Serial.println("[GPS] No valid fix yet. Check antenna visibility and UART wiring.");
    return;
  }
  if (gps.location.age() > 10000) {
    Serial.println("[GPS] Fix is older than 10 seconds; waiting for a fresh reading.");
    return;
  }

  Serial.printf(
      "[GPS] Fix acquired: latitude=%.6f longitude=%.6f speed=%.2f km/h\n",
      gps.location.lat(), gps.location.lng(),
      gps.speed.isValid() ? gps.speed.kmph() : 0.0);

  connectWifi();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Upload] Skipped: Wi-Fi is not connected.");
    return;
  }

  WiFiClientSecure client;
  client.setCACert(ROOT_CA);

  HTTPClient http;
  Serial.printf("[Upload] Posting GPS reading to %s\n", GPS_ENDPOINT);
  if (!http.begin(client, GPS_ENDPOINT)) {
    Serial.println("[Upload] Could not initialize the HTTPS request.");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-GPS-Token", GPS_DEVICE_TOKEN);
  const int status = http.POST(gpsPayload());
  Serial.printf("[Upload] HTTP status: %d\n", status);
  if (status > 0) {
    Serial.print("[Upload] Server response: ");
    Serial.println(http.getString());
  } else {
    Serial.print("[Upload] Request failed: ");
    Serial.println(HTTPClient::errorToString(status));
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[System] Impex truck GPS tracker starting.");
  Serial.printf("[GPS] UART RX=%d TX=%d baud=%lu\n", GPS_RX_PIN, GPS_TX_PIN,
                GPS_BAUD);
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
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
