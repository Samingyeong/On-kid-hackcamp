import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchLearningFeedback, type MidmResponse } from '../api/midm'
import './FeedbackChat.css'

// 캐릭터 매핑: disability → 이미지 + 이름
const CHARACTER_MAP: Record<string, { img: string; name: string }> = {
  slow:    { img: '/svg/토끼.png', name: '토끼' },
  study:   { img: '/svg/코끼리.png', name: '코끼리' },
  hearing: { img: '/svg/숭이.png', name: '원숭이' },
  vision:  { img: '/svg/강아지.png', name: '강아지' },
}

const DEFAULT_CHARACTER = { img: '/svg/숭이.png', name: '원숭이' }

export default function FeedbackChat() {
  const { childName, childCharacter, childBirthDate } = useAuth()
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState<MidmResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const char = CHARACTER_MAP[childCharacter] || DEFAULT_CHARACTER

  useEffect(() => {
    if (open && !feedback && !loading) {
      setLoading(true)
      setError('')
      const childProfile = {
        name: childName || '친구',
        birth_date: childBirthDate || '',
        disability: childCharacter || '',
      }
      fetchLearningFeedback(childProfile)
        .then(data => setFeedback(data))
        .catch(() => setError('피드백을 불러올 수 없어요'))
        .finally(() => setLoading(false))
    }
  }, [open])

  return (
    <div className="feedback-chat">
      {/* 플로팅 캐릭터 버튼 */}
      <button className="feedback-chat-toggle" onClick={() => setOpen(v => !v)}>
        <img src={char.img} alt={char.name} className="feedback-chat-avatar" />
        {!open && <span className="feedback-chat-badge">💬</span>}
      </button>

      {/* 챗봇 패널 */}
      {open && (
        <div className="feedback-chat-panel">
          <div className="feedback-chat-header">
            <img src={char.img} alt={char.name} className="feedback-header-avatar" />
            <span className="feedback-header-name">{char.name} 선생님</span>
            <button className="feedback-chat-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="feedback-chat-body">
            {/* 인사 메시지 */}
            <div className="chat-bubble bot">
              <img src={char.img} alt="" className="bubble-avatar" />
              <div className="bubble-content">
                안녕 {childName || '친구'}! 오늘도 같이 공부하자! 🎉
              </div>
            </div>

            {loading && (
              <div className="chat-bubble bot">
                <img src={char.img} alt="" className="bubble-avatar" />
                <div className="bubble-content bubble-loading">
                  <span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              </div>
            )}

            {error && (
              <div className="chat-bubble bot">
                <img src={char.img} alt="" className="bubble-avatar" />
                <div className="bubble-content bubble-error">{error}</div>
              </div>
            )}

            {feedback && (
              <div className="chat-bubble bot">
                <img src={char.img} alt="" className="bubble-avatar" />
                <div className="bubble-content">
                  {feedback.message_to_child}
                </div>
              </div>
            )}

            {feedback?.recommended_content && feedback.recommended_content.length > 0 && (
              <div className="chat-bubble bot">
                <img src={char.img} alt="" className="bubble-avatar" />
                <div className="bubble-content">
                  📚 {feedback.recommended_content.join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
