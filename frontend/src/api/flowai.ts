/**
 * FLOWAI API 가상 연동 모듈
 *
 * 실제 FLOWAI 엔드포인트가 준비되면 BASE_URL과 API_KEY를 교체하고
 * 각 함수의 mock 분기를 제거하면 됩니다.
 *
 * 현재는 로컬 백엔드(localhost:4000)를 프록시로 사용하는 가상 로직입니다.
 */
import axios, { type AxiosInstance } from 'axios'
import { buildVideoPrompt, choiceIdToPromptParams } from '../utils/flowPromptBuilder'
import { getCachedVideo, setCachedVideo } from '../utils/videoCache'

// ─── FLOWAI 실제 엔드포인트 (실제 연동 시 교체) ──────────────
const FLOWAI_WORKFLOW_URL = 'https://api.flowai.com/v1/workflows/run'
const FLOWAI_WORKFLOW_ID  = import.meta.env.VITE_FLOWAI_WORKFLOW_ID || 'braille-story-video-v1'

const BASE_URL = 'http://localhost:4000/api/flowai'
const USE_MOCK = true // 실제 API 연동 시 false로 변경

// ─── axios 인스턴스 (FLOWAI 전용) ────────────────────────────
const flowaiAxios: AxiosInstance = axios.create({
  baseURL: FLOWAI_WORKFLOW_URL,
  timeout: 30_000, // 영상 생성은 최대 30초 허용
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  },
})

// 요청 인터셉터: API 키 자동 주입
flowaiAxios.interceptors.request.use(config => {
  const apiKey = import.meta.env.VITE_FLOWAI_API_KEY || ''
  config.headers['Authorization'] = `Bearer ${apiKey}`
  config.headers['X-App-Id']      = import.meta.env.VITE_FLOWAI_APP_ID || 'braille-app'
  return config
})

// 응답 인터셉터: 공통 에러 로깅
flowaiAxios.interceptors.response.use(
  res => res,
  err => {
    const status  = err.response?.status ?? 'network'
    const message = err.response?.data?.message ?? err.message
    console.error(`[FLOWAI axios] ${status} — ${message}`)
    return Promise.reject(err)
  }
)

// ─── 타입 정의 ────────────────────────────────────────────────

export interface ScenarioChoice {
  id: string
  label: string
  emoji?: string
}

export interface ScenarioStep {
  id: string
  question: string       // 아이에게 보여줄 질문/상황
  imageHint?: string     // 선택지 이해를 돕는 이미지 URL (선택)
  choices: ScenarioChoice[]
  correctId?: string     // 정답이 있는 경우 (퀴즈형)
  feedback?: {           // 선택 후 피드백 메시지
    correct: string
    wrong: string
  }
}

export interface ScenarioSession {
  sessionId: string
  title: string
  steps: ScenarioStep[]
  totalSteps: number
}

export interface ScenarioResult {
  sessionId: string
  stepId: string
  choiceId: string
  isCorrect: boolean
  feedbackMessage: string
  nextStepId: string | null  // null이면 시나리오 종료
  encouragement: string      // FLOWAI가 생성한 격려 메시지
}

// ─── Mock 데이터 ──────────────────────────────────────────────

const MOCK_SCENARIOS: ScenarioSession[] = [
  {
    sessionId: 'mock-001',
    title: '학교에서 생긴 일',
    totalSteps: 3,
    steps: [
      {
        id: 'step-1',
        question: '친구가 넘어졌어요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '도와줘요', emoji: '🤝' },
          { id: 'b', label: '그냥 지나가요', emoji: '🚶' },
          { id: 'c', label: '선생님께 알려요', emoji: '📢' },
        ],
        correctId: 'a',
        feedback: {
          correct: '잘했어요! 친구를 도와주는 건 정말 멋진 일이에요.',
          wrong: '친구가 다쳤을 때는 도와주거나 선생님께 알려야 해요.',
        },
      },
      {
        id: 'step-2',
        question: '급식 시간에 줄을 서야 해요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '새치기해요', emoji: '😤' },
          { id: 'b', label: '차례를 기다려요', emoji: '😊' },
          { id: 'c', label: '밥을 안 먹어요', emoji: '😶' },
        ],
        correctId: 'b',
        feedback: {
          correct: '맞아요! 차례를 지키면 모두가 행복해요.',
          wrong: '줄을 설 때는 차례를 기다리는 게 중요해요.',
        },
      },
      {
        id: 'step-3',
        question: '수업 시간에 모르는 게 생겼어요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '손을 들어요', emoji: '✋' },
          { id: 'b', label: '그냥 넘어가요', emoji: '😴' },
          { id: 'c', label: '친구에게 물어봐요', emoji: '🗣️' },
        ],
        correctId: 'a',
        feedback: {
          correct: '훌륭해요! 모르면 손을 들고 물어보는 게 최고예요.',
          wrong: '모를 때는 손을 들어 선생님께 물어보세요.',
        },
      },
    ],
  },
  {
    sessionId: 'mock-002',
    title: '마트에서 생긴 일',
    totalSteps: 3,
    steps: [
      {
        id: 'step-1',
        question: '마트에서 갖고 싶은 과자가 있어요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '몰래 가져가요', emoji: '😰' },
          { id: 'b', label: '부모님께 말해요', emoji: '🙋' },
          { id: 'c', label: '울어요', emoji: '😭' },
        ],
        correctId: 'b',
        feedback: {
          correct: '잘했어요! 갖고 싶은 게 있으면 부모님께 말하는 게 맞아요.',
          wrong: '물건은 돈을 내고 사야 해요. 부모님께 말해보세요.',
        },
      },
      {
        id: 'step-2',
        question: '마트에서 길을 잃었어요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '그 자리에 서 있어요', emoji: '🧍' },
          { id: 'b', label: '마트 직원에게 도움을 요청해요', emoji: '🙏' },
          { id: 'c', label: '혼자 찾아다녀요', emoji: '🔍' },
        ],
        correctId: 'b',
        feedback: {
          correct: '맞아요! 어른에게 도움을 요청하는 게 가장 안전해요.',
          wrong: '길을 잃으면 마트 직원이나 어른에게 도움을 요청하세요.',
        },
      },
      {
        id: 'step-3',
        question: '계산대에서 거스름돈을 더 받았어요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '그냥 가져가요', emoji: '💰' },
          { id: 'b', label: '직원에게 돌려줘요', emoji: '🤲' },
          { id: 'c', label: '모른 척해요', emoji: '🙈' },
        ],
        correctId: 'b',
        feedback: {
          correct: '정직하게 돌려줬군요! 정말 훌륭해요.',
          wrong: '남의 돈은 돌려줘야 해요. 정직한 행동이 중요해요.',
        },
      },
    ],
  },
]

