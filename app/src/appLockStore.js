export const LAST_EMAIL_KEY = 'lastLoginEmail'
export const REMEMBER_EMAIL_KEY = 'rememberLoginEmail'

const lockStorageKey = (userId) => `appLock.v1.${userId}`

export const AUTO_LOCK_OPTIONS = [
  { value: '0', label: 'Immediately on background' },
  { value: '1', label: 'After 1 minute' },
  { value: '5', label: 'After 5 minutes' },
  { value: '15', label: 'After 15 minutes' },
  { value: 'reopen', label: 'On app reopen only' },
]

export function readAppLock(userId) {
  if (!userId) return null
  try {
    const raw = JSON.parse(localStorage.getItem(lockStorageKey(userId)))
    if (!raw || typeof raw.pinHash !== 'string' || typeof raw.salt !== 'string') return null
    return {
      pinHash: raw.pinHash,
      salt: raw.salt,
      bioCredId: typeof raw.bioCredId === 'string' ? raw.bioCredId : '',
      autoLock: AUTO_LOCK_OPTIONS.some((o) => o.value === String(raw.autoLock)) ? String(raw.autoLock) : '1',
    }
  } catch {
    return null
  }
}

export function writeAppLock(userId, cfg) {
  if (!userId) return
  if (!cfg) {
    localStorage.removeItem(lockStorageKey(userId))
    return
  }
  localStorage.setItem(lockStorageKey(userId), JSON.stringify(cfg))
}

const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

const toBase64Url = (buf) => {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (str) => {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(digest))
}

export async function createPinCredentials(pin) {
  const rand = new Uint8Array(16)
  crypto.getRandomValues(rand)
  const salt = bytesToHex(rand)
  const pinHash = await hashPin(pin, salt)
  return { salt, pinHash }
}

export async function verifyPin(pin, cfg) {
  if (!cfg?.pinHash || !cfg?.salt) return false
  const candidate = await hashPin(pin, cfg.salt)
  return candidate === cfg.pinHash
}

export async function isBiometricAvailable() {
  try {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function registerBiometric(email) {
  const challenge = new Uint8Array(32)
  const userBytes = new Uint8Array(16)
  crypto.getRandomValues(challenge)
  crypto.getRandomValues(userBytes)
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Merchant Daily Balance' },
      user: {
        id: userBytes,
        name: email || 'user',
        displayName: email || 'Account',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 45000,
    },
  })
  if (!cred?.rawId) throw new Error('Biometric setup was cancelled.')
  return toBase64Url(cred.rawId)
}

export async function authenticateBiometric(credId) {
  const challenge = new Uint8Array(32)
  crypto.getRandomValues(challenge)
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: credId
        ? [{ type: 'public-key', id: fromBase64Url(credId), transports: ['internal'] }]
        : [],
      userVerification: 'required',
      timeout: 45000,
    },
  })
  return Boolean(assertion)
}
