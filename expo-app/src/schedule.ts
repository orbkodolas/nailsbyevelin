import type { Opening, Schedule } from './api'
import { holidayName } from './holidays'
import { weekdayOf } from './theme'

/** Ha a szerver (régebbi verzió) nem küld szabályokat: a szerver alapbeállításai */
export const DEFAULT_SCHEDULE: Schedule = {
  closedDays: ['12-24', '12-25', '12-26', '12-31', '01-01'],
  closeHolidays: true,
  workingHours: { 1: [['09:00', '18:00']], 2: [['09:00', '18:00']], 3: [['09:00', '18:00']], 4: [['09:00', '18:00']], 5: [['09:00', '18:00']], 6: [['09:00', '14:00']] },
}

export type DayInfo = {
  holiday: string | null
  /** Szabály szerint zárt: ünnepnap vagy évente ismétlődő szünnap */
  ruleClosed: 'holiday' | 'closed_day' | null
  opening: Opening | null
  /** A heti munkaidő ezen a napon (vasárnap üres) */
  regular: [string, string][]
  /** A tényleges munkaidő (nyitás vagy heti munkaidő; zárt napon üres) */
  hours: [string, string][]
}

export function dayInfo(day: string, schedule: Schedule, openings: Opening[]): DayInfo {
  const holiday = holidayName(day)
  const ruleClosed = schedule.closeHolidays && holiday ? 'holiday' : schedule.closedDays.includes(day.slice(5)) ? 'closed_day' : null
  const opening = openings.find((o) => o.date === day) ?? null
  const regular = schedule.workingHours[String(weekdayOf(day))] ?? []
  const hours = opening ? [[opening.start, opening.end] as [string, string]] : ruleClosed ? [] : regular
  return { holiday, ruleClosed, opening, regular, hours }
}

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
export const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
