/**
 * FLOWAI API 媛???곕룞 紐⑤뱢
 *
 * ?ㅼ젣 FLOWAI ?붾뱶?ъ씤?멸? 以鍮꾨릺硫?BASE_URL怨?API_KEY瑜?援먯껜?섍퀬
 * 媛??⑥닔??mock 遺꾧린瑜??쒓굅?섎㈃ ?⑸땲??
 *
 * ?꾩옱??濡쒖뺄 諛깆뿏??localhost:4000)瑜??꾨줉?쒕줈 ?ъ슜?섎뒗 媛??濡쒖쭅?낅땲??
 */
import axios, { type AxiosInstance } from 'axios'
import { buildVideoPrompt, choiceIdToPromptParams } from '../utils/flowPromptBuilder'
import { getCachedVideo, setCachedVideo } from '../utils/videoCache'

// ??? FLOWAI ?ㅼ젣 ?붾뱶?ъ씤??(?ㅼ젣 ?곕룞 ??援먯껜) ??????????????
const FLOWAI_WORKFLOW_URL = 'https://api.flowai.com/v1/workflows/run'
const FLOWAI_WORKFLOW_ID  = import.meta.env.VITE_FLOWAI_WORKFLOW_ID || 'braille-story-video-v1'

const BASE_URL = 'http://localhost:4000/api/flowai'
const USE_MOCK = true // ?ㅼ젣 API ?곕룞 ??false濡?蹂寃?
// ??? axios ?몄뒪?댁뒪 (FLOWAI ?꾩슜) ????????????????????????????
const flowaiAxios: AxiosInstance = axios.create({
  baseURL: FLOWAI_WORKFLOW_URL,
  timeout: 30_000, // ?곸긽 ?앹꽦? 理쒕? 30珥??덉슜
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  },
})

// ?붿껌 ?명꽣?됲꽣: API ???먮룞 二쇱엯
flowaiAxios.interceptors.request.use(config => {
  const apiKey = import.meta.env.VITE_FLOWAI_API_KEY || ''
  config.headers['Authorization'] = `Bearer ${apiKey}`
  config.headers['X-App-Id']      = import.meta.env.VITE_FLOWAI_APP_ID || 'braille-app'
  return config
})

// ?묐떟 ?명꽣?됲꽣: 怨듯넻 ?먮윭 濡쒓퉭
flowaiAxios.interceptors.response.use(
  res => res,
  err => {
    const status  = err.response?.status ?? 'network'
    const message = err.response?.data?.message ?? err.message
    console.error(`[FLOWAI axios] ${status} ??${message}`)
    return Promise.reject(err)
  }
)

// ??? ????뺤쓽 ????????????????????????????????????????????????

export interface ScenarioChoice {
  id: string
  label: string
  emoji?: string
}

