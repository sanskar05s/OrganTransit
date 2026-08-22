/* ===================================================================
   AI ASSISTANT – Feature 1: Floating Chat Assistant
   Organ Transport Monitor · Powered by Gemini
   =================================================================== */

(function () {
    'use strict';

    const AI_SERVER = 'http://localhost:5000';

    /* ==================== TEMPERATURE MODE REFERENCE ==================== */
    const TEMP_MODES = {
        cold:      { label: 'Cold Storage', low: 2,  high: 8  },
        perfusion: { label: 'Perfusion',    low: 20, high: 37 },
        demo:      { label: 'Demo',         low: 25, high: 30 }
    };

    /* ==================== STATE ==================== */
    let chatOpen = false;
    let welcomeShown = false;

    /* ==================== INJECT DOM ELEMENTS ==================== */
    document.body.insertAdjacentHTML('beforeend', `
        <div id="ai-float-btn" aria-label="Open AI Chat Assistant">
            <i class="fas fa-brain"></i>
            <div id="ai-notif-dot"></div>
        </div>

        <div id="ai-chat-panel" aria-label="AI Medical Assistant">
            <div id="ai-chat-header">
                <div id="ai-chat-header-info">
                    <i class="fas fa-brain"></i>
                    <div>
                        <div id="ai-chat-title">AI Medical Assistant</div>
                        <div id="ai-chat-subtitle">Powered by Gemini · Live sensor context</div>
                    </div>
                </div>
                <button id="ai-chat-close" aria-label="Close chat">×</button>
            </div>
            <div id="ai-chat-messages"></div>
            <div id="ai-chat-footer">
                <button id="ai-chat-reset" title="Reset conversation">↺</button>
                <input id="ai-chat-input" type="text"
                       placeholder="Ask about the organ transport..." autocomplete="off">
                <button id="ai-chat-send" aria-label="Send">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `);

    /* ==================== DOM REFS ==================== */
    const floatBtn   = document.getElementById('ai-float-btn');
    const notifDot   = document.getElementById('ai-notif-dot');
    const chatPanel  = document.getElementById('ai-chat-panel');
    const chatClose  = document.getElementById('ai-chat-close');
    const chatMsgs   = document.getElementById('ai-chat-messages');
    const chatInput  = document.getElementById('ai-chat-input');
    const chatSend   = document.getElementById('ai-chat-send');
    const chatReset  = document.getElementById('ai-chat-reset');

    /* ==================== TOGGLE CHAT ==================== */
    function openChat() {
        chatOpen = true;
        chatPanel.classList.add('open');
        floatBtn.classList.add('chat-open');
        notifDot.classList.remove('visible');
        if (!welcomeShown) {
            showWelcome();
            welcomeShown = true;
        }
        chatInput.focus();
    }

    function closeChat() {
        chatOpen = false;
        chatPanel.classList.remove('open');
        floatBtn.classList.remove('chat-open');
    }

    floatBtn.addEventListener('click', () => {
        if (chatOpen) closeChat();
        else openChat();
    });

    chatClose.addEventListener('click', closeChat);

    /* ==================== WELCOME MESSAGE ==================== */
    function showWelcome() {
        appendMessage('ai', `Hello Doctor. I'm monitoring this organ transport in real time.\nAsk me anything — temperature trends, shock events, route viability, or any concerns.`);
    }

    /* ==================== MESSAGE HELPERS ==================== */
    function appendMessage(type, text) {
        const div = document.createElement('div');
        div.className = `ai-msg ${type}`;
        div.textContent = text;
        chatMsgs.appendChild(div);
        scrollToBottom();
    }

    function appendTypingIndicator() {
        const div = document.createElement('div');
        div.className = 'ai-typing';
        div.id = 'ai-typing-indicator';
        div.innerHTML = `
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
        `;
        chatMsgs.appendChild(div);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const el = document.getElementById('ai-typing-indicator');
        if (el) el.remove();
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatMsgs.scrollTop = chatMsgs.scrollHeight;
        });
    }

    /* ==================== SENSOR CONTEXT BUILDER ==================== */
    function getLiveSensorContext() {
        const safeText = (id) => {
            const el = document.getElementById(id);
            if (!el) return 'unavailable';
            const t = el.textContent.trim();
            return (t === '--' || t === 'OFF' || t === '') ? 'unavailable' : t;
        };

        // Temperature
        const tempVal = safeText('val-temp');

        // Temperature mode
        const tempMode = localStorage.getItem('tempMode') || 'cold';
        const modeInfo = TEMP_MODES[tempMode] || TEMP_MODES.cold;

        // Humidity
        const humVal = safeText('val-hum');

        // Acceleration
        const axVal = safeText('val-ax');
        const ayVal = safeText('val-ay');
        const azVal = safeText('val-az');
        let accelMag = 'unavailable';
        if (axVal !== 'unavailable' && ayVal !== 'unavailable' && azVal !== 'unavailable') {
            const ax = parseFloat(axVal) || 0;
            const ay = parseFloat(ayVal) || 0;
            const az = parseFloat(azVal) || 0;
            accelMag = Math.sqrt(ax * ax + ay * ay + az * az).toFixed(2);
        }

        // Tilt
        const tiltVal = safeText('val-tilt');

        // LDR
        const ldrVal = safeText('gauge-ldr-val');
        let containerStatus = 'unavailable';
        if (ldrVal !== 'unavailable' && ldrVal !== 'OFF') {
            const ldrNum = parseFloat(ldrVal);
            containerStatus = isNaN(ldrNum) ? 'unavailable' : (ldrNum < 2000 ? 'Open' : 'Closed');
        }

        // GPS
        const latVal = safeText('val-lat');
        const lngVal = safeText('val-lng');

        // Active alerts
        const alertBannerText = document.getElementById('alert-banner-text');
        const alertBanner = document.getElementById('alert-banner');
        let activeAlerts = 'None';
        if (alertBanner && !alertBanner.classList.contains('hidden') && alertBannerText) {
            const txt = alertBannerText.textContent.trim();
            if (txt) activeAlerts = txt;
        }

        return [
            `Temperature: ${tempVal}°C  (Mode: ${modeInfo.label} | Safe range: ${modeInfo.low}–${modeInfo.high}°C)`,
            `Humidity: ${humVal}%`,
            `Acceleration: ${accelMag}g  |  Tilt: ${tiltVal}°`,
            `LDR: ${ldrVal}  (Container: ${containerStatus} — threshold 2000)`,
            `GPS: ${latVal}°, ${lngVal}°`,
            `Active alerts: ${activeAlerts}`
        ].join('\n');
    }

    /* ==================== SEND MESSAGE ==================== */
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.value = '';
        appendMessage('user', text);
        appendTypingIndicator();

        const sensors = getLiveSensorContext();

        try {
            const res = await fetch(`${AI_SERVER}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, sensors: sensors })
            });

            removeTypingIndicator();

            if (!res.ok) throw new Error('Server error');

            const data = await res.json();
            appendMessage('ai', data.reply || 'No response from AI.');

            // Notification dot if panel is closed
            if (!chatOpen) {
                notifDot.classList.add('visible');
            }
        } catch (err) {
            removeTypingIndicator();
            const errorDiv = document.createElement('div');
            errorDiv.className = 'ai-msg error';
            errorDiv.textContent = '⚠ AI server is offline. Please run server.py first.';
            chatMsgs.appendChild(errorDiv);
            scrollToBottom();
        }
    }

    chatSend.addEventListener('click', sendMessage);

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    /* ==================== RESET CONVERSATION ==================== */
    chatReset.addEventListener('click', async () => {
        try {
            await fetch(`${AI_SERVER}/reset`, { method: 'POST' });
        } catch (_) { /* silent — server may be offline */ }

        chatMsgs.innerHTML = '';
        welcomeShown = false;
        showWelcome();
        welcomeShown = true;
    });

    console.log('[AI Assistant] Feature 1 — Floating Chat loaded');

    /* ===================================================================
       FEATURE 2 — AI Intelligence Panel (Status Bar)
       =================================================================== */

    /* ==================== INJECT AI PANEL INTO DOM ==================== */
    const dashboardHeader = document.getElementById('dashboard-header');
    if (dashboardHeader) {
        dashboardHeader.insertAdjacentHTML('afterend', `
            <div id="ai-intelligence-panel">

                <!-- Panel Header -->
                <div id="ai-panel-header">
                    <div id="ai-panel-header-left">
                        <i class="fas fa-brain"></i>
                        <span>AI Intelligence</span>
                        <span id="ai-panel-tag">Powered by Gemini</span>
                    </div>
                    <div id="ai-panel-header-right">
                        <span id="ai-panel-last-updated"></span>
                        <button id="ai-panel-refresh" title="Refresh now">
                            <i class="fas fa-rotate"></i>
                        </button>
                        <button id="ai-panel-close" title="Close AI Panel">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <!-- AI Status Bar -->
                <div id="ai-status-section">
                    <div id="ai-status-left">
                        <div id="ai-status-indicator">
                            <div id="ai-status-dot"></div>
                            <span id="ai-status-label">Analyzing...</span>
                        </div>
                    </div>
                    <div id="ai-status-text">
                        Connecting to AI... waiting for sensor data.
                    </div>
                    <div id="ai-status-badge">--</div>
                </div>

            </div>
        `);
    }

    /* ==================== TOGGLE BEHAVIOR ==================== */
    const toggleBtn = document.getElementById('ai-panel-toggle');
    const aiPanel = document.getElementById('ai-intelligence-panel');
    let lastStatusFetch = null;
    let statusInterval = null;

    if (toggleBtn && aiPanel) {
        toggleBtn.addEventListener('click', () => {
            const isOpen = aiPanel.classList.contains('open');
            if (isOpen) {
                aiPanel.classList.remove('open');
                toggleBtn.classList.remove('active');
            } else {
                aiPanel.classList.add('open');
                toggleBtn.classList.add('active');
                // Trigger immediate status update when opened
                if (!lastStatusFetch || Date.now() - lastStatusFetch > 15000) {
                    fetchAIStatus();
                }
            }
        });
    }

    /* ==================== AUTO STATUS FETCH ==================== */
    async function fetchAIStatus() {
        const statusText = document.getElementById('ai-status-text');
        const statusBadge = document.getElementById('ai-status-badge');
        const statusDot = document.getElementById('ai-status-dot');
        const statusLabel = document.getElementById('ai-status-label');
        const lastUpdated = document.getElementById('ai-panel-last-updated');

        if (!statusText) return;

        // Show loading state
        statusText.classList.add('loading');
        statusText.textContent = 'Analyzing live sensor data...';

        try {
            const res = await fetch(`${AI_SERVER}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensors: getLiveSensorContext() })
            });
            const data = await res.json();

            // Parse status word (last line: Safe / Caution / Critical)
            const lines = data.reply.trim().split('\n');
            const statusWord = lines[lines.length - 1].trim();
            const summaryText = lines.slice(0, -1).join(' ').trim() || data.reply;

            // Update UI
            statusText.textContent = summaryText;
            statusText.classList.remove('loading');

            // Badge and dot color
            const statusMap = {
                'Safe':     { badge: 'safe',     dot: '#00e676', label: 'Safe' },
                'Caution':  { badge: 'caution',  dot: '#ffb300', label: 'Caution' },
                'Critical': { badge: 'critical', dot: '#ff3d5a', label: 'Critical' }
            };
            const s = statusMap[statusWord] || statusMap['Caution'];
            statusBadge.textContent = s.label;
            statusBadge.className = 'status-badge-' + s.badge;
            statusDot.style.background = s.dot;
            if (statusLabel) statusLabel.textContent = s.label;

            // Last updated time
            lastStatusFetch = Date.now();
            if (lastUpdated) {
                const now = new Date();
                lastUpdated.textContent = 'Updated ' + now.getHours().toString().padStart(2, '0')
                    + ':' + now.getMinutes().toString().padStart(2, '0')
                    + ':' + now.getSeconds().toString().padStart(2, '0');
            }

        } catch (e) {
            statusText.textContent = '⚠ AI server offline. Run server.py to enable AI features.';
            statusText.classList.remove('loading');
        }
    }

    // Auto-refresh every 30 seconds
    statusInterval = setInterval(() => {
        const panel = document.getElementById('ai-intelligence-panel');
        if (panel && panel.classList.contains('open')) {
            fetchAIStatus();
        }
    }, 30000);

    // Manual refresh button
    document.getElementById('ai-panel-refresh')
        ?.addEventListener('click', fetchAIStatus);

    // Close button
    document.getElementById('ai-panel-close')
        ?.addEventListener('click', () => {
            document.getElementById('ai-intelligence-panel')?.classList.remove('open');
            document.getElementById('ai-panel-toggle')?.classList.remove('active');
        });

    console.log('[AI Assistant] Feature 2 — AI Intelligence Panel loaded');

    /* ===================================================================
       FEATURE 3 — AI Alert Explainer
       Observes alert banner & popup, injects "Explain" buttons,
       fetches 2-sentence medical explanations from /explain-alert
       =================================================================== */

    /* ==================== INJECT EXPLAIN BUTTON INTO ALERT BANNER ==================== */
    function injectBannerExplainBtn() {
        const banner = document.getElementById('alert-banner');
        if (!banner) return;

        // Don't inject twice
        if (banner.querySelector('.ai-explain-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'ai-explain-btn ai-explain-btn-banner';
        btn.innerHTML = '<i class="fas fa-brain"></i> Explain';
        btn.title = 'Get AI medical explanation for this alert';

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await handleBannerExplain(banner, btn);
        });

        // Insert before the dismiss button
        const dismissBtn = banner.querySelector('#alert-dismiss');
        if (dismissBtn) {
            banner.insertBefore(btn, dismissBtn);
        } else {
            banner.appendChild(btn);
        }
    }

    /* ==================== HANDLE BANNER EXPLAIN CLICK ==================== */
    async function handleBannerExplain(banner, btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';

        // Remove any previous explanation
        banner.querySelector('.ai-explain-box')?.remove();

        // Get alert text from the banner
        const bannerTextEl = document.getElementById('alert-banner-text');
        const alertText = bannerTextEl ? bannerTextEl.textContent.trim() : 'Unknown alert';

        // Create explanation box with loading state
        const box = document.createElement('div');
        box.className = 'ai-explain-box ai-explain-box-banner loading';
        box.innerHTML = `
            <div class="ai-explain-dots">
                <span></span><span></span><span></span>
            </div>
        `;
        banner.appendChild(box);

        try {
            const res = await fetch(`${AI_SERVER}/explain-alert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    alert: alertText,
                    sensors: getLiveSensorContext()
                })
            });
            const data = await res.json();

            box.classList.remove('loading');
            box.innerHTML = `
                <div class="ai-explain-icon"><i class="fas fa-brain"></i></div>
                <div class="ai-explain-text">${data.reply}</div>
                <button class="ai-explain-dismiss" title="Dismiss explanation">×</button>
            `;

            box.querySelector('.ai-explain-dismiss')?.addEventListener('click', (e) => {
                e.stopPropagation();
                box.remove();
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-brain"></i> Explain';
            });

        } catch (e) {
            box.classList.remove('loading');
            box.innerHTML = `
                <div class="ai-explain-text" style="opacity:0.6">
                    ⚠ AI server offline. Run server.py to enable explanations.
                </div>
                <button class="ai-explain-dismiss" title="Dismiss">×</button>
            `;
            box.querySelector('.ai-explain-dismiss')?.addEventListener('click', (e) => {
                e.stopPropagation();
                box.remove();
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-brain"></i> Explain';
            });
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-brain"></i> Explain';
    }

    /* ==================== INJECT EXPLAIN BUTTON INTO ALERT POPUP ==================== */
    function injectPopupExplainBtn() {
        const popup = document.getElementById('alert-popup');
        if (!popup) return;

        const popupCard = popup.querySelector('.alert-popup-card');
        if (!popupCard) return;

        // Don't inject twice
        if (popupCard.querySelector('.ai-explain-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'ai-explain-btn ai-explain-btn-popup';
        btn.innerHTML = '<i class="fas fa-brain"></i> AI Explain';
        btn.title = 'Get AI medical explanation for this alert';

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await handlePopupExplain(popupCard, btn);
        });

        // Insert before the Dismiss button
        const dismissBtn = popupCard.querySelector('#alert-popup-close');
        if (dismissBtn) {
            dismissBtn.parentElement.insertBefore(btn, dismissBtn);
        } else {
            popupCard.appendChild(btn);
        }
    }

    /* ==================== HANDLE POPUP EXPLAIN CLICK ==================== */
    async function handlePopupExplain(popupCard, btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';

        // Remove any previous explanation
        popupCard.querySelector('.ai-explain-box')?.remove();

        // Get alert text from the popup
        const popupMsg = document.getElementById('alert-popup-msg');
        const alertText = popupMsg ? popupMsg.textContent.trim() : 'Unknown alert';

        // Create explanation box with loading state
        const box = document.createElement('div');
        box.className = 'ai-explain-box loading';
        box.innerHTML = `
            <div class="ai-explain-dots">
                <span></span><span></span><span></span>
            </div>
        `;
        // Insert before the dismiss button
        const dismissBtn = popupCard.querySelector('#alert-popup-close');
        if (dismissBtn) {
            popupCard.insertBefore(box, dismissBtn);
        } else {
            popupCard.appendChild(box);
        }

        try {
            const res = await fetch(`${AI_SERVER}/explain-alert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    alert: alertText,
                    sensors: getLiveSensorContext()
                })
            });
            const data = await res.json();

            box.classList.remove('loading');
            box.innerHTML = `
                <div class="ai-explain-icon"><i class="fas fa-brain"></i></div>
                <div class="ai-explain-text">${data.reply}</div>
                <button class="ai-explain-dismiss" title="Dismiss explanation">×</button>
            `;

            box.querySelector('.ai-explain-dismiss')?.addEventListener('click', (e) => {
                e.stopPropagation();
                box.remove();
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-brain"></i> AI Explain';
            });

        } catch (e) {
            box.classList.remove('loading');
            box.innerHTML = `
                <div class="ai-explain-text" style="opacity:0.6">
                    ⚠ AI server offline. Run server.py to enable explanations.
                </div>
                <button class="ai-explain-dismiss" title="Dismiss">×</button>
            `;
            box.querySelector('.ai-explain-dismiss')?.addEventListener('click', (e) => {
                e.stopPropagation();
                box.remove();
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-brain"></i> AI Explain';
            });
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-brain"></i> AI Explain';
    }

    /* ==================== MUTATION OBSERVER — WATCH FOR ALERTS ==================== */
    function initAlertExplainer() {
        const alertBanner = document.getElementById('alert-banner');
        const alertPopup = document.getElementById('alert-popup');

        if (!alertBanner && !alertPopup) return;

        // Observer for the alert banner — watch for class changes (hidden → visible)
        if (alertBanner) {
            // If banner is already visible, inject immediately
            if (!alertBanner.classList.contains('hidden')) {
                injectBannerExplainBtn();
            }

            const bannerObserver = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (!alertBanner.classList.contains('hidden')) {
                            // Banner became visible — inject Explain button
                            // Small delay to let app.js finish updating the text
                            setTimeout(() => injectBannerExplainBtn(), 50);
                        } else {
                            // Banner hidden — remove any explanation boxes
                            alertBanner.querySelector('.ai-explain-box')?.remove();
                            alertBanner.querySelector('.ai-explain-btn')?.remove();
                        }
                    }
                    // Also watch for text content changes (new alert messages)
                    if (mutation.type === 'childList' || mutation.type === 'characterData') {
                        if (!alertBanner.classList.contains('hidden')) {
                            // Remove stale explanation when alert text changes
                            alertBanner.querySelector('.ai-explain-box')?.remove();
                        }
                    }
                });
            });

            bannerObserver.observe(alertBanner, {
                attributes: true,
                attributeFilter: ['class'],
                childList: true,
                subtree: true,
                characterData: true
            });
        }

        // Observer for the alert popup — watch for class changes (hidden → visible)
        if (alertPopup) {
            // If popup is already visible, inject immediately
            if (!alertPopup.classList.contains('hidden')) {
                injectPopupExplainBtn();
            }

            const popupObserver = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (!alertPopup.classList.contains('hidden')) {
                            // Popup became visible — inject Explain button
                            setTimeout(() => injectPopupExplainBtn(), 50);
                        } else {
                            // Popup hidden — clean up
                            const popupCard = alertPopup.querySelector('.alert-popup-card');
                            if (popupCard) {
                                popupCard.querySelector('.ai-explain-box')?.remove();
                                popupCard.querySelector('.ai-explain-btn')?.remove();
                            }
                        }
                    }
                });
            });

            popupObserver.observe(alertPopup, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }

    // Initialize Feature 3
    initAlertExplainer();

    console.log('[AI Assistant] Feature 3 — AI Alert Explainer loaded');

})();

