import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ApiError, payDemo } from '../lib/api'
import type { Payment } from '../lib/api'
import '../styles/payment.css'

type Props = { payment: Payment; onPaid: () => void; onCancel: () => void }

const TEST_CARD = '4242 4242 4242 4242'
const formatCard = (value: string) => (value.replace(/\D/g, '').slice(0, 16).match(/.{1,4}/g) ?? []).join(' ')
const formatExpiry = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}
const formatCvc = (value: string) => value.replace(/\D/g, '').slice(0, 4)

export function DemoPayment({ payment, onPaid, onCancel }: Props) {
  const [card, setCard] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [paid, setPaid] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!paid) return
    const timer = window.setTimeout(onPaid, 1100)
    return () => window.clearTimeout(timer)
  }, [paid, onPaid])

  const amount = `${new Intl.NumberFormat('hu-HU').format(payment.amountHuf)} Ft`

  const fillTestCard = () => {
    setCard(TEST_CARD)
    setExpiry((current) => current || '12/30')
    setCvc((current) => current || '123')
    setError('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || paid) return
    setSubmitting(true)
    setError('')
    try {
      await payDemo(payment.id, card)
      setPaid(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Valami félresikerült. Próbáld újra.')
    } finally {
      setSubmitting(false)
    }
  }

  if (paid) {
    return (
      <div className="pay-demo pay-success" role="status" aria-live="polite">
        <span className="pay-check" aria-hidden="true">✓</span>
        <p className="pay-success-title">Sikeres fizetés</p>
      </div>
    )
  }

  return (
    <form className="pay-demo" onSubmit={submit} noValidate>
      <header className="pay-head">
        <p className="pay-eyebrow">Biztonságos fizetés</p>
        <p className="pay-amount">
          <span className="pay-amount-label">Fizetendő</span>
          <span className="pay-amount-value">{amount}</span>
        </p>
      </header>

      <p className="pay-notice">Demó fizetés – nem történik valódi terhelés. Teszt kártya: 4242 4242 4242 4242</p>

      <div className="pay-field">
        <label htmlFor="pay-card">Kártyaszám</label>
        <input
          id="pay-card"
          name="cc-number"
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="0000 0000 0000 0000"
          value={card}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setCard(formatCard(event.target.value))}
          disabled={submitting}
          required
        />
      </div>

      <div className="pay-row">
        <div className="pay-field">
          <label htmlFor="pay-expiry">Lejárat</label>
          <input
            id="pay-expiry"
            name="cc-exp"
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="HH/ÉÉ"
            value={expiry}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setExpiry(formatExpiry(event.target.value))}
            disabled={submitting}
            required
          />
        </div>
        <div className="pay-field">
          <label htmlFor="pay-cvc">CVC</label>
          <input
            id="pay-cvc"
            name="cc-csc"
            type="text"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            value={cvc}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setCvc(formatCvc(event.target.value))}
            disabled={submitting}
            required
          />
        </div>
      </div>

      <button type="button" className="pay-fill" onClick={fillTestCard} disabled={submitting}>
        Teszt kártya kitöltése
      </button>

      {error && <p className="pay-error" role="alert">{error}</p>}

      <div className="pay-actions">
        <button type="button" className="pay-cancel" onClick={onCancel} disabled={submitting}>
          Mégse
        </button>
        <button type="submit" className="pay-submit" disabled={submitting || card.length === 0}>
          {submitting ? 'Feldolgozás…' : `Fizetés · ${amount}`}
        </button>
      </div>
    </form>
  )
}
