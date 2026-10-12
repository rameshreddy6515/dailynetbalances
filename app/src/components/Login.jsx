import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('signin')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const go = async (e) => {
    e.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        })
        setMsg(
          error
            ? { type: 'error', text: error.message }
            : { type: 'success', text: 'Login link sent — check your email.' }
        )
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) setMsg({ type: 'error', text: error.message })
        else if (data.session) setMsg({ type: 'success', text: 'Account created — signing you in...' })
        else
          setMsg({
            type: 'success',
            text: 'Account created — check your email to confirm, then sign in.',
          })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMsg({ type: 'error', text: error.message })
      }
    } finally {
      setBusy(false)
    }
  }

  const Link = ({ m, children }) =>
    mode === m ? null : (
      <button type="button" className="link-btn" onClick={() => { setMode(m); setMsg(null) }}>
        {children}
      </button>
    )

  return (
    <div className="wrap">
      <div className="card login-card">
        <h1>Merchant Daily Balance</h1>
        <p>Sign in to manage wallet balances.</p>
        <form onSubmit={go}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </label>
          {mode !== 'magic' && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
              />
            </label>
          )}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy
                ? 'Please wait...'
                : mode === 'signup'
                  ? 'Create account'
                  : mode === 'magic'
                    ? 'Send login link'
                    : 'Sign in'}
            </button>
          </div>
        </form>
        <div className="login-links">
          <Link m="signin">Sign in</Link>
          <Link m="signup">Create account</Link>
          <Link m="magic">Email me a login link</Link>
        </div>
        {msg && <div className={`message ${msg.type}`}>{msg.text}</div>}
      </div>
    </div>
  )
}
