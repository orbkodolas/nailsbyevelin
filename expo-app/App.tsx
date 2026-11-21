import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, AppState, Platform, Pressable, Text, View } from 'react-native'
import * as Notifications from 'expo-notifications'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
// Csak a használt betűváltozatok (a csomag gyökeréből importálva mind bekerülne)
import { Jost_400Regular } from '@expo-google-fonts/jost/400Regular'
import { Jost_500Medium } from '@expo-google-fonts/jost/500Medium'
import { Jost_600SemiBold } from '@expo-google-fonts/jost/600SemiBold'
import { CormorantGaramond_500Medium } from '@expo-google-fonts/cormorant-garamond/500Medium'
import { CormorantGaramond_500Medium_Italic } from '@expo-google-fonts/cormorant-garamond/500Medium_Italic'
import { CalendarDays, ChartSpline, Gift, LogOut, MessageCircle } from 'lucide-react-native'
import { clearToken, loadToken, revokeDevice, upgradeToDeviceToken, usingBuiltInKey, wakeServer } from './src/api'
import { Chat } from './src/screens/Chat'
import { clearCache } from './src/useLoad'
import { Dashboard } from './src/screens/Dashboard'
import { Login } from './src/screens/Login'
import { Vouchers } from './src/screens/Vouchers'
import { Revenue } from './src/screens/Revenue'
import { c, dayKey, f, fmtDayLong, s } from './src/theme'
import { DialogLayer, IconButton, confirm, useLayout } from './src/ui'
import { ToastLayer } from './src/toast'
import { TabBar } from './src/components/TabBar'
import { clearChats, openChat, startChatSync, useUnreadCount } from './src/chatStore'
import { chatIdOf, handleChatAction, registerForChatPush } from './src/push'

const tabs = [
  { key: 'calendar', label: 'Naptár', icon: CalendarDays, Screen: Dashboard },
  { key: 'revenue', label: 'Bevétel', icon: ChartSpline, Screen: Revenue },
  { key: 'chat', label: 'Chat', icon: MessageCircle, Screen: Chat },
  { key: 'vouchers', label: 'Utalványok', icon: Gift, Screen: Vouchers },
] as const

const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
/** Budapesti idő szerint; a név a két rész közé kerül. [előtte, utána] */
function greeting(now: Date): [string, string] {
  const [h, m] = timeFmt.format(now).split(':').map(Number)
  const t = (h % 24) * 60 + m
  if (t < 4 * 60) return ['Szia ', ', hajnali ellenőrzés?']
  if (t < 8 * 60 + 30) return ['Jó reggelt, ', '']
  if (t < 19 * 60) return ['Szia ', '']
  return ['Jó estét, ', '']
}

