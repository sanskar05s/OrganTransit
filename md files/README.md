# 🏥 Organ Transportation – Real-Time Monitoring System

> **A complete IoT-based system for real-time monitoring of organ transport conditions using ESP32, multiple sensors, Blynk IoT cloud, and a professional web dashboard.**

---

## 📋 Abstract

This project presents a **real-time organ transportation monitoring system** designed to ensure the safe transport of organs from donor to recipient. The system uses an **ESP32 microcontroller** connected to multiple sensors (DHT22, MPU6050, NEO-6M GPS, LDR) to continuously monitor critical parameters such as **temperature, humidity, acceleration/vibration, GPS location, and container integrity**. 

Data is transmitted to the **Blynk IoT cloud** and displayed on a **premium web dashboard** with real-time charts, live GPS tracking, threshold-based alerts, and role-based access control. The system supports **three temperature modes** (Cold Storage, Perfusion, Demo) with dynamic threshold adjustment, making it adaptable for different organ preservation methods.

---

## ✨ Features

### Hardware
- 🌡️ **Temperature & Humidity Monitoring** — DHT22 sensor for precise readings
- 📐 **Tilt Angle Monitoring** — MPU6050 multi-axis tilt calculation (45° threshold)
- 📐 **Fall / Shock Detection** — Acceleration magnitude threshold (1.5g)
- 📍 **Live GPS Tracking** — NEO-6M GPS module with route history
- 📦 **Box Tamper Detection** — LDR sensor detects lid opening (~2000 ADC threshold)
- 🔊 **Audio & Visual Alerts** — Buzzer + LED for immediate warnings
- ⚡ **Non-blocking Operation** — millis()-based timing, no delay() calls

### Software / Dashboard
- 🔐 **Authentication System** — Email/password with Sign Up & Sign In
- 👥 **Role-Based Access** — Doctor (full access) vs Patient Family (limited view)
- 🌡️ **3 Temperature Modes** — Cold Storage (2–8°C), Perfusion (20–37°C), Demo (25–30°C)
- 🔘 **System ON/OFF Control** — Completely stops all sensors, data, and alerts when OFF
- 📈 **Real-time Charts** — Chart.js with last 20 readings
- 🗺️ **Live GPS Map** — Leaflet.js with route polyline, fullscreen, and configurable indicator
- 🗺️ **Transport Route System** — Start/destination markers, ETA, distance, and progress tracking
- 🚨 **Multi-level Alert System** — Red flash overlay + banner + popup (Temp, Accel, Tilt, LDR)
- 📁 **CSV Data Export** — Up to ~1000 readings with auto-timestamped filename
- 🌗 **Dark/Light Theme** — Toggle between themes
- ⚙️ **Configurable Settings** — Blynk token & pin mappings via modal
- 📱 **Fully Responsive** — Works on desktop, tablet, and mobile

---

## 🔧 Hardware Required

| Component | Quantity | Purpose |
|-----------|----------|---------|
| ESP32 DevKit V1 | 1 | Main microcontroller |
| DHT22 Sensor | 1 | Temperature & Humidity |
| MPU6050 Module | 1 | Accelerometer (tilt/fall) |
| NEO-6M GPS Module | 1 | Location tracking |
| LDR (Light Dependent Resistor) | 1 | Box open/tamper detection |
| 10kΩ Resistor | 1 | LDR voltage divider |
| Active Buzzer | 1 | Audio alerts |
| LED | 1 | Visual alerts (or use onboard LED) |
| Breadboard & Jumper Wires | — | Connections |
| USB Cable (Micro-B) | 1 | Programming & Power |
| Power Bank (5V) | 1 | Portable power supply |

---

## 💻 Software Used

| Software | Purpose |
|----------|---------|
| Arduino IDE (2.x) | ESP32 firmware development |
| Blynk IoT Platform | Cloud data hosting & API |
| VS Code / Any Browser | Web dashboard |
| Chart.js 4.x | Real-time graphs |
| Leaflet.js 1.9 | GPS map rendering |
| OpenStreetMap | Map tiles |

