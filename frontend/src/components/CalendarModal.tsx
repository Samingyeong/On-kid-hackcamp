import { useState } from 'react'
import './CalendarModal.css'

interface Props {
  selectedDate: Date
  minDate: Date
  onSelect: (date: Date) => void
  onClose: () => void
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

export default function CalendarModal({ selectedDate, minDate, onSelect, onClose }: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [viewYear, setViewYear] = useState(selectedDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth())

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    // 미래 달로 넘어가지 않게
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1
    if (new Date(nextY, nextM, 1) > today) return
    setViewYear(nextY); setViewMonth(nextM)
  }

  // 이번 달 날짜 배열 생성
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // 6주 맞추기
  while (cells.length % 7 !== 0) cells.push(null)

  function isDisabled(day: number) {
    const d = new Date(viewYear, viewMonth, day)
    return d < minDate || d > today
  }
  function isSelected(day: number) {
    return (
      selectedDate.getFullYear() === viewYear &&
      selectedDate.getMonth() === viewMonth &&
      selectedDate.getDate() === day
    )
  }
  function isToday(day: number) {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    )
  }

  const canGoNext = (() => {
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1
    return new Date(nextY, nextM, 1) <= today
  })()

  return (
    <div className="cal-modal-backdrop" onClick={onClose}>
      <div className="cal-modal" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="cal-modal-header">
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
          <span className="cal-modal-title">{viewYear}년 {MONTHS[viewMonth]}</span>
          <button className="cal-nav-btn" onClick={nextMonth} disabled={!canGoNext}>›</button>
        </div>

        {/* 요일 */}
        <div className="cal-grid">
          {DAYS.map((d, i) => (
            <div key={d} className={`cal-day-header ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{d}</div>
          ))}

          {/* 날짜 */}
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />
            const disabled = isDisabled(day)
            const selected = isSelected(day)
            const todayCell = isToday(day)
            const isSun = i % 7 === 0
            const isSat = i % 7 === 6
            return (
              <button
                key={day}
                className={[
                  'cal-cell',
                  selected ? 'selected' : '',
                  todayCell && !selected ? 'today' : '',
                  disabled ? 'disabled' : '',
                  isSun ? 'sun' : isSat ? 'sat' : '',
                ].filter(Boolean).join(' ')}
                disabled={disabled}
                onClick={() => { onSelect(new Date(viewYear, viewMonth, day)); onClose() }}
              >
                {day}
              </button>
            )
          })}
        </div>

        {/* 오늘로 이동 */}
        <button className="cal-today-btn" onClick={() => { onSelect(today); onClose() }}>
          오늘
        </button>
      </div>
    </div>
  )
}
