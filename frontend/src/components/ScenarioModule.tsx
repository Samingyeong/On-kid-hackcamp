/**
 * ScenarioModule.tsx
 *
 * 吏??諛쒕떖?μ븷 ?꾨룞???꾪븳 ?좏깮???쒕굹由ъ삤 ?숈뒿 紐⑤뱢.
 *
 * ?먮쫫
 * ????????????????????????????????????????????????????????????
 * 1. ?쒕굹由ъ삤 紐⑸줉 濡쒕뱶 ??泥?踰덉㎏ ?쒕굹由ъ삤 ?먮룞 ?쒖옉
 * 2. 吏덈Ц ?쒖떆 + 洹몃┝ 移대뱶 3???뚮뜑留? * 3. 移대뱶 ?대┃ ??fetchFlowAIVideo(choiceId, stepId) ?몄텧
 *    ??SmartLoading ?ㅻ쾭?덉씠 ?쒖꽦??(TTS + 移댁슫?몃떎??
 * 4. ?곸긽 URL ?섏떊 ??<video> src 遺?쒕읇寃?援먯껜 (fadeOut?믨탳泥닳넂fadeIn)
 * 5. ?쇰뱶諛?諛곕꼫 ?쒖떆 ??"?ㅼ쓬" 踰꾪듉?쇰줈 ?ㅼ쓬 ?④퀎 ?대룞
 * 6. 紐⑤뱺 ?④퀎 ?꾨즺 ???먯닔 ?붾㈃
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
import styles from './ScenarioModule.module.css'

// ??? ?숇Ъ ?대え吏 留ㅽ븨 (choiceId 湲곕컲) ????????????????????????
const ANIMAL_EMOJI_MAP: Record<string, { emoji: string; name: string }> = {
  'step-1-a': { emoji: '?맧', name: '?좊겮' },
  'step-1-b': { emoji: '?맧', name: '?좊겮' },
  'step-1-c': { emoji: '?맧', name: '?좊겮' },
  'step-2-a': { emoji: '?맶', name: '怨? },
  'step-2-b': { emoji: '?맶', name: '怨? },
  'step-2-c': { emoji: '?맶', name: '怨? },
  'step-3-a': { emoji: '?쫲', name: '?ъ슦' },
  'step-3-b': { emoji: '?쫲', name: '?ъ슦' },
  'step-3-c': { emoji: '?쫲', name: '?ъ슦' },
}

// ?좏깮吏 ?대え吏 ?대갚 (choice.emoji ?놁쓣 ??
const CHOICE_EMOJI_FALLBACK = ['?뀺截?, '?뀻截?, '?뀼截?]

// ??? ?곹깭 ???????????????????????????????????????????????????
type PhaseType = 'choosing' | 'loading' | 'watching' | 'done'

interface StepState {
  choiceId:    string
  isCorrect:   boolean
  videoUrl:    string
  videoSource: 'cache' | 'flowai'
}

// ??? 而댄룷?뚰듃 ?????????????????????????????????????????????????
export default function ScenarioModule() {
  const navigate        = useNavigate()
  const [params]        = useSearchParams()
  const { user, childName } = useAuth()

  // URL ?뚮씪誘명꽣: ?scenario=mock-001
  const scenarioIdParam = params.get('scenario') || ''

  // ?? ?쒕굹由ъ삤 ?곗씠????????????????????????????????????????????
  const [session,    setSession]    = useState<ScenarioSession | null>(null)
  const [stepIdx,    setStepIdx]    = useState(0)
  const [phase,      setPhase]      = useState<PhaseType>('choosing')
  const [stepStates, setStepStates] = useState<StepState[]>([])
  const [error,      setError]      = useState<string | null>(null)

  // ?? ?꾩옱 ?좏깮 ?곹깭 ???????????????????????????????????????????
  const [selectedChoice, setSelectedChoice] = useState<ScenarioChoice | null>(null)
  const [feedbackMsg,    setFeedbackMsg]     = useState('')
  const [isCorrect,      setIsCorrect]       = useState(false)

  // ?? ?곸긽 ?뚮젅?댁뼱 ?곹깭 ???????????????????????????????????????
  const [videoUrl,    setVideoUrl]    = useState('')
  const [videoFade,   setVideoFade]   = useState<'in' | 'out'>('in')
  const [videoBadge,  setVideoBadge]  = useState<'cache' | 'flowai' | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // ?? SmartLoading ?곹깭 ????????????????????????????????????????
  const [isLoading,      setIsLoading]      = useState(false)
  const [loadingAnimal,  setLoadingAnimal]  = useState({ emoji: '?맽', name: '?숇Ъ' })
  const [estimatedSecs,  setEstimatedSecs]  = useState(4)

  // ?? ?쒕굹由ъ삤 濡쒕뱶 ????????????????????????????????????????????
  useEffect(() => {
    fetchScenarios()
      .then(list => {
        const target = scenarioIdParam
          ? list.find(s => s.sessionId === scenarioIdParam) ?? list[0]
          : list[0]
        if (!target) throw new Error('?쒕굹由ъ삤媛 ?놁뼱??)
        setSession(target)
      })
      .catch(e => setError(String(e)))
  }, [scenarioIdParam])

  const currentStep: ScenarioStep | undefined = session?.steps[stepIdx]
  const totalSteps = session?.totalSteps ?? 0
  const progress   = totalSteps > 0 ? ((stepIdx) / totalSteps) * 100 : 0
  const score      = stepStates.filter(s => s.isCorrect).length

  // ?? 移대뱶 ?대┃ ?몃뱾???????????????????????????????????????????
  const handleChoiceClick = useCallback(async (choice: ScenarioChoice) => {
    if (phase !== 'choosing' || !currentStep || !session) return

    setSelectedChoice(choice)

    // ?숇Ъ ?뺣낫 寃곗젙 (SmartLoading???꾨떖)
    const compositeKey = `${currentStep.id}-${choice.id}`
    const animalInfo   = ANIMAL_EMOJI_MAP[compositeKey] ?? { emoji: '?맽', name: '?숇Ъ 移쒓뎄' }
    setLoadingAnimal(animalInfo)

    // 罹먯떆 ?덊듃 ?덉긽 ??吏㏐쾶, 誘몄뒪 ?덉긽 ??湲멸쾶
    setEstimatedSecs(4)

    // ?? SmartLoading ?쒖옉 ??????????????????????????????????????
    setPhase('loading')
    setIsLoading(true)
    setError(null)

    try {
      const result = await fetchFlowAIVideo(choice.id, currentStep.id, session.sessionId)

      // ?? ?곸긽 src 遺?쒕읇寃?援먯껜 ????????????????????????????????
      // 1) 湲곗〈 ?곸긽 ?섏씠?쒖븘??      setVideoFade('out')
      await sleep(300)

      // 2) src 援먯껜
      setVideoUrl(result.videoUrl)
      setVideoBadge(result.source)

      // 3) ?섏씠?쒖씤
      setVideoFade('in')

      // ?? ?쇰뱶諛?怨꾩궛 ???????????????????????????????????????????
      const correct = currentStep.correctId
        ? currentStep.correctId === choice.id
        : true
      const msg = currentStep.feedback
        ? correct ? currentStep.feedback.correct : currentStep.feedback.wrong
        : correct ? '???좏깮?덉뼱?? ?럦' : '?ㅼ떆 ?쒕쾲 ?앷컖?대킄??'

      setIsCorrect(correct)
      setFeedbackMsg(msg)

      // ?④퀎 寃곌낵 ???      setStepStates(prev => [
        ...prev,
        { choiceId: choice.id, isCorrect: correct, videoUrl: result.videoUrl, videoSource: result.source },
      ])

      setPhase('watching')
    } catch (e) {
      setError('?곸긽??遺덈윭?ㅼ? 紐삵뻽?댁슂. ?ㅼ떆 ?쒕룄?댁＜?몄슂.')
      setPhase('choosing')
      setSelectedChoice(null)
    } finally {
      setIsLoading(false)
    }
  }, [phase, currentStep, session])

  // ?? ?ㅼ쓬 ?④퀎 ?대룞 ???????????????????????????????????????????
  const handleNext = useCallback(async () => {
    if (!session) return

    const nextIdx = stepIdx + 1

    if (nextIdx >= session.steps.length) {
      // 紐⑤뱺 ?④퀎 ?꾨즺
      await completeScenarioSession(
        session.sessionId,
        user?.id ?? 'guest',
        score + (isCorrect ? 1 : 0),
        totalSteps,
      ).catch(() => {})
      setPhase('done')
    } else {
      // ?ㅼ쓬 ?④퀎濡?      setStepIdx(nextIdx)
      setPhase('choosing')
      setSelectedChoice(null)
      setFeedbackMsg('')
      setVideoUrl('')
      setVideoBadge(null)
    }
  }, [session, stepIdx, score, isCorrect, totalSteps, user])

  // ?? ?ㅼ떆 ?쒖옉 ????????????????????????????????????????????????
  const handleRetry = () => {
    setStepIdx(0)
    setPhase('choosing')
    setSelectedChoice(null)
    setFeedbackMsg('')
    setVideoUrl('')
    setVideoBadge(null)
    setStepStates([])
    setError(null)
  }

  // ?? ?곸긽 ?먮룞 ?ъ깮 ???????????????????????????????????????????
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      videoRef.current.load()
      videoRef.current.play().catch(() => {})
    }
  }, [videoUrl])

  // ?? 濡쒕뵫 以?(?쒕굹由ъ삤 ?곗씠?? ????????????????????????????????
  if (!session && !error) {
    return (
      <div className={styles.wrap}>
        <div style={{ fontSize: 48, marginTop: 80 }}>??/div>
        <p style={{ color: '#bf5000', fontWeight: 700, marginTop: 16 }}>?쒕굹由ъ삤瑜?遺덈윭?ㅻ뒗 以묒씠?먯슂...</p>
      </div>
    )
  }

  // ?? ?먮윭 (?쒕굹由ъ삤 濡쒕뱶 ?ㅽ뙣) ????????????????????????????????
  if (error && !session) {
    return (
      <div className={styles.wrap}>
        <div className={styles.errorBanner}>?좑툘 {error}</div>
        <button className={styles.retryBtn} onClick={() => navigate(-1)}>???뚯븘媛湲?/button>
      </div>
    )
  }

  // ?? ?꾨즺 ?붾㈃ ????????????????????????????????????????????????
  if (phase === 'done') {
    const finalScore = stepStates.filter(s => s.isCorrect).length
    return (
      <div className={styles.wrap}>
        <div className={styles.completionWrap}>
          <div className={styles.completionEmoji}>
            {finalScore === totalSteps ? '?룇' : finalScore >= totalSteps / 2 ? '?뙚' : '?뮞'}
          </div>
          <h2 className={styles.completionTitle}>
            {finalScore === totalSteps ? '?꾨꼍?댁슂!' : '?섑뻽?댁슂!'}
          </h2>
          <p className={styles.completionScore}>
            {totalSteps}臾몄젣 以?<strong>{finalScore}媛?/strong> 留욏삍?댁슂!
          </p>
          <div className={styles.completionBtns}>
            <button className={styles.retryBtn} onClick={handleRetry}>?봽 ?ㅼ떆 ?섍린</button>
            <button className={styles.nextBtn}  onClick={() => navigate(-1)}>???뚯븘媛湲?/button>
          </div>
        </div>
      </div>
    )
  }

  // ?? 硫붿씤 ?붾㈃ ????????????????????????????????????????????????
  return (
    <div className={styles.wrap}>
      {/* SmartLoading ?ㅻ쾭?덉씠 */}
      <SmartLoading
        isLoading={isLoading}
        animalEmoji={loadingAnimal.emoji}
        animalName={loadingAnimal.name}
        childName={childName || '移쒓뎄'}
        estimatedSeconds={estimatedSecs}
      />

      {/* 諛곌꼍 援щ쫫 */}
      <div className={`${styles.cloudDeco} ${styles.tl}`} aria-hidden="true" />
      <div className={`${styles.cloudDeco} ${styles.tr}`} aria-hidden="true" />
      <div className={`${styles.cloudDeco} ${styles.bl}`} aria-hidden="true" />

      {/* ?ㅻ뜑 */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)} aria-label="?ㅻ줈媛湲?>??/button>
        <h1 className={styles.scenarioTitle}>{session?.title}</h1>
      </div>

      {/* 吏꾪뻾 諛?*/}
      <div className={styles.progressWrap}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.progressLabel}>{stepIdx + 1} / {totalSteps}</p>
      </div>

      {/* API ?먮윭 諛곕꼫 */}
      {error && (
        <div className={styles.errorBanner}>?좑툘 {error}</div>
      )}

      {/* 吏덈Ц 移대뱶 ???묐? ?꾩???留먰뭾??*/}
      {currentStep && (
        <div className={styles.questionCard} key={currentStep.id}>
          <div className={styles.wolfRow}>
            <span className={styles.wolfEmoji} role="img" aria-label="?묐? ?꾩???>?맳</span>
            <div className={styles.speechBubble}>{currentStep.question}</div>
          </div>
        </div>
      )}

      {/* ?좏깮吏 洹몃━??*/}
      {currentStep && (
        <div className={styles.choicesGrid} role="group" aria-label="?좏깮吏">
          {currentStep.choices.map((choice, i) => {
            const isSelected = selectedChoice?.id === choice.id
            const isAnswered = phase === 'watching' || phase === 'loading'
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

      {/* ?쇰뱶諛?諛곕꼫 */}
      {phase === 'watching' && feedbackMsg && (
        <div className={`${styles.feedbackBanner} ${isCorrect ? styles.correct : styles.wrong}`}>
          {isCorrect ? '?럦 ' : '?뮕 '}{feedbackMsg}
        </div>
      )}

      {/* ?곸긽 ?뚮젅?댁뼱 */}
      {videoUrl && phase === 'watching' && (
        <div className={styles.videoSection}>
          <p className={styles.videoLabel}>
            ?렗 ?⑦궎??AI媛 留뚮뱺 ?섎쭔???숉솕 ?곸긽?댁뿉??
          </p>
          <div className={styles.videoWrap}>
            <video
              ref={videoRef}
              className={`${styles.videoPlayer} ${videoFade === 'in' ? styles.fadeIn : styles.fadeOut}`}
              src={videoUrl}
              controls
              playsInline
              loop
              aria-label="AI ?앹꽦 ?숉솕 ?곸긽"
            />
            {videoBadge && (
              <span className={styles.videoBadge}>
                {videoBadge === 'cache' ? '??利됱떆 ?ъ깮' : '??AI ?앹꽦'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ?ㅼ쓬 踰꾪듉 */}
      {phase === 'watching' && (
        <button className={styles.nextBtn} onClick={handleNext}>
          {stepIdx + 1 < totalSteps ? '?ㅼ쓬 臾몄젣 ?? : '寃곌낵 蹂닿린 ?룇'}
        </button>
      )}
    </div>
  )
}

// ??? ?ы띁 ?????????????????????????????????????????????????????
function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}
