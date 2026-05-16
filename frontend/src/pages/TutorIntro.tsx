import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchTutorialStep, type ChildProfile } from '../api/midm'
import { fetchBookForReader, fetchRecommendedBooks, fetchStudyWords, type RecommendedBook } from '../api/library'
import './TutorIntro.css'

// 기본 단어 테스트 (첫 방문용)
const DEFAULT_WORDS = [
  { word: '사과', hint: '빨간 과일이야' },
  { word: '강아지', hint: '멍멍 하는 동물이야' },
  { word: '무지개', hint: '비 온 뒤 하늘에 나타나' },
  { word: '도서관', hint: '책을 빌려 읽는 곳이야' },
  { word: '모험', hint: '새로운 곳을 탐험하는 거야' },
]

// 고급용 빈칸 퀴즈
const SENTENCE_QUIZ = [
  { sentence: '___가 하늘에서 내려요', answer: '눈', options: ['눈', '불', '돌'] },
  { sentence: '친구와 ___을 했어요', answer: '약속', options: ['약속', '숙제', '청소'] },
  { sentence: '엄마가 맛있는 ___을 만들었어요', answer: '음식', options: ['음식', '장난감', '그림'] },
]

type Phase = 'INTRO' | 'WORD_TEST' | 'SENTENCE_QUIZ' | 'LEVEL_ANALYSIS' | 'RECOMMEND_BOOK'

