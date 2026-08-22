import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (signUpError) {
      setError(signUpError.message)
      return
    }

    // If email confirmation is on, there's no session yet, so auth.uid()
    // would be null inside the RPC below — skip it and tell them to
    // redeem the code after they confirm and sign in.
    if (!data.session) {
      setSuccess(
        'Check your email to confirm your account, then sign in.' +
          (inviteCode.trim() ? ' Redeem your invite code from the dashboard afterward.' : '')
      )
      return
    }

    if (inviteCode.trim()) {
      const { error: rpcError } = await supabase.rpc('redeem_doctor_invite', {
        invite_code: inviteCode.trim(),
      })
      if (rpcError) {
        setError(`Account created, but the invite code failed: ${rpcError.message}`)
        return
      }
    }

    navigate('/dashboard')
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Create an account</h1>
        <p className="auth-subtitle">Everyone starts as patient family — a doctor invite code upgrades you</p>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="text"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="input-group">
            <input
              type="text"
              placeholder="Doctor invite code (optional)"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary btn-block">
            Create account
          </button>
        </form>
        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}
        <div className="auth-toggle">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
