import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './FeedbackChat.css'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export default function FeedbackChat() {
  const { childName, childCharacter, childBirthDate } = useAuth()
  const isVision = childCharacter === 'vision'
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTriggerRef = useRef(0)

  const fetchFeedback = useCallback(async (context?: string) => {
    try {
      const res = await fetch(`${BASE}/api/learning/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_name: childName || '친구',
          disability_type: childCharacter || '일반',
          current_page: context || '학습 중',
          learning_content: '',
          repeated_failures: false,
          emotion_state: '집중 중',
        }),
      })
      const data = await res.json()
      setMessage(data.character_message || '잘하고 있어! 계속 해보자!')
    } catch {
      setMessage('잘하고 있어! 계속 해보자!')
    }
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 8000)
  }, [childName, childCharacter])

  // 페이지 로드 시 3초 후 자동 피드백
  useEffect(() => {
    if (isVision) return
    const t = setTimeout(() => fetchFeedback(), 3000)
    return () => clearTimeout(t)
  }, [isVision, fetchFeedback])

  // 외부에서 트리거 가능하도록 전역 이벤트 리스닝
  useEffect(() => {
    function onTrigger(e: CustomEvent) {
      const now = Date.now()
      if (now - lastTriggerRef.current < 5000) return // 5초 쿨다운
      lastTriggerRef.current = now
      fetchFeedback(e.detail?.context)
    }
    window.addEventListener('ai-tutor-trigger', onTrigger as EventListener)
    return () => window.removeEventListener('ai-tutor-trigger', onTrigger as EventListener)
  }, [fetchFeedback])

  if (isVision) return null

  return (
    <div className="feedback-chat">
      <div className="feedback-tutor-wrap" onClick={() => fetchFeedback('학습 중')}>
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
