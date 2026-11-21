// Firebase Cloud Messaging (HTTP v1) közvetlenül, külső csomag nélkül: a szolgáltatásfiók kulcsával
// aláírt JWT-ből OAuth hozzáférési tokent kérünk (óránként), és azzal küldjük az üzeneteket.
// Kulcs: FCM_SERVICE_ACCOUNT környezeti változó (a Firebase-ből letöltött JSON, nyersen vagy base64-ben).
import { createSign } from 'node:crypto'

export function parseServiceAccount(value) {
  if (!value) return null
  for (const text of [value, () => Buffer.from(value, 'base64').toString('utf8')]) {
    try {
      const parsed = JSON.parse(typeof text === 'function' ? text() : text)
      if (parsed?.client_email && parsed?.private_key && parsed?.project_id) return parsed
    } catch { /* a következő formátum */ }
  }
  return null
}

const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

export function createFcm({ serviceAccount, fetchImpl = globalThis.fetch, log = console }) {
  let cached = null // { token, expiresAt }

  async function accessToken() {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
    const iat = Math.floor(Date.now() / 1000)
    const tokenUri = serviceAccount.token_uri || 'https://oauth2.googleapis.com/token'
    const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
      iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat, exp: iat + 3600,
    })}`
    const signature = createSign('RSA-SHA256').update(unsigned).sign(serviceAccount.private_key, 'base64url')
    const response = await fetchImpl(tokenUri, {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.access_token) throw new Error(`FCM token: HTTP ${response.status} ${data.error || ''}`)
    cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
    return cached.token
  }

  /**
   * Adatüzenet egy eszköznek; az expo-notifications a data mezőkből (title, message, categoryId, channelId, tag, body)
   * maga rajzolja ki az értesítést, így a gombok és a szöveges válasz bezárt appnál is működnek.
   * Eredmény: 'sent' | 'invalid_token' (az eszköz törölte az appot / lejárt token) | 'failed'
   */
  async function send(token, data, { ttlSeconds = 120 } = {}) {
    try {
      const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: { token, data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])), android: { priority: 'HIGH', ttl: `${ttlSeconds}s` } } }),
      })
      if (response.ok) return 'sent'
      const detail = await response.json().catch(() => ({}))
      const code = detail?.error?.details?.find?.((item) => item.errorCode)?.errorCode || detail?.error?.status
      if (response.status === 404 || code === 'UNREGISTERED' || (response.status === 400 && /registration token/i.test(detail?.error?.message || ''))) return 'invalid_token'
      log.error?.(`[push] FCM HTTP ${response.status} ${code || ''}`)
      return 'failed'
    } catch (error) {
      log.error?.(`[push] ${error.message}`)
      return 'failed'
    }
  }

  return { send }
}
