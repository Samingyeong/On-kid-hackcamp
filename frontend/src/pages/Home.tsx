import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBooks } from '../api/library'
import { CATEGORIES } from '../constants/categories'
import CalendarModal from '../components/CalendarModal'
import './Home.css'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const SERVICE_START = new Date(2020, 0, 1)

function getWeekDays(center: Date) {
  const days: Date[] = []
  for (let i = -3; i <= 3; i++) {
    const d = new Date(center)
    d.setDate(center.getDate() + i)
    days.push(d)
  }
  return days
}

export function Component() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [showCalendar, setShowCalendar] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const categoryRef = useRef<HTMLDivElement>(null)

  const weekDays = getWeekDays(selectedDate)

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const result = await fetchBooks(searchQuery, 'all', undefined, 1, 5)
      setSuggestions(result.items.map(b => b.title))
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/books?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchOpen(false)
      setSearchQuery('')
      setSuggestions([])
    }
  }

  function handleSuggestionClick(title: string) {
    navigate(`/books?q=${encodeURIComponent(title)}`)
    setSearchOpen(false)
    setSearchQuery('')
    setSuggestions([])
  }

  function scrollCategories(offset: number) {
    categoryRef.current?.scrollBy({ left: offset, behavior: 'smooth' })
  }

  return (
    <div className="home">
      {/* 날짜바 */}
      <div className="date-bar">
        <div className="date-weekdays">
          {weekDays.map((d, i) => {
            const isCenter = i === 3
            return (
              <button
                key={i}
                className={`weekday-item${isCenter ? ' active' : ''}`}
                onClick={() => setSelectedDate(d)}
              >
                <span className="weekday-label">{WEEKDAY_LABELS[d.getDay()]}</span>
                <span className="weekday-date">{d.getDate()}</span>
              </button>
            )
          })}
        </div>
        <button className="calendar-icon-btn" onClick={() => setShowCalendar(true)}>
          <img src="/svg/calendar.svg" alt="달력" />
        </button>
        <button className="search-icon-btn" onClick={() => setSearchOpen(!searchOpen)}>
          <img src="/svg/search.svg" alt="검색" />
        </button>
      </div>

      {/* 검색바 */}
      {searchOpen && (
        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            className="search-input"
            placeholder="동화 제목을 검색하세요"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button type="submit" className="search-submit-btn">검색</button>
          {suggestions.length > 0 && (
            <ul className="search-suggestions">
              {suggestions.map((s, i) => (
                <li key={i} onClick={() => handleSuggestionClick(s)}>{s}</li>
              ))}
            </ul>
          )}
        </form>
      )}

      {/* 카테고리 슬라이더 */}
      <div className="category-slider">
        <button className="slider-arrow left" onClick={() => scrollCategories(-200)}>&lt;</button>
        <div className="category-track" ref={categoryRef}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className="category-book"
              onClick={() => navigate(`/books?category=${cat.id}`)}
            >
              <div className="book-icon" style={{ background: cat.color }}>
                <div className="book-spine" style={{ background: cat.spine }} />
              </div>
              <span className="category-label">{cat.label}</span>
            </button>
          ))}
        </div>
        <button className="slider-arrow right" onClick={() => scrollCategories(200)}>&gt;</button>
      </div>

      {/* 달력 모달 */}
      {showCalendar && (
        <CalendarModal
          selectedDate={selectedDate}
          minDate={SERVICE_START}
          onSelect={(d) => { setSelectedDate(d); setShowCalendar(false) }}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  )
}
