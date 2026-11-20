import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError, request } from '../lib/api'
import { forint } from '../lib/catalog'
import { formatDateTime, formatLongDate } from '../lib/dates'
import { PageShell } from '../components/PageShell'

type AdminBooking = {
  id: string; name: string; phone: string; email: string; serviceName: string; startsAt: string; endsAt: string; status: string; paymentStatus: string
  confirmationStatus: string; priceHuf: number; amountDueHuf: number; customerNote: string; noShowCount: number; lateCancellation?: boolean; refundStatus?: string
}
type Block = { id: string; startsAt: string; endsAt: string; reason: string }
type AdminVoucher = { id: string; code: string; status: string; amountHuf: number; buyerName: string; buyerEmail: string; recipientName: string; expiresAt?: string; createdAt: string }

const STATUS: Record<string, string> = { booked: 'Foglalt', pending_payment: 'Fizetésre vár', cancelled: 'Lemondva', expired: 'Lejárt', no_show: 'Nem jelent meg', completed: 'Megjelent' }
const KEY = 'nbe-admin-token'

export function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem(KEY) ?? '')
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState<'bookings' | 'blocks' | 'vouchers'>('bookings')
  const [showAll, setShowAll] = useState(false)
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [vouchers, setVouchers] = useState<AdminVoucher[]>([])
  const [error, setError] = useState('')

  const call = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => request<T>(path, { method, body, headers: { authorization: `Bearer ${token}` } }), [token])
  const logout = () => { sessionStorage.removeItem(KEY); setToken('') }

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const [b, v] = await Promise.all([call<{ bookings: AdminBooking[]; blocks: Block[] }>('/api/admin/bookings'), call<{ vouchers: AdminVoucher[] }>('/api/admin/vouchers')])
      setBookings(b.bookings); setBlocks(b.blocks); setVouchers(v.vouchers); setError('')
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) { sessionStorage.removeItem(KEY); setToken(''); setError('Hibás jelszó.') } else setError(reason instanceof Error ? reason.message : 'Hiba történt.')
    }
  }, [token, call])

  useEffect(() => {
    // Az első betöltés után 30 másodpercenként frissít
    const first = window.setTimeout(refresh, 0)
    const timer = window.setInterval(refresh, 30_000)
    return () => { window.clearTimeout(first); window.clearInterval(timer) }
  }, [refresh])

  const act = async (path: string, body: unknown = {}, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    try { await call(path, 'POST', body); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hiba történt.') }
  }

  if (!token) {
    return (
      <PageShell>
        <form className="status-card" onSubmit={(event: FormEvent) => { event.preventDefault(); sessionStorage.setItem(KEY, draft); setToken(draft) }}>
          <p className="eyebrow"><span className="eyebrow-line" />Admin</p>
          <h1>Belépés</h1>
          <label className="field">Admin jelszó<input type="password" autoComplete="current-password" value={draft} onChange={(event) => setDraft(event.target.value)} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit"><span>Belépek</span></button>
        </form>
      </PageShell>
    )
  }

  const nowIso = new Date().toISOString()
  const visible = bookings.filter((item) => showAll || (['booked', 'pending_payment'].includes(item.status) && item.endsAt >= nowIso) || (item.status === 'booked' && item.endsAt < nowIso))
  const byDay = visible.reduce<Record<string, AdminBooking[]>>((acc, item) => { (acc[formatDateTime(item.startsAt).date] ||= []).push(item); return acc }, {})

  return (
    <PageShell wide>
      <div className="admin">
        <div className="admin-top">
          <h1>Foglalások</h1>
          <div className="admin-tabs" role="tablist">
            {([['bookings', 'Naptár'], ['blocks', 'Szabadság'], ['vouchers', 'Utalványok']] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          <button className="btn-link" type="button" onClick={logout}>Kilépés</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}

        {tab === 'bookings' && (
          <>
            <label className="consent"><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /><span>Lezárt és lemondott foglalások is</span></label>
            {Object.keys(byDay).length === 0 && <p className="hint">Nincs megjeleníthető foglalás.</p>}
            {Object.entries(byDay).map(([day, items]) => (
              <section key={day} className="admin-day">
                <h2>{formatLongDate(day)}</h2>
                {items.map((item) => {
                  const past = item.endsAt < nowIso
                  return (
                    <article key={item.id} className={`admin-card${item.status === 'cancelled' || item.status === 'expired' ? ' is-off' : ''}`}>
                      <div className="admin-time">{formatDateTime(item.startsAt).time}</div>
                      <div className="admin-info">
                        <b>{item.name}</b> <a href={`tel:${item.phone}`}>{item.phone}</a> · <a href={`mailto:${item.email}`}>{item.email}</a>
                        <p>{item.serviceName} · {forint(item.priceHuf)}</p>
                        <p className="admin-tags">
                          <span className={`pill pill-${item.status === 'booked' || item.status === 'completed' ? 'ok' : item.status === 'pending_payment' ? 'wait' : 'off'}`}>{STATUS[item.status] ?? item.status}</span>
                          {item.status === 'booked' && <span className={`pill pill-${item.confirmationStatus === 'confirmed' ? 'ok' : 'wait'}`}>{item.confirmationStatus === 'confirmed' ? 'Megerősítette' : 'Nem erősítette meg'}</span>}
                          {item.amountDueHuf > 0 && <span className="pill pill-wait">Előre: {forint(item.amountDueHuf)} – {item.paymentStatus}</span>}
                          {item.noShowCount > 0 && <span className="pill pill-warn">Korábbi elmaradás: {item.noShowCount}</span>}
                          {item.lateCancellation && <span className="pill pill-warn">Késői lemondás</span>}
                          {item.refundStatus === 'review' && <span className="pill pill-warn">Visszatérítés ellenőrzendő</span>}
                        </p>
                        {item.customerNote && <p className="admin-note">„{item.customerNote}”</p>}
                      </div>
                      <div className="admin-actions">
                        {item.status === 'pending_payment' && <button type="button" onClick={() => act(`/api/admin/bookings/${item.id}/payment-confirmed`)}>Fizetés megérkezett</button>}
                        {item.status === 'booked' && past && <button type="button" onClick={() => act(`/api/admin/bookings/${item.id}/complete`)}>Megjelent</button>}
                        {['booked', 'pending_payment'].includes(item.status) && <>
                          <button type="button" onClick={() => act(`/api/admin/bookings/${item.id}/no-show`, { reason: 'no_show' }, 'Nem jelent meg? A következő foglalásához teljes előrefizetés kell.')}>Nem jelent meg</button>
                          <button type="button" onClick={() => act(`/api/admin/bookings/${item.id}/no-show`, { reason: 'late' }, '30+ perc késés? A következő foglalásnál az előző díj is fizetendő lesz.')}>Késett</button>
                          <button type="button" className="is-quiet" onClick={() => act(`/api/admin/bookings/${item.id}/cancel`, {}, 'Lemondod a foglalást?')}>Lemondás</button>
                        </>}
                      </div>
                    </article>
                  )
                })}
              </section>
            ))}
          </>
        )}

        {tab === 'blocks' && (
          <section className="admin-day">
            <form className="admin-inline" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault(); const form = new FormData(event.currentTarget)
              await act('/api/admin/blocks', { date: form.get('date'), reason: form.get('reason') }); event.currentTarget.reset()
            }}>
              <label className="field">Nap<input type="date" name="date" required /></label>
              <label className="field">Megjegyzés<input name="reason" placeholder="Szabadság" maxLength={200} /></label>
              <button className="btn btn-dark btn-small" type="submit"><span>Nap lezárása</span></button>
            </form>
            {blocks.length === 0 && <p className="hint">Nincs lezárt nap vagy idősáv.</p>}
            {blocks.map((block) => (
              <article key={block.id} className="admin-card">
                <div className="admin-info"><b>{formatLongDate(formatDateTime(block.startsAt).date)}</b> {formatDateTime(block.startsAt).time}–{formatDateTime(block.endsAt).time}<p>{block.reason}</p></div>
                <div className="admin-actions"><button type="button" className="is-quiet" onClick={async () => { try { await call(`/api/admin/blocks/${block.id}`, 'DELETE'); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hiba történt.') } }}>Törlés</button></div>
              </article>
            ))}
          </section>
        )}

        {tab === 'vouchers' && (
          <section className="admin-day">
            {vouchers.length === 0 && <p className="hint">Még nincs rendelt utalvány.</p>}
            {vouchers.map((voucher) => (
              <article key={voucher.id} className="admin-card">
                <div className="admin-time">{forint(voucher.amountHuf)}</div>
                <div className="admin-info"><b>{voucher.code}</b> · {voucher.status === 'pending_payment' ? 'Fizetésre vár' : voucher.status === 'active' ? 'Aktív' : 'Beváltva'}
                  <p>{voucher.buyerName} · {voucher.buyerEmail}{voucher.recipientName ? ` → ${voucher.recipientName}` : ''}{voucher.expiresAt ? ` · érvényes: ${voucher.expiresAt.slice(0, 10)}` : ''}</p></div>
                <div className="admin-actions">
                  {voucher.status === 'pending_payment' && <button type="button" onClick={() => act(`/api/admin/vouchers/${voucher.id}/payment-confirmed`)}>Fizetés megérkezett</button>}
                  {voucher.status === 'active' && <button type="button" onClick={() => act(`/api/admin/vouchers/${voucher.id}/redeem`, {}, 'Beváltottnak jelölöd?')}>Beváltva</button>}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </PageShell>
  )
}
