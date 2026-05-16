import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchBookSentences, type BookSentence } from '../api/library'
import './StudySentence.css'

export default function StudySentence() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const book = params.get('book') || ''

  const [sentences, setSentences] = useState<BookSentence[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)

  useEffect(() => {
    if (!book) return
    fetchBookSentences(book)
      .then(list => setSentences(list.length > 0 ? list : []))
      .catch(() => {})
  }, [book])

  const currentSentence = sentences[currentIdx]?.sentence || ''

  function goNext() {
    if (currentIdx < sentences.length - 1) {
      setCurrentIdx(i => i + 1)
      setShowAnswer(false)
    }
  }
  function goPrev() {
    if (currentIdx > 0) {
      setCurrentIdx(i => i - 1)
      setShowAnswer(false)
    }
  }

  if (sentences.length === 0) {
    return (
      <div className="study-sentence">
        <div className="ss-main" style={{ flex: 1, borderRadius: 0 }}>
          <p style={{ fontSize: 20, color: '#888', textAlign: 'center' }}>
            아직 저장된 문장이 없어요.<br />동화를 먼저 읽어보세요!
          </p>
          <button className="ss-back" onClick={() => navigate(-1)}>← 돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="study-sentence">
      <div className="ss-left">
        <div className="ss-speech-bubble">문장을 읽어보아요!</div>
        <div className="ss-monkey-placeholder">🐵</div>
      </div>

      <div className="ss-main">
        <div className="ss-progress-bar">
          <span>{currentIdx + 1} / {sentences.length}</span>
        </div>

        {/* 문장 카드 */}
        <div className="ss-card">
          <p className="ss-sentence-text">{currentSentence}</p>
        </div>

        {/* 네비게이션 */}
        <div className="ss-nav">
          <button className="ss-nav-btn" onClick={goPrev} disabled={currentIdx === 0}>‹ 이전</button>
          <button className="ss-nav-btn" onClick={goNext} disabled={currentIdx === sentences.length - 1}>다음 ›</button>
        </div>

        {/* 문장 도트 */}
        <div className="ss-dots">
          {sentences.map((_, i) => (
            <span
              key={i}
              className={`ss-dot ${i === currentIdx ? 'current' : ''} ${i < currentIdx ? 'done' : ''}`}
              onClick={() => { setCurrentIdx(i); setShowAnswer(false) }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
