import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchStudyWords } from '../api/library'
import { useAuth } from '../contexts/AuthContext'
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

// ── 점자 입력 ──────────────────────────────────────────────
// 숫자키패드 배열: 7=점1, 8=점2, 4=점3, 5=점4, 1=점5, 2=점6
// 점 번호 비트: 점1=bit0, 점2=bit1, 점3=bit2, 점4=bit3, 점5=bit4, 점6=bit5
const BRAILLE_KEY_MAP: Record<string, number> = {
  '7': 0, '8': 1, '4': 2, '5': 3, '1': 4, '2': 5,
}

// 점자 패턴(비트마스크) → 한글 자모 (한국 점자 규정 기반)
const BRAILLE_TO_JAMO: Record<number, string> = {
  // 초성 자음
  0b000001: 'ㄱ',  // 점1
  0b000101: 'ㄴ',  // 점1,점3
  0b000011: 'ㄷ',  // 점1,점2
  0b001011: 'ㄹ',  // 점1,점2,점4
  0b000111: 'ㅁ',  // 점1,점2,점3
  0b001001: 'ㅂ',  // 점1,점4
  0b001101: 'ㅅ',  // 점1,점3,점4
  0b111111: 'ㅇ',  // 점1~6 (약자)
  0b001111: 'ㅈ',  // 점1,점2,점3,점4
  0b010001: 'ㅊ',  // 점1,점5
  0b010101: 'ㅋ',  // 점1,점3,점5
  0b010011: 'ㅌ',  // 점1,점2,점5
  0b011001: 'ㅍ',  // 점1,점4,점5
  0b011101: 'ㅎ',  // 점1,점3,점4,점5
  // 모음
  0b100000: 'ㅏ',  // 점6
  0b110000: 'ㅑ',  // 점5,점6
  0b100100: 'ㅓ',  // 점3,점6
  0b110100: 'ㅕ',  // 점3,점5,점6
  0b100010: 'ㅗ',  // 점2,점6
  0b110010: 'ㅛ',  // 점2,점5,점6
  0b100110: 'ㅜ',  // 점2,점3,점6
  0b110110: 'ㅠ',  // 점2,점3,점5,점6
  0b100001: 'ㅡ',  // 점1,점6
  0b100101: 'ㅣ',  // 점1,점3,점6
  0b100011: 'ㅐ',  // 점1,점2,점6
  0b100111: 'ㅔ',  // 점1,점2,점3,점6
}

function brailleBitsToJamo(bits: number): string {
  return BRAILLE_TO_JAMO[bits] || ''
}


export default function StudyTyping() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { childCharacter } = useAuth()
  const isVision = childCharacter === 'vision'
  const book = params.get('book') || ''

  const [words, setWords] = useState<string[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [typed, setTyped] = useState('')
  const [lastKey, setLastKey] = useState('')
  const [activeHand, setActiveHand] = useState<'left' | 'right' | ''>('')
  const [errors, setErrors] = useState(0)
  const [startTime] = useState(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // 점자 입력 상태
  const [braillePressed, setBraillePressed] = useState<Set<number>>(new Set())
  const brailleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // 점자 키 입력 처리 (숫자키패드 7,8,4,5,1,2)
  const handleBrailleKey = useCallback((bit: number) => {
    setBraillePressed(prev => {
      const next = new Set(prev)
      next.add(bit)
      return next
    })
    // 타이머 리셋 — 마지막 키 입력 후 300ms 뒤 조합 확정
    if (brailleTimerRef.current) clearTimeout(brailleTimerRef.current)
    brailleTimerRef.current = setTimeout(() => {
      setBraillePressed(prev => {
        let bits = 0
        prev.forEach(b => { bits |= (1 << b) })
        const jamo = brailleBitsToJamo(bits)
        if (jamo) {
          setTyped(t => {
            const next = t + jamo
            return next
          })
        }
        return new Set()
      })
    }, 300)
  }, [])

  // 점자 키보드 이벤트 (숫자키패드)
  useEffect(() => {
    if (!isVision) return
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key
      if (key in BRAILLE_KEY_MAP) {
        e.preventDefault()
        handleBrailleKey(BRAILLE_KEY_MAP[key])
      }
      if (key === 'Backspace') {
        setTyped(t => t.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isVision, handleBrailleKey])

  // typed 변경 시 정답 체크 (점자 모드)
  useEffect(() => {
    if (!isVision) return
    if (typed === currentWord && currentWord !== '') {
      setTimeout(() => {
        if (currentIdx < words.length - 1) {
          setCurrentIdx(i => i + 1)
          setTyped('')
        }
      }, 500)
    } else if (typed.length === currentWord.length && typed !== currentWord && currentWord !== '') {
      setErrors(err => err + 1)
    }
  }, [typed, currentWord, currentIdx, words.length, isVision])

  // 키보드 하이라이트 + 3D 손 연동 (일반 모드)
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
  }, [isVision])

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
          {isVision ? (
            /* 점자 키패드 (시각장애인 전용) */
            <div className="st-braille-pad">
              <div className="st-braille-label">점자 입력</div>
              <div className="st-braille-hint">키를 동시에 눌러 조합하세요</div>
              <div className="st-braille-grid">
                {/* 왼손: 7(점1), 8(점2) / 오른손: 없음 → 상단 행 */}
                <div className="st-braille-row">
                  {[{k:'7',b:0,label:'점1'},{k:'8',b:1,label:'점2'}].map(({k,b,label}) => (
                    <button
                      key={k}
                      className={`st-braille-key ${braillePressed.has(b) ? 'active' : ''}`}
                      onPointerDown={() => handleBrailleKey(b)}
                    >
                      <span className="st-braille-num">{k}</span>
                      <span className="st-braille-dot">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="st-braille-row">
                  {[{k:'4',b:2,label:'점3'},{k:'5',b:3,label:'점4'}].map(({k,b,label}) => (
                    <button
                      key={k}
                      className={`st-braille-key ${braillePressed.has(b) ? 'active' : ''}`}
                      onPointerDown={() => handleBrailleKey(b)}
                    >
                      <span className="st-braille-num">{k}</span>
                      <span className="st-braille-dot">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="st-braille-row">
                  {[{k:'1',b:4,label:'점5'},{k:'2',b:5,label:'점6'}].map(({k,b,label}) => (
                    <button
                      key={k}
                      className={`st-braille-key ${braillePressed.has(b) ? 'active' : ''}`}
                      onPointerDown={() => handleBrailleKey(b)}
                    >
                      <span className="st-braille-num">{k}</span>
                      <span className="st-braille-dot">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="st-braille-row">
                  <button
                    className="st-braille-key st-braille-back"
                    onPointerDown={() => setTyped(t => t.slice(0, -1))}
                  >
                    ← 지우기
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* 일반 키보드 */
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
          )}
        </div>
      </div>
    </div>
  )
}
