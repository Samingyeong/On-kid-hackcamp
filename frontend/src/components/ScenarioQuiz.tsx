/**
 * ScenarioQuiz.tsx
 *
 * 지적/발달장애 아동을 위한 선택형 시나리오 학습 모듈.
 * (기존 ScenarioModule - 나만의 동화 만들기와 별개 기능)
 *
 * 흐름: 질문 → 그림 카드 선택 → SmartLoading(TTS) → 영상 재생 → 피드백 → 반복
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchScenarios,
  fetchFlowAIVideo,
  completeScenarioSession,
  type ScenarioSession,
  type ScenarioStep,
  type ScenarioChoice,
} from '../api/flowai'
import { useAuth } from '../contexts/AuthContext'
import SmartLoading from './SmartLoading'
import styles from './ScenarioQuiz.module.css'

const ANIMAL_EMOJI_MAP: Record<string, { emoji: string; name: string }> = {
  'step-1-a': { emoji: '🐰', name: '토끼' },
  'step-1-b': { emoji: '🐰', name: '토끼' },
  'step-1-c': { emoji: '🐰', name: '토끼' },
  'step-2-a': { emoji: '🐻', name: '곰' },
  'step-2-b': { emoji: '🐻', name: '곰' },
  'step-2-c': { emoji: '🐻', name: '곰' },
  'step-3-a': { emoji: '🦊', name: '여우' },
  'step-3-b': { emoji: '🦊', name: '여우' },
  'step-3-c': { emoji: '🦊', name: '여우' },
}

const CHOICE_EMOJI_FALLBACK = ['🅰️', '🅱️', '🅲️']

type PhaseType = 'choosing' | 'loading' | 'watching' | 'done'

interface StepState {
  choiceId:    string
  isCorrect:   boolean
  videoUrl:    string
  videoSource: 'cache' | 'flowai'
}

export default function ScenarioQuiz() {
  const navigate            = useNavigate()
  const [params]            = useSearchParams()
  const { user, childName } = useAuth()

  const scenarioIdParam = params.get('scenario') || ''

  const [session,        setSession]        = useState<ScenarioSession | null>(null)
  const [stepIdx,        setStepIdx]        = useState(0)
  const [phase,          setPhase]          = useState<PhaseType>('choosing')
  const [stepStates,     setStepStates]     = useState<StepState[]>([])
  const [error,          setError]          = useState<string | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<ScenarioChoice | null>(null)
  const [feedbackMsg,    setFeedbackMsg]     = useState('')
  const [isCorrect,      setIsCorrect]       = useState(false)
  const [videoUrl,       setVideoUrl]        = useState('')
  const [videoFade,      setVideoFade]       = useState<'in' | 'out'>('in')
  const [videoBadge,     setVideoBadge]      = useState<'cache' | 'flowai' | null>(null)
  const [isLoading,      setIsLoading]       = useState(false)
  const [loadingAnimal,  setLoadingAnimal]   = useState({ emoji: '🐾', name: '동물' })
  const [estimatedSecs,  setEstimatedSecs]   = useState(4)

  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    fetchScenarios()
      .then(list => {
        const target = scenarioIdParam
          ? list.find(s => s.sessionId === scenarioIdParam) ?? list[0]
          : list[0]
        if (!target) throw new Error('시나리오가 없어요')
        setSession(target)
      })
      .catch(e => setError(String(e)))
  }, [scenarioIdParam])

  const currentStep: ScenarioStep | undefined = session?.steps[stepIdx]
  const totalSteps = session?.totalSteps ?? 0
  const progress   = totalSteps > 0 ? (stepIdx / totalSteps) * 100 : 0
  const score      = stepStates.filter(s => s.isCorrect).length

  const handleChoiceClick = useCallback(async (choice: ScenarioChoice) => {
    if (phase !== 'choosing' || !currentStep || !session) return

    setSelectedChoice(choice)
    const compositeKey = `${currentStep.id}-${choice.id}`
    const animalInfo   = ANIMAL_EMOJI_MAP[compositeKey] ?? { emoji: '🐾', name: '동물 친구' }
    setLoadingAnimal(animalInfo)
    setEstimatedSecs(4)
    setPhase('loading')
    setIsLoading(true)
    setError(null)

    try {
      const result = await fetchFlowAIVideo(choice.id, currentStep.id, session.sessionId)

      setVideoFade('out')
      await sleep(300)
      setVideoUrl(result.videoUrl)
      setVideoBadge(result.source)
      setVideoFade('in')

      const correct = currentStep.correctId ? currentStep.correctId === choice.id : true
      const msg = currentStep.feedback
        ? correct ? currentStep.feedback.correct : currentStep.feedback.wrong
        : correct ? '잘 선택했어요! 🎉' : '다시 한번 생각해봐요!'

      setIsCorrect(correct)
      setFeedbackMsg(msg)
      setStepStates(prev => [
        ...prev,
        { choiceId: choice.id, isCorrect: correct, videoUrl: result.videoUrl, videoSource: result.source },
      ])
      setPhase('watching')
    } catch {
      setError('영상을 불러오지 못했어요. 다시 시도해주세요.')
      setPhase('choosing')
      setSelectedChoice(null)
    } finally {
      setIsLoading(false)
    }
  }, [phase, currentStep, session])

  const handleNext = useCallback(async () => {
    if (!session) return
    const nextIdx = stepIdx + 1
    if (nextIdx >= session.steps.length) {
      await completeScenarioSession(
        session.sessionId, user?.id ?? 'guest',
        score + (isCorrect ? 1 : 0), totalSteps,
      ).catch(() => {})
      setPhase('done')
    } else {
      setStepIdx(nextIdx)
      setPhase('choosing')
      setSelectedChoice(null)
      setFeedbackMsg('')
      setVideoUrl('')
      setVideoBadge(null)
    }
  }, [session, stepIdx, score, isCorrect, totalSteps, user])

  const handleRetry = () => {
    setStepIdx(0); setPhase('choosing'); setSelectedChoice(null)
    setFeedbackMsg(''); setVideoUrl(''); setVideoBadge(null)
    setStepStates([]); setError(null)
  }

  useEffect(() => {
    if (videoUrl && videoRef.current) {
      videoRef.current.load()
      videoRef.current.play().catch(() => {})
    }
  }, [videoUrl])

  if (!session && !error) {
    return (
      <div className={styles.wrap}>
        <div style={{ fontSize: 48, marginTop: 80 }}>⏳</div>
        <p style={{ color: '#bf5000', fontWeight: 700, marginTop: 16 }}>시나리오를 불러오는 중이에요...</p>
      </div>
    )
  }

  if (error && !session) {
    return (
      <div className={styles.wrap}>
        <div className={styles.errorBanner}>⚠️ {error}</div>
        <button className={styles.retryBtn} onClick={() => navigate(-1)}>← 돌아가기</button>
      </div>
    )
  }

  if (phase === 'done') {
    const finalScore = stepStates.filter(s => s.isCorrect).length
    return (
      <div className={styles.wrap}>
        <div className={styles.completionWrap}>
          <div className={styles.completionEmoji}>
            {finalScore === totalSteps ? '🏆' : finalScore >= totalSteps / 2 ? '🌟' : '💪'}
          </div>
          <h2 className={styles.completionTitle}>{finalScore === totalSteps ? '완벽해요!' : '잘했어요!'}</h2>
          <p className={styles.completionScore}>{totalSteps}문제 중 <strong>{finalScore}개</strong> 맞혔어요!</p>
          <div className={styles.completionBtns}>
            <button className={styles.retryBtn} onClick={handleRetry}>🔄 다시 하기</button>
            <button className={styles.nextBtn} onClick={() => navigate(-1)}>← 돌아가기</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <SmartLoading
        isLoading={isLoading}
        animalEmoji={loadingAnimal.emoji}
        animalName={loadingAnimal.name}
        childName={childName || '친구'}
        estimatedSeconds={estimatedSecs}
      />

      <div className={`${styles.cloudDeco} ${styles.tl}`} aria-hidden="true" />
      <div className={`${styles.cloudDeco} ${styles.tr}`} aria-hidden="true" />
      <div className={`${styles.cloudDeco} ${styles.bl}`} aria-hidden="true" />

      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)} aria-label="뒤로가기">←</button>
        <h1 className={styles.scenarioTitle}>{session?.title}</h1>
      </div>

      <div className={styles.progressWrap}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.progressLabel}>{stepIdx + 1} / {totalSteps}</p>
      </div>

      {error && <div className={styles.errorBanner}>⚠️ {error}</div>}

      {currentStep && (
        <div className={styles.questionCard} key={currentStep.id}>
          <div className={styles.wolfRow}>
            <span className={styles.wolfEmoji} role="img" aria-label="늑대 아저씨">🐺</span>
            <div className={styles.speechBubble}>{currentStep.question}</div>
          </div>
        </div>
      )}

      {currentStep && (
        <div className={styles.choicesGrid} role="group" aria-label="선택지">
          {currentStep.choices.map((choice, i) => {
            const isSelected  = selectedChoice?.id === choice.id
            const isAnswered  = phase === 'watching' || phase === 'loading'
            const cardCorrect = isAnswered && isSelected && isCorrect
            const cardWrong   = isAnswered && isSelected && !isCorrect
            return (
              <button
                key={choice.id}
                className={[
                  styles.choiceCard,
                  isSelected  ? styles.selected : '',
                  cardCorrect ? styles.correct  : '',
                  cardWrong   ? styles.wrong    : '',
                  isAnswered  ? styles.disabled : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleChoiceClick(choice)}
                disabled={isAnswered}
                aria-pressed={isSelected}
                aria-label={choice.label}
              >
                <span className={styles.choiceEmoji} role="img" aria-hidden="true">
                  {choice.emoji ?? CHOICE_EMOJI_FALLBACK[i]}
                </span>
                <span className={styles.choiceLabel}>{choice.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {phase === 'watching' && feedbackMsg && (
        <div className={`${styles.feedbackBanner} ${isCorrect ? styles.correct : styles.wrong}`}>
          {isCorrect ? '🎉 ' : '💡 '}{feedbackMsg}
        </div>
      )}

      {videoUrl && phase === 'watching' && (
        <div className={styles.videoSection}>
          <p className={styles.videoLabel}>🎬 온키드 AI가 만든 나만의 동화 영상이에요!</p>
          <div className={styles.videoWrap}>
            <video
              ref={videoRef}
              className={`${styles.videoPlayer} ${videoFade === 'in' ? styles.fadeIn : styles.fadeOut}`}
              src={videoUrl} controls playsInline loop
              aria-label="AI 생성 동화 영상"
            />
            {videoBadge && (
              <span className={styles.videoBadge}>
                {videoBadge === 'cache' ? '⚡ 즉시 재생' : '✨ AI 생성'}
              </span>
            )}
          </div>
        </div>
      )}

      {phase === 'watching' && (
        <button className={styles.nextBtn} onClick={handleNext}>
          {stepIdx + 1 < totalSteps ? '다음 문제 →' : '결과 보기 🏆'}
        </button>
      )}
    </div>
  )
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }
