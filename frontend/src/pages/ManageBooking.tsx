import { useCallback, useEffect, useState } from 'react'
import { ApiError, bookingAction, getBooking, getRescheduleAvailability, getSettings, payBooking, rescheduleBooking, type Availability, type Payment, type PublicBooking } from '../lib/api'
import { forint } from '../lib/catalog'
import { addDays, formatLongDate, formatWhen, todayString } from '../lib/dates'
import { Modal } from '../components/Modal'
import { DemoPayment } from '../components/DemoPayment'
import { SlotPicker } from '../components/SlotPicker'

const STATUS: Record<string, { label: string; tone: 'ok' | 'wait' | 'off' }> = {
  booked: { label: 'Rögzítve', tone: 'ok' }, pending_payment: { label: 'Fizetés szükséges', tone: 'wait' }, cancelled: { label: 'Lemondva', tone: 'off' },
  expired: { label: 'Lejárt', tone: 'off' }, no_show: { label: 'Elmaradt', tone: 'off' }, completed: { label: 'Teljesítve', tone: 'ok' }, rejected: { label: 'Elutasítva', tone: 'off' },
}

export function ManageBooking({ id, token, query }: { id: string; token: string; query: URLSearchParams }) {
  const [booking, setBooking] = useState<PublicBooking | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [askCancel, setAskCancel] = useState(false)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  // Időpont módosítása: választás → megerősítés; a „moved” a sikeres módosítás értesítője
  const [step, setStep] = useState<'main' | 'pick' | 'confirm'>('main')
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState('')
  const [maxDays, setMaxDays] = useState(14)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [moved, setMoved] = useState(false)

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
    if (result.payment.provider === 'demo') setPayOpen(true)
    else if (result.payment.checkoutUrl) window.location.assign(result.payment.checkoutUrl)
  })
  const loadSlots = useCallback(async () => {
    setSlotsLoading(true); setSlotsError('')
    try {
      const settings = await getSettings().catch(() => null)
      const days = settings && settings.maxDaysAhead > 0 ? settings.maxDaysAhead : 14
      setMaxDays(days)
      const today = todayString()
      setAvailability(await getRescheduleAvailability(id, token, today, addDays(today, days)))
    } catch (reason) {
      setAvailability(null); setSlotsError(reason instanceof Error ? reason.message : 'Nem sikerült betölteni az időpontokat.')
    } finally { setSlotsLoading(false) }
  }, [id, token])
  const startReschedule = () => { setError(''); setMoved(false); setNewDate(''); setNewTime(''); setStep('pick'); loadSlots() }
  const leaveReschedule = () => { setStep('main'); setError('') }
  const confirmReschedule = async () => {
    setBusy(true); setError('')
    try {
      setBooking(await rescheduleBooking(id, token, newDate, newTime))
      setMoved(true); setStep('main')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hiba történt.')
      if (reason instanceof ApiError && reason.code === 'slot_unavailable') { setNewTime(''); setStep('pick'); loadSlots() }
      else if (reason instanceof ApiError && reason.status === 409) { await load(); setStep('main') }
    } finally { setBusy(false) }
  }
  const onPaid = useCallback(() => { setPayOpen(false); load() }, [load])

  if (!booking) return <div className="manage">{error ? <p className="form-error" role="alert">{error}</p> : <p className="hint">Betöltés…</p>}</div>

  const info = STATUS[booking.status] ?? { label: booking.status, tone: 'off' as const }
  const active = booking.status === 'booked'
  const hoursLeft = (Date.parse(booking.startsAt) - Date.now()) / 3_600_000

  if (step === 'pick') {
    return (
      <div className="manage">
        <h3 className="manage-title">Időpont <em>módosítása</em></h3>
        <p className="hint">Jelenlegi időpontod: {formatWhen(booking.startsAt)}. Válassz egy szabad napot és időpontot.</p>
        <SlotPicker days={availability?.days ?? {}} loaded={Boolean(availability)} loading={slotsLoading} error={slotsError} onRetry={loadSlots}
          maxDays={maxDays} date={newDate} time={newTime} onDate={(day) => { setNewDate(day); setNewTime('') }} onTime={setNewTime} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="step-actions">
          <button className="btn btn-primary" type="button" disabled={!newDate || !newTime} onClick={() => { setError(''); setStep('confirm') }}><span>Tovább</span></button>
          <button className="btn-link" type="button" onClick={leaveReschedule}>Mégsem</button>
        </div>
      </div>
    )
  }
  if (step === 'confirm') {
    const newWhen = `${formatLongDate(newDate)}, ${newTime}`
    return (
      <div className="manage">
        <h3 className="manage-title">Módosítás <em>megerősítése</em></h3>
        <dl className="status-list">
          <div><dt>Szolgáltatás</dt><dd>{booking.serviceName}</dd></div>
          <div><dt>Jelenlegi időpont</dt><dd className="is-old">{formatWhen(booking.startsAt)}</dd></div>
          <div><dt>Új időpont</dt><dd>{newWhen}</dd></div>
        </dl>
        <p className="hint">A megerősítés után az új időpont rögzül, a jelenlegi felszabadul.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="step-actions">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={confirmReschedule}><span>{busy ? 'Mentés…' : 'Módosítás megerősítése'}</span></button>
          <button className="btn-link" type="button" disabled={busy} onClick={() => { setError(''); setStep('pick') }}>Vissza</button>
        </div>
      </div>
    )
  }

  return (
    <div className="manage">
      <h3 className="manage-title">{booking.firstName}, <em>{active ? 'várlak!' : 'az időpontod'}</em></h3>
        <p className={`pill pill-${info.tone}`}>{info.label}</p>
        <dl className="status-list">
          <div><dt>Szolgáltatás</dt><dd>{booking.serviceName}</dd></div>
          <div><dt>Időpont</dt><dd>{formatWhen(booking.startsAt)}</dd></div>
          <div><dt>Ár</dt><dd>{forint(booking.priceHuf)}</dd></div>
          {booking.amountDueHuf > 0 && <div><dt>Előre fizetendő</dt><dd>{forint(booking.amountDueHuf)}{booking.paymentStatus === 'paid' || booking.paymentStatus === 'paid_manual' ? ' (kifizetve)' : ''}</dd></div>}
        </dl>

        {moved && <p className="notice" role="status">Az időpontod módosítva, az új időpont rögzítve van.</p>}
        {query.get('cancelled') && booking.status === 'pending_payment' && <p className="notice">A fizetés megszakadt. Az előleget a lenti gombbal fizetheted ki.</p>}
        {booking.status === 'pending_payment' && (
          <div className="status-actions">
            <p>Az időpont rögzítéséhez fizesd ki az előleget{booking.holdExpiresAt ? ` ${formatWhen(booking.holdExpiresAt)}-ig` : ' rövid időn belül'}.</p>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={pay}><span>Fizetés</span></button>
            {payment?.instructions && <p className="notice">{payment.instructions}</p>}
          </div>
        )}
        {active && <p className="hint">Köszönöm! Pontosan érkezz, kísérő nélkül. Egy szett legalább 2 órát vesz igénybe.</p>}
        {booking.status === 'expired' && <p className="notice">A fizetés nem érkezett meg időben, ezért ez az időpont nem jött létre. <a href="#/">Foglalj újat</a>.</p>}
        {booking.status === 'cancelled' && <p className="hint">Köszönöm, hogy szóltál. {booking.lateCancellation ? 'Szívesen látlak máskor is.' : ''}</p>}

        {booking.status === 'booked' && (
          <div className="status-modify">
            {booking.canReschedule
              ? <button className="btn-link" type="button" onClick={startReschedule}>Időpont módosítása</button>
              : <p className="hint">Az időpont online már nem módosítható. Ha változtatni szeretnél, kérlek, írj Evelinnek.</p>}
          </div>
        )}
        {(active || booking.status === 'pending_payment') && (
          <div className={booking.status === 'booked' ? 'status-cancel-small' : 'status-cancel'}>
            {!askCancel ? (
              booking.status === 'booked'
                ? <p className="hint">Ha nem tudsz jönni, <button className="text-link" type="button" onClick={() => setAskCancel(true)}>lemondom az időpontot</button>.</p>
                : <button className="btn-link" type="button" onClick={() => setAskCancel(true)}>Nem tudok jönni, lemondom</button>
            ) : (
              <div className="notice">
                <p>Biztosan lemondod?{hoursLeft < 24 ? ' Az időpont 24 órán belül van, Evelin erről értesítést kap.' : ''}</p>
                <button className="btn btn-dark btn-small" type="button" disabled={busy} onClick={() => run(() => bookingAction(id, token, 'cancel'))}><span>Igen, lemondom</span></button>
                <button className="btn-link" type="button" onClick={() => setAskCancel(false)}>Mégsem</button>
              </div>
            )}
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {payment?.provider === 'demo' && (
          <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Fizetés">
            <DemoPayment payment={payment} onPaid={onPaid} onCancel={() => setPayOpen(false)} />
          </Modal>
        )}
    </div>
  )
}
