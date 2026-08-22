const API_BASE = import.meta.env.VITE_API_BASE

async function authedFetch(path, session, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `request failed: ${res.status}`)
  }
  return res.json()
}

export const api = {
  chat: (transportId, session, message) =>
    authedFetch(`/transports/${transportId}/ai/chat`, session, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  status: (transportId, session) =>
    authedFetch(`/transports/${transportId}/ai/status`, session, { method: 'POST' }),

  explainAlert: (transportId, session, alert) =>
    authedFetch(`/transports/${transportId}/ai/explain-alert`, session, {
      method: 'POST',
      body: JSON.stringify({ alert }),
    }),

  setMode: (transportId, session, mode) =>
    authedFetch(`/transports/${transportId}/mode`, session, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  setSystem: (transportId, session, active) =>
    authedFetch(`/transports/${transportId}/system`, session, {
      method: 'POST',
      body: JSON.stringify({ active }),
    }),

  setSecrets: (transportId, session, secrets) =>
    authedFetch(`/transports/${transportId}/secrets`, session, {
      method: 'POST',
      body: JSON.stringify(secrets),
    }),
}
