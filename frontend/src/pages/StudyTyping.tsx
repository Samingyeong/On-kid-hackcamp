import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchStudyWords } from '../api/library'
import { useAuth } from '../contexts/AuthContext'
import Hand3D from '../components/Hand3D'
import { useBrailleChording } from '../hooks/useBrailleChording'
import type { SpecialKey } from '../hooks/useBrailleChording'
import {
  dotsToJamo, feedJamo, previewSyllable, commitState, isEmptyDots, EMPTY_STATE,
} from '../utils/brailleConverter'
import type { Dots, HangulState, JamoType } from '../utils/brailleConverter'
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
const LEFT_KEYS = new Set('qwertasdfgzxcvb'.split(''))

// ── TTS ──────────────────────────────────────────
const PREFERRED_VOICES = ['Google 한국의', 'Microsoft SunHi', 'Microsoft Heami', 'Yuna']
let cachedVoice: SpeechSynthesisVoice | null = null

function getKoreanVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  for (const name of PREFERRED_VOICES) {
    const found = voices.find(v => v.name.includes(name) && v.lang.startsWith('ko'))
    if (found) { cachedVoice = found; return found }
  }
  cachedVoice = voices.find(v => v.lang.startsWith('ko')) ?? null
  return cachedVoice
}

function speak(text: string, rate = 0.95, pitch = 1.15) {
  if (!window.speechSynthesis || !text) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'ko-KR'; utter.pitch = pitch; utter.rate = rate; utter.volume = 1.0
  const voice = getKoreanVoice()
  if (voice) utter.voice = voice
  window.speechSynthesis.speak(utter)
}

if (typeof window !== 'undefined') {
  window.speechSynthesis.onvoiceschanged = () => { cachedVoice = null; getKoreanVoice() }
}

// ── 점자 입력 상태 ────────────────────────────────
interface BrailleInputState {
  committed: string
  composing: HangulState
}
const INITIAL_BRAILLE: BrailleInputState = { committed: '', composing: EMPTY_STATE }

function getNextContext(state: HangulState): JamoType {
  if (!state.cho) return 'chosung'
  if (!state.jung) return 'jungsung'
  if (state.jong2) return 'chosung'
  if (!state.jong) return 'jongsung'
  return 'chosung'
}


