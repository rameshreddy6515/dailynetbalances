import { useCallback, useEffect, useState } from 'react'
import { Delete, Fingerprint, KeyRound, Lock, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react'
import MerchantAvatar from './MerchantAvatar'
import Select from './Select'
import Switch from './Switch'
import {
  AUTO_LOCK_OPTIONS,
  authenticateBiometric,
  createPinCredentials,
  isBiometricAvailable,
  registerBiometric,
  verifyPin,
} from '../appLockStore'

export function AppLockScreen({ email, cfg, dark = false, onToggleTheme, onUnlock, onSignOut }) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [fails, setFails] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [bioBusy, setBioBusy] = useState(false)

  const bioCredId = cfg?.bioCredId || ''
  const tryBiometric = useCallback(async () => {
    if (!bioCredId || bioBusy) return
    setBioBusy(true)
    setError('')
    try {
      const ok = await authenticateBiometric(bioCredId)
      if (ok) onUnlock()
    } catch {
      setError('Biometric unlock cancelled — enter your 4-digit PIN.')
    } finally {
      setBioBusy(false)
    }
  }, [bioCredId, bioBusy, onUnlock])

  const submitPin = useCallback(async (pinValue) => {
    const now = Date.now()
    if (cooldownUntil > now) {
      const secs = Math.ceil((cooldownUntil - now) / 1000)
      setError(`Too many attempts. Wait ${secs}s.`)
      setDigits('')
      return
    }
    const ok = await verifyPin(pinValue, cfg)
    if (ok) {
      setDigits('')
      setError('')
      onUnlock()
      return
    }
    navigator.vibrate?.([40, 50, 40])
    const nextFails = fails + 1
    setFails(nextFails)
    setDigits('')
    setShake(true)
    setTimeout(() => setShake(false), 380)
    if (nextFails >= 5) {
      setCooldownUntil(Date.now() + 15000)
      setFails(0)
      setError('5 wrong tries — locked for 15 seconds.')
    } else {
      setError('Incorrect PIN.')
    }
  }, [cfg, cooldownUntil, fails, onUnlock])

  const pushDigit = useCallback((d) => {
    setError('')
    setDigits((prev) => {
      if (prev.length >= 4) return prev
      const next = prev + d
      if (next.length === 4) {
        queueMicrotask(() => submitPin(next))
      }
      return next
    })
  }, [submitPin])

  const popDigit = useCallback(() => {
    setError('')
    setDigits((prev) => prev.slice(0, -1))
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        pushDigit(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        popDigit()
      } else if (e.key === 'Escape') {
        setDigits('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pushDigit, popDigit])

  return (
    <div className="wrap login-shell">
      <div className="card login-card lock-card">
        <div className="login-head">
          <div className="brand-row">
            <div className="login-brand" aria-hidden="true">
              <Lock size={22} />
            </div>
            <div>
              <h1>App Locked</h1>
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

        {email && (
          <div className="lock-user-pill">
            <MerchantAvatar name={email} />
            <span>{email}</span>
          </div>
        )}

        <p className="lock-prompt">Enter your 4-digit PIN to view balances</p>

        <div className={`pin-dots${shake ? ' shake' : ''}`} role="status" aria-label={`${digits.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((idx) => (
            <span key={idx} className={`pin-dot${idx < digits.length ? ' filled' : ''}`} />
          ))}
        </div>

        {error && (
          <div className="message error lock-msg" role="alert">
            {error}
          </div>
        )}

        <div className="pin-pad" role="group" aria-label="PIN keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button key={n} type="button" className="pin-key" onClick={() => pushDigit(n)}>
              {n}
            </button>
          ))}
          {bioCredId ? (
            <button
              type="button"
              className="pin-key pin-key-fn"
              disabled={bioBusy}
              aria-label="Unlock with biometrics"
              title="Unlock with biometrics"
              onClick={tryBiometric}
            >
              <Fingerprint size={22} />
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
          <button type="button" className="pin-key" onClick={() => pushDigit('0')}>
            0
          </button>
          <button
            type="button"
            className="pin-key pin-key-fn"
            aria-label="Delete last digit"
            disabled={!digits.length}
            onClick={popDigit}
          >
            <Delete size={20} />
          </button>
        </div>

        {bioCredId && (
          <button type="button" className="secondary lock-bio-btn" disabled={bioBusy} onClick={tryBiometric}>
            <Fingerprint size={16} /> {bioBusy ? 'Waiting for device…' : 'Use fingerprint / device unlock'}
          </button>
        )}

        <button type="button" className="login-forgot-btn lock-signout" onClick={onSignOut}>
          <LogOut size={13} /> Sign out to use password instead
        </button>
      </div>
    </div>
  )
}

export function AppLockSettings({ email, cfg, onChange, onLockNow, onConfirm, notify }) {
  const [bioSupported, setBioSupported] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    isBiometricAvailable().then((ok) => {
      if (active) setBioSupported(ok)
    })
    return () => {
      active = false
    }
  }, [])

  const openSetup = () => {
    setPin1('')
    setPin2('')
    setErr('')
    setSetupOpen(true)
  }

  const saveNewPin = async () => {
    if (!/^\d{4}$/.test(pin1)) {
      setErr('Enter a 4-digit numeric PIN.')
      return
    }
    if (pin1 !== pin2) {
      setErr('Both 4-digit PINs must match.')
      return
    }
    setBusy(true)
    try {
      const creds = await createPinCredentials(pin1)
      onChange({
        pinHash: creds.pinHash,
        salt: creds.salt,
        bioCredId: cfg?.bioCredId || '',
        autoLock: cfg?.autoLock || '1',
      })
      setSetupOpen(false)
      setPin1('')
      setPin2('')
      notify?.(cfg ? 'PIN updated.' : '4-digit PIN lock enabled.', 'success')
    } finally {
      setBusy(false)
    }
  }

  const toggleBiometric = async (enable) => {
    if (!cfg) return
    if (!enable) {
      onChange({ ...cfg, bioCredId: '' })
      notify?.('Biometric unlock turned off.', 'info')
      return
    }
    setBusy(true)
    try {
      const credId = await registerBiometric(email)
      onChange({ ...cfg, bioCredId: credId })
      notify?.('Biometric / device unlock enabled.', 'success')
    } catch (e) {
      notify?.(e?.message || 'Could not enable biometric unlock on this device.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const disableLock = async () => {
    const ok = await onConfirm('Turn off the 4-digit PIN lock on this device?', {
      confirmLabel: 'Turn off',
      danger: true,
    })
    if (!ok) return
    onChange(null)
    notify?.('PIN lock turned off.', 'info')
  }

  return (
    <div className="sheet-section">
      <h3>Security</h3>
      {!cfg && !setupOpen && (
        <button type="button" className="secondary sheet-action" onClick={openSetup}>
          <KeyRound size={15} /> Enable 4-digit PIN lock
        </button>
      )}

      {setupOpen && (
        <div className="pin-setup-box">
          <div className="prefs-grid">
            <label>
              New 4-digit PIN
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                autoComplete="off"
                value={pin1}
                onChange={(e) => { setErr(''); setPin1(e.target.value.replace(/\D/g, '').slice(0, 4)) }}
                autoFocus
              />
            </label>
            <label>
              Confirm PIN
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                autoComplete="off"
                value={pin2}
                onChange={(e) => { setErr(''); setPin2(e.target.value.replace(/\D/g, '').slice(0, 4)) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    saveNewPin()
                  }
                }}
              />
            </label>
          </div>
          {err && <p className="message error" role="alert">{err}</p>}
          <div className="actions">
            <button type="button" className="primary small" disabled={busy} onClick={saveNewPin}>
              <ShieldCheck size={14} /> Save PIN
            </button>
            <button type="button" className="secondary small" disabled={busy} onClick={() => setSetupOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {cfg && (
        <div className="lock-settings-stack">
          <label>
            Auto-lock timing
            <Select
              label="Auto-lock timing"
              options={AUTO_LOCK_OPTIONS}
              value={cfg.autoLock || '1'}
              onChange={(v) => onChange({ ...cfg, autoLock: v })}
            />
          </label>
          {bioSupported && (
            <div className="prefs-switch">
              <Switch
                checked={Boolean(cfg.bioCredId)}
                onChange={toggleBiometric}
                label="Fingerprint / device biometric unlock"
              />
            </div>
          )}
          <div className="lock-settings-actions">
            <button type="button" className="secondary small" onClick={onLockNow}>
              <Lock size={14} /> Lock now
            </button>
            {!setupOpen && (
              <button type="button" className="secondary small" onClick={openSetup}>
                <KeyRound size={14} /> Change PIN
              </button>
            )}
            <button type="button" className="danger small" onClick={disableLock}>
              Turn off PIN
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
