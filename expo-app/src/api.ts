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

// Weben a SecureStore nem elérhető, ott localStorage a tartalék.
const isWeb = Platform.OS === 'web'

export async function loadToken() {
  token = isWeb ? localStorage.getItem(TOKEN_KEY) : await SecureStore.getItemAsync(TOKEN_KEY)
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