export default function StudyTyping() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { childCharacter } = useAuth()
  const isVision = childCharacter === 'vision'
  const book = params.get('book') || ''

  const [words, setWords] = useState<string[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [typed, setTyped] = useState('')         // 일반 모드 입력
  const [lastKey, setLastKey] = useState('')
  const [activeHand, setActiveHand] = useState<'left' | 'right' | ''>('')
  const [errors, setErrors] = useState(0)
  const [startTime] = useState(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // 점자 모드 상태
  const [brailleDots, setBrailleDots] = useState<Dots>([false,false,false,false,false,false])
  const [brailleInput, setBrailleInput] = useState<BrailleInputState>(INITIAL_BRAILLE)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  useEffect(() => { mutedRef.current = muted }, [muted])
  const speakIfOn = useCallback((text: string, rate = 0.95, pitch = 1.15) => {
    if (mutedRef.current) return
    speak(text, rate, pitch)
  }, [])

  // 점자 입력 텍스트 (committed + 조합 중 미리보기)
  const braillePreview = previewSyllable(brailleInput.composing)
  const brailleText = brailleInput.committed + braillePreview

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

  // ── 점자 조합 처리 (braille-input 브랜치 로직) ──
  const handleChord = useCallback((newDots: Dots) => {
    if (isEmptyDots(newDots)) return
    setBrailleInput(prev => {
      const context = getNextContext(prev.composing)
      let jamo: string | null = null
      let usedContext: JamoType = context

      if (context === 'jongsung') {
        const asJung = dotsToJamo(newDots, 'jungsung')
        if (asJung) { jamo = asJung; usedContext = 'jungsung' }
        else { jamo = dotsToJamo(newDots, 'jongsung'); usedContext = 'jongsung' }
      } else if (context === 'chosung') {
        const asJung = dotsToJamo(newDots, 'jungsung')
        if (asJung) { jamo = asJung; usedContext = 'jungsung' }
        else { jamo = dotsToJamo(newDots, 'chosung'); usedContext = 'chosung' }
      } else {
        jamo = dotsToJamo(newDots, context)
        usedContext = context
      }

      if (!jamo) {
        speakIfOn('인식할 수 없는 점자 조합입니다')
        return prev
      }

      const { committed: newCommitted, newState } = feedJamo(prev.composing, jamo, usedContext)
      const preview = previewSyllable(newState)
      setTimeout(() => speakIfOn(preview || jamo!), 0)

      const nextCommitted = prev.committed + newCommitted
      const nextFull = nextCommitted + previewSyllable(newState)

      if (nextFull === currentWord) {
        setTimeout(() => {
          speakIfOn('정답! 잘했어요!')
          if (currentIdx < words.length - 1) {
            setCurrentIdx(i => i + 1)
            setBrailleInput(INITIAL_BRAILLE)
          }
        }, 500)
      } else if (nextFull.length === currentWord.length && nextFull !== currentWord) {
        setErrors(err => err + 1)
        speakIfOn('아쉬워요, 다시 해봐요')
      }

      return { committed: nextCommitted, composing: newState }
    })
  }, [currentWord, currentIdx, words.length, speakIfOn])

  const handleSpecial = useCallback((key: SpecialKey) => {
    if (key === 'space') {
      setBrailleInput(prev => {
        const commit = commitState(prev.composing)
        speakIfOn('띄어쓰기')
        return { committed: prev.committed + commit + ' ', composing: EMPTY_STATE }
      })
    }
    if (key === 'readAll') {
      setBrailleInput(prev => {
        const commit = commitState(prev.composing)
        const full = (prev.committed + commit).trim()
        speakIfOn(full || '아직 입력된 내용이 없어요', 0.88, 1.1)
        return { committed: prev.committed + commit, composing: EMPTY_STATE }
      })
    }
    if (key === 'delete') {
      speakIfOn('지워졌어요')
      setBrailleInput(prev => {
        const c = prev.composing
        if (c.jong2) return { ...prev, composing: { ...c, jong2: '' } }
        if (c.jong) return { ...prev, composing: { ...c, jong: '' } }
        if (c.jung) return { ...prev, composing: { ...c, jung: '' } }
        if (c.cho) return { ...prev, composing: EMPTY_STATE }
        return { committed: prev.committed.slice(0, -1), composing: EMPTY_STATE }
      })
    }
  }, [speakIfOn])

  useBrailleChording(isVision ? {
    onChord: handleChord,
    onSpecial: handleSpecial,
    onDotsChange: (dots) => setBrailleDots(dots),
  } : {
    onChord: () => {},
    onSpecial: () => {},
    onDotsChange: () => {},
  })

  // 단어 바뀔 때 점자 입력 초기화 + TTS
  useEffect(() => {
    if (!isVision) return
    setBrailleInput(INITIAL_BRAILLE)
    const word = words[currentIdx]
    if (word) setTimeout(() => speakIfOn(`${word} 를 입력해보세요`, 0.88, 1.2), 300)
  }, [currentIdx, isVision])

  // 키보드 하이라이트 + 3D 손 연동 (일반 모드)
  useEffect(() => {
    if (isVision) return
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

  // 화면 버튼 클릭으로 점자 입력 (터치/마우스)
  const screenDotsRef = useRef<Set<number>>(new Set())
  const screenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleScreenDot = useCallback((dotIdx: number) => {
    screenDotsRef.current.add(dotIdx)
    setBrailleDots(prev => {
      const next = [...prev] as Dots
      next[dotIdx] = true
      return next
    })
    if (screenTimerRef.current) clearTimeout(screenTimerRef.current)
    screenTimerRef.current = setTimeout(() => {
      const dots: Dots = [false,false,false,false,false,false]
      screenDotsRef.current.forEach(i => { dots[i] = true })
      handleChord(dots)
      screenDotsRef.current.clear()
      setBrailleDots([false,false,false,false,false,false])
    }, 350)
  }, [handleChord])

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
          {isVision && (
            <button className="st-speak-btn" onClick={() => speakIfOn(currentWord, 0.85, 1.1)} aria-label="단어 듣기">
              🔊
            </button>
          )}
        </div>

        {/* 입력 영역 */}
        <div className="st-typed-area">
          <span className="st-typed">{isVision ? brailleText : typed}</span>
          <span className="st-cursor">|</span>
        </div>
        {!isVision && (
          <input
            ref={inputRef}
            className="st-hidden-input"
            value={typed}
            onChange={handleInput}
            autoFocus
          />
        )}
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
              <div className="st-braille-header">
                <div className="st-braille-label">점자 입력</div>
              </div>
              <div className="st-braille-hint">숫자패드 7·8·4·5·1·2 동시 입력 | 0=띄어쓰기 | .=지우기 | Enter=전체읽기</div>
              <div className="st-braille-grid">
                <div className="st-braille-row">
                  {[{k:'7',b:0,label:'점1'},{k:'8',b:3,label:'점4'}].map(({k,b,label}) => (
                    <button key={k} className={`st-braille-key ${brailleDots[b] ? 'active' : ''}`} onPointerDown={() => handleScreenDot(b)}>
                      <span className="st-braille-num">{k}</span>
                      <span className="st-braille-dot">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="st-braille-row">
                  {[{k:'4',b:1,label:'점2'},{k:'5',b:4,label:'점5'}].map(({k,b,label}) => (
                    <button key={k} className={`st-braille-key ${brailleDots[b] ? 'active' : ''}`} onPointerDown={() => handleScreenDot(b)}>
                      <span className="st-braille-num">{k}</span>
                      <span className="st-braille-dot">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="st-braille-row">
                  {[{k:'1',b:2,label:'점3'},{k:'2',b:5,label:'점6'}].map(({k,b,label}) => (
                    <button key={k} className={`st-braille-key ${brailleDots[b] ? 'active' : ''}`} onPointerDown={() => handleScreenDot(b)}>
                      <span className="st-braille-num">{k}</span>
                      <span className="st-braille-dot">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="st-braille-row">
                  <button className="st-braille-key st-braille-back" onPointerDown={() => handleSpecial('delete')}>
                    ← 지우기 (.)
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