### Arduino Libraries
| Library | Author | Install via |
|---------|--------|-------------|
| Blynk | Volodymyr Shymanskyy | Library Manager |
| DHT sensor library | Adafruit | Library Manager |
| Adafruit Unified Sensor | Adafruit | Library Manager |
| Adafruit MPU6050 | Adafruit | Library Manager |
| TinyGPSPlus | Mikal Hart | Library Manager |
| Wire | Built-in | — |

---

## 🔌 Circuit Connections

### ESP32 Pin Mapping

```
┌───────────────────────────────────────────────────────────┐
│                   ESP32 DevKit V1                         │
├───────────┬────────────┬──────────────────────────────────┤
│ Component │ ESP32 Pin  │ Notes                            │
├───────────┼────────────┼──────────────────────────────────┤
│ DHT22     │ GPIO 4     │ Data pin (pull-up recommended)   │
│ DHT22     │ 3.3V       │ VCC                              │
│ DHT22     │ GND        │ Ground                           │
├───────────┼────────────┼──────────────────────────────────┤
│ MPU6050   │ GPIO 21    │ SDA (I2C)                        │
│ MPU6050   │ GPIO 22    │ SCL (I2C)                        │
│ MPU6050   │ 3.3V       │ VCC                              │
│ MPU6050   │ GND        │ Ground                           │
├───────────┼────────────┼──────────────────────────────────┤
│ NEO-6M    │ GPIO 16    │ GPS TX → ESP32 RX2               │
│ NEO-6M    │ GPIO 17    │ GPS RX → ESP32 TX2               │
│ NEO-6M    │ 3.3V       │ VCC                              │
│ NEO-6M    │ GND        │ Ground                           │
├───────────┼────────────┼──────────────────────────────────┤
│ LDR       │ GPIO 34    │ Analog input (with 10kΩ divider) │
│ LDR       │ 3.3V       │ One leg to VCC                   │
│ 10kΩ      │ GND        │ Other leg to GND (voltage div)   │
├───────────┼────────────┼──────────────────────────────────┤
│ Buzzer    │ GPIO 25    │ Signal pin                       │
│ Buzzer    │ GND        │ Ground                           │
├───────────┼────────────┼──────────────────────────────────┤
│ LED       │ GPIO 2     │ Onboard LED (or external)        │
└───────────┴────────────┴──────────────────────────────────┘
```

### LDR Voltage Divider Circuit
```
    3.3V ─── [LDR] ──┬── GPIO 34 (Analog)
                      │
                     [10kΩ]
                      │
                     GND
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SYSTEM ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │
│   │  DHT22   │    │ MPU6050  │    │ NEO-6M   │    │   LDR    │    │
│   │ Temp/Hum │    │  Accel   │    │   GPS    │    │  Light   │    │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘    │
│        │               │               │               │          │
│        └───────────────┴───────┬───────┴───────────────┘          │
│                                │                                   │
│                    ┌───────────┴───────────┐                      │
│                    │      ESP32 DevKit     │                      │
│                    │   (Firmware + Logic)  │                      │
│                    └───────────┬───────────┘                      │
│                                │                                   │
│                          WiFi  │                                   │
│                                │                                   │
│                    ┌───────────┴───────────┐                      │
│                    │   Blynk IoT Cloud     │                      │
│                    │  (Data Store + API)   │                      │
│                    └───────────┬───────────┘                      │
│                                │                                   │
│                       HTTP REST API                                │
│                                │                                   │
│                    ┌───────────┴───────────┐                      │
│                    │    Web Dashboard      │                      │
│                    │ (HTML + CSS + JS)     │                      │
│                    │                       │                      │
│                    │  📊 Charts            │                      │
│                    │  🗺️ GPS Map           │                      │
│                    │  🚨 Alert System      │                      │
│                    │  📁 CSV Export        │                      │
│                    └───────────────────────┘                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🆕 Recent Changes & Enhancements

### ✨ New Features

#### Tilt Angle Monitoring
- **Real-time tilt angle** computed from MPU6050 accelerometer using multi-axis (`atan2`) calculation
- Separate from acceleration/fall detection logic — provides a dedicated angular reading
- **Threshold-based alert** triggers when tilt exceeds **45°**
- Transmitted to Blynk via **Virtual Pin V10**
- Displayed as a dedicated sensor card and gauge on the dashboard

#### Improved Map System
- **Patient Family view** now correctly shows:
  - Start location marker (Donor Hospital)
  - Destination marker (Recipient Hospital)
  - Route polyline between locations
- Fixed route visibility issues with polling-based fallback for patient role
- Map auto-resizes and re-fits bounds after route drawing

#### Map Indicator Selection
- Switch between **Blue Dot** and **Ambulance** icon for the live GPS marker
- Selection is **persistent** across sessions (saved to `localStorage`)
- Accessible from the Map Settings panel (gear icon on map)

---

### 🛠️ Bug Fixes

| # | Bug | Resolution |
|---|-----|------------|
| 1 | Patient map not showing route and markers | Added `startPatientPoller()` with retry logic; route now auto-draws when data is available |
| 2 | Indicator icon not switching properly | Rewrote `setIndicator()` to fully remove old marker and create new one, syncing `window._transport.marker` |
| 3 | LDR threshold mismatch between firmware and dashboard | Unified to `~2000` ADC; firmware uses `ldrValue < LDR_THRESHOLD` (box OPEN = light detected) |
| 4 | Threshold UI overflow issue | Restructured gauge panel to 2×2 grid layout with proper spacing |
| 5 | CSV export limited to 100 entries | Increased `MAX_HISTORY` to `1000` and updated export loop to use up to 1000 records |
| 6 | CSV timestamp showing `########` in Excel | Changed format to `YYYY-MM-DD HH:MM:SS` for full Excel compatibility |
| 7 | Role-based login not strict | Sign-in now validates email + role combination (keyed by `email::role`) |

