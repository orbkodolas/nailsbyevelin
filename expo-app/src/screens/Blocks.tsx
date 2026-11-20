import { useState } from 'react'
import { Alert, FlatList, RefreshControl, Text, TextInput, View } from 'react-native'
import { addBlockDay, deleteBlock, errorText, getBookings } from '../api'
import { c, dayKey, fmtDate, fmtDay, fmtTime, s } from '../theme'
import { Button, confirm } from '../ui'
import { useLoad } from '../useLoad'

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

export function Blocks({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { data, error, refreshing, reload } = useLoad(getBookings, onUnauthorized)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const today = dayKey(new Date().toISOString())
  const blocks = (data?.blocks ?? []).filter((b) => dayKey(b.endsAt) >= today)

  async function add() {
    if (!isDate(date)) return Alert.alert('Dátum', 'Formátum: ÉÉÉÉ-HH-NN, például 2026-12-24.')
    const clash = (data?.bookings ?? []).filter((b) => dayKey(b.startsAt) === date && (b.status === 'booked' || b.status === 'pending_payment'))
    if (clash.length && !(await confirm('Erre a napra van foglalás', `${clash.length} aktív foglalás marad meg, azokat külön kell lemondani. Mehet a tiltás?`))) return
    setBusy(true)
    try { await addBlockDay(date, reason.trim()); setDate(''); setReason(''); await reload() }
    catch (e) { Alert.alert('Nem sikerült', errorText(e)) }
    finally { setBusy(false) }
  }

  async function remove(id: string, label: string) {
    if (!(await confirm('Tiltás törlése', `${label} újra foglalható lesz.`, 'Törlés', true))) return
    try { await deleteBlock(id); await reload() }
    catch (e) { Alert.alert('Nem sikerült', errorText(e)) }
  }

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.list}
      data={blocks}
      keyExtractor={(b) => b.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.rose} colors={[c.rose]} />}
      ListHeaderComponent={
        <View style={[s.card, { marginBottom: 8 }]}>
          <Text style={s.title}>Szabadnap felvétele</Text>
          <Text style={s.muted}>Erre a napra nem lehet majd foglalni.</Text>
          <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="ÉÉÉÉ-HH-NN" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" maxLength={10} />
          <TextInput style={s.input} value={reason} onChangeText={setReason} placeholder="Megjegyzés (nem kötelező)" placeholderTextColor={c.muted} maxLength={200} />
          <Button label="Nap letiltása" onPress={add} busy={busy} />
          {error && <Text style={{ color: c.danger }}>{error}</Text>}
        </View>
      }
      ListEmptyComponent={data ? <Text style={s.empty}>Nincs letiltott nap.</Text> : undefined}
      renderItem={({ item: b }) => {
        const wholeDay = fmtTime(b.startsAt) === '00:00' && fmtTime(b.endsAt) === '00:00'
        const label = wholeDay ? fmtDay(b.startsAt) : `${fmtDate(b.startsAt)} ${fmtTime(b.startsAt)} – ${fmtDate(b.endsAt)} ${fmtTime(b.endsAt)}`
        return (
          <View style={[s.card, s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.text}>{label}</Text>
              {!!b.reason && <Text style={s.muted}>{b.reason}</Text>}
            </View>
            <Button label="Törlés" ghost danger onPress={() => remove(b.id, label)} />
          </View>
        )
      }}
    />
  )
}