export interface ScenarioStep {
  id: string
  question: string       // ?꾩씠?먭쾶 蹂댁뿬以?吏덈Ц/?곹솴
  imageHint?: string     // ?좏깮吏 ?댄빐瑜??뺣뒗 ?대?吏 URL (?좏깮)
  choices: ScenarioChoice[]
  correctId?: string     // ?뺣떟???덈뒗 寃쎌슦 (?댁쫰??
  feedback?: {           // ?좏깮 ???쇰뱶諛?硫붿떆吏
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
  nextStepId: string | null  // null?대㈃ ?쒕굹由ъ삤 醫낅즺
  encouragement: string      // FLOWAI媛 ?앹꽦??寃⑸젮 硫붿떆吏
}

// ??? Mock ?곗씠????????????????????????????????????????????????

const MOCK_SCENARIOS: ScenarioSession[] = [
  {
    sessionId: 'mock-001',
    title: '?숆탳?먯꽌 ?앷릿 ??,
    totalSteps: 3,
    steps: [
      {
        id: 'step-1',
        question: '移쒓뎄媛 ?섏뼱議뚯뼱?? ?대뼸寃??좉퉴??',
        choices: [
          { id: 'a', label: '?꾩?以섏슂', emoji: '?쩃' },
          { id: 'b', label: '洹몃깷 吏?섍???, emoji: '?슯' },
          { id: 'c', label: '?좎깮?섍퍡 ?뚮젮??, emoji: '?뱼' },
        ],
        correctId: 'a',
        feedback: {
          correct: '?섑뻽?댁슂! 移쒓뎄瑜??꾩?二쇰뒗 嫄??뺣쭚 硫뗭쭊 ?쇱씠?먯슂.',
          wrong: '移쒓뎄媛 ?ㅼ낀???뚮뒗 ?꾩?二쇨굅???좎깮?섍퍡 ?뚮젮???댁슂.',
        },
      },
      {
        id: 'step-2',
        question: '湲됱떇 ?쒓컙??以꾩쓣 ?쒖빞 ?댁슂. ?대뼸寃??좉퉴??',
        choices: [
          { id: 'a', label: '?덉튂湲고빐??, emoji: '?삤' },
          { id: 'b', label: '李⑤?瑜?湲곕떎?ㅼ슂', emoji: '?삃' },
          { id: 'c', label: '諛μ쓣 ??癒뱀뼱??, emoji: '?샄' },
        ],
        correctId: 'b',
        feedback: {
          correct: '留욎븘?? 李⑤?瑜?吏?ㅻ㈃ 紐⑤몢媛 ?됰났?댁슂.',
          wrong: '以꾩쓣 ???뚮뒗 李⑤?瑜?湲곕떎由щ뒗 寃?以묒슂?댁슂.',
        },
      },
      {
        id: 'step-3',
        question: '?섏뾽 ?쒓컙??紐⑤Ⅴ??寃??앷꼈?댁슂. ?대뼸寃??좉퉴??',
        choices: [
          { id: 'a', label: '?먯쓣 ?ㅼ뼱??, emoji: '?? },
          { id: 'b', label: '洹몃깷 ?섏뼱媛??, emoji: '?샂' },
          { id: 'c', label: '移쒓뎄?먭쾶 臾쇱뼱遊먯슂', emoji: '?뿣截? },
        ],
        correctId: 'a',
        feedback: {
          correct: '?뚮??댁슂! 紐⑤Ⅴ硫??먯쓣 ?ㅺ퀬 臾쇱뼱蹂대뒗 寃?理쒓퀬?덉슂.',
          wrong: '紐⑤? ?뚮뒗 ?먯쓣 ?ㅼ뼱 ?좎깮?섍퍡 臾쇱뼱蹂댁꽭??',
        },
      },
    ],
  },
  {
    sessionId: 'mock-002',
    title: '留덊듃?먯꽌 ?앷릿 ??,
    totalSteps: 3,
    steps: [
      {
        id: 'step-1',
        question: '留덊듃?먯꽌 媛뽮퀬 ?띠? 怨쇱옄媛 ?덉뼱?? ?대뼸寃??좉퉴??',
        choices: [
          { id: 'a', label: '紐곕옒 媛?멸???, emoji: '?삹' },
          { id: 'b', label: '遺紐⑤떂猿?留먰빐??, emoji: '?솇' },
          { id: 'c', label: '?몄뼱??, emoji: '?삲' },
        ],
        correctId: 'b',
        feedback: {
          correct: '?섑뻽?댁슂! 媛뽮퀬 ?띠? 寃??덉쑝硫?遺紐⑤떂猿?留먰븯??寃?留욎븘??',
          wrong: '臾쇨굔? ?덉쓣 ?닿퀬 ?ъ빞 ?댁슂. 遺紐⑤떂猿?留먰빐蹂댁꽭??',
        },
      },
      {
        id: 'step-2',
        question: '留덊듃?먯꽌 湲몄쓣 ?껋뿀?댁슂. ?대뼸寃??좉퉴??',
        choices: [
          { id: 'a', label: '洹??먮━?????덉뼱??, emoji: '?쭕' },
          { id: 'b', label: '留덊듃 吏곸썝?먭쾶 ?꾩????붿껌?댁슂', emoji: '?솋' },
          { id: 'c', label: '?쇱옄 李얠븘?ㅻ???, emoji: '?뵇' },
        ],
        correctId: 'b',
        feedback: {
          correct: '留욎븘?? ?대Ⅸ?먭쾶 ?꾩????붿껌?섎뒗 寃?媛???덉쟾?댁슂.',
          wrong: '湲몄쓣 ?껋쑝硫?留덊듃 吏곸썝?대굹 ?대Ⅸ?먭쾶 ?꾩????붿껌?섏꽭??',
        },
      },
      {
        id: 'step-3',
        question: '怨꾩궛??먯꽌 嫄곗뒪由꾨룉????諛쏆븯?댁슂. ?대뼸寃??좉퉴??',
        choices: [
          { id: 'a', label: '洹몃깷 媛?멸???, emoji: '?뮥' },
          { id: 'b', label: '吏곸썝?먭쾶 ?뚮젮以섏슂', emoji: '?ㅂ' },
          { id: 'c', label: '紐⑤Ⅸ 泥숉빐??, emoji: '?솃' },
        ],
        correctId: 'b',
        feedback: {
          correct: '?뺤쭅?섍쾶 ?뚮젮以ш뎔?? ?뺣쭚 ?뚮??댁슂.',
          wrong: '?⑥쓽 ?덉? ?뚮젮以섏빞 ?댁슂. ?뺤쭅???됰룞??以묒슂?댁슂.',
        },
      },
    ],
  },
]

const MOCK_ENCOURAGEMENTS = [
  '?뺣쭚 ?섑븯怨??덉뼱?? 怨꾩냽 ?대킄?? ?뙚',
  '硫뗭졇?? 議곌툑留????앷컖?대킄?? ?뮞',
  '愿쒖갖?꾩슂, ?ㅼ떆 ?쒕쾲 ?대킄?? ?삃',
  '?뚮??댁슂! ???????덉뼱! ?럦',
  '醫뗭븘?? 怨꾩냽 ?대젃寃??대킄?? ?뙂',
]

// ??? API ?⑥닔 ?????????????????????????????????????????????????

/**
 * ?쒕굹由ъ삤 紐⑸줉 議고쉶
 * FLOWAI: GET /scenarios?childAge=<age>&disability=<type>
 */
export async function fetchScenarios(
  childAge?: number,
  disability?: string
): Promise<ScenarioSession[]> {
  if (USE_MOCK) {
    // 媛???쒕젅??(?ㅼ젣 API ?묐떟 ?쒕??덉씠??
    await delay(400)
    return MOCK_SCENARIOS
  }

  const params = new URLSearchParams()
  if (childAge)    params.set('childAge', String(childAge))
  if (disability)  params.set('disability', disability)

  const res = await fetch(`${BASE_URL}/scenarios?${params}`, {
    headers: flowaiHeaders(),
  })
  if (!res.ok) throw new Error(`FLOWAI ?쒕굹由ъ삤 議고쉶 ?ㅽ뙣: ${res.status}`)
  return res.json()
}

/**
 * ?뱀젙 ?쒕굹由ъ삤 ?몄뀡 ?쒖옉
 * FLOWAI: POST /scenarios/start
 */
export async function startScenarioSession(
  scenarioId: string,
  userId: string
): Promise<ScenarioSession> {
  if (USE_MOCK) {
    await delay(300)
    const found = MOCK_SCENARIOS.find(s => s.sessionId === scenarioId)
    if (!found) throw new Error('?쒕굹由ъ삤瑜?李얠쓣 ???놁뼱??)
    return { ...found }
  }

  const res = await fetch(`${BASE_URL}/scenarios/start`, {
    method: 'POST',
    headers: { ...flowaiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioId, userId }),
  })
  if (!res.ok) throw new Error(`FLOWAI ?몄뀡 ?쒖옉 ?ㅽ뙣: ${res.status}`)
  return res.json()
}

/**
 * ?좏깮吏 ?쒖텧 諛??쇰뱶諛??섏떊
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
    if (!session) throw new Error('?몄뀡??李얠쓣 ???놁뼱??)

    const stepIdx = session.steps.findIndex(s => s.id === stepId)
    const step = session.steps[stepIdx]
    if (!step) throw new Error('?④퀎瑜?李얠쓣 ???놁뼱??)

    const isCorrect = step.correctId ? step.correctId === choiceId : true
    const feedbackMessage = step.feedback
      ? isCorrect ? step.feedback.correct : step.feedback.wrong
      : '???좏깮?덉뼱??'

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
  if (!res.ok) throw new Error(`FLOWAI ?듬? ?쒖텧 ?ㅽ뙣: ${res.status}`)
  return res.json()
}

/**
 * ?몄뀡 寃곌낵 ???(?숈뒿 ?대젰)
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
    console.log('[FLOWAI Mock] ?몄뀡 ?꾨즺 ???', { sessionId, userId, score, totalSteps })
    return
  }

  await fetch(`${BASE_URL}/scenarios/complete`, {
    method: 'POST',
    headers: { ...flowaiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, userId, score, totalSteps }),
  })
}

// ??? ?곸긽 ?앹꽦 ?뚯씠?꾨씪???????????????????????????????????????

export interface VideoResult {
  videoUrl: string
  /** 'cache': 罹먯떆?먯꽌 利됱떆 諛섑솚 | 'flowai': FLOWAI API ?몄텧 寃곌낵 */
  source: 'cache' | 'flowai'
  /** ?ㅼ젣 ?뚯슂 ?쒓컙 (ms) */
  elapsedMs: number
}

/**
 * 洹몃┝ 移대뱶 ?좏깮 ???몄텧?섎뒗 硫붿씤 ?뚯씠?꾨씪??
 *
 * ?ㅽ뻾 ?쒖꽌:
 *   1. choiceId ??PromptParams 蹂??(flowPromptBuilder)
 *   2. 罹먯떆 議고쉶 (videoCache) ???덊듃 ??利됱떆 諛섑솚 (API ?몄텧 ?놁쓬)
 *   3. 罹먯떆 誘몄뒪 ???꾨＼?꾪듃 議곕┰ ??FLOWAI axios ?붿껌
 *   4. ?묐떟 URL??罹먯떆???????諛섑솚
 *
 * @param choiceId    ScenarioChoice.id  (?? "a")
 * @param stepId      ScenarioStep.id    (?? "step-1")
 * @param sessionId   ScenarioSession.sessionId (?? "mock-001")
 */
export async function fetchFlowAIVideo(
  choiceId: string,
  stepId: string,
  sessionId: string,
): Promise<VideoResult> {
  const t0 = Date.now()

  // ?? 1. choiceId ??PromptParams ??????????????????????????????
  // ???뺤떇: "<sessionId>/<stepId>-<choiceId>"
  const compositeId = `${sessionId}/${stepId}-${choiceId}`
  const params      = choiceIdToPromptParams(compositeId)
  const { prompt, parts } = buildVideoPrompt(params)

  // ?? 2. 罹먯떆 議고쉶 ????????????????????????????????????????????
  const cached = getCachedVideo(params.animal, params.action)
  if (cached) {
    // ?뺤쟻 罹먯떆???뚯씪???ㅼ젣濡??놁쓣 ???덉쑝誘濡?0.1s ?쒕젅?대쭔 異붽?
    await delay(100)
    return { videoUrl: cached.url, source: 'cache', elapsedMs: Date.now() - t0 }
  }

  // ?? 3. FLOWAI API ?몄텧 ??????????????????????????????????????
  if (USE_MOCK) {
    // Mock: 3~5珥??쒕젅????媛??URL 諛섑솚
    const mockDelay = 3000 + Math.random() * 2000
    await delay(mockDelay)
    const mockUrl = `/assets/videos/demo_default.mp4`
    setCachedVideo(params.animal, params.action, mockUrl)
    console.info('[FLOWAI Mock] ?앹꽦 ?꾨즺:', { compositeId, prompt: parts.scene, mockUrl })
    return { videoUrl: mockUrl, source: 'flowai', elapsedMs: Date.now() - t0 }
  }

  // ?? ?ㅼ젣 FLOWAI axios ?붿껌 ??????????????????????????????????
  // FLOWAI Workflow API ?ㅽ럺:
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
      // 硫뷀??곗씠??(FLOWAI ??쒕낫??異붿쟻??
      meta: {
        choiceId,
        stepId,
        animal: params.animal,
        action: params.action,
      },
    },
    // ?묐떟 紐⑤뱶: blocking (?곸긽 ?꾩꽦源뚯? ?湲?
    response_mode: 'blocking',
  })

  const videoUrl = response.data.data.outputs.video_url
  if (!videoUrl) throw new Error('FLOWAI ?묐떟??video_url???놁뒿?덈떎')

  // ?? 4. ?고???罹먯떆 ????????????????????????????????????????
  setCachedVideo(params.animal, params.action, videoUrl)

  return { videoUrl, source: 'flowai', elapsedMs: Date.now() - t0 }
}

// ??? ?ы띁 ?????????????????????????????????????????????????????

function flowaiHeaders(): Record<string, string> {
  // ?ㅼ젣 ?곕룞 ???섍꼍蹂?섏뿉??API ?ㅻ? ?쎌뼱?듬땲??  const apiKey = import.meta.env.VITE_FLOWAI_API_KEY || ''
  return {
    'Authorization': `Bearer ${apiKey}`,
    'X-App-Id': import.meta.env.VITE_FLOWAI_APP_ID || 'braille-app',
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