---

### ⚙️ System Improvements

- **CSV export capacity** increased from 100 to **~1000 records**
- **Dashboard layout alignment** improved for chart and map panels
- **Stable LDR detection logic** — 3-reading average for noise reduction, updated threshold to ~2000
- **Map rendering and resizing** — `invalidateSize()` called after route draw and fullscreen toggle
- **Transport Info Bar** — Shows distance, ETA, and progress percentage (visible to all roles)
- **Non-blocking buzzer** — millis()-based toggling, no `delay()` calls

---

## ⚙️ Working Principle

1. **Sensors read data** every 3 seconds via ESP32's timer interrupt
2. **ESP32 processes** readings and checks against dynamic thresholds
3. **Data is sent** to Blynk IoT cloud via virtual pins (V0–V10)
4. **Alerts trigger** if temperature, acceleration, tilt angle, or LDR exceeds safe limits
5. **Non-blocking buzzer** sounds using millis()-based timing (no delay)
6. **Web dashboard** fetches data via Blynk HTTP REST API every 3 seconds
7. **Dashboard renders** sensor cards, charts, GPS map, and alerts in real-time
8. **Doctor** can change temperature mode, which sends new mode to ESP32 via V9
9. **ESP32 immediately** updates its threshold values when mode changes
10. **System ON/OFF** control allows Doctor to completely halt all operations
11. **Tilt angle** is computed from multi-axis accelerometer data and sent via V10

---

## 🔘 System Control (ON/OFF) Behavior

The system implements **strict ON/OFF control** via the dashboard toggle (Doctor only).

### When System = OFF

#### ESP32 Behavior:
| Component | Behavior |
|-----------|----------|
| DHT22 | ❌ NOT read — `readAndSendSensors()` returns immediately |
| MPU6050 | ❌ NOT read — skipped entirely |
| GPS | ❌ NOT processed — serial buffer is drained but data discarded |
| LDR | ❌ NOT read — no analog input |
| Blynk Data | ❌ NOT sent — no `virtualWrite()` calls |
| Alerts | ❌ NOT triggered — no threshold checks |
| Buzzer | ❌ OFF — `silenceAlarm()` called immediately |
| LED | ❌ OFF — `digitalWrite(LED_ALERT_PIN, LOW)` |
| `loop()` | ✅ Still runs — `Blynk.run()` and `timer.run()` remain active |
| Control Reception | ✅ Still works — can receive ON command from dashboard |

#### Dashboard Behavior:
| Component | Behavior |
|-----------|----------|
| Sensor Cards | Dimmed (40% opacity, grayscale) showing "OFF" |
| Live Data Fetch | ❌ Paused — `fetchData()` returns immediately |
| Chart Updates | ❌ Paused — no new data points added |
| Map Updates | ❌ Paused — marker stays at last known position |
| Alerts | ❌ All cleared — banner hidden, popup hidden, red flash stopped |
| Gauges | Show "OFF" text |
| Sensor Status | All marked as "Not Working" (red dots) |
| Footer | Shows "System OFF" |

