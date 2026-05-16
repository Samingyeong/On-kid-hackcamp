import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBooks, fetchBookForReader } from '../api/library'
import { CATEGORIES } from '../constants/categories'
import type { Book } from '../types'
import CalendarModal from '../components/CalendarModal'
import './Home.css'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const SERVICE_START = new Date(2020, 0, 1)

// 모듈 레벨 캐시 - 페이지 이동 후 돌아와도 재요청 안 함
let cachedRecommend: Book | null = null
let cachedRanking: Book[] | null = null

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
  const [recommendBook, setRecommendBook] = useState<Book | null>(cachedRecommend)
  const [flipped, setFlipped] = useState(false)
  const [rankingBooks, setRankingBooks] = useState<Book[]>(cachedRanking ?? [])
  const [rankingLoading, setRankingLoading] = useState(!cachedRanking)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const categoryRef = useRef<HTMLDivElement>(null)

  const weekDays = getWeekDays(selectedDate)

  // 추천 책 로드
  useEffect(() => {
    if (cachedRecommend) return
    fetchBooks('암탉과 누렁이', 'all', undefined, 1, 1).then(res => {
      if (res.items.length > 0) {
        cachedRecommend = res.items[0]
        setRecommendBook(res.items[0])
      }
    })
  }, [])

  // 오늘의 순위 로드
  useEffect(() => {
    if (cachedRanking) return
    setRankingLoading(true)
    fetchBooks('', 'multilang', 'korean', 1, 10).then(res => {
      cachedRanking = res.items
      setRankingBooks(res.items)
      setRankingLoading(false)
    })
  }, [])

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

  async function handleRankingClick(book: Book) {
    const readerBook = await fetchBookForReader(book.title)
    if (readerBook) {
      navigate(`/reader?title=${encodeURIComponent(readerBook.title)}`)
    }
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

      {/* 3단 패널 */}
      <div className="home-panels">
        {/* 왼쪽: 추천 책 플립 카드 */}
        <div className="panel-left">
          <h3 className="panel-title">지금 이 책을 가장 많이 읽고 있어요!</h3>
          {recommendBook && (
            <div className={`flip-card${flipped ? ' flipped' : ''}`} onClick={() => setFlipped(!flipped)}>
              <div className="flip-card-inner">
                <div className="flip-card-front">
                  <img src={recommendBook.thumbnail} alt={recommendBook.title} className="flip-thumb" />
                </div>
                <div className="flip-card-back">
                  <div className="flip-back-blur" style={{ backgroundImage: `url(${recommendBook.thumbnail})` }} />
                  <div className="flip-back-content">
                    <h4>{recommendBook.title}</h4>
                    <p>{recommendBook.description}</p>
                  </div>
                </div>
              </div>
              <div className="flip-controls">
                <button className="flip-ctrl-btn">⏮</button>
                <button className="flip-ctrl-btn play" onClick={(e) => { e.stopPropagation(); navigate(`/reader?title=${encodeURIComponent(recommendBook.title)}`) }}>▶</button>
                <button className="flip-ctrl-btn">⏭</button>
              </div>
            </div>
          )}
        </div>

        {/* 가운데: 오늘의 순위 */}
        <div className="panel-center">
          <h3 className="panel-title">오늘의 순위</h3>
          <div className="ranking-list">
            {rankingLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="ranking-skeleton">
                  <div className="skel-rank" />
                  <div className="skel-thumb" />
                  <div className="skel-title" />
                </div>
              ))
            ) : (
              rankingBooks.map((book, i) => (
                <button key={i} className="ranking-item" onClick={() => handleRankingClick(book)}>
                  <span className="ranking-num">{i + 1}</span>
                  <img src={book.thumbnail} alt={book.title} className="ranking-thumb" />
                  <span className="ranking-title">{book.title}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 오른쪽: 학습 카드 그리드 */}
        <div className="panel-right">
          <h3 className="panel-title">학습하기</h3>
          <div className="study-grid">
            <button className="study-card" style={{ borderColor: '#6370B4' }} onClick={() => navigate('/study/today')}>
              <img src="/svg/study_today.png" alt="오늘의 학습" className="study-card-img" />
              <span className="study-card-label">오늘의 학습</span>
            </button>
            <button className="study-card" style={{ borderColor: '#F16F6F' }} onClick={() => navigate('/study/quiz')}>
              <img src="/svg/study_quiz.png" alt="퀴즈 연습" className="study-card-img" />
              <span className="study-card-label">퀴즈 연습</span>
            </button>
            <button className="study-card" style={{ borderColor: '#8BBE71' }} onClick={() => navigate('/study/select?type=word')}>
              <img src="/svg/study_word.png" alt="단어 공부" className="study-card-img" />
              <span className="study-card-label">단어 공부</span>
            </button>
            <button className="study-card" style={{ borderColor: '#EEB654' }} onClick={() => navigate('/study/select?type=sentence')}>
              <img src="/svg/study_sentence.png" alt="문장 공부" className="study-card-img" />
              <span className="study-card-label">문장 공부</span>
            </button>
          </div>
        </div>
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
