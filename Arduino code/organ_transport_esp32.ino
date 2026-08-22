/*
 * ============================================================
 *  ORGAN TRANSPORTATION – REAL-TIME MONITORING SYSTEM
 *  ESP32 Firmware with Blynk IoT Cloud
 * ============================================================
 *
 *  PURPOSE:
 *    This firmware runs on an ESP32 microcontroller to
 *    continuously monitor critical organ transport conditions.
 *    Sensor data is sent to the Blynk IoT cloud, where a
 *    web dashboard displays real-time readings and alerts.
 *
 *  SENSORS:
 *    - DHT22  → Temperature & Humidity (digital, GPIO 4)
 *    - MPU6050 → 3-axis accelerometer via I2C (tilt + fall)
 *    - NEO-6M  → GPS module via UART2 (latitude, longitude)
 *    - LDR     → Light-dependent resistor on ADC (box tamper)
 *
 *  PLATFORM:  Blynk IoT (new cloud platform)
 *  BOARD:     ESP32 DevKit V1
 *
 *  VIRTUAL PINS (Blynk Datastreams):
 *    V0  = Temperature (°C)       — DHT22 reading
 *    V1  = Humidity (%)           — DHT22 reading
 *    V2  = Accel X (g)            — MPU6050 X-axis
 *    V3  = Accel Y (g)            — MPU6050 Y-axis
 *    V4  = Accel Z (g)            — MPU6050 Z-axis
 *    V5  = Latitude               — NEO-6M GPS
 *    V6  = Longitude              — NEO-6M GPS
 *    V7  = LDR Value (0-4095)     — Analog reading
 *    V8  = System Control (0/1)   — Dashboard → ESP32 (ON/OFF)
 *    V9  = Temperature Mode (0/1/2) — Dashboard → ESP32
 *    V10 = Tilt Angle (°)         — Computed from accelerometer
 *
 *  TEMPERATURE MODES:
 *    Mode 0 (COLD)      → 2°C  to  8°C  (organ cold storage)
 *    Mode 1 (PERFUSION) → 20°C to 37°C  (machine perfusion)
 *    Mode 2 (DEMO)      → 25°C to 30°C  (demonstration / testing)
 *
 *  LIBRARIES (install via Arduino Library Manager):
 *    - Blynk (by Volodymyr Shymanskyy)
 *    - DHT sensor library (by Adafruit)
 *    - Adafruit Unified Sensor
 *    - Adafruit MPU6050
 *    - TinyGPSPlus (by Mikal Hart)
 *    - Wire (built-in for I2C communication)
 *
 *  KEY DESIGN DECISIONS:
 *    - Non-blocking: Uses millis() instead of delay() for timing
 *    - 3-reading average for LDR to reduce noise
 *    - Multi-axis tilt calculation using atan2() for accuracy
 *    - System ON/OFF flag to completely halt sensor operations
 * ============================================================
 */

/* ==================== BLYNK TEMPLATE CREDENTIALS ==================== */
// These must match your Blynk.Console template settings exactly.
// Template ID and Name are used for device-template binding.
#define BLYNK_TEMPLATE_ID "TMPL_XXXXXXXX" // ← Replace with your Template ID
#define BLYNK_TEMPLATE_NAME "Organ Transport"
#define BLYNK_AUTH_TOKEN                                                       \
  "YOUR_BLYNK_AUTH_TOKEN" // ← Replace with your Auth Token

// Enable Serial debug output for Blynk operations
#define BLYNK_PRINT Serial

/* ==================== INCLUDES ==================== */
#include <BlynkSimpleEsp32.h>  // Blynk library for ESP32 WiFi
#include <DHT.h>               // DHT22 temperature/humidity sensor
#include <WiFi.h>              // ESP32 WiFi connectivity
// #include <Adafruit_MPU6050.h> // (Not used — using raw I2C for MPU6050)
// #include <Adafruit_Sensor.h>  // (Not used — raw register reads instead)
#include <HardwareSerial.h>    // Hardware UART for GPS communication
#include <TinyGPSPlus.h>       // GPS NMEA sentence parser
#include <Wire.h>              // I2C communication (MPU6050)
#include <math.h>              // Math functions: sqrt, atan2, abs

