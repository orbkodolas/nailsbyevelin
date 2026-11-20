import * as SecureStore from 'expo-secure-store'

export const API_URL = 'https://nailsbyevelin-api.onrender.com'
const TOKEN_KEY = 'nbe_admin_token'

export type Booking = {
  id: string; name: string; phone: string; email: string
  serviceName: string; durationMinutes: number; priceHuf: number
  startsAt: string; endsAt: string
  status: 'booked' | 'pending_payment' | 'completed' | 'cancelled' | 'no_show' | 'expired'
  paymentStatus: string; amountDueHuf: number; amountPaidHuf: number
  customerNote?: string; noShowCount: number; refundStatus?: string
}
export type Block = { id: string; startsAt: string; endsAt: string; reason: string }
export type Voucher = {
  id: string; code: string; status: 'pending_payment' | 'active' | 'redeemed' | string
  amountHuf: number; buyerName: string; buyerEmail: string; recipientName: string
  message: string; createdAt: string; expiresAt?: string
}

let token: string | null = null

export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY)
  return token
}
export async function saveToken(value: string) {
  token = value
  await SecureStore.setItemAsync(TOKEN_KEY, value)
}
export async function clearToken() {
  token = null
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}

const messages: Record<string, string> = {
  admin_auth_required: 'Hibás vagy lejárt belépési kulcs.',
  booking_not_active: 'Ez a foglalás már nem aktív.',
  payment_not_required: 'Ennél nincs függő fizetés.',
  voucher_not_active: 'Az utalvány nem aktív vagy lejárt.',
  invalid_range: 'Érvénytelen dátum.',
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
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'unknown')
  return data as T
}

export const getBookings = () => api<{ bookings: Booking[]; blocks: Block[] }>('/api/admin/bookings')
export const bookingAction = (id: string, action: 'no-show' | 'payment-confirmed' | 'complete' | 'cancel', body?: unknown) =>
  api<Booking>(`/api/admin/bookings/${id}/${action}`, { method: 'POST', body: body ?? {} })
export const addBlockDay = (date: string, reason: string) => api<Block>('/api/admin/blocks', { method: 'POST', body: { date, reason } })
export const deleteBlock = (id: string) => api<{ ok: true }>(`/api/admin/blocks/${id}`, { method: 'DELETE' })
export const getVouchers = () => api<{ vouchers: Voucher[] }>('/api/admin/vouchers')
export const voucherAction = (id: string, action: 'payment-confirmed' | 'redeem') =>
  api<Voucher>(`/api/admin/vouchers/${id}/${action}`, { method: 'POST', body: {} })
