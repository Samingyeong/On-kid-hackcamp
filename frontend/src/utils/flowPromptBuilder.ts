/**
 * flowPromptBuilder.ts
 *
 * FLOWAI 영상 생성 요청에 사용할 동적 프롬프트를 조립하는 유틸리티.
 *
 * 설계 원칙
 * ─────────────────────────────────────────────────────────────
 * 1. 가변 파트  : animal(동물) + action(상황) → 시나리오마다 달라지는 부분
 * 2. 고정 캐릭터: 늑대 아저씨 외모를 항상 동일하게 유지하는 앵커 키워드
 * 3. 스타일 가드레일: 화풍이 흔들리지 않도록 프롬프트 끝에 항상 붙는 태그 묶음
 *
 * 실제 FLOWAI 워크플로우 ID / 파라미터 키는 fetchFlowAIVideo() 쪽에서 주입합니다.
 */

// ─── 타입 ─────────────────────────────────────────────────────

/** buildVideoPrompt() 의 입력 파라미터 */
export interface PromptParams {
  /** 주인공 동물 (예: "rabbit", "bear", "fox") */
  animal: string
  /** 장면 행동/상황 (예: "sharing food with a friend", "helping someone who fell down") */
  action: string
  /**
   * 선택적 배경 장소 (예: "school", "forest", "market")
   * 생략하면 기본값 "a cheerful storybook world" 사용
   */
  location?: string
  /**
   * 선택적 감정 톤 (예: "happy", "surprised", "proud")
   * 생략하면 기본값 "warm and friendly" 사용
   */
  mood?: string
}

/** buildVideoPrompt() 의 반환 구조 */
export interface BuiltPrompt {
  /** FLOWAI inputs.prompt 필드에 그대로 넣을 최종 문자열 */
  prompt: string
  /** 디버깅·로깅용 분해 뷰 */
  parts: {
    scene: string
    characterAnchor: string
    styleGuardrail: string
  }
}

// ─── 고정 상수 ────────────────────────────────────────────────

/**
 * 늑대 아저씨 외모 고정 앵커.
 * 모든 시나리오에서 동일한 캐릭터가 등장하도록 프롬프트에 항상 포함됩니다.
 */
const CHARACTER_ANCHOR =
  'the same friendly grey wolf character with kind eyes, wearing a cozy blue scarf'

/**
 * 화풍 스타일 가드레일.
 * 영상 생성 모델이 일관된 비주얼을 유지하도록 프롬프트 끝에 항상 붙습니다.
 * 순서를 바꾸거나 항목을 제거하면 화풍이 흔들릴 수 있으므로 수정 금지.
 */
const STYLE_GUARDRAIL =
  'Pixar style 3D animation, soft volumetric lighting, clay material texture, ' +
  'vivid pastel colors, highly detailed, professional lighting'

// ─── 핵심 함수 ────────────────────────────────────────────────

/**
 * 동적 프롬프트를 조립해 반환합니다.
 *
 * @example
 * const { prompt } = buildVideoPrompt({ animal: 'rabbit', action: 'sharing carrots with a friend' })
 * // → "A rabbit is sharing carrots with a friend, alongside the same friendly grey wolf character
 * //    with kind eyes, wearing a cozy blue scarf, in a cheerful storybook world, warm and friendly mood.
 * //    Pixar style 3D animation, soft volumetric lighting, clay material texture,
 * //    vivid pastel colors, highly detailed, professional lighting"
 */
export function buildVideoPrompt(params: PromptParams): BuiltPrompt {
  const {
    animal,
    action,
    location = 'a cheerful storybook world',
    mood    = 'warm and friendly',
  } = params

  // 입력값 정제 — 앞뒤 공백 제거, 빈 문자열 방어
  const safeAnimal   = sanitize(animal,   'animal')
  const safeAction   = sanitize(action,   'action')
  const safeLocation = sanitize(location, 'location')
  const safeMood     = sanitize(mood,     'mood')

  // ── 가변 장면 파트 ──────────────────────────────────────────
  const scene =
    `A ${safeAnimal} is ${safeAction}, alongside ${CHARACTER_ANCHOR}, ` +
    `in ${safeLocation}, ${safeMood} mood.`

  // ── 최종 프롬프트 조립 ──────────────────────────────────────
  // 구조: [장면] [캐릭터 앵커는 scene 안에 포함] [스타일 가드레일]
  const prompt = `${scene} ${STYLE_GUARDRAIL}`

  return {
    prompt,
    parts: {
      scene,
      characterAnchor: CHARACTER_ANCHOR,
      styleGuardrail:  STYLE_GUARDRAIL,
    },
  }
}

// ─── 선택지 ID → PromptParams 매핑 헬퍼 ──────────────────────

/**
 * 그림 카드 선택지 ID(choiceId)를 PromptParams 로 변환합니다.
 *
 * ScenarioModule 에서 카드를 클릭하면 이 함수로 파라미터를 만들고,
 * 그 결과를 fetchFlowAIVideo() 에 넘깁니다.
 *
 * 실제 시나리오가 늘어나면 CHOICE_MAP 에 항목을 추가하기만 하면 됩니다.
 */
