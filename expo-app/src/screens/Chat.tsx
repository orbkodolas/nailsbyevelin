import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, type ScrollViewInstance, Text, TextInput, View } from 'react-native'
import { Bell, BellOff, ChevronLeft, Mail, Send, Settings, Trash2 } from 'lucide-react-native'
import { chatAction, chatReply, deleteChat, errorText, setChatSettings, type Chat as ChatData, type ChatMessage, type ChatSettings, type ChatStatus } from '../api'
import { dropChat, openChat, putChat, putSettings, useChats } from '../chatStore'
import { c, f, fmtTime, s } from '../theme'
import { Badge, Button, IconButton, confirm, notice, useLayout } from '../ui'
import { Devices } from './Devices'

const pad = (n: number) => String(n).padStart(2, '0')
const STATUS: Record<ChatStatus, { label: string; color: string; soft?: string }> = {
  waiting: { label: 'Válaszra vár', color: c.rose },
  live: { label: 'Élő', color: c.ok, soft: c.okSoft },
  missed: { label: 'Nem fogadott', color: c.gold },
  closed: { label: 'Lezárva', color: c.muted },
}
const CLOSED_BY = { guest: 'a látogató', evelin: 'te', idle: 'inaktivitás' } as const
// A csoportok sorrendje; egy beszélgetés az első illeszkedő csoportba kerül
const GROUPS: { title: string; test: (ch: ChatData) => boolean }[] = [
  { title: 'Válaszra vár', test: (ch) => ch.status === 'waiting' },
  { title: 'Élő beszélgetés', test: (ch) => ch.status === 'live' },
  { title: 'Válaszolj e-mailben', test: (ch) => ch.status === 'missed' && !ch.emailedAt },
  { title: 'Korábbiak', test: () => true },
]
const groupOf = (ch: ChatData) => GROUPS.findIndex((g) => g.test(ch))

/** Visszaszámláló mm:ss formátumban; a szerver órájához igazítva (offset). */
function Countdown({ deadline, offset, size = 13 }: { deadline: string; offset: number; size?: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, Math.ceil((Date.parse(deadline) - (Date.now() + offset)) / 1000))
  return <Text style={{ color: c.rose, fontFamily: f.semibold, fontSize: size }}>{`${pad(Math.floor(left / 60))}:${pad(left % 60)}`}</Text>
}

/** Elérhetőség-kapcsoló és foglaltság (a Naptár értesítés-kapcsolójának stílusában). */
function Availability({ settings }: { settings: ChatSettings }) {
  const [busy, setBusy] = useState(false)
  const on = settings.available
  const busyUntil = settings.busyUntil && Date.parse(settings.busyUntil) > Date.now() ? settings.busyUntil : null

  async function run(body: { available?: boolean; clearBusy?: boolean }) {
    setBusy(true)
    try { putSettings(await setChatSettings(body)) }
    catch (e) { notice('Nem sikerült', errorText(e), 'danger') }
    finally { setBusy(false) }
  }

  return (
    <View style={[s.card, { gap: 8 }]}>
      <Pressable onPress={() => run({ available: !on })} disabled={busy} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed && { opacity: 0.7 }]}>
        {on ? <Bell size={20} color={c.rose} strokeWidth={1.8} /> : <BellOff size={20} color={c.muted} strokeWidth={1.8} />}
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Elérhető vagyok chatre</Text>
          <Text style={s.small}>{on ? 'A látogatók kérdezhetnek az oldalon.' : 'Most nem fogadsz új kérdést.'}</Text>
        </View>
        <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: on ? c.rose : c.berry, alignItems: on ? 'flex-end' : 'flex-start' }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: on ? c.bg : c.muted }} />
        </View>
      </Pressable>
      {busyUntil && (
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={[s.small, { color: c.gold }]}>{`Foglalt ${fmtTime(busyUntil)}-ig`}</Text>
          <Button label="Feloldás" ghost small onPress={() => run({ clearBusy: true })} />
        </View>
      )}
    </View>
  )
}

