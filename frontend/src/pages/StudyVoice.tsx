import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchStudyWords } from '../api/library'
import './StudyVoice.css'

export default function StudyVoice() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const book = params.get('book') || ''

  const [words, setWords] = useState<string[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [supported, setSupported] = useState(true)

  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) setSupported(false)
  }, [])

  useEffect(() => {
    fetchStudyWords(0)
      .then(list => {
        const filtered = book ? list.filter(w => w.from_book === book) : list
        setWords(filtered.map(w => w.base_form))
      })
      .catch(() => setWords([]))
  }, [book])

  const currentWord = words[currentIdx] || ''
  const chars = currentWord.split('')

  const speak = useCallback((text: string) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'
    u.rate = 0.85
    u.pitch = 1.1
    speechSynthesis.speak(u)
  }, [])

  function handleListen() {
    if (isListening) { recognitionRef.current?.stop(); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.lang = 'ko-KR'
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 3

    rec.onresult = (e: any) => {
      const results = Array.from(e.results[0]) as any[]
      const texts = results.map((r: any) => r.transcript.trim())
      setIsListening(false)

      const isCorrect = texts.some(
        (t: string) => t === currentWord || t.includes(currentWord) || currentWord.includes(t)
      )
      setFeedback(isCorrect ? 'correct' : 'wrong')
      speak(isCorrect ? '정확해요! 잘했어!' : '다시 한번 말해봐요!')
    }

    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)

    recognitionRef.current = rec
    setFeedback(null)
    setIsListening(true)
    rec.start()
  }

  function handlePrev() {
    if (currentIdx > 0) { setCurrentIdx(i => i - 1); setFeedback(null) }
  }
  function handleNext() {
    if (currentIdx < words.length - 1) { setCurrentIdx(i => i + 1); setFeedback(null) }
  }

  if (!supported) {
    return (
      <div className="study-voice"><div className="sv-empty">
        <p>Chrome 브라우저를 사용해주세요.</p>
        <button onClick={() => navigate(-1)}>← 돌아가기</button>
      </div></div>
    )
  }
  if (words.length === 0) {
    return (
      <div className="study-voice"><div className="sv-empty">
        <p>모르는 단어가 없어요! 동화를 읽으면서 "몰라요"를 눌러보세요.</p>
        <button onClick={() => navigate(-1)}>← 돌아가기</button>
      </div></div>
    )
  }

  return (
    <div className="study-voice">
      <div className="sv-content-area">
        {/* 왼쪽: 원숭이 + 말풍선 */}
        <div className="sv-left">
          <div className="sv-speech-bubble">한번 따라 말해볼까?</div>
          <img
            src={isListening ? '/svg/speakmonkey2.png' : '/svg/speakmonkey.png'}
            alt="원숭이"
            className="sv-monkey"
          />
        </div>

        {/* 오른쪽: 메인 */}
        <div className="sv-right">
          {/* 큰 단어 */}
          <div className="sv-word-big">{currentWord}</div>

          {/* 글자 박스 */}
          <div className="sv-chars-section">
            <button className="sv-arrow" onClick={handlePrev} disabled={currentIdx === 0}>‹</button>
            <div className="sv-chars">
              {chars.map((ch, i) => (
                <div key={i} className={`sv-char ${feedback === 'correct' ? 'correct' : 'active-char'}`}>{ch}</div>
              ))}
            </div>
            <button className="sv-arrow" onClick={handleNext} disabled={currentIdx >= words.length - 1}>›</button>
          </div>

          {/* 버튼 */}
          <div className="sv-actions">
            <button className="sv-btn" onClick={() => speak(currentWord)}>다시 듣기</button>
            <button className={`sv-btn primary ${isListening ? 'listening' : ''}`} onClick={handleListen}>
              {isListening ? '듣는 중...' : '말하기'}
            </button>
          </div>

          {/* 피드백 */}
          {feedback && (
            <div className={`sv-feedback ${feedback}`}>
              {feedback === 'correct' ? '정확해요!' : '다시 해봐요!'}
            </div>
          )}

          {/* 진행도 */}
          <div className="sv-progress-row">
            <span className="sv-progress-dot" />
            <span className="sv-progress-text">{currentIdx + 1}/{words.length}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
