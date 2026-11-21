import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp, Sparkles, X } from 'lucide-react'
import { answer, chipLabels, detectIntent, welcome, type BotSettings, type ChatAction, type IntentId, type Reply } from '../lib/chatbot'
import { getSettings } from '../lib/api'
import { openBooking } from '../lib/bookingModal'
import { getLenis, scrollToTarget } from '../lib/motion'

type Message = { id: number; from: 'bot' | 'user'; text?: string; reply?: Reply }

const STORE = 'nbe-chat'
const MOBILE = '(max-width: 759.98px)'
const isMobile = () => window.matchMedia(MOBILE).matches
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function loadMessages(): Message[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || 'null')
    if (Array.isArray(saved) && saved.length) return saved
  } catch { /* üres vagy sérült tárolt beszélgetés */ }
  return [{ id: 1, from: 'bot', reply: welcome }]
}

// Gépelési idő a válasz hosszától függően, hogy élő beszélgetés hatását keltse
const typingDelay = (reply: Reply) => {
  if (reducedMotion()) return 250
  const length = reply.text.length + (reply.list?.join('').length ?? 0) / 2
  return Math.min(500 + length * 6, 1500)
}

export function ChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>(loadMessages)
  const [typing, setTyping] = useState(0)
  const [text, setText] = useState('')
  const settings = useRef<BotSettings | null>(null)
  const busyUntil = useRef(0)
  const timers = useRef<number[]>([])
  const nextId = useRef(Math.max(...messages.map((m) => m.id)) + 1)
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const fab = useRef<HTMLButtonElement>(null)

  useEffect(() => { sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-60))) }, [messages])
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  // A fizetési módok és az előleg a szerverről jönnek, az első megnyitáskor töltjük be
  useEffect(() => {
    if (!open || settings.current) return
    getSettings().then((s) => { settings.current = s }).catch(() => {})
  }, [open])

  // Új üzenetnél és gépelésjelzőnél a lista aljára görgetünk
  useLayoutEffect(() => {
    const el = list.current
    if (!el || !open) return
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [messages, typing, open])

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

  const run = (action: ChatAction) => {
    if (action.kind === 'booking') { setOpen(false); openBooking(); return }
    if (action.kind === 'section') {
      if (isMobile()) setOpen(false)
      window.setTimeout(() => scrollToTarget(action.target, -72), isMobile() ? 320 : 0)
      return
    }
    window.open(action.href, '_blank', 'noopener,noreferrer')
  }

  const last = messages[messages.length - 1]
  const chips = !typing && last?.from === 'bot' ? last.reply?.chips ?? [] : []

  return (
    <>
      <button ref={fab} type="button" className="chat-fab" data-open={open || undefined} aria-expanded={open} aria-controls="chat-panel"
        aria-label={open ? 'Csevegés bezárása' : 'Kérdésed van? Csevegés megnyitása'} onClick={() => setOpen((v) => !v)}>
        <Sparkles className="chat-fab-icon chat-fab-open" size={24} strokeWidth={1.7} aria-hidden="true" />
        <X className="chat-fab-icon chat-fab-close" size={24} strokeWidth={1.6} aria-hidden="true" />
      </button>

      <div ref={panel} id="chat-panel" className="chat-panel" data-open={open || undefined} role="dialog" aria-modal="false"
        aria-label="Nails by Evelin asszisztens" aria-hidden={!open} inert={!open} data-lenis-prevent>
        <header className="chat-head">
          <img className="chat-avatar" src={`${import.meta.env.BASE_URL}images/logo-sm.webp`} alt="" width={40} height={40} />
          <div className="chat-title">
            <strong>Nails <em>by</em> Evelin</strong>
            <span><i className="chat-online" aria-hidden="true" />Asszisztens · azonnal válaszol</span>
          </div>
          <button type="button" className="chat-close" aria-label="Csevegés bezárása" onClick={() => { setOpen(false); fab.current?.focus() }}>
            <X size={20} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </header>

        <div ref={list} className="chat-log" aria-live="polite" aria-relevant="additions">
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
        </div>

        <div className="chat-foot">
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
        </div>
      </div>
    </>
  )
}
