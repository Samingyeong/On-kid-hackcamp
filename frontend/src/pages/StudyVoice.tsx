import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchStudyWords, type StudyWord } from '../api/library'
import './StudyVoice.css'
import FeedbackChat from '../components/FeedbackChat'

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

const DEMO_WORDS: StudyWord[] = [
  { id: -1, word: '주인', base_form: '주인', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -2, word: '누렁이', base_form: '누렁이', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -3, word: '강아지', base_form: '강아지', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -4, word: '성큼성큼', base_form: '성큼성큼', pos: 'ADV', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -5, word: '부리', base_form: '부리', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -6, word: '마당', base_form: '마당', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -7, word: '친구', base_form: '친구', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -8, word: '울타리', base_form: '울타리', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -9, word: '꼬리', base_form: '꼬리', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -10, word: '아침', base_form: '아침', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -11, word: '노래', base_form: '노래', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -12, word: '약속', base_form: '약속', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
]

export default function StudyVoice() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const book = params.get('book') || ''

  const [words, setWords] = useState<StudyWord[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) setSupported(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    fetchStudyWords(0)
      .then(list => {
        if (cancelled) return
        const filtered = book ? list.filter(word => word.from_book === book) : list
        setWords(filtered.length > 0 ? filtered : DEMO_WORDS)
        setCurrentIdx(filtered.length > 0 ? 0 : 2)
      })
      .catch(() => {
        if (cancelled) return
        setWords(DEMO_WORDS)
        setCurrentIdx(2)
      })

    return () => {
      cancelled = true
      recognitionRef.current?.stop()
    }
  }, [book])

  const currentWord = words[currentIdx]?.base_form || ''
  const chars = currentWord.split('')

  const speak = useCallback((text: string) => {
    if (!text || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    utterance.rate = 0.85
    utterance.pitch = 1.1
    window.speechSynthesis.speak(utterance)
  }, [])

  function handleListen() {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }

    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Recognition || !currentWord) return

    const recognition = new Recognition()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 3

    recognition.onresult = event => {
      const result = event.results[0]
      const heard = Array.from({ length: result.length }, (_, index) => result[index]?.transcript.trim() || '')
      const isCorrect = heard.some(text => text === currentWord || text.includes(currentWord) || currentWord.includes(text))
      setIsListening(false)
      setFeedback(isCorrect ? 'correct' : 'wrong')
      speak(isCorrect ? '정확해요! 아주 잘했어요!' : '다시 한번 말해봐요!')
    }

    recognition.onerror = () => {
      setIsListening(false)
      setFeedback('wrong')
    }
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    setFeedback(null)
    setIsListening(true)
    recognition.start()
  }

  function handlePrev() {
    if (currentIdx <= 0) return
    setCurrentIdx(index => index - 1)
    setFeedback(null)
  }

  function handleNext() {
    if (currentIdx >= words.length - 1) return
    setCurrentIdx(index => index + 1)
    setFeedback(null)
  }

  if (!supported) {
    return (
      <div className="study-voice">
        <div className="sv-empty">
          <p>Chrome 브라우저를 사용해주세요.</p>
          <button type="button" onClick={() => navigate(-1)}>돌아가기</button>
        </div>
      </div>
    )
  }

  if (words.length === 0) {
    return (
      <div className="study-voice">
        <div className="sv-empty">
          <p>모르는 단어가 없어요! 동화를 읽으면서 "몰라요"를 눌러보세요.</p>
          <button type="button" onClick={() => navigate(-1)}>돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="study-voice">
      <header className="sv-topbar">
        <button className="sv-home-button" type="button" onClick={() => navigate('/')} aria-label="홈으로 이동">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 11.2 12 4l8 7.2v8.6a1 1 0 0 1-1 1h-5.1v-6.2h-3.8v6.2H5a1 1 0 0 1-1-1v-8.6Z" />
          </svg>
        </button>
        <img className="sv-logo" src="/svg/logo.png" alt="on-kid" />
        <div className="sv-profile" aria-label="사용자 정보">
          <span className="sv-profile-name">사민경</span>
          <span className="sv-profile-type">어린이</span>
          <img src="/svg/initmonkey.png" alt="" className="sv-profile-avatar" />
        </div>
      </header>

      <main className="sv-stage">
        <section className="sv-character-panel" aria-live="polite">
          <div className="sv-speech-bubble">{isListening ? '응응 듣고있어!' : '한번 따라 말해볼까?'}</div>
          <img
            src={isListening ? '/svg/speakmonkey2.png' : '/svg/speakmonkey.png'}
            alt="따라말하기 캐릭터"
            className="sv-monkey"
          />
        </section>

        <section className="sv-word-panel" aria-label="따라말하기 단어">
          <button className="sv-arrow previous" type="button" onClick={handlePrev} disabled={currentIdx === 0} aria-label="이전 단어">
            ‹
          </button>
          <div className="sv-card">
            <div className="sv-char-row" aria-label={`목표 단어 ${currentWord}`}>
              {chars.map((char, index) => (
                <div key={`${char}-${index}`} className={`sv-char-cell ${feedback === 'correct' ? 'correct' : ''}`}>
                  {char}
                </div>
              ))}
            </div>

            <div className="sv-actions">
              <button className="sv-listen-button" type="button" onClick={() => speak(currentWord)} aria-label="단어 다시 듣기">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9.2v5.6h4.2L13.3 19V5L8.2 9.2H4Zm12.1-.7a1.2 1.2 0 0 0-1.7 1.7 2.5 2.5 0 0 1 0 3.6 1.2 1.2 0 1 0 1.7 1.7 4.9 4.9 0 0 0 0-7Zm2.7-2.8a1.2 1.2 0 0 0-1.7 1.7 6.5 6.5 0 0 1 0 9.2 1.2 1.2 0 1 0 1.7 1.7 8.9 8.9 0 0 0 0-12.6Z" />
                </svg>
              </button>
              <button className={`sv-mic-button ${isListening ? 'listening' : ''}`} type="button" onClick={handleListen}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 14.4a3.3 3.3 0 0 0 3.3-3.3V6.3a3.3 3.3 0 0 0-6.6 0v4.8a3.3 3.3 0 0 0 3.3 3.3Zm5.7-3.3a1.2 1.2 0 0 0-2.4 0 3.3 3.3 0 1 1-6.6 0 1.2 1.2 0 0 0-2.4 0 5.7 5.7 0 0 0 4.5 5.6v2.1H8.9a1.2 1.2 0 1 0 0 2.4h6.2a1.2 1.2 0 1 0 0-2.4h-1.9v-2.1a5.7 5.7 0 0 0 4.5-5.6Z" />
                </svg>
                {isListening ? '듣는 중...' : '눌러서 말하기'}
              </button>
            </div>

            {feedback && (
              <div className={`sv-feedback ${feedback}`} aria-live="assertive">
                {feedback === 'correct' ? '정확해요!' : '다시 해봐요!'}
              </div>
            )}
          </div>
          <button className="sv-arrow next" type="button" onClick={handleNext} disabled={currentIdx >= words.length - 1} aria-label="다음 단어">
            ›
          </button>
        </section>

        <div className="sv-progress" aria-label={`진행 ${currentIdx + 1}/${words.length}`}>
          {currentIdx + 1}/{words.length}
        </div>
      </main>
    </div>
  )
}
