import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './AiTutor.css'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

interface AiTutorProps {
  currentPage: string
  learningContent?: string
  repeatedFailures?: boolean
  emotionState?: string
  recentSuccess?: string
  trigger?: number // 값이 바뀔 때마다 피드백 요청
}

interface FeedbackResult {
  character_message: string
  feedback_type: string
  animation_reaction: string
  recommended_difficulty: string
  flow_switch: boolean
}

export default function AiTutor({
  currentPage,
  learningContent = '',
  repeatedFailures = false,
  emotionState = '집중 중',
  recentSuccess = '',
  trigger = 0,
}: AiTutorProps) {
  const { childName, childCharacter, childBirthDate } = useAuth()
  const isVision = childCharacter === 'vision'
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null)
  const [visible, setVisible] = useState(false)

  const fetchFeedback = useCallback(async () => {
    if (isVision) return
    try {
      const res = await fetch(`${BASE}/api/learning/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_name: childName || '친구',
          disability_type: childCharacter || '일반',
          current_page: currentPage,
          learning_content: learningContent,
          repeated_failures: repeatedFailures,
          emotion_state: emotionState,
          recent_success: recentSuccess,
        }),
      })
      const data = await res.json()
      setFeedback(data)
      setVisible(true)
      setTimeout(() => setVisible(false), 6000)
    } catch {
      // 실패 시 기본 메시지
      setFeedback({
        character_message: '잘하고 있어! 계속 해보자!',
        feedback_type: '응원',
        animation_reaction: '끄덕임',
        recommended_difficulty: '유지',
        flow_switch: false,
      })
      setVisible(true)
      setTimeout(() => setVisible(false), 4000)
    }
  }, [childName, childCharacter, currentPage, learningContent, repeatedFailures, emotionState, recentSuccess, isVision])

  useEffect(() => {
    if (trigger > 0) fetchFeedback()
  }, [trigger, fetchFeedback])

  if (isVision || !visible || !feedback) return null

  return (
    <div className={`ai-tutor ${feedback.animation_reaction}`}>
      <img src="/svg/토끼.png" alt="AI 친구" className="ai-tutor-avatar" />
      <div className="ai-tutor-bubble">
        <p className="ai-tutor-msg">{feedback.character_message}</p>
      </div>
    </div>
  )
}
