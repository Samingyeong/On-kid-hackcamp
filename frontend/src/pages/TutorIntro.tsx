import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchTutorialStep, type ChildProfile } from '../api/midm'
import { fetchBookForReader, fetchRecommendedBooks, fetchTutorQuizData, type RecommendedBook } from '../api/library'
import './TutorIntro.css'

// 기본 단어 테스트 (첫 방문용)
const DEFAULT_WORDS = [
  { word: '사과', hint: '빨간 과일이야' },
  { word: '강아지', hint: '멍멍 하는 동물이야' },
  { word: '무지개', hint: '비 온 뒤 하늘에 나타나' },
  { word: '도서관', hint: '책을 빌려 읽는 곳이야' },
  { word: '모험', hint: '새로운 곳을 탐험하는 거야' },
]

// 고급용 빈칸 퀴즈 (기본값 — 학습 데이터 없을 때)
const DEFAULT_SENTENCE_QUIZ = [
  { sentence: '하늘에서 ___이 내려요', answer: '눈', options: ['눈', '불', '돌'] },
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
  const [sentenceQuiz, setSentenceQuiz] = useState(DEFAULT_SENTENCE_QUIZ)
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
          total_count: testWords.length,
          quiz_results: newResults,
          quiz_correct: quizCorrect,
          quiz_total: sentenceQuiz.length,
          accuracy: Math.round(((knownCount + quizCorrect) / (testWords.length + sentenceQuiz.length)) * 100),
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
  function renderBottom() {
    if (!showChoices || loading) return null

    if (phase === 'WORD_TEST') {
      return (
        <div className="tutor-word-buttons">
          <button className="tutor-word-btn know" onClick={() => handleWordAnswer(true)}>
            알것같아!
          </button>
          <button className="tutor-word-btn dont-know" onClick={() => handleWordAnswer(false)}>
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
            <button key={i} className="tutor-quiz-btn" onClick={() => handleQuizAnswer(opt)}>
              {opt}
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
        <>
          <div className="tutor-book-cards">
            {recommendedBooks.map((book, i) => (
              <div key={i} className="tutor-book-card" onClick={() => selectBook(book)}>
                <div className="tutor-book-cover">
                  {book.thumbnail
                    ? <img src={book.thumbnail} alt={book.title} />
                    : <div className="tutor-book-placeholder">📖</div>}
                </div>
                <div className="tutor-book-title">{book.title}</div>
                <div className="tutor-book-desc">{book.description?.slice(0, 40) || '재미있는 동화'}</div>
              </div>
            ))}
          </div>
          <button className="tutor-choice-btn tutor-home-btn" onClick={() => navigate('/')}>
            나중에 읽을래
          </button>
        </>
      )
    }
    return null
  }

  return (
    <div className="tutor-intro">
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
          <div className="tutor-character-circle">
            <img src="/svg/숭이.png" alt="튜터" className="tutor-character-img" />
          </div>
        </div>
      </div>

      <div className="tutor-bottom">
        {renderBottom()}
        <button className="tutor-skip-btn" onClick={() => navigate('/')}>
          건너뛰기 →
        </button>
      </div>
    </div>
  )
}
