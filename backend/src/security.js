// Védelmi segédek: valódi kliens-IP, csúszóablakos korlátozás, admin kulcs ellenőrzés, biztonsági fejlécek.
// Források: OWASP API Security Top 10 2023 (API4, API6), OWASP Automated Threats OAT-021 (Denial of Inventory),
// OWASP HTTP Headers / REST Security Cheat Sheet, NIST SP 800-63B-4 (sikertelen próbálkozások korlátozása).
import { createHash, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

const sha256 = (value) => createHash('sha256').update(String(value ?? '')).digest()

/**
 * Titok összehasonlítása: mindkét oldalt SHA-256-tal azonos hosszra hozzuk, így a hossz sem szivárog,
 * és az összehasonlítás állandó idejű.
 */
export function sameSecret(a, b) {
  if (!a || !b) return false
  return timingSafeEqual(sha256(a), sha256(b))
}

/**
 * Admin kulcs: ha ADMIN_TOKEN_SHA256 adott, a szerver csak a kulcs hash-ét ismeri (a környezeti változók
 * kiszivárgásából sem lehet belépni); különben az ADMIN_TOKEN-nel hasonlít.
 */
export function adminTokenMatches(header, config) {
  const match = /^Bearer (.+)$/.exec(String(header || ''))
  if (!match) return false
  const provided = match[1]
  if (config.adminTokenSha256) {
    const expected = Buffer.from(config.adminTokenSha256, 'hex')
    return expected.length === 32 && timingSafeEqual(sha256(provided), expected)
  }
  return sameSecret(provided, config.adminToken)
}

/**
 * Kliens-IP. A Render proxyja az X-Forwarded-For-t csak bővíti (a kliens által küldött értéket nem törli),
 * ezért a bal szélső elem hamisítható. A Render előtt álló Cloudflare a CF-Connecting-IP fejlécet a saját
 * élén állítja be; élő teszt (2026-11-21): a kliens által küldött CF-Connecting-IP-t a Cloudflare 1000-es hibával
 * elutasítja, tehát nem hamisítható. A True-Client-IP viszont változatlanul átjut (csak Enterprise csomagban állítja
 * a Cloudflare), ezért azt NEM használjuk. Tartalékként az X-Forwarded-For
 * JOBB szélső eleme (amit a legközelebbi proxy írt), végül a socket címe.
 */
export function clientIp(req, trustProxy) {
  const socketIp = req.socket?.remoteAddress || 'unknown'
  if (!trustProxy) return { ip: socketIp, source: 'socket' }
  const cf = String(req.headers['cf-connecting-ip'] || '').trim()
  if (isIP(cf)) return { ip: cf, source: 'cf-connecting-ip' }
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map((item) => item.trim()).filter((item) => isIP(item))
  if (chain.length) return { ip: chain.at(-1), source: 'x-forwarded-for(right)' }
  return { ip: socketIp, source: 'socket' }
}

/**
 * Csúszóablakos számláló kulcsonként (IP, IP+végpont…). Memóriabiztos: a lejárt kulcsokat rendszeresen
 * kitakarítja, és a kulcsok száma felülről korlátos (hamisított IP-kkel sem lehet a memóriát elárasztani).
 */
export function createLimiter({ windowMs, max, maxKeys = 20_000 }) {
  const hits = new Map()
  let calls = 0
  const prune = (now) => {
    for (const [key, list] of hits) {
      while (list.length && list[0] <= now - windowMs) list.shift()
      if (!list.length) hits.delete(key)
    }
    // Ha még mindig túl sok a kulcs, a legrégebbieket dobjuk (Map beszúrási sorrend)
    for (const key of hits.keys()) { if (hits.size <= maxKeys) break; hits.delete(key) }
  }
  const recent = (key, now) => {
    const list = hits.get(key)
    if (!list) return []
    while (list.length && list[0] <= now - windowMs) list.shift()
    return list
  }
  return {
    /** Megszámol egy eseményt; true, ha a kulcs túllépte a keretet. */
    hit(key, now = Date.now()) {
      if (++calls % 500 === 0) prune(now)
      const list = recent(key, now)
      list.push(now)
      if (!hits.has(key)) { hits.set(key, list); if (hits.size > maxKeys) prune(now) }
      return list.length > max
    },
    /** Csak ellenőriz (nem számol): pl. sikertelen belépésnél előre megnézzük, ki van-e zárva. */
    blocked(key, now = Date.now()) { return recent(key, now).length >= max },
    retryAfter(key, now = Date.now()) {
      const list = recent(key, now)
      return list.length ? Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000)) : 0
    },
    size: () => hits.size,
  }
}

/** Biztonsági fejlécek minden válaszra (OWASP HTTP Headers Cheat Sheet). */
export function setSecurityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  res.setHeader('cross-origin-opener-policy', 'same-origin')
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  res.setHeader('strict-transport-security', 'max-age=63072000; includeSubDomains')
}

/** A HTML-es demó fizetőoldal saját, szűk CSP-je: csak beágyazott stílus, űrlap csak önmagára küldhető. */
export const HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"

/** Vezérlőkarakterek és HTML-jelek kiszűrése a vendég által megadott rövid szövegekből. */
const UNSAFE_NAME = /[\u0000-\u001f\u007f<>{}\\]/
export const isSafeName = (value, min = 2, maxLength = 100) =>
  typeof value === 'string' && value.trim().length >= min && value.length <= maxLength && !UNSAFE_NAME.test(value)
/** Hosszabb szöveg (megjegyzés, üzenet): sortörés marad, a többi vezérlőkarakter és a <> kikerül. */
export const cleanText = (value, maxLength) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g, '').slice(0, maxLength) : ''
