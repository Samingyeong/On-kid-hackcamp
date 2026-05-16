import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchReadingHistory, type ReadHistory } from '../api/library'
import { useAuth } from '../contexts/AuthContext'
import './StudySelect.css'

type StudyMode = {
  id: 'write' | 'type' | 'speak' | 'sign'
  label: string
  bg: string
  monkey: string
}

const MODES: StudyMode[] = [
  {
    id: 'write',
    label: '따라쓰기',
    bg: '/svg/따라쓰기배경.png',
    monkey: '/svg/따라쓰기원숭이.png',
  },
  {
    id: 'type',
    label: '타자치기',
    bg: '/svg/타자치기배경.png',
    monkey: '/svg/타자치기원숭이.png',
  },
  {
    id: 'speak',
    label: '따라말하기',
    bg: '/svg/따라말하기배경.png',
    monkey: '/svg/따라말하기원숭이.png',
  },
  {
    id: 'sign',
    label: '수화하기',
    bg: '/svg/수화하기배경.png',
    monkey: '/svg/수화하기원숭이.png',
  },
]

// 문장학습 모드 (따라쓰기 제외)
const SENTENCE_MODES: StudyMode[] = [
  {
    id: 'type',
    label: '타자치기',
    bg: '/svg/타자치기배경.png',
    monkey: '/svg/타자치기원숭이.png',
  },
  {
    id: 'speak',
    label: '따라말하기',
    bg: '/svg/따라말하기배경.png',
    monkey: '/svg/따라말하기원숭이.png',
  },
  {
    id: 'sign',
    label: '수화하기',
    bg: '/svg/수화하기배경.png',
    monkey: '/svg/수화하기원숭이.png',
  },
]

const DEFAULT_VISION_BOOK = '암탉과 누렁이'

function getVisionPrompt(studyType: string, selectedBook: string) {
  const target = studyType === 'sentence' ? '문장 공부' : '단어 공부'
  return `「${selectedBook}」 ${target}에는 타자치기와 따라말하기가 있어요. 화면을 보지 않고 진행하려면 따라말하기를 추천해요. 무엇을 할까요?`
}

