import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { catalog, durationLabel, forint } from '../lib/catalog'
import { ApiError, createBooking, getAvailability, getSettings, type Availability, type CreatedBooking, type PaymentMethod } from '../lib/api'
import { MONTHS, WEEKDAYS, addDays, formatLongDate, formatWhen, monthGrid, todayString } from '../lib/dates'
import { gsap, reducedMotion, scrollToTarget } from '../lib/motion'
import { Headline } from './Headline'
import { PaymentPicker } from './PaymentPicker'

export function Booking() {
  const [categoryId, setCategoryId] = useState(catalog.categories[0].id)
  const [serviceId, setServiceId] = useState('')
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [cursor, setCursor] = useState(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() } })
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [deposit, setDeposit] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedBooking | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  const category = catalog.categories.find((item) => item.id === categoryId) ?? catalog.categories[0]
  const service = category.items.find((item) => item.id === serviceId)

  useEffect(() => {
    getSettings().then((settings) => {
      setMethods(settings.paymentMethods); setEmailEnabled(settings.emailEnabled); setDeposit(settings.depositPercent)
      setPaymentMethod(settings.paymentMethods[0]?.id ?? '')
    }).catch(() => {})
  }, [])

  // Szolgáltatáscsoport választása a "Szolgáltatások" szekcióból
  useEffect(() => {
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      if (catalog.categories.some((item) => item.id === id)) { setCategoryId(id); setServiceId(''); setDate(''); setTime('') }
    }
    window.addEventListener('nbe:select-category', onSelect)
    return () => window.removeEventListener('nbe:select-category', onSelect)
  }, [])

  const loadAvailability = useCallback(() => {
    setLoading(true); setLoadError('')
    const today = todayString()
    getAvailability(category.items[0].id, today, addDays(today, 61))
      .then(setAvailability)
      .catch((reason: unknown) => { setAvailability(null); setLoadError(reason instanceof Error ? reason.message : 'Nem sikerült betölteni az időpontokat.') })
      .finally(() => setLoading(false))
  }, [category])
  useEffect(() => { loadAvailability() }, [loadAvailability])

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const days = availability?.days ?? {}
  const monthHasSlots = grid.some((day) => day && days[day]?.length)
  const slots = date ? days[date] ?? [] : []
  const now = new Date()
  const canGoBack = cursor.year > now.getFullYear() || cursor.month > now.getMonth()
  const lastDay = availability ? Object.keys(days).at(-1) ?? '' : ''
  const canGoForward = Boolean(lastDay) && `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}` < lastDay.slice(0, 7)
  const shiftMonth = (delta: number) => setCursor(({ year, month }) => { const d = new Date(year, month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() } })

  useEffect(() => {
    if (!created || reducedMotion() || !panel.current) return
    gsap.fromTo(panel.current.querySelectorAll('[data-done]'), { y: 28, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.1, ease: 'power3.out' })
  }, [created])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!service || !date || !time) { setError('Válassz szolgáltatást és időpontot.'); return }
    const form = new FormData(event.currentTarget)
    setSending(true); setError('')
    try {
      const result = await createBooking({
        serviceId: service.id, date, time, name: form.get('name'), phone: form.get('phone'), email: form.get('email'),
        note: form.get('note'), website: form.get('website'), acceptedRules: form.get('acceptedRules') === 'on', paymentMethod: paymentMethod || undefined,
      })
      setCreated(result)
      scrollToTarget('#idopont', -90)
      if (result.payment?.checkoutUrl) window.setTimeout(() => window.location.assign(result.payment!.checkoutUrl!), 1800)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'A foglalás nem sikerült.')
      if (reason instanceof ApiError && reason.code === 'slot_unavailable') { setTime(''); loadAvailability() }
    } finally {
      setSending(false)
    }
  }

  const step2Ready = Boolean(service)
  const step3Ready = Boolean(service && date && time)

  return (
    <section className="booking" id="idopont">
      <div className="booking-head">
        <p className="eyebrow" data-reveal><span className="eyebrow-line" />Időpontfoglalás</p>
        <Headline text={'Foglald le a\n*saját időd.*'} />
      </div>

      <div className="booking-card" ref={panel}>
        {created ? <Done booking={created} emailEnabled={emailEnabled} /> : (
          <form className="booking-form" onSubmit={submit} noValidate={false}>
            <div className="booking-steps">
              <fieldset className="step">
                <legend><span className="step-no">1</span>Szolgáltatás</legend>
                <div className="tabs" role="tablist" aria-label="Szolgáltatás típusa">
                  {catalog.categories.map((item) => (
                    <button key={item.id} type="button" role="tab" aria-selected={item.id === categoryId} className={item.id === categoryId ? 'is-on' : ''}
                      onClick={() => { setCategoryId(item.id); setServiceId(''); setDate(''); setTime('') }}>{item.name}</button>
                  ))}
                </div>
                <div className="options">
                  {category.items.map((item) => (
                    <label key={item.id} className={`option${item.id === serviceId ? ' is-on' : ''}`}>
                      <input type="radio" name="service" value={item.id} checked={item.id === serviceId} onChange={() => { setServiceId(item.id); setTime('') }} />
                      <span>{item.name}</span><b>{forint(item.priceHuf)}</b>
                    </label>
                  ))}
                </div>
                <p className="hint">{category.blurb} Időtartam: {durationLabel(category.durationMinutes)}.</p>
              </fieldset>

              <fieldset className={`step${step2Ready ? '' : ' is-locked'}`} disabled={!step2Ready}>
                <legend><span className="step-no">2</span>Időpont</legend>
                {loadError ? (
                  <div className="notice" role="alert">{loadError} <button type="button" className="btn-link" onClick={loadAvailability}>Újra</button></div>
                ) : (
                  <div className="calendar" aria-busy={loading}>
                    <div className="calendar-nav">
                      <button type="button" onClick={() => shiftMonth(-1)} disabled={!canGoBack} aria-label="Előző hónap">←</button>
                      <b>{cursor.year}. {MONTHS[cursor.month]}</b>
                      <button type="button" onClick={() => shiftMonth(1)} disabled={!canGoForward} aria-label="Következő hónap">→</button>
                    </div>
                    <div className="calendar-grid" role="grid">
                      {WEEKDAYS.map((weekday, index) => <span key={index} className="weekday">{weekday}</span>)}
                      {grid.map((day, index) => day === null ? <span key={`e${index}`} /> : (
                        <button key={day} type="button" className={`day${day === date ? ' is-on' : ''}`} disabled={!days[day]?.length}
                          aria-label={formatLongDate(day)} aria-pressed={day === date} onClick={() => { setDate(day); setTime('') }}>{Number(day.slice(8))}</button>
                      ))}
                    </div>
                    {!loading && availability && !monthHasSlots && <p className="hint">Ebben a hónapban nincs szabad időpont.</p>}
                  </div>
                )}
                {date && (
                  <div className="times" aria-label={`Szabad időpontok: ${formatLongDate(date)}`}>
                    <p className="hint">{formatLongDate(date)}</p>
                    <div className="time-list">
                      {slots.map((slot) => <button key={slot} type="button" className={`time${slot === time ? ' is-on' : ''}`} aria-pressed={slot === time} onClick={() => setTime(slot)}>{slot}</button>)}
                    </div>
                  </div>
                )}
              </fieldset>

              <fieldset className={`step${step3Ready ? '' : ' is-locked'}`} disabled={!step3Ready}>
                <legend><span className="step-no">3</span>Adataid</legend>
                <label className="field">Név<input name="name" autoComplete="name" minLength={2} maxLength={100} required placeholder="Hogy szólíthatlak?" /></label>
                <div className="field-row">
                  <label className="field">Telefonszám<input name="phone" type="tel" autoComplete="tel" required placeholder="+36 30 123 4567" /></label>
                  <label className="field">E-mail<input name="email" type="email" autoComplete="email" required placeholder="nev@email.hu" /></label>
                </div>
                <label className="field">Megjegyzés <small>(nem kötelező)</small><textarea name="note" rows={3} maxLength={1000} placeholder="Szín, forma, inspiráció…" /></label>
                <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                <PaymentPicker methods={methods} value={paymentMethod} onChange={setPaymentMethod} name="booking-payment" />
                <label className="consent">
                  <input name="acceptedRules" type="checkbox" required />
                  <span>Elolvastam és elfogadom a <a href="#hazirend">házirendet</a>: pontosan, kísérő nélkül érkezem, és ha nem tudok jönni, időben lemondom.</span>
                </label>
              </fieldset>
            </div>

            <aside className="summary" aria-live="polite">
              <h3>Foglalásod</h3>
              <dl>
                <div><dt>Szolgáltatás</dt><dd>{service ? `${category.name} – ${service.name}` : '–'}</dd></div>
                <div><dt>Időpont</dt><dd>{date && time ? `${formatLongDate(date)}, ${time}` : '–'}</dd></div>
                <div><dt>Időtartam</dt><dd>{service ? durationLabel(category.durationMinutes) : '–'}</dd></div>
                <div className="total"><dt>Ár</dt><dd>{service ? forint(service.priceHuf) : '–'}</dd></div>
              </dl>
              <p className="hint">{deposit > 0 ? `Foglaláskor ${deposit}% előleg fizetendő. ` : 'Fizetés a helyszínen. '}Korábbi elmaradt időpont esetén a teljes összeget előre kell fizetni.</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="btn btn-primary btn-block" type="submit" disabled={sending || !step3Ready}><span>{sending ? 'Küldés…' : 'Időpontot foglalok'}</span></button>
            </aside>
          </form>
        )}
      </div>
    </section>
  )
}

