// Push-értesítések az élő csevegéshez (Firebase Cloud Messaging, közvetlenül a szerverről).
// Az értesítésben Evelin válaszolhat (szöveges válasz) vagy elutasíthat („Most nem”) – bezárt appnál is:
// ilyenkor az Android a háttérfeladatot (TaskManager) futtatja, ami elküldi a választ a szervernek.
// Ezt a modult az index.ts tölti be legelőször, mert a háttérfeladatot a modul szintjén kell definiálni.
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import { chatAction, chatReply, loadToken, registerPushToken } from './api'
import { currentOpenChat, refreshChats } from './chatStore'

const native = Platform.OS !== 'web'
export const TASK = 'nbe-chat-actions'

// Előtérben is megjelenik az értesítés, kivéve ha épp az a beszélgetés van nyitva
if (native) {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const open = currentOpenChat()
      const hide = open !== null && chatIdOf(n) === open
      return { shouldShowBanner: !hide, shouldShowList: !hide, shouldPlaySound: !hide, shouldSetBadge: false }
    },
  })
}

/** A beszélgetés azonosítója az értesítésből (előtér, háttérfeladat és helyi formátum egyaránt). */
export function chatIdOf(input: unknown): string | null {
  const n = (input as { notification?: unknown })?.notification ?? input
  const content = (n as { request?: { content?: Record<string, unknown> } })?.request?.content
  if (!content) return null
  const data = content.data as Record<string, unknown> | undefined
  if (typeof data?.chatId === 'string') return data.chatId
  for (const raw of [content.dataString, data?.body]) {
    if (typeof raw !== 'string') continue
    try { const parsed = JSON.parse(raw); if (typeof parsed?.chatId === 'string') return parsed.chatId } catch { /* nem JSON */ }
  }
  return null
}

type Response = { actionIdentifier: string; userText?: string; notification: { request: { identifier: string } } }
const handled = new Set<string>()

/**
 * Gombnyomás az értesítésen: „Válasz” (szöveggel) vagy „Most nem”.
 * Háttérben és előtérben is lefuthat ugyanarra a gombnyomásra, ezért a kulcs alapján csak egyszer küldjük el.
 */
export async function handleChatAction(response: Response) {
  const chatId = chatIdOf(response)
  const action = response.actionIdentifier
  if (!chatId || (action !== 'reply' && action !== 'decline')) return
  const text = (response.userText ?? '').trim()
  const key = `${response.notification.request.identifier}|${action}|${text}`
  if (handled.has(key)) return
  handled.add(key)
  await loadToken()
  try {
    if (action === 'reply' && text) await chatReply(chatId, text, `n-${hash(key)}`)
    else if (action === 'decline') await chatAction(chatId, 'decline')
    await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {})
  } catch {
    handled.delete(key)
    // Nem sikerült (pl. nincs net): jelezzük, és koppintásra megnyílik a beszélgetés
    await Notifications.scheduleNotificationAsync({
      identifier: response.notification.request.identifier,
      content: { title: 'Nem sikerült elküldeni', body: 'Koppints ide, és válaszolj az appból.', data: { chatId } },
      trigger: { channelId: 'chat_quiet' } as Notifications.NotificationTriggerInput,
    }).catch(() => {})
  }
  refreshChats()
}
const hash = (value: string) => { let h = 5381; for (let i = 0; i < value.length; i++) h = ((h * 33) ^ value.charCodeAt(i)) >>> 0; return h.toString(36) }

if (native) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK, async ({ data }) => {
    const payload = data as unknown as Response
    if (payload && typeof payload === 'object' && 'actionIdentifier' in payload) await handleChatAction(payload)
  })
}

/** Csatornák, értesítés-gombok és a háttérfeladat (egyszer, indításkor). */
export async function setupChatNotifications() {
  if (!native) return
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('chat', {
      name: 'Élő csevegés', description: 'Kérdések és üzenetek a weboldalról', importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 200, 120, 200], lightColor: '#d7a2aa', lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    })
    await Notifications.setNotificationChannelAsync('chat_quiet', {
      name: 'Csevegés (csendes)', description: 'Nem fogadott és e-mailben megválaszolandó kérdések', importance: Notifications.AndroidImportance.DEFAULT,
      sound: null, vibrationPattern: null, enableVibrate: false,
    })
  }
  const reply: Notifications.NotificationAction = {
    identifier: 'reply', buttonTitle: 'Válasz',
    textInput: { submitButtonTitle: 'Küldés', placeholder: 'Írd be a válaszod…' },
    options: { opensAppToForeground: false },
  }
  await Notifications.setNotificationCategoryAsync('chat_request', [
    reply,
    { identifier: 'decline', buttonTitle: 'Most nem', options: { opensAppToForeground: false, isDestructive: true } },
  ])
  await Notifications.setNotificationCategoryAsync('chat_reply', [reply])
  if (!(await TaskManager.isTaskRegisteredAsync(TASK))) await Notifications.registerTaskAsync(TASK)
}

let tokenSub: { remove: () => void } | null = null
/** Engedélykérés és a készülék FCM-tokenjének elküldése a szervernek (változáskor újra). */
export async function registerForChatPush() {
  if (Platform.OS !== 'android') return false
  await setupChatNotifications()
  const perm = await Notifications.getPermissionsAsync()
  const granted = perm.granted || (perm.canAskAgain && (await Notifications.requestPermissionsAsync()).granted)
  if (!granted) return false
  const { data } = await Notifications.getDevicePushTokenAsync()
  await registerPushToken(String(data))
  tokenSub ??= Notifications.addPushTokenListener((t) => { registerPushToken(String(t.data)).catch(() => {}) })
  return true
}
