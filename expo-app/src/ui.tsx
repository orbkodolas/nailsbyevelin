import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { c, s } from './theme'

export function Button({ label, onPress, ghost, danger, busy }: { label: string; onPress: () => void; ghost?: boolean; danger?: boolean; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [ghost ? s.ghost : s.btn, danger && ghost && { borderColor: c.danger }, (pressed || busy) && { opacity: 0.6 }]}>
      {busy ? <ActivityIndicator color={ghost ? c.text : c.bg} /> : <Text style={[ghost ? s.ghostText : s.btnText, danger && ghost && { color: c.danger }]}>{label}</Text>}
    </Pressable>
  )
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ borderColor: color, borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color, fontSize: 12 }}>{label}</Text>
    </View>
  )
}

/** Megerősítés után futtat; true-val tér vissza, ha a felhasználó jóváhagyta. */
export const confirm = (title: string, message: string, ok = 'Igen', destructive = false) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: 'Mégse', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }))
