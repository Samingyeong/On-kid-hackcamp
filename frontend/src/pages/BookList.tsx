import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchBooks, fetchNewBooks, fetchBookYears } from '../api/library'
import { CATEGORIES } from '../constants/categories'
import type { Book, CategoryId } from '../types'
import './BookList.css'

const PAGE_SIZE = 8  // 선반 2줄 × 4권

const BOOK_SVGS = [
  '/svg/book-red.svg', '/svg/book-green.svg', '/svg/book-purple.svg',
  '/svg/book-yellow.svg', '/svg/book-mint.svg', '/svg/book-violet.svg', '/svg/book-blue.svg',
]

export default function BookList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const categoryParam = (searchParams.get('category') || 'all') as CategoryId
  const qParam = searchParams.get('q') || ''

  const [books, setBooks]       = useState<Book[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const [page, setPage]         = useState(1)
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [years, setYears]       = useState<{ year: string; cnt: number }[]>([])

  const currentCat = CATEGORIES.find(c => c.id === categoryParam) || CATEGORIES[0]

  // 연도 목록 로드
  useEffect(() => {
    fetchBookYears().then(setYears).catch(() => {})
  }, [])

  const load = useCallback(async (p: number, year: string | null) => {
    setLoading(true)
    try {
      if (categoryParam === 'new' && !qParam) {
        const items = await fetchNewBooks(PAGE_SIZE)
        setBooks(items); setTotal(items.length)
      } else {
        const { items, total } = await fetchBooks(
          qParam, currentCat.source, currentCat.storyType, p, PAGE_SIZE,
          year ?? undefined
        )
        setBooks(items); setTotal(total)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [qParam, categoryParam, currentCat.source, currentCat.storyType])

  useEffect(() => {
    setPage(1)
    load(1, selectedYear)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam, categoryParam, currentCat.source, currentCat.storyType, selectedYear])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  function handleCategory(id: CategoryId) {
    setSearchParams({ category: id })
    setSelectedYear(null)
    setPage(1)
  }

  function handleYear(year: string) {
    // 같은 연도 누르면 필터 해제
    setSelectedYear(prev => prev === year ? null : year)
    setPage(1)
  }

  function openBook(book: Book) {
    const p = new URLSearchParams({
      thumb: book.thumbnail, nlcyThumb: book.nlcyThumb || book.thumbnail,
      title: book.title, desc: book.description, url: book.url,
    })
    navigate(`/reader?${p}`)
  }

  const shelves: Book[][] = []
  for (let i = 0; i < books.length; i += 4) shelves.push(books.slice(i, i + 4))

  return (
    <div className="booklist">
      {/* 상단 탭 */}
      <div className="booklist-tabs">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`booklist-tab ${cat.id === categoryParam ? 'active' : ''}`}
            style={cat.id === categoryParam ? { background: cat.color, borderColor: cat.color } : {}}
            onClick={() => handleCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 메인 레이아웃 */}
      <div className="booklist-layout">
        <img src="/svg/Union.svg"   alt="" className="bl-deco bl-deco-tl" />
        <img src="/svg/Union-2.svg" alt="" className="bl-deco bl-deco-br" />

        {/* 왼쪽: 연도 사이드바 */}
        <div className="booklist-sidebar">
          <button
            className={`sidebar-year ${selectedYear === null ? 'active' : ''}`}
            onClick={() => handleYear('')}
          >
            <span>전체</span>
            {selectedYear === null && <span className="sidebar-arrow">›</span>}
          </button>
          {years.map(({ year, cnt }) => (
            <button
              key={year}
              className={`sidebar-year ${selectedYear === year ? 'active' : ''}`}
              onClick={() => handleYear(year)}
            >
              <span>{year}년도</span>
              <span className="year-cnt">{selectedYear === year ? '›' : cnt}</span>
            </button>
          ))}
        </div>

        {/* 오른쪽: 책 선반 */}
        <div className="booklist-shelf-area">
          {loading ? (
            <div className="booklist-loading">불러오는 중...</div>
          ) : books.length === 0 ? (
            <div className="booklist-empty">
              {selectedYear ? `${selectedYear}년도 등록된 동화가 없어요.` : '검색 결과가 없어요.'}
            </div>
          ) : (
            <>
              {shelves.map((shelf, si) => (
                <div key={si} className="shelf-row">
                  <div className="shelf-books-line">
                    {shelf.map((book, bi) => {
                      const svgIdx = (si * 4 + bi) % BOOK_SVGS.length
                      return (
                        <div key={bi} className="shelf-book-wrap">
                          <div className="shelf-book-title">{book.title}</div>
                          <div className="shelf-book-inner">
                            <div className="shelf-book" onClick={() => openBook(book)}>
                              {book.thumbnail
                                ? <img src={book.thumbnail} alt={book.title} loading="lazy" className="shelf-book-thumb" />
                                : <img src={BOOK_SVGS[svgIdx]} alt={book.title} loading="lazy" className="shelf-book-svg" />
                              }
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="shelf-plank" />
                </div>
              ))}
              {totalPages > 1 && (
                <div className="shelf-pagination">
                  <span>{page} / {totalPages}</span>
                  {page > 1 && (
                    <button onClick={() => { const p = page-1; setPage(p); load(p, selectedYear) }}>◀ 이전</button>
                  )}
                  {page < totalPages && (
                    <button onClick={() => { const p = page+1; setPage(p); load(p, selectedYear) }}>▶ 다음</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
