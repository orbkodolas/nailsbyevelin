export const API_URL: string = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`

export type Payment = { id: string; provider: string; amountHuf: number; checkoutUrl: string | null; instructions: string | null; error?: string }
export type PaymentMethod = { id: string; label: string }
export type PublicBooking = {
  id: string; status: 'booked' | 'pending_payment' | 'cancelled' | 'expired' | 'no_show' | 'completed' | 'rejected'
  paymentStatus: string; confirmationStatus: 'awaiting' | 'confirmed'; firstName: string; serviceName: string; durationMinutes: number
  startsAt: string; endsAt: string; priceHuf: number; amountDueHuf: number; amountPaidHuf: number; holdExpiresAt: string | null; lateCancellation: boolean
}
export type CreatedBooking = PublicBooking & { manageToken: string; manageUrl: string; payment: Payment | null; policy: string }
export type Availability = { timezone: string; serviceId: string; durationMinutes: number; days: Record<string, string[]> }

export class ApiError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status: number) { super(message); this.code = code; this.status = status }
}

type Options = { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal }

export async function request<T>(path: string, { method = 'GET', body, headers = {}, signal }: Options = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined, signal,
    })
  } catch {
    throw new ApiError('Nem érhető el a foglalási szerver. Próbáld újra később.', 'network', 0)
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(data.message || 'Valami félresikerült. Próbáld újra.', data.error || 'error', response.status)
  return data as T
}

export const getSettings = () => request<{ paymentMethods: PaymentMethod[]; depositPercent: number; emailEnabled: boolean; maxDaysAhead: number }>('/api/catalog')
export const getAvailability = (serviceId: string, from: string, to: string) => request<Availability>(`/api/availability?serviceId=${serviceId}&from=${from}&to=${to}`)
export const createBooking = (payload: Record<string, unknown>) => request<CreatedBooking>('/api/bookings', { method: 'POST', body: payload })
export const getBooking = (id: string, token: string) => request<PublicBooking>(`/api/bookings/${id}`, { headers: { 'x-manage-token': token } })
export const bookingAction = (id: string, token: string, action: 'confirm' | 'cancel') => request<PublicBooking>(`/api/bookings/${id}/${action}`, { method: 'POST', body: { token } })
export const payBooking = (id: string, token: string, paymentMethod?: string) => request<{ payment: Payment }>(`/api/bookings/${id}/pay`, { method: 'POST', body: { token, paymentMethod } })
export const payDemo = (paymentId: string, card: string) => request<{ ok: true }>(`/api/payments/demo/${paymentId}`, { method: 'POST', body: { card } })
export const createVoucher =(payload: Record<string, unknown>) => request<{ id: string; amountHuf: number; payment: Payment }>('/api/vouchers', { method: 'POST', body: payload })

// Élő chat Evelinnel: a token a létrehozáskor kapott titok, minden további kéréshez kell
export type LiveStatus = 'waiting' | 'live' | 'missed' | 'closed'
export type LiveMessage = { id: string; from: 'guest' | 'evelin'; text: string; at: string }
export type LiveChat = {
  id: string; token: string; status: LiveStatus; reason: string | null; name: string; email: string; deadline: string | null
  serverNow: string; closedBy: 'guest' | 'evelin' | 'idle' | null; seq: number; messages: LiveMessage[]
}
export type LiveStart = { name: string; email: string; message: string; website: string }

const liveAuth = (token: string) => ({ 'x-chat-token': token })
// A szerver csak létrehozáskor küldi vissza a tokent; a további válaszokhoz a kliens őrzi meg.
const withLiveToken = (token: string) => (view: Omit<LiveChat, 'token'>): LiveChat => ({ ...view, token })
export const startLiveChat = (payload: LiveStart) => request<LiveChat>('/api/chat', { method: 'POST', body: payload })
export const getLiveChat = (id: string, token: string, after = 0, wait = false, signal?: AbortSignal) =>
  request<LiveChat>(`/api/chat/${id}?after=${after}${wait ? '&wait=1' : ''}`, { headers: liveAuth(token), signal }).then(withLiveToken(token))
export const sendLiveMessage = (id: string, token: string, text: string) =>
  request<LiveChat>(`/api/chat/${id}/messages`, { method: 'POST', body: { text }, headers: liveAuth(token) }).then(withLiveToken(token))
export const closeLiveChat = (id: string, token: string) => request<LiveChat>(`/api/chat/${id}/close`, { method: 'POST', headers: liveAuth(token) }).then(withLiveToken(token))
