import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchStudySentences } from '../api/library'
import './StudySentence.css'

export default function StudySentence() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const book = params.get('book') || ''
  const mode = params.get('mode') || 'type' // type | speak

  const [sentences, setSentences] = useState<{ sentence: string; keyword: string }[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [typed, setTyped] = useState('')
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

  const speak = useCallback((text: string) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'; u.rate = 0.85; u.pitch = 1.1
    speechSynthesis.speak(u)
  }, [])

  // 타자치기 모드
  function handleTypingInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setTyped(val)
    if (val === currentSentence) {
      setFeedback('correct')
      setTimeout(() => goNext(), 1000)
    }
  }

  // 따라말하기 모드
  function handleListen() {
    if (isListening) { recognitionRef.current?.stop(); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.lang = 'ko-KR'; rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 3
    rec.onresult = (e: any) => {
      const texts = Array.from(e.results[0]).map((r: any) => r.transcript.trim())
      setIsListening(false)
      // 핵심 단어가 포함되어 있으면 정답
      const isCorrect = texts.some((t: string) => t.includes(keyword) || currentSentence.includes(t))
      setFeedback(isCorrect ? 'correct' : 'wrong')
      speak(isCorrect ? '잘했어!' : '다시 해봐요!')
      if (isCorrect) setTimeout(() => goNext(), 1500)
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)
    recognitionRef.current = rec
    setFeedback(null)
    setIsListening(true)
    rec.start()
  }

  function goNext() {
    if (currentIdx < sentences.length - 1) {
      setCurrentIdx(i => i + 1)
      setTyped(''); setFeedback(null)
    }
  }
  function goPrev() {
    if (currentIdx > 0) {
      setCurrentIdx(i => i - 1)
      setTyped(''); setFeedback(null)
    }
  }

  useEffect(() => { if (mode === 'type') inputRef.current?.focus() }, [currentIdx, mode])

  if (sentences.length === 0) {
    return (
      <div className="study-sentence">
        <div className="ss-empty">
          <p>모르는 단어가 포함된 문장이 없어요.<br/>동화를 읽으면서 "몰라요"를 눌러보세요!</p>
          <button onClick={() => navigate(-1)}>← 돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="study-sentence" onClick={() => mode === 'type' && inputRef.current?.focus()}>
      <div className="ss-content-area">
        {/* 왼쪽: 원숭이 */}
        <div className="ss-left">
          <div className="ss-speech-bubble">문장을 {mode === 'type' ? '따라 쳐봐!' : '따라 말해봐!'}</div>
          <img src="/svg/숭이.png" alt="" className="ss-monkey" />
        </div>

        {/* 오른쪽: 문장 카드 */}
        <div className="ss-right">
          <button className="ss-arrow" onClick={goPrev} disabled={currentIdx === 0}>‹</button>

          <div className="ss-card">
            {/* 문장 표시 (핵심 단어 하이라이트) */}
            <p className="ss-sentence">
              {currentSentence.split(keyword).map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && <mark className="ss-keyword">{keyword}</mark>}
                </span>
              ))}
            </p>

            {/* 타자치기 모드 */}
            {mode === 'type' && (
              <div className="ss-typing-area">
                <input
                  ref={inputRef}
                  className="ss-typing-input"
                  value={typed}
                  onChange={handleTypingInput}
                  placeholder="문장을 입력하세요"
                  autoFocus
                />
              </div>
            )}

            {/* 따라말하기 모드 */}
            {mode === 'speak' && (
              <div className="ss-speak-area">
                <button className="ss-listen-btn" onClick={() => speak(currentSentence)}>🔊</button>
                <button className={`ss-mic-btn ${isListening ? 'listening' : ''}`} onClick={handleListen}>
                  🎤 {isListening ? '듣는 중...' : '눌러서 말하기'}
                </button>
              </div>
            )}

            {/* 피드백 */}
            {feedback && (
              <div className={`ss-feedback ${feedback}`}>
                {feedback === 'correct' ? '🎉 정확해요!' : '😊 다시 해봐요!'}
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
