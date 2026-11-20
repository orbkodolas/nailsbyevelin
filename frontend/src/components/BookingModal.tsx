import { useEffect, useState } from 'react'
import { BOOKING_OPEN_EVENT } from '../lib/bookingModal'
import { Booking } from './Booking'
import { Modal } from './Modal'

type Request = { categoryId?: string; nonce: number }

function readCategory(detail: unknown): string | undefined {
  if (typeof detail !== 'object' || detail === null || !('categoryId' in detail)) return undefined
  return typeof detail.categoryId === 'string' ? detail.categoryId : undefined
}

// Foglaló modál: minden nyitáskor friss űrlap, az esetleges kategória előválasztásával
export function BookingModal() {
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState<Request>({ nonce: 0 })

  useEffect(() => {
    const onOpen = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const categoryId = readCategory(event.detail)
      setRequest((prev) => ({ categoryId, nonce: prev.nonce + 1 }))
      setOpen(true)
    }
    window.addEventListener(BOOKING_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(BOOKING_OPEN_EVENT, onOpen)
  }, [])

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Időpontfoglalás" wide>
      <Booking key={request.nonce} embedded initialCategory={request.categoryId} />
    </Modal>
  )
}