### When System = ON

- All sensors **resume reading** immediately
- Data is **sent to Blynk** normally
- Alerts are **re-enabled** with threshold checking
- Dashboard **sensor cards un-dim** and show live values
- Chart and map **resume updating**
- Footer shows **"Resuming…"** then updates with next timestamp

### Implementation Details

**ESP32 (`organ_transport_esp32.ino`):**
```cpp
// Boolean flag controlled by Blynk V8
bool systemActive = true;

// In readAndSendSensors():
if (!systemActive) {
    Serial.println("[INFO] System is OFF — skipping sensor read.");
    return;  // Skip ALL sensor operations
}

// In loop():
if (systemActive) {
    readGPS();        // Process GPS normally
} else {
    drainGPSBuffer(); // Drain but discard GPS data
}
```

**Dashboard (`app.js`):**
```javascript
// In fetchData():
if (!systemOn) {
    return;  // Do absolutely nothing
}

// On toggle OFF:
applySystemOffState();  // Dim UI, clear alerts, show "OFF"

// On toggle ON:
applySystemOnState();   // Restore UI, resume updates
```

---

## 🌡️ Temperature Modes Explained

The system supports **three temperature modes** to accommodate different organ preservation techniques:

### ❄️ Cold Storage Mode (2°C – 8°C)
- **Default mode** for most organ transports
- Organs are stored in ice/cold solution
- Used for: Kidneys, Liver, Pancreas
- Typical preservation time: 12–36 hours

### 🌡️ Perfusion Mode (20°C – 37°C)
- Used with **machine perfusion** systems
- Organs are continuously perfused with warm oxygenated solution
- Used for: Heart, Lungs (normothermic perfusion)
- Allows extended preservation and organ assessment

### 🧪 Demo Mode (25°C – 30°C)
- **Testing and demonstration** mode
- Uses room temperature range
- Ideal for: Project presentations, testing without cold chamber
- Easy to trigger alerts by holding/breathing on sensor

### How Mode Switching Works
1. Doctor selects mode on the dashboard
2. Dashboard sends mode value (0/1/2) to Blynk pin V9
3. ESP32 receives new mode via `BLYNK_WRITE(VPIN_MODE)`
4. `TEMP_LOW` and `TEMP_HIGH` update **immediately**
5. Next sensor reading uses the new thresholds
6. Dashboard threshold indicators update simultaneously

---

## 📊 Dashboard Explanation

### Login Screen
- Email + Password authentication
- Role selection: Doctor / Patient Family
- Sign Up / Sign In toggle
- Glassmorphism card with animated background shapes

### Loading Screen
- 3-step animated initialization sequence
- Progress bar with smooth transitions
- Heartbeat icon animation

### Main Dashboard

#### Sensor Card Layout

```
Temperature | Humidity | AccX | AccY | AccZ | Tilt Angle | Latitude | Longitude
```

All 8 sensor cards are displayed in a responsive row at the top of the dashboard.

#### Role-Based Feature Matrix

| Section | Doctor | Patient Family |
|---------|--------|----------------|
| Sensor Cards | ✅ | ✅ |
| Temperature Chart | ✅ | ✅ |
| GPS Map + Route | ✅ | ✅ |
| Transport Info (ETA / Distance) | ✅ | ✅ |
| Threshold Gauges (2×2 Grid) | ✅ | ✅ |
| System Control (ON/OFF) | ✅ | ❌ |
| Temperature Mode | ✅ | ❌ |
| Map Settings / Indicator | ✅ | ❌ |
| Route Configuration | ✅ | ❌ |
| Settings (Blynk Config) | ✅ | ❌ |
| CSV Download | ✅ | ❌ |
| Sensor Status | ✅ | ❌ |

#### Threshold Gauges Panel (2×2 Grid)

```
┌──────────────────┬──────────────────┐
│   Temperature    │    Box Status    │
│    (°C gauge)    │   (LDR gauge)    │
├──────────────────┼──────────────────┤
│   Tilt Angle     │  Acceleration    │
│    (° gauge)     │    (g gauge)     │
└──────────────────┴──────────────────┘
```

