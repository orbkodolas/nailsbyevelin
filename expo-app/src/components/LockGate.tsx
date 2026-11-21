import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Platform, Text, View } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { Fingerprint } from 'lucide-react-native'
import { c, f, s } from '../theme'
import { Button } from '../ui'

/** Ennyi háttérben töltött idő után újra azonosítani kell (OWASP MASVS-AUTH: helyi újrahitelesítés). */
const RELOCK_MS = 60_000

/**
 * Alkalmazászár: indításkor és 1 perc háttér után ujjlenyomat / arc / a telefon PIN-kódja kell.
 * Ha a telefonon nincs semmilyen képernyőzár, nem zárunk (nincs mivel), csak figyelmeztetünk.
 */
export function LockGate({ children, startOpen = false }: { children: ReactNode; startOpen?: boolean }) {
  const [state, setState] = useState<'checking' | 'locked' | 'open' | 'insecure'>(Platform.OS === 'web' || startOpen ? 'open' : 'checking')
  const [error, setError] = useState<string | null>(null)
  const backgroundAt = useRef<number | null>(null)
  const prompting = useRef(false)

  const unlock = useCallback(async () => {
    if (prompting.current) return
    prompting.current = true
    setError(null)
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync()
      if (level === LocalAuthentication.SecurityLevel.NONE) { setState('insecure'); return }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Nails By Evelin Admin feloldása', cancelLabel: 'Mégse', disableDeviceFallback: false,
      })
      if (result.success) setState('open')
      else { setState('locked'); if (result.error !== 'user_cancel' && result.error !== 'system_cancel') setError('Nem sikerült az azonosítás. Próbáld újra.') }
    } catch {
      setState('locked'); setError('Nem sikerült az azonosítás. Próbáld újra.')
    } finally {
      prompting.current = false
    }
  }, [])

  useEffect(() => {
    if (Platform.OS === 'web') return
    if (!startOpen) unlock()
    const sub = AppState.addEventListener('change', (next) => {
      // A rendszer feloldó ablaka maga is háttérbe teszi az appot: azt nem számoljuk
      if (prompting.current) return
      if (next === 'background') backgroundAt.current = Date.now()
      else if (next === 'active' && backgroundAt.current !== null) {
        const away = Date.now() - backgroundAt.current
        backgroundAt.current = null
        if (away > RELOCK_MS) setState((current) => {
          if (current === 'open') { setTimeout(unlock, 0); return 'locked' }
          return current
        })
      }
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlock])

  if (state === 'open') return <>{children}</>
  if (state === 'insecure') return (
    <>
      {children}
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: 90, padding: 12, borderRadius: 12, backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.danger }}>
        <Text style={{ color: c.danger, fontFamily: f.medium, fontSize: 13 }}>
          A telefonon nincs képernyőzár, így az app sem zárható. Állíts be PIN-kódot vagy ujjlenyomatot a vendégadatok védelméhez.
        </Text>
        <Button label="Rendben" small ghost onPress={() => setState('open')} />
      </View>
    </>
  )
  // Zárolt / ellenőrzés alatt: a tartalom nem renderelődik
  return (
    <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }]}>
      <Fingerprint size={56} color={c.rose} strokeWidth={1.4} />
      <Text style={{ color: c.rose, fontSize: 34, fontFamily: f.serif, textAlign: 'center' }}>Nails <Text style={{ fontFamily: f.serifItalic }}>by</Text> Evelin</Text>
      <Text style={[s.muted, { textAlign: 'center' }]}>Az app zárolva van. Oldd fel ujjlenyomattal vagy a telefon kódjával.</Text>
      {error && <Text style={{ color: c.danger, textAlign: 'center' }}>{error}</Text>}
      {state === 'locked' && <Button label="Feloldás" icon={Fingerprint} onPress={unlock} />}
    </View>
  )
}
