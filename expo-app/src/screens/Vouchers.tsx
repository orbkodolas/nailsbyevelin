import { useState } from 'react'
import { FlatList, RefreshControl, Text, TextInput, View } from 'react-native'
import { Banknote, Gift, Search } from 'lucide-react-native'
import { getVouchers, Voucher, voucherAction } from '../api'
import { c, f, fmtDateShort as fmtDate, huf, s } from '../theme'
import { Badge, Button, confirm, useLayout } from '../ui'
import { saveInBackground } from '../toast'
import { useLoad } from '../useLoad'

function status(v: Voucher): [string, string] {
  if (v.status === 'active' && v.expiresAt && v.expiresAt < new Date().toISOString()) return ['Lejárt', c.muted]
  return ({ active: ['Érvényes', c.ok], pending_payment: ['Fizetésre vár', c.gold], redeemed: ['Beváltva', c.muted] } as Record<string, [string, string]>)[v.status] ?? [v.status, c.muted]
}

type Row = { kind: 'header'; key: string; title: string; count: number } | { kind: 'row'; key: string; items: (Voucher | null)[] }

/** Felül az aktiválásra (fizetésre) váró kódok, alattuk az aktiváltak; csoporton belül a legújabb vásárlás elöl. */
function buildRows(list: Voucher[], columns: number): Row[] {
  const newest = (a: Voucher, b: Voucher) => b.createdAt.localeCompare(a.createdAt)
  const groups = [
    { key: 'pending', title: 'Aktiválásra vár', items: list.filter((v) => v.status === 'pending_payment').sort(newest) },
    { key: 'active', title: 'Aktivált', items: list.filter((v) => v.status !== 'pending_payment').sort(newest) },
  ]
  const rows: Row[] = []
  for (const g of groups) {
    if (!g.items.length) continue
    rows.push({ kind: 'header', key: `h-${g.key}`, title: g.title, count: g.items.length })
    for (let i = 0; i < g.items.length; i += columns) {
      const items: (Voucher | null)[] = g.items.slice(i, i + columns)
      while (items.length < columns) items.push(null) // üres hely, hogy a kártyák egyforma szélesek maradjanak
      rows.push({ kind: 'row', key: `${g.key}-${i}`, items })
    }
  }
  return rows
}

export function Vouchers({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { data, error, refreshing, reload, mutate } = useLoad(getVouchers, onUnauthorized, 10 * 60_000)
  const [query, setQuery] = useState('')
  const { gutter, width } = useLayout()
  const columns = width >= 1100 ? 3 : width >= 700 ? 2 : 1

  const q = query.trim().toUpperCase()
  const vouchers = (data?.vouchers ?? []).filter((v) => !q || v.code.includes(q) || v.buyerName.toUpperCase().includes(q) || v.recipientName.toUpperCase().includes(q))

  async function run(v: Voucher, action: 'payment-confirmed' | 'redeem') {
    const ok = action === 'redeem'
      ? await confirm('Utalvány beváltása', `${v.code} – ${huf(v.amountHuf)}. Beváltás után nem használható újra.`, 'Beváltás')
      : await confirm('Fizetés megerősítése', `${v.buyerName} befizette a(z) ${huf(v.amountHuf)} összeget?`)
    if (!ok) return
    // Azonnal látszik, a kérés a háttérben megy; hibánál visszaáll
    const put = (next: Voucher) => mutate((d) => ({ ...d, vouchers: d.vouchers.map((x) => (x.id === v.id ? { ...x, ...next } : x)) }))
    put({ ...v, status: action === 'redeem' ? 'redeemed' : 'active' })
    saveInBackground(() => voucherAction(v.id, action), { done: put, failed: () => put(v) })
  }
  const rows = buildRows(vouchers, columns)

  function card(v: Voucher) {
    const [label, color] = status(v)
    const expired = label === 'Lejárt'
    return (
      <View key={v.id} style={[s.card, { flex: 1 }]}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={[s.row, { gap: 10 }]}><Gift size={18} color={c.rose} strokeWidth={1.8} /><Text style={[s.title, { letterSpacing: 1 }]}>{v.code}</Text></View>
          <Badge label={label} color={color} />
        </View>
        <Text style={[s.h2, { fontSize: 26 }]}>{huf(v.amountHuf)}</Text>
        <Text style={s.text}>{v.recipientName ? `${v.recipientName} részére` : 'Ajándékutalvány'}</Text>
        <Text style={s.muted}>Vásárló: {v.buyerName} · {v.buyerEmail}</Text>
        <Text style={s.muted}>Vásárolva: {fmtDate(v.createdAt)}{v.expiresAt ? ` · érvényes: ${fmtDate(v.expiresAt)}-ig` : ''}</Text>
        <View style={[s.row, { marginTop: 4 }]}>
          {v.status === 'pending_payment' && <Button small icon={Banknote} label="Fizetés megjött" onPress={() => run(v, 'payment-confirmed')} />}
          {v.status === 'active' && !expired && <Button small icon={Gift} label="Beváltás" onPress={() => run(v, 'redeem')} />}
        </View>
      </View>
    )
  }

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={{ padding: gutter, paddingBottom: 32, gap: 12, width: '100%', maxWidth: 1240, alignSelf: 'center' }}
      data={rows}
      keyExtractor={(r) => r.key}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.rose} colors={[c.rose]} progressBackgroundColor={c.card} />}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <View style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 0 }]}>
            <Search size={18} color={c.muted} strokeWidth={1.8} />
            <TextInput style={{ flex: 1, color: c.text, fontFamily: f.sans, fontSize: 16, paddingVertical: 12 }} value={query} onChangeText={setQuery} placeholder="Keresés kódra vagy névre" placeholderTextColor={c.muted} autoCapitalize="characters" autoCorrect={false} />
          </View>
          {error && <Text style={{ color: c.danger }}>{error}</Text>}
        </View>
      }
      ListEmptyComponent={data ? <Text style={s.empty}>{q ? 'Nincs találat.' : 'Még nincs utalvány.'}</Text> : undefined}
      renderItem={({ item: r }) => r.kind === 'header' ? (
        <Text style={[s.eyebrow, { marginTop: r.key === rows[0]?.key ? 4 : 12 }]}>{r.title} · {r.count}</Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {r.items.map((v, i) => (v ? card(v) : <View key={`empty-${i}`} style={{ flex: 1 }} />))}
        </View>
      )}
    />
  )
}
