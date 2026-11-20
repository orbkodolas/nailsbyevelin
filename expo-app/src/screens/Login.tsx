import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native'
import { api, ApiError, errorText, saveToken } from '../api'
import { c, f, s } from '../theme'
import { Button } from '../ui'

export function Login({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const key = value.trim()
    if (!key) return
    setBusy(true); setError(null)
    try {
      await api('/api/admin/reminders', { authToken: key })
      await saveToken(key)
      onDone()
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'Hibás belépési kulcs.' : errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
      <View style={{ gap: 16, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
        <Text style={{ color: c.rose, fontSize: 44, fontFamily: f.serif, lineHeight: 50 }}>Nails <Text style={{ fontFamily: f.serifItalic }}>by</Text> Evelin</Text>
        <Text style={s.muted}>Admin – add meg a belépési kulcsot. Egyszer kell, utána a telefon megjegyzi.</Text>
        <TextInput style={s.input} value={value} onChangeText={setValue} placeholder="Belépési kulcs" placeholderTextColor={c.muted}
          autoCapitalize="none" autoCorrect={false} secureTextEntry onSubmitEditing={submit} />
        {error && <Text style={{ color: c.danger }}>{error}</Text>}
        <Button label="Belépés" onPress={submit} busy={busy} />
      </View>
    </KeyboardAvoidingView>
  )
}
