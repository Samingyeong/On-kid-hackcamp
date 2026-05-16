import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type {
  Category,
  HandLandmarker as HandLandmarkerType,
  NormalizedLandmark,
  PoseLandmarker as PoseLandmarkerType,
} from '@mediapipe/tasks-vision'
import {
  evaluateSignPractice,
  fetchSignMotions,
  fetchSignPracticeWords,
  fetchStudyWords,
  updateWordKnown,
  type SignPracticeFrame,
  type SignMotionSegment,
  type SignPracticeWord,
  type StudyWord,
} from '../api/library'
import './StudySign.css'
import AiTutor from '../components/AiTutor'

type PracticePhase = 'demo' | 'ready' | 'recording' | 'checking' | 'passed' | 'retry'
type PracticeStudyWord = StudyWord & { segment_count?: number }

const FALLBACK_WORDS: StudyWord[] = [
  {
    id: -1,
    word: '강아지',
    base_form: '강아지',
    pos: '명사',
    definition: '',
    known: 0,
    from_book: '',
    created_at: '',
  },
  {
    id: -2,
    word: '사과',
    base_form: '사과',
    pos: '명사',
    definition: '',
    known: 0,
    from_book: '',
    created_at: '',
  },
  {
    id: -3,
    word: '인사',
    base_form: '인사',
    pos: '명사',
    definition: '',
    known: 0,
    from_book: '',
    created_at: '',
  },
]

const RECORDING_MS = 3600
const SAMPLE_INTERVAL_MS = 100
const POSE_OVERLAY_CONNECTIONS: Array<[number, number]> = [
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
]
const POSE_OVERLAY_POINTS = [11, 12, 13, 14, 15, 16, 23, 24]
const HAND_OVERLAY_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
]
const HAND_OVERLAY_COLORS = ['#facc15', '#34d399']

