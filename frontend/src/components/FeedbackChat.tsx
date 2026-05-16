import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './FeedbackChat.css'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

// 캐릭터별 매핑
const CHARACTER_CONFIG: Record<string, { img: string; snack: string; name: string }> = {
  slow:    { img: '/svg/코끼리.png', snack: '🍎', name: '코끼리' },
  study:   { img: '/svg/코끼리.png', snack: '🍎', name: '코끼리' },
  hearing: { img: '/svg/토끼.png', snack: '🥕', name: '토끼' },
  '':      { img: '/svg/숭이.png', snack: '🍌', name: '원숭이' },
}
const DEFAULT_CHAR = { img: '/svg/숭이.png', snack: '🍌', name: '원숭이' }

const PAGE_MESSAGES: Record<string, string[]> = {
  '/': ['오늘도 재미있게 공부하자! 🎉', '어떤 동화 읽어볼까?', '오늘의 추천 책이 기다리고 있어!'],
  '/study/select': ['어떤 공부를 해볼까? 🤔', '뭐든 재미있을 거야!'],
  '/study/typing': ['타자 연습 시작! 손가락 준비~ ⌨️', '천천히 정확하게 쳐보자!', '한 글자씩 도전!'],
  '/study/voice': ['큰 소리로 따라 말해봐! 🎤', '자신있게!'],
  '/study/sign': ['수어 동작 따라해보자! ✋', '천천히 정확하게!', '손 위치를 잘 봐!'],
  '/study/sentence': ['문장을 완성해보자! ✍️', '한 글자씩 천천히!'],
  '/study/practice': ['따라 써보자! ✏️', '예쁘게 써봐!'],
  '/study/quiz': ['퀴즈 시간이야! 🧠', '잘 생각해보자!'],
  '/reader': ['동화 재미있지? 📖', '모르는 단어는 눌러봐!'],
}

const SNACK_MESSAGES: Record<string, string[]> = {
  '🥕': ['🥕 당근이지!', '🥕 잘하고 있어!', '🥕 대단해!', '🥕 최고야!', '🥕 화이팅!'],
  '🍌': ['🍌 바나나 줄게!', '🍌 잘했어!', '🍌 멋져!', '🍌 최고!', '🍌 대박!'],
  '🍎': ['🍎 사과 줄게!', '🍎 잘하고 있어!', '🍎 대단해!', '🍎 화이팅!', '🍎 멋져!'],
}

export default function FeedbackChat() {
  const { childName, childCharacter } = useAuth()
  const { pathname } = useLocation()
  const isVision = childCharacter === 'vision'
  const char = CHARACTER_CONFIG[childCharacter || ''] || DEFAULT_CHAR
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)
  const [snacks, setSnacks] = useState<{ id: number; x: number; size: number; emoji: string }[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAiCallRef = useRef(0)
  const snackIdRef = useRef(0)

  const showPageMessage = useCallback(() => {
    const key = Object.keys(PAGE_MESSAGES).find(k => k !== '/' && pathname.startsWith(k)) || '/'
    const msgs = PAGE_MESSAGES[key] || PAGE_MESSAGES['/']
    setMessage(msgs[Math.floor(Math.random() * msgs.length)])
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 5000)
  }, [pathname])

  const fetchAiFeedback = useCallback(async (context?: string) => {
    const now = Date.now()
    if (now - lastAiCallRef.current < 8000) return
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

  useEffect(() => {
    if (isVision) return
    const t = setTimeout(() => showPageMessage(), 1500)
    return () => clearTimeout(t)
  }, [pathname, isVision, showPageMessage])

  useEffect(() => {
    function onTrigger(e: CustomEvent) {
      fetchAiFeedback(e.detail?.context)
    }
    window.addEventListener('ai-tutor-trigger', onTrigger as EventListener)
    return () => window.removeEventListener('ai-tutor-trigger', onTrigger as EventListener)
  }, [fetchAiFeedback])

  function handleClick() {
    const msgs = SNACK_MESSAGES[char.snack] || SNACK_MESSAGES['🍌']
    setMessage(msgs[Math.floor(Math.random() * msgs.length)])
    setVisible(true)
    // 양옆에서 간식 팝업 (3~5개, 다양한 크기/위치)
    const count = 3 + Math.floor(Math.random() * 3)
    const newSnacks = Array.from({ length: count }, () => ({
      id: snackIdRef.current++,
      x: Math.random() * 120 - 60, // -60 ~ 60px
      size: 20 + Math.random() * 24, // 20~44px
      emoji: char.snack,
    }))
    setSnacks(newSnacks)
    setTimeout(() => setSnacks([]), 1500)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 3000)
  }

  if (isVision) return null

  return (
    <div className="feedback-chat">
      <div className="feedback-tutor-wrap" onClick={handleClick}>
        {snacks.map(s => (
          <span key={s.id} className="feedback-snack-pop" style={{ left: `calc(50% + ${s.x}px)`, fontSize: s.size }}>
            {s.emoji}
          </span>
        ))}
        <img src={char.img} alt={char.name} className="feedback-tutor-img" />
        {visible && message && (
          <div className="feedback-tutor-bubble">
            <p>{message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
