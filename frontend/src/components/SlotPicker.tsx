import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTHS, WEEKDAYS, formatLongDate, monthGrid } from '../lib/dates'

type Props = {
  days: Record<string, string[]>; loaded: boolean; loading: boolean; error: string; onRetry: () => void
  maxDays: number; date: string; time: string; onDate: (date: string) => void; onTime: (time: string) => void
}

// Hónapnaptár a szabad napokkal, alatta a kiválasztott nap szabad időpontjai (foglaláshoz és módosításhoz közös)
export function SlotPicker({ days, loaded, loading, error, onRetry, maxDays, date, time, onDate, onTime }: Props) {
  const [cursor, setCursor] = useState(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() } })
  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const monthHasSlots = grid.some((day) => day && days[day]?.length)
  const slots = date ? days[date] ?? [] : []
  const now = new Date()
  const canGoBack = cursor.year > now.getFullYear() || cursor.month > now.getMonth()
  const lastDay = loaded ? Object.keys(days).at(-1) ?? '' : ''
  const canGoForward = Boolean(lastDay) && `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}` < lastDay.slice(0, 7)
  const shiftMonth = (delta: number) => setCursor(({ year, month }) => { const d = new Date(year, month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() } })

  return (
    <>
      {error ? (
        <div className="notice" role="alert">{error} <button type="button" className="btn-link" onClick={onRetry}>Újra</button></div>
      ) : (
        <div className="calendar" aria-busy={loading}>
          <div className="calendar-nav">
            <button type="button" onClick={() => shiftMonth(-1)} disabled={!canGoBack} aria-label="Előző hónap"><ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" /></button>
            <b>{cursor.year}. {MONTHS[cursor.month]}</b>
            <button type="button" onClick={() => shiftMonth(1)} disabled={!canGoForward} aria-label="Következő hónap"><ChevronRight size={20} strokeWidth={1.5} aria-hidden="true" /></button>
          </div>
          <div className="calendar-grid" role="grid">
            {WEEKDAYS.map((weekday, index) => <span key={index} className="weekday">{weekday}</span>)}
            {grid.map((day, index) => day === null ? <span key={`e${index}`} /> : (
              <button key={day} type="button" className={`day${day === date ? ' is-on' : ''}`} disabled={!days[day]?.length}
                aria-label={formatLongDate(day)} aria-pressed={day === date} onClick={() => onDate(day)}>{Number(day.slice(8))}</button>
            ))}
          </div>
          {!loading && loaded && !monthHasSlots && <p className="hint">Ebben a hónapban nincs szabad időpont.</p>}
          <p className="hint">Időpontot legfeljebb {maxDays} napra előre lehet foglalni.</p>
        </div>
      )}
      {date && (
        <div className="times" aria-label={`Szabad időpontok: ${formatLongDate(date)}`}>
          <p className="hint">{formatLongDate(date)}</p>
          <div className="time-list">
            {slots.map((slot) => <button key={slot} type="button" className={`time${slot === time ? ' is-on' : ''}`} aria-pressed={slot === time} onClick={() => onTime(slot)}>{slot}</button>)}
          </div>
        </div>
      )}
    </>
  )
}
