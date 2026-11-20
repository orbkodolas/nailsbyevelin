// Időpontfoglaló modál megnyitása; a BookingModal komponens figyeli ezt az eseményt
export const BOOKING_OPEN_EVENT = 'nbe:open-booking'

export type BookingOpenDetail = { categoryId?: string }

export function openBooking(categoryId?: string) {
  window.dispatchEvent(new CustomEvent<BookingOpenDetail>(BOOKING_OPEN_EVENT, { detail: { categoryId } }))
}