function ChatRow({ chat, offset, onPress }: { chat: ChatData; offset: number; onPress: () => void }) {
  const last = chat.messages[chat.messages.length - 1]
  const st = STATUS[chat.status]
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, { gap: 6 }, pressed && { opacity: 0.7 }]}>
      <View style={[s.row, { flexWrap: 'nowrap', justifyContent: 'space-between' }]}>
        <Text style={[s.title, { flex: 1 }]} numberOfLines={1}>{chat.name}</Text>
        <Badge label={st.label} color={st.color} soft={st.soft} />
      </View>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>{last ? `${last.from === 'evelin' ? 'Te: ' : ''}${last.text}` : '–'}</Text>
        {chat.unread > 0 && (
          <View style={{ backgroundColor: c.rose, borderRadius: 99, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}>
            <Text style={{ color: c.bg, fontSize: 11, fontFamily: f.semibold }}>{chat.unread}</Text>
          </View>
        )}
      </View>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        {chat.status === 'waiting' && chat.deadline
          ? <Countdown deadline={chat.deadline} offset={offset} />
          : <Text style={s.small}>{fmtTime(last?.at ?? chat.updatedAt)}</Text>}
        <Text style={s.small}>{chat.email}</Text>
      </View>
    </Pressable>
  )
}

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.from === 'evelin'
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', alignItems: mine ? 'flex-end' : 'flex-start', gap: 3 }}>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: mine ? c.rose : c.line, backgroundColor: mine ? c.roseSoft : c.raised, paddingHorizontal: 14, paddingVertical: 9 }}>
        <Text style={[s.text, { lineHeight: 21 }]}>{m.text}</Text>
      </View>
      <Text style={s.small}>{fmtTime(m.at)}</Text>
    </View>
  )
}