/* ==================== WiFi CREDENTIALS ==================== */
// Your WiFi network credentials — ESP32 connects to this network
// to communicate with the Blynk cloud server.
char ssid[] = "YOUR_WIFI_SSID";     // ← Replace with your WiFi name
char pass[] = "YOUR_WIFI_PASSWORD"; // ← Replace with your WiFi password

/* ==================== PIN DEFINITIONS ==================== */
// Hardware pin assignments for each connected component.
// These must match the physical wiring on the breadboard/PCB.
#define DHT_PIN 4 // DHT22 data pin (digital)
#define DHT_TYPE DHT22
#define LDR_PIN 34      // LDR analog pin — must be ADC1 channel (GPIO 32-39)
#define BUZZER_PIN 25   // Active buzzer output — used for alert sounds
#define LED_ALERT_PIN 2 // On-board LED (GPIO 2) — lights up during alerts
#define GPS_RX_PIN 16   // GPS module TX → ESP32 RX2 (UART2 receive)
#define GPS_TX_PIN 17   // GPS module RX → ESP32 TX2 (UART2 transmit)

/* ==================== TEMPERATURE MODE ENUM ==================== */
// Enumeration for the three supported organ preservation modes.
// The dashboard sends a mode value (0, 1, or 2) via Blynk pin V9.
enum TempMode {
  MODE_COLD = 0,      // Cold Storage:    2°C – 8°C  (kidneys, liver)
  MODE_PERFUSION = 1, // Machine Perfusion: 20°C – 37°C (heart, lungs)
  MODE_DEMO = 2       // Demo / Testing:  25°C – 30°C (room temp range)
};

/* ==================== MODE THRESHOLD DEFINITIONS ==================== */
// Each mode has a safe temperature range. If the reading falls outside
// this range, a temperature alert is triggered.
struct ModeThresholds {
  float tempLow;      // Lower bound of safe range
  float tempHigh;     // Upper bound of safe range
  const char *label;  // Human-readable mode name for logging
};

// Lookup table — indexed by TempMode enum value
const ModeThresholds MODE_TABLE[] = {
    {2.0, 8.0, "Cold Storage"}, // MODE_COLD
    {20.0, 37.0, "Perfusion"},  // MODE_PERFUSION
    {25.0, 30.0, "Demo"}        // MODE_DEMO
};

/* ==================== DYNAMIC THRESHOLDS ==================== */
// These threshold variables are updated at runtime whenever the
// temperature mode changes (via dashboard V9 control).
TempMode currentMode = MODE_COLD;
float TEMP_LOW = MODE_TABLE[MODE_COLD].tempLow;   // Default: 2.0°C
float TEMP_HIGH = MODE_TABLE[MODE_COLD].tempHigh; // Default: 8.0°C

/* ==================== FIXED THRESHOLDS ==================== */
// LDR_THRESHOLD: ADC value below which the box is considered OPEN.
// Logic: LDR resistance drops when exposed to light → lower ADC reading.
// So ldrValue < 2000 means light is detected → lid is OPEN.
#define LDR_THRESHOLD 2000 // ADC — box open detection

/* ==================== VIRTUAL PINS ==================== */
// Pin mapping must match the Blynk Console datastream configuration.
// These are used with Blynk.virtualWrite() to send data to the cloud.
#define VPIN_TEMP V0   // Temperature reading (°C)
#define VPIN_HUM V1    // Humidity reading (%)
#define VPIN_AX V2     // Acceleration X-axis (g)
#define VPIN_AY V3     // Acceleration Y-axis (g)
#define VPIN_AZ V4     // Acceleration Z-axis (g)
#define VPIN_LAT V5    // GPS Latitude
#define VPIN_LNG V6    // GPS Longitude
#define VPIN_LDR V7    // LDR raw ADC value (0–4095)
#define VPIN_CTRL V8   // System ON/OFF control (received from dashboard)
#define VPIN_MODE V9   // Temperature mode selector (received from dashboard)
#define VPIN_TILT V10  // Tilt Angle in degrees (computed & sent to cloud)

