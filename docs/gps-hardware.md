# GPS hardware integration

The production GPS unit sends one authenticated HTTPS request to the backend.
The backend associates that reading with every active delivery on the company's
single truck. It does not accept readings when no delivery is `IN_TRANSIT` or
`DELAYED`.

## Railway configuration

Set `GPS_DEVICE_TOKEN` on the backend service to a long random value. Configure
the same value only in the physical tracker firmware. Do not put it in the React
frontend or commit the real value to Git.

## Endpoint

`POST https://api.impexengineering.org/api/deliveries/active/location`

Headers:

```text
Content-Type: application/json
X-GPS-Token: <GPS_DEVICE_TOKEN>
```

Payload:

```json
{
  "deviceId": "IMPEX-TRUCK-01",
  "latitude": 14.599512,
  "longitude": 120.984222,
  "speedKmph": 24.7,
  "heading": 135.0,
  "satellites": 8
}
```

`speedKmph`, `heading`, and `satellites` may be omitted when the GPS module does
not have a valid reading. The server supplies the receipt timestamp when
`recordedAt` is omitted, avoiding incorrect Arduino clocks.

Successful requests return HTTP `201`. Expected non-success responses include:

- `401`: device token does not match Railway.
- `404`: no active delivery exists.
- `409`: no single active rider account can be resolved.
- `503`: the GPS database migration has not been deployed.

## Arduino IDE

The example in `hardware/esp32-gps-tracker/esp32-gps-tracker.ino` matches the
pictured build: an ESP32 DevKit-class board, an NMEA UART GPS module such as the
NEO-M8N, and a pocket Wi-Fi connection. Install the TinyGPSPlus library in
Arduino IDE, then replace only the Wi-Fi and token placeholders. The verified
Let's Encrypt root certificate for the API is already included.

Use a 2.4 GHz pocket Wi-Fi network because the classic ESP32 does not support
5 GHz Wi-Fi. Wire GPS `TX` to ESP32 `GPIO 16` (`RX2`), GPS `RX` to `GPIO 17`
(`TX2`, optional if configuration commands are not sent), and connect a common
ground. Confirm the GPS breakout board's allowed input voltage before powering
it; the ESP32 UART pins themselves use 3.3 V logic.

Open Arduino IDE's Serial Monitor at `115200` baud after flashing. Every 15
seconds it reports whether the module has a valid GPS fix, whether Wi-Fi is
connected, and the API's HTTP status and response. It never prints the GPS
device token.

An Arduino Uno without networking cannot call this endpoint by itself. Boards
using SIM800/SIM7600 or another cellular modem need a modem-specific transport
version of the same HTTPS request.

## Arrival information in the tracking view

The existing device payload remains unchanged. The tracking view separates:

- Scheduled ETA: the time entered for the delivery.
- GPS Route ETA: a driving estimate from the latest hardware position to the
  destination coordinates entered in this view. Click Calculate route ETA to
  start; it refreshes every minute while the truck delivery is active. Readings
  older than two minutes are not used. Destination coordinates and estimates
  are temporary and are not saved to the delivery record.
- Delivery confirmed: the stored `receivedAt` timestamp from confirmation.
  A GPS reading or a route estimate never confirms delivery automatically.

Routing uses `VITE_ROUTING_URL` when set, otherwise the public OSRM demonstration
server. Use a suitable hosted or self-hosted routing service for production.
This estimate excludes live traffic, vehicle restrictions, unloading and stops
for other orders. The last recorded truck position is labelled separately from
the confirmed delivery time because it may precede the handover.