/** Egy beszélgetés: üzenetek, állapotfüggő műveletek és a válaszmező. */
function Thread({ chat, offset }: { chat: ChatData; offset: number }) {
  const scroll = useRef<ScrollViewInstance>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const { id, unread } = chat

  // Megnyitáskor és új látogatói üzenetnél olvasottnak jelöljük (csak ha van olvasatlan)
  useEffect(() => {
    if (unread <= 0) return
    chatAction(id, 'read').then(putChat).catch(() => {})
  }, [id, unread])

  async function act(action: 'decline' | 'close' | 'emailed', body?: unknown) {
    try { putChat(await chatAction(id, action, body)) }
    catch (e) { notice('Nem sikerült', errorText(e), 'danger') }
  }

  function confirmClose() {
    confirm('Lezárás', 'A beszélgetés lezárul, a látogató többé nem írhat.', 'Lezárás', true).then((ok) => { if (ok) act('close') })
  }

  async function remove() {
    if (!(await confirm('Törlés', 'A beszélgetés véglegesen törlődik.', 'Törlés', true))) return
    try { await deleteChat(id); dropChat(id); openChat(null) }
    catch (e) { notice('Nem sikerült', errorText(e), 'danger') }
  }

  async function send() {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try { putChat(await chatReply(id, t, `app-${Date.now()}`)); setText('') }
    catch (e) { notice('Nem sikerült elküldeni', errorText(e), 'danger') }
    finally { setSending(false) }
  }

  const st = STATUS[chat.status]
  const guestTexts = chat.messages.filter((m) => m.from === 'guest').map((m) => m.text).join('\n\n')
  const mailto = `mailto:${chat.email}?subject=${encodeURIComponent('Válasz a kérdésedre – Nails by Evelin')}` +
    `&body=${encodeURIComponent(`Szia ${chat.name}!\n\n\n\n---\nA kérdésed:\n${guestTexts}`)}`
  const canReply = chat.status === 'waiting' || chat.status === 'live' || (chat.status === 'missed' && chat.visitorOnline)

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.row, { flexWrap: 'nowrap', paddingTop: 8, paddingBottom: 8 }]}>
        <IconButton icon={ChevronLeft} label="Vissza" onPress={() => openChat(null)} />
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{chat.name}</Text>
          <Text style={s.small} numberOfLines={1}>{chat.email}</Text>
        </View>
        <Badge label={st.label} color={st.color} soft={st.soft} />
        <IconButton icon={Trash2} label="Törlés" onPress={remove} color={c.danger} />
      </View>

      {chat.status === 'waiting' && (
        <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: c.rose }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.small}>Válaszidő</Text>
            {chat.deadline && <Countdown deadline={chat.deadline} offset={offset} size={22} />}
          </View>
          <Button label="Most nem" ghost danger onPress={() => act('decline')} />
        </View>
      )}
      {chat.status === 'live' && (
        <View style={[s.row, { justifyContent: 'flex-end' }]}>
          <Button label="Beszélgetés lezárása" ghost small onPress={confirmClose} />
        </View>
      )}
      {chat.status === 'closed' && (
        <Text style={[s.small, { textAlign: 'center' }]}>{`Lezárta: ${chat.closedBy ? CLOSED_BY[chat.closedBy] : '–'}`}</Text>
      )}

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {chat.messages.map((m) => <Bubble key={m.id} m={m} />)}
      </ScrollView>

      {chat.status === 'missed' && (
        <View style={[s.card, { gap: 10, marginBottom: 8 }]}>
          <Text style={s.text}>{`${chat.name} nem kapott élő választ. Írj neki e-mailben.`}</Text>
          {chat.visitorOnline && <Text style={[s.small, { color: c.ok }]}>Még az oldalon van, élőben is válaszolhatsz.</Text>}
          <View style={s.row}>
            <Button label="Válasz e-mailben" icon={Mail} onPress={() => Linking.openURL(mailto).catch(() => notice('Nem sikerült', 'Nincs e-mail alkalmazás a készüléken.', 'danger'))} />
            <Button label={chat.emailedAt ? 'Mégsem válaszoltam' : 'Megválaszoltam'} ghost onPress={() => act('emailed', { done: !chat.emailedAt })} />
          </View>
        </View>
      )}

      {canReply && (
        <View style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-end', paddingBottom: 8 }]}>
          <TextInput value={text} onChangeText={setText} multiline maxLength={1000} placeholder="Írj választ…" placeholderTextColor={c.faint}
            style={[s.input, { flex: 1, maxHeight: 120, paddingVertical: 10 }]} />
          <View style={{ opacity: sending || !text.trim() ? 0.5 : 1 }}>
            <IconButton icon={Send} label="Küldés" onPress={send} color={c.bg} tint={c.rose} />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

/** Chat fül: lista, beszélgetés és beállítások (a belépett eszközök kezelésével). */
export function Chat({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { list, error, openId } = useChats()
  const [inSettings, setInSettings] = useState(false)
  const { gutter } = useLayout()
  const serverNow = list?.serverNow
  // A szerver órájához igazítjuk a visszaszámlálót (a telefon órája eltérhet)
  const offset = useMemo(() => (serverNow ? Date.parse(serverNow) - Date.now() : 0), [serverNow])
  const box = { flex: 1, width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const, paddingHorizontal: gutter }

  if (openId) {
    const chat = list?.chats.find((ch) => ch.id === openId)
    return (
      <View style={box}>
        {chat ? <Thread key={openId} chat={chat} offset={offset} /> : (
          <View style={[s.row, { flexWrap: 'nowrap', paddingTop: 8 }]}>
            <IconButton icon={ChevronLeft} label="Vissza" onPress={() => openChat(null)} />
            {list ? <Text style={s.muted}>Ez a beszélgetés nem található.</Text> : <ActivityIndicator color={c.rose} />}
          </View>
        )}
      </View>
    )
  }

  if (inSettings) {
    return (
      <View style={box}>
        <View style={[s.row, { flexWrap: 'nowrap', paddingTop: 8, paddingBottom: 8 }]}>
          <IconButton icon={ChevronLeft} label="Vissza" onPress={() => setInSettings(false)} />
          <Text style={s.h2}>Beállítások</Text>
        </View>
        {list && <Availability settings={list.settings} />}
        <View style={{ flex: 1, paddingTop: 12 }}>
          <Devices onUnauthorized={onUnauthorized} />
        </View>
      </View>
    )
  }

  const sections = GROUPS
    .map((g, i) => ({ title: g.title, items: (list?.chats ?? []).filter((ch) => groupOf(ch) === i) }))
    .filter((sec) => sec.items.length > 0)

  return (
    <View style={box}>
      <ScrollView contentContainerStyle={{ gap: 12, paddingTop: 10, paddingBottom: 24 }}>
        {list && (
          <View style={[s.row, { flexWrap: 'nowrap' }]}>
            <View style={{ flex: 1 }}><Availability settings={list.settings} /></View>
            <IconButton icon={Settings} label="Beállítások" onPress={() => setInSettings(true)} />
          </View>
        )}
        {error && <Text style={[s.small, { color: c.danger }]}>{error}</Text>}
        {!list && !error && <ActivityIndicator color={c.rose} style={{ marginTop: 40 }} />}
        {list && list.chats.length === 0 && <Text style={s.empty}>Még nem érkezett kérdés a weboldalról.</Text>}
        {sections.map((sec) => (
          <View key={sec.title} style={{ gap: 8 }}>
            <Text style={[s.eyebrow, { marginTop: 4 }]}>{sec.title}</Text>
            {sec.items.map((ch) => <ChatRow key={ch.id} chat={ch} offset={offset} onPress={() => openChat(ch.id)} />)}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
