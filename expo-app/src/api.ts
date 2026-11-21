import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

export const API_URL = 'https://nailsbyevelin-api.onrender.com'
const TOKEN_KEY = 'nbe_admin_token'

export type Booking = {
  id: string; name: string; phone: string; email: string
  serviceName: string; durationMinutes: number; priceHuf: number
  startsAt: string; endsAt: string
  status: 'booked' | 'pending_payment' | 'completed' | 'cancelled' | 'no_show' | 'expired'
  paymentStatus: string; amountDueHuf: number; amountPaidHuf: number
  customerNote?: string; noShowCount: number; refundStatus?: string; lateCancellation?: boolean
  noShowReason?: 'late' | 'no_show'; cancelledBy?: 'guest' | 'admin'; cancelReason?: 'urgent_block'
}
export type Block = { id: string; startsAt: string; endsAt: string; reason: string; urgent?: boolean }
export type Voucher = {
  id: string; code: string; status: 'pending_payment' | 'active' | 'redeemed' | string
  amountHuf: number; buyerName: string; buyerEmail: string; recipientName: string
  message: string; createdAt: string; expiresAt?: string
}

let token: string | null = null

/**
 * Az APK-ba épített eszközkulcs (GitHub secret → EXPO_PUBLIC_ADMIN_KEY a buildnél; a forráskódban nincs).
 * Az APK maga a kulcs: telepítés/újratelepítés után nem kell párosítani, és nincs külön zár sem.
 * Ha kiszivárog: a szerveren az Eszközök fülön letiltható, és új kulccsal új APK készül.
 */
export const BUILT_IN_KEY = process.env.EXPO_PUBLIC_ADMIN_KEY || ''
export const usingBuiltInKey = () => Boolean(BUILT_IN_KEY) && token === BUILT_IN_KEY

// Weben a SecureStore nem elérhető, ott localStorage a tartalék.
const isWeb = Platform.OS === 'web'

export async function loadToken() {
  token = (isWeb ? localStorage.getItem(TOKEN_KEY) : await SecureStore.getItemAsync(TOKEN_KEY)) || BUILT_IN_KEY || null
  return token
}
export async function saveToken(value: string) {
  token = value
  if (isWeb) localStorage.setItem(TOKEN_KEY, value)
  else await SecureStore.setItemAsync(TOKEN_KEY, value)
}
export async function clearToken() {
  token = null
  if (isWeb) localStorage.removeItem(TOKEN_KEY)
  else await SecureStore.deleteItemAsync(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, public data: any = {}) { super(code) }
}

const messages: Record<string, string> = {
  admin_auth_required: 'Hibás vagy lejárt belépési kulcs.',
  booking_not_active: 'Ez a foglalás már nem aktív.',
  payment_not_required: 'Ennél nincs függő fizetés.',
  voucher_not_active: 'Az utalvány nem aktív vagy lejárt.',
  invalid_range: 'Érvénytelen dátum.',
  block_has_bookings: 'Erre a napra közben foglalás érkezett.',
  refund_not_pending: 'Ennél nincs függő visszautalás.',
  not_found: 'Nem található (lehet, hogy közben törölték).',
  invalid_pairing_code: 'Hibás, lejárt vagy már felhasznált párosító kód.',
  too_many_devices: 'Elérted az eszközök számának korlátját (10). Tilts le egy régit.',
  too_many_requests: 'Túl sok sikertelen próbálkozás. Várj 15 percet, és próbáld újra.',
  network: 'Nincs kapcsolat a szerverrel. Próbáld újra.',
}
export const errorText = (error: unknown) =>
  error instanceof ApiError ? messages[error.code] ?? `Hiba (${error.status}).` : messages.network

export async function api<T>(path: string, init: { method?: string; body?: unknown; authToken?: string } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${init.authToken ?? token ?? ''}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'unknown', data)
  return data as T
}

/** Az alvó szerver (Render) felébresztése már az app megnyitásakor, hogy mire műveletet indítasz, ébren legyen. */
export const wakeServer = () => { fetch(`${API_URL}/health`, { mode: 'no-cors' }).catch(() => {}) } // no-cors: webes előnézetben se legyen CORS-hiba

export const getBookings = () => api<{ bookings: Booking[]; blocks: Block[] }>('/api/admin/bookings')
export const bookingAction = (id: string, action: 'no-show' | 'payment-confirmed' | 'complete' | 'cancel' | 'refunded', body?: unknown) =>
  api<Booking>(`/api/admin/bookings/${id}/${action}`, { method: 'POST', body: body ?? {} })
/** Ha közben foglalás került a napra, a szerver 409 'block_has_bookings'-t ad (data.bookings); force: true így is letilt. */
export const addBlockDay = (date: string, reason: string, force = false) => api<Block>('/api/admin/blocks', { method: 'POST', body: { date, reason, force } })
export type Conflict = Pick<Booking, 'id' | 'name' | 'phone' | 'startsAt'>
export const deleteBlock = (id: string) => api<{ ok: true }>(`/api/admin/blocks/${id}`, { method: 'DELETE' })
/** Évente ismétlődő szünnapok (HH-NN) a nyilvános katalógusból; régi backendnél az alapértékek. */
export const DEFAULT_CLOSED_DAYS = ['12-24', '12-25', '12-26', '12-31', '01-01']
export const getClosedDays = () =>
  api<{ closedDays?: string[] }>('/api/catalog').then((d) => d.closedDays ?? DEFAULT_CLOSED_DAYS).catch(() => DEFAULT_CLOSED_DAYS)
export const getVouchers = () => api<{ vouchers: Voucher[] }>('/api/admin/vouchers')
export const voucherAction = (id: string, action: 'payment-confirmed' | 'redeem') =>
  api<Voucher>(`/api/admin/vouchers/${id}/${action}`, { method: 'POST', body: {} })

// ---------- admin eszközök ----------
// Minden telefon/gép saját kulcsot kap egy egyszer használatos párosító kóddal; a mesterkulcs nem kerül az eszközre.
export type Device = { id: string; name: string; createdAt: string; lastSeenAt?: string; pairedBy?: string; current: boolean }
export const deviceName = () =>
  Platform.OS === 'android' ? String((Platform.constants as { Model?: string })?.Model ?? 'Android telefon')
    : Platform.OS === 'ios' ? 'iPhone / iPad' : 'Böngésző'
export const createPairingCode = (authToken?: string) =>
  api<{ code: string; expiresAt: string }>('/api/admin/devices/pairing', { method: 'POST', body: {}, authToken })
export async function pairDevice(code: string) {
  const result = await api<{ token: string; deviceId: string; name: string }>('/api/devices/pair', { method: 'POST', body: { code, name: deviceName() } })
  await saveToken(result.token)
  return result
}
export const getDevices = () => api<{ devices: Device[] }>('/api/admin/devices')
export const revokeDevice = (id: string) => api<{ ok: true }>(`/api/admin/devices/${id}`, { method: 'DELETE' })
/** Régebbi verzióból a mesterkulcs lehet eltárolva: ilyenkor csendben saját eszközkulcsra cseréljük. */
export async function upgradeToDeviceToken() {
  const me = await api<{ kind: 'master' | 'device' }>('/api/admin/whoami')
  if (me.kind === 'master') await pairDevice((await createPairingCode()).code)
}