const MOCK_ENCOURAGEMENTS = [
  '정말 잘하고 있어요! 계속 해봐요! 🌟',
  '멋져요! 조금만 더 생각해봐요! 💪',
  '괜찮아요, 다시 한번 해봐요! 😊',
  '훌륭해요! 넌 할 수 있어! 🎉',
  '좋아요! 계속 이렇게 해봐요! 🌈',
]

// ─── API 함수 ─────────────────────────────────────────────────

/**
 * 시나리오 목록 조회
 * FLOWAI: GET /scenarios?childAge=<age>&disability=<type>
 */
export async function fetchScenarios(
  childAge?: number,
  disability?: string
): Promise<ScenarioSession[]> {
  if (USE_MOCK) {
    // 가상 딜레이 (실제 API 응답 시뮬레이션)
    await delay(400)
    return MOCK_SCENARIOS
  }

  const params = new URLSearchParams()
  if (childAge)    params.set('childAge', String(childAge))
  if (disability)  params.set('disability', disability)

  const res = await fetch(`${BASE_URL}/scenarios?${params}`, {
    headers: flowaiHeaders(),
  })
  if (!res.ok) throw new Error(`FLOWAI 시나리오 조회 실패: ${res.status}`)
  return res.json()
}

/**
 * 특정 시나리오 세션 시작
 * FLOWAI: POST /scenarios/start
 */
export async function startScenarioSession(
  scenarioId: string,
  userId: string
): Promise<ScenarioSession> {
  if (USE_MOCK) {
    await delay(300)
    const found = MOCK_SCENARIOS.find(s => s.sessionId === scenarioId)
    if (!found) throw new Error('시나리오를 찾을 수 없어요')
    return { ...found }
  }

  const res = await fetch(`${BASE_URL}/scenarios/start`, {
    method: 'POST',
    headers: { ...flowaiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioId, userId }),
  })
  if (!res.ok) throw new Error(`FLOWAI 세션 시작 실패: ${res.status}`)
  return res.json()
}

/**
 * 선택지 제출 및 피드백 수신
 * FLOWAI: POST /scenarios/answer
 */
export async function submitScenarioAnswer(
  sessionId: string,
  stepId: string,
  choiceId: string
): Promise<ScenarioResult> {
  if (USE_MOCK) {
    await delay(500)

    const session = MOCK_SCENARIOS.find(s => s.sessionId === sessionId)
    if (!session) throw new Error('세션을 찾을 수 없어요')

    const stepIdx = session.steps.findIndex(s => s.id === stepId)
    const step = session.steps[stepIdx]
    if (!step) throw new Error('단계를 찾을 수 없어요')

    const isCorrect = step.correctId ? step.correctId === choiceId : true
    const feedbackMessage = step.feedback
      ? isCorrect ? step.feedback.correct : step.feedback.wrong
      : '잘 선택했어요!'

    const nextStep = session.steps[stepIdx + 1]
    const encouragement =
      MOCK_ENCOURAGEMENTS[Math.floor(Math.random() * MOCK_ENCOURAGEMENTS.length)]

    return {
      sessionId,
      stepId,
      choiceId,
      isCorrect,
      feedbackMessage,
      nextStepId: nextStep?.id ?? null,
      encouragement,
    }
  }

  const res = await fetch(`${BASE_URL}/scenarios/answer`, {
    method: 'POST',
    headers: { ...flowaiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, stepId, choiceId }),
  })
  if (!res.ok) throw new Error(`FLOWAI 답변 제출 실패: ${res.status}`)
  return res.json()
}

