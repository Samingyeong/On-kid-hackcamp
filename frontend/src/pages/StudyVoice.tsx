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
  const [transcript, setTranscript] = useState('')
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

  const speak = useCallback((text: string) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'
    u.rate = 0.9
    u.pitch = 1.2
    speechSynthesis.speak(u)
  }, [])

  function handleListen() {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }
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
      const heard = texts[0] || ''
      setTranscript(heard)
      setIsListening(false)

      const isCorrect = texts.some(
        (t: string) => t === currentWord || t.includes(currentWord) || currentWord.includes(t)
      )

      if (isCorrect) {
        setFeedback('correct')
        speak('정확해요! 잘했어!')
      } else {
        setFeedback('wrong')
        speak('다시 한번 말해봐요!')
      }
    }

    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)

    recognitionRef.current = rec
    setTranscript('')
    setFeedback(null)
    setIsListening(true)
    rec.start()
  }

  function handleNext() {
    if (currentIdx < words.length - 1) {
      setCurrentIdx(i => i + 1)
      setFeedback(null)
      setTranscript('')
    }
  }

  function handleRepeat() {
    speak(currentWord)
  }

  if (!supported) {
    return (
      <div className="study-voice">
        <div className="sv-main">
          <p>이 브라우저는 음성 인식을 지원하지 않아요. Chrome을 사용해주세요.</p>
          <button className="sv-back" onClick={() => navigate(-1)}>← 돌아가기</button>
        </div>
      </div>
    )
  }

  if (words.length === 0) {
    return (
      <div className="study-voice">
        <div className="sv-main">
          <p>모르는 단어가 없어요! 동화를 읽으면서 "몰라요"를 눌러보세요.</p>
          <button className="sv-back" onClick={() => navigate(-1)}>← 돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="study-voice">
      <div className="sv-top">
        <div className="sv-word-display">
          <span className="sv-word-label">따라 말해보세요</span>
          <span className="sv-word">{currentWord}</span>
        </div>
        <button className="sv-repeat-btn" onClick={handleRepeat}>다시 듣기</button>
      </div>

      <div className="sv-middle">
        {transcript && (
          <div className="sv-transcript">
            <span className="sv-transcript-label">내가 말한 것</span>
            <span className="sv-transcript-text">{transcript}</span>
          </div>
        )}

        {feedback && (
          <div className={`sv-feedback ${feedback}`}>
            {feedback === 'correct' ? '🎉 정확해요!' : '😊 다시 해봐요!'}
          </div>
        )}
      </div>

      <div className="sv-bottom">
        <button className={`sv-mic-btn ${isListening ? 'listening' : ''}`} onClick={handleListen}>
          {isListening ? '듣는 중...' : '🎤 말하기'}
        </button>
        <div className="sv-nav">
          <button className="sv-next-btn" onClick={handleNext} disabled={currentIdx >= words.length - 1}>
            다음 단어 →
          </button>
          <span className="sv-progress">{currentIdx + 1} / {words.length}</span>
        </div>
      </div>
    </div>
  )
}
