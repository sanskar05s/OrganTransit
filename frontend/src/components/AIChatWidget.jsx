import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

export function AIChatWidget({ transportId }) {
  const { session } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }])
    setSending(true)
    try {
      const res = await api.chat(transportId, session, text)
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-msg ai">Ask me about temperature trends, alerts, or route status.</div>
        )}
        {messages.map((m, i) => (
          // Plain JSX text interpolation escapes by default — never swap this
          // for dangerouslySetInnerHTML, that's what caused the XSS hole in
          // the old ai_assistant.js.
          <div key={i} className={`ai-msg ${m.role === 'user' ? 'user' : 'ai'}`}>
            {m.content}
          </div>
        ))}
      </div>
      <div className="ai-chat-footer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask about the organ transport…"
        />
        <button onClick={send} disabled={sending}>
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
