import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp, Sparkles, X } from 'lucide-react'
import { answer, chipLabels, detectIntent, welcome, type BotSettings, type ChatAction, type IntentId, type Reply } from '../lib/chatbot'
import { ApiError, closeLiveChat, getLiveChat, getSettings, sendLiveMessage, startLiveChat, type LiveChat, type LiveMessage, type LiveStatus } from '../lib/api'
import { openBooking } from '../lib/bookingModal'
import { getLenis, scrollToTarget } from '../lib/motion'

type Message = { id: number; from: 'bot' | 'user'; text?: string; reply?: Reply }
type Mode = 'bot' | 'form' | 'live'
// A 'pending' a böngésző újratöltése utáni, még a szerverről meg nem erősített élő chat
type LiveState = { id: string; token: string; status: LiveStatus | 'pending'; closedBy: LiveChat['closedBy']; email: string; until: number | null; seq: number; messages: LiveMessage[] }

const STORE = 'nbe-chat'
const LIVE_STORE = 'nbe-live'
const GUEST_STORE = 'nbe-guest'
const MOBILE = '(max-width: 759.98px)'
const isMobile = () => window.matchMedia(MOBILE).matches
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const isActive = (chat: LiveState | null) => !!chat && chat.status !== 'missed' && chat.status !== 'closed'
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Valami félresikerült. Próbáld újra.')
const liveStatusText: Record<LiveState['status'], string> = {
  pending: 'Csatlakozás…', waiting: 'Értesítettük Evelint…', live: 'Élőben válaszol', missed: 'Most nem elérhető', closed: 'Most nem elérhető',
}

function loadMessages(): Message[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || 'null')
    if (Array.isArray(saved) && saved.length) return saved
  } catch { /* üres vagy sérült tárolt beszélgetés */ }
  return [{ id: 1, from: 'bot', reply: welcome }]
}

function loadLive(): LiveState | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(LIVE_STORE) || 'null')
    if (saved?.id && saved?.token) return { id: saved.id, token: saved.token, status: 'pending', closedBy: null, email: '', until: null, seq: 0, messages: [] }
  } catch { /* sérült tárolt azonosító */ }
  return null
}

function loadGuest(): { name: string; email: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(GUEST_STORE) || 'null')
    if (saved) return { name: String(saved.name ?? ''), email: String(saved.email ?? '') }
  } catch { /* sérült tárolt adat */ }
  return { name: '', email: '' }
}

// Szerver nézet → kliens állapot: az üzeneteket azonosító alapján egyesítjük, a határidőt a szerveridőhöz igazítjuk
function toLive(view: LiveChat, prev: LiveState | null): LiveState {
  const same = prev?.id === view.id ? prev : null
  const known = new Set(same?.messages.map((m) => m.id))
  const offset = Date.parse(view.serverNow) - Date.now()
  return {
    id: view.id, token: view.token, status: view.status, closedBy: view.closedBy, email: view.email,
    until: view.deadline ? Date.parse(view.deadline) - offset : null,
    seq: view.seq,
    messages: [...(same?.messages ?? []), ...(view.messages ?? []).filter((m) => !known.has(m.id))],
  }
}

// Gépelési idő a válasz hosszától függően, hogy élő beszélgetés hatását keltse
const typingDelay = (reply: Reply) => {
  if (reducedMotion()) return 250
  const length = reply.text.length + (reply.list?.join('').length ?? 0) / 2
  return Math.min(500 + length * 6, 1500)
}

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const left = Math.max(0, Math.ceil((until - now) / 1000))
  return <>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</>
}

