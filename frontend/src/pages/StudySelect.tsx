import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchReadingHistory, type ReadHistory } from '../api/library'
import './StudySelect.css'

const MODES = [
  {
    id: 'write',
    label: '따라쓰기',
    bg: '/svg/따라쓰기배경.png',
    monkey: '/svg/따라쓰기원숭이.png',
  },
  {
    id: 'type',
    label: '타자치기',
    bg: '/svg/타자치기배경.png',
    monkey: '/svg/타자치기원숭이.png',
  },
  {
    id: 'speak',
    label: '단어 따라말하기',
    bg: '/svg/따라말하기배경.png',
    monkey: '/svg/따라말하기원숭이.png',
  },
  {
    id: 'sign',
    label: '수화하기',
    bg: '/svg/수화하기배경.png',
    monkey: '/svg/수화하기원숭이.png',
  },
]

export default function StudySelect() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const studyType = params.get('type') || 'word'

  const [step, setStep] = useState<'book' | 'mode'>('book')
  const [books, setBooks] = useState<ReadHistory[]>([])
  const [selectedBook, setSelectedBook] = useState<string>('')

  useEffect(() => {
    fetchReadingHistory().then(list => {
      // 중복 제거 (같은 제목은 최신 것만)
      const seen = new Set<string>()
      const unique = list.filter(b => {
        if (seen.has(b.title)) return false
        seen.add(b.title)
        return true
      })
      setBooks(unique)
    }).catch(() => {})
  }, [])

  function selectMode(modeId: string) {
    if (studyType === 'sentence') {
      navigate(`/study/sentence?book=${encodeURIComponent(selectedBook)}`)
    } else if (modeId === 'type') {
      navigate(`/study/typing?book=${encodeURIComponent(selectedBook)}`)
    } else if (modeId === 'sign') {
      navigate(`/study/sign?book=${encodeURIComponent(selectedBook)}`)
    } else {
      navigate(`/study/practice?type=${studyType}&mode=${modeId}&book=${encodeURIComponent(selectedBook)}`)
    }
  }

  // 1단계: 책 선택
  if (step === 'book') {
    return (
      <div className="study-select">
        <div className="cloud cloud-left">
          <div className="cloud-circle c1" /><div className="cloud-circle c2" />
          <div className="cloud-circle c3" /><div className="cloud-circle c4" />
        </div>
        <div className="cloud cloud-right">
          <div className="cloud-circle c1" /><div className="cloud-circle c2" />
          <div className="cloud-circle c3" /><div className="cloud-circle c4" />
        </div>
        <div className="cloud cloud-right-bottom">
          <div className="cloud-circle c1" /><div className="cloud-circle c2" />
          <div className="cloud-circle c3" /><div className="cloud-circle c4" />
        </div>

        <h1 className="study-select-title">어떤 책으로 학습할까요?</h1>

        {books.length === 0 ? (
          <p className="study-empty">아직 읽은 책이 없어요. 동화를 먼저 읽어보세요!</p>
        ) : (
          <div className="study-book-grid">
            {books.map(book => (
              <div
                key={book.title}
                className={`study-book-card ${selectedBook === book.title ? 'selected' : ''}`}
                onClick={() => {
                  if (studyType === 'sentence') {
                    navigate(`/study/sentence?book=${encodeURIComponent(book.title)}`)
                  } else {
                    setSelectedBook(book.title)
                    setStep('mode')
                  }
                }}
              >
                {book.thumbnail && <img src={book.thumbnail} alt={book.title} className="study-book-thumb" />}
                <span className="study-book-title">{book.title}</span>
                {book.isToday && <span className="study-book-today">오늘</span>}
              </div>
            ))}
          </div>
        )}
        <button className="study-back-btn" onClick={() => navigate(-1)}>← 돌아가기</button>
      </div>
    )
  }

  // 2단계: 학습 모드 선택
  return (
    <div className="study-select">
      <div className="cloud cloud-left">
        <div className="cloud-circle c1" /><div className="cloud-circle c2" />
        <div className="cloud-circle c3" /><div className="cloud-circle c4" />
      </div>
      <div className="cloud cloud-right">
        <div className="cloud-circle c1" /><div className="cloud-circle c2" />
        <div className="cloud-circle c3" /><div className="cloud-circle c4" />
      </div>
      <div className="cloud cloud-right-bottom">
        <div className="cloud-circle c1" /><div className="cloud-circle c2" />
        <div className="cloud-circle c3" /><div className="cloud-circle c4" />
      </div>

      <h1 className="study-select-title">
        「{selectedBook}」 {studyType === 'word' ? '단어' : '문장'}를 학습해볼까요?
      </h1>
      <div className="study-select-cards">
        {MODES.map(mode => (
          <div
            key={mode.id}
            className={`study-mode-card ${mode.id}`}
            onClick={() => selectMode(mode.id)}
          >
            <img src={mode.bg} alt="" className="study-mode-bg" />
            <img src={mode.monkey} alt={mode.label} className="study-mode-monkey" />
          </div>
        ))}
      </div>
      <button className="study-back-btn" onClick={() => setStep('book')}>← 다른 책 선택</button>
    </div>
  )
}
