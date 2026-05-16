import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchBookForReader,
  fetchBookSentences,
  fetchVoiceBookRecommendations,
  fetchVoiceProgress,
  fetchVoiceServiceHealth,
  getVttUrl,
  evaluateVoiceQuiz,
  routeVoiceDialog,
  startVoiceSession,
  synthesizeVoiceText,
  transcribeVoiceAudio,
  type BookSentence,
  type VoiceBookRecommendation,
  type VoiceDialogResult,
  type VoiceIntent,
  type VoiceProgressSummary,
} from '../api/library'
import './StudyVoice.css'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type DemoVoiceQuiz = {
  questionId: string
  question: string
  expectedAnswers: string[]
  hint: string
  correctFeedback: string
  retryFeedback: string
}

const ALLOWED_INTENTS: VoiceIntent[] = [
  'START',
  'START_QUIZ',
  'ANSWER_QUIZ',
  'REPEAT',
  'HINT',
  'TODAY_RESULT',
  'NEXT',
  'PREVIOUS',
  'STOP',
  'CHANGE_BOOK',
  'LEVEL_DOWN',
  'LEVEL_UP',
  'EXPLAIN_WORD',
  'UNKNOWN',
]

const COMMANDS = ['시작', '다시', '다음', '이전', '천천히', '힌트', '단어 설명', '문제', '오늘 결과', '그만']
const DEMO_BOOK_TITLE = '암탉과 누렁이'
const DEMO_VOICE_QUIZZES: DemoVoiceQuiz[] = [
  {
    questionId: 'hen_nureongi_who_met',
    question: '암탉은 누구를 만났나요?',
    expectedAnswers: ['누렁이', '강아지', '개'],
    hint: '이름이 누렁이인 강아지예요.',
    correctFeedback: '맞았어요. 누렁이를 잘 기억했네요.',
    retryFeedback: '조금만 더 생각해 볼게요.',
  },
  {
    questionId: 'hen_nureongi_animal',
    question: '누렁이는 어떤 동물인가요?',
    expectedAnswers: ['강아지', '개', '누렁이'],
    hint: '멍멍 하고 짖는 동물이에요.',
    correctFeedback: '좋아요. 누렁이가 강아지라는 걸 잘 말했어요.',
    retryFeedback: '괜찮아요. 동물 이름을 다시 떠올려 봐요.',
  },
  {
    questionId: 'hen_nureongi_main_character',
    question: '이 이야기에서 자주 나오는 새는 누구인가요?',
    expectedAnswers: ['암탉', '닭'],
    hint: '알을 낳는 닭이에요.',
    correctFeedback: '맞아요. 암탉을 잘 기억했어요.',
    retryFeedback: '다시 한 번 이야기 속 새를 떠올려 볼게요.',
  },
]

function parseVttSentences(text: string) {
  const lines = text.replace(/\r/g, '').split('\n')
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    if (lines[i].includes('-->')) {
      const textLines: string[] = []
      i++
      while (i < lines.length && lines[i].trim()) {
        textLines.push(lines[i].trim())
        i++
      }
      const sentence = textLines.join(' ').trim()
      if (sentence) result.push(sentence)
    }
    i++
  }

  return result
}

function pickKeyword(sentence: string) {
  const cleaned = sentence.replace(/[^\s가-힣a-zA-Z]/g, ' ')
  const words = cleaned.split(/\s+/).filter(word => word.length >= 2)
  return words.find(word => !['그리고', '그래서', '하지만', '입니다', '했어요'].includes(word)) || words[0] || ''
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('audio read failed'))
    reader.readAsDataURL(blob)
  })
}

