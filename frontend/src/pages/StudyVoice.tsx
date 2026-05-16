import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchBookSentences,
  fetchStudyWords,
  markSentenceLearned,
  routeVoiceDialog,
  startVoiceSession,
  updateWordKnown,
  type BookSentence,
  type StudyWord,
  type VoiceIntent,
} from '../api/library'
import { fetchWordExplanation } from '../api/midm'
import { useAuth } from '../contexts/AuthContext'
import {
  getVisionNavigationTarget,
  isNavigationAffirmative,
  isNavigationNegative,
  VISION_NAVIGATION_INTENTS,
  type VisionNavigationTarget,
} from '../utils/visionVoiceNavigation'
import './StudyVoice.css'

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
type StudyMode = 'story' | 'word' | 'sentence'

const DEMO_WORDS: StudyWord[] = [
  { id: -13, word: '암탉', base_form: '암탉', pos: 'NOUN', definition: '달걀을 낳는 닭', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -2, word: '누렁이', base_form: '누렁이', pos: 'NOUN', definition: '누런 빛을 띤 강아지를 부르는 말', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -3, word: '강아지', base_form: '강아지', pos: 'NOUN', definition: '어린 개', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -1, word: '주인', base_form: '주인', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -4, word: '성큼성큼', base_form: '성큼성큼', pos: 'ADV', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -5, word: '부리', base_form: '부리', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -6, word: '마당', base_form: '마당', pos: 'NOUN', definition: '집 밖의 넓은 빈 곳', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -7, word: '친구', base_form: '친구', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -8, word: '울타리', base_form: '울타리', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -9, word: '꼬리', base_form: '꼬리', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -10, word: '아침', base_form: '아침', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -11, word: '노래', base_form: '노래', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
  { id: -12, word: '약속', base_form: '약속', pos: 'NOUN', definition: '', known: 0, from_book: '암탉과 누렁이', created_at: '' },
]

const VISION_STORY_SEGMENTS = [
  { text: '아침이 되었어요. 암탉이 마당으로 나왔어요.', focusWord: '암탉' },
  { text: '암탉은 누렁이를 만났어요.', focusWord: '누렁이' },
  { text: '누렁이는 꼬리를 흔들며 암탉에게 다가왔어요.', focusWord: '꼬리' },
  { text: '암탉과 누렁이는 함께 마당을 걸었어요.', focusWord: '마당' },
  { text: '둘은 내일도 다시 만나기로 했어요.', focusWord: '약속' },
]

const FALLBACK_SENTENCES: BookSentence[] = VISION_STORY_SEGMENTS.slice(0, 4).map(item => ({
  sentence: item.text,
  learned: 0,
}))

function resolveStudyMode(value: string | null): StudyMode {
  if (value === 'story' || value === 'sentence') return value
  return 'word'
}

function normalizeVoiceText(text: string) {
  return text.toLowerCase().replace(/[.,!?~…\s]/g, '')
}

function compactSpeechText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function hasBadSpeechPlaceholder(text: string) {
  return /\b(undefined|null|nan)\b/i.test(text)
}

function isSafeVoiceText(text: string) {
  return Boolean(text) &&
    text.length <= 180 &&
    !hasBadSpeechPlaceholder(text) &&
    !/(화면|그림을 봐|버튼을 눌러|클릭)/.test(text)
}

export default function StudyVoice() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { childName, childCharacter, childBirthDate } = useAuth()
  const book = params.get('book') || ''
  const studyMode = resolveStudyMode(params.get('mode'))
  const isVisionMode = childCharacter === 'vision' || params.get('entry') === 'vision'

  const [words, setWords] = useState<StudyWord[]>([])
  const [sentences, setSentences] = useState<BookSentence[]>(FALLBACK_SENTENCES)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [storyIdx, setStoryIdx] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const sessionIdRef = useRef<number | null>(null)
  const wordsRef = useRef<StudyWord[]>([])
  const sentencesRef = useRef<BookSentence[]>(FALLBACK_SENTENCES)
  const currentIdxRef = useRef(0)
  const storyIdxRef = useRef(0)
  const speechSeqRef = useRef(0)
  const pendingNavigationRef = useRef<VisionNavigationTarget | null>(null)
  const listenAfterSpeechRef = useRef<() => void>(() => {})

  useEffect(() => { wordsRef.current = words }, [words])
  useEffect(() => { sentencesRef.current = sentences }, [sentences])
  useEffect(() => { currentIdxRef.current = currentIdx }, [currentIdx])
  useEffect(() => { storyIdxRef.current = storyIdx }, [storyIdx])

  useEffect(() => {
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) setSupported(false)
  }, [])

  useEffect(() => {
    if (!isVisionMode) return
    startVoiceSession(book || '암탉과 누렁이')
      .then(data => { sessionIdRef.current = data.sessionId })
      .catch(() => { sessionIdRef.current = null })
  }, [book, isVisionMode])

  useEffect(() => {
    let cancelled = false

    fetchStudyWords(0)
      .then(list => {
        if (cancelled) return
        const filtered = book ? list.filter(word => word.from_book === book) : list
        setWords(filtered.length > 0 ? filtered : DEMO_WORDS)
        setCurrentIdx(filtered.length > 0 ? 0 : isVisionMode ? 0 : 2)
      })
      .catch(() => {
        if (cancelled) return
        setWords(DEMO_WORDS)
        setCurrentIdx(isVisionMode ? 0 : 2)
      })

    return () => {
      cancelled = true
      speechSeqRef.current += 1
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [book, isVisionMode])

  useEffect(() => {
    if (studyMode !== 'sentence') return
    let cancelled = false
    fetchBookSentences(book || '암탉과 누렁이')
      .then(list => {
        if (cancelled) return
        setSentences(list.length > 0 ? list : FALLBACK_SENTENCES)
        setStoryIdx(0)
        storyIdxRef.current = 0
      })
      .catch(() => {
        if (cancelled) return
        setSentences(FALLBACK_SENTENCES)
        setStoryIdx(0)
        storyIdxRef.current = 0
      })
    return () => { cancelled = true }
  }, [book, studyMode])

  const currentWord = words[currentIdx]?.base_form || ''
  const chars = currentWord.split('')
  const currentBookTitle = book || words[currentIdx]?.from_book || '암탉과 누렁이'
  const currentStorySegment = VISION_STORY_SEGMENTS[storyIdx] || VISION_STORY_SEGMENTS[0]
  const currentSentenceItem = sentences[storyIdx] || FALLBACK_SENTENCES[0]
  const currentSentence = currentSentenceItem?.sentence || ''
  const sentenceFocusWord =
    DEMO_WORDS.find(word => currentSentence.includes(word.base_form))?.base_form ||
    currentSentence.split(/[ ,.!?~]+/).find(Boolean) ||
    '문장'
  const currentDisplayText = studyMode === 'story'
    ? currentStorySegment.text
    : studyMode === 'sentence'
      ? currentSentence
      : currentWord
  const currentModeTotal = studyMode === 'story'
    ? VISION_STORY_SEGMENTS.length
    : studyMode === 'sentence'
      ? sentences.length
      : words.length

  const speak = useCallback((text: string, listenAfter = false, onDone?: () => void) => {
    const safeText = compactSpeechText(String(text ?? ''))
    if (!safeText || hasBadSpeechPlaceholder(safeText)) {
      onDone?.()
      return
    }
    if (!window.speechSynthesis) {
      onDone?.()
      if (listenAfter) window.setTimeout(() => listenAfterSpeechRef.current(), 250)
      return
    }
    const speechSeq = speechSeqRef.current + 1
    speechSeqRef.current = speechSeq
    recognitionRef.current?.stop()
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(safeText)
    utterance.lang = 'ko-KR'
    utterance.rate = 0.85
    utterance.pitch = 1.1
    const finishSpeech = () => {
      if (speechSeq !== speechSeqRef.current) return
      onDone?.()
      if (listenAfter) window.setTimeout(() => listenAfterSpeechRef.current(), 300)
    }
    utterance.onend = finishSpeech
    utterance.onerror = finishSpeech
    window.speechSynthesis.speak(utterance)
  }, [])

  useEffect(() => {
    if (!isVisionMode) return
    const timer = window.setTimeout(() => {
      if (studyMode === 'story') {
        const intro = storyIdx === 0
          ? `${currentBookTitle} 동화 내용 학습을 시작할게요. 첫 번째 문장이에요.`
          : '다음 문장이에요.'
        speak(`${intro} ${currentStorySegment.text} 다시 듣고 싶으면 다시, 단어 뜻을 알고 싶으면 단어 설명, 계속하려면 다음이라고 말해 주세요.`, true)
        return
      }

      if (studyMode === 'sentence') {
        const intro = storyIdx === 0
          ? `${currentBookTitle} 문장 공부를 시작할게요.`
          : '다음 문장으로 넘어갈게요.'
        speak(`${intro} 제가 먼저 말할게요. ${currentSentence} 이제 문장을 따라 말해 주세요.`, true)
        return
      }

      if (!currentWord) return
      const intro = currentIdx === 0
        ? `${currentBookTitle} 단어 학습을 시작할게요.`
        : '다음 단어로 넘어갈게요.'
      speak(`${intro} 따라 말할 단어는 ${currentWord}예요. ${currentWord}. 듣고 그대로 말해 주세요.`, true)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [currentBookTitle, currentIdx, currentSentence, currentStorySegment, currentWord, isVisionMode, speak, storyIdx, studyMode])

  const completeCurrentWord = useCallback(() => {
    const index = currentIdxRef.current
    const word = wordsRef.current[index]
    if (!word) return
    if (word.id > 0) updateWordKnown(word.id, 1).catch(() => {})
    wordsRef.current = wordsRef.current.map((item, itemIdx) => (
      itemIdx === index ? { ...item, known: 1 } : item
    ))
    setWords(wordsRef.current)
  }, [])

  const speakResultSummary = useCallback((onDone?: () => void) => {
    const learnedCount = wordsRef.current.filter(word => word.known === 1).length
    const totalCount = wordsRef.current.length || 1
    speak(`오늘은 동화 ${currentBookTitle}의 단어 ${totalCount}개 중 ${learnedCount}개를 연습했어요. 내일은 암탉과 누렁이를 다시 복습하면 좋아요.`, false, onDone)
  }, [currentBookTitle, speak])

  const speakModeSummary = useCallback((onDone?: () => void) => {
    if (studyMode === 'story') {
      speak(`오늘은 ${currentBookTitle} 동화 내용을 ${VISION_STORY_SEGMENTS.length}문장 들었어요. 내일은 암탉과 누렁이를 다시 들어보면 좋아요.`, false, onDone)
      return
    }
    if (studyMode === 'sentence') {
      const learnedCount = sentencesRef.current.filter(sentence => sentence.learned === 1).length
      const totalCount = sentencesRef.current.length || FALLBACK_SENTENCES.length
      speak(`오늘은 ${currentBookTitle}의 문장 ${totalCount}개 중 ${learnedCount}개를 따라 말했어요. 다음에는 누렁이가 나오는 문장을 다시 연습하면 좋아요.`, false, onDone)
      return
    }
    speakResultSummary(onDone)
  }, [currentBookTitle, speak, speakResultSummary, studyMode])

  const moveToNextStoryItem = useCallback(() => {
    const total = studyMode === 'story' ? VISION_STORY_SEGMENTS.length : sentencesRef.current.length
    const nextIdx = storyIdxRef.current + 1
    if (nextIdx >= total) {
      speakModeSummary()
      return
    }
    setFeedback(null)
    storyIdxRef.current = nextIdx
    setStoryIdx(nextIdx)
  }, [speakModeSummary, studyMode])

  const moveToPreviousStoryItem = useCallback(() => {
    const prevIdx = storyIdxRef.current - 1
    if (prevIdx < 0) {
      speak('첫 번째 문장이에요. 다시 들려줄게요.', false, () => {
        storyIdxRef.current = 0
        setStoryIdx(0)
      })
      return
    }
    setFeedback(null)
    storyIdxRef.current = prevIdx
    setStoryIdx(prevIdx)
  }, [speak])

  const completeCurrentSentence = useCallback(() => {
    const index = storyIdxRef.current
    const sentence = sentencesRef.current[index]
    if (!sentence) return
    markSentenceLearned(currentBookTitle, sentence.sentence).catch(() => {})
    sentencesRef.current = sentencesRef.current.map((item, itemIdx) => (
      itemIdx === index ? { ...item, learned: 1 } : item
    ))
    setSentences(sentencesRef.current)
  }, [currentBookTitle])

  const buildWordHelpNarration = useCallback(async (word: StudyWord | undefined, targetWord: string) => {
    const fallback = word?.definition
      ? `${targetWord}는 ${word.definition}이라는 뜻이에요.`
      : `${targetWord}는 ${currentBookTitle}에 나오는 단어예요.`

    try {
      const result = await fetchWordExplanation({
        name: childName || '친구',
        birth_date: childBirthDate || '',
        disability: childCharacter || 'vision',
      }, targetWord, word?.definition || '')
      const message = compactSpeechText(result.message_to_child || '')
      if (!isSafeVoiceText(message)) return fallback
      return message.includes(targetWord) ? message : `${targetWord}는 ${message}`
    } catch {
      return fallback
    }
  }, [childBirthDate, childCharacter, childName, currentBookTitle])

  const moveToNextWord = useCallback(() => {
    const nextIdx = currentIdxRef.current + 1
    if (nextIdx >= wordsRef.current.length) {
      speakResultSummary()
      return
    }
    setFeedback(null)
    currentIdxRef.current = nextIdx
    setCurrentIdx(nextIdx)
  }, [speakResultSummary])

  const moveToPreviousWord = useCallback(() => {
    const prevIdx = currentIdxRef.current - 1
    if (prevIdx < 0) {
      speak('첫 번째 단어예요. 다시 들려줄게요.', true)
      return
    }
    setFeedback(null)
    currentIdxRef.current = prevIdx
    setCurrentIdx(prevIdx)
  }, [speak])

  const executeVisionNavigation = useCallback((target: VisionNavigationTarget) => {
    pendingNavigationRef.current = null
    speak(`${target.label}로 이동할게요.`, false, () => navigate(target.route))
  }, [navigate, speak])

  const handleVoiceResult = useCallback(async (heardTexts: string[]) => {
    const activeWord = wordsRef.current[currentIdxRef.current]
    const activeStorySegment = VISION_STORY_SEGMENTS[storyIdxRef.current] || VISION_STORY_SEGMENTS[0]
    const activeSentenceText = sentencesRef.current[storyIdxRef.current]?.sentence || FALLBACK_SENTENCES[0].sentence
    const sentenceWord = wordsRef.current.find(word => activeSentenceText.includes(word.base_form))?.base_form || sentenceFocusWord
    const targetWord = studyMode === 'story'
      ? activeStorySegment.focusWord
      : studyMode === 'sentence'
        ? sentenceWord
        : activeWord?.base_form || currentWord
    const joinedText = heardTexts.join(' ').trim()
    const normalizedText = joinedText.replace(/\s/g, '')
    if (!joinedText) {
      speak('아직 답변을 듣지 못했어요. 준비되면 마이크 버튼이나 엔터를 눌러 다시 말해 주세요.', false)
      return
    }

    if (pendingNavigationRef.current) {
      const target = pendingNavigationRef.current
      if (isNavigationAffirmative(normalizedText)) {
        executeVisionNavigation(target)
        return
      }
      if (isNavigationNegative(normalizedText)) {
        pendingNavigationRef.current = null
        speak(`알겠어요. ${targetWord}를 계속 연습할게요. ${targetWord}.`, true)
        return
      }
      speak(`${target.label}로 이동할까요? 맞으면 네, 아니면 취소라고 말해 주세요.`, true)
      return
    }

    if (studyMode !== 'word') {
      const allowedIntents: VoiceIntent[] = [
        'NEXT',
        'PREVIOUS',
        'REPEAT',
        'HINT',
        'EXPLAIN_WORD',
        'STOP',
        ...(VISION_NAVIGATION_INTENTS as VoiceIntent[]),
      ]

      if (studyMode === 'sentence') {
        const heardNormalized = normalizeVoiceText(joinedText)
        const keywordCandidates = wordsRef.current
          .map(word => word.base_form)
          .filter(word => activeSentenceText.includes(word))
        const keywordHits = keywordCandidates.filter(word => heardNormalized.includes(normalizeVoiceText(word))).length
        const sentenceMatched = keywordCandidates.length > 0
          ? keywordHits >= Math.min(2, keywordCandidates.length)
          : heardNormalized.length >= 4 && normalizeVoiceText(activeSentenceText).includes(heardNormalized.slice(0, 4))

        if (sentenceMatched) {
          completeCurrentSentence()
          setFeedback('correct')
          speak('좋아요. 문장을 잘 따라 말했어요. 다음 문장으로 넘어갈게요.', false, moveToNextStoryItem)
          return
        }
      }

      const routed = await routeVoiceDialog({
        text: joinedText,
        sessionId: sessionIdRef.current,
        state: studyMode === 'story' ? 'STORY_LISTENING' : 'SENTENCE_PRACTICE',
        allowedIntents,
        childProfile: {
          name: childName || '친구',
          birth_date: childBirthDate || '',
          disability: childCharacter || 'vision',
        },
        context: {
          bookTitle: currentBookTitle,
          targetWord,
          currentSentence: studyMode === 'story' ? activeStorySegment.text : activeSentenceText,
          progress: {
            currentIndex: storyIdxRef.current + 1,
            totalItems: studyMode === 'story' ? VISION_STORY_SEGMENTS.length : sentencesRef.current.length,
          },
          flowPolicy: {
            decisionOwner: 'rules',
            allowedNextActions: allowedIntents,
            forbiddenTasks: ['stt', 'tts', 'grading', 'quiz', 'free_route'],
          },
        },
      }).catch(() => null)

      const navigationTarget = getVisionNavigationTarget(routed?.intent)
      if (navigationTarget) {
        if (navigationTarget.requiresConfirmation || navigationTarget.intent !== 'OPEN_VOICE_STUDY') {
          pendingNavigationRef.current = navigationTarget
          speak(`학습을 멈추고 ${navigationTarget.label}로 이동할까요? 맞으면 네, 아니면 취소라고 말해 주세요.`, true)
          return
        }
        executeVisionNavigation(navigationTarget)
        return
      }

      if (routed?.intent === 'NEXT') {
        moveToNextStoryItem()
        return
      }
      if (routed?.intent === 'PREVIOUS') {
        moveToPreviousStoryItem()
        return
      }
      if (routed?.intent === 'REPEAT') {
        const repeatedText = studyMode === 'story' ? activeStorySegment.text : activeSentenceText
        speak(`다시 들려줄게요. ${repeatedText}`, true)
        return
      }
      if (routed?.intent === 'HINT' || routed?.intent === 'EXPLAIN_WORD') {
        const wordForHelp = wordsRef.current.find(word => word.base_form === targetWord)
        const explanation = await buildWordHelpNarration(wordForHelp, targetWord)
        const nextPrompt = studyMode === 'story'
          ? '계속하려면 다음이라고 말해 주세요.'
          : `${activeSentenceText} 이제 문장을 따라 말해 주세요.`
        speak(`${explanation} ${nextPrompt}`, true)
        return
      }
      if (routed?.intent === 'STOP') {
        speakModeSummary(() => navigate('/tutor?entry=home'))
        return
      }

      if (studyMode === 'story') {
        speak('다시 듣고 싶으면 다시, 단어 뜻은 단어 설명, 계속하려면 다음이라고 말해 주세요.', true)
      } else {
        setFeedback('wrong')
        speak(`조금 다르게 들렸어요. 다시 한 번 따라 말해 볼게요. ${activeSentenceText}`, true)
      }
      return
    }

    const compactTexts = heardTexts.map(text => text.replace(/\s/g, ''))
    const compactTarget = targetWord.replace(/\s/g, '')
    const saidTarget = compactTexts.some(text => (
      text.length > 0 && (text === compactTarget || text.includes(compactTarget) || compactTarget.includes(text))
    ))

    if (saidTarget) {
      completeCurrentWord()
      setFeedback('correct')
      speak('정확해요. 다음 단어로 넘어갈게요.', false, moveToNextWord)
      return
    }

    const allowedIntents: VoiceIntent[] = [
      'NEXT',
      'PREVIOUS',
      'REPEAT',
      'HINT',
      'EXPLAIN_WORD',
      'STOP',
      ...(VISION_NAVIGATION_INTENTS as VoiceIntent[]),
    ]
    const routed = await routeVoiceDialog({
      text: joinedText,
      sessionId: sessionIdRef.current,
      state: 'WORD_LEARNING',
      allowedIntents,
      childProfile: {
        name: childName || '친구',
        birth_date: childBirthDate || '',
        disability: childCharacter || 'vision',
      },
      context: {
        bookTitle: currentBookTitle,
        targetWord,
        progress: {
          currentIndex: currentIdxRef.current + 1,
          totalWords: wordsRef.current.length,
          knownWords: wordsRef.current.filter(word => word.known === 1).length,
        },
        flowPolicy: {
          decisionOwner: 'rules',
          allowedNextActions: allowedIntents,
          forbiddenTasks: ['stt', 'tts', 'grading', 'quiz', 'free_route'],
        },
      },
    }).catch(() => null)

    const navigationTarget = getVisionNavigationTarget(routed?.intent)
    if (navigationTarget) {
      if (navigationTarget.requiresConfirmation || navigationTarget.intent !== 'OPEN_VOICE_STUDY') {
        pendingNavigationRef.current = navigationTarget
        speak(`학습을 멈추고 ${navigationTarget.label}로 이동할까요? 맞으면 네, 아니면 취소라고 말해 주세요.`, true)
        return
      }
      executeVisionNavigation(navigationTarget)
      return
    }

    if (routed?.intent === 'NEXT') {
      moveToNextWord()
      return
    }
    if (routed?.intent === 'PREVIOUS') {
      moveToPreviousWord()
      return
    }
    if (routed?.intent === 'REPEAT') {
      speak(`다시 들려줄게요. ${targetWord}. 듣고 그대로 말해 주세요.`, true)
      return
    }
    if (routed?.intent === 'HINT' || routed?.intent === 'EXPLAIN_WORD') {
      const explanation = await buildWordHelpNarration(activeWord, targetWord)
      speak(`${explanation} 이제 ${targetWord}를 따라 말해 주세요.`, true)
      return
    }
    if (routed?.intent === 'STOP') {
      speakResultSummary(() => navigate(isVisionMode ? '/tutor?entry=home' : '/'))
      return
    }

    setFeedback('wrong')
    speak(`조금 다르게 들렸어요. 다시 한 번 ${targetWord}라고 말해 주세요.`, true)
  }, [
    completeCurrentWord,
    buildWordHelpNarration,
    childBirthDate,
    childCharacter,
    childName,
    currentBookTitle,
    currentWord,
    completeCurrentSentence,
    executeVisionNavigation,
    sentenceFocusWord,
    moveToNextStoryItem,
    moveToNextWord,
    moveToPreviousStoryItem,
    moveToPreviousWord,
    navigate,
    speak,
    speakModeSummary,
    speakResultSummary,
    studyMode,
    isVisionMode,
  ])

  const handleListen = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }

    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Recognition) return
    if (studyMode === 'word' && !currentWord) return
    if (studyMode === 'sentence' && !currentSentence) return

    const recognition = new Recognition()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 3

    recognition.onresult = event => {
      const result = event.results[0]
      const heard = Array.from({ length: result.length }, (_, index) => result[index]?.transcript.trim() || '')
      setIsListening(false)
      void handleVoiceResult(heard)
    }

    recognition.onerror = () => {
      setIsListening(false)
      setFeedback('wrong')
      if (isVisionMode) speak('아직 답변을 듣지 못했어요. 준비되면 마이크 버튼이나 엔터를 눌러 다시 말해 주세요.', false)
    }
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    setFeedback(null)
    setIsListening(true)
    try {
      recognition.start()
    } catch {
      setIsListening(false)
      if (isVisionMode) speak('음성 인식을 바로 시작하지 못했어요. 엔터를 누른 뒤 다시 말해 주세요.', false)
    }
  }, [currentSentence, currentWord, handleVoiceResult, isListening, isVisionMode, speak, studyMode])

  useEffect(() => {
    listenAfterSpeechRef.current = handleListen
  }, [handleListen])

  const handlePrev = useCallback(() => {
    if (studyMode !== 'word') {
      moveToPreviousStoryItem()
      return
    }
    setCurrentIdx(index => {
      const nextIndex = Math.max(0, index - 1)
      currentIdxRef.current = nextIndex
      return nextIndex
    })
    setFeedback(null)
  }, [moveToPreviousStoryItem, studyMode])

  const handleNext = useCallback(() => {
    if (studyMode !== 'word') {
      moveToNextStoryItem()
      return
    }
    setCurrentIdx(index => {
      const nextIndex = Math.min(Math.max(0, wordsRef.current.length - 1), index + 1)
      currentIdxRef.current = nextIndex
      return nextIndex
    })
    setFeedback(null)
  }, [moveToNextStoryItem, studyMode])

  useEffect(() => {
    if (!isVisionMode) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter') {
        event.preventDefault()
        handleListen()
      }
      if (event.key === ' ') {
        event.preventDefault()
        speak(currentDisplayText)
      }
      if (event.key === 'ArrowRight' && (studyMode !== 'word' || currentIdx < words.length - 1)) handleNext()
      if (event.key === 'ArrowLeft' && (studyMode !== 'word' || currentIdx > 0)) handlePrev()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentDisplayText, currentIdx, handleListen, handleNext, handlePrev, isVisionMode, speak, studyMode, words.length])

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

  if (studyMode === 'word' && words.length === 0) {
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
        <button className="sv-home-button" type="button" onClick={() => navigate(isVisionMode ? '/tutor?entry=home' : '/')} aria-label="홈으로 이동">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 11.2 12 4l8 7.2v8.6a1 1 0 0 1-1 1h-5.1v-6.2h-3.8v6.2H5a1 1 0 0 1-1-1v-8.6Z" />
          </svg>
        </button>
        <img className="sv-logo" src="/svg/logo.png" alt="on-kid" />
        <div className="sv-profile" aria-label="사용자 정보">
          <span className="sv-profile-name">{childName || '어린이'}</span>
          <span className="sv-profile-type">어린이</span>
          <img src="/svg/initmonkey.png" alt="" className="sv-profile-avatar" />
        </div>
      </header>

      <main className="sv-stage">
        <section className="sv-character-panel" aria-live="polite">
          <div className="sv-speech-bubble">
            {isListening
              ? '응응 듣고있어!'
              : studyMode === 'story'
                ? '동화를 듣고 말로 골라요'
                : studyMode === 'sentence'
                  ? '문장을 듣고 따라 말해요'
                  : isVisionMode ? '단어를 듣고 따라 말해요' : '한번 따라 말해볼까?'}
          </div>
          <img
            src={isListening ? '/svg/speakmonkey2.png' : '/svg/speakmonkey.png'}
            alt="따라말하기 캐릭터"
            className="sv-monkey"
          />
        </section>

        <section className="sv-word-panel" aria-label={studyMode === 'word' ? '따라말하기 단어' : '음성 학습 문장'}>
          <button
            className="sv-arrow previous"
            type="button"
            onClick={handlePrev}
            disabled={studyMode === 'word' ? currentIdx === 0 : storyIdx === 0}
            aria-label={studyMode === 'word' ? '이전 단어' : '이전 문장'}
          >
            ‹
          </button>
          <div className="sv-card">
            {studyMode === 'word' ? (
              <div className="sv-char-row" aria-label={`목표 단어 ${currentWord}`}>
                {chars.map((char, index) => (
                  <div key={`${char}-${index}`} className={`sv-char-cell ${feedback === 'correct' ? 'correct' : ''}`}>
                    {char}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`sv-sentence-card ${feedback === 'correct' ? 'correct' : ''}`} aria-label={`학습 문장 ${currentDisplayText}`}>
                {currentDisplayText}
              </div>
            )}

            <div className="sv-actions">
              <button className="sv-listen-button" type="button" onClick={() => speak(currentDisplayText)} aria-label="다시 듣기">
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
          <button
            className="sv-arrow next"
            type="button"
            onClick={handleNext}
            disabled={studyMode === 'word' ? currentIdx >= words.length - 1 : storyIdx >= currentModeTotal - 1}
            aria-label={studyMode === 'word' ? '다음 단어' : '다음 문장'}
          >
            ›
          </button>
        </section>

        <div className="sv-progress" aria-label={`진행 ${(studyMode === 'word' ? currentIdx : storyIdx) + 1}/${currentModeTotal}`}>
          {(studyMode === 'word' ? currentIdx : storyIdx) + 1}/{currentModeTotal}
        </div>
      </main>
    </div>
  )
}
