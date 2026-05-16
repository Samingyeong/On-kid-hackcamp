import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchTutorialStep, type ChildProfile } from '../api/midm'
import { fetchBookForReader, fetchRecommendedBooks, fetchTutorQuizData, routeVoiceDialog, type RecommendedBook, type VoiceIntent } from '../api/library'
import {
  getVisionNavigationTarget,
  isNavigationAffirmative,
  isNavigationNegative,
  looksLikeVisionNavigationRequest,
  VISION_NAVIGATION_INTENTS,
  type VisionNavigationTarget,
} from '../utils/visionVoiceNavigation'
import './TutorIntro.css'

// 기본 단어 테스트 (첫 방문용)
const DEFAULT_WORDS = [
  { word: '사과', hint: '빨간 과일이야' },
  { word: '강아지', hint: '멍멍 하는 동물이야' },
  { word: '무지개', hint: '비 온 뒤 하늘에 나타나' },
  { word: '도서관', hint: '책을 빌려 읽는 곳이야' },
  { word: '모험', hint: '새로운 곳을 탐험하는 거야' },
]

const VISION_STORY_WORDS = [
  { word: '암탉', hint: '달걀을 낳는 닭이야' },
  { word: '누렁이', hint: '누런 빛을 띤 강아지를 부르는 말이야' },
  { word: '강아지', hint: '멍멍 하는 동물이야' },
  { word: '동물', hint: '강아지나 닭처럼 살아 움직이는 친구들이야' },
  { word: '마당', hint: '집 밖에서 놀 수 있는 넓은 곳이야' },
]

// 고급용 빈칸 퀴즈 (기본값 — 학습 데이터 없을 때)
const DEFAULT_SENTENCE_QUIZ = [
  { sentence: '하늘에서 ___이 내려요', answer: '눈', options: ['눈', '불', '돌'] },
  { sentence: '친구와 ___을 했어요', answer: '약속', options: ['약속', '숙제', '청소'] },
  { sentence: '엄마가 맛있는 ___을 만들었어요', answer: '음식', options: ['음식', '장난감', '그림'] },
]

const VISION_RECOMMENDED_BOOK_TITLE = '암탉과 누렁이'
const VISION_HOME_MENU_MESSAGE =
  '안녕하세요. 지금 할 수 있는 학습은 동화 내용 학습, 단어 공부, 문장 공부, 오늘의 학습, 동화 목록이에요. 무엇을 할까요?'

type Phase = 'VOICE_MENU' | 'INTRO' | 'WORD_TEST' | 'SENTENCE_QUIZ' | 'LEVEL_ANALYSIS' | 'RECOMMEND_BOOK'

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

type SpeechRecognitionErrorEventLike = {
  error?: string
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event?: SpeechRecognitionErrorEventLike) => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

const WORD_ANSWER_HINTS: Record<string, string[]> = {
  사과: ['사과', '과일', '빨간'],
  강아지: ['강아지', '개', '동물', '멍멍'],
  무지개: ['무지개', '하늘', '비', '색'],
  도서관: ['도서관', '책', '빌리', '읽'],
  모험: ['모험', '탐험', '새로운'],
  암탉: ['암탉', '닭', '동물', '달걀', '알'],
  누렁이: ['누렁이', '강아지', '개', '동물', '누런'],
  동물: ['동물', '강아지', '개', '닭', '살아'],
  마당: ['마당', '집밖', '밖', '놀'],
}

function normalizeSpeech(text: string) {
  return text.toLowerCase().replace(/[.,!?~…\s]/g, '')
}

function isPositiveVoiceAnswer(text: string) {
  return /알|알아|맞|응|네|예|좋|시작|해볼/.test(text) && !/몰라|아니|싫/.test(text)
}

function isKnownWordAnswer(word: string, transcript: string) {
  const normalized = normalizeSpeech(transcript)
  const hints = WORD_ANSWER_HINTS[word] || [word]
  return hints.some(hint => normalized.includes(normalizeSpeech(hint))) || isPositiveVoiceAnswer(normalized)
}

function toRecommendedBook(book: {
  title: string
  description: string
  thumbnail: string
  storyType: string
}): RecommendedBook {
  return {
    title: book.title,
    level: 'beginner',
    totalWords: 0,
    thumbnail: book.thumbnail,
    description: book.description,
    storyType: book.storyType,
  }
}

