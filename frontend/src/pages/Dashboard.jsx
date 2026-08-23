import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { api } from '../api'
import { SensorCards } from '../components/SensorCards'
import { AlertBanner } from '../components/AlertBanner'
import { AIChatWidget } from '../components/AIChatWidget'
import { SensorChart } from '../components/SensorChart'
import { TransportMap } from '../components/TransportMap'

const MODES = [
  { value: 'cold', label: 'Cold Storage', range: '2\u00b0C \u2013 8\u00b0C', bounds: [2, 8] },
  { value: 'perfusion', label: 'Perfusion', range: '20\u00b0C \u2013 37\u00b0C', bounds: [20, 37] },
  { value: 'demo', label: 'Demo', range: '25\u00b0C \u2013 30\u00b0C', bounds: [25, 30] },
]
const MODE_BOUNDS = Object.fromEntries(MODES.map((m) => [m.value, m.bounds]))
const CHART_POINTS = 20

// Recomputed per row from the row's own values — same thresholds the
// backend's evaluate_alerts() uses, so the CSV doesn't need to join
// against the alerts table to label each reading.
function rowAlertStatus(r, mode) {
  const [low, high] = MODE_BOUNDS[mode] || MODE_BOUNDS.cold
  if (r.temp != null && (r.temp < low || r.temp > high)) return 'ALERT'
  const mag = Math.sqrt((r.ax || 0) ** 2 + (r.ay || 0) ** 2 + (r.az || 0) ** 2)
  if (mag > 1.5) return 'ALERT'
  if (r.tilt != null && r.tilt > 45) return 'ALERT'
  if (r.ldr != null && r.ldr < 2000) return 'ALERT'
  return 'OK'
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

export default function Dashboard() {
  const { session, role, fullName, signOut } = useAuth()
  const [theme, toggleTheme] = useTheme()
  const [transport, setTransport] = useState(null)
  const [readings, setReadings] = useState([]) // rolling window, oldest -> newest
  const [alerts, setAlerts] = useState([])
  const [blynkToken, setBlynkToken] = useState('')
  const [savingSecrets, setSavingSecrets] = useState(false)
  const [loadingTransport, setLoadingTransport] = useState(true)

  const latestReading = readings[readings.length - 1] ?? null

  // Loads the most recent transport this user can see. RLS does the
  // filtering — a doctor only ever gets their own rows back, a family
  // account only gets ones they've been linked to.
  useEffect(() => {
    supabase
      .from('transports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) console.error(error)
        setTransport(data?.[0] ?? null)
        setLoadingTransport(false)
      })
  }, [])

  // Last 20 readings for the chart/cards, open alerts, then subscribe
  // to realtime updates so nothing in the browser has to poll anything.
  useEffect(() => {
    if (!transport) return

    supabase
      .from('sensor_readings')
      .select('*')
      .eq('transport_id', transport.id)
      .order('ts', { ascending: false })
      .limit(CHART_POINTS)
      .then(({ data }) => setReadings((data || []).slice().reverse()))

    refreshAlerts(transport.id)

    const channel = supabase
      .channel(`transport-${transport.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings', filter: `transport_id=eq.${transport.id}` },
        (payload) => setReadings((rs) => [...rs, payload.new].slice(-CHART_POINTS))
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts', filter: `transport_id=eq.${transport.id}` },
        () => refreshAlerts(transport.id)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [transport?.id])

  function refreshAlerts(transportId) {
    supabase
      .from('alerts')
      .select('*')
      .eq('transport_id', transportId)
      .eq('resolved', false)
      .then(({ data }) => setAlerts(data ?? []))
  }

  async function createTransport() {
    const { data, error } = await supabase
      .from('transports')
      .insert({ doctor_id: session.user.id })
      .select()
      .single()
    if (error) return console.error(error)
    setTransport(data)
  }

  async function toggleSystem() {
    if (!transport) return
    const next = !transport.system_active
    try {
      await api.setSystem(transport.id, session, next)
      setTransport((t) => ({ ...t, system_active: next }))
    } catch (e) {
      console.error(e)
    }
  }

  async function changeMode(mode) {
    if (!transport) return
    try {
      await api.setMode(transport.id, session, mode)
      setTransport((t) => ({ ...t, temp_mode: mode }))
    } catch (e) {
      console.error(e)
    }
  }

  async function saveBlynkToken() {
    if (!transport || !blynkToken.trim()) return
    setSavingSecrets(true)
    try {
      await api.setSecrets(transport.id, session, { blynk_auth_token: blynkToken.trim() })
      setBlynkToken('')
    } catch (e) {
      console.error(e)
    } finally {
      setSavingSecrets(false)
    }
  }

  async function downloadCsv() {
    if (!transport) return
    const { data, error } = await supabase
      .from('sensor_readings')
      .select('*')
      .eq('transport_id', transport.id)
      .order('ts', { ascending: true })
    if (error || !data) return console.error(error)

    const headers = [
      'Timestamp', 'Temperature(C)', 'Humidity(%)', 'AccX(g)', 'AccY(g)', 'AccZ(g)',
      'Angle(deg)', 'Latitude', 'Longitude', 'LDR', 'Alert',
    ]
    const rows = data.map((r) =>
      [
        new Date(r.ts).toISOString(),
        r.temp, r.hum, r.ax, r.ay, r.az, r.tilt, r.lat, r.lng, r.ldr,
        rowAlertStatus(r, transport.temp_mode),
      ].join(',')
    )
    const csv = [headers.join(','), ...rows].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const a = document.createElement('a')
    a.href = url
    a.download = `organ_data_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="dashboard-screen">
      <header className="dashboard-header">
        <h1>Organ Transportation Monitor</h1>
        <div className="user-badge">
          <span>
            {fullName || 'User'} &middot; {role}
          </span>
          <button onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '\u2600\ufe0f' : '\ud83c\udf19'}
          </button>
          {role === 'doctor' && transport && <button onClick={downloadCsv}>CSV</button>}
          <button onClick={signOut}>Log out</button>
        </div>
      </header>

      <AlertBanner alerts={alerts} />

      {loadingTransport ? null : !transport ? (
        <div className="empty-state">
          {role === 'doctor' ? (
            <>
              <p>No transport yet.</p>
              <button className="btn-primary" onClick={createTransport}>
                Start a new transport
              </button>
            </>
          ) : (
            <p>Ask your doctor for a share code to link this account to their transport.</p>
          )}
        </div>
      ) : (
        <>
          <SensorCards reading={latestReading} />

          <div className="main-grid">
            <SensorChart readings={readings} />
            <TransportMap reading={latestReading} />
          </div>

          {role === 'doctor' && (
            <>
              <div className="control-panel">
                <span>System {transport.system_active ? 'ON' : 'OFF'}</span>
                <button onClick={toggleSystem}>{transport.system_active ? 'Turn off' : 'Turn on'}</button>
              </div>

              <div className="control-panel">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => changeMode(m.value)}
                    style={{ opacity: transport.temp_mode === m.value ? 1 : 0.5 }}
                  >
                    {m.label} ({m.range})
                  </button>
                ))}
              </div>

              <div className="control-panel">
                <input
                  placeholder="Blynk auth token"
                  value={blynkToken}
                  onChange={(e) => setBlynkToken(e.target.value)}
                />
                <button onClick={saveBlynkToken} disabled={savingSecrets}>
                  {savingSecrets ? 'Saving\u2026' : 'Save Blynk token'}
                </button>
              </div>
            </>
          )}

          <AIChatWidget transportId={transport.id} />
        </>
      )}
    </div>
  )
}