export default function TutorIntro() {
  const navigate = useNavigate()
  const { childName, childCharacter, childBirthDate, user } = useAuth()
  const [bubbleText, setBubbleText] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>('INTRO')
  const [wordIdx, setWordIdx] = useState(0)
  const [testResults, setTestResults] = useState<{ word: string; known: boolean }[]>([])
  const [showChoices, setShowChoices] = useState(false)
  const [recommendedBooks, setRecommendedBooks] = useState<RecommendedBook[]>([])
  const [testWords, setTestWords] = useState(DEFAULT_WORDS)
  const [quizIdx, setQuizIdx] = useState(0)
  const [quizResults, setQuizResults] = useState<boolean[]>([])
  const [hasStudyData, setHasStudyData] = useState(false)

  const profile: ChildProfile = {
    name: childName || '친구',
    birth_date: childBirthDate || '',
    disability: childCharacter || '',
  }

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    loadStudyData()
    callAI('INTRO')
  }, [])

  // 학습 데이터 로드 — 오답 단어가 있으면 그걸로 테스트
  async function loadStudyData() {
    try {
      const words = await fetchStudyWords(0) // known=0 (모르는 단어)
      if (words.length >= 3) {
        setHasStudyData(true)
        const shuffled = words.sort(() => Math.random() - 0.5).slice(0, 5)
        setTestWords(shuffled.map(w => ({
          word: w.base_form,
          hint: w.definition || '다시 한번 생각해봐!',
        })))
      }
    } catch {}
  }

  // AI 호출
  async function callAI(step: Phase, context: Record<string, unknown> = {}) {
    setShowChoices(false)
    setLoading(true)
    setBubbleText('')
    try {
      const res = await fetchTutorialStep(profile, step, context)
      setBubbleText(res.message_to_child)
    } catch {
      if (step === 'INTRO') {
        setBubbleText(`안녕 ${childName || '친구'}! 나랑 같이 공부할 준비됐어?`)
      } else if (step === 'LEVEL_ANALYSIS') {
        setBubbleText('잘했어! 너에게 딱 맞는 동화를 찾아줄게!')
      }
    }
    setLoading(false)
    setPhase(step)

    // LEVEL_ANALYSIS 후 자동으로 책 추천으로 이동
    if (step === 'LEVEL_ANALYSIS') {
      setTimeout(() => enterRecommendBook(), 2500)
    } else {
      setTimeout(() => setShowChoices(true), 400)
    }
  }

  // 단어 테스트 시작
  function startWordTest() {
    setPhase('WORD_TEST')
    setWordIdx(0)
    setTestResults([])
    setBubbleText(`"${testWords[0].word}" 이 단어 알아?`)
    setShowChoices(true)
  }

  // 단어 응답
  function handleWordAnswer(known: boolean) {
    const w = testWords[wordIdx]
    setShowChoices(false)

    const newResults = [...testResults, { word: w.word, known }]
    setTestResults(newResults)

    setBubbleText(known ? '좋아! 👍' : `${w.hint} 😊`)

    const nextIdx = wordIdx + 1
    if (nextIdx < testWords.length) {
      setWordIdx(nextIdx)
      setTimeout(() => {
        setBubbleText(`"${testWords[nextIdx].word}" 이 단어는?`)
        setShowChoices(true)
      }, 1200)
    } else {
      // 테스트 완료
      const knownCount = newResults.filter(r => r.known).length
      const isAdvanced = knownCount >= 4

      setTimeout(() => {
        if (isAdvanced && !hasStudyData) {
          // 고급 → 문장 빈칸 퀴즈 추가
          startSentenceQuiz()
        } else {
          // 레벨 분석으로
          callAI('LEVEL_ANALYSIS', {
            test_results: newResults,
            known_count: knownCount,
            total_count: testWords.length,
            accuracy: Math.round((knownCount / testWords.length) * 100),
          })
        }
      }, 1200)
    }
  }

  // 문장 빈칸 퀴즈 (고급용)
  function startSentenceQuiz() {
    setPhase('SENTENCE_QUIZ')
    setQuizIdx(0)
    setQuizResults([])
    const q = SENTENCE_QUIZ[0]
    setBubbleText(q.sentence)
    setShowChoices(true)
  }

  function handleQuizAnswer(answer: string) {
    const q = SENTENCE_QUIZ[quizIdx]
    const correct = answer === q.answer
    const newResults = [...quizResults, correct]
    setQuizResults(newResults)
    setShowChoices(false)

    setBubbleText(correct ? '정답! 잘했어! 🎉' : `"${q.answer}"가 맞아! 괜찮아 😊`)

    const nextIdx = quizIdx + 1
    if (nextIdx < SENTENCE_QUIZ.length) {
      setQuizIdx(nextIdx)
      setTimeout(() => {
        setBubbleText(SENTENCE_QUIZ[nextIdx].sentence)
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
          total_count: testWords.length,
          quiz_results: newResults,
          quiz_correct: quizCorrect,
          quiz_total: SENTENCE_QUIZ.length,
          accuracy: Math.round(((knownCount + quizCorrect) / (testWords.length + SENTENCE_QUIZ.length)) * 100),
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

    const knownCount = testResults.filter(r => r.known).length
    const childLevel: 'beginner' | 'intermediate' | 'advanced' =
      knownCount >= 4 ? 'advanced' : knownCount >= 2 ? 'intermediate' : 'beginner'

    try {
      const books = await fetchRecommendedBooks(childLevel, 2)
      setRecommendedBooks(books)
      setBubbleText('너에게 딱 맞는 동화를 찾았어! 어떤 걸 읽어볼까?')
    } catch {
      setBubbleText('재미있는 동화를 같이 읽으러 가자!')
    }
    setLoading(false)
    setShowChoices(true)
  }

  // 책 선택
  async function selectBook(book: RecommendedBook) {
    try {
      const data = await fetchBookForReader(book.title)
      const p = new URLSearchParams({
        thumb: data.thumbnail, nlcyThumb: data.nlcyThumb,
        title: data.title, desc: data.description, url: data.url,
      })
      navigate(`/reader?${p}`)
    } catch { navigate('/') }
  }

  // 선택지 렌더링
  function renderChoices() {
    if (!showChoices || loading) return null

    if (phase === 'WORD_TEST') {
      return (
        <div className="tutor-side-choices">
          <button className="tutor-side-card" onClick={() => handleWordAnswer(true)}>
            <span className="tutor-side-label">알아!</span>
          </button>
          <button className="tutor-side-card" onClick={() => handleWordAnswer(false)}>
            <span className="tutor-side-label">모르겠어</span>
          </button>
        </div>
      )
    }
    if (phase === 'SENTENCE_QUIZ') {
      const q = SENTENCE_QUIZ[quizIdx]
      return (
        <div className="tutor-side-choices tutor-quiz-choices">
          {q.options.map((opt, i) => (
            <button key={i} className="tutor-side-card tutor-quiz-card" onClick={() => handleQuizAnswer(opt)}>
              <span className="tutor-side-label">{opt}</span>
            </button>
          ))}
        </div>
      )
    }
    if (phase === 'INTRO') {
      return (
        <div className="tutor-choices">
          <button className="tutor-choice-btn" onClick={() => startWordTest()}>
            시작하자!
          </button>
        </div>
      )
    }
    if (phase === 'RECOMMEND_BOOK') {
      return (
        <div className="tutor-side-choices">
          {recommendedBooks.map((book, i) => (
            <div key={i} className="tutor-side-card tutor-book-side" onClick={() => selectBook(book)}>
              <div className="tutor-book-cover">
                {book.thumbnail
                  ? <img src={book.thumbnail} alt={book.title} />
                  : <div className="tutor-book-placeholder">📖</div>}
              </div>
              <span className="tutor-book-title">{book.title}</span>
              <span className="tutor-book-desc">{book.description?.slice(0, 30) || '재미있는 동화'}</span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="tutor-intro">
      <div className="tutor-bg" />
      <div className="tutor-deco tutor-deco-1" />
      <div className="tutor-deco tutor-deco-2" />
      <div className="tutor-deco tutor-deco-3" />

      <div className="tutor-topbar">
        <img src="/svg/logo.png" alt="on-kid" className="tutor-logo" />
        <div className="tutor-user-pill">
          <span className="tutor-user-name">{childName || '게스트'}</span>
          <span className="tutor-user-label">어린이</span>
          <div className="tutor-user-avatar">
            <img src="/svg/숭이.png" alt="" />
          </div>
        </div>
      </div>

      <div className="tutor-scene">
        <div className="tutor-speech-bubble">
          {loading ? (
            <div className="tutor-typing">
              <span /><span /><span />
            </div>
          ) : (
            <p className="tutor-speech-text">{bubbleText}</p>
          )}
        </div>

        <div className="tutor-character">
          <img src="/svg/숭이.png" alt="튜터" className="tutor-character-img" />
        </div>

        {(phase === 'WORD_TEST' || phase === 'SENTENCE_QUIZ' || phase === 'RECOMMEND_BOOK') && showChoices && !loading && renderChoices()}
      </div>

      <div className="tutor-bottom">
        {phase === 'INTRO' && showChoices && !loading && renderChoices()}
        {phase === 'RECOMMEND_BOOK' && showChoices && (
          <button className="tutor-choice-btn tutor-home-btn" onClick={() => navigate('/')}>
            나중에 읽을래
          </button>
        )}
        <button className="tutor-skip-btn" onClick={() => navigate('/')}>
          건너뛰기 →
        </button>
      </div>
    </div>
  )
}
