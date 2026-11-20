import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
// Csak a használt betűváltozatok (a csomag gyökeréből importálva mind bekerülne)
import { Jost_400Regular } from '@expo-google-fonts/jost/400Regular'
import { Jost_500Medium } from '@expo-google-fonts/jost/500Medium'
import { Jost_600SemiBold } from '@expo-google-fonts/jost/600SemiBold'
import { CormorantGaramond_500Medium } from '@expo-google-fonts/cormorant-garamond/500Medium'
import { CormorantGaramond_500Medium_Italic } from '@expo-google-fonts/cormorant-garamond/500Medium_Italic'
import { CalendarDays, ChartSpline, Gift, LogOut } from 'lucide-react-native'
import { clearToken, loadToken } from './src/api'
import { clearCache } from './src/useLoad'
import { Dashboard } from './src/screens/Dashboard'
import { Login } from './src/screens/Login'
import { Vouchers } from './src/screens/Vouchers'
import { Revenue } from './src/screens/Revenue'
import { c, dayKey, f, fmtDayLong, s } from './src/theme'
import { DialogLayer, IconButton, confirm, useLayout } from './src/ui'

const tabs = [
  { key: 'calendar', label: 'Naptár', icon: CalendarDays, Screen: Dashboard },
  { key: 'revenue', label: 'Bevétel', icon: ChartSpline, Screen: Revenue },
  { key: 'vouchers', label: 'Utalványok', icon: Gift, Screen: Vouchers },
] as const

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Budapest', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  return h < 10 ? 'Jó reggelt' : h < 18 ? 'Szia' : 'Jó estét'
}

export default function App() {
  const [fontsLoaded] = useFonts({ Jost_400Regular, Jost_500Medium, Jost_600SemiBold, CormorantGaramond_500Medium, CormorantGaramond_500Medium_Italic })
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading')
  const [tab, setTab] = useState<(typeof tabs)[number]['key']>('calendar')
  // A már megnyitott fülek életben maradnak (elrejtve): váltáskor nincs újratöltés és újraszámolás
  const [visited, setVisited] = useState<string[]>(['calendar'])
  useEffect(() => { setVisited((v) => (v.includes(tab) ? v : [...v, tab])) }, [tab])

  useEffect(() => { loadToken().then((t) => setAuth(t ? 'in' : 'out')) }, [])
  const logout = useCallback(() => { clearCache(); setVisited(['calendar']); clearToken().finally(() => setAuth('out')) }, [])

  const current = tabs.find((t) => t.key === tab)!
  const { desktop, gutter } = useLayout()
  const askLogout = async () => { if (await confirm('Kilépés', 'Újra meg kell majd adni a belépési kulcsot.', 'Kilépés')) logout() }
  const header = (
    <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap', paddingHorizontal: gutter, paddingTop: desktop ? 28 : 10, paddingBottom: 6, width: '100%', maxWidth: 1240, alignSelf: 'center' }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.eyebrow}>{tab === 'calendar' ? fmtDayLong(dayKey(new Date())) : 'Nails by Evelin'}</Text>
        <Text style={[s.h1, desktop && { fontSize: 40, lineHeight: 46 }]}>{tab === 'calendar' ? <>{greeting()}, <Text style={{ fontFamily: f.serifItalic, color: c.rose }}>Evelin</Text></> : current.label}</Text>
      </View>
      {!desktop && <IconButton icon={LogOut} label="Kilépés" color={c.muted} onPress={askLogout} />}
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
                  </Pressable>
                )
              })}
              <View style={{ flex: 1 }} />
              <Pressable onPress={askLogout} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12 }, pressed && { backgroundColor: c.raised }]}>
                <LogOut size={18} color={c.muted} strokeWidth={1.6} />
                <Text style={{ color: c.muted, fontSize: 15, fontFamily: f.sans }}>Kilépés</Text>
              </Pressable>
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
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.card, paddingTop: 6, paddingBottom: 4 }}>
              {tabs.map((t) => {
                const on = t.key === tab
                return (
                  <Pressable key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1, maxWidth: 240, alignItems: 'center', gap: 3, paddingVertical: 6, marginHorizontal: 'auto' }}>
                    <View style={{ paddingHorizontal: 18, paddingVertical: 4, borderRadius: 14, backgroundColor: on ? c.roseSoft : 'transparent' }}>
                      <t.icon size={21} color={on ? c.rose : c.muted} strokeWidth={on ? 2 : 1.6} />
                    </View>
                    <Text style={{ color: on ? c.rose : c.muted, fontSize: 12, fontFamily: on ? f.semibold : f.sans }}>{t.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </>
        ))}
      </SafeAreaView>
      <DialogLayer handleBack />
    </SafeAreaProvider>
  )
}
