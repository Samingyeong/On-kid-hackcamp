/**
 * flowPromptBuilder.ts
 *
 * FLOWAI ?곸긽 ?앹꽦 ?붿껌???ъ슜???숈쟻 ?꾨＼?꾪듃瑜?議곕┰?섎뒗 ?좏떥由ы떚.
 *
 * ?ㅺ퀎 ?먯튃
 * ?????????????????????????????????????????????????????????????
 * 1. 媛蹂 ?뚰듃  : animal(?숇Ъ) + action(?곹솴) ???쒕굹由ъ삤留덈떎 ?щ씪吏??遺遺? * 2. 怨좎젙 罹먮┃?? ?묐? ?꾩????몃え瑜???긽 ?숈씪?섍쾶 ?좎??섎뒗 ?듭빱 ?ㅼ썙?? * 3. ?ㅽ???媛?쒕젅?? ?뷀뭾???붾뱾由ъ? ?딅룄濡??꾨＼?꾪듃 ?앹뿉 ??긽 遺숇뒗 ?쒓렇 臾띠쓬
 *
 * ?ㅼ젣 FLOWAI ?뚰겕?뚮줈??ID / ?뚮씪誘명꽣 ?ㅻ뒗 fetchFlowAIVideo() 履쎌뿉??二쇱엯?⑸땲??
 */

// ??? ????????????????????????????????????????????????????????

/** buildVideoPrompt() ???낅젰 ?뚮씪誘명꽣 */
export interface PromptParams {
  /** 二쇱씤怨??숇Ъ (?? "rabbit", "bear", "fox") */
  animal: string
  /** ?λ㈃ ?됰룞/?곹솴 (?? "sharing food with a friend", "helping someone who fell down") */
  action: string
  /**
   * ?좏깮??諛곌꼍 ?μ냼 (?? "school", "forest", "market")
   * ?앸왂?섎㈃ 湲곕낯媛?"a cheerful storybook world" ?ъ슜
   */
  location?: string
  /**
   * ?좏깮??媛먯젙 ??(?? "happy", "surprised", "proud")
   * ?앸왂?섎㈃ 湲곕낯媛?"warm and friendly" ?ъ슜
   */
  mood?: string
}

/** buildVideoPrompt() ??諛섑솚 援ъ“ */
export interface BuiltPrompt {
  /** FLOWAI inputs.prompt ?꾨뱶??洹몃?濡??ｌ쓣 理쒖쥌 臾몄옄??*/
  prompt: string
  /** ?붾쾭源끒룸줈源낆슜 遺꾪빐 酉?*/
  parts: {
    scene: string
    characterAnchor: string
    styleGuardrail: string
  }
}

// ??? 怨좎젙 ?곸닔 ????????????????????????????????????????????????

/**
 * ?묐? ?꾩????몃え 怨좎젙 ?듭빱.
 * 紐⑤뱺 ?쒕굹由ъ삤?먯꽌 ?숈씪??罹먮┃?곌? ?깆옣?섎룄濡??꾨＼?꾪듃????긽 ?ы븿?⑸땲??
 */
const CHARACTER_ANCHOR =
  'the same friendly grey wolf character with kind eyes, wearing a cozy blue scarf'

/**
 * ?뷀뭾 ?ㅽ???媛?쒕젅??
 * ?곸긽 ?앹꽦 紐⑤뜽???쇨???鍮꾩＜?쇱쓣 ?좎??섎룄濡??꾨＼?꾪듃 ?앹뿉 ??긽 遺숈뒿?덈떎.
 * ?쒖꽌瑜?諛붽씀嫄곕굹 ??ぉ???쒓굅?섎㈃ ?뷀뭾???붾뱾由????덉쑝誘濡??섏젙 湲덉?.
 */
const STYLE_GUARDRAIL =
  'Pixar style 3D animation, soft volumetric lighting, clay material texture, ' +
  'vivid pastel colors, highly detailed, professional lighting'

// ??? ?듭떖 ?⑥닔 ????????????????????????????????????????????????

