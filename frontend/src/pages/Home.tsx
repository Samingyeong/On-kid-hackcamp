import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CATEGORIES } from '../constants/categories'
import { fetchBooks, fetchBookForReader } from '../api/library'
import type { Book } from '../types'
import CalendarModal from '../components/CalendarModal'
import './Home.css'

const DAYS = ['일','월','화','수','목','금','토']
const _today = new Date()
_today.setHours(0, 0, 0, 0)

// 회원가입 기능 구현 전 임시 최소 날짜 (서비스 시작일)
// TODO: 로그인 연동 후 실제 가입일로 교체
const SERVICE_START = new Date('2025-01-01')

const STUDY_CARDS = [
  {
    id: 'today',
    label: '오늘의 학습',
    border: '#FF8B8B',
    labelBg: '#FF8B8B',
    path: '/study/today',
    img: '/svg/today_study.png',
  },
  {
    id: 'quiz',
    label: '퀴즈 연습',
    border: '#75D069',
    labelBg: '#75D069',
    path: '/study/quiz',
    img: '/svg/quiz_game.png',
  },
  {
    id: 'word',
    label: '단어 공부',
    border: '#1FA7E1',
    labelBg: '#1FA7E1',
    path: '/study/select?type=word',
    img: '/svg/word_study.png',
  },
  {
    id: 'sentence',
    label: '문장 공부',
    border: '#FFB256',
    labelBg: '#FFB256',
    path: '/study/select?type=sentence',
    img: '/svg/sentence_study.png',
  },
]

const BOOK_SVGS: Record<string, string> = { all: '/svg/book_all.svg' }
const BOOK_SVG_LIST = [
  '/svg/book-red.svg',
  '/svg/book-purple.svg',
  '/svg/book-green.svg',
  '/svg/book-yellow.svg',
  '/svg/book-mint.svg',
  '/svg/book-violet.svg',
  '/svg/book-blue.svg',
]

// ─── 홈 데이터 캐시 (페이지 이동 시 재로드 방지) ──────────────
let _cachedFeatured: Book | null = null
let _cachedRanking: Book[] = []

export function clearHomeCache() {
  _cachedFeatured = null
  _cachedRanking = []
}

