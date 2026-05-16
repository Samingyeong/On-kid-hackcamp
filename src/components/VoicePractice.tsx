/**
 * VoicePractice.tsx
 * 음성 따라말하기 연습 컴포넌트
 * Web Speech API SpeechRecognition 사용
 */

import { useState, useRef, useCallback, useEffect } from 'react'

// ── SpeechRecognition 타입 선언 (브라우저 벤더 접두사 대응) ──
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}

const PRACTICE_WORDS = [
  '주인',
  '부리부리하다',
  '누렁이',
  '성큼성큼',
]

interface VoicePracticeProps {
  speakIfOn: (text: string, rate?: number, pitch?: number) => void
  muted: boolean
}

export default function VoicePractice({ speakIfOn }: VoicePracticeProps) {
  const [targetWord, setTargetWord] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [started, setStarted] = useState(false)
  const [supported, setSupported] = useState(true)

  const wordIndexRef = useRef(0)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // SpeechRecognition 지원 여부 확인
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) setSupported(false)
  }, [])

  // 인식 엔진 초기화
  const createRecognition = useCallback((): SpeechRecognitionInstance | null => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return null

    const rec = new SR()
    rec.lang = 'ko-KR'
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 3

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const results = Array.from(e.results[0]!) as SpeechRecognitionAlternative[]
      const texts = results.map((r) => r.transcript.trim())
      const heard = texts[0] ?? ''

      setTranscript(heard)
      setIsListening(false)

      // 정확도 판단: 완전 일치 or 목표 단어 포함
      const current = PRACTICE_WORDS[wordIndexRef.current]!
      const isCorrect = texts.some(
        (t) => t === current || t.includes(current) || current.includes(t)
      )

      if (isCorrect) {
        setFeedback('correct')
        speakIfOn('정확해요! 아주 잘했어요!', 0.9, 1.3)
      } else {
        setFeedback('wrong')
        speakIfOn('다시 한번 말해주세요!', 0.88, 1.1)
      }
    }

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsListening(false)
      if (e.error === 'no-speech') {
        speakIfOn('소리가 들리지 않아요. 다시 말해봐요!', 0.9, 1.1)
      } else if (e.error === 'not-allowed') {
        speakIfOn('마이크 권한이 필요해요.')
      }
    }

    rec.onend = () => setIsListening(false)

    return rec
  }, [speakIfOn])

  // 단어 시작
  const startWord = useCallback((idx: number) => {
    const word = PRACTICE_WORDS[idx]!
    wordIndexRef.current = idx
    setTargetWord(word)
    setFeedback(null)
    setTranscript('')
    setTimeout(() => speakIfOn(`${word} 라고 말해보세요!`, 0.88, 1.2), 300)
  }, [speakIfOn])

  const handleStart = useCallback(() => {
    setStarted(true)
    startWord(0)
  }, [startWord])

  const handleNext = useCallback(() => {
    const idx = (wordIndexRef.current + 1) % PRACTICE_WORDS.length
    startWord(idx)
  }, [startWord])

  // 마이크 시작
  const handleListen = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }
    const rec = createRecognition()
    if (!rec) return
    recognitionRef.current = rec
    setTranscript('')
    setFeedback(null)
    setIsListening(true)
    rec.start()
  }, [isListening, createRecognition])

  // 목표 단어 다시 듣기
  const handleRepeat = useCallback(() => {
    const word = PRACTICE_WORDS[wordIndexRef.current]!
    speakIfOn(`${word}`, 0.85, 1.1)
  }, [speakIfOn])

  if (!supported) {
    return (
      <div className="w-full max-w-2xl rounded-2xl border-4 border-yellow-700 bg-black p-6 text-center">
        <p className="text-yellow-600 text-xl">
          이 브라우저는 음성 인식을 지원하지 않아요.
          <br />
          <span className="text-yellow-400">Chrome 브라우저</span>를 사용해주세요.
        </p>
      </div>
    )
  }

  if (!started) {
    return (
      <button
        onClick={handleStart}
        aria-label="음성 연습 모드 시작"
        className="
          w-full max-w-2xl py-4 rounded-2xl
          border-4 border-yellow-400 bg-black
          text-yellow-400 font-black text-2xl
          hover:bg-yellow-400 hover:text-black
          transition-all duration-150
          focus:outline-none focus:ring-4 focus:ring-yellow-300
        "
      >
        🎤 음성 연습 시작
      </button>
    )
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">

      {/* 목표 단어 */}
      <div className="rounded-2xl border-4 border-yellow-400 bg-black p-4 text-center"
        aria-label={`목표 단어: ${targetWord}`}>
        <p className="text-yellow-600 text-lg mb-1">따라 말해보세요</p>
        <p className="text-yellow-400 font-black" style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)' }}>
          {targetWord}
        </p>
        {/* 다시 듣기 버튼 */}
        <button
          onClick={handleRepeat}
          aria-label="목표 단어 다시 듣기"
          className="
            mt-3 px-4 py-2 rounded-xl
            border-2 border-yellow-600 bg-black
            text-yellow-600 text-base font-bold
            hover:bg-yellow-600 hover:text-black
            transition-all duration-150
          "
        >
          🔈 다시 듣기
        </button>
      </div>

      {/* 마이크 버튼 */}
      <button
        onClick={handleListen}
        aria-label={isListening ? '녹음 중지' : '말하기 시작'}
        className={`
          w-full py-6 rounded-2xl border-4 font-black
          transition-all duration-150
          focus:outline-none focus:ring-4 focus:ring-yellow-300
          ${isListening
            ? 'border-red-400 bg-red-950 text-red-400 animate-pulse'
            : 'border-yellow-400 bg-black text-yellow-400 hover:bg-yellow-400 hover:text-black'
          }
        `}
        style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)' }}
      >
        {isListening ? '🔴 듣는 중... (클릭하면 중지)' : '🎤 말하기'}
      </button>

      {/* 인식된 텍스트 */}
      {transcript && (
        <div className="rounded-2xl border-4 border-yellow-700 bg-black p-4 text-center">
          <p className="text-yellow-600 text-base mb-1">내가 말한 것</p>
          <p className="text-yellow-400 font-bold" style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)' }}>
            {transcript}
          </p>
        </div>
      )}

      {/* 피드백 */}
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

      {/* 다음 단어 / 그만하기 */}
      <div className="flex gap-3">
        <button
          onClick={handleNext}
          className="
            flex-1 py-3 rounded-xl
            border-4 border-yellow-400 bg-black
            text-yellow-400 font-black text-xl
            hover:bg-yellow-400 hover:text-black
            transition-all duration-150
            focus:outline-none focus:ring-4 focus:ring-yellow-300
          "
        >
          다음 단어 →
        </button>
        <button
          onClick={() => setStarted(false)}
          className="
            flex-1 py-3 rounded-xl
            border-4 border-yellow-700 bg-black
            text-yellow-700 font-black text-xl
            hover:bg-yellow-700 hover:text-black
            transition-all duration-150
            focus:outline-none focus:ring-4 focus:ring-yellow-600
          "
        >
          그만하기
        </button>
      </div>
    </div>
  )
}