/**
 * 세션 결과 저장 (학습 이력)
 * FLOWAI: POST /scenarios/complete
 */
export async function completeScenarioSession(
  sessionId: string,
  userId: string,
  score: number,
  totalSteps: number
): Promise<void> {
  if (USE_MOCK) {
    await delay(200)
    console.log('[FLOWAI Mock] 세션 완료 저장:', { sessionId, userId, score, totalSteps })
    return
  }

  await fetch(`${BASE_URL}/scenarios/complete`, {
    method: 'POST',
    headers: { ...flowaiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, userId, score, totalSteps }),
  })
}

// ─── 영상 생성 파이프라인 ─────────────────────────────────────

export interface VideoResult {
  videoUrl: string
  /** 'cache': 캐시에서 즉시 반환 | 'flowai': FLOWAI API 호출 결과 */
  source: 'cache' | 'flowai'
  /** 실제 소요 시간 (ms) */
  elapsedMs: number
}

/**
 * 그림 카드 선택 시 호출되는 메인 파이프라인.
 *
 * 실행 순서:
 *   1. choiceId → PromptParams 변환 (flowPromptBuilder)
 *   2. 캐시 조회 (videoCache) — 히트 시 즉시 반환 (API 호출 없음)
 *   3. 캐시 미스 → 프롬프트 조립 → FLOWAI axios 요청
 *   4. 응답 URL을 캐시에 저장 후 반환
 *
 * @param choiceId    ScenarioChoice.id  (예: "a")
 * @param stepId      ScenarioStep.id    (예: "step-1")
 * @param sessionId   ScenarioSession.sessionId (예: "mock-001")
 */
export async function fetchFlowAIVideo(
  choiceId: string,
  stepId: string,
  sessionId: string,
): Promise<VideoResult> {
  const t0 = Date.now()

  // ── 1. choiceId → PromptParams ──────────────────────────────
  // 키 형식: "<sessionId>/<stepId>-<choiceId>"
  const compositeId = `${sessionId}/${stepId}-${choiceId}`
  const params      = choiceIdToPromptParams(compositeId)
  const { prompt, parts } = buildVideoPrompt(params)

  // ── 2. 캐시 조회 ────────────────────────────────────────────
  const cached = getCachedVideo(params.animal, params.action)
  if (cached) {
    // 정적 캐시는 파일이 실제로 없을 수 있으므로 0.1s 딜레이만 추가
    await delay(100)
    return { videoUrl: cached.url, source: 'cache', elapsedMs: Date.now() - t0 }
  }

  // ── 3. FLOWAI API 호출 ──────────────────────────────────────
  if (USE_MOCK) {
    // Mock: 3~5초 딜레이 후 가상 URL 반환
    const mockDelay = 3000 + Math.random() * 2000
    await delay(mockDelay)
    const mockUrl = `/assets/videos/demo_default.mp4`
    setCachedVideo(params.animal, params.action, mockUrl)
    console.info('[FLOWAI Mock] 생성 완료:', { compositeId, prompt: parts.scene, mockUrl })
    return { videoUrl: mockUrl, source: 'flowai', elapsedMs: Date.now() - t0 }
  }

  // ── 실제 FLOWAI axios 요청 ──────────────────────────────────
  // FLOWAI Workflow API 스펙:
  //   POST https://api.flowai.com/v1/workflows/run
  //   Body: { workflow_id, inputs: { prompt, style, character_anchor } }
  //   Response: { data: { outputs: { video_url: string } } }
  const response = await flowaiAxios.post<{
    data: { outputs: { video_url: string } }
  }>('', {
    workflow_id: FLOWAI_WORKFLOW_ID,
    inputs: {
      prompt:           prompt,
      style:            parts.styleGuardrail,
      character_anchor: parts.characterAnchor,
      // 메타데이터 (FLOWAI 대시보드 추적용)
      meta: {
        choiceId,
        stepId,
        animal: params.animal,
        action: params.action,
      },
    },
    // 응답 모드: blocking (영상 완성까지 대기)
    response_mode: 'blocking',
  })

  const videoUrl = response.data.data.outputs.video_url
  if (!videoUrl) throw new Error('FLOWAI 응답에 video_url이 없습니다')

  // ── 4. 런타임 캐시 저장 ─────────────────────────────────────
  setCachedVideo(params.animal, params.action, videoUrl)

  return { videoUrl, source: 'flowai', elapsedMs: Date.now() - t0 }
}

// ─── 헬퍼 ─────────────────────────────────────────────────────

function flowaiHeaders(): Record<string, string> {
  // 실제 연동 시 환경변수에서 API 키를 읽어옵니다
  const apiKey = import.meta.env.VITE_FLOWAI_API_KEY || ''
  return {
    'Authorization': `Bearer ${apiKey}`,
    'X-App-Id': import.meta.env.VITE_FLOWAI_APP_ID || 'braille-app',
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