export default function Home() {
  const navigate = useNavigate()
  const sliderRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchVal, setSearchVal] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const [calOpen, setCalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(_today))

  // 선택된 날짜 기준 날짜바 계산
  const selIdx = selectedDate.getDay()
  const selDay = DAYS[selIdx]
  const selDateStr = `${selectedDate.getMonth()+1}/${selectedDate.getDate()}`
  const selPrevDays = [-3, -2, -1].map(offset => DAYS[(selIdx + offset + 7) % 7])
  const selNextDays = [1, 2, 3].map(offset => DAYS[(selIdx + offset) % 7])
  const [flipped, setFlipped] = useState(false)
  const [featured, setFeatured] = useState<Book | null>(_cachedFeatured)
  const [rankingBooks, setRankingBooks] = useState<Book[]>(_cachedRanking)

  // 연관 검색어
  useEffect(() => {
    if (!searchVal.trim()) {
      const t = setTimeout(() => setSuggestions([]), 0)
      return () => clearTimeout(t)
    }
    const timer = setTimeout(() => {
      fetchBooks(searchVal.trim(), 'all', undefined, 1, 5)
        .then(({ items }) => setSuggestions(items.map(b => b.title)))
        .catch(() => setSuggestions([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchVal])

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])
  // 암탉과 누렁이 + 순위 데이터 한번에 로드 (캐시 있으면 스킵)
  useEffect(() => {
    if (!_cachedFeatured) {
      fetchBooks('암탉과 누렁이', 'all', undefined, 1, 1)
        .then(({ items }) => {
          const found = items.find(b => b.title.includes('암탉과 누렁이'))
          if (found) { _cachedFeatured = found; setFeatured(found) }
        })
        .catch(() => {})
    }

    if (_cachedRanking.length === 0) {
      fetchBooks('', 'multilang', 'korean', 1, 10)
        .then(({ items }) => { _cachedRanking = items; setRankingBooks(items) })
        .catch(() => {})
    }
  }, [])

  async function openBook(title: string) {
    try {
      const book = await fetchBookForReader(title)
      const p = new URLSearchParams({
        thumb:     book.thumbnail,
        nlcyThumb: book.nlcyThumb,
        title:     book.title,
        desc:      book.description,
        url:       book.url,
      })
      navigate(`/reader?${p}`)
    } catch {
      navigate(`/books?q=${encodeURIComponent(title)}`)
    }
  }

  function scrollSlider(dir: number) {
    sliderRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })
  }

  return (
    <div className="home">
      {calOpen && (
        <CalendarModal
          selectedDate={selectedDate}
          minDate={SERVICE_START}
          onSelect={date => setSelectedDate(date)}
          onClose={() => setCalOpen(false)}
        />
      )}
      <div className="home-bg-left" />
      <div className="home-bg-right" />
      <img src="/svg/Union.svg"   alt="" className="home-deco home-deco-tl" />
      <img src="/svg/Union-2.svg" alt="" className="home-deco home-deco-br" />
      <img src="/svg/Union-1.svg" alt="" className="home-deco home-deco-tr" />

      <div className="home-body">
        {/* 날짜 바 */}
        <div className="home-datebar-row">
          <div className={`home-calendar ${searchOpen ? 'collapsed' : ''}`}>
            <button className="cal-arrow">‹</button>
            <div className="cal-days-group">
              {selPrevDays.map(d => <span key={d} className="cal-day-item">{d}</span>)}
            </div>
            <div className="cal-today-pill">
              <span className="cal-date">{selDateStr}</span>
              <span className="cal-today-day">{selDay}</span>
            </div>
            <div className="cal-days-group">
              {selNextDays.map(d => <span key={d} className="cal-day-item">{d}</span>)}
            </div>
            <button className="cal-arrow">›</button>
          </div>
          <div className={`home-searchbar-wrap ${searchOpen ? 'open' : ''}`} ref={searchRef}>
            <form onSubmit={e => {
              e.preventDefault()
              if (searchVal.trim()) {
                navigate(`/books?q=${encodeURIComponent(searchVal.trim())}`)
                setShowSuggestions(false)
              }
            }}>
              <input
                autoFocus={searchOpen}
                value={searchVal}
                onChange={e => { setSearchVal(e.target.value); setShowSuggestions(true) }}
                onFocus={() => { if (searchVal.trim()) setShowSuggestions(true) }}
                placeholder="검색어를 입력하세요"
              />
            </form>
            {showSuggestions && suggestions.length > 0 && (
              <div className="search-suggestions">
                {suggestions.map((title, i) => (
                  <div
                    key={i}
                    className="search-suggestion-item"
                    onMouseDown={() => {
                      navigate(`/books?q=${encodeURIComponent(title)}`)
                      setShowSuggestions(false)
                      setSearchVal(title)
                    }}
                  >
                    {title}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="datebar-icon-btn" onClick={() => setCalOpen(v => !v)}>
            <img src="/svg/calender.svg" alt="달력" />
          </button>
          <button className="datebar-icon-btn" onClick={() => { setSearchOpen(v => !v); setSearchVal('') }}>
            <img src="/svg/home_search.svg" alt="검색" />
          </button>
        </div>

        {/* 카테고리 슬라이더 */}
        <div className="cat-slider-wrap">
          <button className="cat-arrow cat-arrow-left" onClick={() => scrollSlider(-1)}>‹</button>
          <div className="cat-slider" ref={sliderRef}>
            {CATEGORIES.map((cat, i) => (
              <div
                key={cat.id}
                className="cat-book"
                onClick={() => navigate(`/books?category=${cat.id}`)}
              >
                <img
                  src={BOOK_SVGS[cat.id] ?? BOOK_SVG_LIST[i % BOOK_SVG_LIST.length]}
                  alt={cat.label}
                  loading="lazy"
                  className="cat-book-svg"
                />
                <span className="cat-label">{cat.label}</span>
              </div>
            ))}
          </div>
          <button className="cat-arrow cat-arrow-right" onClick={() => scrollSlider(1)}>›</button>
        </div>

        {/* 메인 패널 */}
        <div className="home-panels">

          {/* 왼쪽: 추천 책 플립 카드 */}
          <div className="panel panel-featured">
            <p className="featured-label">지금 이 책을 가장 많이 읽고 있어요!</p>
            <div
              className={`featured-flip ${flipped ? 'is-flipped' : ''}`}
              onClick={() => setFlipped(v => !v)}
            >
              <div className="flip-inner">
                {/* 앞면: 책 표지 */}
                <div className="flip-front">
                  {featured?.thumbnail
                    ? <img src={featured.thumbnail} alt={featured.title} className="flip-cover-img" />
                    : <div className="flip-cover-placeholder">📖</div>
                  }
                </div>
                {/* 뒷면: 설명 */}
                <div className="flip-back" style={featured?.thumbnail ? { backgroundImage: `url(${featured.thumbnail})` } : {}}>
                  <div className="flip-back-overlay" />
                  <div className="flip-back-content">
                    <strong className="flip-back-title">{featured?.title ?? '암탉과 누렁이'}</strong>
                    <p className="flip-back-desc">{featured?.description ?? '로딩 중...'}</p>
                  </div>
                </div>
              </div>
            </div>
            {/* 하단 컨트롤 */}
            <div className="featured-bottom">
              <span className="featured-bottom-label">줄거리 {flipped ? '들여다보기' : '들어보기'}</span>
              <div className="featured-controls">
                <button className="ctrl-btn">⏮</button>
                <button className="ctrl-btn ctrl-play" onClick={e => {
                  e.stopPropagation()
                  if (featured) openBook(featured.title)
                }}>▶</button>
                <button className="ctrl-btn">⏭</button>
              </div>
            </div>
          </div>

          {/* 가운데: 오늘의 순위 */}
          <div className="panel panel-ranking">
            <h2 className="ranking-title">오늘의 순위</h2>
            <ul className="ranking-list">
              {rankingBooks.length > 0
                ? rankingBooks.map((book, i) => (
                    <li key={i} className="ranking-item" onClick={() => openBook(book.title)}>                      <span className={`ranking-num rank-${i + 1}`}>{i + 1}</span>
                      <div className="ranking-cover">
                        {book.thumbnail
                          ? <img src={book.thumbnail} alt={book.title} className="ranking-cover-img" />
                          : <div className="ranking-cover-empty" />
                        }
                      </div>
                      <span className="ranking-book-title">{book.title}</span>
                    </li>
                  ))
                : Array.from({ length: 10 }, (_, i) => (
                    <li key={i} className="ranking-item ranking-item-skeleton">
                      <span className="ranking-num">{ i + 1}</span>
                      <div className="ranking-cover ranking-cover-empty" />
                      <div className="ranking-skeleton-text" />
                    </li>
                  ))
              }
            </ul>
          </div>

          {/* 오른쪽: 학습 카드 2×2 */}
          <div className="panel panel-study">
            <div className="study-grid">
              {STUDY_CARDS.map(card => (
                <div key={card.label} className="study-card" onClick={() => navigate(card.path)}>
                  <div className="study-card-inner">
                    <img src={card.img} alt={card.label} className="study-card-img" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