export function ChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>(loadMessages)
  const [typing, setTyping] = useState(0)
  const [text, setText] = useState('')
  const [chat, setChat] = useState<LiveState | null>(loadLive)
  const [mode, setMode] = useState<Mode>(() => (chat ? 'live' : 'bot'))
  const [guest, setGuest] = useState(loadGuest)
  const [liveText, setLiveText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [seen, setSeen] = useState(0)
  const settings = useRef<BotSettings | null>(null)
  const busyUntil = useRef(0)
  const timers = useRef<number[]>([])
  const nextId = useRef(Math.max(...messages.map((m) => m.id)) + 1)
  const seqRef = useRef(0)
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const fab = useRef<HTMLButtonElement>(null)

  useEffect(() => { sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-60))) }, [messages])
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  // Az aktív élő chat azonosítóját megtartjuk, így újratöltés után is folytatódik
  useEffect(() => {
    if (chat && isActive(chat)) sessionStorage.setItem(LIVE_STORE, JSON.stringify({ id: chat.id, token: chat.token }))
    else sessionStorage.removeItem(LIVE_STORE)
  }, [chat])

  // A fizetési módok és az előleg a szerverről jönnek, az első megnyitáskor töltjük be
  useEffect(() => {
    if (!open || settings.current) return
    getSettings().then((s) => { settings.current = s }).catch(() => {})
  }, [open])

  const forget = useCallback(() => {
    setChat(null)
    setMode((m) => (m === 'live' ? 'bot' : m))
    setError('')
  }, [])

  const applyView = useCallback((view: LiveChat) => {
    seqRef.current = view.seq
    setChat((prev) => toLive(view, prev))
  }, [])

  // Hosszú lekérdezés: a szerver az új üzenetig (legfeljebb ~20 mp) tartja nyitva a kérést
  const liveId = chat?.id
  const liveToken = chat?.token
  // „Nem elérhető” állapotban is figyelünk, amíg a panel nyitva van: Evelin ilyenkor is válaszolhat élőben
  const polling = isActive(chat) || (open && chat?.status === 'missed')
  useEffect(() => {
    if (!liveId || !liveToken || !polling) return
    let stop = false
    const controller = new AbortController()
    const poll = async () => {
      while (!stop) {
        try {
          const view = await getLiveChat(liveId, liveToken, seqRef.current, seqRef.current > 0, controller.signal)
          if (!stop) applyView(view)
        } catch (err) {
          if (stop) return
          // Ismeretlen vagy lejárt chat: nincs mit folytatni
          if (err instanceof ApiError && (err.status === 403 || err.status === 404)) { forget(); return }
          await pause(3000)
        }
      }
    }
    void poll()
    return () => { stop = true; controller.abort() }
  }, [liveId, liveToken, polling, applyView, forget])

  // Zárt panelnél a új Evelin-üzenet pöttyöt kap a lebegő gombon
  const evelinCount = chat?.messages.filter((m) => m.from === 'evelin').length ?? 0
  const unread = !open && evelinCount > seen
  useEffect(() => { if (open) setSeen(evelinCount) }, [open, evelinCount])

  // Új üzenetnél és gépelésjelzőnél a lista aljára görgetünk
  useLayoutEffect(() => {
    const el = list.current
    if (!el || !open) return
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [messages, typing, open, mode, chat])

  // Megnyitáskor: mobilon a háttér nem görög; Esc zár; asztalin a beviteli mező kap fókuszt
  useEffect(() => {
    if (!open) return
    const mobile = isMobile()
    const lenis = getLenis()
    const overflow = document.body.style.overflow
    if (mobile) { document.body.style.overflow = 'hidden'; lenis?.stop() }
    else input.current?.focus({ preventScroll: true })
    list.current?.scrollTo({ top: list.current.scrollHeight })
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); fab.current?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (mobile) { document.body.style.overflow = overflow; lenis?.start() }
    }
  }, [open])

  // Mobilon a panel a látható területhez igazodik, így a billentyűzet nem takarja ki a beviteli mezőt
  useEffect(() => {
    const vv = window.visualViewport
    const el = panel.current
    if (!open || !vv || !el) return
    const fit = () => {
      if (!isMobile()) { el.style.height = ''; el.style.top = ''; return }
      el.style.height = `${vv.height}px`
      el.style.top = `${vv.offsetTop}px`
    }
    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
      el.style.height = ''
      el.style.top = ''
    }
  }, [open])

  const ask = useCallback((question: string, intent?: IntentId) => {
    const q = question.trim()
    if (!q) return
    const id = intent ?? detectIntent(q)
    const reply = answer(id, settings.current)
    const userId = nextId.current++
    const botId = nextId.current++
    setMessages((prev) => [...prev, { id: userId, from: 'user', text: q }])
    // A válaszok sorban jönnek, akkor is, ha gyorsan több kérdés érkezik
    const start = Math.max(Date.now() + 250, busyUntil.current)
    const at = start + typingDelay(reply)
    busyUntil.current = at
    setTyping((n) => n + 1)
    timers.current.push(window.setTimeout(() => {
      setTyping((n) => n - 1)
      setMessages((prev) => [...prev, { id: botId, from: 'bot', reply }])
    }, at - Date.now()))
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    ask(text)
    setText('')
  }

  const openLive = () => { setError(''); setMode(chat ? 'live' : 'form') }

  const startChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const details = {
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      message: String(data.get('message') ?? '').trim(),
      website: String(data.get('website') ?? ''),
    }
    setBusy(true)
    setError('')
    try {
      const view = await startLiveChat(details)
      localStorage.setItem(GUEST_STORE, JSON.stringify({ name: details.name, email: details.email }))
      setGuest({ name: details.name, email: details.email })
      applyView(view)
      setMode('live')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const sendLive = async (event: FormEvent) => {
    event.preventDefault()
    const q = liveText.trim()
    if (!q || !chat) return
    setLiveText('')
    setError('')
    try {
      applyView(await sendLiveMessage(chat.id, chat.token, q))
    } catch (err) {
      setLiveText(q)
      setError(errorText(err))
    }
  }

  const endChat = () => {
    if (chat) void closeLiveChat(chat.id, chat.token).catch(() => {})
    forget()
  }

  const newQuestion = () => { forget(); setMode('form') }

  const run = (action: ChatAction) => {
    if (action.kind === 'live') { openLive(); return }
    if (action.kind === 'booking') { setOpen(false); openBooking(); return }
    if (action.kind === 'section') {
      if (isMobile()) setOpen(false)
      window.setTimeout(() => scrollToTarget(action.target, -72), isMobile() ? 320 : 0)
      return
    }
    if (action.href.startsWith('tel:')) window.location.href = action.href
    else window.open(action.href, '_blank', 'noopener,noreferrer')
  }

  const live = mode === 'live' ? chat : null
  const last = messages[messages.length - 1]
  const chips = !typing && last?.from === 'bot' ? last.reply?.chips ?? [] : []

  return (
    <>
      <button ref={fab} type="button" className="chat-fab" data-open={open || undefined} data-unread={unread || undefined} aria-expanded={open} aria-controls="chat-panel"
        aria-label={open ? 'Csevegés bezárása' : unread ? 'Új üzenet Evelintől' : 'Kérdésed van? Csevegés megnyitása'} onClick={() => setOpen((v) => !v)}>
        <Sparkles className="chat-fab-icon chat-fab-open" size={24} strokeWidth={1.7} aria-hidden="true" />
        <X className="chat-fab-icon chat-fab-close" size={24} strokeWidth={1.6} aria-hidden="true" />
      </button>

      <div ref={panel} id="chat-panel" className="chat-panel" data-open={open || undefined} role="dialog" aria-modal="false"
        aria-label="Nails by Evelin asszisztens" aria-hidden={!open} inert={!open} data-lenis-prevent>
        <div className="chat-head">
          <img className="chat-avatar" src={`${import.meta.env.BASE_URL}images/logo-sm.webp`} alt="" width={40} height={40} />
          <div className="chat-title">
            {live ? (
              <>
                <strong>Evelin</strong>
                <span>{live.status === 'live' && <i className="chat-online" aria-hidden="true" />}{liveStatusText[live.status]}</span>
              </>
            ) : (
              <>
                <strong>Nails <em>by</em> Evelin</strong>
                <span><i className="chat-online" aria-hidden="true" />Asszisztens · azonnal válaszol</span>
              </>
            )}
          </div>
          <button type="button" className="chat-close" aria-label="Csevegés bezárása" onClick={() => { setOpen(false); fab.current?.focus() }}>
            <X size={20} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>

        {mode === 'form' ? (
          <form className="chat-ask" onSubmit={startChat} aria-busy={busy}>
            <h3 className="chat-ask-title">Írj Evelinnek</h3>
            <p className="chat-ask-lead">Ha épp nem ér rá, e-mailben válaszol.</p>
            <label className="field">Keresztnév
              <input name="name" required maxLength={40} autoComplete="given-name" defaultValue={guest.name} />
            </label>
            <label className="field">E-mail
              <input name="email" type="email" required autoComplete="email" defaultValue={guest.email} />
            </label>
            <label className="field">Kérdésed
              <textarea name="message" required maxLength={1000} rows={5} />
            </label>
            {/* Robotcsapda: emberi felhasználó nem látja és nem tölti ki */}
            <input name="website" className="chat-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            {error && <p className="chat-error" role="alert">{error}</p>}
            <button type="submit" className="chat-submit" disabled={busy}>Küldés Evelinnek</button>
            <button type="button" className="chat-link" onClick={() => { setError(''); setMode('bot') }}>Vissza az asszisztenshez</button>
          </form>
        ) : (
          <>
            <div ref={list} className="chat-log" aria-live="polite" aria-relevant="additions">
              {live ? (
                <>
                  {live.messages.map((message) => (
                    <p key={message.id} className={`chat-msg ${message.from === 'guest' ? 'chat-msg-user' : 'chat-msg-bot'}`}>{message.text}</p>
                  ))}
                  {live.status === 'waiting' && (
                    <p className="chat-msg chat-msg-bot">
                      Evelin értesítést kapott a kérdésedről. Egy pillanat, és jelentkezik…
                      {live.until !== null && <> (<Countdown until={live.until} />)</>}
                    </p>
                  )}
                  {live.status === 'missed' && (
                    <p className="chat-msg chat-msg-bot">{`Evelin most nem tud élőben válaszolni, de megkapta a kérdésedet, és hamarosan e-mailben válaszol a(z) ${live.email} címre. Köszönjük a türelmed!`}</p>
                  )}
                  {live.status === 'closed' && (
                    <p className="chat-msg chat-msg-bot">{live.closedBy === 'evelin' ? 'Evelin lezárta a beszélgetést. Köszönjük, hogy írtál!' : 'A beszélgetés lezárult.'}</p>
                  )}
                </>
              ) : (
                <>
                  {messages.map((message) => message.from === 'user' ? (
                    <p key={message.id} className="chat-msg chat-msg-user">{message.text}</p>
                  ) : message.reply && (
                    <div key={message.id} className="chat-msg chat-msg-bot">
                      <p>{message.reply.text}</p>
                      {message.reply.list && <ul>{message.reply.list.map((row) => <li key={row}>{row}</li>)}</ul>}
                      {message.reply.after && <p className="chat-after">{message.reply.after}</p>}
                      {message.reply.actions?.length ? (
                        <div className="chat-actions">
                          {message.reply.actions.map((action) => (
                            <button key={action.label} type="button" className="chat-action" onClick={() => run(action)}>{action.label}</button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {typing > 0 && <div className="chat-msg chat-msg-bot chat-typing" aria-label="Gépel…"><span /><span /><span /></div>}
                </>
              )}
            </div>

            <div className="chat-foot">
              {live ? (
                isActive(live) ? (
                  <>
                    {error && <p className="chat-error" role="alert">{error}</p>}
                    <div className="chat-end">
                      <button type="button" className="chat-link" onClick={endChat}>Beszélgetés befejezése</button>
                    </div>
                    <form className="chat-form" onSubmit={sendLive}>
                      <input value={liveText} onChange={(e) => setLiveText(e.target.value)} placeholder="Írj Evelinnek…" aria-label="Üzenet Evelinnek"
                        maxLength={1000} autoComplete="off" enterKeyHint="send" />
                      <button type="submit" className="chat-send" aria-label="Küldés" disabled={!liveText.trim()}><ArrowUp size={20} strokeWidth={2} aria-hidden="true" /></button>
                    </form>
                  </>
                ) : (
                  <div className="chat-ended">
                    <button type="button" className="chat-action" onClick={newQuestion}>Új kérdés</button>
                    <button type="button" className="chat-action" onClick={forget}>Vissza az asszisztenshez</button>
                  </div>
                )
              ) : (
                <>
                  <button type="button" className="chat-live-link" onClick={openLive}>Élő chat Evelinnel</button>
                  {chips.length > 0 && (
                    <div className="chat-chips">
                      {chips.map((id) => (
                        <button key={id} type="button" className="chat-chip" onClick={() => ask(chipLabels[id], id)}>{chipLabels[id]}</button>
                      ))}
                    </div>
                  )}
                  <form className="chat-form" onSubmit={submit}>
                    <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Írd be a kérdésed…" aria-label="Kérdésed"
                      maxLength={300} autoComplete="off" enterKeyHint="send" />
                    <button type="submit" className="chat-send" aria-label="Küldés" disabled={!text.trim()}><ArrowUp size={20} strokeWidth={2} aria-hidden="true" /></button>
                  </form>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
