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

The example in `hardware/esp32-gps-tracker/esp32-gps-tracker.ino` targets an
ESP32 with a UART GPS module supported by TinyGPSPlus. Install the TinyGPSPlus
library in Arduino IDE, replace the Wi-Fi and token placeholders, and install
the TLS root certificate used by the API domain.

An Arduino Uno without networking cannot call this endpoint by itself. Boards
using SIM800/SIM7600 or another cellular modem need a modem-specific transport
version of the same HTTPS request.

