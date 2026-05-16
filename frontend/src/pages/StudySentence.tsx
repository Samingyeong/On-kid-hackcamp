import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchStudySentences } from '../api/library'
import './StudyTyping.css'

const KR_ROWS = [
  ['ㅂ','ㅈ','ㄷ','ㄱ','ㅅ','ㅛ','ㅕ','ㅑ','ㅐ','ㅔ'],
  ['ㅁ','ㄴ','ㅇ','ㄹ','ㅎ','ㅗ','ㅓ','ㅏ','ㅣ'],
  ['ㅋ','ㅌ','ㅊ','ㅍ','ㅠ','ㅜ','ㅡ'],
]

const KEY_MAP: Record<string, string> = {
  q:'ㅂ', w:'ㅈ', e:'ㄷ', r:'ㄱ', t:'ㅅ', y:'ㅛ', u:'ㅕ', i:'ㅑ', o:'ㅐ', p:'ㅔ',
  a:'ㅁ', s:'ㄴ', d:'ㅇ', f:'ㄹ', g:'ㅎ', h:'ㅗ', j:'ㅓ', k:'ㅏ', l:'ㅣ',
  z:'ㅋ', x:'ㅌ', c:'ㅊ', v:'ㅍ', b:'ㅠ', n:'ㅜ', m:'ㅡ',
}

export default function StudySentence() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const book = params.get('book') || ''
  const mode = params.get('mode') || 'type'

  const [sentences, setSentences] = useState<{ sentence: string; keyword: string }[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [typed, setTyped] = useState('')
  const [lastKey, setLastKey] = useState('')
  const [errors, setErrors] = useState(0)
  const [startTime] = useState(Date.now())
  const [isListening, setIsListening] = useState(false)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    fetchStudySentences(book || undefined)
      .then(data => setSentences(data.sentences))
      .catch(() => {})
  }, [book])

  const current = sentences[currentIdx]
  const currentSentence = current?.sentence || ''
  const keyword = current?.keyword || ''
  const progress = sentences.length > 0 ? Math.round((currentIdx / sentences.length) * 100) : 0
  const elapsed = Math.floor((Date.now() - startTime) / 1000)
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const seconds = String(elapsed % 60).padStart(2, '0')

  const speak = useCallback((text: string) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'; u.rate = 0.85; u.pitch = 1.1
    speechSynthesis.speak(u)
  }, [])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTyped(val)
    if (val === currentSentence) {
      setFeedback('correct')
      setTimeout(() => {
        if (currentIdx < sentences.length - 1) {
          setCurrentIdx(i => i + 1)
          setTyped('')
          setFeedback(null)
          if (inputRef.current) inputRef.current.value = ''
        }
      }, 800)
    }
    if (val.length === currentSentence.length && val !== currentSentence) {
      setErrors(err => err + 1)
    }
  }, [currentSentence, currentIdx, sentences.length])

  // 따라말하기 모드
  function handleListen() {
    if (isListening) { recognitionRef.current?.stop(); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'ko-KR'; rec.continuous = false; rec.interimResults = false
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript.trim()
      setIsListening(false)
      const isCorrect = text.includes(keyword) || currentSentence.includes(text)
      setFeedback(isCorrect ? 'correct' : 'wrong')
      if (isCorrect) setTimeout(() => { setCurrentIdx(i => i + 1); setFeedback(null) }, 1200)
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)
    recognitionRef.current = rec
    setFeedback(null); setIsListening(true); rec.start()
  }

  // 키보드 하이라이트
  useEffect(() => {
    if (mode !== 'type') return
    function onKeyDown(e: KeyboardEvent) {
      const code = e.code.replace('Key', '').toLowerCase()
      const mapped = KEY_MAP[code] || KEY_MAP[e.key.toLowerCase()] || ''
      if (mapped) { setLastKey(mapped); setTimeout(() => setLastKey(''), 300) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode])

  useEffect(() => { if (mode === 'type') inputRef.current?.focus() }, [currentIdx, mode])

  if (sentences.length === 0) {
    return (
      <div className="study-typing">
        <div className="st-main">
          <p style={{ fontSize: 20, color: '#888' }}>모르는 단어가 포함된 문장이 없어요. 동화를 읽으면서 "몰라요"를 눌러보세요.</p>
          <button className="st-back" onClick={() => navigate(-1)}>← 돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="study-typing" onClick={() => mode === 'type' && inputRef.current?.focus()}>
      {/* 상단 */}
      <div className="st-top">
        <button className="st-home-button" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        </button>
      </div>

      {/* 메인 */}
      <div className="st-middle">
        <div className="st-word-section">
          <span className="st-word-prev">{sentences[currentIdx - 1]?.sentence?.slice(0, 15) || ''}</span>
          <div className="st-word-display">
            <span className="st-word-label">입력할 문장</span>
            <span className="st-word" style={{ fontSize: 'clamp(20px, 2.5vw, 32px)' }}>
              {currentSentence.split(keyword).map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && <mark style={{ color: '#FF6B35', background: 'none' }}>{keyword}</mark>}
                </span>
              ))}
            </span>
          </div>
          <span className="st-word-next">{sentences[currentIdx + 1]?.sentence?.slice(0, 15) || ''}</span>
        </div>

        {/* 입력 영역 */}
        {mode === 'type' ? (
          <>
            <div className="st-typed-area">
              <span className="st-typed">{typed}</span>
              <span className="st-cursor">|</span>
            </div>
            <input ref={inputRef} className="st-hidden-input" value={typed} onChange={handleInput} autoFocus />
          </>
        ) : (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12 }}>
            <button className="st-home-button" onClick={() => speak(currentSentence)} style={{ background: '#ff8584', borderColor: '#df696c', width: 48, height: 48 }}>🔊</button>
            <button
              className="st-home-button"
              onClick={handleListen}
              style={{ background: isListening ? '#40c7c7' : '#75d1cf', borderColor: '#32aaa8', width: 'auto', height: 48, padding: '0 20px', borderRadius: 30, fontSize: 16, fontWeight: 700, color: '#fff' }}
            >
              🎤 {isListening ? '듣는 중...' : '눌러서 말하기'}
            </button>
          </div>
        )}

        {feedback && (
          <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: feedback === 'correct' ? '#278c58' : '#f07378' }}>
            {feedback === 'correct' ? '🎉 정확해요!' : '😊 다시 해봐요!'}
          </div>
        )}
      </div>

      {/* 하단: 키보드 + 통계 */}
      <div className="st-bottom">
        <div className="st-stats">
          <div className="st-stat-timer">
            <div className="st-timer-icon">⏱</div>
            <span className="st-timer-pill">{minutes}:{seconds}</span>
          </div>
          <div className="st-stat">
            <span className="st-stat-label">오타</span>
            <span className="st-stat-value">{errors}</span>
          </div>
          <div className="st-stat">
            <span className="st-stat-label">진행도</span>
            <span className="st-stat-value">{currentIdx}/{sentences.length}</span>
          </div>
          <div className="st-progress-bar">
            <div className="st-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {mode === 'type' && (
          <div className="st-keyboard-wrap">
            <div className="st-keyboard">
              {KR_ROWS.map((row, ri) => (
                <div key={ri} className="st-kb-row">
                  {row.map(key => (
                    <div key={key} className={`st-key ${lastKey === key ? 'active' : ''}`}>{key}</div>
                  ))}
                </div>
              ))}
              <div className="st-kb-row">
                <div className={`st-key st-space ${lastKey === ' ' ? 'active' : ''}`}>Space</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