/* ==================== OBJECTS ==================== */
DHT dht(DHT_PIN, DHT_TYPE);   // DHT22 sensor object
// Adafruit_MPU6050 mpu;       // (Not used — raw I2C mode instead)
TinyGPSPlus gps;               // GPS sentence parser
HardwareSerial gpsSerial(2);   // UART2 for GPS serial communication
BlynkTimer timer;              // Non-blocking timer for periodic tasks

// MPU6050 I2C address and raw acceleration registers
const int MPU = 0x68;          // Default I2C address of MPU6050
int16_t AcX, AcY, AcZ;        // Raw 16-bit acceleration values

/* ==================== STATE ==================== */
bool systemActive = true;      // Master ON/OFF flag — controlled by dashboard V8
// bool mpuReady      = false;
float lastLat = 0.0;           // Last known GPS latitude (retained when no fix)
float lastLng = 0.0;           // Last known GPS longitude (retained when no fix)

// ---------- Non-blocking buzzer state ----------
// Uses millis() to toggle buzzer on/off every 200ms during alerts,
// avoiding delay() which would block sensor reads and Blynk communication.
unsigned long lastBeep = 0;    // Timestamp of last buzzer toggle
bool buzzerState = false;      // Current buzzer HIGH/LOW state

/* ==================== SETUP ==================== */
// Runs once on power-up or reset. Initializes all hardware
// peripherals, establishes WiFi + Blynk connection, and
// starts the periodic sensor reading timer.
void setup() {
  Serial.begin(115200);  // USB serial for debug output
  Serial.println("\n========================================");
  Serial.println("  Organ Transport Monitoring System");
  Serial.println("  with Dynamic Temperature Modes");
  Serial.println("========================================\n");

  // Configure alert output pins
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_ALERT_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);     // Ensure buzzer starts silent
  digitalWrite(LED_ALERT_PIN, LOW);  // Ensure LED starts off

  // Initialize DHT22 temperature/humidity sensor
  dht.begin();
  Serial.println("[OK] DHT22 initialized");

  // Initialize MPU6050 accelerometer via raw I2C
  // We use direct register access (0x6B = power management register)
  // Writing 0 to register 0x6B wakes the MPU6050 from sleep mode.
  Wire.begin(21, 22);           // SDA = GPIO 21, SCL = GPIO 22
  Wire.beginTransmission(MPU);  // Start I2C communication with MPU6050
  Wire.write(0x6B);             // Select power management register
  Wire.write(0);                // Write 0 to wake up the sensor
  Wire.endTransmission(true);   // End transmission
  Serial.println("[OK] MPU6050 ready (raw mode)");

  // Initialize GPS via UART2
  // NEO-6M communicates at 9600 baud, 8 data bits, no parity, 1 stop bit
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[OK] GPS UART initialized");

  // Connect to WiFi network and Blynk cloud server
  // This is a blocking call — waits until connection succeeds.
  Serial.print("[..] Connecting to WiFi & Blynk...");
  Blynk.begin(BLYNK_AUTH_TOKEN, ssid, pass);
  Serial.println(" Connected!");

  // Display the active temperature mode and its thresholds
  printModeInfo();

  // Register periodic sensor reading function
  // BlynkTimer calls readAndSendSensors() every 3000ms (3 seconds)
  // This is non-blocking — it doesn't interfere with Blynk.run()
  timer.setInterval(3000L, readAndSendSensors);

  Serial.println("\n[READY] System is running.\n");
}

