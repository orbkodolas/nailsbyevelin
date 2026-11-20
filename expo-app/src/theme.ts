import { StyleSheet } from 'react-native'

// A weboldal palettája (frontend/src/styles/base.css)
export const c = {
  bg: '#0c0809', card: '#171014', raised: '#2c1d24',
  rose: '#d7a2aa', roseDeep: '#9c6f78', gold: '#b59a80',
  text: '#e6dcdd', muted: '#9e8c91', line: 'rgba(215,162,170,0.16)',
  danger: '#e07a7a', ok: '#8fc4a0',
}

const tz = 'Europe/Budapest'
export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('hu-HU', { timeZone: tz, month: 'long', day: 'numeric', weekday: 'long' })
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('hu-HU', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('hu-HU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
export const huf = (n: number) => `${new Intl.NumberFormat('hu-HU').format(n)} Ft`
/** Budapesti naptári nap: YYYY-MM-DD */
export const dayKey = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: tz })

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  h1: { color: c.text, fontSize: 26, fontWeight: '300', letterSpacing: 0.5 },
  h2: { color: c.gold, fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 8 },
  card: { backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 10, padding: 14, gap: 6 },
  title: { color: c.text, fontSize: 17, fontWeight: '500' },
  text: { color: c.text, fontSize: 15 },
  muted: { color: c.muted, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  input: { borderColor: c.line, borderWidth: 1, borderRadius: 8, color: c.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: 'rgba(255,255,255,0.03)' },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.rose, alignItems: 'center' },
  btnText: { color: c.bg, fontWeight: '600', fontSize: 15 },
  ghost: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: c.line },
  ghostText: { color: c.text, fontSize: 14 },
  empty: { color: c.muted, textAlign: 'center', marginTop: 40, fontSize: 15 },
})