function Done({ booking, emailEnabled }: { booking: CreatedBooking; emailEnabled: boolean }) {
  const [copied, setCopied] = useState(false)
  const payment = booking.payment
  const waiting = booking.status === 'pending_payment'
  const manageUrl = `${window.location.origin}/#/foglalas/${booking.id}/${booking.manageToken}`
  const copy = async () => { try { await navigator.clipboard.writeText(manageUrl); setCopied(true) } catch { /* a link lent látható */ } }

  return (
    <div className="done">
      <p className="eyebrow" data-done><span className="eyebrow-line" />{waiting ? 'Még egy lépés' : 'Rögzítettem'}</p>
      <h3 data-done>{waiting ? 'Az időpontod a fizetés után végleges.' : `Köszönöm, ${booking.firstName}!`}</h3>
      <p className="done-when" data-done>{booking.serviceName}<br />{formatWhen(booking.startsAt)}</p>
      <p data-done>{booking.policy}</p>
      {payment?.checkoutUrl && <p data-done>Átirányítalak a biztonságos fizetéshez… <a className="btn-link" href={payment.checkoutUrl}>Ha nem történik semmi, kattints ide</a></p>}
      {payment?.instructions && <p className="notice" data-done>{payment.instructions}<br />Fizetendő: <b>{forint(payment.amountHuf)}</b></p>}
      {payment?.error && <p className="notice" data-done>A fizetési oldal most nem érhető el. A foglalásod linkjén később újra megpróbálhatod.</p>}
      <div className="done-link" data-done>
        <p>{emailEnabled ? 'A linket e-mailben is elküldtem. Itt tudod megerősíteni vagy lemondani az időpontot:' : 'Mentsd el ezt a linket: itt tudod megerősíteni vagy lemondani az időpontot.'}</p>
        <a href={manageUrl}>{manageUrl}</a>
        <button type="button" className="btn-link" onClick={copy}>{copied ? 'Kimásolva' : 'Link másolása'}</button>
      </div>
    </div>
  )
}
