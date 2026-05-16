import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchStudySentences } from '../api/library'
import { useAuth } from '../contexts/AuthContext'
import { useBrailleChording } from '../hooks/useBrailleChording'
import type { SpecialKey } from '../hooks/useBrailleChording'
import {
  dotsToJamo,
  feedJamo,
  previewSyllable,
  commitState,
  isEmptyDots,
  EMPTY_STATE,
} from '../utils/brailleConverter'
import type { Dots, HangulState, JamoType } from '../utils/brailleConverter'
import './StudyTyping.css'
import './StudySentence.css'

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

const VISION_FALLBACK_SENTENCES = [
  { sentence: '아침이 되었어요. 암탉이 마당으로 나왔어요.', keyword: '암탉' },
  { sentence: '암탉은 누렁이를 만났어요.', keyword: '누렁이' },
  { sentence: '누렁이는 꼬리를 흔들었어요.', keyword: '꼬리' },
  { sentence: '암탉과 누렁이는 함께 마당을 걸었어요.', keyword: '마당' },
]

interface BrailleInputState {
  committed: string
  composing: HangulState
}

const INITIAL_BRAILLE: BrailleInputState = { committed: '', composing: EMPTY_STATE }

function getNextContext(state: HangulState): JamoType {
  if (!state.cho) return 'chosung'
  if (!state.jung) return 'jungsung'
  if (!state.jong) return 'jongsung'
  if (!state.jong2) return 'jongsung'
  return 'chosung'
}

function normalizeSentenceAnswer(text: string) {
  return text.replace(/[^\uAC00-\uD7A3ㄱ-ㅎㅏ-ㅣ0-9a-zA-Z]/g, '')
}

type SentenceBrailleInputProps = {
  currentSentence: string
  speak: (text: string) => void
  onInput: () => void
  onCorrect: () => void
  onWrong: () => void
}