function makeLocalDialog(text: string): VoiceDialogResult {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const has = (items: string[]) => items.some(item => normalized.includes(item))
  const base = {
    confidence: 0.9,
    slots: { answerText: '', targetWord: '', requestedSpeed: 'normal' as const },
    requiresConfirmation: false,
  }

  if (has(['다시', '한번 더', '한 번 더'])) {
    return { ...base, intent: 'REPEAT', spokenResponse: '방금 문장을 다시 들려줄게요.', nextAction: { tool: 'playStorySegment', args: { direction: 'current' } } }
  }
  if (has(['시작', '시작해', '들려줘', '읽어줘'])) {
    return { ...base, intent: 'START', spokenResponse: '첫 문장을 들려줄게요.', nextAction: { tool: 'playStorySegment', args: { direction: 'current' } } }
  }
  if (has(['문제', '퀴즈', '질문 내줘', '문제 내줘'])) {
    return { ...base, intent: 'START_QUIZ', spokenResponse: '문제를 하나 낼게요.', nextAction: { tool: 'askVoiceQuiz', args: {} } }
  }
  if (has(['다음', '계속', '넘어가'])) {
    return { ...base, intent: 'NEXT', spokenResponse: '다음 문장으로 넘어갈게요.', nextAction: { tool: 'playStorySegment', args: { direction: 'next' } } }
  }
  if (has(['이전', '앞 문장', '뒤로'])) {
    return { ...base, intent: 'PREVIOUS', spokenResponse: '이전 문장으로 돌아갈게요.', nextAction: { tool: 'playStorySegment', args: { direction: 'previous' } } }
  }
  if (has(['힌트', '도움', '모르겠어'])) {
    return { ...base, intent: 'HINT', spokenResponse: '짧은 힌트를 들려줄게요.', nextAction: { tool: 'explainHint', args: {} } }
  }
  if (has(['오늘 결과', '결과 알려', '학습 결과', '추천'])) {
    return { ...base, intent: 'TODAY_RESULT', spokenResponse: '오늘 학습 결과를 정리해 줄게요.', nextAction: { tool: 'summarizeProgress', args: {} } }
  }
  if (has(['단어 설명', '뜻 알려', '무슨 뜻'])) {
    return { ...base, intent: 'EXPLAIN_WORD', spokenResponse: '현재 문장의 중요한 단어를 설명할게요.', nextAction: { tool: 'explainWord', args: {} } }
  }
  if (has(['천천히', '느리게'])) {
    return { ...base, intent: 'LEVEL_DOWN', spokenResponse: '조금 천천히 들려줄게요.', nextAction: { tool: 'setSpeechRate', args: { rate: 'slow' } } }
  }
  if (has(['빠르게', '보통 속도', '빨리'])) {
    return { ...base, intent: 'LEVEL_UP', spokenResponse: '보통 속도로 들려줄게요.', nextAction: { tool: 'setSpeechRate', args: { rate: 'normal' } } }
  }
  if (has(['그만', '멈춰', '중지', '종료'])) {
    return { ...base, intent: 'STOP', spokenResponse: '학습을 잠시 멈출게요.', nextAction: { tool: 'pauseSession', args: {} } }
  }
  return {
    intent: 'UNKNOWN',
    confidence: 0.2,
    slots: { answerText: normalized, targetWord: '', requestedSpeed: 'normal' },
    requiresConfirmation: true,
    spokenResponse: '다시, 다음, 힌트처럼 말해 주세요.',
    nextAction: { tool: 'listenAgain', args: {} },
  }
}

