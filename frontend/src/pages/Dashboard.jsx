import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { api } from '../api'
import { SensorCards } from '../components/SensorCards'
import { AlertBanner } from '../components/AlertBanner'
import { AIChatWidget } from '../components/AIChatWidget'

const MODES = [
  { value: 'cold', label: 'Cold Storage', range: '2°C \u2013 8°C' },
  { value: 'perfusion', label: 'Perfusion', range: '20°C \u2013 37°C' },
  { value: 'demo', label: 'Demo', range: '25°C \u2013 30°C' },
]

export default function Dashboard() {
  const { session, role, fullName, signOut } = useAuth()
  const [transport, setTransport] = useState(null)
  const [reading, setReading] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [blynkToken, setBlynkToken] = useState('')
  const [savingSecrets, setSavingSecrets] = useState(false)
  const [loadingTransport, setLoadingTransport] = useState(true)

  // Loads the most recent transport this user can see. RLS does the
  // filtering — a doctor only ever gets their own rows back, a family
  // account only gets ones they've been linked to via a share code.
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

  // Latest reading + open alerts, then subscribe to realtime updates so
  // the dashboard never has to poll Blynk (or anything) from the browser.
  useEffect(() => {
    if (!transport) return

    supabase
      .from('sensor_readings')
      .select('*')
      .eq('transport_id', transport.id)
      .order('ts', { ascending: false })
      .limit(1)
      .then(({ data }) => setReading(data?.[0] ?? null))

    refreshAlerts(transport.id)

    const channel = supabase
      .channel(`transport-${transport.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings', filter: `transport_id=eq.${transport.id}` },
        (payload) => setReading(payload.new)
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

  return (
    <div className="dashboard-screen">
      <header className="dashboard-header">
        <h1>Organ Transportation Monitor</h1>
        <div className="user-badge">
          <span>
            {fullName || 'User'} &middot; {role}
          </span>
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
          <SensorCards reading={reading} />

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
