import { useState } from 'react'
import { Alert, FlatList, RefreshControl, Text, TextInput, View } from 'react-native'
import { errorText, getVouchers, Voucher, voucherAction } from '../api'
import { c, fmtDate, huf, s } from '../theme'
import { Badge, Button, confirm } from '../ui'
import { useLoad } from '../useLoad'

function status(v: Voucher): [string, string] {
  if (v.status === 'active' && v.expiresAt && v.expiresAt < new Date().toISOString()) return ['Lejárt', c.muted]
  return ({ active: ['Érvényes', c.ok], pending_payment: ['Fizetésre vár', c.gold], redeemed: ['Beváltva', c.muted] } as Record<string, [string, string]>)[v.status] ?? [v.status, c.muted]
}

export function Vouchers({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { data, error, refreshing, reload } = useLoad(getVouchers, onUnauthorized)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const q = query.trim().toUpperCase()
  const vouchers = (data?.vouchers ?? []).filter((v) => !q || v.code.includes(q) || v.buyerName.toUpperCase().includes(q) || v.recipientName.toUpperCase().includes(q))

  async function run(v: Voucher, action: 'payment-confirmed' | 'redeem') {
    const ok = action === 'redeem'
      ? await confirm('Utalvány beváltása', `${v.code} – ${huf(v.amountHuf)}. Beváltás után nem használható újra.`, 'Beváltás')
      : await confirm('Fizetés megerősítése', `${v.buyerName} befizette a(z) ${huf(v.amountHuf)} összeget?`)
    if (!ok) return
    setBusyId(v.id)
    try { await voucherAction(v.id, action); await reload() }
    catch (e) { Alert.alert('Nem sikerült', errorText(e)) }
    finally { setBusyId(null) }
  }

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.list}
      data={vouchers}
      keyExtractor={(v) => v.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.rose} colors={[c.rose]} />}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <TextInput style={s.input} value={query} onChangeText={setQuery} placeholder="Keresés kódra vagy névre" placeholderTextColor={c.muted} autoCapitalize="characters" autoCorrect={false} />
          {error && <Text style={{ color: c.danger }}>{error}</Text>}
        </View>
      }
      ListEmptyComponent={data ? <Text style={s.empty}>{q ? 'Nincs találat.' : 'Még nincs utalvány.'}</Text> : undefined}
      renderItem={({ item: v }) => {
        const [label, color] = status(v)
        const expired = label === 'Lejárt'
        return (
          <View style={s.card}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={[s.title, { letterSpacing: 1 }]}>{v.code}</Text>
              <Badge label={label} color={color} />
            </View>
            <Text style={s.text}>{huf(v.amountHuf)}{v.recipientName ? ` · ${v.recipientName} részére` : ''}</Text>
            <Text style={s.muted}>Vásárló: {v.buyerName} · {v.buyerEmail}</Text>
            <Text style={s.muted}>Vásárolva: {fmtDate(v.createdAt)}{v.expiresAt ? ` · érvényes: ${fmtDate(v.expiresAt)}-ig` : ''}</Text>
            <View style={[s.row, { marginTop: 4 }]}>
              {v.status === 'pending_payment' && <Button label="Fizetés megjött" busy={busyId === v.id} onPress={() => run(v, 'payment-confirmed')} />}
              {v.status === 'active' && !expired && <Button label="Beváltás" busy={busyId === v.id} onPress={() => run(v, 'redeem')} />}
            </View>
          </View>
        )
      }}
    />
  )
}