/* ==================== MAIN LOOP ==================== */
// The main loop runs continuously. It performs two critical tasks:
// 1. Blynk.run()  — Maintains connection to Blynk server and processes
//                    incoming commands (V8 system control, V9 mode change)
// 2. timer.run()  — Triggers readAndSendSensors() every 3 seconds
//                    (the function itself checks systemActive flag)
// GPS data is processed continuously when active, or drained when OFF
// to prevent the serial buffer from overflowing.
void loop() {
  Blynk.run(); // Always run — needed to receive control commands
  timer.run(); // Always run — readAndSendSensors checks systemActive

  // GPS: Only process when system is active
  if (systemActive) {
    readGPS();        // Feed GPS NMEA data to the parser
  } else {
    drainGPSBuffer(); // Drain buffer to prevent overflow, but discard data
  }
}

/* ==================== READ GPS (continuous) ==================== */
// GPS data arrives continuously as NMEA sentences over UART2.
// We feed each byte to TinyGPSPlus which parses the sentences
// and updates gps.location when a valid fix is decoded.
void readGPS() {
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }
}

/* ==================== DRAIN GPS BUFFER (system OFF) ==================== */
// When the system is OFF, we still need to read from the GPS serial
// buffer to prevent it from overflowing. However, we discard the data
// since we don't want to process or send any GPS updates while OFF.
void drainGPSBuffer() {
  while (gpsSerial.available() > 0) {
    gpsSerial.read(); // Read and discard each byte
  }
}

/* ==================== APPLY MODE CHANGE ==================== */
// Called when the dashboard sends a new temperature mode via V9.
// Validates the mode value, updates the active thresholds, and
// logs the change. The next sensor reading cycle will automatically
// use the new threshold values for alert checking.
void applyMode(int modeValue) {
  // Guard against invalid values (must be 0, 1, or 2)
  if (modeValue < 0 || modeValue > 2) {
    Serial.printf("[WARN] Invalid mode value: %d — defaulting to COLD\n",
                  modeValue);
    modeValue = 0;
  }

  TempMode newMode = (TempMode)modeValue;

  // Only apply changes if mode actually changed (avoid redundant updates)
  if (newMode != currentMode) {
    currentMode = newMode;

    // === CRITICAL: Update thresholds IMMEDIATELY ===
    // The next call to readAndSendSensors() will use these new values
    // for temperature alert checking — no restart required.
    TEMP_LOW = MODE_TABLE[currentMode].tempLow;
    TEMP_HIGH = MODE_TABLE[currentMode].tempHigh;

    Serial.println("\n╔══════════════════════════════════════╗");
    Serial.println("║      MODE CHANGED SUCCESSFULLY       ║");
    Serial.println("╚══════════════════════════════════════╝");
    printModeInfo();
  }
}

/* ==================== PRINT MODE INFO ==================== */
// Utility function to log current mode and threshold values.
// Called on startup and after every mode change.
void printModeInfo() {
  Serial.printf("[MODE]  Current: %s\n", MODE_TABLE[currentMode].label);
  Serial.printf("[MODE]  Temp Low:  %.1f°C\n", TEMP_LOW);
  Serial.printf("[MODE]  Temp High: %.1f°C\n", TEMP_HIGH);
}

