/* ================================================================
   TRANSPORT MODULE – Route Setup, ETA, Progress, Indicators
   Modular extension for the Organ Transport Monitor dashboard
   ================================================================ */
(function () {
    'use strict';

    /* ---- State ---- */
    let routeStart = null, routeEnd = null;
    let routePolyline = null, startMarkerR = null, endMarkerR = null;
    let routeCoords = [], totalRouteDist = 0, routeSet = false;
    let indicatorType = 'bluedot', followMode = true;
    let orsApiKey = '', etaTimer = null;
    let modalMap = null, modalClickCount = 0;
    let modalStartM = null, modalEndM = null;
    let isRouteAlerted = false, isFallback = false;

    /* ---- Patient poller (module-level so no hoisting issue) ---- */
    let patientRoutePoller = null;
    let patientPollerTimeout = null;

    /* ---- DOM ---- */
    const $ = id => document.getElementById(id);
    const d = {
        routeModal: $('route-modal'),
        startInput: $('route-start-input'),
        endInput: $('route-end-input'),
        startSearch: $('route-start-search'),
        endSearch: $('route-end-search'),
        startResults: $('route-start-results'),
        endResults: $('route-end-results'),
        routeStatus: $('route-status'),
        btnSetRoute: $('btn-set-route'),
        infoBar: $('map-info-bar'),
        distLabel: $('map-distance'),
        etaLabel: $('map-eta'),
        progText: $('map-progress-text'),
        progFill: $('map-progress-fill'),
        settingsPanel: $('map-settings-panel'),
        btnMapSettings: $('btn-map-settings'),
        btnCloseSettings: $('btn-close-map-settings'),
        btnFollow: $('btn-follow'),
        btnModifyRoute: $('btn-modify-route'),
        orsInput: $('ors-api-key'),
        btnSaveOrs: $('btn-save-ors'),
        confirmDlg: $('route-confirm-dialog'),
        btnConfirmNo: $('btn-confirm-cancel'),
        btnConfirmYes: $('btn-confirm-yes'),
        sysToggle: $('system-toggle'),
    };

    /* ==================== ICONS ==================== */
    function blueDotIcon() {
        return L.divIcon({
            className: 'custom-marker',
            html: '<div style="width:22px;height:22px;background:radial-gradient(circle,#4dd9ff 0%,#00c3ff 60%,#0091d5 100%);border-radius:50%;border:3.5px solid #fff;box-shadow:0 0 16px rgba(0,195,255,.7),0 0 36px rgba(0,195,255,.35),0 2px 8px rgba(0,0,0,.4);"></div>',
            iconSize: [22, 22], iconAnchor: [11, 11]
        });
    }
    function ambulanceIcon() {
        return L.divIcon({
            className: 'custom-marker',
            html: '<svg class="ambulance-marker" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">'
                + '<rect x="2" y="9" width="24" height="17" rx="3.5" fill="#fff" stroke="#e0e0e0" stroke-width=".5"/>'
                + '<rect x="26" y="13" width="12" height="13" rx="2.5" fill="#fff" stroke="#e0e0e0" stroke-width=".5"/>'
                + '<rect x="11" y="13" width="3" height="8" rx="1.2" fill="#00c3ff"/>'
                + '<rect x="9" y="15.5" width="7.5" height="3" rx="1.2" fill="#00c3ff"/>'
                + '<rect x="28" y="15.5" width="6" height="4.5" rx="1.2" fill="rgba(0,195,255,.3)" stroke="rgba(0,195,255,.25)" stroke-width=".5"/>'
                + '<circle cx="11" cy="27.5" r="3" fill="#334" stroke="#fff" stroke-width="1.2"/>'
                + '<circle cx="31" cy="27.5" r="3" fill="#334" stroke="#fff" stroke-width="1.2"/>'
                + '<rect x="3" y="9" width="24" height="3" rx="2" fill="#ff3d5a" opacity=".18"/>'
                + '</svg>',
            iconSize: [40, 40], iconAnchor: [20, 20]
        });
    }
    function startIcon() {
        return L.divIcon({
            className: '',
            html: '<div class="route-marker-start"><i class="fas fa-hospital" style="font-size:.65rem"></i></div>',
            iconSize: [28, 28], iconAnchor: [14, 14]
        });
    }
    function endIcon() {
        return L.divIcon({
            className: '',
            html: '<div class="route-marker-end"><i class="fas fa-hospital" style="font-size:.65rem"></i></div>',
            iconSize: [28, 28], iconAnchor: [14, 14]
        });
    }

    /* ==================== UTILS ==================== */
    function haversine(lat1, lng1, lat2, lng2) {
        const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /* ==================== GEOCODING ==================== */
    async function searchLoc(query) {
        if (!query || query.length < 3) return [];
        try {
            const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=5');
            return await r.json();
        } catch { return []; }
    }
    async function reverseGeo(lat, lng) {
        try {
            const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng);
            const j = await r.json();
            return j.display_name || lat.toFixed(4) + ', ' + lng.toFixed(4);
        } catch { return lat.toFixed(4) + ', ' + lng.toFixed(4); }
    }
    function showResults(container, results, type) {
        container.innerHTML = '';
        if (!results.length) { container.classList.add('hidden'); return; }
        results.forEach(r => {
            const el = document.createElement('div');
            el.className = 'route-search-result-item';
            el.textContent = r.display_name;
            el.addEventListener('click', () => {
                setModalPoint(type, parseFloat(r.lat), parseFloat(r.lon), r.display_name);
                container.classList.add('hidden');
            });
            container.appendChild(el);
        });
        container.classList.remove('hidden');
    }

    /* ==================== MODAL MAP ==================== */
    function initModalMap() {
        if (modalMap) { modalMap.remove(); modalMap = null; }
        modalMap = L.map('route-modal-map', { center: [20.59, 78.96], zoom: 5, zoomControl: true, attributionControl: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(modalMap);
        if (routeStart) {
            modalStartM = L.marker([routeStart.lat, routeStart.lng], { icon: startIcon() }).addTo(modalMap);
            d.startInput.value = routeStart.name || '';
        }
        if (routeEnd) {
            modalEndM = L.marker([routeEnd.lat, routeEnd.lng], { icon: endIcon() }).addTo(modalMap);
            d.endInput.value = routeEnd.name || '';
        }
        modalClickCount = (routeStart ? 1 : 0) + (routeEnd ? 1 : 0);
        modalMap.on('click', async e => {
            const { lat, lng } = e.latlng;
            const name = await reverseGeo(lat, lng);
            if (modalClickCount % 2 === 0) setModalPoint('start', lat, lng, name);
            else setModalPoint('end', lat, lng, name);
            modalClickCount++;
        });
        setTimeout(() => modalMap.invalidateSize(), 200);
    }
    function setModalPoint(type, lat, lng, name) {
        if (type === 'start') {
            routeStart = { lat, lng, name };
            d.startInput.value = name;
            if (modalStartM && modalMap) modalMap.removeLayer(modalStartM);
            modalStartM = L.marker([lat, lng], { icon: startIcon() }).addTo(modalMap);
            if (!routeEnd) modalClickCount = 1;
        } else {
            routeEnd = { lat, lng, name };
            d.endInput.value = name;
            if (modalEndM && modalMap) modalMap.removeLayer(modalEndM);
            modalEndM = L.marker([lat, lng], { icon: endIcon() }).addTo(modalMap);
        }
        checkReady();
    }
    function checkReady() {
        if (routeStart && routeEnd) {
            d.btnSetRoute.disabled = false;
            d.routeStatus.innerHTML = '<i class="fas fa-check-circle"></i> Route ready \u2014 click to continue';
            d.routeStatus.classList.add('ready');
        } else {
            d.btnSetRoute.disabled = true;
            d.routeStatus.innerHTML = '<i class="fas fa-info-circle"></i> Set ' + (!routeStart ? 'start' : 'destination') + ' location to continue';
            d.routeStatus.classList.remove('ready');
        }
    }
    function showRouteModal() {
        d.routeModal.classList.remove('hidden');
        setTimeout(() => initModalMap(), 150);
        checkReady();
    }
    function hideRouteModal() {
        d.routeModal.classList.add('hidden');
        if (modalMap) { modalMap.remove(); modalMap = null; }
        modalStartM = null; modalEndM = null;
    }

    /* ==================== ROUTE FETCH & DRAW ==================== */
    async function fetchAndDrawRoute() {
        if (!routeStart || !routeEnd) return;
        const map = window._transport.map;
        clearRoute();
        if (orsApiKey) {
            try {
                const url = 'https://api.openrouteservice.org/v2/directions/driving-car?api_key=' + orsApiKey
                    + '&start=' + routeStart.lng + ',' + routeStart.lat
                    + '&end=' + routeEnd.lng + ',' + routeEnd.lat;
                const r = await fetch(url);
                if (!r.ok) throw new Error('ORS ' + r.status);
                const data = await r.json();
                routeCoords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
                totalRouteDist = data.features[0].properties.summary.distance / 1000;
                isFallback = false;
            } catch (e) {
                console.warn('[ROUTE] ORS failed, fallback:', e);
                fallbackRoute();
            }
        } else {
            fallbackRoute();
        }
        drawRoute();
    }

    function fallbackRoute() {
        isFallback = true;
        routeCoords = [[routeStart.lat, routeStart.lng], [routeEnd.lat, routeEnd.lng]];
        totalRouteDist = haversine(routeStart.lat, routeStart.lng, routeEnd.lat, routeEnd.lng);
    }

    function drawRoute() {
        const map = window._transport.map;
        routePolyline = L.polyline(routeCoords, {
            color: '#00c3ff', weight: 4, opacity: 0.7, smoothFactor: 1,
            dashArray: isFallback ? '10, 10' : null
        }).addTo(map);
        startMarkerR = L.marker([routeStart.lat, routeStart.lng], { icon: startIcon() })
            .bindTooltip('Donor Hospital', { direction: 'top' }).addTo(map);
        endMarkerR = L.marker([routeEnd.lat, routeEnd.lng], { icon: endIcon() })
            .bindTooltip('Recipient Hospital', { direction: 'top' }).addTo(map);
        map.fitBounds(
            L.latLngBounds([[routeStart.lat, routeStart.lng], [routeEnd.lat, routeEnd.lng]]).pad(0.15)
        );
        routeSet = true;

        // FIX: Only touch system toggle elements when role is doctor
        if (window._transport.currentRole === 'doctor') {
            const tw = d.sysToggle ? d.sysToggle.closest('.toggle-switch') : null;
            if (tw) { tw.classList.remove('route-required'); }
            const hint = document.querySelector('.route-required-hint');
            if (hint) hint.remove();
        }

        // Info bar — visible to all roles
        d.infoBar.classList.remove('hidden');
        d.distLabel.textContent = isFallback
            ? '~' + totalRouteDist.toFixed(1) + ' km (approx)'
            : totalRouteDist.toFixed(1) + ' km';
        d.etaLabel.textContent = isFallback ? 'ETA unavailable' : 'ETA: calculating\u2026';
        d.progText.textContent = 'Progress: 0%';
        d.progFill.style.width = '0%';
        saveStorage();
    }

    function clearRoute() {
        const map = window._transport.map;
        if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
        if (startMarkerR) { map.removeLayer(startMarkerR); startMarkerR = null; }
        if (endMarkerR) { map.removeLayer(endMarkerR); endMarkerR = null; }
    }

    /* ==================== ETA & PROGRESS ==================== */
    function startETA() {
        stopETA();
        etaTimer = setInterval(() => {
            const trail = window._transport.gpsPath;
            if (trail.length) { const p = trail[trail.length - 1]; updateETA(p[0], p[1]); }
        }, 5000);
    }
    function stopETA() { if (etaTimer) { clearInterval(etaTimer); etaTimer = null; } }
    function updateETA(lat, lng) {
        if (!routeSet || !routeCoords.length) return;
        let minD = Infinity, nearIdx = 0;
        for (let i = 0; i < routeCoords.length; i++) {
            const dd = haversine(lat, lng, routeCoords[i][0], routeCoords[i][1]);
            if (dd < minD) { minD = dd; nearIdx = i; }
        }
        let covered = 0;
        for (let i = 0; i < nearIdx && i < routeCoords.length - 1; i++) {
            covered += haversine(routeCoords[i][0], routeCoords[i][1], routeCoords[i + 1][0], routeCoords[i + 1][1]);
        }
        const pct = Math.min(Math.max(covered / totalRouteDist * 100, 0), 100);
        const remain = totalRouteDist - covered;
        const etaMins = Math.max(Math.round(remain / 60 * 60), 0);
        d.progText.textContent = 'Progress: ' + Math.round(pct) + '%';
        d.progFill.style.width = pct + '%';
        if (!isFallback) {
            d.etaLabel.textContent = etaMins > 60
                ? 'Arriving in ' + Math.floor(etaMins / 60) + 'h ' + (etaMins % 60) + 'm'
                : 'Arriving in ' + etaMins + ' min';
        }
    }

    /* ==================== INDICATOR ==================== */
    function setIndicator(type) {
        indicatorType = type;
        localStorage.setItem('indicatorType', type);
        const map = window._transport.map;
        const oldMarker = window._transport.marker;
        if (!map || !oldMarker) return;

        // Capture current position before removing
        const pos = oldMarker.getLatLng();
        const icon = type === 'ambulance' ? ambulanceIcon() : blueDotIcon();

        // Remove old marker completely
        map.removeLayer(oldMarker);

        // Create new marker at same position
        const newMarker = L.marker(pos, { icon: icon }).addTo(map);

        // CRITICAL: Sync reference so updateMap() in app.js uses the new marker
        window._transport.marker = newMarker;

        // Update button active states
        document.querySelectorAll('.msp-option').forEach(b =>
            b.classList.toggle('active', b.dataset.indicator === type));
    }

    /* ==================== FOLLOW MODE ==================== */
    function toggleFollow() {
        followMode = !followMode;
        window._transportFollowMode = followMode;
        d.btnFollow.classList.toggle('active', followMode);
    }

    /* ==================== ALERT ROUTE VIZ ==================== */
    function setRouteAlert(has) {
        if (!routePolyline) return;
        if (has && !isRouteAlerted) {
            isRouteAlerted = true;
            routePolyline.setStyle({ color: '#ff3d5a', weight: 5 });
            const el = routePolyline.getElement();
            if (el) el.classList.add('route-alert-active');
        } else if (!has && isRouteAlerted) {
            isRouteAlerted = false;
            routePolyline.setStyle({ color: '#00c3ff', weight: 4 });
            const el = routePolyline.getElement();
            if (el) el.classList.remove('route-alert-active');
        }
    }

    /* ==================== STORAGE ==================== */
    function saveStorage() {
        localStorage.setItem('transportRoute', JSON.stringify({ start: routeStart, end: routeEnd, orsApiKey }));
    }
    function loadStorage() {
        try {
            const s = JSON.parse(localStorage.getItem('transportRoute'));
            if (s) {
                routeStart = s.start || null;
                routeEnd = s.end || null;
                orsApiKey = s.orsApiKey || '';
            }
        } catch { /* ignore */ }
        indicatorType = localStorage.getItem('indicatorType') || 'bluedot';
    }

    /* ==================== PATIENT ROUTE POLLER ==================== */
    function stopPatientPoller() {
        if (patientRoutePoller) { clearInterval(patientRoutePoller); patientRoutePoller = null; }
        if (patientPollerTimeout) { clearTimeout(patientPollerTimeout); patientPollerTimeout = null; }
    }

    function startPatientPoller() {
        stopPatientPoller(); // clear any previous poller first

        function tryDraw() {
            loadStorage();
            if (routeStart && routeEnd) {
                stopPatientPoller(); // found route — stop polling immediately
                const m = window._transport.map;
                // Ensure map container is correctly sized before drawing
                if (m) m.invalidateSize();
                fetchAndDrawRoute().then(() => {
                    // Post-draw: re-invalidate and re-fit to ensure full visibility
                    setTimeout(() => {
                        if (m) {
                            m.invalidateSize();
                            // Re-fit bounds so markers + route are in viewport
                            if (routeStart && routeEnd) {
                                m.fitBounds(
                                    L.latLngBounds(
                                        [[routeStart.lat, routeStart.lng], [routeEnd.lat, routeEnd.lng]]
                                    ).pad(0.15)
                                );
                            }
                        }
                    }, 500);
                });
            }
        }

        // Set up interval/timeout FIRST so stopPatientPoller() inside tryDraw can clear them
        patientRoutePoller = setInterval(tryDraw, 5000);
        patientPollerTimeout = setTimeout(stopPatientPoller, 300000);

        // Delay first attempt to let map fully initialize (tiles + container size)
        setTimeout(tryDraw, 800);
    }

    /* ==================== SETTINGS ==================== */
    function openSettings() { d.settingsPanel.classList.remove('hidden'); }
    function closeSettings() { d.settingsPanel.classList.add('hidden'); }
    function requestModifyRoute() {
        closeSettings();
        if (window._transport.systemOn) d.confirmDlg.classList.remove('hidden');
        else showRouteModal();
    }

    /* ==================== INIT ==================== */
    function init() {
        loadStorage();
        if (d.orsInput) d.orsInput.value = orsApiKey;
        const app = window._transport;
        if (app && app.marker) setIndicator(indicatorType);

        if (app.currentRole === 'doctor') {
            // ── DOCTOR BRANCH ──────────────────────────────────────────
            if (!routeStart || !routeEnd) {
                const tw = d.sysToggle ? d.sysToggle.closest('.toggle-switch') : null;
                if (tw) {
                    tw.classList.add('route-required');
                    const h = document.createElement('div');
                    h.className = 'route-required-hint';
                    h.innerHTML = '<i class="fas fa-exclamation-circle"></i> Set transport route first';
                    tw.parentElement.appendChild(h);
                }
                setTimeout(() => showRouteModal(), 600);
            } else {
                fetchAndDrawRoute();
            }

            // Doctor-only event listeners
            if (d.btnMapSettings) {
                d.btnMapSettings.addEventListener('click', () => {
                    d.settingsPanel.classList.contains('hidden') ? openSettings() : closeSettings();
                });
            }
            if (d.btnCloseSettings) d.btnCloseSettings.addEventListener('click', closeSettings);

            // Indicator option button click handlers
            document.querySelectorAll('.msp-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    const ind = btn.dataset.indicator;
                    if (ind) setIndicator(ind);
                });
            });
            if (d.btnModifyRoute) d.btnModifyRoute.addEventListener('click', requestModifyRoute);
            if (d.btnSaveOrs) {
                d.btnSaveOrs.addEventListener('click', () => {
                    orsApiKey = d.orsInput.value.trim();
                    saveStorage();
                    if (routeSet) fetchAndDrawRoute();
                });
            }
            if (d.btnConfirmNo) d.btnConfirmNo.addEventListener('click', () => d.confirmDlg.classList.add('hidden'));
            if (d.btnConfirmYes) d.btnConfirmYes.addEventListener('click', () => {
                d.confirmDlg.classList.add('hidden');
                clearRoute(); routeSet = false;
                d.infoBar.classList.add('hidden');
                stopETA();
                showRouteModal();
            });
            if (d.btnSetRoute) {
                d.btnSetRoute.addEventListener('click', async () => {
                    hideRouteModal();
                    await fetchAndDrawRoute();
                });
            }
            if (d.startSearch) {
                d.startSearch.addEventListener('click', async () => {
                    showResults(d.startResults, await searchLoc(d.startInput.value), 'start');
                });
            }
            if (d.endSearch) {
                d.endSearch.addEventListener('click', async () => {
                    showResults(d.endResults, await searchLoc(d.endInput.value), 'end');
                });
            }
            if (d.startInput) {
                d.startInput.addEventListener('keydown', async e => {
                    if (e.key === 'Enter') { e.preventDefault(); showResults(d.startResults, await searchLoc(d.startInput.value), 'start'); }
                });
            }
            if (d.endInput) {
                d.endInput.addEventListener('keydown', async e => {
                    if (e.key === 'Enter') { e.preventDefault(); showResults(d.endResults, await searchLoc(d.endInput.value), 'end'); }
                });
            }
            document.addEventListener('click', e => {
                if (!e.target.closest('.route-input-group')) {
                    if (d.startResults) d.startResults.classList.add('hidden');
                    if (d.endResults) d.endResults.classList.add('hidden');
                }
            });

        } else {
            // ── PATIENT BRANCH ─────────────────────────────────────────
            // Hide all doctor-only map controls
            if (d.btnMapSettings) d.btnMapSettings.classList.add('hidden');
            if (d.settingsPanel) d.settingsPanel.classList.add('hidden');

            // Draw route with polling fallback — no event listeners needed
            startPatientPoller();
        }

        // ── SHARED EVENT LISTENERS (both roles) ──────────────────────
        if (d.btnFollow) d.btnFollow.addEventListener('click', toggleFollow);

        window._transportFollowMode = followMode;
    }

    /* ==================== EXPOSE HOOKS ==================== */
    window.initTransport = init;
    window._transportFollowMode = true;

    window.checkRouteRequired = () => {
        return !(window._transport.currentRole === 'doctor' && !routeSet);
    };
    window.onTransportUpdate = (lat, lng) => {
        if (routeSet) updateETA(lat, lng);
    };
    window.onTransportAlert = has => setRouteAlert(has);
    window.onTransportSystemOn = () => { if (routeSet) startETA(); };
    window.onTransportSystemOff = () => { stopETA(); setRouteAlert(false); };
    window.onTransportLogout = () => {
        stopETA();
        stopPatientPoller();
        clearRoute();
        routeSet = false;
        routeStart = null;
        routeEnd = null;
        hideRouteModal();
        if (d.infoBar) d.infoBar.classList.add('hidden');
        closeSettings();
        if (d.confirmDlg) d.confirmDlg.classList.add('hidden');
        setRouteAlert(false);
    };
})();