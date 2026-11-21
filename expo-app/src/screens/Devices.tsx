import { useState } from 'react'
import { FlatList, RefreshControl, Text, View } from 'react-native'
import { KeyRound, Laptop, ShieldOff, Smartphone } from 'lucide-react-native'
import { createPairingCode, Device, errorText, getDevices, revokeDevice } from '../api'
import { c, f, fmtDateShort, fmtTime, s } from '../theme'
import { Badge, Button, confirm, notice, showDialog, useLayout } from '../ui'
import { useLoad } from '../useLoad'

const seen = (iso?: string) => (iso ? `${fmtDateShort(iso)} ${fmtTime(iso)}` : '–')

/** Belépett admin eszközök: új eszköz párosítása rövid kóddal, régi/elveszett eszköz letiltása. */
export function Devices({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { data, error, refreshing, reload, mutate } = useLoad(getDevices, onUnauthorized, 60_000)
  const [busy, setBusy] = useState<string | null>(null)
  const { gutter } = useLayout()

  async function pairNew() {
    setBusy('pair')
    try {
      const { code, expiresAt } = await createPairingCode()
      showDialog({
        title: 'Párosító kód',
        message: `${code}\n\nAz új eszközön nyisd meg az admin appot, és írd be ezt a kódot. ${fmtTime(expiresAt)}-ig érvényes, egyszer használható.\n\nCsak magadnak add meg – aki ismeri, beléphet.`,
        tone: 'ok',
      })
      setTimeout(() => reload(true), 60_000)
    } catch (e) { notice('Nem sikerült', errorText(e), 'danger') }
    finally { setBusy(null) }
  }

  async function revoke(d: Device) {
    const ok = await confirm('Eszköz letiltása', d.current
      ? 'Ez a saját eszközöd: letiltás után innen kilépsz. Ha ez az app beépített kulcsa, új APK kell a fejlesztőtől.'
      : `${d.name} azonnal elveszíti a hozzáférést. Elveszett vagy eladott telefonnál ezt használd.`, 'Letiltás', true)
    if (!ok) return
    setBusy(d.id)
    try {
      await revokeDevice(d.id)
      if (d.current) { onUnauthorized(); return }
      mutate((x) => ({ devices: x.devices.filter((item) => item.id !== d.id) }))
    } catch (e) { notice('Nem sikerült', errorText(e), 'danger') }
    finally { setBusy(null) }
  }

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={{ padding: gutter, paddingBottom: 32, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' }}
      data={data?.devices ?? []}
      keyExtractor={(d) => d.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.rose} colors={[c.rose]} progressBackgroundColor={c.card} />}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <Text style={s.muted}>
            Minden eszköz saját kulccsal lép be, amit a telefon titkosítva őriz, és ujjlenyomattal vagy a telefon kódjával nyit.
            Új eszközhöz kérj párosító kódot; elveszett telefont itt tilthatsz le.
          </Text>
          <Button label="Új eszköz párosítása" icon={KeyRound} busy={busy === 'pair'} onPress={pairNew} />
          {error && <Text style={{ color: c.danger }}>{error}</Text>}
        </View>
      }
      ListEmptyComponent={data ? <Text style={s.empty}>Nincs párosított eszköz.</Text> : undefined}
      renderItem={({ item: d }) => {
        const Icon = /böngésző|windows|mac|linux/i.test(d.name) ? Laptop : Smartphone
        return (
          <View style={s.card}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <View style={[s.row, { gap: 10, flexShrink: 1 }]}>
                <Icon size={18} color={c.rose} strokeWidth={1.8} />
                <Text style={[s.title, { flexShrink: 1 }]} numberOfLines={1}>{d.name}</Text>
              </View>
              {d.current && <Badge label="Ez az eszköz" color={c.ok} soft={c.okSoft} />}
            </View>
            <Text style={s.muted}>Párosítva: {seen(d.createdAt)}{d.pairedBy ? ` · ${d.pairedBy === 'mesterkulcs' ? 'mesterkulccsal' : `innen: ${d.pairedBy}`}` : ''}</Text>
            <Text style={[s.muted, { fontFamily: f.sans }]}>Utoljára aktív: {seen(d.lastSeenAt)}</Text>
            <View style={[s.row, { marginTop: 4 }]}>
              <Button small ghost danger icon={ShieldOff} label="Letiltás" busy={busy === d.id} onPress={() => revoke(d)} />
            </View>
          </View>
        )
      }}
    />
  )
}
