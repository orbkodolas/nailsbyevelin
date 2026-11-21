import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native'
import { ApiError, BUILT_IN_KEY, createPairingCode, errorText, pairDevice } from '../api'
import { c, f, s } from '../theme'
import { Button } from '../ui'

/**
 * Az APK beépített kulccsal lép be; ez a képernyő csak akkor jön elő, ha az a kulcs le van tiltva (vagy nincs,
 * pl. webes előnézetben). Ilyenkor párosító kód írható be, amit egy belépett eszköz Eszközök fülén lehet kérni. Vészhelyzetre a mesterkulcs is beírható: abból is csak
 * eszközkulcs lesz, maga a mesterkulcs nem marad a telefonon.
 */
export function Login({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    const input = value.trim()
    if (!input) return
    setBusy(true); setError(null)
    try {
      const isMasterKey = input.replace(/[^A-Za-z0-9]/g, '').length > 12
      await pairDevice(isMasterKey ? (await createPairingCode(input)).code : input)
      onDone()
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'Hibás kulcs.' : errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
      <View style={{ gap: 16, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
        <Text style={{ color: c.rose, fontSize: 44, fontFamily: f.serif, lineHeight: 50 }}>Nails <Text style={{ fontFamily: f.serifItalic }}>by</Text> Evelin</Text>
        <Text style={s.muted}>{BUILT_IN_KEY ? 'Ennek az appnak a belépési kulcsa le van tiltva. Kérj új verziót a fejlesztőtől, vagy írj be párosító kódot.' : 'Írd be a párosító kódot. Egy már belépett eszközön az Eszközök fülön kérheted.'}</Text>
        <TextInput style={[s.input, { fontFamily: f.semibold, letterSpacing: 2, fontSize: 18 }]} value={value} onChangeText={setValue} placeholder="XXXX-XXXX" placeholderTextColor={c.muted}
          autoCapitalize="characters" autoCorrect={false} onSubmitEditing={submit} />
        {error && <Text style={{ color: c.danger }}>{error}</Text>}
        <Button label="Párosítás" onPress={submit} busy={busy} />
      </View>
    </KeyboardAvoidingView>
  )
}
