import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { clearToken, loadToken } from './src/api'
import { Blocks } from './src/screens/Blocks'
import { Bookings } from './src/screens/Bookings'
import { Login } from './src/screens/Login'
import { Vouchers } from './src/screens/Vouchers'
import { c, s } from './src/theme'
import { confirm } from './src/ui'

const tabs = [
  { key: 'bookings', label: 'Foglalások', Screen: Bookings },
  { key: 'blocks', label: 'Szabadnapok', Screen: Blocks },
  { key: 'vouchers', label: 'Utalványok', Screen: Vouchers },
] as const

export default function App() {
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading')
  const [tab, setTab] = useState<(typeof tabs)[number]['key']>('bookings')

  useEffect(() => { loadToken().then((t) => setAuth(t ? 'in' : 'out')) }, [])
  const logout = useCallback(() => { clearToken().finally(() => setAuth('out')) }, [])

  const current = tabs.find((t) => t.key === tab)!
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        {auth === 'loading' && <ActivityIndicator color={c.rose} style={{ flex: 1 }} />}
        {auth === 'out' && <Login onDone={() => setAuth('in')} />}
        {auth === 'in' && (
          <>
            <View style={[s.row, { justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }]}>
              <Text style={s.h1}>{current.label}</Text>
              <Text style={s.muted} onPress={async () => { if (await confirm('Kilépés', 'Újra meg kell majd adni a belépési kulcsot.', 'Kilépés')) logout() }}>Kilépés</Text>
            </View>
            <View style={{ flex: 1 }}>
              <current.Screen key={current.key} onUnauthorized={logout} />
            </View>
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.card }}>
              {tabs.map((t) => (
                <Pressable key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1, paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ color: t.key === tab ? c.rose : c.muted, fontSize: 14, fontWeight: t.key === tab ? '600' : '400' }}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
