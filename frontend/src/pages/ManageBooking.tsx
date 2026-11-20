import { useCallback, useEffect, useState } from 'react'
import { ApiError, bookingAction, getBooking, payBooking, type Payment, type PublicBooking } from '../lib/api'
import { forint } from '../lib/catalog'
import { formatWhen } from '../lib/dates'
import { PageShell } from '../components/PageShell'

const STATUS: Record<string, { label: string; tone: 'ok' | 'wait' | 'off' }> = {
  booked: { label: 'Rögzítve', tone: 'ok' }, pending_payment: { label: 'Fizetésre vár', tone: 'wait' }, cancelled: { label: 'Lemondva', tone: 'off' },
  expired: { label: 'Lejárt', tone: 'off' }, no_show: { label: 'Elmaradt', tone: 'off' }, completed: { label: 'Teljesítve', tone: 'ok' }, rejected: { label: 'Elutasítva', tone: 'off' },
}

export function ManageBooking({ id, token, query }: { id: string; token: string; query: URLSearchParams }) {
  const [booking, setBooking] = useState<PublicBooking | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [askCancel, setAskCancel] = useState(false)
  const [payment, setPayment] = useState<Payment | null>(null)

  const load = useCallback(() => getBooking(id, token).then(setBooking).catch((reason: unknown) => {
    setError(reason instanceof ApiError && reason.status === 404 ? 'Ez a link nem érvényes, vagy a foglalás már nem található.' : reason instanceof Error ? reason.message : 'Hiba történt.')
  }), [id, token])

  useEffect(() => { load() }, [load])
  // Fizetés után a webhook pár másodperc késéssel érkezhet: addig figyeljük
  useEffect(() => {
    if (booking?.status !== 'pending_payment') return
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [booking?.status, load])

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await action(); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hiba történt.') } finally { setBusy(false); setAskCancel(false) }
  }
  const pay = () => run(async () => {
    const result = await payBooking(id, token)
    setPayment(result.payment)
    if (result.payment.checkoutUrl) window.location.assign(result.payment.checkoutUrl)
  })

  if (!booking) return <PageShell><div className="status-card">{error ? <p className="form-error" role="alert">{error}</p> : <p>Betöltés…</p>}</div></PageShell>

  const info = STATUS[booking.status] ?? { label: booking.status, tone: 'off' as const }
  const active = booking.status === 'booked'
  const hoursLeft = (Date.parse(booking.startsAt) - Date.now()) / 3_600_000
  const confirmed = booking.confirmationStatus === 'confirmed'

  return (
    <PageShell>
      <div className="status-card">
        <p className="eyebrow"><span className="eyebrow-line" />A foglalásod</p>
        <h1>{booking.firstName}, <em>{active && confirmed ? 'várlak!' : 'az időpontod'}</em></h1>
        <p className={`pill pill-${info.tone}`}>{active && confirmed ? 'Megerősítve' : info.label}</p>
        <dl className="status-list">
          <div><dt>Szolgáltatás</dt><dd>{booking.serviceName}</dd></div>
          <div><dt>Időpont</dt><dd>{formatWhen(booking.startsAt)}</dd></div>
          <div><dt>Ár</dt><dd>{forint(booking.priceHuf)}</dd></div>
          {booking.amountDueHuf > 0 && <div><dt>Előre fizetendő</dt><dd>{forint(booking.amountDueHuf)}{booking.paymentStatus === 'paid' || booking.paymentStatus === 'paid_manual' ? ' (kifizetve)' : ''}</dd></div>}
        </dl>

        {query.get('cancelled') && booking.status === 'pending_payment' && <p className="notice">A fizetés megszakadt. Az időpontot a lenti gombbal fizetheted ki.</p>}
        {booking.status === 'pending_payment' && (
          <div className="status-actions">
            <p>Az időpont {booking.holdExpiresAt ? `${formatWhen(booking.holdExpiresAt)}-ig` : 'rövid ideig'} van fenntartva, utána automatikusan felszabadul.</p>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={pay}><span>Fizetés</span></button>
            {payment?.instructions && <p className="notice">{payment.instructions}</p>}
          </div>
        )}
        {active && !confirmed && (
          <div className="status-actions"><p>Kérlek, erősítsd meg, hogy tudsz jönni. Így tudom, hogy számíthatok rád.</p>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(() => bookingAction(id, token, 'confirm'))}><span>Megerősítem</span></button></div>
        )}
        {active && confirmed && <p className="hint">Köszönöm! Pontosan érkezz, kísérő nélkül. Egy szett legalább 2 órát vesz igénybe.</p>}
        {booking.status === 'expired' && <p className="notice">A fizetés nem érkezett meg időben, ezért az időpont felszabadult. <a href="#/">Foglalj újat</a>.</p>}
        {booking.status === 'cancelled' && <p className="hint">Köszönöm, hogy szóltál. {booking.lateCancellation ? 'Szívesen látlak máskor is.' : ''}</p>}

        {(active || booking.status === 'pending_payment') && (
          <div className="status-cancel">
            {!askCancel ? <button className="btn-link" type="button" onClick={() => setAskCancel(true)}>Nem tudok jönni, lemondom</button> : (
              <div className="notice">
                <p>Biztosan lemondod?{hoursLeft < 24 ? ' Az időpont 24 órán belül van, Evelin erről értesítést kap.' : ''}</p>
                <button className="btn btn-dark btn-small" type="button" disabled={busy} onClick={() => run(() => bookingAction(id, token, 'cancel'))}><span>Igen, lemondom</span></button>
                <button className="btn-link" type="button" onClick={() => setAskCancel(false)}>Mégsem</button>
              </div>
            )}
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </PageShell>
  )
}
