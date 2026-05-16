import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './FeedbackChat.css'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

// 페이지별 기본 응원 메시지 (AI 응답 전 즉시 표시)
const PAGE_MESSAGES: Record<string, string[]> = {
  '/': ['오늘도 재미있게 공부하자! 🎉', '어떤 동화 읽어볼까?', '오늘의 추천 책이 기다리고 있어!'],
  '/study/select': ['어떤 공부를 해볼까? 🤔', '뭐든 재미있을 거야!'],
  '/study/typing': ['타자 연습 시작! 손가락 준비~ ⌨️', '천천히 정확하게 쳐보자!', '한 글자씩 도전해보자!'],
  '/study/voice': ['큰 소리로 따라 말해봐! 🎤', '자신있게 말해보자!'],
  '/study/sign': ['수어 동작 따라해보자! ✋', '천천히 정확하게!', '손 위치를 잘 봐!'],
  '/study/sentence': ['문장을 완성해보자! ✍️', '한 글자씩 천천히!'],
  '/study/practice': ['따라 써보자! ✏️', '예쁘게 써봐!'],
  '/study/quiz': ['퀴즈 시간이야! 🧠', '잘 생각해보자!'],
  '/reader': ['동화 재미있지? 📖', '모르는 단어는 눌러봐!'],
}

// 클릭 시 보여줄 당근 리액션
const CARROT_MESSAGES = ['🥕 당근이지!', '🥕 잘하고 있어!', '🥕 대단해!', '🥕 최고야!', '🥕 화이팅!', '🥕 멋져!']

export default function FeedbackChat() {
  const { childName, childCharacter } = useAuth()
  const { pathname } = useLocation()
  const isVision = childCharacter === 'vision'
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)
  const [showCarrot, setShowCarrot] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAiCallRef = useRef(0)

  // 페이지별 기본 메시지 표시
  const showPageMessage = useCallback(() => {
    const key = Object.keys(PAGE_MESSAGES).find(k => pathname.startsWith(k) && k !== '/') || '/'
    const msgs = PAGE_MESSAGES[key] || PAGE_MESSAGES['/']
    const msg = msgs[Math.floor(Math.random() * msgs.length)]
    setMessage(msg.replace('{name}', childName || '친구'))
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 5000)
  }, [pathname, childName])

  // AI 피드백 호출
  const fetchAiFeedback = useCallback(async (context?: string) => {
    const now = Date.now()
    if (now - lastAiCallRef.current < 8000) return // 8초 쿨다운
    lastAiCallRef.current = now
    try {
      const res = await fetch(`${BASE}/api/learning/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_name: childName || '친구',
          disability_type: childCharacter || '일반',
          current_page: context || pathname,
          emotion_state: '집중 중',
        }),
      })
      const data = await res.json()
      if (data.character_message) {
        setMessage(data.character_message)
        setVisible(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setVisible(false), 6000)
      }
    } catch {}
  }, [childName, childCharacter, pathname])

  // 페이지 이동 시 메시지 표시
  useEffect(() => {
    if (isVision) return
    const t = setTimeout(() => showPageMessage(), 1500)
    return () => clearTimeout(t)
  }, [pathname, isVision, showPageMessage])

  // 외부 트리거 리스닝 (학습 페이지에서 상태 변화 시)
  useEffect(() => {
    function onTrigger(e: CustomEvent) {
      fetchAiFeedback(e.detail?.context)
    }
    window.addEventListener('ai-tutor-trigger', onTrigger as EventListener)
    return () => window.removeEventListener('ai-tutor-trigger', onTrigger as EventListener)
  }, [fetchAiFeedback])

  // 클릭 시 당근 리액션
  function handleClick() {
    const carrot = CARROT_MESSAGES[Math.floor(Math.random() * CARROT_MESSAGES.length)]
    setMessage(carrot)
    setShowCarrot(true)
    setVisible(true)
    setTimeout(() => setShowCarrot(false), 1500)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 3000)
  }

  if (isVision) return null

  return (
    <div className="feedback-chat">
      <div className="feedback-tutor-wrap" onClick={handleClick}>
        {showCarrot && <div className="feedback-carrot-pop">🥕</div>}
        <img src="/svg/토끼.png" alt="AI 친구" className="feedback-tutor-img" />
        {visible && message && (
          <div className="feedback-tutor-bubble">
            <p>{message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