function SentenceBrailleInput({ currentSentence, speak, onInput, onCorrect, onWrong }: SentenceBrailleInputProps) {
  const [brailleDots, setBrailleDots] = useState<Dots>([false, false, false, false, false, false])
  const [brailleInput, setBrailleInput] = useState<BrailleInputState>(INITIAL_BRAILLE)
  const screenDotsRef = useRef<Set<number>>(new Set())
  const screenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const braillePreview = previewSyllable(brailleInput.composing)
  const brailleText = brailleInput.committed + braillePreview

  const completeIfCorrect = useCallback((nextText: string) => {
    const normalizedInput = normalizeSentenceAnswer(nextText)
    const normalizedTarget = normalizeSentenceAnswer(currentSentence)
    if (!normalizedTarget) return
    if (normalizedInput === normalizedTarget) {
      onCorrect()
      return
    }
    if (normalizedInput.length >= normalizedTarget.length) onWrong()
  }, [currentSentence, onCorrect, onWrong])

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
        if (!jamo) { jamo = dotsToJamo(newDots, 'chosung'); usedContext = 'chosung' }
      } else if (context === 'chosung') {
        const asJung = dotsToJamo(newDots, 'jungsung')
        if (asJung) { jamo = asJung; usedContext = 'jungsung' }
        else { jamo = dotsToJamo(newDots, 'chosung'); usedContext = 'chosung' }
      } else {
        jamo = dotsToJamo(newDots, 'jungsung')
        if (jamo) { usedContext = 'jungsung' }
        else { jamo = dotsToJamo(newDots, 'chosung'); usedContext = 'chosung' }
      }

      if (!jamo) {
        speak('인식할 수 없는 점자 조합입니다.')
        return prev
      }

      const { committed: newCommitted, newState } = feedJamo(prev.composing, jamo, usedContext)
      const nextCommitted = prev.committed + newCommitted
      const nextFull = nextCommitted + previewSyllable(newState)
      onInput()
      setTimeout(() => speak(previewSyllable(newState) || jamo!), 0)
      completeIfCorrect(nextFull)

      return { committed: nextCommitted, composing: newState }
    })
  }, [completeIfCorrect, onInput, speak])

  const handleSpecial = useCallback((key: SpecialKey) => {
    if (key === 'space') {
      setBrailleInput(prev => {
        const commit = commitState(prev.composing)
        const nextCommitted = prev.committed + commit + ' '
        speak('띄어쓰기')
        completeIfCorrect(nextCommitted)
        return { committed: nextCommitted, composing: EMPTY_STATE }
      })
    }
    if (key === 'readAll') {
      setBrailleInput(prev => {
        const commit = commitState(prev.composing)
        const full = prev.committed + commit
        speak(full.trim() || '아직 입력된 문장이 없어요.')
        return { committed: full, composing: EMPTY_STATE }
      })
    }
    if (key === 'delete') {
      speak('지워졌어요.')
      onInput()
      setBrailleInput(prev => {
        const c = prev.composing
        if (c.jong2) return { ...prev, composing: { ...c, jong2: '' } }
        if (c.jong) return { ...prev, composing: { ...c, jong: '' } }
        if (c.jung) return { ...prev, composing: { ...c, jung: '' } }
        if (c.cho) return { ...prev, composing: EMPTY_STATE }
        return { committed: prev.committed.slice(0, -1), composing: EMPTY_STATE }
      })
    }
  }, [completeIfCorrect, onInput, speak])

  useBrailleChording({
    onChord: handleChord,
    onSpecial: handleSpecial,
    onDotsChange: dots => setBrailleDots(dots),
  })

  const handleScreenDot = useCallback((dotIdx: number) => {
    screenDotsRef.current.add(dotIdx)
    setBrailleDots(prev => {
      const next = [...prev] as Dots
      next[dotIdx] = true
      return next
    })
    if (screenTimerRef.current) clearTimeout(screenTimerRef.current)
    screenTimerRef.current = setTimeout(() => {
      const dots: Dots = [false, false, false, false, false, false]
      screenDotsRef.current.forEach(i => { dots[i] = true })
      handleChord(dots)
      screenDotsRef.current.clear()
      setBrailleDots([false, false, false, false, false, false])
    }, 350)
  }, [handleChord])

  useEffect(() => {
    setBrailleInput(INITIAL_BRAILLE)
  }, [currentSentence])

  useEffect(() => {
    if (!currentSentence) return
    const timer = window.setTimeout(() => {
      speak(`문장을 점자로 입력해 보세요. ${currentSentence}`)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [currentSentence, speak])

  useEffect(() => () => {
    if (screenTimerRef.current) clearTimeout(screenTimerRef.current)
  }, [])

  return (
    <div className="ss-braille-area">
      <div className="ss-braille-input">
        <span className="ss-braille-input-label">입력 중</span>
        <span className="ss-braille-text">{brailleText || '점자 키보드로 문장을 입력해 보세요'}</span>
        <span className="ss-braille-cursor">|</span>
      </div>
      <div className="ss-braille-pad" aria-label="점자 키보드">
        <div className="ss-braille-header">
          <span className="ss-braille-title">점자 키보드</span>
          <button className="ss-braille-read" onClick={() => speak(currentSentence)}>문장 듣기</button>
        </div>
        <div className="ss-braille-hint">숫자패드 7·8·4·5·1·2 동시 입력 | 0=띄어쓰기 | .=지우기 | Enter=입력 읽기</div>
        <div className="ss-braille-grid">
          <div className="ss-braille-row">
            {[{ k: '7', b: 0, label: '점1' }, { k: '8', b: 3, label: '점4' }].map(({ k, b, label }) => (
              <button key={k} className={`ss-braille-key ${brailleDots[b] ? 'active' : ''}`} onPointerDown={() => handleScreenDot(b)}>
                <span className="ss-braille-num">{k}</span>
                <span className="ss-braille-dot">{label}</span>
              </button>
            ))}
          </div>
          <div className="ss-braille-row">
            {[{ k: '4', b: 1, label: '점2' }, { k: '5', b: 4, label: '점5' }].map(({ k, b, label }) => (
              <button key={k} className={`ss-braille-key ${brailleDots[b] ? 'active' : ''}`} onPointerDown={() => handleScreenDot(b)}>
                <span className="ss-braille-num">{k}</span>
                <span className="ss-braille-dot">{label}</span>
              </button>
            ))}
          </div>
          <div className="ss-braille-row">
            {[{ k: '1', b: 2, label: '점3' }, { k: '2', b: 5, label: '점6' }].map(({ k, b, label }) => (
              <button key={k} className={`ss-braille-key ${brailleDots[b] ? 'active' : ''}`} onPointerDown={() => handleScreenDot(b)}>
                <span className="ss-braille-num">{k}</span>
                <span className="ss-braille-dot">{label}</span>
              </button>
            ))}
          </div>
          <div className="ss-braille-row special">
            <button className="ss-braille-special" onClick={() => handleSpecial('space')}>띄어쓰기</button>
            <button className="ss-braille-special" onClick={() => handleSpecial('delete')}>지우기</button>
            <button className="ss-braille-special" onClick={() => handleSpecial('readAll')}>입력 읽기</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StudySentence() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { childCharacter } = useAuth()
  const book = params.get('book') || ''
  const mode = params.get('mode') || 'type'
  const isVisionMode = childCharacter === 'vision'
  const isVisionTyping = isVisionMode && mode === 'type'

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
      .then(data => {
        setSentences(data.sentences.length > 0 ? data.sentences : isVisionMode ? VISION_FALLBACK_SENTENCES : [])
      })
      .catch(() => {
        if (isVisionMode) setSentences(VISION_FALLBACK_SENTENCES)
      })
  }, [book, isVisionMode])

  const current = sentences[currentIdx]
  const currentSentence = current?.sentence || ''
  const keyword = current?.keyword || ''
  const progress = sentences.length > 0 ? Math.round((currentIdx / sentences.length) * 100) : 0
  const elapsed = Math.floor((Date.now() - startTime) / 1000)
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const seconds = String(elapsed % 60).padStart(2, '0')

  const speak = useCallback((text: string) => {
    if (!text) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'
    u.rate = 0.85
    u.pitch = 1.1
    speechSynthesis.speak(u)
  }, [])

  const goNext = useCallback(() => {
    if (currentIdx < sentences.length - 1) {
      setCurrentIdx(i => i + 1)
      setTyped('')
      setFeedback(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [currentIdx, sentences.length])

  const goPrev = useCallback(() => {
    if (currentIdx > 0) {
      setCurrentIdx(i => i - 1)
      setTyped('')
      setFeedback(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [currentIdx])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTyped(val)
    if (val === currentSentence) {
      setFeedback('correct')
      setTimeout(() => goNext(), 800)
    }
    if (val.length === currentSentence.length && val !== currentSentence) {
      setErrors(err => err + 1)
    }
  }, [currentSentence, goNext])

  function handleListen() {
    if (isListening) { recognitionRef.current?.stop(); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'ko-KR'
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript.trim()
      setIsListening(false)
      const isCorrect = text.includes(keyword) || currentSentence.includes(text)
      setFeedback(isCorrect ? 'correct' : 'wrong')
      if (isCorrect) setTimeout(() => goNext(), 1200)
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)
    recognitionRef.current = rec
    setFeedback(null)
    setIsListening(true)
    rec.start()
  }

  useEffect(() => {
    if (mode !== 'type' || isVisionTyping) return
    function onKeyDown(e: KeyboardEvent) {
      const code = e.code.replace('Key', '').toLowerCase()
      const mapped = KEY_MAP[code] || KEY_MAP[e.key.toLowerCase()] || ''
      if (mapped) {
        setLastKey(mapped)
        setTimeout(() => setLastKey(''), 300)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isVisionTyping, mode])

  useEffect(() => {
    if (mode === 'type' && !isVisionTyping) inputRef.current?.focus()
  }, [currentIdx, isVisionTyping, mode])

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

  if (isVisionTyping) {
    return (
      <div className="study-sentence vision-type">
        <div className="ss-content-area">
          <div className="ss-left">
            <div className="ss-speech-bubble">문장을 점자로 쳐봐!</div>
            <img src="/svg/숭이.png" alt="" className="ss-monkey" />
          </div>

          <div className="ss-right">
            <button className="ss-arrow" onClick={goPrev} disabled={currentIdx === 0}>‹</button>

            <div className="ss-card vision-braille-card">
              <p className="ss-sentence">
                {currentSentence.split(keyword).map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && <mark className="ss-keyword">{keyword}</mark>}
                  </span>
                ))}
              </p>

              <SentenceBrailleInput
                currentSentence={currentSentence}
                speak={speak}
                onInput={() => setFeedback(null)}
                onCorrect={() => {
                  setFeedback('correct')
                  speak('정확해요. 다음 문장으로 넘어갈게요.')
                  setTimeout(() => goNext(), 1200)
                }}
                onWrong={() => {
                  setFeedback('wrong')
                  speak('조금 달라요. 지우고 다시 입력해 보세요.')
                }}
              />

              {feedback && (
                <div className={`ss-feedback ${feedback}`}>
                  {feedback === 'correct' ? '정확해요!' : '다시 해봐요!'}
                </div>
              )}

              <div className="ss-progress">{currentIdx + 1}/{sentences.length}</div>
            </div>

            <button className="ss-arrow" onClick={goNext} disabled={currentIdx >= sentences.length - 1}>›</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="study-typing" onClick={() => mode === 'type' && inputRef.current?.focus()}>
      <div className="st-top">
        <button className="st-home-button" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        </button>
      </div>

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
            {feedback === 'correct' ? '정확해요!' : '다시 해봐요!'}
          </div>
        )}
      </div>

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
