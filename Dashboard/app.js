/* ===================================================================
   ORGAN TRANSPORTATION MONITOR – APP LOGIC
   Auth · Blynk API · Chart.js · Leaflet · Alerts · CSV · Temp Modes
   =================================================================== */

(function () {
    'use strict';

    /* ==================== CONSTANTS ==================== */
    const REFRESH_INTERVAL = 3000;            // ms
    const MAX_HISTORY      = 1000;            // stored readings
    const CHART_POINTS     = 20;              // visible on graph
    const CIRCUMFERENCE    = 2 * Math.PI * 52; // SVG gauge

    /* ==================== TEMPERATURE MODES ==================== */
    const TEMP_MODES = {
        cold:      { label: 'Cold Storage',  low: 2,  high: 8,  icon: '❄️', blynkValue: 0 },
        perfusion: { label: 'Perfusion',     low: 20, high: 37, icon: '🌡️', blynkValue: 1 },
        demo:      { label: 'Demo',          low: 25, high: 30, icon: '🧪', blynkValue: 2 }
    };

    /* ==================== STATE ==================== */
    let currentRole    = null;
    let currentMode    = 'cold';   // default temperature mode
    let blynkToken     = '';
    let refreshTimer   = null;
    let map, marker, polyline;
    let sensorChart    = null;
    let systemOn       = false;
    let alertFlashing  = false;
    let redFlashTimer  = null;

    const pins = {
        temp: 'V0', hum: 'V1',
        ax: 'V2',   ay: 'V3',  az: 'V4',
        lat: 'V5',  lng: 'V6', ldr: 'V7',
        ctrl: 'V8', mode: 'V9', tilt: 'V10'
    };

    const thresholds = {
        tempHigh: TEMP_MODES.cold.high,
        tempLow:  TEMP_MODES.cold.low,
        accelMax: 2.5,
        ldrOpen:  2000,
        tiltMax:  45
    };

    const history = {
        timestamps: [], temp: [], hum: [],
        ax: [], ay: [], az: [], tilt: [],
        lat: [], lng: [], ldr: [],
        boxStatus: [], alertStatus: []
    };

    const gpsPath = [];

    /* ==================== DOM REFS ==================== */
    const $ = id => document.getElementById(id);

    const dom = {
        loginScreen:    $('login-screen'),
        loadingScreen:  $('loading-screen'),
        dashboardScreen:$('dashboard-screen'),
        loginForm:      $('login-form'),
        loginError:     $('login-error'),
        loginSuccess:   $('login-success'),
        loginEmail:     $('login-email'),
        loginPassword:  $('login-password'),
        loginBtn:       $('login-btn'),
        toggleSignup:   $('toggle-signup'),
        loginToggle:    $('login-toggle'),
        loaderBar:      $('loader-bar'),
        // header
        btnSettings:    $('btn-settings'),
        btnCsv:         $('btn-csv'),
        btnTheme:       $('btn-theme'),
        btnLogout:      $('btn-logout'),
        userRoleLabel:  $('user-role-label'),
        userBadge:      $('user-badge'),
        // sensor values
        valTemp: $('val-temp'), valHum: $('val-hum'),
        valAx:   $('val-ax'),  valAy:  $('val-ay'),  valAz: $('val-az'),
        valTilt: $('val-tilt'),
        valLat:  $('val-lat'), valLng: $('val-lng'),
        // gauges
        gaugeTempFill:  $('gauge-temp-fill'),
        gaugeAccelFill: $('gauge-accel-fill'),
        gaugeTiltFill:  $('gauge-tilt-fill'),
        gaugeLdrFill:   $('gauge-ldr-fill'),
        gaugeTempVal:   $('gauge-temp-val'),
        gaugeAccelVal:  $('gauge-accel-val'),
        gaugeTiltVal:   $('gauge-tilt-val'),
        gaugeLdrVal:    $('gauge-ldr-val'),
        // control
        systemToggle:   $('system-toggle'),
        controlLabel:   $('control-status-label'),
        // mode
        modeCold:         $('mode-cold'),
        modePerfusion:    $('mode-perfusion'),
        modeDemo:         $('mode-demo'),
        modeCurrentLabel: $('mode-current-label'),
        thresholdRangeLabel: $('threshold-range-label'),
        // alerts
        alertBanner:     $('alert-banner'),
        alertBannerText: $('alert-banner-text'),
        alertDismiss:    $('alert-dismiss'),
        alertPopup:      $('alert-popup'),
        alertPopupTitle: $('alert-popup-title'),
        alertPopupMsg:   $('alert-popup-msg'),
        alertPopupClose: $('alert-popup-close'),
        redFlashOverlay: $('red-flash-overlay'),
        // map
        mapPanel:      $('map-panel'),
        btnFullscreen: $('btn-fullscreen'),
        btnMinimize:   $('btn-minimize'),
        // settings modal
        settingsModal: $('settings-modal'),
        modalClose:    $('modal-close'),
        cfgToken:      $('cfg-token'),
        btnSaveConfig: $('btn-save-config'),
        // footer
        lastUpdated:   $('last-updated'),
        // loading steps
        step1: $('step-1'), step2: $('step-2'), step3: $('step-3'),
    };

    /* ==================== AUTH ==================== */
    let isSignUpMode = false;

    function showScreen(screenEl) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        screenEl.classList.add('active');
    }

    // Toggle between Sign In and Sign Up
    dom.toggleSignup.addEventListener('click', () => {
        isSignUpMode = !isSignUpMode;
        dom.loginError.textContent = '';
        dom.loginSuccess.textContent = '';
        if (isSignUpMode) {
            dom.loginBtn.querySelector('span').textContent = 'Create Account';
            dom.loginBtn.querySelector('i').className = 'fas fa-user-plus';
            dom.loginToggle.innerHTML = 'Already have an account? <a id="toggle-signup">Sign In</a>';
        } else {
            dom.loginBtn.querySelector('span').textContent = 'Sign In';
            dom.loginBtn.querySelector('i').className = 'fas fa-arrow-right-to-bracket';
            dom.loginToggle.innerHTML = 'Don\'t have an account? <a id="toggle-signup">Sign Up</a>';
        }
        // Re-bind the toggle link
        document.getElementById('toggle-signup').addEventListener('click', () => {
            dom.toggleSignup.click();
        });
    });

    function getUsers() {
        try { return JSON.parse(localStorage.getItem('appUsers') || '{}'); }
        catch { return {}; }
    }
    function saveUsers(users) {
        localStorage.setItem('appUsers', JSON.stringify(users));
    }
    // Generate a unique key for email+role combination
    function userKey(email, role) {
        return email + '::' + role;
    }

    dom.loginForm.addEventListener('submit', e => {
        e.preventDefault();
        const email = dom.loginEmail.value.trim();
        const pass  = dom.loginPassword.value.trim();
        const role  = document.querySelector('input[name="role"]:checked').value;

        if (!email || !pass) {
            dom.loginError.textContent = 'Please fill in all fields.';
            dom.loginSuccess.textContent = '';
            return;
        }

        const users = getUsers();

        if (isSignUpMode) {
            // SIGN UP — keyed by email+role so same email can have different roles
            const key = userKey(email, role);
            if (users[key]) {
                dom.loginError.textContent = 'Account already exists for this role. Please sign in.';
                dom.loginSuccess.textContent = '';
                return;
            }
            users[key] = { email: email, password: pass, role: role };
            saveUsers(users);
            dom.loginError.textContent = '';
            dom.loginSuccess.textContent = 'Account created! Signing you in…';
            // Auto-login after signup
            setTimeout(() => {
                currentRole = role;
                localStorage.setItem('userRole', role);
                localStorage.setItem('userEmail', email);
                dom.loginSuccess.textContent = '';
                startLoadingSequence();
            }, 1000);
        } else {
            // SIGN IN — strictly validate email + role combination
            const key = userKey(email, role);
            if (!users[key]) {
                // Check if email exists under a different role for a helpful message
                const otherRole = role === 'doctor' ? 'patient' : 'doctor';
                const otherKey = userKey(email, otherRole);
                if (users[otherKey]) {
                    dom.loginError.textContent = 'Invalid role selection for this account.';
                } else {
                    dom.loginError.textContent = 'No account found. Please sign up first.';
                }
                dom.loginSuccess.textContent = '';
                return;
            }
            if (users[key].password !== pass) {
                dom.loginError.textContent = 'Incorrect password.';
                dom.loginSuccess.textContent = '';
                return;
            }
            dom.loginError.textContent = '';
            dom.loginSuccess.textContent = '';
            currentRole = role;  // Use the SELECTED role, not stored role
            localStorage.setItem('userRole', currentRole);
            localStorage.setItem('userEmail', email);
            startLoadingSequence();
        }
    });

    dom.btnLogout.addEventListener('click', () => {
        clearInterval(refreshTimer);
        currentRole = null;
        localStorage.removeItem('userRole');
        localStorage.removeItem('userEmail');
        document.body.classList.remove('role-patient', 'role-doctor', 'alert-flashing');
        dom.redFlashOverlay.classList.remove('active');
        if (window.onTransportLogout) window.onTransportLogout();
        showScreen(dom.loginScreen);
    });

    /* ==================== THEME TOGGLE ==================== */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const icon = dom.btnTheme.querySelector('i');
        if (theme === 'light') {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
        localStorage.setItem('appTheme', theme);
    }

    dom.btnTheme.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    // Apply saved theme on load
    (function initTheme() {
        const saved = localStorage.getItem('appTheme') || 'dark';
        applyTheme(saved);
    })();

    /* ==================== LOADING SEQUENCE ==================== */
    function startLoadingSequence() {
        showScreen(dom.loadingScreen);
        const steps = [dom.step1, dom.step2, dom.step3];
        steps.forEach(s => { s.classList.remove('active', 'done'); });
        dom.loaderBar.style.width = '0%';

        setTimeout(() => { steps[0].classList.add('active'); dom.loaderBar.style.width = '30%'; }, 300);
        setTimeout(() => { steps[0].classList.remove('active'); steps[0].classList.add('done'); steps[1].classList.add('active'); dom.loaderBar.style.width = '60%'; }, 1200);
        setTimeout(() => { steps[1].classList.remove('active'); steps[1].classList.add('done'); steps[2].classList.add('active'); dom.loaderBar.style.width = '90%'; }, 2200);
        setTimeout(() => { steps[2].classList.remove('active'); steps[2].classList.add('done'); dom.loaderBar.style.width = '100%'; }, 3000);
        setTimeout(() => { initDashboard(); }, 3400);
    }

    /* ==================== INIT DASHBOARD ==================== */
    function initDashboard() {
        applyRole();
        showScreen(dom.dashboardScreen);
        loadConfig();
        initChart();
        initMap();
        initModeSelector();
        if (window.initTransport) window.initTransport();
        fetchData();
        refreshTimer = setInterval(fetchData, REFRESH_INTERVAL);
    }

    function applyRole() {
        document.body.classList.remove('role-patient', 'role-doctor');
        if (currentRole === 'patient') {
            document.body.classList.add('role-patient');
            dom.userRoleLabel.textContent = 'Patient Family';
            dom.userBadge.querySelector('i').className = 'fas fa-people-group';
        } else {
            document.body.classList.add('role-doctor');
            dom.userRoleLabel.textContent = 'Doctor';
            dom.userBadge.querySelector('i').className = 'fas fa-user-doctor';
        }
    }

    /* ==================== TEMPERATURE MODE LOGIC ==================== */
    function initModeSelector() {
        // Load saved mode
        const savedMode = localStorage.getItem('tempMode') || 'cold';
        setMode(savedMode, false); // Don't send to Blynk on init page load

        // Mode button click handlers
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mode');
                setMode(mode, true);
            });
        });
    }

    function setMode(modeName, sendToBlynk) {
        if (!TEMP_MODES[modeName]) return;

        currentMode = modeName;
        const mode = TEMP_MODES[modeName];

        // Update thresholds immediately
        thresholds.tempLow  = mode.low;
        thresholds.tempHigh = mode.high;

        // Update UI — button active states
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`.mode-btn[data-mode="${modeName}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        // Update current mode label
        if (dom.modeCurrentLabel) {
            dom.modeCurrentLabel.innerHTML = `<i class="fas fa-info-circle"></i> Current Mode: <strong>${mode.label} (${mode.low}–${mode.high}°C)</strong>`;
        }

        // Update threshold badge
        if (dom.thresholdRangeLabel) {
            dom.thresholdRangeLabel.textContent = `${mode.low}°C – ${mode.high}°C`;
        }

        // Persist mode
        localStorage.setItem('tempMode', modeName);

        // Send to Blynk (ESP32 V9)
        if (sendToBlynk) {
            blynkSet(pins.mode, mode.blynkValue);
        }

        console.log(`[MODE] Switched to ${mode.label} → Thresholds: ${mode.low}°C – ${mode.high}°C`);
    }

    /* ==================== CONFIG (LOCAL STORAGE) ==================== */
    function loadConfig() {
        const saved = localStorage.getItem('blynkConfig');
        if (saved) {
            try {
                const cfg = JSON.parse(saved);
                blynkToken = cfg.token || '';
                Object.assign(pins, cfg.pins || {});
            } catch (_) { /* ignore */ }
        }
        // populate modal
        dom.cfgToken.value = blynkToken;
        const allPinKeys = ['temp','hum','ax','ay','az','lat','lng','ldr','ctrl','mode','tilt'];
        allPinKeys.forEach(k => {
            const el = $('pin-' + k);
            if (el) el.value = pins[k] || '';
        });
    }

    function saveConfig() {
        blynkToken = dom.cfgToken.value.trim();
        const pinKeys = ['temp','hum','ax','ay','az','lat','lng','ldr','ctrl','mode','tilt'];
        pinKeys.forEach(k => {
            const el = $('pin-' + k);
            if (el && el.value.trim()) pins[k] = el.value.trim();
        });
        localStorage.setItem('blynkConfig', JSON.stringify({ token: blynkToken, pins }));
        dom.settingsModal.classList.add('hidden');
    }

    dom.btnSettings.addEventListener('click', () => dom.settingsModal.classList.remove('hidden'));
    dom.modalClose.addEventListener('click', () => dom.settingsModal.classList.add('hidden'));
    dom.btnSaveConfig.addEventListener('click', saveConfig);

    /* ==================== BLYNK API ==================== */
    async function blynkGet(pin) {
        if (!blynkToken) return null;
        try {
            const r = await fetch(`https://blynk.cloud/external/api/get?token=${blynkToken}&pin=${pin}`);
            if (!r.ok) return null;
            const text = await r.text();
            return parseFloat(text) || 0;
        } catch { return null; }
    }

    async function blynkSet(pin, value) {
        if (!blynkToken) return;
        try {
            await fetch(`https://blynk.cloud/external/api/update?token=${blynkToken}&pin=${pin}&value=${value}`);
        } catch { /* silent */ }
    }

    /* ==================== FETCH DATA ==================== */
    async function fetchData() {
        // ═══════ SYSTEM OFF CHECK ═══════
        // When system is OFF: no sensor reads, no data sent, no alerts
        if (!systemOn) {
            console.log('[SYSTEM] OFF — skipping all sensor reads and updates');
            return;  // Do absolutely nothing
        }

        let temp, hum, ax, ay, az, lat, lng, ldr, tilt;

        if (blynkToken) {
            [temp, hum, ax, ay, az, lat, lng, ldr, tilt] = await Promise.all([
                blynkGet(pins.temp), blynkGet(pins.hum),
                blynkGet(pins.ax),   blynkGet(pins.ay),  blynkGet(pins.az),
                blynkGet(pins.lat),  blynkGet(pins.lng),  blynkGet(pins.ldr),
                blynkGet(pins.tilt)
            ]);
        } else {
            // Demo / simulated data based on current mode
            const mode = TEMP_MODES[currentMode];
            const midTemp = (mode.low + mode.high) / 2;
            const range = (mode.high - mode.low) / 2;
            // Occasionally push temperature out of range for demo alerts
            const outOfRange = Math.random() < 0.08;
            if (outOfRange) {
                temp = +(mode.high + 2 + Math.random() * 3).toFixed(1);
            } else {
                temp = +(midTemp + (Math.random() - 0.5) * range * 1.5).toFixed(1);
            }
            hum  = +(55 + Math.random() * 20).toFixed(1);
            ax   = +(Math.random() * 0.5 - 0.25).toFixed(2);
            ay   = +(Math.random() * 0.5 - 0.25).toFixed(2);
            az   = +(0.95 + Math.random() * 0.1).toFixed(2);
            lat  = +(19.076 + (Math.random() - 0.5) * 0.01).toFixed(6);
            lng  = +(72.877 + (Math.random() - 0.5) * 0.01).toFixed(6);
            ldr  = Math.floor(2000 + Math.random() * 2095);
            // Simulate tilt: mostly small, occasionally large
            tilt = Math.random() < 0.08
                ? +(45 + Math.random() * 20).toFixed(1)
                : +(Math.random() * 15).toFixed(1);
        }

        const now = new Date();
        // Full date+time for CSV compatibility (avoids ######## in Excel)
        const pad2 = n => String(n).padStart(2, '0');
        const ts = now.getFullYear() + '-' + pad2(now.getMonth()+1) + '-' + pad2(now.getDate())
                 + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
        const boxOpen = ldr !== null && ldr < thresholds.ldrOpen;
        const boxText = boxOpen ? 'OPEN' : 'CLOSED';

        // Update display
        animateValue(dom.valTemp, temp, '°C');
        animateValue(dom.valHum,  hum,  '%');
        animateValue(dom.valAx,   ax,   'g');
        animateValue(dom.valAy,   ay,   'g');
        animateValue(dom.valAz,   az,   'g');
        if (dom.valTilt) dom.valTilt.textContent = tilt !== null ? tilt : '--';
        dom.valLat.textContent = lat !== null ? lat : '--';
        dom.valLng.textContent = lng !== null ? lng : '--';

        // Gauges — use mode-aware range for temperature gauge
        updateGauge(dom.gaugeTempFill, dom.gaugeTempVal, temp, 0, Math.max(thresholds.tempHigh * 2, 40));
        const accelMag = Math.sqrt((ax||0)**2 + (ay||0)**2 + (az||0)**2);
        updateGauge(dom.gaugeAccelFill, dom.gaugeAccelVal, +accelMag.toFixed(2), 0, 5);
        updateGauge(dom.gaugeTiltFill, dom.gaugeTiltVal, tilt, 0, 90);
        updateGauge(dom.gaugeLdrFill, dom.gaugeLdrVal, ldr, 0, 4095);

        // Color gauge based on threshold status
        if (temp !== null) {
            if (temp > thresholds.tempHigh || temp < thresholds.tempLow) {
                dom.gaugeTempFill.style.stroke = 'var(--red)';
            } else {
                dom.gaugeTempFill.style.stroke = 'var(--teal)';
            }
        }
        // Color tilt gauge based on threshold
        if (tilt !== null && dom.gaugeTiltFill) {
            dom.gaugeTiltFill.style.stroke = tilt > thresholds.tiltMax ? 'var(--red)' : 'var(--purple, #a855f7)';
        }

        // History
        pushHistory(ts, temp, hum, ax, ay, az, tilt, lat, lng, ldr, boxText);

        // Chart update
        updateChart(ts, temp, hum);

        // Map update
        if (lat && lng) updateMap(lat, lng);

        // Alerts
        checkAlerts(temp, accelMag, tilt, ldr, boxText);

        // Timestamp
        dom.lastUpdated.textContent = now.toLocaleString();

        // Sensor status (simple heuristic)
        updateSensorStatus('status-dht', temp !== null && hum !== null);
        updateSensorStatus('status-mpu', ax !== null);
        updateSensorStatus('status-ldr-sensor', ldr !== null);
        updateSensorStatus('status-gps', lat !== null && lng !== null && lat !== 0);
    }

    function animateValue(el, val, suffix) {
        if (val === null || val === undefined) { el.textContent = '--'; return; }
        el.textContent = val;
    }

    function pushHistory(ts, temp, hum, ax, ay, az, tilt, lat, lng, ldr, boxText) {
        history.timestamps.push(ts);
        history.temp.push(temp); history.hum.push(hum);
        history.ax.push(ax); history.ay.push(ay); history.az.push(az);
        history.tilt.push(tilt);
        history.lat.push(lat); history.lng.push(lng); history.ldr.push(ldr);
        history.boxStatus.push(boxText);
        // Trim
        if (history.timestamps.length > MAX_HISTORY) {
            Object.keys(history).forEach(k => history[k].shift());
        }
    }

    /* ==================== CHART.JS ==================== */
    function initChart() {
        const ctx = $('sensor-chart').getContext('2d');
        sensorChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Temperature (°C)',
                        data: [],
                        borderColor: '#00c3ff',
                        backgroundColor: 'rgba(0,195,255,.08)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 3,
                        pointBackgroundColor: '#00c3ff',
                        pointBorderWidth: 0
                    },
                    {
                        label: 'Humidity (%)',
                        data: [],
                        borderColor: '#00e676',
                        backgroundColor: 'rgba(0,230,118,.08)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 3,
                        pointBackgroundColor: '#00e676',
                        pointBorderWidth: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600, easing: 'easeOutQuart' },
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        labels: { color: '#8ea4bf', font: { family: 'Inter', size: 11 }, boxWidth: 14, padding: 16 }
                    },
                    tooltip: {
                        backgroundColor: '#132e4a',
                        titleColor: '#f0f4f8',
                        bodyColor: '#8ea4bf',
                        borderColor: 'rgba(0,195,255,.2)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 10
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#8ea4bf', font: { size: 10 }, maxTicksLimit: 8 },
                        grid: { color: 'rgba(255,255,255,.04)' }
                    },
                    y: {
                        ticks: { color: '#8ea4bf', font: { size: 10 } },
                        grid: { color: 'rgba(255,255,255,.04)' }
                    }
                }
            }
        });
    }

    function updateChart(timestamp, temp, hum) {
        if (!sensorChart) return;
        const labels = sensorChart.data.labels;
        labels.push(timestamp);
        sensorChart.data.datasets[0].data.push(temp);
        sensorChart.data.datasets[1].data.push(hum);
        if (labels.length > CHART_POINTS) {
            labels.shift();
            sensorChart.data.datasets[0].data.shift();
            sensorChart.data.datasets[1].data.shift();
        }
        sensorChart.update('none'); // skip animation for perf on each tick
    }

    /* ==================== GAUGES ==================== */
    function updateGauge(fillEl, valEl, value, min, max) {
        if (value === null || value === undefined) { valEl.textContent = '--'; return; }
        const pct = Math.min(Math.max((value - min) / (max - min), 0), 1);
        const offset = CIRCUMFERENCE * (1 - pct);
        fillEl.style.strokeDashoffset = offset;
        valEl.textContent = value;
    }

    /* ==================== MAP (LEAFLET) ==================== */
    function initMap() {
        map = L.map('map', {
            center: [19.076, 72.877],
            zoom: 14,
            zoomControl: true,
            attributionControl: true   // Ensure attribution is present
        });

        // Use proper tile URL with attribution to fix referer blocking
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Custom marker with pulsing effect
        const pulseIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                width: 22px; height: 22px;
                background: radial-gradient(circle,#4dd9ff 0%,#00c3ff 60%,#0091d5 100%);
                border-radius: 50%;
                border: 3.5px solid #fff;
                box-shadow: 0 0 16px rgba(0,195,255,.7), 0 0 36px rgba(0,195,255,.35), 0 2px 8px rgba(0,0,0,.4);
            "></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });

        marker = L.marker([19.076, 72.877], { icon: pulseIcon }).addTo(map);
        polyline = L.polyline([], { color: '#00c3ff', weight: 3, opacity: 0.7, smoothFactor: 1 }).addTo(map);

        // Fix tile rendering on hidden container
        setTimeout(() => map.invalidateSize(), 500);
    }

    function updateMap(lat, lng) {
        if (!map) return;
        const pos = [lat, lng];
        marker.setLatLng(pos);
        gpsPath.push(pos);
        if (gpsPath.length > MAX_HISTORY) gpsPath.shift();
        polyline.setLatLngs(gpsPath);
        if (window._transportFollowMode === undefined || window._transportFollowMode) {
            map.panTo(pos, { animate: true, duration: 0.5 });
        }
        if (window.onTransportUpdate) window.onTransportUpdate(lat, lng);
    }

    // Fullscreen map
    dom.btnFullscreen.addEventListener('click', () => {
        dom.mapPanel.classList.add('fullscreen');
        dom.btnFullscreen.classList.add('hidden');
        dom.btnMinimize.classList.remove('hidden');
        // Ensure info bar is visible in fullscreen
        const infoBar = document.getElementById('map-info-bar');
        if (infoBar && !infoBar.classList.contains('hidden')) {
            infoBar.style.display = 'flex';
        }
        setTimeout(() => map.invalidateSize(), 350);
    });
    dom.btnMinimize.addEventListener('click', () => {
        dom.mapPanel.classList.remove('fullscreen');
        dom.btnMinimize.classList.add('hidden');
        dom.btnFullscreen.classList.remove('hidden');
        setTimeout(() => map.invalidateSize(), 350);
    });

    /* ==================== ALERT SYSTEM (ENHANCED) ==================== */
    let alertShownForCycle = false;

    function checkAlerts(temp, accelMag, tilt, ldr, boxText) {
        const alerts = [];

        // Temperature alert uses dynamic thresholds from selected mode
        if (temp !== null && (temp > thresholds.tempHigh || temp < thresholds.tempLow)) {
            const modeInfo = TEMP_MODES[currentMode];
            alerts.push({
                sensor: 'temperature',
                msg: `Temperature ${temp}°C out of safe range (${thresholds.tempLow}–${thresholds.tempHigh}°C) [${modeInfo.label} Mode]`
            });
            $('card-temp').classList.add('alert-active');
        } else {
            $('card-temp').classList.remove('alert-active');
        }

        if (accelMag > thresholds.accelMax) {
            alerts.push({ sensor: 'acceleration', msg: `High acceleration detected: ${accelMag.toFixed(2)}g (threshold: ${thresholds.accelMax}g)` });
            $('card-ax').classList.add('alert-active');
            $('card-ay').classList.add('alert-active');
            $('card-az').classList.add('alert-active');
        } else {
            $('card-ax').classList.remove('alert-active');
            $('card-ay').classList.remove('alert-active');
            $('card-az').classList.remove('alert-active');
        }

        // Tilt angle alert
        if (tilt !== null && tilt > thresholds.tiltMax) {
            alerts.push({ sensor: 'tiltAngle', msg: `Tilt Angle Exceeded Safe Limit (${tilt}° > ${thresholds.tiltMax}°)` });
            const cardTilt = $('card-tilt');
            if (cardTilt) cardTilt.classList.add('alert-active');
        } else {
            const cardTilt = $('card-tilt');
            if (cardTilt) cardTilt.classList.remove('alert-active');
        }

        // LDR box tamper alert: ldr < 2000 = light detected = box OPEN
        if (boxText === 'OPEN') {
            alerts.push({ sensor: 'boxStatus', msg: 'Box tampering detected – lid is OPEN!' });
        }

        // Update last history entry
        history.alertStatus.push(alerts.length > 0 ? 'ALERT' : 'OK');
        if (history.alertStatus.length > MAX_HISTORY) history.alertStatus.shift();

        if (alerts.length > 0) {
            // === RED FLASH EFFECT (works for both Doctor & Patient Family) ===
            triggerRedFlash();

            // Show banner
            dom.alertBanner.classList.remove('hidden');
            dom.alertBannerText.textContent = alerts.map(a => a.msg).join(' | ');

            // Show popup only once per alert cycle
            if (!alertShownForCycle) {
                alertShownForCycle = true;
                dom.alertPopupTitle.textContent = '⚠️ Critical Alert!';
                dom.alertPopupMsg.textContent = alerts[0].msg;
                dom.alertPopup.classList.remove('hidden');
            }
        } else {
            dom.alertBanner.classList.add('hidden');
            stopRedFlash();
            alertShownForCycle = false;
        }
        if (window.onTransportAlert) window.onTransportAlert(alerts.length > 0);
    }

    /* --- Red Flash & Border Flash Effects --- */
    function triggerRedFlash() {
        if (!alertFlashing) {
            alertFlashing = true;
            // Full-screen red flash overlay
            dom.redFlashOverlay.classList.add('active');
            // Animated border flash on dashboard
            document.body.classList.add('alert-flashing');
        }
    }

    function stopRedFlash() {
        if (alertFlashing) {
            alertFlashing = false;
            dom.redFlashOverlay.classList.remove('active');
            document.body.classList.remove('alert-flashing');
        }
    }

    dom.alertDismiss.addEventListener('click', () => {
        dom.alertBanner.classList.add('hidden');
    });
    dom.alertPopupClose.addEventListener('click', () => {
        dom.alertPopup.classList.add('hidden');
    });

    /* ==================== SENSOR STATUS ==================== */
    function updateSensorStatus(id, working) {
        const el = $(id);
        if (!el) return;
        const dot  = el.querySelector('.status-dot');
        const text = el.querySelector('.status-text');
        if (working) {
            dot.className = 'status-dot working';
            text.textContent = 'Working';
        } else {
            dot.className = 'status-dot error';
            text.textContent = 'Not Working';
        }
    }

    /* ==================== SYSTEM CONTROL ==================== */
    dom.systemToggle.addEventListener('change', () => {
        if (dom.systemToggle.checked && window.checkRouteRequired && !window.checkRouteRequired()) {
            dom.systemToggle.checked = false;
            return;
        }
        systemOn = dom.systemToggle.checked;
        dom.controlLabel.textContent = systemOn ? 'System ON' : 'System OFF';
        dom.controlLabel.style.color = systemOn ? 'var(--green)' : 'var(--white)';
        blynkSet(pins.ctrl, systemOn ? 1 : 0);

        if (systemOn) {
            applySystemOnState();
        } else {
            applySystemOffState();
        }
    });

    /* --- System OFF: dim UI, clear alerts, show offline status --- */
    function applySystemOffState() {
        console.log('[SYSTEM] Entering OFF state — all updates paused');

        // Dim sensor cards visually
        document.querySelectorAll('.sensor-card').forEach(card => {
            card.classList.add('system-off');
            card.classList.remove('alert-active');
        });

        // Show "OFF" on all sensor values
        dom.valTemp.textContent = 'OFF';
        dom.valHum.textContent  = 'OFF';
        dom.valAx.textContent   = 'OFF';
        dom.valAy.textContent   = 'OFF';
        dom.valAz.textContent   = 'OFF';
        if (dom.valTilt) dom.valTilt.textContent = 'OFF';
        dom.valLat.textContent  = 'OFF';
        dom.valLng.textContent  = 'OFF';

        // Reset gauge values
        dom.gaugeTempVal.textContent  = 'OFF';
        dom.gaugeAccelVal.textContent = 'OFF';
        if (dom.gaugeTiltVal) dom.gaugeTiltVal.textContent = 'OFF';
        dom.gaugeLdrVal.textContent   = 'OFF';

        // Clear all alerts immediately
        dom.alertBanner.classList.add('hidden');
        dom.alertPopup.classList.add('hidden');
        stopRedFlash();

        // Mark all sensors as inactive
        updateSensorStatus('status-dht', false);
        updateSensorStatus('status-mpu', false);
        updateSensorStatus('status-ldr-sensor', false);
        updateSensorStatus('status-gps', false);

        // Update footer
        dom.lastUpdated.textContent = 'System OFF';
        if (window.onTransportSystemOff) window.onTransportSystemOff();
    }

    /* --- System ON: restore UI, resume normal operation --- */
    function applySystemOnState() {
        console.log('[SYSTEM] Entering ON state — all updates resumed');

        // Remove dimming from sensor cards
        document.querySelectorAll('.sensor-card').forEach(card => {
            card.classList.remove('system-off');
        });

        // Values will be updated on next fetchData cycle
        dom.lastUpdated.textContent = 'Resuming…';
        if (window.onTransportSystemOn) window.onTransportSystemOn();
    }

    /* ==================== CSV DOWNLOAD (DOCTOR ONLY) ==================== */
    dom.btnCsv.addEventListener('click', () => {
        const headers = ['Timestamp','Temperature(°C)','Humidity(%)','AccX(g)','AccY(g)','AccZ(g)','Angle(°)','Latitude','Longitude','LDR','Alert'];
        const rows = [];
        const len = history.timestamps.length;
        const start = Math.max(0, len - 1000);

        for (let i = start; i < len; i++) {
            rows.push([
                history.timestamps[i],
                history.temp[i], history.hum[i],
                history.ax[i], history.ay[i], history.az[i],
                history.tilt[i] !== undefined ? history.tilt[i] : '',
                history.lat[i], history.lng[i],
                history.ldr[i],
                history.alertStatus[i] || 'OK'
            ].join(','));
        }

        const csv = headers.join(',') + '\n' + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const fname = `organ_data_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.csv`;

        const a = document.createElement('a');
        a.href = url; a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    /* ==================== TRANSPORT MODULE BRIDGE ==================== */
    window._transport = {
        get map() { return map; },
        get marker() { return marker; },
        set marker(m) { marker = m; },
        get polyline() { return polyline; },
        get gpsPath() { return gpsPath; },
        get systemOn() { return systemOn; },
        get currentRole() { return currentRole; },
    };

    /* ==================== AUTO-LOGIN CHECK ==================== */
    (function checkSession() {
        const savedRole = localStorage.getItem('userRole');
        if (savedRole) {
            currentRole = savedRole;
            startLoadingSequence();
        }
    })();

})();