export default function StudySelect() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { childCharacter } = useAuth()
  const studyType = params.get('type') === 'sentence' ? 'sentence' : 'word'
  const bookFromParams = params.get('book') || ''
  const isVisionMode = childCharacter === 'vision'

  const [step, setStep] = useState<'book' | 'mode'>('book')
  const [books, setBooks] = useState<ReadHistory[]>([])
  const [selectedBook, setSelectedBook] = useState<string>('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const promptKeyRef = useRef('')
  const startListeningRef = useRef<() => void>(() => {})
  const speakModePromptRef = useRef<() => void>(() => {})

  useEffect(() => {
    fetchReadingHistory().then(list => {
      // 중복 제거 (같은 제목은 최신 것만)
      const seen = new Set<string>()
      const unique = list.filter(b => {
        if (seen.has(b.title)) return false
        seen.add(b.title)
        return true
      })
      if (isVisionMode && unique.length === 0) {
        setBooks([{
          title: DEFAULT_VISION_BOOK,
          readAt: '',
          thumbnail: '',
          description: '시각장애 모드 기본 추천 동화',
          url: '',
          isToday: true,
        }])
        return
      }
      setBooks(unique)
    }).catch(() => {
      if (isVisionMode) {
        setBooks([{
          title: DEFAULT_VISION_BOOK,
          readAt: '',
          thumbnail: '',
          description: '시각장애 모드 기본 추천 동화',
          url: '',
          isToday: true,
        }])
      }
    })
  }, [isVisionMode])

  useEffect(() => {
    if (!isVisionMode) return
    const targetBook = bookFromParams || DEFAULT_VISION_BOOK
    if (selectedBook !== targetBook) setSelectedBook(targetBook)
    if (step !== 'mode') setStep('mode')
  }, [bookFromParams, isVisionMode, selectedBook, step])

  const selectMode = useCallback((modeId: string) => {
    const bookParam = encodeURIComponent(selectedBook)
    if (isVisionMode && modeId === 'speak') {
      navigate(`/study/voice?book=${bookParam}&entry=vision&mode=${studyType}`)
      return
    }

    if (studyType === 'sentence') {
      if (modeId === 'type') {
        navigate(`/study/sentence?book=${bookParam}&mode=type${isVisionMode ? '&entry=vision' : ''}`)
      } else if (modeId === 'speak') {
        navigate(`/study/sentence?book=${bookParam}&mode=speak${isVisionMode ? '&entry=vision' : ''}`)
      } else if (modeId === 'sign') {
        navigate(`/study/sign?book=${bookParam}&mode=sentence`)
      }
    } else if (modeId === 'type') {
      navigate(`/study/typing?book=${bookParam}${isVisionMode ? '&entry=vision' : ''}`)
    } else if (modeId === 'speak') {
      navigate(`/study/voice?book=${bookParam}`)
    } else if (modeId === 'quiz') {
      navigate(`/study/quiz?book=${bookParam}`)
    } else if (modeId === 'sign') {
      navigate(`/study/sign?book=${bookParam}`)
    } else {
      navigate(`/study/practice?type=${studyType}&mode=${modeId}&book=${bookParam}`)
    }
  }, [isVisionMode, navigate, selectedBook, studyType])

  const speakText = useCallback((text: string, onEnd?: () => void) => {
    if (!isVisionMode || !text || !('speechSynthesis' in window)) {
      onEnd?.()
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    utterance.rate = 0.88
    utterance.pitch = 1.08
    utterance.onend = () => onEnd?.()
    utterance.onerror = () => onEnd?.()
    window.speechSynthesis.speak(utterance)
  }, [isVisionMode])

  const handleVoiceChoice = useCallback((text: string) => {
    const normalized = text.replace(/\s/g, '')
    if (/홈|처음|메뉴|나가|돌아/.test(normalized)) {
      navigate('/tutor?entry=home')
      return
    }
    if (/다시|반복|한번더|한 번 더/.test(text)) {
      speakModePromptRef.current()
      return
    }
    if (/타자|입력|키보드|점자|쳐/.test(normalized)) {
      speakText('타자치기로 이동할게요.', () => selectMode('type'))
      return
    }
    if (/따라말|따라해|말하기|음성|읽기|소리/.test(normalized)) {
      speakText('따라말하기로 이동할게요.', () => selectMode('speak'))
      return
    }
    speakText('타자치기 또는 따라말하기 중에서 말해 주세요.', () => {
      window.setTimeout(() => startListeningRef.current(), 450)
    })
  }, [navigate, selectMode, speakText])

  const startListening = useCallback(() => {
    if (!isVisionMode) return
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setVoiceStatus('이 브라우저는 음성 인식을 지원하지 않아요.')
      return
    }
    recognitionRef.current?.abort()
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 3
    recognition.onstart = () => {
      setVoiceStatus('듣고 있어요. 타자치기 또는 따라말하기라고 말해 주세요.')
      setIsListening(true)
    }
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || ''
      setIsListening(false)
      setVoiceStatus(transcript ? `"${transcript}"라고 들었어요.` : '잘 듣지 못했어요.')
      if (transcript) handleVoiceChoice(transcript)
    }
    recognition.onerror = () => {
      setIsListening(false)
      setVoiceStatus('잘 듣지 못했어요. 화면을 한 번 누르거나 다시 말해 주세요.')
    }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      setIsListening(false)
      setVoiceStatus('음성 인식을 다시 준비하고 있어요. 잠시 후 다시 말해 주세요.')
    }
  }, [handleVoiceChoice, isVisionMode])

  useEffect(() => {
    startListeningRef.current = startListening
  }, [startListening])

  const speakModePrompt = useCallback(() => {
    if (!selectedBook) return
    speakText(getVisionPrompt(studyType, selectedBook), () => {
      window.setTimeout(() => startListeningRef.current(), 650)
    })
  }, [selectedBook, speakText, studyType])

  useEffect(() => {
    speakModePromptRef.current = speakModePrompt
  }, [speakModePrompt])

  useEffect(() => {
    if (!isVisionMode || step !== 'mode' || !selectedBook) return
    const key = `${studyType}:${selectedBook}`
    if (promptKeyRef.current === key) return
    promptKeyRef.current = key
    speakModePrompt()
  }, [isVisionMode, selectedBook, speakModePrompt, step, studyType])

  useEffect(() => () => {
    recognitionRef.current?.abort()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  const availableModes = (studyType === 'sentence' ? SENTENCE_MODES : MODES).filter(mode => (
    !isVisionMode || mode.id === 'type' || mode.id === 'speak'
  ))

  // 1단계: 책 선택
  if (step === 'book') {
    return (
      <div className="study-select">
        <div className="cloud cloud-left">
          <div className="cloud-circle c1" /><div className="cloud-circle c2" />
          <div className="cloud-circle c3" /><div className="cloud-circle c4" />
        </div>
        <div className="cloud cloud-right">
          <div className="cloud-circle c1" /><div className="cloud-circle c2" />
          <div className="cloud-circle c3" /><div className="cloud-circle c4" />
        </div>
        <div className="cloud cloud-right-bottom">
          <div className="cloud-circle c1" /><div className="cloud-circle c2" />
          <div className="cloud-circle c3" /><div className="cloud-circle c4" />
        </div>

        <h1 className="study-select-title">어떤 책으로 학습할까요?</h1>

        {books.length === 0 ? (
          <p className="study-empty">아직 읽은 책이 없어요. 동화를 먼저 읽어보세요!</p>
        ) : (
          <div className="study-book-grid">
            {books.map(book => (
              <div
                key={book.title}
                className={`study-book-card ${selectedBook === book.title ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedBook(book.title)
                  setStep('mode')
                }}
              >
                {book.thumbnail && <img src={book.thumbnail} alt={book.title} className="study-book-thumb" />}
                <span className="study-book-title">{book.title}</span>
                {book.isToday && <span className="study-book-today">오늘</span>}
              </div>
            ))}
          </div>
        )}
        <button className="study-back-btn" onClick={() => navigate(-1)}>← 돌아가기</button>
      </div>
    )
  }

  // 2단계: 학습 모드 선택
  return (
    <div className="study-select">
      <div className="cloud cloud-left">
        <div className="cloud-circle c1" /><div className="cloud-circle c2" />
        <div className="cloud-circle c3" /><div className="cloud-circle c4" />
      </div>
      <div className="cloud cloud-right">
        <div className="cloud-circle c1" /><div className="cloud-circle c2" />
        <div className="cloud-circle c3" /><div className="cloud-circle c4" />
      </div>
      <div className="cloud cloud-right-bottom">
        <div className="cloud-circle c1" /><div className="cloud-circle c2" />
        <div className="cloud-circle c3" /><div className="cloud-circle c4" />
      </div>

      <h1 className="study-select-title">
        「{selectedBook}」 {studyType === 'word' ? '단어' : '문장'}를 학습해볼까요?
      </h1>
      {isVisionMode && (
        <p className="study-empty" aria-live="polite">
          {isListening ? '듣고 있어요...' : voiceStatus || '타자치기 또는 따라말하기라고 말해 주세요.'}
        </p>
      )}
      <div className="study-select-cards">
        {availableModes.map(mode => (
          <div
            key={mode.id}
            className={`study-mode-card ${mode.id}`}
            onClick={() => selectMode(mode.id)}
          >
            <img src={mode.bg} alt="" className="study-mode-bg" />
            <img src={mode.monkey} alt={mode.label} className="study-mode-monkey" />
          </div>
        ))}
      </div>
      <button
        className="study-back-btn"
        onClick={() => isVisionMode ? navigate('/tutor?entry=home') : setStep('book')}
      >
        {isVisionMode ? '← 학습 메뉴' : '← 다른 책 선택'}
      </button>
    </div>
  )
}