/* ==================== READ & SEND SENSORS ==================== */
// This is the core function called every 3 seconds by BlynkTimer.
// It reads ALL sensors, sends data to Blynk cloud, checks thresholds,
// and triggers alerts if any value is out of safe range.
void readAndSendSensors() {

  // ── SYSTEM OFF GUARD ──────────────────────────────────────────
  // When systemActive is false (set by dashboard V8), skip ALL
  // sensor operations. No data is read, sent, or checked.
  if (!systemActive) {
    Serial.println("[INFO] System is OFF — skipping sensor read.");
    return;
  }

  bool alertTriggered = false;  // Tracks whether any alert fires this cycle

  // ══════════════════════════════════════════════════════════════
  // SENSOR 1: DHT22 — Temperature & Humidity
  // ══════════════════════════════════════════════════════════════
  // readTemperature() and readHumidity() return float values.
  // If the sensor fails or the wiring is loose, they return NaN.
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("[WARN] DHT22 read failed");
    temperature = -999;  // Sentinel value — dashboard shows "--"
    humidity = -999;
  } else {
    Serial.printf("[DHT22] Temp: %.1f°C  |  Hum: %.1f%%\n", temperature,
                  humidity);
    Blynk.virtualWrite(VPIN_TEMP, temperature);
    Blynk.virtualWrite(VPIN_HUM, humidity);

    // Temperature alert — compares against DYNAMIC thresholds
    // that change based on the currently selected mode (Cold/Perfusion/Demo).
    if (temperature > TEMP_HIGH || temperature < TEMP_LOW) {
      Serial.printf("[ALERT] Temperature %.1f°C out of safe range "
                    "(%.1f–%.1f°C) [%s Mode]\n",
                    temperature, TEMP_LOW, TEMP_HIGH,
                    MODE_TABLE[currentMode].label);
      alertTriggered = true;
      // Log event to Blynk timeline (visible in Blynk Console)
      Blynk.logEvent("temp_alert",
                     String("Temperature ") + String(temperature, 1) +
                         "°C is out of safe range (" + String(TEMP_LOW, 1) +
                         "–" + String(TEMP_HIGH, 1) + "°C) [" +
                         MODE_TABLE[currentMode].label + " Mode]");
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SENSOR 2: MPU6050 — 3-Axis Acceleration (Raw I2C)
  // ══════════════════════════════════════════════════════════════
  // Read 6 bytes from register 0x3B (ACCEL_XOUT_H through ACCEL_ZOUT_L).
  // Each axis is a signed 16-bit value. At default ±2g sensitivity,
  // dividing by 16384 converts the raw value to g-force units.
  Wire.beginTransmission(MPU);
  Wire.write(0x3B);             // Starting register: ACCEL_XOUT_H
  Wire.endTransmission(false);  // Send repeated start (don't release bus)
  Wire.requestFrom(MPU, 6, true);  // Request 6 bytes (X, Y, Z — 2 bytes each)

  // Combine high and low bytes into signed 16-bit values
  AcX = Wire.read() << 8 | Wire.read();  // X-axis raw
  AcY = Wire.read() << 8 | Wire.read();  // Y-axis raw
  AcZ = Wire.read() << 8 | Wire.read();  // Z-axis raw

  // Convert raw values to g-force (at ±2g range, LSB = 16384)
  float ax = AcX / 16384.0;
  float ay = AcY / 16384.0;
  float az = AcZ / 16384.0;

  Serial.printf("[MPU] Ax: %.2fg  Ay: %.2fg  Az: %.2fg\n", ax, ay, az);

  // Send individual axis values to Blynk
  Blynk.virtualWrite(VPIN_AX, ax);
  Blynk.virtualWrite(VPIN_AY, ay);
  Blynk.virtualWrite(VPIN_AZ, az);

  // ── FALL / SHOCK DETECTION ─────────────────────────────────
  // Calculate total acceleration magnitude using Euclidean norm.
  // At rest, magnitude ≈ 1.0g (gravity). A sudden shock or fall
  // produces a spike well above 1.0g. Threshold set at 1.5g.
  float magnitude = sqrt(ax * ax + ay * ay + az * az);

  if (magnitude > 1.5) {
    Serial.printf("[ALERT] FALL detected! %.2fg\n", magnitude);
    alertTriggered = true;
    Blynk.logEvent("fall_alert", String("Fall detected! Magnitude: ") +
                                     String(magnitude, 2) + "g");
  }

  // ── TILT ANGLE DETECTION (Multi-Axis Calculation) ──────────
  // Tilt angle is computed SEPARATELY from fall detection.
  // Uses atan2() to calculate the angle of inclination from
  // the gravity vector on both X and Y axes.
  //
  // angleX = tilt around X-axis (forward/backward lean)
  // angleY = tilt around Y-axis (left/right lean)
  // angle  = the larger of the two → worst-case tilt reading
  //
  // At rest on a flat surface: angle ≈ 0°
  // Tilted 45°: angle ≈ 45° → triggers alert
  // Completely sideways: angle ≈ 90°
  float angleX = atan2(ax, sqrt(ay * ay + az * az)) * 180.0 / PI;
  float angleY = atan2(ay, sqrt(ax * ax + az * az)) * 180.0 / PI;
  float angle = max(abs(angleX), abs(angleY));  // Take the maximum tilt

  Serial.printf("[TILT]  Angle: %.1f° (X: %.1f° Y: %.1f°)\n", angle, angleX, angleY);
  Blynk.virtualWrite(VPIN_TILT, angle);  // Send to Blynk on V10

  // Tilt threshold: 45° — if the transport container tilts beyond
  // this angle, the organ inside may be at risk.
  if (angle > 45) {
    Serial.printf("[ALERT] TILT detected! %.1f°\n", angle);
    alertTriggered = true;
    Blynk.logEvent("tilt_alert",
                   String("Tilt detected! Angle: ") + String(angle, 1) + "°");
  }

  // ══════════════════════════════════════════════════════════════
  // SENSOR 3: NEO-6M GPS — Latitude & Longitude
  // ══════════════════════════════════════════════════════════════
  // GPS data is parsed continuously in loop() via readGPS().
  // Here we just check if a valid fix is available and send
  // the coordinates to Blynk. If no fix, we send the last
  // known position (initialized to 0.0, 0.0).
  if (gps.location.isValid()) {
    lastLat = gps.location.lat();
    lastLng = gps.location.lng();
    Serial.printf("[GPS]   Lat: %.6f  |  Lng: %.6f\n", lastLat, lastLng);
  } else {
    Serial.println("[GPS]   Waiting for fix...");
  }
  Blynk.virtualWrite(VPIN_LAT, lastLat);
  Blynk.virtualWrite(VPIN_LNG, lastLng);

  // ══════════════════════════════════════════════════════════════
  // SENSOR 4: LDR — Box Tamper / Lid Open Detection
  // ══════════════════════════════════════════════════════════════
  // The LDR is connected in a voltage divider with a 10kΩ resistor.
  // In DARKNESS (box closed): LDR resistance is HIGH → ADC reads HIGH (>2000)
  // In LIGHT (box open):      LDR resistance is LOW  → ADC reads LOW (<2000)
  //
  // We take 3 readings with a 2ms gap for stability (noise reduction).
  // The average is compared against LDR_THRESHOLD (~2000).
  int ldrSum = 0;
  for (int i = 0; i < 3; i++) {
    ldrSum += analogRead(LDR_PIN);
    delay(2);  // Brief delay between readings for ADC settling
  }
  int ldrValue = ldrSum / 3;  // Average of 3 readings

  // Tamper logic: value BELOW threshold = light detected = box is OPEN
  bool boxIsOpen = (ldrValue < LDR_THRESHOLD);
  Serial.printf("[LDR]   Value: %d  |  Box: %s\n", ldrValue,
                boxIsOpen ? "OPEN" : "CLOSED");
  Blynk.virtualWrite(VPIN_LDR, ldrValue);

  if (boxIsOpen) {
    Serial.println("[ALERT] Box tampering detected — lid is OPEN!");
    alertTriggered = true;
    Blynk.logEvent("tamper_alert", "Box tampering detected – lid is OPEN!");
  }

  // ══════════════════════════════════════════════════════════════
  // ALERT OUTPUT — Buzzer & LED
  // ══════════════════════════════════════════════════════════════
  // If ANY alert was triggered this cycle, activate the LED and
  // start the non-blocking buzzer. Otherwise, silence everything.
  if (alertTriggered) {
    digitalWrite(LED_ALERT_PIN, HIGH);  // Turn on alert LED
    triggerAlarmNonBlocking();          // Start buzzer beeping
  } else {
    silenceAlarm();                     // Turn off LED and buzzer
  }

  Serial.println("─────────────────────────────────────────");
}

/* ==================== ALARM (NON-BLOCKING) ==================== */
// Buzzer alarm using millis() for non-blocking operation.
// Instead of using delay() (which would freeze the entire program),
// we toggle the buzzer pin every 200ms using timestamp comparison.
// This allows Blynk.run() and GPS reading to continue uninterrupted.
void triggerAlarmNonBlocking() {
  if (millis() - lastBeep > 200) {
    buzzerState = !buzzerState;             // Toggle HIGH ↔ LOW
    digitalWrite(BUZZER_PIN, buzzerState);  // Apply to buzzer pin
    lastBeep = millis();                    // Record toggle time
  }
}

// Immediately silences all alert outputs (called when no alerts active,
// or when the system is turned OFF via dashboard control).
void silenceAlarm() {
  digitalWrite(LED_ALERT_PIN, LOW);  // Turn off alert LED
  digitalWrite(BUZZER_PIN, LOW);     // Turn off buzzer
  buzzerState = false;               // Reset toggle state
}

/* ==================== BLYNK CONTROL (V8) — System ON/OFF ==================== */
// This callback fires whenever the dashboard writes to Virtual Pin V8.
// It controls the master ON/OFF state of the entire monitoring system.
// When OFF: sensors stop reading, no data is sent, no alerts trigger.
// When ON:  all operations resume from the next timer cycle.
BLYNK_WRITE(VPIN_CTRL) {
  int value = param.asInt();       // Read the value sent by dashboard (0 or 1)
  systemActive = (value == 1);     // Update the master control flag

  if (systemActive) {
    Serial.println("\n[CTRL] ══════════════════════════");
    Serial.println("[CTRL]  SYSTEM → ON");
    Serial.println("[CTRL]  All sensors ACTIVE");
    Serial.println("[CTRL]  Alerts ENABLED");
    Serial.println("[CTRL] ══════════════════════════\n");
  } else {
    Serial.println("\n[CTRL] ══════════════════════════");
    Serial.println("[CTRL]  SYSTEM → OFF");
    Serial.println("[CTRL]  All sensors INACTIVE");
    Serial.println("[CTRL]  No data sent to Blynk");
    Serial.println("[CTRL]  No alerts triggered");
    Serial.println("[CTRL]  Buzzer & LED OFF");
    Serial.println("[CTRL] ══════════════════════════\n");
    silenceAlarm(); // Immediately silence all alert outputs
  }
}

/* ==================== BLYNK MODE (V9) — Temperature Mode ==================== */
// This callback fires when the dashboard sends a new temperature mode.
// Mode values: 0 = Cold Storage, 1 = Perfusion, 2 = Demo.
// The applyMode() function validates the value and updates thresholds.
BLYNK_WRITE(VPIN_MODE) {
  int modeValue = param.asInt();
  Serial.printf("[CTRL] Mode change received: %d\n", modeValue);
  applyMode(modeValue);
}

/* ==================== BLYNK CONNECTED ==================== */
// Called automatically when the ESP32 first connects (or reconnects)
// to the Blynk server. We sync critical control pins so the ESP32
// knows the current state of the dashboard settings (e.g., whether
// the system is ON/OFF and which temperature mode is selected).
BLYNK_CONNECTED() {
  Serial.println("[BLYNK] Connected to server");
  Blynk.syncVirtual(VPIN_CTRL); // Sync system control state (ON/OFF)
  Blynk.syncVirtual(VPIN_MODE); // Sync temperature mode (Cold/Perf/Demo)
  Blynk.syncVirtual(VPIN_TILT); // Sync tilt angle display
}