export default function App() {
  const [fontsLoaded] = useFonts({ Jost_400Regular, Jost_500Medium, Jost_600SemiBold, CormorantGaramond_500Medium, CormorantGaramond_500Medium_Italic })
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading')
  const [tab, setTab] = useState<(typeof tabs)[number]['key']>('calendar')
  // A már megnyitott fülek életben maradnak (elrejtve): váltáskor nincs újratöltés és újraszámolás
  const [visited, setVisited] = useState<string[]>(['calendar'])
  useEffect(() => { setVisited((v) => (v.includes(tab) ? v : [...v, tab])) }, [tab])
  const [now, setNow] = useState(() => new Date())

  // Megnyitáskor / előtérbe hozáskor felkeltjük a szervert
  useEffect(() => {
    wakeServer()
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') { wakeServer(); setNow(new Date()) } })
    // A köszönés és a dátum percenként frissül (pl. éjfélkor új nap)
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => { sub.remove(); clearInterval(timer) }
  }, [])

  useEffect(() => {
    loadToken().then((t) => {
      setAuth(t ? 'in' : 'out')
      // Régi verzióból maradt mesterkulcs → csendben saját eszközkulcsra cseréljük
      if (t) upgradeToDeviceToken().catch(() => {})
    })
  }, [])
  const logout = useCallback(() => { clearCache(); clearChats(); setVisited(['calendar']); clearToken().finally(() => setAuth('out')) }, [])

  // Belépve: élő csevegés szinkron és push-értesítések
  useEffect(() => {
    if (auth !== 'in') return
    const stop = startChatSync(logout)
    registerForChatPush().catch(() => {})
    return stop
  }, [auth, logout])

  // Értesítésre koppintás / gombos válasz (bezárt appnál is az utolsó válasz)
  useEffect(() => {
    if (Platform.OS === 'web') return
    const handle = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier === 'reply' || response.actionIdentifier === 'decline') { handleChatAction(response); return }
      const id = chatIdOf(response)
      if (id) { setTab('chat'); openChat(id) }
    }
    const sub = Notifications.addNotificationResponseReceivedListener(handle)
    Notifications.getLastNotificationResponseAsync().then((r) => { if (r) handle(r) }).catch(() => {})
    return () => sub.remove()
  }, [])

  const unread = useUnreadCount()
  const badges: Record<string, number> = { chat: unread }

  const current = tabs.find((t) => t.key === tab)!
  const { desktop, gutter } = useLayout()
  // Kilépéskor az eszköz kulcsát a szerveren is letiltjuk (így egy ellopott kulcs sem használható tovább)
  const askLogout = async () => {
    if (!(await confirm('Kilépés', 'Ez az eszköz kilép, a kulcsa letiltásra kerül. Újra belépni párosító kóddal lehet.', 'Kilépés'))) return
    await revokeDevice('current').catch(() => {})
    logout()
  }
  const header = (
    <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap', paddingHorizontal: gutter, paddingTop: desktop ? 28 : 10, paddingBottom: 6, width: '100%', maxWidth: 1240, alignSelf: 'center' }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.eyebrow}>{tab === 'calendar' ? fmtDayLong(dayKey(now)) : 'Nails by Evelin'}</Text>
        <Text style={[s.h1, desktop && { fontSize: 40, lineHeight: 46 }]}>{tab === 'calendar' ? <>{greeting(now)[0]}<Text style={{ fontFamily: f.serifItalic, color: c.rose }}>Evelin</Text>{greeting(now)[1]}</> : current.label}</Text>
      </View>
      {!desktop && !usingBuiltInKey() && <IconButton icon={LogOut} label="Kilépés" color={c.muted} onPress={askLogout} />}
    </View>
  )
  const screen = (
    <View style={{ flex: 1 }}>
      {tabs.filter((t) => visited.includes(t.key) || t.key === tab).map((t) => (
        <View key={t.key} style={{ flex: 1, display: t.key === tab ? 'flex' : 'none' }}>
          <t.Screen onUnauthorized={logout} />
        </View>
      ))}
    </View>
  )
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        {(auth === 'loading' || !fontsLoaded) && <ActivityIndicator color={c.rose} style={{ flex: 1 }} />}
        {fontsLoaded && auth === 'out' && <Login onDone={() => setAuth('in')} />}
        {fontsLoaded && auth === 'in' && (desktop ? (
          // Asztali nézet: oldalsáv a navigációval, mellette a tartalom
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ width: 240, borderRightWidth: 1, borderRightColor: c.line, backgroundColor: c.card, paddingHorizontal: 16, paddingVertical: 28, gap: 6 }}>
              <Text style={{ color: c.rose, fontSize: 28, fontFamily: f.serif, lineHeight: 32, paddingHorizontal: 12, marginBottom: 22 }}>
                Nails <Text style={{ fontFamily: f.serifItalic }}>by</Text> Evelin
              </Text>
              {tabs.map((t) => {
                const on = t.key === tab
                return (
                  <Pressable key={t.key} onPress={() => setTab(t.key)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12 },
                      { backgroundColor: on ? c.roseSoft : hovered || pressed ? c.raised : 'transparent' }]}>
                    <t.icon size={19} color={on ? c.rose : c.muted} strokeWidth={on ? 2 : 1.6} />
                    <Text style={{ color: on ? c.rose : c.text, fontSize: 15, fontFamily: on ? f.semibold : f.sans }}>{t.label}</Text>
                    {(badges[t.key] ?? 0) > 0 && (
                      <Text style={{ marginLeft: 'auto', backgroundColor: c.rose, color: c.bg, borderRadius: 99, minWidth: 22, overflow: 'hidden', textAlign: 'center', paddingHorizontal: 6, fontSize: 12, fontFamily: f.semibold }}>{badges[t.key]}</Text>
                    )}
                  </Pressable>
                )
              })}
              <View style={{ flex: 1 }} />
              {!usingBuiltInKey() && <Pressable onPress={askLogout} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12 }, pressed && { backgroundColor: c.raised }]}>
                <LogOut size={18} color={c.muted} strokeWidth={1.6} />
                <Text style={{ color: c.muted, fontSize: 15, fontFamily: f.sans }}>Kilépés</Text>
              </Pressable>}
            </View>
            <View style={{ flex: 1 }}>
              {header}
              {screen}
            </View>
          </View>
        ) : (
          <>
            {header}
            {screen}
            <TabBar tabs={tabs} active={tab} onSelect={(k) => setTab(k as typeof tab)} badges={badges} />
          </>
        ))}
      </SafeAreaView>
      <DialogLayer handleBack />
      <ToastLayer />
    </SafeAreaProvider>
  )
}