- **Temperature gauge** — changes color (teal → red) based on mode thresholds
- **Box Status gauge** — LDR value (0–4095)
- **Tilt Angle gauge** — purple fill, red when > 45°
- **Acceleration gauge** — magnitude in g (orange fill)

### 🚨 Alert System (Works for Both Roles)

#### Alert Types

| Alert | Condition | Source |
|-------|-----------|--------|
| Temperature | Outside mode-specific range | DHT22 |
| Acceleration | Magnitude > 1.5g | MPU6050 |
| **Tilt Angle** | > 45° | MPU6050 (computed) |
| Box Tamper | LDR < 2000 (light detected) | LDR |

#### Alert Mechanisms
1. **Red Flash Overlay** — Full-screen pulsing red glow
2. **Animated Border** — Dashboard border flashes red
3. **Alert Banner** — Top bar with alert message
4. **Popup Dialog** — Modal with alert details + dismiss button
5. **Route Highlight** — Route polyline turns red during alerts

---

## 🚀 Setup Steps

### Step 1: Install Arduino IDE
1. Download Arduino IDE from [arduino.cc](https://www.arduino.cc/en/software)
2. Install **ESP32 board support**:
   - Go to `File → Preferences`
   - Add to Board Manager URLs:
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Go to `Tools → Board → Board Manager`
   - Search "ESP32" and install **esp32 by Espressif Systems**

### Step 2: Install Arduino Libraries
Open `Sketch → Include Library → Manage Libraries` and install:
1. **Blynk** by Volodymyr Shymanskyy
2. **DHT sensor library** by Adafruit
3. **Adafruit Unified Sensor** by Adafruit
4. **Adafruit MPU6050** by Adafruit
5. **TinyGPSPlus** by Mikal Hart

### Step 3: Setup Blynk IoT
1. Go to [blynk.cloud](https://blynk.cloud) and create an account
2. Create a **New Template**:
   - Name: `Organ Transport`
   - Hardware: ESP32
   - Connection: WiFi
3. Add **Datastreams** (Virtual Pins):

   | Pin | Name | Data Type | Min | Max |
   |-----|------|-----------|-----|-----|
   | V0 | Temperature | Double | -40 | 80 |
   | V1 | Humidity | Double | 0 | 100 |
   | V2 | Accel X | Double | -5 | 5 |
   | V3 | Accel Y | Double | -5 | 5 |
   | V4 | Accel Z | Double | -5 | 5 |
   | V5 | Latitude | Double | -90 | 90 |
   | V6 | Longitude | Double | -180 | 180 |
   | V7 | LDR | Integer | 0 | 4095 |
   | V8 | System Control | Integer | 0 | 1 |
   | V9 | Temp Mode | Integer | 0 | 2 |
   | V10 | Tilt Angle | Double | 0 | 90 |

4. Create a **Device** from the template
5. Copy the **Auth Token**, **Template ID**, and **Template Name**

### Step 4: Upload ESP32 Code
1. Open `organ_transport_esp32/organ_transport_esp32.ino` in Arduino IDE
2. Replace the placeholders:
   ```cpp
   #define BLYNK_TEMPLATE_ID   "YOUR_TEMPLATE_ID"
   #define BLYNK_AUTH_TOKEN     "YOUR_AUTH_TOKEN"
   char ssid[] = "YOUR_WIFI_SSID";
   char pass[] = "YOUR_WIFI_PASSWORD";
   ```
3. Select Board: `Tools → Board → ESP32 Dev Module`
4. Select Port: `Tools → Port → COMx`
5. Click **Upload** ▶️
6. Open Serial Monitor (115200 baud) to verify

### Step 5: Run the Dashboard
1. Open `index.html` in any modern web browser
2. Click the **Settings** gear icon (⚙️)
3. Paste your **Blynk Auth Token**
4. Verify pin mappings (default: V0–V10)
5. Click **Save Configuration**
6. The dashboard will start fetching live data!

### Step 6: Test Without Hardware
- If no Blynk token is configured, the dashboard runs in **demo mode**
- Simulated sensor data is generated automatically
- All features work — charts, map, alerts, CSV export
- Switch temperature modes to see threshold changes

---

## 📁 CSV Export Format

The CSV export (Doctor only) includes up to **~1000 records** with the following columns:

| Column | Description |
|--------|-------------|
| Timestamp | `YYYY-MM-DD HH:MM:SS` (Excel-compatible) |
| Temperature (°C) | DHT22 reading |
| Humidity (%) | DHT22 reading |
| AccX (g) | MPU6050 X-axis |
| AccY (g) | MPU6050 Y-axis |
| AccZ (g) | MPU6050 Z-axis |
| Tilt Angle (°) | Computed from accelerometer |
| Latitude | GPS coordinate |
| Longitude | GPS coordinate |
| LDR | Raw ADC value (0–4095) |
| Alert Status | `OK` or `ALERT` |

Filename format: `organ_data_YYYY-MM-DD_HH-MM.csv`

---

## 📊 Results

When the system is operational:

- ✅ **Temperature & Humidity** update every 3 seconds
- ✅ **GPS position** updates with route tracking on map
- ✅ **Tilt angle** computed and displayed in real-time
- ✅ **Acceleration** values detect falls/shocks above 1.5g
- ✅ **Box status** detects lid opening via LDR (< 2000 ADC)
- ✅ **Alerts** trigger with red flash, banner, popup, and route highlight
- ✅ **Mode switching** updates thresholds instantly (ESP32 + Dashboard)
- ✅ **System OFF** completely stops all sensors, data, and alerts
- ✅ **System ON** resumes all operations cleanly
- ✅ **CSV export** downloads up to ~1000 readings
- ✅ **Patient map** correctly shows route, start/end markers
- ✅ **Indicator selection** persists across sessions
- ✅ **Responsive** design works across all screen sizes

---

## 🔮 Future Scope

1. **Mobile App** — React Native app for on-the-go monitoring
2. **GSM/4G Backup** — Fallback connectivity when WiFi unavailable
3. **Battery Monitoring** — Track power levels of transport device
4. **Blood Gas Sensor** — Monitor pO2, pCO2 for perfusion systems
5. **Machine Learning** — Predictive alerts based on sensor trends
6. **Blockchain Audit** — Immutable transport condition log
7. **Multi-organ Tracking** — Support multiple containers simultaneously
8. **SMS/Email Alerts** — Direct notifications via Twilio/SendGrid
9. **Electronic Health Record Integration** — Connect to hospital EHR
10. **NFC/RFID Authentication** — Physical access control for transport container

---

## 📝 Conclusion

The **Organ Transportation Real-Time Monitoring System** successfully demonstrates a complete IoT solution for critical healthcare logistics. The system provides:

- **Continuous monitoring** of all critical transport parameters
- **Dynamic temperature modes** for different preservation techniques
- **Immediate alerting** through multiple visual and audio channels
- **Role-based access** for medical professionals and families
- **Professional dashboard** with modern, hospital-grade UI design

This project showcases the integration of embedded systems (ESP32), cloud IoT (Blynk), and web technologies (HTML/CSS/JS) to create a practical, deployable healthcare monitoring solution.

---

## 📂 Project Structure

```
qwerty11-11-11@/
├── index.html                          # Main dashboard page
├── style.css                           # All styles (dark/light themes)
├── app.js                              # Dashboard logic & Blynk API
├── transport.js                        # Route setup, ETA, progress, indicators
├── README.md                           # This documentation
└── organ_transport_esp32/
    └── organ_transport_esp32.ino       # ESP32 firmware
```

---

## 👨‍💻 Technologies

![ESP32](https://img.shields.io/badge/ESP32-Firmware-blue)
![Blynk](https://img.shields.io/badge/Blynk-IoT%20Cloud-green)
![HTML5](https://img.shields.io/badge/HTML5-Dashboard-orange)
![CSS3](https://img.shields.io/badge/CSS3-Styling-blue)
![JavaScript](https://img.shields.io/badge/JavaScript-Logic-yellow)
![Chart.js](https://img.shields.io/badge/Chart.js-Graphs-pink)
![Leaflet](https://img.shields.io/badge/Leaflet.js-Maps-green)

---

**Made for Final Year Project — Organ Transportation Monitoring System** 🏥
