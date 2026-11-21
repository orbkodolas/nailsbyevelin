// Élő csevegések közös állapota (Chat fül + olvasatlan-jelző az alsó menüben).
// Amíg az app előtérben van, hosszú lekérdezéssel (long-poll) azonnal megérkeznek az új üzenetek.
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { ApiError, errorText, getChats, type Chat, type ChatList } from './api'

type State = { list: ChatList | null; error: string | null; openId: string | null }
let state: State = { list: null, error: null, openId: null }
const subs = new Set<() => void>()
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; subs.forEach((fn) => fn()) }

let generation = 0
let onAuthLost: (() => void) | null = null

async function loop(gen: number) {
  let failures = 0
  while (gen === generation) {
    try {
      const fresh = await getChats(state.list?.version)
      if (gen !== generation) return
      failures = 0
      set({ list: fresh, error: null })
    } catch (e) {
      if (gen !== generation) return
      if (e instanceof ApiError && e.status === 401) { stopChatSync(); onAuthLost?.(); return }
      failures++
      if (failures > 1) set({ error: errorText(e) })
      await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * failures)))
    }
  }
}

/** Indítás belépés után; háttérbe kerüléskor megáll, előtérben újraindul. */
export function startChatSync(onUnauthorized: () => void) {
  onAuthLost = onUnauthorized
  const run = () => { generation++; loop(generation) }
  run()
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') run()
    else generation++ // a futó kérés lefut, de az eredményét eldobjuk
  })
  return () => { sub.remove(); stopChatSync() }
}
export function stopChatSync() { generation++ }
/** Azonnali újratöltés (pl. értesítésből adott válasz után). */
export function refreshChats() { generation++; loop(generation) }
export function clearChats() { stopChatSync(); set({ list: null, error: null, openId: null }) }

/** Helyi frissítés a szerver válaszával (nem várunk a következő lekérdezésre). */
export function putChat(chat: Chat) {
  if (!state.list) return
  const chats = [chat, ...state.list.chats.filter((c) => c.id !== chat.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  set({ list: { ...state.list, chats } })
}
export function dropChat(id: string) {
  if (state.list) set({ list: { ...state.list, chats: state.list.chats.filter((c) => c.id !== id) } })
}
export function putSettings(settings: ChatList['settings']) {
  if (state.list) set({ list: { ...state.list, settings } })
}

/** Értesítésre koppintva ez a beszélgetés nyílik meg a Chat fülön. */
export function openChat(id: string | null) { set({ openId: id }) }
export const currentOpenChat = () => state.openId

export function useChats() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    subs.add(fn)
    return () => { subs.delete(fn) }
  }, [])
  return state
}

/** Olvasatlan üzenetek + válaszra váró kérdések száma (a menü jelzőjéhez). */
export function useUnreadCount() {
  const { list } = useChats()
  return (list?.chats ?? []).reduce((n, c) => n + (c.status === 'waiting' ? Math.max(1, c.unread) : c.unread), 0)
}
