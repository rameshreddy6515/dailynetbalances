import { useState } from 'react'
import { ArrowLeft, Eye, EyeOff, Loader2, Moon, Sun, Wallet } from 'lucide-react'
import { supabase } from '../supabase'
import MerchantAvatar from './MerchantAvatar'
import Switch from './Switch'
import { LAST_EMAIL_KEY, REMEMBER_EMAIL_KEY } from '../appLockStore'

const MODES = [
  { id: 'signin', label: 'Password', sub: 'Sign in with your email and password.' },
  { id: 'magic', label: 'Login link', sub: 'Get a one-tap sign-in link in your inbox.' },
  { id: 'signup', label: 'Create account', sub: 'Create a new account to start tracking balances.' },
]

export default function Login({ dark = false, onToggleTheme, recovery = false, onRecoveryDone }) {
  const [savedEmail, setSavedEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) || '')
  const [remember, setRemember] = useState(() => localStorage.getItem(REMEMBER_EMAIL_KEY) !== '0')
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) || '')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [mode, setMode] = useState('signin')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const usingSavedChip = Boolean(savedEmail) && !recovery && mode !== 'signup'

  const switchMode = (next) => {
    setMode(next)
    setMsg(null)
    if (next !== 'signup' && savedEmail) setEmail(savedEmail)
  }

  const clearSavedAccount = () => {
    localStorage.removeItem(LAST_EMAIL_KEY)
    setSavedEmail('')
    setEmail('')
    setPassword('')
    setMsg(null)
  }

  const toggleRemember = (checked) => {
    setRemember(checked)
    localStorage.setItem(REMEMBER_EMAIL_KEY, checked ? '1' : '0')
    if (!checked) localStorage.removeItem(LAST_EMAIL_KEY)
  }

  const persistRememberedEmail = (addr) => {
    const clean = addr.trim()
    if (!clean) return
    if (remember) {
      localStorage.setItem(LAST_EMAIL_KEY, clean)
      localStorage.setItem(REMEMBER_EMAIL_KEY, '1')
    } else {
      localStorage.removeItem(LAST_EMAIL_KEY)
    }
  }

  const go = async (e) => {
    e.preventDefault()
    if (!supabase || busy) return
    const targetEmail = (usingSavedChip ? savedEmail : email).trim()
    setBusy(true)
    setMsg(null)
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) setMsg({ type: 'error', text: error.message })
        else onRecoveryDone?.()
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
          redirectTo: window.location.origin,
        })
        setMsg(
          error
            ? { type: 'error', text: error.message }
            : { type: 'success', text: 'Password reset link sent — check your email.' }
        )
      } else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email: targetEmail,
          options: { emailRedirectTo: window.location.origin },
        })
        if (!error) persistRememberedEmail(targetEmail)
        setMsg(
          error
            ? { type: 'error', text: error.message }
            : { type: 'success', text: 'Login link sent — check your email.' }
        )
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: targetEmail, password })
        if (error) setMsg({ type: 'error', text: error.message })
        else {
          persistRememberedEmail(targetEmail)
          if (data.session) setMsg({ type: 'success', text: 'Account created — signing you in...' })
          else {
            setMsg({
              type: 'success',
              text: 'Account created — check your email to confirm, then sign in.',
            })
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: targetEmail, password })
        if (error) setMsg({ type: 'error', text: error.message })
        else persistRememberedEmail(targetEmail)
      }
    } finally {
      setBusy(false)
    }
  }

  const activeMode = MODES.find((m) => m.id === mode)
  const subtitle = recovery
    ? 'Choose a new password for your account.'
    : mode === 'forgot'
      ? 'Confirm your email and we will send a password reset link.'
      : activeMode?.sub

  const submitLabel = recovery
    ? 'Update password'
    : mode === 'forgot'
      ? 'Send reset link'
      : mode === 'signup'
        ? 'Create account'
        : mode === 'magic'
          ? 'Send login link'
          : 'Sign in'

  const showPasswordField = recovery || (mode !== 'magic' && mode !== 'forgot')

  return (
    <div className="wrap login-shell">
      <div className="card login-card">
        <div className="login-head">
          <div className="brand-row">
            <div className="login-brand" aria-hidden="true">
              <Wallet size={24} />
            </div>
            <div>
              <h1>Merchant Daily Balance</h1>
              <span className="brand-accent" aria-hidden="true" />
            </div>
          </div>
          {onToggleTheme && (
            <button
              type="button"
              className="secondary small icon-button login-theme-btn"
              onClick={onToggleTheme}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>

        <p className="login-sub">{subtitle}</p>

        {!recovery && mode !== 'forgot' && (
          <div className="seg-group login-tabs" role="tablist" aria-label="Sign-in method">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                className={`seg-btn${mode === m.id ? ' on' : ''}`}
                onClick={() => switchMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={go}>
          {!recovery && (
            usingSavedChip ? (
              <div className="saved-account-chip">
                <span className="merchant-cell saved-account-user">
                  <MerchantAvatar name={savedEmail} />
                  <span className="saved-account-meta">
                    <span className="saved-account-lbl">Account</span>
                    <strong className="saved-account-email">{savedEmail}</strong>
                  </span>
                </span>
                <button
                  type="button"
                  className="secondary small saved-switch-btn"
                  onClick={clearSavedAccount}
                >
                  Switch account
                </button>
              </div>
            ) : (
              <>
                <label>
                  Email
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </label>
                {mode !== 'forgot' && (
                  <div className="login-remember">
                    <Switch
                      checked={remember}
                      onChange={toggleRemember}
                      label="Remember email on this device"
                    />
                  </div>
                )}
              </>
            )
          )}
          {showPasswordField && (
            <label>
              <span className="login-pw-head">
                <span>{recovery ? 'New password' : 'Password'}</span>
                {!recovery && mode === 'signin' && (
                  <button
                    type="button"
                    className="login-forgot-btn"
                    onClick={() => switchMode('forgot')}
                  >
                    Forgot password?
                  </button>
                )}
              </span>
              <span className="pw-wrap">
                <input
                  key={usingSavedChip ? 'chip-pw' : 'plain-pw'}
                  type={showPw ? 'text' : 'password'}
                  name="password"
                  autoComplete={mode === 'signup' || recovery ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  minLength={6}
                  required
                  autoFocus={recovery || usingSavedChip}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPw((s) => !s)}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
          )}

          {msg && (
            <div className={`message ${msg.type}`} role={msg.type === 'error' ? 'alert' : 'status'}>
              {msg.text}
            </div>
          )}

          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={15} className="spin" /> Please wait…
                </>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </form>

        {!recovery && mode === 'forgot' && (
          <button type="button" className="secondary login-back-btn" onClick={() => switchMode('signin')}>
            <ArrowLeft size={14} /> Back to sign in
          </button>
        )}
      </div>
    </div>
  )
}
