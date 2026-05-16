/**
 * App.tsx
 * 점자 타자 연습기 메인 컴포넌트
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import BrailleDisplay from './components/BrailleDisplay'
import VoicePractice from './components/VoicePractice'
import AIFeedback from './components/AIFeedback'
import { useBrailleChording } from './hooks/useBrailleChording'
import type { SpecialKey } from './hooks/useBrailleChording'
import {
  dotsToJamo,
  feedJamo,
  previewSyllable,
  commitState,
  isEmptyDots,
  EMPTY_STATE,
} from './utils/brailleConverter'
import type { Dots, HangulState, JamoType } from './utils/brailleConverter'
import { getAIFeedback, getWordHint } from './utils/midmClient'
import type { FeedbackResult } from './utils/midmClient'

// ────────────────────────────────────────────────
// TTS
// ────────────────────────────────────────────────
const PREFERRED_VOICES = [
  'Google 한국의',
  'Microsoft SunHi',
  'Microsoft Heami',
  'Yuna',
]
let cachedVoice: SpeechSynthesisVoice | null = null

function getKoreanVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  for (const name of PREFERRED_VOICES) {
    const found = voices.find((v) => v.name.includes(name) && v.lang.startsWith('ko'))
    if (found) { cachedVoice = found; return found }
  }
  const fallback = voices.find((v) => v.lang.startsWith('ko')) ?? null
  cachedVoice = fallback
  return fallback
}

function speak(text: string, rate = 0.95, pitch = 1.15) {
  if (!window.speechSynthesis || !text) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'ko-KR'
  utter.pitch = pitch
  utter.rate = rate
  utter.volume = 1.0
  const voice = getKoreanVoice()
  if (voice) utter.voice = voice
  window.speechSynthesis.speak(utter)
}

if (typeof window !== 'undefined') {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null
    getKoreanVoice()
  }
}

// ────────────────────────────────────────────────
// 연습 단어 목록
// ────────────────────────────────────────────────
const PRACTICE_WORDS = [
  '주인',
  '부리부리하다',
  '누렁이',
  '성큼성큼',
]

// ────────────────────────────────────────────────
// 입력 상태
// ────────────────────────────────────────────────
interface InputState {
  committed: string
  composing: HangulState
}

const INITIAL_INPUT: InputState = {
  committed: '',
  composing: EMPTY_STATE,
}

function getNextContext(state: HangulState): JamoType {
  if (!state.cho) return 'chosung'
  if (!state.jung) return 'jungsung'
  if (state.jong2) return 'chosung'
  if (!state.jong) return 'jongsung'
  return 'chosung'
}

// ────────────────────────────────────────────────
// App
// ────────────────────────────────────────────────
export default function App() {
  const [started, setStarted] = useState(false)
  const [dots, setDots] = useState<Dots>([false, false, false, false, false, false])
  const [input, setInput] = useState<InputState>(INITIAL_INPUT)
  const [muted, setMuted] = useState(false)
  const [activeTab, setActiveTab] = useState<'braille' | 'voice'>('braille')

  // AI 피드백 상태
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [aiResult, setAiResult] = useState<FeedbackResult | null>(null)
  const [aiError, setAiError] = useState('')

  // 단어 힌트 상태
  const [hintStatus, setHintStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [hintText, setHintText] = useState('')

  // 연습 모드 상태
  const [practiceMode, setPracticeMode] = useState(false)
  const [targetWord, setTargetWord] = useState('')
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const wordIndexRef = useRef(0)

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mutedRef = useRef(false)

  useEffect(() => {
    mutedRef.current = muted
    if (muted) window.speechSynthesis.cancel()
  }, [muted])

  const preview = previewSyllable(input.composing)
  const displayText = input.committed + preview

  const speakIfOn = useRef((text: string, rate?: number, pitch?: number) => {
    if (mutedRef.current) return
    speak(text, rate, pitch)
  }).current

  // 연습 모드 시작 — 단어 제시
  const startPractice = useCallback(() => {
    const idx = Math.floor(Math.random() * PRACTICE_WORDS.length)
    const word = PRACTICE_WORDS[idx]!
    wordIndexRef.current = idx
    setTargetWord(word)
    setPracticeMode(true)
    setFeedback(null)
    setInput(INITIAL_INPUT)
    setHintStatus('idle')
    setHintText('')
    setTimeout(() => speakIfOn(`${word} 를 입력해보세요!`, 0.88, 1.2), 300)
  }, [])

  // 단어 힌트 요청
  const handleHint = useCallback(async () => {
    if (!targetWord || hintStatus === 'loading') return
    setHintStatus('loading')
    setHintText('')
    try {
      const hint = await getWordHint(targetWord)
      setHintText(hint)
      setHintStatus('done')
      setTimeout(() => speakIfOn(hint, 0.88, 1.1), 0)
    } catch {
      setHintStatus('idle')
    }
  }, [targetWord, hintStatus, speakIfOn])

  // 다음 단어
  const nextWord = useCallback(() => {    const idx = (wordIndexRef.current + 1) % PRACTICE_WORDS.length
    const word = PRACTICE_WORDS[idx]!
    wordIndexRef.current = idx
    setTargetWord(word)
    setFeedback(null)
    setInput(INITIAL_INPUT)
    setTimeout(() => speakIfOn(`${word} 를 입력해보세요!`, 0.88, 1.2), 300)
  }, [])

  // ── 무반응 5초 안내 타이머 ──
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    if (!started) return
    idleTimerRef.current = setTimeout(() => {
      if (practiceMode && targetWord) {
        speakIfOn(`${targetWord} 를 입력해보세요!`, 0.9, 1.15)
      } else {
        speakIfOn('무엇을 써볼까요? 숫자패드 7, 8, 4, 5, 1, 2번 키를 눌러보세요.', 0.9, 1.15)
      }
    }, 5000)
  }, [started, practiceMode, targetWord])

  useEffect(() => {
    if (started) resetIdleTimer()
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current) }
  }, [started, resetIdleTimer])

  // ── 점자 조합 처리 ──
  const handleChord = useCallback((newDots: Dots) => {
    resetIdleTimer()
    if (isEmptyDots(newDots)) return

    setInput((prev) => {
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
      const currentPreview = previewSyllable(newState)
      setTimeout(() => speakIfOn(currentPreview || jamo!), 0)

      return {
        committed: prev.committed + newCommitted,
        composing: newState,
      }
    })
  }, [resetIdleTimer])

  // ── 특수키 처리 ──
  const handleSpecial = useCallback((key: SpecialKey) => {
    resetIdleTimer()

    if (key === 'space') {
      setInput((prev) => {
        const commit = commitState(prev.composing)
        setTimeout(() => speakIfOn('띄어쓰기'), 0)
        return { committed: prev.committed + commit + ' ', composing: EMPTY_STATE }
      })
    }

    if (key === 'readAll') {
      setInput((prev) => {
        const commit = commitState(prev.composing)
        const fullText = (prev.committed + commit).trim()

        if (practiceMode && targetWord) {
          // 연습 모드: 정답 체크
          setTimeout(() => {
            if (fullText === targetWord) {
              setFeedback('correct')
              speakIfOn('잘했어요! 정말 잘했어요!', 0.9, 1.3)
            } else {
              setFeedback('wrong')
              speakIfOn(`아쉬워요. ${targetWord} 예요. 다시 해봐요!`, 0.88, 1.1)
            }
          }, 0)
        } else {
          // 일반 모드: 전체 읽기 + AI 피드백
          setTimeout(async () => {
            if (fullText) {
              speakIfOn(fullText, 0.88, 1.1)
              // AI 피드백 요청
              setAiStatus('loading')
              setAiResult(null)
              setAiError('')
              try {
                const result = await getAIFeedback(fullText)
                setAiResult(result)
                setAiStatus('done')
                // 피드백 TTS로 읽기 (문장 읽기 끝난 후 약간 딜레이)
                setTimeout(() => speakIfOn(result.message, 0.88, 1.1), 1500)
              } catch (err) {
                const msg = err instanceof Error ? err.message : '알 수 없는 오류'
                setAiError(msg)
                setAiStatus('error')
              }
            } else {
              speakIfOn('아직 입력된 문장이 없어요.')
            }
          }, 0)
        }

        return { committed: prev.committed + commit, composing: EMPTY_STATE }
      })
    }

    if (key === 'delete') {
      setTimeout(() => speakIfOn('지워졌어요'), 0)
      setAiStatus('idle')
      setAiResult(null)
      setInput((prev) => {
        const c = prev.composing
        if (c.jong2) {
          const firstJong: Record<string, string> = {
            'ㄳ':'ㄱ','ㄵ':'ㄴ','ㄶ':'ㄴ','ㄺ':'ㄹ','ㄻ':'ㄹ',
            'ㄼ':'ㄹ','ㄽ':'ㄹ','ㄾ':'ㄹ','ㄿ':'ㄹ','ㅀ':'ㄹ','ㅄ':'ㅂ',
          }
          return { ...prev, composing: { ...c, jong: firstJong[c.jong] ?? c.jong, jong2: '' } }
        }
        if (c.jong) return { ...prev, composing: { ...c, jong: '', jong2: '' } }
        if (c.jung) return { ...prev, composing: { ...c, jung: '' } }
        if (c.cho) return { ...prev, composing: EMPTY_STATE }
        return { committed: prev.committed.slice(0, -1), composing: EMPTY_STATE }
      })
    }
  }, [resetIdleTimer, practiceMode, targetWord])

  const handleDotsChange = useCallback((newDots: Dots) => {
    setDots(newDots)
  }, [])

  useBrailleChording({
    onChord: handleChord,
    onSpecial: handleSpecial,
    onDotsChange: handleDotsChange,
  })

  // ────────────────────────────────────────────────
  // 시작 화면
  // ────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <button
          onClick={() => {
            setStarted(true)
            speak('점자 타자 연습을 시작합니다. 숫자패드 7, 8, 4, 5, 1, 2번 키를 눌러 점자를 입력하세요.', 0.9, 1.15)
          }}
          aria-label="점자 타자 연습 시작하기"
          className="
            w-full max-w-2xl min-h-[60vh]
            bg-black border-8 border-yellow-400
            rounded-3xl flex flex-col items-center justify-center gap-8
            cursor-pointer transition-all duration-200
            hover:bg-yellow-400 hover:text-black
            focus:outline-none focus:ring-8 focus:ring-yellow-300
            group
          "
        >
          <span className="text-yellow-400 group-hover:text-black transition-colors"
            style={{ fontSize: '8rem', lineHeight: 1 }} aria-hidden="true">⠿</span>
          <span className="text-yellow-400 group-hover:text-black font-black text-center transition-colors"
            style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}>
            점자 타자 연습<br />시작하기
          </span>
          <span className="text-yellow-600 group-hover:text-yellow-900 text-xl text-center transition-colors">
            이 버튼을 누르면 음성 안내가 시작됩니다
          </span>
        </button>
      </div>
    )
  }

  // ────────────────────────────────────────────────
  // 메인 입력 화면
  // ────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-black flex flex-col items-center py-8 px-4 gap-6"
      aria-label="점자 타자 연습 메인 화면">

      {/* 우측 상단 볼륨 토글 */}
      <button
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? '음소거 해제' : '음소거'}
        title={muted ? '음소거 해제' : '음소거'}
        className="
          fixed top-4 right-4 z-50
          w-14 h-14 rounded-full
          border-4 border-yellow-400 bg-black
          flex items-center justify-center
          text-yellow-400 text-2xl
          hover:bg-yellow-400 hover:text-black
          transition-all duration-150
          focus:outline-none focus:ring-4 focus:ring-yellow-300
        "
      >
        {muted ? '🔇' : '🔊'}
      </button>

      <h1 className="text-yellow-400 font-black text-center"
        style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)' }}>
        ⠿ 점자 타자 연습기
      </h1>

      {/* ── 탭 전환 ── */}
      <div className="w-full max-w-2xl flex gap-2">
        <button
          onClick={() => setActiveTab('braille')}
          aria-label="점자 입력 연습 탭"
          className={`
            flex-1 py-3 rounded-xl border-4 font-black text-xl
            transition-all duration-150
            focus:outline-none focus:ring-4 focus:ring-yellow-300
            ${activeTab === 'braille'
              ? 'border-yellow-400 bg-yellow-400 text-black'
              : 'border-yellow-700 bg-black text-yellow-700 hover:border-yellow-400 hover:text-yellow-400'}
          `}
        >
          ⠿ 점자 연습
        </button>
        <button
          onClick={() => setActiveTab('voice')}
          aria-label="음성 따라말하기 연습 탭"
          className={`
            flex-1 py-3 rounded-xl border-4 font-black text-xl
            transition-all duration-150
            focus:outline-none focus:ring-4 focus:ring-yellow-300
            ${activeTab === 'voice'
              ? 'border-yellow-400 bg-yellow-400 text-black'
              : 'border-yellow-700 bg-black text-yellow-700 hover:border-yellow-400 hover:text-yellow-400'}
          `}
        >
          🎤 음성 연습
        </button>
      </div>

      {/* ── 점자 연습 탭 ── */}
      {activeTab === 'braille' && (
        <>
          <div className="w-full max-w-2xl flex flex-col gap-4">
            {!practiceMode ? (
              <button
                onClick={startPractice}
                aria-label="단어 연습 모드 시작"
                className="
                  w-full py-4 rounded-2xl
                  border-4 border-yellow-400 bg-black
                  text-yellow-400 font-black text-2xl
                  hover:bg-yellow-400 hover:text-black
                  transition-all duration-150
                  focus:outline-none focus:ring-4 focus:ring-yellow-300
                "
              >
                🎯 단어 연습 시작
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="w-full rounded-2xl border-4 border-yellow-400 bg-black p-4 text-center"
                  aria-label={`목표 단어: ${targetWord}`}>
                  <p className="text-yellow-600 text-lg mb-1">목표 단어</p>
                  <p className="text-yellow-400 font-black" style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)' }}>
                    {targetWord}
                  </p>
                  {/* 힌트 버튼 */}
                  <button
                    onClick={handleHint}
                    disabled={hintStatus === 'loading'}
                    aria-label="단어 힌트 보기"
                    className="mt-3 px-4 py-2 rounded-xl border-2 border-yellow-600 bg-black text-yellow-600 text-base font-bold hover:bg-yellow-600 hover:text-black transition-all duration-150 disabled:opacity-50"
                  >
                    {hintStatus === 'loading' ? '💭 힌트 준비 중...' : '💡 힌트 보기'}
                  </button>
                </div>

                {/* 힌트 표시 */}
                {hintStatus === 'done' && hintText && (
                  <div className="rounded-2xl border-4 border-yellow-600 bg-black p-4"
                    aria-live="polite">
                    <p className="text-yellow-600 text-sm font-bold mb-1">💡 힌트</p>
                    <p className="text-yellow-400 font-bold leading-relaxed"
                      style={{ fontSize: 'clamp(1rem, 3vw, 1.3rem)' }}>
                      {hintText}
                    </p>
                  </div>
                )}
                {feedback && (
                  <div
                    className={`
                      w-full rounded-2xl border-4 p-4 text-center font-black
                      ${feedback === 'correct'
                        ? 'border-green-400 bg-green-950 text-green-400'
                        : 'border-red-400 bg-red-950 text-red-400'}
                    `}
                    style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}
                    aria-live="assertive"
                  >
                    {feedback === 'correct' ? '🎉 잘했어요!' : '😊 아쉬워요!'}
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={nextWord}
                    className="flex-1 py-3 rounded-xl border-4 border-yellow-400 bg-black text-yellow-400 font-black text-xl hover:bg-yellow-400 hover:text-black transition-all duration-150 focus:outline-none focus:ring-4 focus:ring-yellow-300">
                    다음 단어 →
                  </button>
                  <button onClick={() => { setPracticeMode(false); setFeedback(null); setTargetWord(''); setInput(INITIAL_INPUT) }}
                    className="flex-1 py-3 rounded-xl border-4 border-yellow-700 bg-black text-yellow-700 font-black text-xl hover:bg-yellow-700 hover:text-black transition-all duration-150 focus:outline-none focus:ring-4 focus:ring-yellow-600">
                    그만하기
                  </button>
                </div>
              </div>
            )}
          </div>

          <BrailleDisplay dots={dots} text={displayText} preview="" />

          {practiceMode && (
            <p className="text-yellow-700 text-center text-lg">
              입력 후 <span className="text-yellow-400 font-bold">Numpad Enter</span> 를 누르면 정답을 확인해요
            </p>
          )}

          {/* AI 피드백 (일반 모드에서만 표시) */}
          {!practiceMode && (
            <AIFeedback status={aiStatus} result={aiResult} errorMsg={aiError} />
          )}
        </>
      )}

      {/* ── 음성 연습 탭 ── */}
      {activeTab === 'voice' && (
        <VoicePractice speakIfOn={speakIfOn} muted={muted} />
      )}

    </main>
  )
}
