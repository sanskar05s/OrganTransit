# 📘 Real-Time Smart Organ Transport Monitoring System

## Complete Project Explanation — A to Z

> This document provides a comprehensive, in-depth explanation of every component, logic decision, and implementation detail of the Organ Transportation Monitoring System. It is designed so that any reader — even with no prior exposure to the project — can understand the entire system and confidently explain any part of it.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Complete System Architecture](#2-complete-system-architecture)
3. [Hardware Explanation (Detailed)](#3-hardware-explanation-detailed)
4. [Firmware Logic (ESP32)](#4-firmware-logic-esp32)
5. [Map System (Detailed)](#5-map-system-detailed)
6. [Dashboard (Frontend Logic)](#6-dashboard-frontend-logic)
7. [Alert System](#7-alert-system)
8. [Temperature Modes](#8-temperature-modes)
9. [Data Handling](#9-data-handling)
10. [UI Design Logic](#10-ui-design-logic)
11. [Limitations & Edge Cases](#11-limitations--edge-cases)
12. [Future Improvements](#12-future-improvements)

---

## 1. Project Overview

### What the System Does

The Organ Transportation Monitoring System is a real-time Internet of Things (IoT) solution that continuously monitors the environmental and physical conditions of an organ during transport from a donor hospital to a recipient hospital. It tracks temperature, humidity, physical shocks, tilt angle, GPS location, and container integrity — all in real time — and displays this information on a professional web dashboard accessible to medical staff and patient families.

### The Real-World Problem

Organ transplantation is one of the most time-critical and condition-sensitive procedures in modern medicine. Once an organ is harvested from a donor, it must be transported to the recipient hospital within a strict time window — typically 4 to 36 hours depending on the organ type. During this window, the organ must be maintained under very specific environmental conditions:

- **Temperature** must remain within a narrow safe range. For cold-stored organs (kidneys, liver), the range is 2°C to 8°C. For machine-perfused organs (heart, lungs), the range can be 20°C to 37°C. If the temperature deviates even slightly, the organ can suffer irreversible cellular damage.

- **Physical handling** must be gentle. Sudden shocks, drops, or excessive tilting can damage delicate tissue structures, rupture blood vessels within the organ, or compromise the sterile container.

- **Container integrity** must be maintained. The transport box must remain sealed at all times. Any unauthorized opening could introduce contaminants or disrupt the controlled atmosphere inside.

- **Location tracking** is necessary so that the receiving hospital can prepare the surgical team in advance, and so that any delays in transit are immediately visible.

Currently, most organ transports rely on passive coolers and manual monitoring — a human courier carries the organ box and periodically checks it. There is no automated alerting, no real-time tracking, and no data logging. If something goes wrong mid-transport, nobody knows until the organ arrives and is inspected.

### Why This Solution Matters

This system eliminates the blind spots in organ transport by providing:

- **Continuous automated monitoring** — sensors read data every 3 seconds, 24/7, without human intervention.
- **Instant alerts** — any parameter that goes out of range triggers an immediate alert on both the ESP32 (buzzer + LED) and the web dashboard (visual and audio alerts).
- **Complete audit trail** — all sensor data is logged with timestamps and can be exported as a CSV file, providing a verifiable record of transport conditions.
- **Remote visibility** — doctors and patient families can monitor the transport from any device with a web browser, anywhere in the world.

### Where It Can Be Used

- **Hospital-to-hospital organ transport** — the primary use case
- **Blood bank logistics** — blood products also require strict temperature control
- **Pharmaceutical cold chain** — vaccine and medicine transport
- **Laboratory specimen transport** — biological samples requiring controlled conditions
- **Research applications** — any scenario where environmental monitoring during transit is critical

---

## 2. Complete System Architecture

The system consists of three major layers: the **Hardware Layer** (sensors + ESP32), the **Cloud Layer** (Blynk IoT), and the **Application Layer** (web dashboard). Data flows in one direction for sensor readings (upward from sensors to dashboard) and in the reverse direction for control commands (downward from dashboard to ESP32).

### Layer 1: ESP32 Microcontroller (The Brain)

The ESP32 DevKit V1 is the central processing unit of the entire hardware system. It is a dual-core 32-bit microprocessor manufactured by Espressif Systems, running at 240 MHz. It was chosen for this project for several critical reasons:

- **Built-in WiFi** — The ESP32 has an integrated WiFi radio (802.11 b/g/n), eliminating the need for a separate WiFi module. This allows it to connect directly to any WiFi network and communicate with the Blynk cloud server over the internet.

- **Multiple communication interfaces** — It supports I2C (for the MPU6050 accelerometer), UART (for the GPS module), digital GPIO (for the DHT22), and analog-to-digital conversion (for the LDR). This means a single ESP32 can interface with all four sensors simultaneously without any external multiplexers or interface boards.

- **Sufficient processing power** — The dual-core processor can handle sensor reading, data processing, threshold checking, GPS parsing, and Blynk communication concurrently without dropping any tasks.

- **Low cost and wide availability** — The ESP32 DevKit V1 costs approximately ₹400-600, making it extremely practical for a project of this nature.

The ESP32 runs custom firmware written in C++ using the Arduino framework. The firmware initializes all sensors at startup, then enters an infinite loop where it maintains the Blynk connection and triggers a sensor reading function every 3 seconds using a non-blocking timer.

### Layer 2: Sensors (The Senses)

Four sensors are connected to the ESP32, each responsible for monitoring a different parameter:

| Sensor | Parameter | Interface | ESP32 Pin |
|--------|-----------|-----------|-----------|
| DHT22 | Temperature & Humidity | Digital (1-Wire) | GPIO 4 |
| MPU6050 | Acceleration & Tilt | I2C | GPIO 21 (SDA), GPIO 22 (SCL) |
| NEO-6M | GPS Location | UART (Serial) | GPIO 16 (RX), GPIO 17 (TX) |
| LDR | Light (Box Tamper) | Analog (ADC) | GPIO 34 |

Additionally, two output devices provide local alerts:

| Device | Purpose | ESP32 Pin |
|--------|---------|-----------|
| Active Buzzer | Audio alert | GPIO 25 |
| LED | Visual alert | GPIO 2 (onboard) |

### Layer 3: Blynk IoT Cloud (The Highway)

Blynk IoT is a cloud platform designed specifically for IoT applications. It acts as the intermediary between the ESP32 hardware and the web dashboard. The choice of Blynk was made for these reasons:

- **Virtual Pins** — Blynk uses a concept called Virtual Pins (V0, V1, V2, etc.) to abstract data channels. Each sensor value is assigned a virtual pin. The ESP32 writes data to these pins using `Blynk.virtualWrite()`, and the dashboard reads from them using the Blynk REST API. This decouples the hardware from the software — neither side needs to know the implementation details of the other.

- **Built-in HTTP REST API** — Blynk exposes every virtual pin value through a simple REST API endpoint: `https://blynk.cloud/external/api/get?token=YOUR_TOKEN&pin=V0`. This makes it trivial for the web dashboard to fetch sensor data using standard JavaScript `fetch()` calls without any WebSocket or MQTT complexity.

- **Bidirectional communication** — The dashboard can also write to virtual pins using the Blynk REST API (`/api/update`), enabling control commands (like System ON/OFF and Temperature Mode selection) to flow from the dashboard back to the ESP32.

- **Free tier** — Blynk offers a free tier sufficient for this project's data rates (one device, ~11 virtual pins, data sent every 3 seconds).

**How communication works:**

The ESP32 maintains a persistent TCP connection to the Blynk server using the `Blynk.run()` function called in every loop iteration. When `Blynk.virtualWrite(V0, 26.5)` is called, the ESP32 sends a small packet to the Blynk server saying "set pin V0 to 26.5". The server stores this value. When the dashboard makes an HTTP GET request to `https://blynk.cloud/external/api/get?token=XXX&pin=V0`, the server responds with `26.5`. This entire round trip typically takes less than 500 milliseconds.

The system uses 11 virtual pins:

| Pin | Direction | Data |
|-----|-----------|------|
| V0 | ESP32 → Cloud | Temperature (°C) |
| V1 | ESP32 → Cloud | Humidity (%) |
| V2 | ESP32 → Cloud | Acceleration X (g) |
| V3 | ESP32 → Cloud | Acceleration Y (g) |
| V4 | ESP32 → Cloud | Acceleration Z (g) |
| V5 | ESP32 → Cloud | Latitude |
| V6 | ESP32 → Cloud | Longitude |
| V7 | ESP32 → Cloud | LDR value (0–4095) |
| V8 | Cloud → ESP32 | System ON/OFF (0 or 1) |
| V9 | Cloud → ESP32 | Temperature Mode (0, 1, or 2) |
| V10 | ESP32 → Cloud | Tilt Angle (degrees) |

### Layer 4: Web Dashboard (The Eyes)

The web dashboard is a single-page application (SPA) built with vanilla HTML, CSS, and JavaScript. It runs entirely in the user's web browser — there is no backend server. The dashboard connects directly to the Blynk REST API to fetch sensor data and send control commands.

The dashboard is responsible for:
- Displaying real-time sensor values in cards
- Plotting temperature and humidity history on a Chart.js line graph
- Showing the transport location on a Leaflet.js map with route visualization
- Checking sensor values against thresholds and displaying alerts
- Allowing the doctor to control the system (ON/OFF, temperature mode)
- Exporting historical data as CSV
- Providing role-based access (Doctor vs Patient Family)

### Complete Data Flow

```
Step 1: DHT22 sensor reads temperature: 26.5°C
Step 2: ESP32 firmware receives the reading
Step 3: ESP32 checks: Is 26.5°C within the safe range for the current mode?
Step 4: If out of range → ESP32 activates buzzer + LED + logs Blynk event
Step 5: ESP32 calls Blynk.virtualWrite(V0, 26.5) → sends to cloud
Step 6: Dashboard (running in browser) calls fetch("...blynk.cloud/.../get?pin=V0")
Step 7: Blynk server responds: "26.5"
Step 8: Dashboard JavaScript updates the Temperature sensor card to show 26.5°C
Step 9: Dashboard checks its own thresholds → if alert, shows red flash + banner + popup
Step 10: Dashboard pushes the reading into the history array for chart and CSV
```

This entire cycle repeats every 3 seconds.

---

## 3. Hardware Explanation (Detailed)

### 3.1 DHT22 — Temperature & Humidity Sensor

**What it is:**
The DHT22 (also known as AM2302) is a digital sensor that measures both air temperature and relative humidity using a single data pin. It contains a capacitive humidity-sensing element and a thermistor for temperature measurement, along with a small 8-bit microcontroller that converts the analog readings into a digital signal.

**Why it was chosen:**
- Accuracy: ±0.5°C for temperature, ±2% for humidity — sufficient for organ transport monitoring
- Wide range: -40°C to 80°C temperature range covers all three preservation modes
- Digital output: eliminates the need for analog-to-digital conversion and reduces noise
- Simple interface: requires only one GPIO pin plus power and ground
- Low cost: approximately ₹150-250

**How it works internally:**
The DHT22 uses a proprietary one-wire protocol (not to be confused with Dallas 1-Wire). When the ESP32 sends a start signal (pulling the data line LOW for at least 1 millisecond), the DHT22 responds with a 40-bit data packet. This packet contains: 16 bits of humidity data, 16 bits of temperature data, and 8 bits of checksum. The ESP32's DHT library handles all the timing-critical signal reading and converts the raw bits into float values.

The sensor needs a minimum of 2 seconds between readings to update its internal registers. Our firmware reads it every 3 seconds, which provides comfortable margin.

**Connection to ESP32:**
- Data pin → GPIO 4 (with a 4.7kΩ pull-up resistor to 3.3V recommended for signal stability)
- VCC → 3.3V
- GND → GND

**Data provided:**
- `dht.readTemperature()` returns a float in degrees Celsius
- `dht.readHumidity()` returns a float as relative humidity percentage
- Both return `NaN` if the read fails (broken wire, sensor fault)

### 3.2 MPU6050 — Accelerometer & Gyroscope

**What it is:**
The MPU6050 is a 6-axis inertial measurement unit (IMU) manufactured by InvaSense (now part of TDK). It contains a 3-axis accelerometer and a 3-axis gyroscope on a single chip. In this project, we use only the accelerometer portion to measure acceleration forces along the X, Y, and Z axes.

**Why it was chosen:**
- Provides both raw acceleration (for shock/fall detection) and derived tilt angle (for orientation monitoring)
- Communicates over I2C, which requires only 2 wires (SDA and SCL) — efficient pin usage
- High sensitivity: at the default ±2g range, it has a resolution of 16,384 LSB/g (least significant bit per g-force unit)
- Extremely low cost: approximately ₹100-200
- Widely available with extensive documentation and Arduino library support

**How it works internally:**
The accelerometer inside the MPU6050 uses micro-electromechanical systems (MEMS) technology. Tiny proof masses are suspended on microscopic silicon springs inside the chip. When acceleration is applied (including the constant acceleration due to gravity), these masses deflect, changing the capacitance between them and fixed electrodes. This capacitance change is measured by the chip's internal circuitry and converted into a digital value.

At rest on a flat surface:
- X-axis: ~0g (no horizontal acceleration)
- Y-axis: ~0g (no horizontal acceleration)  
- Z-axis: ~1g (gravity pulling downward)

If the sensor is tilted 45°, gravity is distributed across axes, and the Z-axis reading drops below 1g while X or Y increases.

**Connection to ESP32:**
- SDA → GPIO 21 (I2C data line)
- SCL → GPIO 22 (I2C clock line)
- VCC → 3.3V
- GND → GND
- I2C address: 0x68 (default, AD0 pin connected to GND)

**Communication protocol:**
The firmware uses raw I2C register reads instead of the Adafruit MPU6050 library. This was a deliberate choice to reduce code size and library dependency issues. The process is:

1. Send a write command to register `0x6B` with value `0` to wake the MPU6050 from sleep mode (this is done once in `setup()`)
2. Every 3 seconds, send a read request starting at register `0x3B` (which is `ACCEL_XOUT_H`)
3. Read 6 consecutive bytes: X-high, X-low, Y-high, Y-low, Z-high, Z-low
4. Combine each pair into a signed 16-bit integer: `AcX = Wire.read() << 8 | Wire.read()`
5. Divide by 16,384 to convert to g-force: `ax = AcX / 16384.0`

**Data provided:**
- Acceleration X, Y, Z in g-force units (sent to Blynk on V2, V3, V4)
- Acceleration magnitude: `sqrt(ax² + ay² + az²)` — used for fall detection (threshold: 1.5g)
- Tilt angle: computed using `atan2()` — sent to Blynk on V10 (threshold: 45°)

### 3.3 NEO-6M — GPS Module

**What it is:**
The NEO-6M is a GPS (Global Positioning System) receiver module manufactured by u-blox. It receives signals from GPS satellites orbiting the Earth and calculates the module's geographic coordinates (latitude and longitude) with an accuracy of approximately 2.5 meters under open sky conditions.

**Why it was chosen:**
- Provides real-time geographic coordinates for tracking the transport vehicle
- Built-in antenna (some modules include a ceramic patch antenna; others have a connector for an external antenna)
- Simple UART serial interface — outputs standard NMEA sentences that can be parsed by the TinyGPSPlus library
- Low power consumption: typically 45mA during operation
- Reasonable cost: approximately ₹250-400

**How it works internally:**
The GPS module receives radio signals from at least 4 GPS satellites simultaneously. Each satellite broadcasts its exact position and the exact time. By measuring the time it takes for each satellite's signal to reach the receiver, the module calculates the distance to each satellite using the speed of light. With distances to at least 4 satellites, the module uses trilateration to calculate its 3D position (latitude, longitude, and altitude).

The module outputs this position data as NMEA (National Marine Electronics Association) sentences over its TX pin at 9600 baud. A typical NMEA sentence looks like:

```
$GPGGA,092750.000,5321.6802,N,00630.3372,W,1,8,0.95,61.7,M,55.2,M,,*76
```

The TinyGPSPlus library parses these sentences and extracts the latitude and longitude as floating-point numbers.

**Connection to ESP32:**
- GPS TX → ESP32 GPIO 16 (UART2 RX) — GPS sends data to ESP32
- GPS RX → ESP32 GPIO 17 (UART2 TX) — ESP32 can send configuration commands to GPS
- VCC → 3.3V
- GND → GND

**Important note about GPS processing:**
GPS data arrives continuously as a stream of NMEA sentences. The firmware must continuously read and feed bytes to the TinyGPSPlus parser in the `loop()` function — this cannot be done only in the 3-second timer callback. That is why the `readGPS()` function is called in every iteration of `loop()`:

```cpp
void loop() {
    Blynk.run();
    timer.run();
    if (systemActive) {
        readGPS();  // Feed bytes to parser continuously
    } else {
        drainGPSBuffer();  // Read and discard to prevent buffer overflow
    }
}
```

When the system is OFF, the GPS serial buffer must still be drained (read and discarded) to prevent it from overflowing and corrupting data when the system is turned back ON.

**Data provided:**
- `gps.location.lat()` — latitude as a double (e.g., 19.076000)
- `gps.location.lng()` — longitude as a double (e.g., 72.877000)
- `gps.location.isValid()` — boolean indicating whether a valid fix has been obtained

### 3.4 LDR — Light Dependent Resistor (Box Tamper Detection)

**What it is:**
An LDR (also called a photoresistor) is a passive electronic component whose electrical resistance changes with the intensity of light falling on it. In darkness, its resistance is very high (megaohms). In bright light, its resistance drops to a few hundred ohms.

**Why it was chosen:**
- Extremely simple and reliable way to detect whether the transport box lid has been opened
- No moving parts — purely electrical operation
- Ultra-low cost: approximately ₹10-20
- Works on the principle that the inside of a sealed transport box is dark, so any light detection indicates the lid has been opened

**How it works in this project:**
The LDR is placed inside the organ transport box, facing upward toward the lid. When the lid is closed, no light reaches the LDR, so its resistance is very high. This causes a high voltage at the ADC pin (high ADC reading, above 2000). When the lid is opened, ambient light reaches the LDR, its resistance drops, the voltage at the ADC pin drops, and the ADC reading falls below 2000.

The LDR is connected in a voltage divider circuit with a 10kΩ fixed resistor:

```
3.3V ─── [LDR] ───┬─── GPIO 34 (Analog Input)
                   │
                  [10kΩ]
                   │
                  GND
```

The voltage at GPIO 34 depends on the ratio of LDR resistance to the fixed 10kΩ resistor. The ESP32's built-in ADC converts this voltage to a 12-bit digital value (0 to 4095).

**Threshold logic:**
The firmware defines `LDR_THRESHOLD = 2000`. The comparison is:

```cpp
bool boxIsOpen = (ldrValue < LDR_THRESHOLD);
```

- `ldrValue < 2000` → light detected → box is OPEN → alert triggered
- `ldrValue >= 2000` → dark → box is CLOSED → no alert

To reduce noise in the LDR reading, the firmware takes 3 consecutive readings with a 2-millisecond gap between each, then averages them:

```cpp
int ldrSum = 0;
for (int i = 0; i < 3; i++) {
    ldrSum += analogRead(LDR_PIN);
    delay(2);
}
int ldrValue = ldrSum / 3;
```

This averaging eliminates random spikes caused by electrical noise on the ADC pin.

**Data provided:**
- Raw ADC value (0–4095) sent to Blynk on V7
- Boolean box status (OPEN / CLOSED) used for alerting

### 3.5 Buzzer and LED — Local Alert Output

**Active Buzzer (GPIO 25):**
An active buzzer contains its own internal oscillator, so it produces a tone whenever voltage is applied — no external frequency generation is needed. The firmware simply writes HIGH or LOW to the pin to turn it on or off.

**LED (GPIO 2):**
GPIO 2 is connected to the ESP32's onboard LED. It lights up during alerts to provide a local visual indicator.

**Non-blocking operation:**
The buzzer uses a non-blocking pattern based on `millis()` — it toggles every 200 milliseconds to create a beeping effect without using `delay()`. This is critical because `delay()` would freeze the entire program, preventing Blynk communication, GPS parsing, and sensor reading.

```cpp
void triggerAlarmNonBlocking() {
    if (millis() - lastBeep > 200) {
        buzzerState = !buzzerState;
        digitalWrite(BUZZER_PIN, buzzerState);
        lastBeep = millis();
    }
}
```

---

## 4. Firmware Logic (ESP32)

### 4.1 Program Structure

The firmware follows the standard Arduino structure:

- `setup()` — runs once at power-up; initializes all hardware and connections
- `loop()` — runs continuously; maintains Blynk connection and processes GPS data

Sensor reading is NOT done in `loop()` directly. Instead, it is delegated to a function called `readAndSendSensors()` which is called every 3 seconds by `BlynkTimer`. This timer-based approach ensures consistent 3-second intervals regardless of how fast `loop()` executes.

### 4.2 System ON/OFF Logic

The system has a master control flag called `systemActive` (boolean). This flag is controlled by the dashboard via Blynk Virtual Pin V8.

When the dashboard sends `1` to V8, the ESP32's `BLYNK_WRITE(VPIN_CTRL)` callback fires and sets `systemActive = true`. When `0` is sent, `systemActive = false`.

The effect of `systemActive = false` is comprehensive:

- `readAndSendSensors()` returns immediately without reading any sensor
- No data is sent to Blynk (`virtualWrite` calls are skipped)
- No threshold checks are performed
- No alerts are triggered
- The buzzer and LED are immediately silenced via `silenceAlarm()`
- GPS data is drained but discarded (buffer overflow prevention)

However, `Blynk.run()` and `timer.run()` continue executing even when the system is OFF. This is essential because the ESP32 must remain connected to Blynk to receive the ON command when the user wants to resume.

### 4.3 Non-Blocking Programming

Traditional Arduino programming uses `delay(3000)` to wait 3 seconds between sensor readings. This approach is catastrophically bad for this project because:

- During `delay()`, the CPU does absolutely nothing — no Blynk communication, no GPS parsing, no command reception
- A 3-second delay means the ESP32 would be unresponsive for 3 full seconds every cycle
- The Blynk connection would drop because heartbeat packets cannot be sent
- GPS serial buffer would overflow because incoming data is not being read

Instead, the firmware uses `BlynkTimer` (which is based on `SimpleTimer`). The timer stores the timestamp of the last execution and compares it to the current time in every `loop()` iteration. When 3000 milliseconds have elapsed, it calls `readAndSendSensors()`. The rest of the time, `loop()` continues executing `Blynk.run()` and `readGPS()` without any blocking.

The same principle applies to the buzzer. Instead of `delay(200)` between beeps, the firmware uses:

```cpp
if (millis() - lastBeep > 200) {
    buzzerState = !buzzerState;
    digitalWrite(BUZZER_PIN, buzzerState);
    lastBeep = millis();
}
```

This checks if 200ms have passed since the last toggle. If yes, toggle the buzzer. If no, do nothing and let `loop()` continue.

### 4.4 Tilt Angle Calculation

The tilt angle is calculated from the raw accelerometer data using trigonometry. This is separate from the acceleration magnitude used for fall detection.

**The math:**

When the MPU6050 is tilted, gravity's 1g force is distributed across the X, Y, and Z axes based on the angle. Using the `atan2()` function, we can calculate the tilt angle around each axis:

```cpp
float angleX = atan2(ax, sqrt(ay * ay + az * az)) * 180.0 / PI;
float angleY = atan2(ay, sqrt(ax * ax + az * az)) * 180.0 / PI;
```

- `angleX` represents the forward/backward tilt (rotation around the X-axis)
- `angleY` represents the left/right tilt (rotation around the Y-axis)

The final tilt angle is the **maximum** of the absolute values of both:

```cpp
float angle = max(abs(angleX), abs(angleY));
```

This gives the worst-case tilt — if the container is tilted 30° forward and 10° to the right, the reported angle is 30°.

**Why atan2?** The `atan2(y, x)` function computes the arc tangent of `y/x` but handles all four quadrants correctly, unlike `atan(y/x)` which cannot distinguish between (1,1) and (-1,-1). It returns a value in radians, which we convert to degrees by multiplying by `180/PI`.

**Interpretation:**
- At rest on a flat surface: angle ≈ 0°
- Tilted 45°: angle ≈ 45° → alert triggers
- Completely on its side: angle ≈ 90°

### 4.5 Acceleration vs Tilt — The Difference

This is an important distinction often asked in vivas:

**Acceleration (fall detection)** uses the **magnitude** of the acceleration vector:
```
magnitude = sqrt(ax² + ay² + az²)
```
At rest, this magnitude is ~1.0g (gravity). A sudden shock or fall causes a spike well above 1.0g. We alert when magnitude exceeds 1.5g.

**Tilt angle** uses **trigonometric decomposition** of the same acceleration vector to determine the angular orientation. Even at rest, if the sensor is tilted, the tilt angle changes — but the magnitude remains ~1.0g.

In other words: acceleration magnitude tells you **how hard** the container was hit; tilt angle tells you **how much** the container is leaning.

### 4.6 LDR Threshold Logic

The LDR detection uses an inverted logic that can be confusing. Here is the complete reasoning:

1. Inside a closed box → dark → LDR resistance HIGH → voltage at GPIO 34 HIGH → ADC reads HIGH (e.g., 3500)
2. Box lid opened → light enters → LDR resistance LOW → voltage drops → ADC reads LOW (e.g., 500)
3. Therefore: `ldrValue < 2000` means "light detected" means "box is open"

The threshold of 2000 was chosen empirically to work under typical indoor lighting conditions. It provides enough margin to avoid false positives from minor light leaks while still detecting a clearly opened lid.

### 4.7 Blynk Communication in Firmware

The firmware communicates with Blynk in three ways:

**1. Sending data (ESP32 → Cloud):**
```cpp
Blynk.virtualWrite(VPIN_TEMP, temperature);
```
This sends the temperature value to pin V0 on the Blynk server. The data is available immediately to any client that queries that pin.

**2. Receiving commands (Cloud → ESP32):**
```cpp
BLYNK_WRITE(VPIN_CTRL) {
    int value = param.asInt();
    systemActive = (value == 1);
}
```
This is a callback function that automatically fires whenever the dashboard writes a new value to pin V8. The `param` object contains the value that was written.

**3. Synchronizing state on reconnect:**
```cpp
BLYNK_CONNECTED() {
    Blynk.syncVirtual(VPIN_CTRL);
    Blynk.syncVirtual(VPIN_MODE);
}
```
When the ESP32 reconnects to Blynk (after a WiFi dropout, for example), it needs to know the current state of the dashboard controls. `syncVirtual()` triggers the corresponding `BLYNK_WRITE()` callback with the last known value, effectively synchronizing the ESP32 with the dashboard.

---

## 5. Map System (Detailed)

The map system is one of the most complex parts of the dashboard. It handles real-time GPS tracking, transport route visualization, ETA calculation, and indicator customization.

### 5.1 Leaflet.js — The Map Library

Leaflet.js is an open-source JavaScript library for interactive maps. It was chosen because:

- **Lightweight:** Only ~42KB gzipped, compared to Google Maps API which requires an API key and has usage limits
- **Free and open-source:** No API key required for basic usage, no cost
- **Highly customizable:** Supports custom markers, polylines, tile layers, and event handlers
- **Mobile-friendly:** Touch gestures, pinch-to-zoom, and responsive design built in

### 5.2 How the Map Is Displayed

The map is initialized in the `initMap()` function of `app.js`:

```javascript
map = L.map('map', {
    center: [19.076, 72.877],  // Default center: Mumbai
    zoom: 14,
    zoomControl: true
});
```

This creates a Leaflet map instance inside the HTML `<div id="map">` element. But the map itself is just an empty container — it needs **tile images** to display the actual geographic content.

### 5.3 How Map Tiles Work

A "tile" is a 256×256 pixel image showing a small portion of the map at a specific zoom level. The entire world map is divided into a grid of tiles. When you pan or zoom the map, Leaflet calculates which tiles are needed and requests them from a tile server.

The project uses OpenStreetMap tiles:

```javascript
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);
```

The URL template `/{z}/{x}/{y}.png` specifies:
- `{z}` — zoom level (0 = entire world on one tile, 19 = individual buildings)
- `{x}` — tile column number
- `{y}` — tile row number
- `{s}` — subdomain (a, b, or c) for load balancing

**Why "Access blocked / Referrer required" may appear:**
OpenStreetMap tile servers check the HTTP `Referer` header to prevent abuse. If a map is loaded from a `file://` URL (opening `index.html` directly from the file system), the browser sends no referrer, and some tile servers may block the request. The solution is to either:
- Serve the page from a local HTTP server (e.g., `python -m http.server`)
- Use the CDN version of Leaflet which handles CORS correctly
- Ensure the `attribution` option is set (some servers check for this)

### 5.4 Markers

The system uses several types of markers:

**GPS Position Marker (Blue Dot or Ambulance):**
This marker shows the current position of the transport vehicle. It is updated every 3 seconds when new GPS data arrives:

```javascript
marker.setLatLng([lat, lng]);
```

The marker can be displayed as either a pulsing blue dot or an ambulance SVG icon. The user can switch between them from the Map Settings panel:

```javascript
function setIndicator(type) {
    const icon = type === 'ambulance' ? ambulanceIcon() : blueDotIcon();
    map.removeLayer(oldMarker);
    const newMarker = L.marker(pos, { icon: icon }).addTo(map);
    window._transport.marker = newMarker;
}
```

The selection is persisted in `localStorage` so it survives page refreshes.

**Route Start Marker (Green Hospital):**
Placed at the donor hospital location. Uses a custom `divIcon` with a hospital icon (Font Awesome).

**Route End Marker (Red Hospital):**
Placed at the recipient hospital location.

### 5.5 Route Generation

The transport route is the line drawn on the map between the start (donor) and destination (recipient) locations. The system supports two methods:

**Method 1: OpenRouteService API (Accurate Route)**
If the user provides an OpenRouteService API key, the system uses it to fetch the actual road route:

```javascript
const url = 'https://api.openrouteservice.org/v2/directions/driving-car'
    + '?api_key=' + orsApiKey
    + '&start=' + startLng + ',' + startLat
    + '&end=' + endLng + ',' + endLat;
```

The API returns a GeoJSON response containing an array of coordinates that trace the actual road path. This is converted into a Leaflet polyline.

**Method 2: Fallback (Straight Line)**
If no API key is provided or the API call fails, the system falls back to drawing a straight line between start and end:

```javascript
routeCoords = [[startLat, startLng], [endLat, endLng]];
```

This straight-line route is displayed with a dashed pattern to indicate it is an approximation. The distance is calculated using the Haversine formula (see below).

### 5.6 Polyline

A polyline is a connected series of line segments drawn on the map. In the GPS tracking context, two polylines are used:

1. **Route Polyline:** Shows the planned route from start to destination (blue line)
2. **GPS Trail Polyline:** Shows the actual path taken by the transport vehicle based on received GPS coordinates

The GPS trail updates every time new coordinates arrive:

```javascript
gpsPath.push([lat, lng]);
polyline.setLatLngs(gpsPath);
```

### 5.7 ETA Calculation

ETA (Estimated Time of Arrival) is calculated by:

1. Finding the nearest point on the route to the current GPS position
2. Calculating the distance already covered along the route
3. Calculating the remaining distance
4. Estimating time based on an assumed average speed of 60 km/h

```javascript
function updateETA(lat, lng) {
    // Find nearest route coordinate
    let minD = Infinity, nearIdx = 0;
    for (let i = 0; i < routeCoords.length; i++) {
        const dd = haversine(lat, lng, routeCoords[i][0], routeCoords[i][1]);
        if (dd < minD) { minD = dd; nearIdx = i; }
    }
    // Calculate covered distance by summing segment lengths
    let covered = 0;
    for (let i = 0; i < nearIdx; i++) {
        covered += haversine(routeCoords[i], routeCoords[i+1]);
    }
    // Progress and remaining
    const pct = covered / totalRouteDist * 100;
    const remain = totalRouteDist - covered;
    const etaMins = Math.round(remain / 60 * 60);
}
```

### 5.8 Distance Calculation (Haversine Formula)

The Haversine formula calculates the great-circle distance between two points on a sphere (Earth). It accounts for the Earth's curvature, unlike simple Euclidean distance which would be inaccurate for geographic coordinates.

```javascript
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;  // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + 
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * 
              Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

### 5.9 Patient vs Doctor Map Behavior

**Doctor:**
- Can access Map Settings (gear icon)
- Can configure transport route (start + destination)
- Must set the route before turning the system ON
- Can modify the route while the system is running (with confirmation dialog)
- Can switch between Blue Dot and Ambulance indicators
- Can enter the OpenRouteService API key for accurate routing

**Patient Family:**
- Cannot access Map Settings
- Cannot modify the route
- Sees the route automatically if the doctor has configured it (via `localStorage` polling)
- The map panel shows all the same visual elements (markers, polyline, info bar)
- A polling mechanism (`startPatientPoller`) checks every 5 seconds for route data in `localStorage`

---

## 6. Dashboard (Frontend Logic)

### 6.1 Application Structure

The dashboard is a single-page application (SPA) split across four files:

| File | Responsibility |
|------|----------------|
| `index.html` | DOM structure — all HTML elements |
| `style.css` | Visual styling — layout, colors, animations |
| `app.js` | Core logic — auth, data fetching, charts, alerts, CSV |
| `transport.js` | Map transport logic — routing, ETA, indicators |

All JavaScript runs inside an IIFE (Immediately Invoked Function Expression) to avoid polluting the global scope:

```javascript
(function() {
    'use strict';
    // All code here
})();
```

The two modules communicate through `window._transport` — a shared object that exposes the map instance, marker reference, and state flags.

### 6.2 Role-Based Login System

The login system uses `localStorage` as its database. When a user signs up, their credentials are stored as:

```javascript
// Key: "email::role" → prevents same email from being used for different roles with different passwords
users["john@example.com::doctor"] = { email: "john@example.com", password: "pass123", role: "doctor" };
```

During sign-in, the system strictly validates the email + role combination:
- If the email exists under a different role, it shows "Invalid role selection for this account"
- If the email doesn't exist at all, it shows "No account found. Please sign up first"
- If the password is wrong, it shows "Incorrect password"

After successful login, the role is stored in `localStorage` and used to apply CSS-based visibility:

```javascript
// In applyRole():
document.body.classList.add('role-patient');  // or 'role-doctor'
```

The CSS rule `body.role-patient .doctor-only { display: none !important; }` hides all doctor-only elements when a patient is logged in.

### 6.3 Data Fetching from Blynk

Every 3 seconds, the `fetchData()` function runs. It has two modes:

**Live mode (Blynk token configured):**
```javascript
[temp, hum, ax, ay, az, lat, lng, ldr, tilt] = await Promise.all([
    blynkGet(pins.temp), blynkGet(pins.hum),
    blynkGet(pins.ax), blynkGet(pins.ay), blynkGet(pins.az),
    blynkGet(pins.lat), blynkGet(pins.lng), blynkGet(pins.ldr),
    blynkGet(pins.tilt)
]);
```

All 9 API calls are made in parallel using `Promise.all()` for maximum speed. Each `blynkGet()` makes an HTTP GET request to the Blynk REST API.

**Demo mode (no token):**
If no Blynk token is configured, the dashboard generates realistic simulated data based on the current temperature mode:

```javascript
const midTemp = (mode.low + mode.high) / 2;
temp = +(midTemp + (Math.random() - 0.5) * range * 1.5).toFixed(1);
```

This means the dashboard is fully functional for demonstrations without any hardware or cloud connection.

### 6.4 Sensor Display

Each sensor has a card in the `sensor-panel` section. When data arrives, the values are simply written to the DOM:

```javascript
dom.valTemp.textContent = temp;
dom.valHum.textContent = hum;
```

The cards also have an `alert-active` CSS class that is toggled on/off based on threshold checks — when active, the card border pulses red.

### 6.5 Chart.js

The temperature and humidity history is displayed using Chart.js — a JavaScript charting library. The chart is configured as a line chart with two datasets:

- **Temperature** — cyan line (`#00c3ff`)
- **Humidity** — green line (`#00e676`)

The chart maintains a rolling window of the last 20 data points. When a new reading arrives, it is pushed to the chart's data array. If the array exceeds 20 points, the oldest element is removed via `shift()`.

```javascript
function updateChart(timestamp, temp, hum) {
    labels.push(timestamp);
    datasets[0].data.push(temp);
    datasets[1].data.push(hum);
    if (labels.length > 20) {
        labels.shift();
        datasets[0].data.shift();
        datasets[1].data.shift();
    }
    sensorChart.update('none');  // 'none' skips animation for performance
}
```

### 6.6 Threshold Gauges

Four SVG-based circular gauges display threshold status:

1. **Temperature** — shows current temperature, color changes from teal (safe) to red (alert)
2. **Box Status** — shows raw LDR value (0–4095)
3. **Tilt Angle** — shows angle in degrees, purple fill turns red above 45°
4. **Acceleration** — shows acceleration magnitude in g

The gauges use SVG circles with `stroke-dashoffset` to create the fill effect:

```javascript
function updateGauge(fillEl, valEl, value, min, max) {
    const pct = (value - min) / (max - min);
    const offset = CIRCUMFERENCE * (1 - pct);
    fillEl.style.strokeDashoffset = offset;
    valEl.textContent = value;
}
```

### 6.7 Real-Time Update Cycle

Every 3 seconds, the following sequence executes:

1. `fetchData()` is called by `setInterval`
2. If system is OFF → return immediately (no updates)
3. Fetch all 9 sensor values from Blynk (or generate demo data)
4. Update all 8 sensor cards with new values
5. Update all 4 threshold gauges
6. Push to history arrays (for CSV)
7. Update Chart.js with temperature and humidity
8. Update map marker with GPS coordinates
9. Check all thresholds and trigger/clear alerts
10. Update timestamp in footer

---

## 7. Alert System

The alert system is multi-layered, operating at both the hardware level (ESP32) and the software level (dashboard).

### 7.1 Alert Conditions

| Alert Type | Condition | Where Checked | Severity |
|-----------|-----------|---------------|----------|
| Temperature | Outside mode-specific range | ESP32 + Dashboard | Critical |
| Acceleration | Magnitude > 1.5g | ESP32 + Dashboard | Critical |
| Tilt Angle | > 45° | ESP32 + Dashboard | Warning |
| Box Tamper | LDR < 2000 | ESP32 + Dashboard | Critical |

### 7.2 ESP32 Alert Behavior

When any alert is triggered in `readAndSendSensors()`, the `alertTriggered` flag is set to `true`. At the end of the function:

```cpp
if (alertTriggered) {
    digitalWrite(LED_ALERT_PIN, HIGH);  // Turn on LED
    triggerAlarmNonBlocking();          // Start buzzer beeping
} else {
    silenceAlarm();                     // Turn off everything
}
```

Additionally, the ESP32 logs events to the Blynk timeline using `Blynk.logEvent()`. This creates a permanent record in the Blynk Console.

### 7.3 Dashboard Alert UI

The dashboard has four layers of visual alerting:

**Layer 1: Red Flash Overlay**
A full-screen semi-transparent red div that pulses using CSS animation:
```css
.red-flash-overlay.active {
    animation: redFlashPulse 0.8s ease-in-out infinite;
}
```
This creates an unmistakable visual indicator that something is wrong, visible even from across the room.

**Layer 2: Dashboard Border Flash**
The `body.alert-flashing` class triggers a CSS animation that makes the entire dashboard border flash red.

**Layer 3: Alert Banner**
A horizontal bar at the top of the dashboard with the alert message text. It can be dismissed by clicking the X button, but it will reappear if the alert condition persists.

**Layer 4: Alert Popup**
A modal dialog with an animated warning icon, the alert title, and the detailed message. It appears once per alert cycle (to avoid annoying repeated popups).

**Layer 5: Route Highlight**
If a transport route is configured, the route polyline changes from blue to red during alerts, providing a map-level visual indicator.

### 7.4 Alert Lifecycle

1. `checkAlerts()` runs every 3 seconds after data fetch
2. Each condition is evaluated independently; multiple alerts can fire simultaneously
3. If any alert fires → activate all visual layers, push "ALERT" to history
4. If no alerts → deactivate all visual layers, push "OK" to history
5. The popup only shows once per alert cycle (tracked by `alertShownForCycle` flag)
6. When conditions return to normal → all visual alerts are automatically cleared

---

## 8. Temperature Modes

### 8.1 Why Three Modes Exist

Different organs require different preservation techniques, each with its own optimal temperature range:

**Cold Storage Mode (2°C – 8°C):**
This is the most common preservation method. The organ is placed in a cold solution (often University of Wisconsin solution or HTK solution) inside a sterile bag, then packed in ice inside an insulated container. The cold temperature slows cellular metabolism, reducing oxygen demand and extending the viable preservation time. This mode is used for kidneys (can last 24–36 hours), liver (12–18 hours), and pancreas.

**Perfusion Mode (20°C – 37°C):**
Machine perfusion is a newer technique where the organ is connected to a pump that continuously flows warm, oxygenated, nutrient-rich solution through its blood vessels. This allows the organ to maintain near-normal metabolic function during transport. The temperature must stay in the 20–37°C range to support cellular processes. This technique is used for hearts and lungs and can significantly extend preservation time while also allowing doctors to assess organ viability.

**Demo Mode (25°C – 30°C):**
This mode uses room temperature range, making it ideal for project demonstrations and testing. A student can easily trigger temperature alerts by holding the DHT22 sensor (body heat raises the temperature above 30°C) or blowing on it (breath moisture affects humidity).

### 8.2 Dynamic Threshold Mechanism

When the doctor selects a mode on the dashboard:

1. Dashboard calls `blynkSet(pins.mode, modeBlynkValue)` — sends 0, 1, or 2 to V9
2. ESP32's `BLYNK_WRITE(VPIN_MODE)` callback fires
3. `applyMode(modeValue)` validates the value and updates `TEMP_LOW` and `TEMP_HIGH`
4. The **very next** sensor reading uses the new thresholds — no restart required
5. Simultaneously, the dashboard updates its own `thresholds.tempLow` and `thresholds.tempHigh`

This means both the ESP32 and the dashboard switch thresholds atomically — there is no window where one side uses old thresholds while the other uses new ones.

---

## 9. Data Handling

### 9.1 History Storage

The dashboard maintains an in-memory JavaScript object called `history` with arrays for each data point:

```javascript
const history = {
    timestamps: [], temp: [], hum: [],
    ax: [], ay: [], az: [], tilt: [],
    lat: [], lng: [], ldr: [],
    boxStatus: [], alertStatus: []
};
```

Every time `fetchData()` runs, all values are pushed to their respective arrays. The arrays are trimmed to a maximum of 1000 entries using:

```javascript
if (history.timestamps.length > MAX_HISTORY) {
    Object.keys(history).forEach(k => history[k].shift());
}
```

This means the dashboard retains approximately the last 50 minutes of data (1000 readings × 3 seconds = 3000 seconds ≈ 50 minutes).

### 9.2 CSV Export

The Doctor role has a CSV download button in the header. When clicked, it generates a CSV file from the history arrays:

```javascript
const headers = ['Timestamp', 'Temperature(°C)', 'Humidity(%)', 
                 'AccX(g)', 'AccY(g)', 'AccZ(g)', 'Angle(°)',
                 'Latitude', 'Longitude', 'LDR', 'Alert'];
```

Up to 1000 records are exported. The CSV is created as a Blob, a download URL is generated using `URL.createObjectURL()`, and a temporary `<a>` element is used to trigger the download.

The filename includes the current date and time: `organ_data_2026-04-11_18-30.csv`

### 9.3 Timestamp Format

Timestamps are formatted as `YYYY-MM-DD HH:MM:SS` for Excel compatibility. This prevents the `########` display issue that occurs when Excel auto-interprets date formats:

```javascript
const ts = now.getFullYear() + '-' + pad2(now.getMonth()+1) + '-' + pad2(now.getDate())
         + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
```

---

## 10. UI Design Logic

### 10.1 Design Philosophy

The dashboard uses a **medical-grade dark theme** designed to convey professionalism and urgency appropriate for a healthcare monitoring system. The design language draws from hospital monitoring equipment and premium dashboard UIs.

### 10.2 Layout Structure

The layout is organized in a clear visual hierarchy:

```
┌─────────────────────────────────────────────────┐
│ HEADER (Logo, Live Badge, Controls, User Badge) │
├─────────────────────────────────────────────────┤
│ ALERT BANNER (shown only during alerts)         │
├─────────────────────────────────────────────────┤
│ SENSOR CARDS (8 cards in horizontal row)        │
├───────────────────────┬─────────────────────────┤
│ LEFT COLUMN           │ RIGHT COLUMN (360px)    │
│ ┌───────────────────┐ │ ┌─────────────────────┐ │
│ │ CHART (300px h)   │ │ │ System Control      │ │
│ └───────────────────┘ │ ├─────────────────────┤ │
│ ┌───────────────────┐ │ │ Temperature Mode    │ │
│ │ MAP (flex grow)   │ │ ├─────────────────────┤ │
│ │                   │ │ │ Threshold Gauges    │ │
│ │                   │ │ │ (2×2 grid)          │ │
│ └───────────────────┘ │ ├─────────────────────┤ │
│                       │ │ Sensor Status       │ │
│                       │ └─────────────────────┘ │
├───────────────────────┴─────────────────────────┤
│ FOOTER (Last Updated timestamp)                 │
└─────────────────────────────────────────────────┘
```

The main grid uses `grid-template-columns: 1fr 360px`, giving the left column (chart + map) most of the space while the right column maintains a fixed width for controls.

### 10.3 Color System

| Color Variable | Hex Value | Usage |
|---------------|-----------|-------|
| `--teal` | `#00c3ff` | Primary accent — links, icons, active states |
| `--green` | `#00e676` | Success — working status, system ON |
| `--red` | `#ff3d5a` | Danger — alerts, errors, LIVE badge |
| `--orange` | `#ffab40` | Warning — acceleration gauge |
| `--bg-primary` | `#0b1c2c` | Page background |
| `--bg-card` | `#0f2744` | Card/panel background |
| `--text-muted` | `#8ea4bf` | Secondary text |

### 10.4 Glassmorphism

Glassmorphism is a modern UI design trend characterized by:
- Semi-transparent backgrounds (`rgba(15,39,68,.65)`)
- Background blur (`backdrop-filter: blur(24px)`)
- Subtle borders (`border: 1px solid rgba(0,195,255,.12)`)
- Drop shadows for depth

It is primarily used on the login card and the dashboard header. The effect creates a feeling of depth and sophistication, making the interface feel like a premium, high-end application rather than a basic web page.

### 10.5 Light Theme

The dashboard supports a light theme toggled by the moon/sun button. The light theme overrides CSS custom properties:

```css
[data-theme="light"] {
    --bg-primary: #eef2f7;
    --bg-card: #ffffff;
    --white: #1a2332;      /* Note: text color inverts */
    --text-muted: #6b7c93;
    --border: rgba(0,50,100,.1);
}
```

The theme preference is persisted in `localStorage` and applied on page load.

### 10.6 Responsive Design

The layout adapts to different screen sizes. On mobile devices, the sensor cards become horizontally scrollable (using `overflow-x: auto` on the `.sensor-panel`), and the main grid collapses to a single column. The map can be expanded to fullscreen mode using the expand button in the map panel header.

### 10.7 Animations

The dashboard uses several types of animations for a polished feel:

- **Card entry** — panels slide upward and fade in on load (`cardEntry` keyframe)
- **Live badge pulse** — the LIVE indicator pulses in opacity (`livePulse`)
- **Heartbeat** — the loading screen heart icon mimics a heartbeat (`heartbeat`)
- **Gauge fill** — SVG circles animate their `stroke-dashoffset` with a 1-second transition
- **Alert card pulse** — sensor cards in alert state have a pulsing red border (`cardAlert`)
- **Hover effects** — cards lift slightly on hover (`translateY(-3px)`) with a shadow increase
- **Float animation** — login background shapes gently float up and down

All animations use `cubic-bezier(.4,0,.2,1)` easing for smooth, natural motion.

---

## 11. Limitations & Edge Cases

### 11.1 Sensor Noise

**LDR:** The analog reading from the LDR can fluctuate due to electrical noise on the ADC pin, temperature changes in the LDR itself, or minor light leaks in the container. The 3-reading average mitigates most of this, but in extreme cases (e.g., flickering fluorescent lights), false alarms are possible.

**MPU6050:** The accelerometer has inherent noise in its readings, typically ±0.01g. This noise can cause small fluctuations in the tilt angle (±1°). For the 45° threshold this is not a problem, but if the container is resting at exactly 45°, the reading may oscillate around the threshold, causing intermittent alert toggling.

**DHT22:** The sensor has a ±0.5°C accuracy. Near mode boundaries (e.g., a reading of 8.3°C in Cold Storage mode with a high threshold of 8°C), this accuracy limit could cause false positives. The sensor also requires 2 seconds between reads and occasionally returns `NaN` if the timing protocol is disrupted by interrupt activity.

### 11.2 GPS Inaccuracies

- **Cold start time:** When the GPS module is first powered on, it can take 30–60 seconds to acquire satellite signals and calculate a position (known as "cold start"). During this time, `gps.location.isValid()` returns false, and the dashboard shows the last known position (or 0,0 if never fixed).

- **Indoor accuracy:** GPS signals are significantly attenuated by buildings. Inside a building, the GPS accuracy can degrade from 2.5 meters to 50+ meters, or the GPS may lose fix entirely. This is generally not a problem for the intended use case (organ transport in a vehicle), but it affects testing and demonstrations.

- **Multipath errors:** In urban areas with tall buildings, GPS signals can bounce off surfaces before reaching the receiver, causing position errors of 5–20 meters.

### 11.3 Internet Dependency

The system requires an active internet connection at both ends:

- **ESP32 side:** Needs WiFi to communicate with Blynk. If WiFi drops, the ESP32 will continue reading sensors and triggering local alerts (buzzer + LED), but data will not reach the dashboard. The Blynk library automatically attempts reconnection.

- **Dashboard side:** Needs internet to query the Blynk REST API. If the user's internet drops, `fetchData()` will fail silently and the dashboard will freeze on the last known values. The refresh interval continues running, so data will resume when connectivity is restored.

There is no offline caching or local-first architecture — the system is fully cloud-dependent for the Blynk → Dashboard communication path.

### 11.4 Blynk API Rate Limits

The free Blynk tier has rate limits. Making 9 API calls every 3 seconds (112 calls per minute) is within the typical free tier allowance, but if multiple dashboard instances are open simultaneously, the combined call rate could exceed limits, resulting in HTTP 429 (Too Many Requests) errors.

### 11.5 localStorage Limitations

User accounts, route data, and configuration are stored in `localStorage`. This data:

- Is browser-specific — logging in on Chrome does not carry over to Firefox
- Can be cleared by the user or browser cleanup tools
- Has a size limit of ~5MB per domain
- Is not encrypted — credentials are stored in plain text (acceptable for a project demo but not for production)

### 11.6 Single Device Support

The current system supports only one ESP32 device (one transport at a time). Multiple simultaneous transports would require multiple Blynk auth tokens and a mechanism to switch between them on the dashboard.

---

## 12. Future Improvements

### 12.1 AI-Based Anomaly Detection

Machine learning models could be trained on historical sensor data to predict failures before they occur. For example, a gradually rising temperature trend could trigger a warning before the temperature actually exceeds the threshold, giving the medical team time to intervene.

### 12.2 Better Sensors

- **Medical-grade temperature sensors** (PT100 RTD) with ±0.1°C accuracy for critical organ transports
- **Sealed pressure sensors** to monitor container atmosphere integrity
- **Blood gas sensors** (pO2, pCO2) for machine perfusion systems
- **Vibration sensors** with higher sensitivity for detecting subtle road-induced vibrations

### 12.3 Mobile Application

A dedicated React Native or Flutter mobile app would provide:
- Push notifications when alerts trigger (currently not possible with a web-only dashboard)
- Offline capability with local data caching
- Native GPS access for the transport device's phone as a backup GPS source
- Camera integration for documenting the transport process

### 12.4 GSM/4G Fallback

Adding a SIM800L or SIM7600 GSM module to the ESP32 would provide cellular connectivity as a fallback when WiFi is unavailable (e.g., during highway transport between cities).

### 12.5 Battery Monitoring

Adding a voltage divider to the ESP32's ADC to monitor the power bank's battery level would alert the team if the power supply is running low during transport.

### 12.6 Multi-Organ Tracking

A fleet management view that shows multiple active transports on a single dashboard, each with its own sensor data, route, and status.

### 12.7 SMS/Email Alerts

Integration with Twilio (SMS) or SendGrid (email) to send alert notifications directly to registered medical professionals' phones, regardless of whether they have the dashboard open.

### 12.8 Blockchain Audit Trail

Storing sensor readings on a blockchain would create an immutable, tamper-proof record of transport conditions. This could be important for medicolegal purposes — proving that the organ was maintained within specifications throughout transport.

### 12.9 Secure Authentication

Replacing `localStorage`-based authentication with a proper authentication system (Firebase Auth, JWT tokens) for production deployment.

### 12.10 Data Visualization Enhancements

- 3D route visualization with elevation data
- Heatmaps showing temperature distribution over time
- Statistical analysis dashboards for completed transports

---

## Glossary of Key Terms

| Term | Meaning |
|------|---------|
| **ADC** | Analog-to-Digital Converter — converts analog voltage to digital number |
| **MEMS** | Micro-Electromechanical Systems — microscopic mechanical structures on a silicon chip |
| **NMEA** | National Marine Electronics Association — standard format for GPS data sentences |
| **I2C** | Inter-Integrated Circuit — two-wire serial communication protocol |
| **UART** | Universal Asynchronous Receiver/Transmitter — serial communication interface |
| **GPIO** | General Purpose Input/Output — configurable digital pins on a microcontroller |
| **SPA** | Single Page Application — web app that loads once and updates dynamically |
| **REST API** | Representational State Transfer API — HTTP-based data access interface |
| **Haversine** | Formula for calculating great-circle distance on a sphere |
| **Glassmorphism** | UI design trend using frosted glass effects |
| **IIFE** | Immediately Invoked Function Expression — JavaScript pattern for scope isolation |
| **Virtual Pin** | Blynk abstraction for a data channel between device and cloud |
| **Polyline** | Connected series of line segments drawn on a map |
| **Tile** | Small image (256×256px) showing a portion of a map at a specific zoom level |

---

> **This document covers the complete Organ Transportation Monitoring System from hardware to software to cloud. Every component, every function, and every design decision is explained. After reading this, you should be able to answer any question about the project — from "Why did you use GPIO 34 for the LDR?" to "How does the tilt angle calculation work?" to "What happens when the WiFi drops mid-transport?"**
