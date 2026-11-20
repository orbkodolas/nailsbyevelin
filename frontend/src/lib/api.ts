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

type Options = { method?: string; body?: unknown; headers?: Record<string, string> }

export async function request<T>(path: string, { method = 'GET', body, headers = {} }: Options = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
export const createVoucher = (payload: Record<string, unknown>) => request<{ id: string; amountHuf: number; payment: Payment }>('/api/vouchers', { method: 'POST', body: payload })