export default function StudySign() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const book = params.get('book') || ''

  const [words, setWords] = useState<PracticeStudyWord[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState<PracticePhase>('demo')
  const [attempts, setAttempts] = useState(0)
  const [cameraError, setCameraError] = useState('')
  const [segment, setSegment] = useState<SignMotionSegment | null>(null)
  const [signLoading, setSignLoading] = useState(false)
  const [visionLoading, setVisionLoading] = useState(false)
  const [avatarRevision, setAvatarRevision] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [referenceSegments, setReferenceSegments] = useState<Record<string, SignMotionSegment>>({})

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const attemptsRef = useRef(0)
  const poseLandmarkerRef = useRef<PoseLandmarkerType | null>(null)
  const handLandmarkerRef = useRef<HandLandmarkerType | null>(null)

  useEffect(() => {
    let cancelled = false

    function toPracticeWord(item: SignPracticeWord, index: number): PracticeStudyWord {
      return {
        id: -(index + 1),
        word: item.word,
        base_form: item.base_form,
        pos: '수어',
        definition: '',
        known: 0,
        from_book: '암탉과 누렁이',
        created_at: '',
        segment_count: item.segment_count,
      }
    }

    void (async () => {
      try {
        const practiceWords = await fetchSignPracticeWords()
        if (cancelled) return
        if (practiceWords.length) {
          setReferenceSegments(Object.fromEntries(
            practiceWords.map(item => [item.base_form, item.segment])
          ))
          setWords(practiceWords.map(toPracticeWord))
          setCurrentIdx(0)
          return
        }

        const list = await fetchStudyWords(0)
        if (cancelled) return
        const filtered = book ? list.filter(word => word.from_book === book) : list
        setReferenceSegments({})
        setWords(filtered.length > 0 ? filtered : FALLBACK_WORDS)
        setCurrentIdx(0)
      } catch {
        if (!cancelled) {
          setReferenceSegments({})
          setWords(FALLBACK_WORDS)
          setCurrentIdx(0)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [book])

  const currentWord = words[currentIdx]?.base_form || FALLBACK_WORDS[0].base_form
  const currentWordId = words[currentIdx]?.id
  const chars = useMemo(() => Array.from(currentWord), [currentWord])
  const cameraPhase = ['recording', 'checking', 'passed'].includes(phase)
  const recordingDurationMs = useMemo(() => {
    const referenceMs = Number(segment?.duration_sec || 0) * 1000
    return Math.round(Math.max(2600, Math.min(6500, referenceMs + 450 || RECORDING_MS)))
  }, [segment?.duration_sec])

  useEffect(() => {
    let cancelled = false
    attemptsRef.current = 0

    void (async () => {
      await Promise.resolve()
      if (cancelled) return

      setPhase('demo')
      setAttempts(0)
      setCameraError('')
      setSegment(null)
      setSignLoading(true)

      const localReference = referenceSegments[currentWord]
      if (localReference) {
        setSegment(localReference)
        setSignLoading(false)
        return
      }

      try {
        const items = await fetchSignMotions(currentWord)
        if (!cancelled) setSegment(items.find(item => item.keypoints_url) || null)
      } catch {
        if (!cancelled) setSegment(null)
      } finally {
        if (!cancelled) setSignLoading(false)
      }
    })()

    const timer = window.setTimeout(() => {
      if (!cancelled) setPhase(prev => (prev === 'demo' ? 'ready' : prev))
    }, 3600)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [currentWord, referenceSegments])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop())
      poseLandmarkerRef.current?.close()
      handLandmarkerRef.current?.close()
    }
  }, [])

  const signVrmSrc = segment?.keypoints_url
    ? `/sign-vrm/index.html?embed=1&keypoints=${encodeURIComponent(segment.keypoints_url)}`
    : ''
  const signDescription = segment?.sign_description?.trim() || (signVrmSrc ? '수형 설명이 준비되지 않았어요.' : '')
  const canSkipWord = phase === 'retry' && attempts >= 2 && currentIdx < words.length - 1

  const completeCurrentWord = useCallback((delayMs: number) => {
    if (currentWordId && currentWordId > 0) updateWordKnown(currentWordId, 1).catch(() => {})
    setWords(prev => prev.map((item, index) => (
      index === currentIdx ? { ...item, known: 1 } : item
    )))
    window.setTimeout(() => {
      if (currentIdx < words.length - 1) setCurrentIdx(index => index + 1)
    }, delayMs)
  }, [currentIdx, currentWordId, words.length])

  async function ensureVisionTasks() {
    if (poseLandmarkerRef.current && handLandmarkerRef.current) return

    setVisionLoading(true)
    try {
      const vision = await import('@mediapipe/tasks-vision')
      const fileset = await vision.FilesetResolver.forVisionTasks('/mediapipe/wasm')
      const [poseLandmarker, handLandmarker] = await Promise.all([
        vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/models/pose_landmarker_full.task' },
          runningMode: 'VIDEO',
          numPoses: 1,
        }),
        vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/models/hand_landmarker.task' },
          runningMode: 'VIDEO',
          numHands: 2,
        }),
      ])
      poseLandmarkerRef.current = poseLandmarker
      handLandmarkerRef.current = handLandmarker
    } finally {
      setVisionLoading(false)
    }
  }

  async function waitForPaint() {
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  }

  function isAbortError(error: unknown) {
    if (!(error instanceof Error)) return false
    return error.name === 'AbortError' || /abort/i.test(error.message)
  }

  async function playCameraVideo(video: HTMLVideoElement) {
    try {
      await video.play()
    } catch (error) {
      if (!isAbortError(error)) throw error
    }
  }

  async function waitForVideoMetadata(video: HTMLVideoElement) {
    if (video.videoWidth && video.videoHeight) return
    await new Promise<void>(resolve => {
      const timer = window.setTimeout(resolve, 1200)
      video.onloadedmetadata = () => {
        window.clearTimeout(timer)
        resolve()
      }
    })
  }

  async function ensureCameraStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('이 브라우저에서는 카메라를 사용할 수 없어요.')
    }

    let mediaStream = streamRef.current
    if (!mediaStream) {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = mediaStream
      setStream(mediaStream)
    } else {
      setStream(mediaStream)
    }

    await waitForPaint()
    const video = videoRef.current
    if (!video) throw new Error('카메라 화면을 준비하지 못했어요. 다시 시도해 주세요.')
    if (video.srcObject !== mediaStream) video.srcObject = mediaStream
    await waitForVideoMetadata(video)
    await playCameraVideo(video)
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream || !cameraPhase) return
    if (video.srcObject !== stream) video.srcObject = stream
    playCameraVideo(video).catch(() => {
      // Explicit recording path surfaces actionable camera errors.
    })
  }, [stream, cameraPhase])

  useEffect(() => {
    if (!cameraPhase) clearKeypointOverlay()
  }, [cameraPhase])

  function toPoint(point: NormalizedLandmark) {
    return {
      x: point.x,
      y: point.y,
      z: point.z,
      visibility: point.visibility,
    }
  }

  function clearKeypointOverlay() {
    const canvas = overlayRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
  }

  function isVisiblePosePoint(point: NormalizedLandmark | undefined) {
    if (!point) return false
    return point.visibility === undefined || point.visibility >= 0.35
  }

  function drawConnection(
    context: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    from: number,
    to: number,
    width: number,
    height: number,
    color: string,
    lineWidth: number,
    checkVisibility = false,
  ) {
    const a = landmarks[from]
    const b = landmarks[to]
    if (!a || !b) return
    if (checkVisibility && (!isVisiblePosePoint(a) || !isVisiblePosePoint(b))) return

    context.beginPath()
    context.moveTo(a.x * width, a.y * height)
    context.lineTo(b.x * width, b.y * height)
    context.strokeStyle = color
    context.lineWidth = lineWidth
    context.stroke()
  }

  function drawPoint(
    context: CanvasRenderingContext2D,
    point: NormalizedLandmark,
    width: number,
    height: number,
    color: string,
    radius: number,
  ) {
    context.beginPath()
    context.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2)
    context.fillStyle = color
    context.fill()
  }

  function drawKeypointOverlay(poseLandmarks: NormalizedLandmark[], handLandmarks: NormalizedLandmark[][]) {
    const video = videoRef.current
    const canvas = overlayRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return

    const width = video.videoWidth
    const height = video.videoHeight
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    const context = canvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, width, height)
    context.save()
    context.lineCap = 'round'
    context.lineJoin = 'round'

    const poseLineWidth = Math.max(4, width * 0.005)
    const handLineWidth = Math.max(3, width * 0.004)
    const poseRadius = Math.max(5, width * 0.006)
    const handRadius = Math.max(4, width * 0.0045)

    POSE_OVERLAY_CONNECTIONS.forEach(([from, to]) => {
      drawConnection(context, poseLandmarks, from, to, width, height, 'rgba(125, 211, 252, 0.82)', poseLineWidth, true)
    })
    POSE_OVERLAY_POINTS.forEach(index => {
      const point = poseLandmarks[index]
      if (isVisiblePosePoint(point)) {
        drawPoint(context, point, width, height, 'rgba(255, 255, 255, 0.92)', poseRadius)
      }
    })

    handLandmarks.forEach((landmarks, index) => {
      const color = HAND_OVERLAY_COLORS[index % HAND_OVERLAY_COLORS.length]
      HAND_OVERLAY_CONNECTIONS.forEach(([from, to]) => {
        drawConnection(context, landmarks, from, to, width, height, color, handLineWidth)
      })
      landmarks.forEach(point => {
        drawPoint(context, point, width, height, '#ffffff', handRadius)
      })
    })

    context.restore()
  }

  function toHandedness(categories: Category[] | undefined) {
    const category = categories?.[0]
    return {
      handedness: category?.categoryName,
      handedness_score: category?.score,
    }
  }

  function captureFrame(timeMs: number): SignPracticeFrame | null {
    const video = videoRef.current
    const poseLandmarker = poseLandmarkerRef.current
    const handLandmarker = handLandmarkerRef.current
    if (!video || !poseLandmarker || !handLandmarker || !video.videoWidth || !video.videoHeight) return null

    const timestamp = performance.now()
    const poseResult = poseLandmarker.detectForVideo(video, timestamp)
    const handResult = handLandmarker.detectForVideo(video, timestamp)
    const poseLandmarks = poseResult.landmarks[0] || []
    const handLandmarks = handResult.landmarks || []
    const handedness = handResult.handedness || handResult.handednesses || []
    drawKeypointOverlay(poseLandmarks, handLandmarks)

    return {
      time_ms: Math.round(timeMs),
      width: video.videoWidth,
      height: video.videoHeight,
      pose: poseLandmarks.map(toPoint),
      hands: handLandmarks.map((landmarks, index) => ({
        ...toHandedness(handedness[index]),
        landmarks: landmarks.map(point => ({ x: point.x, y: point.y, z: point.z })),
      })),
    }
  }

  async function captureKeypointSequence(durationMs: number) {
    await ensureVisionTasks()

    const frames: SignPracticeFrame[] = []
    const started = performance.now()
    let nextSampleAt = 0
    while (performance.now() - started < durationMs) {
      const elapsed = performance.now() - started
      if (elapsed >= nextSampleAt) {
        const frame = captureFrame(elapsed)
        if (frame) frames.push(frame)
        nextSampleAt += SAMPLE_INTERVAL_MS
      }
      await new Promise<void>(resolve => window.setTimeout(resolve, 24))
    }
    return frames
  }

  function toCameraMessage(error: unknown) {
    const message = error instanceof Error ? error.message : ''
    if (/permission|denied|notallowed/i.test(message)) {
      return '카메라 권한을 허용한 뒤 다시 촬영해 주세요.'
    }
    if (/abort/i.test(message)) {
      return '카메라 준비가 중단됐어요. 다시 촬영해 주세요.'
    }
    if (/notfound|device/i.test(message)) {
      return '사용할 수 있는 카메라를 찾지 못했어요.'
    }
    return message || '수어 평가를 완료하지 못했어요. 다시 시도해 주세요.'
  }

  async function startRecording() {
    setCameraError('')

    if (!segment?.id || !segment.keypoints_url) {
      setPhase('retry')
      setCameraError('비교할 정답 키포인트가 없어 이 단어는 평가할 수 없어요.')
      return
    }

    setPhase('recording')

    try {
      await ensureCameraStream()
      const userSequence = await captureKeypointSequence(recordingDurationMs)
      if (userSequence.length < 5) {
        throw new Error('키포인트가 충분히 잡히지 않았어요. 손과 얼굴이 화면에 보이게 다시 해보세요.')
      }

      setPhase('checking')
      const result = await evaluateSignPractice(segment.id, userSequence)
      const nextAttempt = attemptsRef.current + 1
      attemptsRef.current = nextAttempt
      setAttempts(nextAttempt)

      if (result.correct) {
        setPhase('passed')
        completeCurrentWord(1200)
      } else {
        setPhase('retry')
      }
    } catch (error) {
      setCameraError(toCameraMessage(error))
      setPhase('retry')
    }
  }

  function skipCurrentWord() {
    if (!canSkipWord) return
    attemptsRef.current = 0
    setAttempts(0)
    setCameraError('')
    setPhase('demo')
    setCurrentIdx(index => Math.min(index + 1, words.length - 1))
  }

  function replayAvatar() {
    if (!signVrmSrc) return
    setAvatarRevision(value => value + 1)
    setPhase('demo')
    window.setTimeout(() => {
      setPhase(prev => (prev === 'demo' ? 'ready' : prev))
    }, 2600)
  }

  const practiceText = (() => {
    if (!signLoading && !signVrmSrc) return '평가할 수어 예시가 없어요'
    if (visionLoading) return '평가 모델 준비 중'
    if (phase === 'demo') return '먼저 아바타 동작을 볼게요'
    if (phase === 'recording') return '촬영중'
    if (phase === 'checking') return '동작을 비교하고 있어요'
    if (phase === 'passed') return '정답! 다음 단어로 갈게요'
    if (phase === 'retry') return '조금 달라요. 다시 해볼까요?'
    return '동작을 따라 해볼까요?'
  })()

  return (
    <div className="study-sign">
      <div className="ss-cloud ss-cloud-left" />
      <div className="ss-cloud ss-cloud-right" />
      <div className="ss-shell">
        <section className="ss-avatar-panel" aria-label="수어 예시와 촬영 화면">
          <div className={`ss-avatar-stage ${cameraPhase ? 'with-camera' : ''}`}>
            {cameraPhase ? (
              <>
                <video ref={videoRef} className="ss-camera-video" playsInline muted />
                <canvas ref={overlayRef} className="ss-keypoint-overlay" aria-hidden="true" />
                {!stream && <div className="ss-camera-pending">카메라 준비 중</div>}
              </>
            ) : signVrmSrc ? (
              <iframe
                key={`${signVrmSrc}-${avatarRevision}`}
                className="ss-avatar-vrm"
                title={`${currentWord} 수어 아바타`}
                src={signVrmSrc}
                allow="autoplay"
              />
            ) : (
              <div className="ss-avatar-empty">
                {signLoading ? '예시 확인 중' : '수어 예시 없음'}
              </div>
            )}
            <span className="ss-avatar-label">{cameraPhase ? '촬영' : '예시'}</span>
            {!cameraPhase && signDescription && (
              <p className="ss-sign-caption" aria-label={`${currentWord} 수형 설명`}>
                {signDescription}
              </p>
            )}
          </div>
          <div className="ss-avatar-actions">
            <button className="ss-round-btn ss-replay" onClick={replayAvatar} aria-label="예시 다시보기" disabled={!signVrmSrc}>
              ↺
            </button>
            <button className="ss-round-btn ss-sound" aria-label="설명 듣기">
              ◕
            </button>
          </div>
        </section>

        <section className="ss-practice-panel" aria-label="수어 따라하기">
          <div className="ss-status-row">
            <span className={`ss-rec-dot ${phase === 'recording' ? 'active' : ''}`} />
            <strong>{practiceText}</strong>
          </div>

          <div className="ss-progress-track">
            <span
              className={`ss-progress-fill ${phase === 'recording' ? 'recording' : ''}`}
              style={{ width: `${Math.max(8, ((currentIdx + 1) / Math.max(words.length, 1)) * 100)}%` }}
            />
          </div>

          <div className="ss-practice-frame">
            <div className="ss-word-card">
              <div
                className="ss-word-cells"
                style={{ gridTemplateColumns: `repeat(${Math.max(chars.length, 1)}, minmax(82px, 1fr))` }}
              >
                {chars.map((char, index) => (
                  <span key={`${char}-${index}`} className="ss-word-cell">
                    {char}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="ss-capture-actions">
            <button
              className="ss-capture-btn"
              onClick={startRecording}
              disabled={phase === 'recording' || phase === 'checking' || phase === 'passed' || visionLoading || signLoading || !segment?.keypoints_url}
            >
              <span className="ss-capture-icon" />
              {visionLoading ? '준비 중' : phase === 'retry' ? '다시 촬영하기' : '눌러서 촬영하기'}
            </button>
            {canSkipWord && (
              <button className="ss-skip-btn" type="button" onClick={skipCurrentWord}>
                건너뛰기
              </button>
            )}
          </div>

          <div className="ss-feedback" aria-live="polite">
            {cameraError && <span className="ss-camera-error">{cameraError}</span>}
            {attempts === 0 && phase === 'ready' && (
              <span>아바타 예시와 같은 동작으로 따라 해요.</span>
            )}
          </div>

          <div className="ss-page-count">
            {currentIdx + 1}/{Math.max(words.length, 1)}
          </div>
        </section>
      </div>

      <button className="ss-back" onClick={() => navigate(-1)}>
        ‹
      </button>
      <AiTutor
        currentPage="수화하기"
        learningContent={currentWord}
        repeatedFailures={attempts >= 3}
        emotionState={phase === 'retry' ? '어려워함' : phase === 'passed' ? '자신감 있음' : '집중 중'}
        recentSuccess={phase === 'passed' ? currentWord : ''}
        trigger={avatarRevision}
      />
    </div>
  )
}
