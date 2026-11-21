import { useState } from 'react'
import { Text, View } from 'react-native'
import { CalendarDays, CalendarRange, Clock } from 'lucide-react-native'
import type { BlockRequest } from '../api'
import { DayInfo, toMin, toTime } from '../schedule'
import { addDays, s, weekdayOf } from '../theme'
import { Chips, Segmented, Stepper } from './Pickers'

const STEP = 30
const MIN = 6 * 60 // 06:00
const MAX = 22 * 60 // 22:00
const MONTHS_SHORT = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.']
const WEEKDAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat']
export const fmtDayShort = (key: string) => `${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8))}.`
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

export type CloseKind = 'day' | 'range' | 'multi'

/** Időszak (mettől–meddig) két léptetővel; a vége mindig a kezdés után marad */
function TimeRange({ start, end, onChange }: { start: number; end: number; onChange: (start: number, end: number) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Stepper label="Mettől" value={toTime(start)}
        onMinus={() => onChange(Math.max(MIN, start - STEP), end)} minusDisabled={start <= MIN}
        onPlus={() => { const ns = Math.min(MAX - STEP, start + STEP); onChange(ns, Math.max(end, ns + STEP)) }} plusDisabled={start >= MAX - STEP} />
      <Stepper label="Meddig" value={toTime(end)}
        onMinus={() => { const ne = Math.max(MIN + STEP, end - STEP); onChange(Math.min(start, ne - STEP), ne) }} minusDisabled={end <= MIN + STEP}
        onPlus={() => onChange(start, Math.min(MAX, end + STEP))} plusDisabled={end >= MAX} />
    </View>
  )
}

/** Zárás: egész nap / napon belüli időszak / több napos szabadság */
export function CloseEditor({ day, info, value, onChange }: { day: string; info: DayInfo; value: CloseDraft; onChange: (v: CloseDraft) => void }) {
  const { kind, start, end, toDate } = value
  const count = daysBetween(day, toDate) + 1
  const work = info.hours.map(([a, b]) => `${a}–${b}`).join(', ')
  return (
    <View style={{ gap: 12 }}>
      <Segmented<CloseKind> value={kind} onChange={(k) => onChange({ ...value, kind: k })} options={[
        { key: 'day', label: 'Egész nap', icon: CalendarDays },
        { key: 'range', label: 'Időszak', icon: Clock },
        { key: 'multi', label: 'Több nap', icon: CalendarRange },
      ]} />
      {kind === 'range' && <TimeRange start={start} end={end} onChange={(a, b) => onChange({ ...value, start: a, end: b })} />}
      {kind === 'multi' && (
        <>
          <View style={{ gap: 10 }}>
            <Stepper label="Első nap" hint={WEEKDAYS[weekdayOf(day)]} value={fmtDayShort(day)} />
            <Stepper label="Utolsó nap" value={fmtDayShort(toDate)} hint={WEEKDAYS[weekdayOf(toDate)]}
              onMinus={() => onChange({ ...value, toDate: addDays(toDate, -1) })} minusDisabled={toDate <= addDays(day, 1)}
              onPlus={() => onChange({ ...value, toDate: addDays(toDate, 1) })} plusDisabled={count >= 60} />
          </View>
          <Chips<number> value={count} onChange={(n) => onChange({ ...value, toDate: addDays(day, n - 1) })}
            options={[{ key: 3, label: '3 nap' }, { key: 7, label: '1 hét' }, { key: 14, label: '2 hét' }]} />
        </>
      )}
      <Text style={s.muted}>
        {kind === 'day' && `Egész nap zárva${work ? ` (munkaidő: ${work})` : ''}. A weboldalon erre a napra nem lehet foglalni.`}
        {kind === 'range' && `${toTime(start)} és ${toTime(end)} között nem lehet foglalni, a nap többi részében igen.`}
        {kind === 'multi' && `${fmtDayShort(day)} – ${fmtDayShort(toDate)}, ${count} nap szabadság. Ezekre a napokra nem lehet foglalni.`}
      </Text>
    </View>
  )
}

export type CloseDraft = { kind: CloseKind; start: number; end: number; toDate: string }
export function initialClose(day: string, info: DayInfo): CloseDraft {
  const [a, b] = info.hours[0] ?? ['09:00', '18:00']
  const start = toMin(a)
  return { kind: 'day', start, end: Math.min(toMin(b), start + 3 * 60), toDate: addDays(day, 2) }
}
export function closeRequest(day: string, d: CloseDraft, force = false): BlockRequest {
  if (d.kind === 'range') return { date: day, start: toTime(d.start), end: toTime(d.end), reason: '', force }
  if (d.kind === 'multi') return { date: day, toDate: d.toDate, reason: 'Szabadság', force }
  return { date: day, reason: force ? 'Sürgős szabadnap' : 'Szabadnap', force }
}

/** Nyitás zárt napon (ünnep, szünnap, vasárnap): mettől meddig fogad vendéget */
export function OpenEditor({ info, start, end, onChange }: { info: DayInfo; start: number; end: number; onChange: (start: number, end: number) => void }) {
  const why = info.ruleClosed === 'holiday' ? 'Ünnepnap' : info.ruleClosed === 'closed_day' ? 'Szünnap' : 'Ezen a napon nincs munkaidő'
  return (
    <View style={{ gap: 12 }}>
      <TimeRange start={start} end={end} onChange={onChange} />
      <Text style={s.muted}>{why}, de {toTime(start)} és {toTime(end)} között fogadsz vendéget: a weboldalon erre az időre lehet foglalni.</Text>
    </View>
  )
}
export function initialOpen(info: DayInfo): [number, number] {
  if (info.opening) return [toMin(info.opening.start), toMin(info.opening.end)]
  const [a, b] = info.regular[0] ?? ['09:00', '18:00']
  return [toMin(a), toMin(b)]
}
