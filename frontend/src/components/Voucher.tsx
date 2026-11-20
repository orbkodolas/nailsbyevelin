import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { catalog, forint } from '../lib/catalog'
import { createVoucher, getSettings, type Payment, type PaymentMethod } from '../lib/api'
import { finePointer, gsap } from '../lib/motion'
import { Headline } from './Headline'
import { Photo } from './Photo'
import { PaymentPicker } from './PaymentPicker'

export function Voucher() {
  const { presets, minHuf, maxHuf, validMonths, redeemableFor } = catalog.voucher
  const [amount, setAmount] = useState(presets[1])
  const [custom, setCustom] = useState('')
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [method, setMethod] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [payment, setPayment] = useState<Payment | null>(null)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => { getSettings().then((s) => { setMethods(s.paymentMethods); setMethod(s.paymentMethods[0]?.id ?? '') }).catch(() => {}) }, [])

  // Finom döntés az utalványképen egérmozgásra
  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    if (!finePointer() || !card.current) return
    const rect = card.current.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    gsap.to(card.current, { rotationY: x * 8, rotationX: -y * 8, transformPerspective: 900, duration: 0.6, ease: 'power3.out' })
  }
  const untilt = () => card.current && gsap.to(card.current, { rotationX: 0, rotationY: 0, duration: 0.9, ease: 'power3.out' })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = custom ? Number(custom) : amount
    if (!Number.isInteger(value) || value < minHuf || value > maxHuf || value % 500 !== 0) { setError(`Az érték ${forint(minHuf)} és ${forint(maxHuf)} között, 500 Ft-os lépésekben adható meg.`); return }
    setSending(true); setError('')
    try {
      const result = await createVoucher({
        amountHuf: value, buyerName: form.get('buyerName'), buyerEmail: form.get('buyerEmail'), recipientName: form.get('recipientName'),
        message: form.get('message'), website: form.get('website'), paymentMethod: method || undefined,
      })
      setPayment(result.payment)
      if (result.payment.checkoutUrl) window.location.assign(result.payment.checkoutUrl)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'A rendelés nem sikerült.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="voucher" id="utalvany">
      <div className="voucher-grid">
        <div className="voucher-visual" onPointerMove={tilt} onPointerLeave={untilt} data-reveal>
          <div className="voucher-card" ref={card}><Photo id="voucher" sizes="(min-width: 900px) 44vw, 92vw" /><span className="sheen" aria-hidden="true" /></div>
        </div>
        <div className="voucher-copy">
          <p className="eyebrow" data-reveal><span className="eyebrow-line" />Ajándékutalvány</p>
          <Headline text={'Ajándékozz egy\n*szép pillanatot.*'} />
          <p data-reveal>Az utalvány {validMonths} hónapig érvényes, {redeemableFor} váltható be. A rendelés után a kódot e-mailben kapod meg.</p>

          {payment ? (
            <div className="notice" role="status" data-reveal>
              <b>Köszönöm a rendelést!</b>
              {payment.instructions ? <> {payment.instructions} Fizetendő: <b>{forint(payment.amountHuf)}</b>. Az utalvány a fizetés beérkezése után válik aktívvá.</> : payment.error ? ' A fizetési oldal most nem érhető el, kérlek, próbáld újra később.' : ' Átirányítalak a fizetéshez…'}
            </div>
          ) : (
            <form className="voucher-form" onSubmit={submit} data-reveal>
              <fieldset className="choice-group">
                <legend>Érték</legend>
                <div className="chips">
                  {presets.map((preset) => (
                    <button key={preset} type="button" className={`chip${!custom && amount === preset ? ' is-on' : ''}`} aria-pressed={!custom && amount === preset} onClick={() => { setAmount(preset); setCustom('') }}>{forint(preset)}</button>
                  ))}
                  <label className="chip chip-input"><span className="sr-only">Egyéb összeg forintban</span>
                    <input type="number" inputMode="numeric" min={minHuf} max={maxHuf} step={500} placeholder="Egyéb" value={custom} onChange={(event) => setCustom(event.target.value)} />
                  </label>
                </div>
              </fieldset>
              <div className="field-row">
                <label className="field">Neved<input name="buyerName" autoComplete="name" required minLength={2} /></label>
                <label className="field">E-mail<input name="buyerEmail" type="email" autoComplete="email" required /></label>
              </div>
              <label className="field">Kinek szól? <small>(nem kötelező)</small><input name="recipientName" maxLength={100} /></label>
              <label className="field">Üzenet <small>(nem kötelező)</small><textarea name="message" rows={2} maxLength={300} /></label>
              <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
              <PaymentPicker methods={methods} value={method} onChange={setMethod} name="voucher-payment" />
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="btn btn-primary" type="submit" disabled={sending}><span>{sending ? 'Küldés…' : `Megrendelem · ${forint(custom ? Number(custom) || 0 : amount)}`}</span></button>
            </form>
          )}
        </div>
      </div>

      <div className="wonder">
        <div className="wonder-media" data-clip><Photo id="christmas-wonder" sizes="(min-width: 900px) 30vw, 90vw" /></div>
        <div className="wonder-copy">
          <p className="eyebrow" data-reveal><span className="eyebrow-line" />Karácsonyi akció</p>
          <Headline text={'Egy kis\n*karácsonyi csoda.*'} />
          <p data-reveal>Idén karácsonykor szeretnék valakinek egy kicsit többet adni, mint egy szép köröm. Ha ismersz olyan lányt vagy édesanyát, akinek ez sokat jelentene, jelöld meg, vagy írj nekem privát üzenetet.</p>
          <p className="wonder-quote" data-reveal>Mert karácsonykor nem az ajándék értéke számít, hanem az öröm, amit adni tudunk.</p>
        </div>
      </div>
    </section>
  )
}
