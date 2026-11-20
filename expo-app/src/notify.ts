// Helyi értesítések: 15 perccel minden aktív foglalás előtt. Expo Go-ban is működik (csak a távoli push nem).
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import type { Booking } from './api'
import { fmtTime } from './theme'

export const LEAD_MINUTES = 15
const CHANNEL = 'arrivals'
const PREF_KEY = 'nbe_notify_on'
const supported = Platform.OS !== 'web'

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  })
}

export async function getNotifyPref() {
  if (!supported) return false
  return (await SecureStore.getItemAsync(PREF_KEY)) !== 'off'
}
export async function setNotifyPref(on: boolean) {
  if (!supported) return
  await SecureStore.setItemAsync(PREF_KEY, on ? 'on' : 'off')
  if (!on) await Notifications.cancelAllScheduledNotificationsAsync()
}

/** Engedélyt kér (egyszer), és létrehozza az Android csatornát. */
export async function ensurePermission() {
  if (!supported) return false
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Érkező vendégek', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 150, 250], lightColor: '#d7a2aa',
    })
  }
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  return (await Notifications.requestPermissionsAsync()).granted
}

/** Minden aktív, jövőbeli foglaláshoz pontosan egy értesítés; a régieket előbb töröljük. */
export async function syncArrivalNotifications(bookings: Booking[]) {
  if (!supported || !(await getNotifyPref()) || !(await ensurePermission())) return 0
  await Notifications.cancelAllScheduledNotificationsAsync()
  const now = Date.now()
  let count = 0
  for (const b of bookings) {
    if (b.status !== 'booked' && b.status !== 'pending_payment') continue
    const at = Date.parse(b.startsAt) - LEAD_MINUTES * 60_000
    if (at <= now + 5_000) continue
    await Notifications.scheduleNotificationAsync({
      identifier: `arrival-${b.id}`,
      content: {
        title: `${LEAD_MINUTES} perc múlva érkezik: ${b.name}`,
        body: `${fmtTime(b.startsAt)} · Készülj elő a(z) ${b.serviceName} eszközeivel.`,
        data: { bookingId: b.id, startsAt: b.startsAt },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    })
    count++
  }
  return count
}
