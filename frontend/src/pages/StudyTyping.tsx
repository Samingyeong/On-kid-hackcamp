import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchStudyWords, type StudyWord } from '../api/library'
import Hand3D from '../components/Hand3D'
import './StudyTyping.css'

const KR_ROWS = [
  ['ㅂ','ㅈ','ㄷ','ㄱ','ㅅ','ㅛ','ㅕ','ㅑ','ㅐ','ㅔ'],
  ['ㅁ','ㄴ','ㅇ','ㄹ','ㅎ','ㅗ','ㅓ','ㅏ','ㅣ'],
  ['ㅋ','ㅌ','ㅊ','ㅍ','ㅠ','ㅜ','ㅡ'],
]

// 물리 키 → 한글 자모 매핑
const KEY_MAP: Record<string, string> = {
  q:'ㅂ', w:'ㅈ', e:'ㄷ', r:'ㄱ', t:'ㅅ', y:'ㅛ', u:'ㅕ', i:'ㅑ', o:'ㅐ', p:'ㅔ',
  a:'ㅁ', s:'ㄴ', d:'ㅇ', f:'ㄹ', g:'ㅎ', h:'ㅗ', j:'ㅓ', k:'ㅏ', l:'ㅣ',
  z:'ㅋ', x:'ㅌ', c:'ㅊ', v:'ㅍ', b:'ㅠ', n:'ㅜ', m:'ㅡ',
}

// 왼손 키 (qwert, asdfg, zxcvb)
const LEFT_KEYS = new Set('qwertasdfgzxcvb'.split(''))


export default function StudyTyping() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const book = params.get('book') || ''

  const [words, setWords] = useState<string[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [typed, setTyped] = useState('')
  const [lastKey, setLastKey] = useState('')
  const [activeHand, setActiveHand] = useState<'left' | 'right' | ''>('')
  const [errors, setErrors] = useState(0)
  const [startTime] = useState(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchStudyWords(0)
      .then(list => {
        const filtered = book ? list.filter(w => w.from_book === book) : list
        setWords(filtered.map(w => w.base_form))
      })
      .catch(() => setWords([]))
  }, [book])

  const currentWord = words[currentIdx] || ''
  const isCorrect = typed === currentWord
  const progress = words.length > 0 ? Math.round((currentIdx / words.length) * 100) : 0
  const elapsed = Math.floor((Date.now() - startTime) / 1000)
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const seconds = String(elapsed % 60).padStart(2, '0')

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTyped(val)
    // 정답
    if (val === currentWord) {
      setTimeout(() => {
        if (currentIdx < words.length - 1) {
          setCurrentIdx(i => i + 1)
          setTyped('')
          if (inputRef.current) inputRef.current.value = ''
        }
      }, 500)
    }
    // 오타: 단어 길이만큼 입력했는데 틀린 경우에만 카운트
    if (val.length === currentWord.length && val !== currentWord) {
      setErrors(err => err + 1)
    }
  }, [currentWord, currentIdx, words.length])

  // 키보드 하이라이트 + 3D 손 연동
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const code = e.code.replace('Key', '').toLowerCase()
      const mapped = KEY_MAP[code] || KEY_MAP[e.key.toLowerCase()] || ''
      if (mapped) {
        setLastKey(mapped)
        setActiveHand(LEFT_KEYS.has(code) ? 'left' : 'right')
        setTimeout(() => { setLastKey(''); setActiveHand('') }, 300)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // 자동 포커스
  useEffect(() => { inputRef.current?.focus() }, [currentIdx])

  if (words.length === 0) {
    return (
      <div className="study-typing">
        <div className="st-main">
          <p style={{ fontSize: 20, color: '#888' }}>모르는 단어가 없어요! 동화를 읽으면서 "몰라요"를 눌러보세요.</p>
          <button className="st-back" onClick={() => navigate(-1)}>← 돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="study-typing" onClick={() => inputRef.current?.focus()}>
      {/* 상단 주황 여백 */}
      <div className="st-top" />

      {/* 메인 흰 카드 */}
      <div className="st-middle">
        {/* 단어 흐름 */}
        <div className="st-word-section">
          <span className="st-word-prev">{words[currentIdx - 1] || ''}</span>
          <div className="st-word-display">
            <span className="st-word-label">입력할 단어</span>
            <span className="st-word">{currentWord}</span>
          </div>
          <span className="st-word-next">{words[currentIdx + 1] || ''}</span>
        </div>

        {/* 입력 영역 */}
        <div className="st-typed-area">
          <span className="st-typed">{typed}</span>
          <span className="st-cursor">|</span>
        </div>
        <input
          ref={inputRef}
          className="st-hidden-input"
          value={typed}
          onChange={handleInput}
          autoFocus
        />
      </div>

      {/* 하단: 키보드 + 통계 */}
      <div className="st-bottom">
        {/* 통계 */}
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
            <span className="st-stat-value">{currentIdx}/{words.length}</span>
          </div>
          <div className="st-progress-bar">
            <div className="st-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="st-stat">
            <span className="st-stat-label">정확도</span>
            <span className="st-stat-value">{words.length > 0 ? Math.round(((currentIdx - errors) / Math.max(currentIdx, 1)) * 100) : 0}%</span>
          </div>
          <div className="st-progress-bar">
            <div className="st-progress-fill accuracy" style={{ width: `${words.length > 0 ? Math.round(((currentIdx - errors) / Math.max(currentIdx, 1)) * 100) : 0}%` }} />
          </div>
        </div>

        {/* 키보드 UI + 3D 손 */}
        <div className="st-keyboard-wrap">
          <div className="st-keyboard">
            {KR_ROWS.map((row, ri) => (
              <div key={ri} className="st-kb-row">
                {row.map(key => (
                  <div key={key} className={`st-key ${lastKey === key ? 'active' : ''}`}>
                    {key}
                  </div>
                ))}
              </div>
            ))}
            <div className="st-kb-row">
              <div className={`st-key st-space ${lastKey === ' ' ? 'active' : ''}`}>Space</div>
            </div>
            {/* 3D 손 — 키보드 바로 아래 */}
            <div className="st-hands-row">
              <Hand3D activeKey={lastKey} activeHand={activeHand} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
