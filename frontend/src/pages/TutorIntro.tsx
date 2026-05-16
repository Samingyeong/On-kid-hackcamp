import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchTutorialStep, type MidmResponse, type ChildProfile } from '../api/midm'
import { fetchBooks, fetchBookForReader, fetchRecommendedBooks, type RecommendedBook } from '../api/library'
import './TutorIntro.css'

// 단어 테스트용 단어 (난이도 순: 초급 → 고급)
const TEST_WORDS = [
  { word: '사과', hint: '빨간 과일이야' },
  { word: '강아지', hint: '멍멍 하는 동물이야' },
  { word: '무지개', hint: '비 온 뒤 하늘에 나타나' },
  { word: '도서관', hint: '책을 빌려 읽는 곳이야' },
  { word: '모험', hint: '새로운 곳을 탐험하는 거야' },
]

type Phase = 'INTRO' | 'WORD_TEST' | 'LEVEL_ANALYSIS' | 'RECOMMEND_BOOK'

export default function TutorIntro() {
  const navigate = useNavigate()
  const { childName, childCharacter, childBirthDate, user } = useAuth()
  const [messages, setMessages] = useState<{ from: 'bot' | 'user'; text: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>('INTRO')
  const [wordIdx, setWordIdx] = useState(0)
  const [testResults, setTestResults] = useState<{ word: string; known: boolean }[]>([])
  const [showChoices, setShowChoices] = useState(false)
  const [recommendedBooks, setRecommendedBooks] = useState<RecommendedBook[]>([])
  const chatRef = useRef<HTMLDivElement>(null)

  const profile: ChildProfile = {
    name: childName || '친구',
    birth_date: childBirthDate || '',
    disability: childCharacter || '',
  }

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    callAI('INTRO')
  }, [])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, loading])

  // AI 호출 (INTRO, LEVEL_ANALYSIS만)
  async function callAI(step: Phase, context: Record<string, unknown> = {}) {
    setShowChoices(false)
    setLoading(true)
    try {
      const res = await fetchTutorialStep(profile, step, context)
      setMessages(prev => [...prev, { from: 'bot', text: res.message_to_child }])
    } catch {
      if (step === 'INTRO') {
        setMessages(prev => [...prev, { from: 'bot', text: `안녕 ${childName || '친구'}! 나랑 같이 공부할 준비됐어? 단어 몇 개만 보여줄게!` }])
      } else if (step === 'LEVEL_ANALYSIS') {
        setMessages(prev => [...prev, { from: 'bot', text: '잘했어! 이제 너에게 딱 맞는 동화를 찾아줄게! 🎉' }])
      }
    }
    setLoading(false)
    setPhase(step)
    setTimeout(() => setShowChoices(true), 400)
  }

  // 단어 테스트 시작
  function startWordTest() {
    setPhase('WORD_TEST')
    setWordIdx(0)
    setTestResults([])
    setShowChoices(false)
    setTimeout(() => {
      setMessages(prev => [...prev, { from: 'bot', text: `"${TEST_WORDS[0].word}" 이 단어 알아?` }])
      setShowChoices(true)
    }, 400)
  }

  // 단어 응답
  function handleWordAnswer(known: boolean) {
    const w = TEST_WORDS[wordIdx]
    setMessages(prev => [...prev, { from: 'user', text: known ? '알아!' : '모르겠어' }])
    setShowChoices(false)

    const newResults = [...testResults, { word: w.word, known }]
    setTestResults(newResults)

    // 짧은 반응
    const reaction = known ? '좋아! 👍' : `${w.hint} 😊`
    setMessages(prev => [...prev, { from: 'bot', text: reaction }])

    const nextIdx = wordIdx + 1
    if (nextIdx < TEST_WORDS.length) {
      setWordIdx(nextIdx)
      setTimeout(() => {
        setMessages(prev => [...prev, { from: 'bot', text: `"${TEST_WORDS[nextIdx].word}" 이 단어는?` }])
        setShowChoices(true)
      }, 800)
    } else {
      // 완료 → LEVEL_ANALYSIS
      setTimeout(() => {
        const knownCount = newResults.filter(r => r.known).length
        callAI('LEVEL_ANALYSIS', {
          test_results: newResults,
          known_count: knownCount,
          total_count: TEST_WORDS.length,
          accuracy: Math.round((knownCount / TEST_WORDS.length) * 100),
        })
      }, 1000)
    }
  }

  // 책 추천 단계 진입
  async function enterRecommendBook() {
    setPhase('RECOMMEND_BOOK')
    setShowChoices(false)
    setLoading(true)

    // 단어 테스트 결과 → 아이 수준 판정
    const knownCount = testResults.filter(r => r.known).length
    const childLevel: 'beginner' | 'intermediate' | 'advanced' =
      knownCount >= 4 ? 'advanced' : knownCount >= 2 ? 'intermediate' : 'beginner'

    try {
      // 난이도 분석된 책 중에서 아이 수준에 맞는 책 추천
      const books = await fetchRecommendedBooks(childLevel, 2)
      setRecommendedBooks(books)
      setMessages(prev => [...prev, { from: 'bot', text: '너에게 딱 맞는 동화를 찾았어! 어떤 걸 읽어볼까?' }])
    } catch {
      setMessages(prev => [...prev, { from: 'bot', text: '재미있는 동화를 같이 읽으러 가자!' }])
    }
    setLoading(false)
    setShowChoices(true)
  }

  // 책 선택 → reader로 이동
  async function selectBook(book: RecommendedBook) {
    try {
      const data = await fetchBookForReader(book.title)
      const p = new URLSearchParams({
        thumb: data.thumbnail,
        nlcyThumb: data.nlcyThumb,
        title: data.title,
        desc: data.description,
        url: data.url,
      })
      navigate(`/reader?${p}`)
    } catch {
      navigate('/')
    }
  }

  // 선택지 렌더링
  function renderChoices() {
    if (!showChoices || loading) return null

    if (phase === 'WORD_TEST') {
      return (
        <div className="tutor-choices">
          <button className="tutor-choice-btn" onClick={() => handleWordAnswer(true)}>
            <span className="tutor-choice-emoji">⭕</span> 알아!
          </button>
          <button className="tutor-choice-btn" onClick={() => handleWordAnswer(false)}>
            <span className="tutor-choice-emoji">❌</span> 모르겠어
          </button>
        </div>
      )
    }

    if (phase === 'INTRO') {
      return (
        <div className="tutor-choices">
          <button className="tutor-choice-btn" onClick={() => {
            setMessages(prev => [...prev, { from: 'user', text: '시작하자!' }])
            startWordTest()
          }}>
            <span className="tutor-choice-emoji">🚀</span> 시작하자!
          </button>
        </div>
      )
    }

    if (phase === 'LEVEL_ANALYSIS') {
      return (
        <div className="tutor-choices">
          <button className="tutor-choice-btn" onClick={() => {
            setMessages(prev => [...prev, { from: 'user', text: '좋아!' }])
            enterRecommendBook()
          }}>
            <span className="tutor-choice-emoji">➡️</span> 좋아!
          </button>
        </div>
      )
    }

    if (phase === 'RECOMMEND_BOOK') {
      return (
        <div className="tutor-recommend">
          <div className="tutor-book-cards">
            {recommendedBooks.map((book, i) => (
              <div key={i} className="tutor-book-card" onClick={() => selectBook(book)}>
                <div className="tutor-book-cover">
                  {book.thumbnail
                    ? <img src={book.thumbnail} alt={book.title} />
                    : <div className="tutor-book-placeholder">📖</div>
                  }
                </div>
                <div className="tutor-book-info">
                  <span className="tutor-book-title">{book.title}</span>
                  <span className="tutor-book-desc">{book.description?.slice(0, 50) || '재미있는 동화'}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="tutor-choice-btn tutor-home-btn" onClick={() => navigate('/')}>
            <span className="tutor-choice-emoji">🏠</span> 나중에 읽을래
          </button>
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

      <div className="tutor-main">
        <div className="tutor-character-wrap">
          <div className="tutor-character-circle">
            <img src="/svg/숭이.png" alt="튜터 캐릭터" className="tutor-character-img" />
          </div>
        </div>

        <div className="tutor-chat" ref={chatRef}>
          {messages.map((msg, i) => (
            <div key={i} className={`tutor-bubble ${msg.from}`}>
              {msg.from === 'bot' && <img src="/svg/숭이.png" alt="" className="tutor-bubble-avatar" />}
              <div className="tutor-bubble-text">{msg.text}</div>
            </div>
          ))}
          {loading && (
            <div className="tutor-bubble bot">
              <img src="/svg/숭이.png" alt="" className="tutor-bubble-avatar" />
              <div className="tutor-bubble-text tutor-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="tutor-choices-area">
        {renderChoices()}
        <button className="tutor-skip-btn" onClick={() => navigate('/')}>
          건너뛰기 →
        </button>
      </div>
    </div>
  )
}