export function choiceIdToPromptParams(choiceId: string): PromptParams {
  const found = CHOICE_MAP[choiceId]
  if (!found) {
    // 알 수 없는 선택지는 기본 장면으로 폴백
    console.warn(`[flowPromptBuilder] 알 수 없는 choiceId: "${choiceId}" → 기본 장면 사용`)
    return DEFAULT_PARAMS
  }
  return found
}

// ─── 선택지 매핑 테이블 ───────────────────────────────────────

/**
 * choiceId → PromptParams 매핑 테이블.
 *
 * 키 네이밍 규칙: "<scenarioId>/<stepId>-<choiceId>"
 * fetchFlowAIVideo() 에서 compositeId를 조합할 때 sessionId를 앞에 붙입니다.
 * 시나리오가 달라도 step.id가 겹치므로 반드시 scenarioId를 포함해야 합니다.
 */
const CHOICE_MAP: Record<string, PromptParams> = {
  // ── 학교에서 생긴 일 (mock-001) ──────────────────────────────
  'mock-001/step-1-a': {
    animal:   'rabbit',
    action:   'gently helping a fallen friend stand up',
    location: 'a bright school hallway',
    mood:     'kind and caring',
  },
  'mock-001/step-1-b': {
    animal:   'rabbit',
    action:   'walking past a fallen friend without stopping',
    location: 'a bright school hallway',
    mood:     'neutral',
  },
  'mock-001/step-1-c': {
    animal:   'rabbit',
    action:   'running to tell the teacher about a fallen friend',
    location: 'a bright school hallway',
    mood:     'concerned and responsible',
  },
  'mock-001/step-2-a': {
    animal:   'bear',
    action:   'cutting in line at the school cafeteria',
    location: 'a colorful school cafeteria',
    mood:     'impatient',
  },
  'mock-001/step-2-b': {
    animal:   'bear',
    action:   'patiently waiting in line at the school cafeteria',
    location: 'a colorful school cafeteria',
    mood:     'happy and polite',
  },
  'mock-001/step-2-c': {
    animal:   'bear',
    action:   'sitting alone without eating lunch',
    location: 'a colorful school cafeteria',
    mood:     'sad',
  },
  'mock-001/step-3-a': {
    animal:   'fox',
    action:   'raising a hand to ask the teacher a question',
    location: 'a sunny classroom',
    mood:     'curious and confident',
  },
  'mock-001/step-3-b': {
    animal:   'fox',
    action:   'falling asleep during class',
    location: 'a sunny classroom',
    mood:     'sleepy',
  },
  'mock-001/step-3-c': {
    animal:   'fox',
    action:   'whispering a question to a classmate',
    location: 'a sunny classroom',
    mood:     'friendly',
  },

  // ── 마트에서 생긴 일 (mock-002) ──────────────────────────────
  'mock-002/step-1-a': {
    animal:   'squirrel',
    action:   'secretly hiding snacks under its coat in a supermarket',
    location: 'a bright supermarket',
    mood:     'nervous',
  },
  'mock-002/step-1-b': {
    animal:   'squirrel',
    action:   'asking a parent to buy a snack at the supermarket',
    location: 'a bright supermarket',
    mood:     'polite and cheerful',
  },
  'mock-002/step-1-c': {
    animal:   'squirrel',
    action:   'crying in front of a snack shelf',
    location: 'a bright supermarket',
    mood:     'sad',
  },
  'mock-002/step-2-a': {
    animal:   'deer',
    action:   'standing still and looking around nervously after getting lost',
    location: 'a busy supermarket aisle',
    mood:     'anxious',
  },
  'mock-002/step-2-b': {
    animal:   'deer',
    action:   'asking a store employee for help after getting lost',
    location: 'a busy supermarket aisle',
    mood:     'brave and relieved',
  },
  'mock-002/step-2-c': {
    animal:   'deer',
    action:   'wandering alone through supermarket aisles',
    location: 'a busy supermarket aisle',
    mood:     'confused',
  },
  'mock-002/step-3-a': {
    animal:   'hedgehog',
    action:   'pocketing extra change from the cashier',
    location: 'a supermarket checkout counter',
    mood:     'guilty',
  },
  'mock-002/step-3-b': {
    animal:   'hedgehog',
    action:   'handing back extra change to the cashier with a smile',
    location: 'a supermarket checkout counter',
    mood:     'honest and proud',
  },
  'mock-002/step-3-c': {
    animal:   'hedgehog',
    action:   'pretending not to notice the extra change',
    location: 'a supermarket checkout counter',
    mood:     'uneasy',
  },
}

const DEFAULT_PARAMS: PromptParams = {
  animal:   'bunny',
  action:   'playing happily in a meadow',
  location: 'a cheerful storybook world',
  mood:     'warm and friendly',
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────

/** 입력 문자열 정제 — 빈 값이면 fallback 반환 */
function sanitize(value: string, fieldName: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    console.warn(`[flowPromptBuilder] "${fieldName}" 값이 비어 있어 기본값을 사용합니다.`)
    return fieldName === 'animal' ? 'bunny' : 'doing something fun'
  }
  // 프롬프트 인젝션 방어: 따옴표·백슬래시 제거
  return trimmed.replace(/['"\\]/g, '')
}
