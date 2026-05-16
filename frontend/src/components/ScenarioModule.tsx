/**
 * ScenarioModule.tsx - 나만의 동화 만들기
 * 선택지 기반 시나리오 학습 모듈
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchScenarios, startScenarioSession, submitScenarioAnswer, type ScenarioSession, type ScenarioStep } from '../api/flowai'
import styles from './ScenarioModule.module.css'

export default function ScenarioModule() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<ScenarioSession[]>([])
  const [current, setCurrent] = useState<ScenarioSession | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchScenarios().then(list => {
      setSessions(list)
      if (list.length > 0) {
        setCurrent(list[0])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const step: ScenarioStep | null = current?.steps[stepIdx] || null

  async function handleChoice(choiceId: string) {
    if (!current || !step) return
    setFeedback('')
    const result = await submitScenarioAnswer(current.sessionId, step.id, choiceId)
    setFeedback(result.feedbackMessage)
    if (result.isCorrect) setScore(s => s + 1)

    // 다음 단계로
    setTimeout(() => {
      if (result.nextStepId) {
        setStepIdx(i => i + 1)
        setFeedback('')
      } else {
        setDone(true)
      }
    }, 2000)
  }

  if (loading) {
    return <div className={styles.container}><p className={styles.loading}>동화를 준비하고 있어요...</p></div>
  }

  if (done) {
    return (
      <div className={styles.container}>
        <div className={styles.doneCard}>
          <h2>🎉 동화 완성!</h2>
          <p>점수: {score}/{current?.totalSteps || 0}</p>
          <p>정말 잘했어요!</p>
          <button className={styles.btn} onClick={() => { setDone(false); setStepIdx(0); setScore(0); setFeedback('') }}>
            다시 하기
          </button>
          <button className={styles.btnSecondary} onClick={() => navigate('/')}>
            홈으로
          </button>
        </div>
      </div>
    )
  }

  if (!step) {
    return <div className={styles.container}><p>시나리오를 불러올 수 없어요.</p></div>
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{current?.title || '나만의 동화'}</h1>
        <span className={styles.progress}>{stepIdx + 1}/{current?.totalSteps || 0}</span>
      </div>

      <div className={styles.questionCard}>
        <p className={styles.question}>{step.question}</p>
      </div>

      <div className={styles.choices}>
        {step.choices.map(choice => (
          <button
            key={choice.id}
            className={styles.choiceBtn}
            onClick={() => handleChoice(choice.id)}
            disabled={!!feedback}
          >
            {choice.emoji && <span className={styles.emoji}>{choice.emoji}</span>}
            <span>{choice.label}</span>
          </button>
        ))}
      </div>

      {feedback && (
        <div className={styles.feedback}>
          <p>{feedback}</p>
        </div>
      )}
    </div>
  )
}
