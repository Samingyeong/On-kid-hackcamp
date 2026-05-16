import { useState } from 'react'
import './CalendarModal.css'

interface Props {
  selectedDate: Date
  minDate: Date
  onSelect: (date: Date) => void
  onClose: () => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function CalendarModal({ selectedDate, minDate, onSelect, onClose }: Props) {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth())

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function isDisabled(day: number) {
    const date = new Date(viewYear, viewMonth, day)
    date.setHours(0, 0, 0, 0)
    return date > today || date < minDate
  }

  function isSelected(day: number) {
    return (
      day === selectedDate.getDate() &&
      viewMonth === selectedDate.getMonth() &&
      viewYear === selectedDate.getFullYear()
    )
  }

  function isToday(day: number) {
    const now = new Date()
    return day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear()
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function goToday() {
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    onSelect(now)
  }

  function handleSelect(day: number) {
    if (isDisabled(day)) return
    onSelect(new Date(viewYear, viewMonth, day))
  }

  return (
    <div className="calendar-overlay" onClick={onClose}>
      <div className="calendar-modal" onClick={e => e.stopPropagation()}>
        <div className="calendar-header">
          <button className="cal-nav-btn" onClick={prevMonth}>&lt;</button>
          <span className="cal-title">{viewYear}년 {viewMonth + 1}월</span>
          <button className="cal-nav-btn" onClick={nextMonth}>&gt;</button>
        </div>

        <div className="calendar-weekdays">
          {WEEKDAYS.map(w => <span key={w} className="cal-weekday">{w}</span>)}
        </div>

        <div className="calendar-grid">
          {cells.map((day, i) => (
            <button
              key={i}
              className={`cal-cell${day === null ? ' empty' : ''}${day && isDisabled(day) ? ' disabled' : ''}${day && isSelected(day) ? ' selected' : ''}${day && isToday(day) ? ' today' : ''}`}
              disabled={day === null || isDisabled(day)}
              onClick={() => day && handleSelect(day)}
            >
              {day ?? ''}
            </button>
          ))}
        </div>

        <div className="calendar-footer">
          <button className="cal-today-btn" onClick={goToday}>오늘</button>
          <button className="cal-close-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
