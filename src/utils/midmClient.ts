/**
 * midmClient.ts
 * KT MIDM API 클라이언트
 *
 * ── 과부하 방지 전략 ──
 * 1. 로컬 캐시: 동일 요청은 API 재호출 없이 캐시 반환 (Map, 최대 50개)
 * 2. 디바운스: 마지막 호출 후 800ms 이내 중복 요청 차단
 * 3. 재시도: 429(Too Many Requests) 시 최대 2회, 지수 백오프(1s → 2s)
 * 4. 요청 큐: 동시 요청 1개로 제한 (순차 처리)
 */

const BASE_URL = import.meta.env.VITE_MIDM_BASE_URL as string
const MODEL    = import.meta.env.VITE_MIDM_MODEL    as string
const API_KEY  = import.meta.env.VITE_MIDM_API_KEY  as string

// ────────────────────────────────────────────────
// 시스템 프롬프트
// ────────────────────────────────────────────────
const FEEDBACK_PROMPT = `당신은 시각장애 아동을 위한 점자 타자 연습 앱의 친절한 선생님입니다.
아이가 점자로 입력한 문장을 받아서 다음을 해주세요:
1. 맞춤법/띄어쓰기 오류가 있으면 올바른 문장을 알려주세요.
2. 잘 썼으면 칭찬해주세요.
3. 답변은 반드시 2~3문장 이내로, 아이가 이해하기 쉬운 말로 해주세요.
4. 이모지를 1~2개 사용해서 친근하게 표현해주세요.`

const HINT_PROMPT = `당신은 시각장애 아동을 위한 점자 타자 연습 앱의 친절한 선생님입니다.
아이에게 단어의 뜻과 재미있는 예시 문장을 알려주세요.
답변은 반드시 2문장 이내로, 7세 아이가 이해할 수 있는 쉬운 말로 해주세요.
이모지를 1~2개 사용해서 친근하게 표현해주세요.`

const PRONUNCIATION_PROMPT = `당신은 시각장애 아동을 위한 발음 연습 앱의 친절한 선생님입니다.
아이가 목표 단어를 따라 말했는데 발음이 조금 달랐어요.
목표 단어의 올바른 발음 방법을 아주 쉽고 친절하게 설명해주세요.
예를 들어 입 모양이나 혀 위치를 쉽게 설명해주세요.
답변은 반드시 2문장 이내로, 7세 아이가 이해할 수 있는 말로 해주세요.
이모지를 1~2개 사용해주세요.`

// ────────────────────────────────────────────────
// 로컬 캐시 (LRU 간소화 버전)
// ────────────────────────────────────────────────
const MAX_CACHE = 50
const cache = new Map<string, string>()

function getCached(key: string): string | null {
  return cache.get(key) ?? null
}

function setCached(key: string, value: string) {
  if (cache.size >= MAX_CACHE) {
    // 가장 오래된 항목 제거
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(key, value)
}

// ────────────────────────────────────────────────
// 요청 큐 (동시 요청 1개 제한)
// ────────────────────────────────────────────────
let requestQueue = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(fn)
  // 큐가 실패해도 다음 요청은 진행
  requestQueue = result.then(() => {}, () => {})
  return result
}

// ────────────────────────────────────────────────
// 디바운스 타이머 (함수별)
// ────────────────────────────────────────────────
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 800

function debounceKey(key: string): Promise<void> {
  return new Promise((resolve) => {
    const existing = debounceTimers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      debounceTimers.delete(key)
      resolve()
    }, DEBOUNCE_MS)
    debounceTimers.set(key, timer)
  })
}

// ────────────────────────────────────────────────
// 핵심 API 호출 (재시도 포함)
// ────────────────────────────────────────────────
async function fetchMIDM(
  systemPrompt: string,
  userMessage: string,
  retries = 2,
  delayMs = 1000,
): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    })

    // 429 Too Many Requests → 재시도
    if (response.status === 429 && retries > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
      return fetchMIDM(systemPrompt, userMessage, retries - 1, delayMs * 2)
    }

    if (!response.ok) throw new Error(`API 오류: ${response.status}`)

    const data = await response.json() as {
      choices: { message: { content: string } }[]
    }
    return data.choices[0]?.message?.content?.trim() ?? ''

  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
      return fetchMIDM(systemPrompt, userMessage, retries - 1, delayMs * 2)
    }
    throw err
  }
}

// ────────────────────────────────────────────────
// 공통 호출 래퍼 (캐시 + 디바운스 + 큐)
// ────────────────────────────────────────────────
async function callMIDM(
  systemPrompt: string,
  userMessage: string,
  cacheKey: string,
): Promise<string> {
  // 1. 캐시 확인
  const cached = getCached(cacheKey)
  if (cached) return cached

  // 2. 디바운스 (같은 키로 연속 호출 방지)
  await debounceKey(cacheKey)

  // 3. 큐에 넣어 순차 처리
  return enqueue(async () => {
    // 디바운스 대기 중 다른 요청이 캐시를 채웠을 수 있음
    const cachedAfterWait = getCached(cacheKey)
    if (cachedAfterWait) return cachedAfterWait

    const result = await fetchMIDM(systemPrompt, userMessage)
    setCached(cacheKey, result)
    return result
  })
}

// ────────────────────────────────────────────────
// 공개 API
// ────────────────────────────────────────────────
export interface FeedbackResult {
  corrected: string
  message: string
}

/** 점자 입력 문장 교정/피드백 */
export async function getAIFeedback(inputText: string): Promise<FeedbackResult> {
  const key = `feedback:${inputText}`
  const raw = await callMIDM(FEEDBACK_PROMPT, `아이가 입력한 문장: "${inputText}"`, key)
  const correctedMatch = raw.match(/["'"](.*?)["'"]/)
  const corrected = correctedMatch ? correctedMatch[1]! : inputText
  return { corrected, message: raw }
}

/** 단어 힌트 — 뜻과 예시 문장 */
export async function getWordHint(word: string): Promise<string> {
  const key = `hint:${word}`
  return callMIDM(HINT_PROMPT, `단어: "${word}"`, key)
}

/** 틀린 발음 교정 설명 */
export async function getPronunciationHelp(
  targetWord: string,
  heardWord: string,
): Promise<string> {
  const key = `pronunciation:${targetWord}:${heardWord}`
  return callMIDM(
    PRONUNCIATION_PROMPT,
    `목표 단어: "${targetWord}", 아이가 말한 것: "${heardWord}"`,
    key,
  )
}