/**
 * ?숈쟻 ?꾨＼?꾪듃瑜?議곕┰??諛섑솚?⑸땲??
 *
 * @example
 * const { prompt } = buildVideoPrompt({ animal: 'rabbit', action: 'sharing carrots with a friend' })
 * // ??"A rabbit is sharing carrots with a friend, alongside the same friendly grey wolf character
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

  // ?낅젰媛??뺤젣 ???욌뮘 怨듬갚 ?쒓굅, 鍮?臾몄옄??諛⑹뼱
  const safeAnimal   = sanitize(animal,   'animal')
  const safeAction   = sanitize(action,   'action')
  const safeLocation = sanitize(location, 'location')
  const safeMood     = sanitize(mood,     'mood')

  // ?? 媛蹂 ?λ㈃ ?뚰듃 ??????????????????????????????????????????
  const scene =
    `A ${safeAnimal} is ${safeAction}, alongside ${CHARACTER_ANCHOR}, ` +
    `in ${safeLocation}, ${safeMood} mood.`

  // ?? 理쒖쥌 ?꾨＼?꾪듃 議곕┰ ??????????????????????????????????????
  // 援ъ“: [?λ㈃] [罹먮┃???듭빱??scene ?덉뿉 ?ы븿] [?ㅽ???媛?쒕젅??
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

// ??? ?좏깮吏 ID ??PromptParams 留ㅽ븨 ?ы띁 ??????????????????????

/**
 * 洹몃┝ 移대뱶 ?좏깮吏 ID(choiceId)瑜?PromptParams 濡?蹂?섑빀?덈떎.
 *
 * ScenarioModule ?먯꽌 移대뱶瑜??대┃?섎㈃ ???⑥닔濡??뚮씪誘명꽣瑜?留뚮뱾怨?
 * 洹?寃곌낵瑜?fetchFlowAIVideo() ???섍퉩?덈떎.
 *
 * ?ㅼ젣 ?쒕굹由ъ삤媛 ?섏뼱?섎㈃ CHOICE_MAP ????ぉ??異붽??섍린留??섎㈃ ?⑸땲??
 */
export function choiceIdToPromptParams(choiceId: string): PromptParams {
  const found = CHOICE_MAP[choiceId]
  if (!found) {
    // ?????녿뒗 ?좏깮吏??湲곕낯 ?λ㈃?쇰줈 ?대갚
    console.warn(`[flowPromptBuilder] ?????녿뒗 choiceId: "${choiceId}" ??湲곕낯 ?λ㈃ ?ъ슜`)
    return DEFAULT_PARAMS
  }
  return found
}

// ??? ?좏깮吏 留ㅽ븨 ?뚯씠釉????????????????????????????????????????

/**
 * choiceId ??PromptParams 留ㅽ븨 ?뚯씠釉?
 *
 * ???ㅼ씠諛?洹쒖튃: "<scenarioId>/<stepId>-<choiceId>"
 * fetchFlowAIVideo() ?먯꽌 compositeId瑜?議고빀????sessionId瑜??욎뿉 遺숈엯?덈떎.
 * ?쒕굹由ъ삤媛 ?щ씪??step.id媛 寃뱀튂誘濡?諛섎뱶??scenarioId瑜??ы븿?댁빞 ?⑸땲??
 */
const CHOICE_MAP: Record<string, PromptParams> = {
  // ?? ?숆탳?먯꽌 ?앷릿 ??(mock-001) ??????????????????????????????
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

  // ?? 留덊듃?먯꽌 ?앷릿 ??(mock-002) ??????????????????????????????
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

// ??? ?대? ?ы띁 ????????????????????????????????????????????????

/** ?낅젰 臾몄옄???뺤젣 ??鍮?媛믪씠硫?fallback 諛섑솚 */
function sanitize(value: string, fieldName: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    console.warn(`[flowPromptBuilder] "${fieldName}" 媛믪씠 鍮꾩뼱 ?덉뼱 湲곕낯媛믪쓣 ?ъ슜?⑸땲??`)
    return fieldName === 'animal' ? 'bunny' : 'doing something fun'
  }
  // ?꾨＼?꾪듃 ?몄젥??諛⑹뼱: ?곗샂?쑣룸갚?щ옒???쒓굅
  return trimmed.replace(/['"\\]/g, '')
}