export default function StudyVoice() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const book = params.get('book') || DEMO_BOOK_TITLE

  const [sentences, setSentences] = useState<BookSentence[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [rate, setRate] = useState(0.92)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [lastTranscript, setLastTranscript] = useState('')
  const [lastIntent, setLastIntent] = useState<VoiceIntent | ''>('')
  const [status, setStatus] = useState('시작을 누르면 첫 문장을 들려줘요.')
  const [sttBackend, setSttBackend] = useState('')
  const [ttsBackend, setTtsBackend] = useState('supertonic')
  const [ttsReady, setTtsReady] = useState(true)
  const [quizIdx, setQuizIdx] = useState(0)
  const [activeQuiz, setActiveQuiz] = useState<DemoVoiceQuiz | null>(null)
  const [quizFeedback, setQuizFeedback] = useState('')
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 })
  const [progressSummary, setProgressSummary] = useState<VoiceProgressSummary | null>(null)
  const [recommendedBooks, setRecommendedBooks] = useState<VoiceBookRecommendation[]>([])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rateRef = useRef(rate)
  const handsFreeRef = useRef(false)
  const isListeningRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const startListeningRef = useRef<() => void>(() => {})
  const autoListenTimerRef = useRef<number | null>(null)

  useEffect(() => {
    rateRef.current = rate
  }, [rate])

  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  useEffect(() => {
    let cancelled = false

    if (!book) return

    async function loadSentences() {
      try {
        const saved = await fetchBookSentences(book)
        if (cancelled) return
        if (saved.length > 0) {
          setSentences(saved)
          return
        }

        const readerBook = await fetchBookForReader(book)
        const vttUrl = getVttUrl(readerBook.nlcyThumb, 'ko')
        if (!vttUrl) {
          setSentences([])
          return
        }
        const res = await fetch(vttUrl)
        if (!res.ok) {
          setSentences([])
          return
        }
        const parsed = parseVttSentences(await res.text())
          .filter((sentence, index) => index !== 1 && sentence.length > 1)
          .map(sentence => ({ sentence, learned: 0 }))
        if (!cancelled) setSentences(parsed)
      } catch {
        if (!cancelled) setSentences([])
      }
    }

    void loadSentences()

    startVoiceSession(book)
      .then(session => {
        if (!cancelled) setSessionId(session.sessionId)
      })
      .catch(() => {})

    fetchVoiceServiceHealth()
      .then(health => {
        if (!cancelled) {
          setSttBackend(String(health.sttBackend || ''))
          setTtsBackend(String(health.ttsBackend || ''))
          setTtsReady(Boolean(health.supertonicReady))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSttBackend('')
          setTtsBackend('supertonic')
          setTtsReady(true)
        }
      })

    return () => {
      cancelled = true
      if (autoListenTimerRef.current) {
        window.clearTimeout(autoListenTimerRef.current)
        autoListenTimerRef.current = null
      }
      audioRef.current?.pause()
      audioRef.current = null
      window.speechSynthesis?.cancel()
      recognitionRef.current?.abort()
    }
  }, [book])

  const sentenceTexts = useMemo(() => sentences.map(item => item.sentence).filter(Boolean), [sentences])
  const currentSentence = sentenceTexts[currentIdx] || ''
  const currentKeyword = pickKeyword(currentSentence)
  const progress = sentenceTexts.length > 0 ? Math.round(((currentIdx + 1) / sentenceTexts.length) * 100) : 0
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const recognitionSupported = useMemo(() => {
    if (typeof window === 'undefined') return false
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
  }, [])
  const serverSttReady = sttBackend === 'faster-whisper'
  const localTtsReady = ttsBackend === 'supertonic' && ttsReady

  const refreshLearningProgress = useCallback(async () => {
    try {
      const [progress, recommendations] = await Promise.all([
        fetchVoiceProgress(book),
        fetchVoiceBookRecommendations(book, 3),
      ])
      setProgressSummary(progress)
      setRecommendedBooks(recommendations.items || [])
    } catch {
      setProgressSummary(null)
      setRecommendedBooks([])
    }
  }, [book])

  useEffect(() => {
    void refreshLearningProgress()
  }, [refreshLearningProgress])

  const scheduleAutoListen = useCallback(() => {
    if (!handsFreeRef.current || isListeningRef.current) return
    if (autoListenTimerRef.current) window.clearTimeout(autoListenTimerRef.current)
    autoListenTimerRef.current = window.setTimeout(() => {
      autoListenTimerRef.current = null
      if (handsFreeRef.current && !isListeningRef.current && !isSpeakingRef.current) {
        startListeningRef.current()
      }
    }, 300)
  }, [])

  const markSpeechDone = useCallback((shouldListen = true) => {
    isSpeakingRef.current = false
    setIsSpeaking(false)
    if (shouldListen) scheduleAutoListen()
  }, [scheduleAutoListen])

  const speak = useCallback((message: string, nextRate = rateRef.current) => {
    if (!message) return

    const playWithBrowserTts = () => {
      if (!speechSupported) {
        markSpeechDone(false)
        setStatus('이 브라우저에서는 TTS를 사용할 수 없어요.')
        return
      }

      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(message)
      const voices = window.speechSynthesis.getVoices()
      utterance.voice = voices.find(voice => voice.lang.toLowerCase().startsWith('ko')) || null
      utterance.lang = 'ko-KR'
      utterance.rate = nextRate
      utterance.pitch = 1
      utterance.onstart = () => {
        isSpeakingRef.current = true
        setIsSpeaking(true)
      }
      utterance.onend = () => markSpeechDone(true)
      utterance.onerror = () => markSpeechDone(false)
      window.speechSynthesis.speak(utterance)
    }

    if (localTtsReady) {
      audioRef.current?.pause()
      window.speechSynthesis?.cancel()
      isSpeakingRef.current = true
      setIsSpeaking(true)
      void synthesizeVoiceText({
        text: message,
        voice: 'F1',
        lang: 'ko',
        rate: Math.max(0.7, Math.min(nextRate, 2)),
        totalSteps: 8,
        format: 'wav',
      })
        .then(data => {
          const audioBase64 = typeof data.audioBase64 === 'string' ? data.audioBase64 : ''
          if (!audioBase64) {
            playWithBrowserTts()
            return
          }
          const mimeType = typeof data.mimeType === 'string' && data.mimeType ? data.mimeType : 'audio/wav'
          const audio = new Audio(`data:${mimeType};base64,${audioBase64}`)
          audioRef.current = audio
          audio.onended = () => markSpeechDone(true)
          audio.onerror = () => {
            markSpeechDone(false)
            playWithBrowserTts()
          }
          audio.play().catch(() => {
            markSpeechDone(false)
            playWithBrowserTts()
          })
        })
        .catch(() => {
          markSpeechDone(false)
          playWithBrowserTts()
        })
      return
    }

    if (!speechSupported) {
      setStatus('이 브라우저에서는 TTS를 사용할 수 없어요.')
      return
    }

    playWithBrowserTts()
  }, [localTtsReady, markSpeechDone, speechSupported])

  const readSentence = useCallback((index = currentIdx, prefix = '') => {
    const sentence = sentenceTexts[index]
    if (!sentence) {
      setStatus('아직 들려줄 문장이 없어요. 동화를 먼저 읽어 문장을 저장해 주세요.')
      return
    }
    setStatus(`${index + 1}번째 문장을 듣는 중이에요.`)
    speak(`${prefix}${sentence}`, rateRef.current)
  }, [currentIdx, sentenceTexts, speak])

  const moveTo = useCallback((nextIndex: number, prefix: string) => {
    const bounded = Math.max(0, Math.min(nextIndex, sentenceTexts.length - 1))
    setCurrentIdx(bounded)
    window.setTimeout(() => readSentence(bounded, prefix), 0)
  }, [readSentence, sentenceTexts.length])

  const speakLearningResult = useCallback(async () => {
    let progress = progressSummary
    let books = recommendedBooks

    if (!progress) {
      try {
        const response = await fetchVoiceBookRecommendations(book, 3)
        progress = response.progress
        books = response.items || []
        setProgressSummary(response.progress)
        setRecommendedBooks(books)
      } catch {
        progress = null
        books = []
      }
    }

    const recommendation = books[0]
    const message = progress
      ? `${progress.spokenSummary}${recommendation ? ` 다음 추천은 ${recommendation.title}예요. ${recommendation.reason}` : ''}`
      : '아직 정리할 학습 결과가 없어요. 동화를 듣고 문제를 풀어볼게요.'
    setStatus(message)
    speak(message)
  }, [book, progressSummary, recommendedBooks, speak])

  const askQuiz = useCallback(() => {
    const quiz = DEMO_VOICE_QUIZZES[quizIdx] || DEMO_VOICE_QUIZZES[0]
    if (!quiz) return

    handsFreeRef.current = true
    setActiveQuiz(quiz)
    setQuizFeedback('')
    const message = `문제입니다. ${quiz.question}`
    setStatus(message)
    speak(message)
  }, [quizIdx, speak])

  const submitQuizAnswer = useCallback(async (answerText: string) => {
    const quiz = activeQuiz
    const cleanAnswer = answerText.trim()

    if (!quiz) return
    if (!cleanAnswer) {
      const message = '답을 잘 듣지 못했어요. 다시 말해 주세요.'
      setStatus(message)
      speak(message)
      return
    }

    setLastIntent('ANSWER_QUIZ')
    setStatus('답을 확인하고 있어요.')
    try {
      const result = await evaluateVoiceQuiz({
        questionId: quiz.questionId,
        sttText: cleanAnswer,
        expectedAnswers: quiz.expectedAnswers,
        sessionId,
      })
      const feedback = result.isCorrect
        ? quiz.correctFeedback
        : `${quiz.retryFeedback} 힌트는 ${quiz.hint}`

      setQuizFeedback(feedback)
      setStatus(feedback)
      setQuizScore(prev => ({
        correct: prev.correct + (result.isCorrect ? 1 : 0),
        total: prev.total + 1,
      }))
      if (result.progress) setProgressSummary(result.progress)
      if (result.isCorrect) {
        setActiveQuiz(null)
        setQuizIdx(prev => (prev + 1) % DEMO_VOICE_QUIZZES.length)
      }
      void refreshLearningProgress()
      speak(feedback)
    } catch {
      const message = '답을 확인하지 못했어요. 다시 말해 주세요.'
      setStatus(message)
      speak(message)
    }
  }, [activeQuiz, refreshLearningProgress, sessionId, speak])

  const applyDialog = useCallback((result: VoiceDialogResult) => {
    setLastIntent(result.intent)

    if (result.intent === 'START') {
      handsFreeRef.current = true
      readSentence(currentIdx)
      return
    }
    if (result.intent === 'REPEAT') {
      if (activeQuiz) {
        const message = `문제입니다. ${activeQuiz.question}`
        setStatus(message)
        speak(message)
        return
      }
      readSentence(currentIdx)
      return
    }
    if (result.intent === 'START_QUIZ') {
      askQuiz()
      return
    }
    if (result.intent === 'ANSWER_QUIZ' && activeQuiz) {
      void submitQuizAnswer(result.slots.answerText || lastTranscript)
      return
    }
    if (result.intent === 'NEXT') {
      moveTo(currentIdx + 1, '다음 문장입니다. ')
      return
    }
    if (result.intent === 'PREVIOUS') {
      moveTo(currentIdx - 1, '이전 문장입니다. ')
      return
    }
    if (result.intent === 'LEVEL_DOWN') {
      setRate(0.74)
      setStatus('천천히 듣기 모드예요.')
      speak('좋아요. 조금 천천히 들려줄게요.', 0.74)
      return
    }
    if (result.intent === 'LEVEL_UP') {
      setRate(0.96)
      setStatus('보통 속도 듣기 모드예요.')
      speak('좋아요. 보통 속도로 들려줄게요.', 0.96)
      return
    }
    if (result.intent === 'HINT') {
      if (activeQuiz) {
        const hint = `힌트입니다. ${activeQuiz.hint}`
        setStatus(hint)
        speak(hint)
        return
      }
      const hint = currentKeyword ? `힌트입니다. 이 문장의 중요한 단어는 ${currentKeyword}예요.` : '힌트입니다. 문장을 한 번 더 들어 보세요.'
      setStatus(hint)
      speak(hint)
      return
    }
    if (result.intent === 'TODAY_RESULT') {
      void speakLearningResult()
      return
    }
    if (result.intent === 'EXPLAIN_WORD') {
      const explanation = currentKeyword
        ? `${currentKeyword}라는 단어를 기억해 보세요. 문장 속에서 어떤 뜻인지 다시 들어볼게요. ${currentSentence}`
        : '현재 문장에서 설명할 단어를 찾지 못했어요.'
      setStatus(explanation)
      speak(explanation)
      return
    }
    if (result.intent === 'CHANGE_BOOK') {
      navigate(-1)
      return
    }
    if (result.intent === 'STOP') {
      handsFreeRef.current = false
      setActiveQuiz(null)
      if (autoListenTimerRef.current) {
        window.clearTimeout(autoListenTimerRef.current)
        autoListenTimerRef.current = null
      }
      audioRef.current?.pause()
      audioRef.current = null
      window.speechSynthesis?.cancel()
      recognitionRef.current?.abort()
      isSpeakingRef.current = false
      isListeningRef.current = false
      setIsSpeaking(false)
      setIsListening(false)
      setStatus('학습을 멈췄어요. 시작을 누르면 이어서 들을 수 있어요.')
      return
    }

    setStatus(result.spokenResponse)
    speak(result.spokenResponse)
  }, [activeQuiz, askQuiz, currentIdx, currentKeyword, currentSentence, lastTranscript, moveTo, navigate, readSentence, speak, speakLearningResult, submitQuizAnswer])

  const handleTranscript = useCallback(async (text: string) => {
    setLastTranscript(text)
    const normalized = text.replace(/\s+/g, ' ').trim()

    if (activeQuiz) {
      if (/힌트|도움|모르겠/.test(normalized)) {
        applyDialog(makeLocalDialog('힌트'))
        return
      }
      if (/다시|한\s?번/.test(normalized)) {
        applyDialog(makeLocalDialog('다시'))
        return
      }
      if (/그만|멈춰|중지|종료/.test(normalized)) {
        applyDialog(makeLocalDialog('그만'))
        return
      }
      if (/오늘 결과|학습 결과|결과 알려|추천/.test(normalized)) {
        applyDialog(makeLocalDialog('오늘 결과'))
        return
      }
      await submitQuizAnswer(normalized)
      return
    }

    if (/문제|퀴즈|질문/.test(normalized)) {
      setLastIntent('START_QUIZ')
      askQuiz()
      return
    }

    try {
      const result = await routeVoiceDialog({
        text,
        sessionId,
        state: `sentence:${currentIdx + 1}`,
        allowedIntents: ALLOWED_INTENTS,
        childProfile: {
          disability: 'vision',
          accessibilityProfile: 'audioFirst',
        },
        context: {
          bookTitle: book,
          currentSentence,
          currentIndex: currentIdx + 1,
          totalSentences: sentenceTexts.length,
          currentKeyword,
          handsFree: handsFreeRef.current,
        },
      })
      applyDialog(result)
    } catch {
      applyDialog(makeLocalDialog(text))
    }
  }, [activeQuiz, applyDialog, askQuiz, book, currentIdx, currentKeyword, currentSentence, sentenceTexts.length, sessionId, submitQuizAnswer])

  async function recordWithServerStt() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStatus('이 브라우저에서는 서버 STT용 녹음을 사용할 수 없어요.')
      return false
    }

    isListeningRef.current = true
    setIsListening(true)
    setStatus('말을 듣고 있어요. 짧게 말해 주세요.')

    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const recorder = new MediaRecorder(stream)

      await new Promise<void>((resolve, reject) => {
        recorder.ondataavailable = event => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = () => resolve()
        recorder.onerror = () => reject(new Error('recording failed'))
        recorder.start()
        window.setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop()
        }, 3200)
      })

      const mimeType = chunks[0]?.type || 'audio/webm'
      const audioBase64 = await blobToDataUrl(new Blob(chunks, { type: mimeType }))
      const result = await transcribeVoiceAudio({
        audioBase64,
        mimeType,
        language: 'ko',
        prompt: COMMANDS.join(', '),
      })
      const text = typeof result.text === 'string' ? result.text.trim() : ''
      if (!text) {
        const message = '음성을 잘 듣지 못했어요. 다시 말해 주세요.'
        setStatus(message)
        speak(message)
        return true
      }
      await handleTranscript(text)
      return true
    } catch {
      const message = '마이크 입력에 실패했어요. 다시 시도해 주세요.'
      setStatus(message)
      speak(message)
      return false
    } finally {
      stream?.getTracks().forEach(track => track.stop())
      isListeningRef.current = false
      setIsListening(false)
    }
  }

  async function startListening() {
    if (isSpeakingRef.current || isListeningRef.current) return

    if (serverSttReady) {
      await recordWithServerStt()
      return
    }

    if (!recognitionSupported) {
      setStatus('현재 브라우저에서는 음성 인식을 지원하지 않아요. 아래 버튼이나 키보드로 진행할 수 있어요.')
      return
    }
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Recognition) return

    recognitionRef.current?.abort()
    const recognition = new Recognition()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript || ''
      if (transcript) void handleTranscript(transcript)
    }
    recognition.onend = () => {
      isListeningRef.current = false
      setIsListening(false)
    }
    recognition.onerror = () => {
      isListeningRef.current = false
      setIsListening(false)
      setStatus('음성 입력을 받지 못했어요. 다시 시도해 주세요.')
    }
    recognitionRef.current = recognition
    isListeningRef.current = true
    setIsListening(true)
    recognition.start()
  }

  useEffect(() => {
    startListeningRef.current = () => { void startListening() }
  })

  const beginHandsFreeSession = useCallback(() => {
    handsFreeRef.current = true
    setStatus('음성으로 진행할게요. 문장을 듣고 말해 주세요.')
    readSentence()
  }, [readSentence])

  function stopSpeaking() {
    handsFreeRef.current = false
    if (autoListenTimerRef.current) {
      window.clearTimeout(autoListenTimerRef.current)
      autoListenTimerRef.current = null
    }
    audioRef.current?.pause()
    audioRef.current = null
    window.speechSynthesis?.cancel()
    recognitionRef.current?.abort()
    isSpeakingRef.current = false
    isListeningRef.current = false
    setIsSpeaking(false)
    setIsListening(false)
    setStatus('재생을 멈췄어요.')
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter') beginHandsFreeSession()
      if (event.key === 'ArrowRight') moveTo(currentIdx + 1, '다음 문장입니다. ')
      if (event.key === 'ArrowLeft') moveTo(currentIdx - 1, '이전 문장입니다. ')
      if (event.key === ' ') {
        event.preventDefault()
        beginHandsFreeSession()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [beginHandsFreeSession, currentIdx, moveTo])

  const visibleQuestion = activeQuiz?.question || DEMO_VOICE_QUIZZES[2].question
    .replace('이 이야기에서 자주 나오는 새는', '이 이야기에 자주나오는\n새는')
  const activeDotCount = 4
  const progressDots = Array.from({ length: 16 }, (_, index) => index < activeDotCount)
  const speakMenuName = useCallback((label: string) => {
    speak(label, 1)
  }, [speak])

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

      <main className="sv-stage" aria-live="polite">
        <section className="sv-question-area">
          <h1>{book}</h1>
          <div className="sv-question-card">
            {visibleQuestion}
          </div>
          <div className="sv-dot-row" aria-label={`진행 ${activeDotCount}/16`}>
            {progressDots.map((active, index) => (
              <span key={index} className={`sv-dot ${active ? 'active' : ''}`} />
            ))}
          </div>
        </section>

        <aside className="sv-command-card" aria-label="따라말하기 명령">
          <button className="sv-menu-button replay" type="button" onMouseEnter={() => speakMenuName('다시')} onClick={() => applyDialog(makeLocalDialog('다시'))}>
            다시
          </button>
          <button className="sv-menu-button previous" type="button" onMouseEnter={() => speakMenuName('이전')} onClick={() => applyDialog(makeLocalDialog('이전'))}>
            이전
          </button>
          <button className="sv-menu-button next" type="button" onMouseEnter={() => speakMenuName('다음')} onClick={() => applyDialog(makeLocalDialog('다음'))}>
            다음
          </button>
          <button className="sv-menu-button hint" type="button" onMouseEnter={() => speakMenuName('힌트')} onClick={() => applyDialog(makeLocalDialog('힌트'))}>
            힌트
          </button>
          <button className="sv-menu-button explain" type="button" onMouseEnter={() => speakMenuName('단어 설명')} onClick={() => applyDialog(makeLocalDialog('단어 설명'))}>
            단어 설명
          </button>
          <button className="sv-menu-button quiz" type="button" onMouseEnter={() => speakMenuName('문제')} onClick={askQuiz}>
            문제
          </button>
        </aside>
      </main>
    </div>
  )
}