function compactSpeechText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function hasBadSpeechPlaceholder(text: string) {
  return /\b(undefined|null|nan)\b/i.test(text)
}

function isSafeVisionNarration(message: string) {
  return Boolean(message) &&
    message.length <= 220 &&
    !hasBadSpeechPlaceholder(message) &&
    !/(화면|그림을 봐|버튼을 눌러|클릭)/.test(message)
}

function safeMessageToChild(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const message = compactSpeechText(value)
  if (!message || hasBadSpeechPlaceholder(message)) return fallback
  return message
}

function safeBookTitle(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const title = compactSpeechText(value)
  if (!title || hasBadSpeechPlaceholder(title)) return fallback
  return title
}

export default function TutorIntro() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { childName, childCharacter, childBirthDate, user, loading: authLoading, signOut } = useAuth()
  const [bubbleText, setBubbleText] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>('INTRO')
  const [wordIdx, setWordIdx] = useState(0)
  const [testResults, setTestResults] = useState<{ word: string; known: boolean }[]>([])
  const [showChoices, setShowChoices] = useState(false)
  const [recommendedBooks, setRecommendedBooks] = useState<RecommendedBook[]>([])
  const [testWords, setTestWords] = useState(DEFAULT_WORDS)
  const [sentenceQuiz, setSentenceQuiz] = useState(DEFAULT_SENTENCE_QUIZ)
  const [quizIdx, setQuizIdx] = useState(0)
  const [quizResults, setQuizResults] = useState<boolean[]>([])
  const [hasStudyData, setHasStudyData] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const isVisionMode = childCharacter === 'vision'
  const activeTestWords = isVisionMode ? VISION_STORY_WORDS : testWords
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const lastPromptRef = useRef('')
  const phaseRef = useRef<Phase>('INTRO')
  const wordIdxRef = useRef(0)
  const testResultsRef = useRef<{ word: string; known: boolean }[]>([])
  const recommendedBooksRef = useRef<RecommendedBook[]>([])
  const visionIntroSpokenRef = useRef(false)
  const speechSeqRef = useRef(0)
  const pendingNavigationRef = useRef<VisionNavigationTarget | null>(null)
  const startListeningRef = useRef<(source?: 'auto' | 'manual') => void>(() => {})
  const handleVisionTranscriptRef = useRef<(text: string) => void>(() => {})
  const bootstrappedRef = useRef(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const entryMode = params.get('entry') || ''
  const shouldUseVoiceMenu = isVisionMode && entryMode === 'home'

  const profile: ChildProfile = {
    name: childName || '친구',
    birth_date: childBirthDate || '',
    disability: childCharacter || '',
  }

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { wordIdxRef.current = wordIdx }, [wordIdx])
  useEffect(() => { testResultsRef.current = testResults }, [testResults])
  useEffect(() => { recommendedBooksRef.current = recommendedBooks }, [recommendedBooks])

  const speakPrompt = useCallback((message: string, listenAfter = true, onDone?: () => void) => {
    const safeMessage = compactSpeechText(String(message ?? ''))
    lastPromptRef.current = safeMessage
    if (!safeMessage || hasBadSpeechPlaceholder(safeMessage)) {
      onDone?.()
      return
    }
    if (!isVisionMode) return

    if (!window.speechSynthesis) {
      setVoiceStatus('이 브라우저에서는 음성 출력을 사용할 수 없어요.')
      onDone?.()
      return
    }

    const speechSeq = speechSeqRef.current + 1
    speechSeqRef.current = speechSeq
    recognitionRef.current?.abort()
    window.speechSynthesis.cancel()
    setVoiceStatus('안내를 들려주고 있어요.')
    const utterance = new SpeechSynthesisUtterance(safeMessage)
    const voices = window.speechSynthesis.getVoices()
    utterance.voice = voices.find(voice => voice.lang.toLowerCase().startsWith('ko')) || null
    utterance.lang = 'ko-KR'
    utterance.rate = 0.85
    utterance.pitch = 1
    const finishSpeech = () => {
      if (speechSeq !== speechSeqRef.current) return
      setVoiceStatus(listenAfter ? '답변을 말해 주세요.' : '')
      onDone?.()
      if (listenAfter) window.setTimeout(() => startListeningRef.current('auto'), 650)
    }
    utterance.onend = finishSpeech
    utterance.onerror = finishSpeech
    window.speechSynthesis.speak(utterance)
  }, [isVisionMode])

  const startListening = useCallback(async (source: 'auto' | 'manual' = 'manual') => {
    if (!isVisionMode) return
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Recognition) {
      setVoiceStatus('현재 브라우저에서는 음성 인식을 지원하지 않아요. 화면을 한 번 눌러 진행해 주세요.')
      return
    }

    if (source === 'auto' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())
      } catch {
        setVoiceStatus('브라우저가 자동 마이크 시작을 막았어요. 화면을 한 번 누르거나 엔터를 눌러 말해 주세요.')
      }
    }

    recognitionRef.current?.abort()
    const recognition = new Recognition()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 3
    let keepStatusOnEnd = false
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript || ''
      if (!transcript.trim()) {
        keepStatusOnEnd = true
        setVoiceStatus('아직 답변을 듣지 못했어요. 준비되면 화면을 한 번 누르거나 엔터를 눌러 말해 주세요.')
        return
      }
      handleVisionTranscriptRef.current(transcript)
    }
    recognition.onend = () => {
      if (!keepStatusOnEnd) setVoiceStatus('')
    }
    recognition.onerror = event => {
      if (event?.error === 'aborted') return
      keepStatusOnEnd = true
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        setVoiceStatus('마이크 권한이 필요해요. 화면을 한 번 누르거나 브라우저에서 마이크를 허용해 주세요.')
      } else {
        setVoiceStatus('아직 답변을 듣지 못했어요. 준비되면 화면을 한 번 누르거나 엔터를 눌러 말해 주세요.')
      }
    }
    recognitionRef.current = recognition
    setVoiceStatus('듣고 있어요.')
    try {
      recognition.start()
    } catch {
      setVoiceStatus('마이크를 바로 시작하지 못했어요. 화면을 한 번 누르거나 엔터를 눌러 말해 주세요.')
    }
  }, [isVisionMode])

  useEffect(() => {
    startListeningRef.current = startListening
  }, [startListening])

  const startVoiceMenu = useCallback(() => {
    setLoading(false)
    setShowChoices(false)
    setPhase('VOICE_MENU')
    setBubbleText(VISION_HOME_MENU_MESSAGE)
    speakPrompt(VISION_HOME_MENU_MESSAGE)
  }, [speakPrompt])

  const dismissTutorToHome = useCallback(() => {
    speechSeqRef.current += 1
    recognitionRef.current?.abort()
    window.speechSynthesis?.cancel()
    navigate('/', { state: { skipVisionTutor: true } })
  }, [navigate])

  const handleLogout = useCallback(async () => {
    speechSeqRef.current += 1
    recognitionRef.current?.abort()
    window.speechSynthesis?.cancel()
    setProfileMenuOpen(false)
    await signOut()
    navigate('/login')
  }, [navigate, signOut])

  const executeVisionNavigation = useCallback((target: VisionNavigationTarget) => {
    pendingNavigationRef.current = null
    if (target.intent === 'OPEN_TUTOR' && phaseRef.current === 'VOICE_MENU') {
      speakPrompt('오늘의 학습을 시작할게요.', false, () => startWordTest())
      return
    }
    speakPrompt(`${target.label}로 이동할게요.`, false, () => navigate(target.route))
  }, [navigate, speakPrompt])

  const handlePendingNavigation = useCallback((text: string) => {
    const target = pendingNavigationRef.current
    if (!target) return false
    const normalized = normalizeSpeech(text)
    if (isNavigationAffirmative(normalized)) {
      executeVisionNavigation(target)
      return true
    }
    if (isNavigationNegative(normalized)) {
      pendingNavigationRef.current = null
      speakPrompt('알겠어요. 지금 학습을 계속할게요.')
      return true
    }
    speakPrompt(`${target.label}로 이동할까요? 맞으면 네, 아니면 취소라고 말해 주세요.`)
    return true
  }, [executeVisionNavigation, speakPrompt])

  const handleVisionNavigationRequest = useCallback(async (text: string) => {
    if (!looksLikeVisionNavigationRequest(text)) return false
    const routed = await routeVoiceDialog({
      text,
      state: `TUTOR_${phaseRef.current}`,
      allowedIntents: VISION_NAVIGATION_INTENTS as VoiceIntent[],
      childProfile: { ...profile },
      context: {
        currentPhase: phaseRef.current,
        flowPolicy: {
          decisionOwner: 'rules',
          allowedNextActions: VISION_NAVIGATION_INTENTS,
          forbiddenTasks: ['stt', 'tts', 'grading', 'quiz', 'free_route'],
        },
      },
    }).catch(() => null)
    const target = getVisionNavigationTarget(routed?.intent)
    if (!target || (routed?.confidence || 0) < 0.55) {
      speakPrompt('어느 메뉴로 갈지 잘 모르겠어요. 동화 내용 학습, 단어 공부, 문장 공부, 동화 목록처럼 말해 주세요.')
      return true
    }
    if (target.requiresConfirmation && phaseRef.current !== 'INTRO') {
      pendingNavigationRef.current = target
      speakPrompt(`${target.label}로 이동할까요? 맞으면 네, 아니면 취소라고 말해 주세요.`)
      return true
    }
    executeVisionNavigation(target)
    return true
  }, [executeVisionNavigation, profile, speakPrompt])

  const handleVisionTranscript = useCallback((rawText: string) => {
    const text = rawText.trim()
    const normalized = normalizeSpeech(text)
    if (!text) {
      setVoiceStatus('아직 답변을 듣지 못했어요. 준비되면 화면을 한 번 누르거나 엔터를 눌러 말해 주세요.')
      return
    }
    if (handlePendingNavigation(text)) return
    if (looksLikeVisionNavigationRequest(text)) {
      void handleVisionNavigationRequest(text)
      return
    }

    if (phaseRef.current === 'VOICE_MENU') {
      if (looksLikeVisionNavigationRequest(text)) {
        void handleVisionNavigationRequest(text)
      } else {
        speakPrompt('동화 내용 학습, 단어 공부, 문장 공부, 오늘의 학습, 동화 목록 중에서 말해 주세요.')
      }
      return
    }

    if (phaseRef.current === 'INTRO') {
      if (/시작|하자|응|네|예|좋아/.test(normalized)) startWordTest()
      else speakPrompt('시작하려면 시작이라고 말해 주세요.')
      return
    }

    if (phaseRef.current === 'WORD_TEST') {
      const current = activeTestWords[wordIdxRef.current]
      if (!current) return
      handleWordAnswer(isKnownWordAnswer(current.word, text))
      return
    }

    if (phaseRef.current === 'RECOMMEND_BOOK') {
      const books = recommendedBooksRef.current
      if (/둘|두번째|2/.test(normalized) && books[1]) {
        void selectBook(books[1])
        return
      }
      if (/첫|첫번째|1|시작|읽|들을|추천|응|네|예/.test(normalized) && books[0]) {
        void selectBook(books[0])
        return
      }
      if (/나중|홈|그만|종료/.test(normalized)) {
        dismissTutorToHome()
        return
      }
      speakPrompt('첫 번째 책으로 시작하려면 첫 번째, 두 번째 책으로 시작하려면 두 번째라고 말해 주세요.')
    }
  }, [activeTestWords, dismissTutorToHome, handlePendingNavigation, handleVisionNavigationRequest, speakPrompt])

  useEffect(() => {
    handleVisionTranscriptRef.current = handleVisionTranscript
  }, [handleVisionTranscript])

  useEffect(() => {
    if (!isVisionMode) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter') {
        event.preventDefault()
        startListeningRef.current()
      }
      if (event.key === ' ') {
        event.preventDefault()
        speakPrompt(lastPromptRef.current || bubbleText || '다시 들려줄게요.')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bubbleText, isVisionMode, speakPrompt])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    return () => {
      speechSeqRef.current += 1
      recognitionRef.current?.abort()
      window.speechSynthesis?.cancel()
    }
  }, [])

  useEffect(() => {
    if (bootstrappedRef.current) return
    if (authLoading) return
    if (!user) { navigate('/login'); return }
    bootstrappedRef.current = true
    loadStudyData()
    if (shouldUseVoiceMenu) {
      startVoiceMenu()
      return
    }
    callAI('INTRO')
  }, [authLoading, navigate, shouldUseVoiceMenu, startVoiceMenu, user])

  useEffect(() => {
    if (!isVisionMode || phase !== 'INTRO' || loading || !bubbleText || visionIntroSpokenRef.current) return
    visionIntroSpokenRef.current = true
    speakPrompt(`${bubbleText} 시작하려면 시작이라고 말해 주세요.`)
  }, [bubbleText, isVisionMode, loading, phase, speakPrompt])

  // 학습 데이터 로드 — 오답 단어 + 문장 기반 퀴즈
  async function loadStudyData() {
    try {
      const data = await fetchTutorQuizData()
      if (data.hasData) {
        setHasStudyData(true)
        // 오답 단어로 단어 테스트 구성
        if (data.wordTest.length >= 3) {
          setTestWords(data.wordTest)
        }
        // 오답 단어가 포함된 문장으로 빈칸 퀴즈 구성
        if (data.sentenceQuiz.length >= 1) {
          const quiz = data.sentenceQuiz.map(sq => {
            // 문장에서 단어를 ___로 치환
            const sentence = sq.sentence.replace(sq.word, '___')
            // 오답 선택지 생성 (다른 오답 단어에서)
            const otherWords = data.wordTest
              .map(w => w.word)
              .filter(w => w !== sq.word)
              .sort(() => Math.random() - 0.5)
              .slice(0, 2)
            const options = [sq.word, ...otherWords].sort(() => Math.random() - 0.5)
            return { sentence, answer: sq.word, options }
          })
          setSentenceQuiz(quiz)
        }
      }
    } catch {}
  }

  // AI 호출
  async function callAI(step: Phase, context: Record<string, unknown> = {}) {
    setShowChoices(false)
    setLoading(true)
    setBubbleText('')
    let message = step === 'INTRO'
      ? `안녕 ${childName || '친구'}! 나랑 같이 공부할 준비됐어?`
      : step === 'LEVEL_ANALYSIS'
        ? '잘했어! 너에게 딱 맞는 동화를 찾아줄게!'
        : ''
    try {
      const res = await fetchTutorialStep(profile, step, context)
      message = safeMessageToChild(res?.message_to_child, message)
    } catch {
      if (step === 'INTRO') {
        message = `안녕 ${childName || '친구'}! 나랑 같이 공부할 준비됐어?`
      } else if (step === 'LEVEL_ANALYSIS') {
        message = '잘했어! 너에게 딱 맞는 동화를 찾아줄게!'
      }
    }
    setBubbleText(message)
    setLoading(false)
    setPhase(step)

    // LEVEL_ANALYSIS 후 자동으로 책 추천으로 이동
    if (step === 'LEVEL_ANALYSIS') {
      if (isVisionMode) {
        speakPrompt(`${message} 이어서 맞춤 동화를 찾아볼게요.`, false, () => enterRecommendBook())
      } else {
        setTimeout(() => enterRecommendBook(), 4000)
      }
    } else {
      setTimeout(() => setShowChoices(true), 400)
    }
  }

  async function buildVisionRecommendationNarration(
    books: RecommendedBook[],
    childLevel: 'beginner' | 'intermediate' | 'advanced',
    knownCount: number
  ) {
    const first = safeBookTitle(books[0]?.title, VISION_RECOMMENDED_BOOK_TITLE)
    const second = safeBookTitle(books[1]?.title)
    const fallbackReason = first === VISION_RECOMMENDED_BOOK_TITLE
      ? '방금 암탉과 누렁이 뜻을 말해 봤으니, 같은 동물 단어가 짧은 문장 안에서 다시 나오는 동화로 이어지는 흐름이 좋아요.'
      : '방금 단어 뜻을 말해 봤으니, 짧은 문장과 익숙한 단어가 있는 동화부터 듣는 흐름이 좋아요.'
    const fallback = `오늘은 ${first}를 추천할게요. ${fallbackReason} 바로 시작하려면 첫 번째라고 말해 주세요.${second ? ' 다른 책을 듣고 싶으면 두 번째라고 말해 주세요.' : ''}`

    try {
      const result = await fetchTutorialStep(profile, 'RECOMMEND_BOOK', {
        flow_policy: {
          llm_role: 'narration_only',
          fixed_next_action: 'START_LEARNING',
          fixed_recommendation_title: first,
          decision_owner: 'rules',
          forbidden_tasks: ['stt', 'tts', 'grading', 'book_selection', 'quiz'],
        },
        selected_book: {
          title: first,
          reason: fallbackReason,
        },
        alternative_books: books.slice(1).map(book => safeBookTitle(book.title)).filter(Boolean),
        test_results: testResultsRef.current,
        known_count: knownCount,
        total_count: activeTestWords.length,
        rule_based_level: childLevel,
        allowed_voice_choices: second ? ['첫 번째', '두 번째', '나중'] : ['첫 번째', '나중'],
      })
      const llmMessage = compactSpeechText(result.message_to_child || '')
      if (!isSafeVisionNarration(llmMessage)) return fallback

      const titleAnchored = llmMessage.includes(first)
        ? llmMessage
        : `오늘은 ${first}를 추천할게요. ${llmMessage}`
      const choiceAnchored = /첫\s*번째|시작/.test(titleAnchored)
        ? titleAnchored
        : `${titleAnchored} 바로 시작하려면 첫 번째라고 말해 주세요.${second ? ' 다른 책은 두 번째라고 말해 주세요.' : ''}`
      return compactSpeechText(choiceAnchored)
    } catch {
      return fallback
    }
  }

  // 단어 테스트 시작
  function startWordTest() {
    setPhase('WORD_TEST')
    setWordIdx(0)
    wordIdxRef.current = 0
    setTestResults([])
    testResultsRef.current = []
    const firstWord = activeTestWords[0]
    const visualMessage = `"${firstWord.word}" 이 단어 알아?`
    setBubbleText(visualMessage)
    if (isVisionMode) {
      speakPrompt(`먼저 쉬운 문제 하나를 풀어볼게요. 제가 말하는 단어를 듣고 뜻을 말해 주세요. ${firstWord.word}은 어떤 동물일까요?`)
    }
    setShowChoices(true)
  }

  // 단어 응답
  function handleWordAnswer(known: boolean) {
    const currentIdx = wordIdxRef.current
    const w = activeTestWords[currentIdx]
    if (!w) return
    setShowChoices(false)

    const newResults = [...testResultsRef.current, { word: w.word, known }]
    testResultsRef.current = newResults
    setTestResults(newResults)

    const nextIdx = currentIdx + 1
    const showNextWord = () => {
      wordIdxRef.current = nextIdx
      setWordIdx(nextIdx)
      const visualMessage = `"${activeTestWords[nextIdx].word}" 이 단어는?`
      setBubbleText(visualMessage)
      if (isVisionMode) speakPrompt(`${activeTestWords[nextIdx].word}은 어떤 뜻일까요?`)
      setShowChoices(true)
    }

    const finishWordTest = () => {
      const knownCount = newResults.filter(r => r.known).length
      const isAdvanced = knownCount >= 4

      if (isAdvanced && !hasStudyData && !isVisionMode) {
        // 고급 → 문장 빈칸 퀴즈 추가
        startSentenceQuiz()
      } else {
        // 레벨 분석으로
        callAI('LEVEL_ANALYSIS', {
          test_results: newResults,
          known_count: knownCount,
          total_count: activeTestWords.length,
          accuracy: Math.round((knownCount / activeTestWords.length) * 100),
        })
      }
    }

    const afterFeedback = () => {
      if (nextIdx < activeTestWords.length) showNextWord()
      else finishWordTest()
    }

    setBubbleText(known ? '좋아! 👍' : `${w.hint} 😊`)
    if (isVisionMode) {
      speakPrompt(known ? '좋아! 잘 알고 있구나.' : `${w.hint}. 괜찮아, 같이 익혀보자.`, false, afterFeedback)
    } else {
      setTimeout(afterFeedback, 1200)
    }
  }

  // 문장 빈칸 퀴즈 (고급용)
  function startSentenceQuiz() {
    setPhase('SENTENCE_QUIZ')
    setQuizIdx(0)
    setQuizResults([])
    const q = sentenceQuiz[0]
    setBubbleText(q.sentence)
    setShowChoices(true)
  }

  function handleQuizAnswer(answer: string) {
    const q = sentenceQuiz[quizIdx]
    const correct = answer === q.answer
    const newResults = [...quizResults, correct]
    setQuizResults(newResults)
    setShowChoices(false)

    setBubbleText(correct ? '정답! 잘했어! 🎉' : `"${q.answer}"가 맞아! 괜찮아 😊`)

    const nextIdx = quizIdx + 1
    if (nextIdx < sentenceQuiz.length) {
      setQuizIdx(nextIdx)
      setTimeout(() => {
        setBubbleText(sentenceQuiz[nextIdx].sentence)
        setShowChoices(true)
      }, 1200)
    } else {
      // 퀴즈 완료 → 레벨 분석
      const knownCount = testResults.filter(r => r.known).length
      const quizCorrect = newResults.filter(r => r).length
      setTimeout(() => {
        callAI('LEVEL_ANALYSIS', {
          test_results: testResults,
          known_count: knownCount,
          total_count: activeTestWords.length,
          quiz_results: newResults,
          quiz_correct: quizCorrect,
          quiz_total: sentenceQuiz.length,
          accuracy: Math.round(((knownCount + quizCorrect) / (activeTestWords.length + sentenceQuiz.length)) * 100),
        })
      }, 1200)
    }
  }

  // 책 추천
  async function enterRecommendBook() {
    setPhase('RECOMMEND_BOOK')
    setShowChoices(false)
    setLoading(true)
    setBubbleText('')

    const knownCount = testResultsRef.current.filter(r => r.known).length
    const childLevel: 'beginner' | 'intermediate' | 'advanced' =
      knownCount >= 4 ? 'advanced' : knownCount >= 2 ? 'intermediate' : 'beginner'

    try {
      let books = await fetchRecommendedBooks(childLevel, 2)
      if (isVisionMode) {
        try {
          const featuredBook = toRecommendedBook(await fetchBookForReader(VISION_RECOMMENDED_BOOK_TITLE))
          books = [
            featuredBook,
            ...books.filter(book => book.title !== featuredBook.title),
          ].slice(0, 2)
        } catch {}
      }
      recommendedBooksRef.current = books
      setRecommendedBooks(books)
      setBubbleText('너에게 딱 맞는 동화를 찾았어! 어떤 걸 읽어볼까?')
      if (isVisionMode) {
        const narration = await buildVisionRecommendationNarration(books, childLevel, knownCount)
        speakPrompt(narration)
      }
    } catch {
      if (isVisionMode) {
        try {
          const featuredBook = toRecommendedBook(await fetchBookForReader(VISION_RECOMMENDED_BOOK_TITLE))
          recommendedBooksRef.current = [featuredBook]
          setRecommendedBooks([featuredBook])
          setBubbleText('너에게 딱 맞는 동화를 찾았어! 어떤 걸 읽어볼까?')
          speakPrompt(`오늘은 ${VISION_RECOMMENDED_BOOK_TITLE}를 추천할게요. 문장이 짧고 동물 단어가 많아서 듣기 연습에 좋아요. 시작하려면 첫 번째라고 말해 주세요.`)
        } catch {
          setBubbleText('재미있는 동화를 같이 읽으러 가자!')
          speakPrompt('재미있는 동화를 같이 읽으러 가자!', false)
        }
      } else {
        setBubbleText('재미있는 동화를 같이 읽으러 가자!')
      }
    }
    setLoading(false)
    setShowChoices(true)
  }

  // 책 선택
  async function selectBook(book: RecommendedBook) {
    try {
      const data = await fetchBookForReader(book.title)
      if (isVisionMode) {
        navigate(`/study/voice?book=${encodeURIComponent(data.title)}&entry=vision`)
        return
      }
      const p = new URLSearchParams({
        thumb: data.thumbnail, nlcyThumb: data.nlcyThumb,
        title: data.title, desc: data.description, url: data.url,
      })
      navigate(`/reader?${p}`)
    } catch { navigate('/') }
  }

  // 선택지 렌더링
  function renderBottom() {
    if (!showChoices || loading) return null

    if (phase === 'WORD_TEST') {
      return (
        <div className="tutor-word-buttons">
          <button className="tutor-word-btn know" onClick={event => { event.stopPropagation(); handleWordAnswer(true) }}>
            알것같아!
          </button>
          <button className="tutor-word-btn dont-know" onClick={event => { event.stopPropagation(); handleWordAnswer(false) }}>
            몰라...
          </button>
        </div>
      )
    }
    if (phase === 'SENTENCE_QUIZ') {
      const q = sentenceQuiz[quizIdx]
      return (
        <div className="tutor-quiz-buttons">
          {q.options.map((opt, i) => (
            <button key={i} className="tutor-quiz-btn" onClick={event => { event.stopPropagation(); handleQuizAnswer(opt) }}>
              {opt}
            </button>
          ))}
        </div>
      )
    }
    if (phase === 'VOICE_MENU') {
      return null
    }
    if (phase === 'INTRO') {
      return (
        <div className="tutor-choices">
          <button className="tutor-choice-btn" onClick={event => { event.stopPropagation(); startWordTest() }}>
            시작하자!
          </button>
        </div>
      )
    }
    if (phase === 'RECOMMEND_BOOK') {
      return (
        <button className="tutor-choice-btn tutor-home-btn" onClick={event => { event.stopPropagation(); dismissTutorToHome() }}>
          나중에 읽을래
        </button>
      )
    }
    return null
  }

  return (
    <div
      className="tutor-intro"
      onClick={() => {
        if (!isVisionMode) return
        if (phaseRef.current === 'VOICE_MENU') {
          startListeningRef.current()
          return
        }
        if (phaseRef.current === 'INTRO') startWordTest()
        else if (phaseRef.current !== 'RECOMMEND_BOOK') startListeningRef.current()
      }}
    >
      <div className="tutor-deco tutor-deco-1" />
      <div className="tutor-deco tutor-deco-2" />
      <div className="tutor-deco tutor-deco-3" />

      <div className="tutor-topbar">
        {isVisionMode && (
          <button
            className="tutor-close-btn"
            type="button"
            onClick={event => {
              event.stopPropagation()
              dismissTutorToHome()
            }}
            aria-label="튜터 화면 닫기"
          >
            닫기
          </button>
        )}
        <img src="/svg/logo.png" alt="on-kid" className="tutor-logo" />
        <div className="tutor-profile-menu" ref={profileMenuRef} onClick={event => event.stopPropagation()}>
          <button
            className="tutor-user-pill"
            type="button"
            onClick={() => setProfileMenuOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
          >
            <span className="tutor-user-name">{childName || '게스트'}</span>
            <span className="tutor-user-label">어린이</span>
            <span className="tutor-user-avatar">
              <img src="/svg/숭이.png" alt="" />
            </span>
          </button>
          {profileMenuOpen && (
            <div className="tutor-profile-dropdown" role="menu">
              <button className="tutor-profile-dropdown-item" type="button" role="menuitem" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="tutor-scene">
        <div className="tutor-speech-bubble">
          {loading ? (
            <div className="tutor-speech-body">
              <div className="tutor-typing"><span /><span /><span /></div>
              <div className="tutor-speech-tail" />
            </div>
          ) : (
            <div className="tutor-speech-body">
              <p className="tutor-speech-text">{bubbleText}</p>
              <div className="tutor-speech-tail" />
            </div>
          )}
        </div>

        {phase === 'RECOMMEND_BOOK' && showChoices && recommendedBooks[0] && (
          <div className="tutor-book-card tutor-book-left" onClick={event => { event.stopPropagation(); selectBook(recommendedBooks[0]) }}>
            <div className="tutor-book-cover">
              {recommendedBooks[0].thumbnail
                ? <img src={recommendedBooks[0].thumbnail} alt={recommendedBooks[0].title} />
                : <div className="tutor-book-placeholder">📖</div>}
            </div>
            <div className="tutor-book-title">{recommendedBooks[0].title}</div>
            <div className="tutor-book-desc">{recommendedBooks[0].description?.slice(0, 40) || '재미있는 동화'}</div>
          </div>
        )}

        {phase === 'RECOMMEND_BOOK' && showChoices && recommendedBooks[1] && (
          <div className="tutor-book-card tutor-book-right" onClick={event => { event.stopPropagation(); selectBook(recommendedBooks[1]) }}>
            <div className="tutor-book-cover">
              {recommendedBooks[1].thumbnail
                ? <img src={recommendedBooks[1].thumbnail} alt={recommendedBooks[1].title} />
                : <div className="tutor-book-placeholder">📖</div>}
            </div>
            <div className="tutor-book-title">{recommendedBooks[1].title}</div>
            <div className="tutor-book-desc">{recommendedBooks[1].description?.slice(0, 40) || '재미있는 동화'}</div>
          </div>
        )}

        <div className="tutor-character">
          <div className="tutor-character-circle">
            <img src="/svg/initmonkey.png" alt="튜터" className="tutor-character-img" />
          </div>
        </div>
      </div>

      <div className="tutor-bottom">
        {isVisionMode && voiceStatus && <p className="tutor-voice-status">{voiceStatus}</p>}
        {renderBottom()}
        <button className="tutor-skip-btn" onClick={event => { event.stopPropagation(); dismissTutorToHome() }}>
          건너뛰기 →
        </button>
      </div>
    </div>
  )
}
