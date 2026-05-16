const Groq = require('groq-sdk')

let groq = null
function getGroq() {
  if (!groq) {
    if (!process.env.GROQ_API_KEY) return null
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return groq
}

const MODEL = 'llama-3.1-8b-instant'

// 결과 캐시
const cache = new Map()

const SYSTEM_PROMPT = `당신은 한국어 형태소 분석 전문가입니다.
주어진 문장에서 수어로 표현할 핵심 단어만 추출합니다.

규칙:
- 명사, 동사, 형용사, 부사 위주로 추출
- 동사/형용사는 반드시 기본형(~다)으로 변환 (팔아→팔다, 됐어→되다, 달리다→달리다(붙이다 의미면 달리다))
- 문맥을 보고 동형이의어를 정확히 판단 (날→날다/날(day) 구분, 달리다→run/attach 구분)
- 감탄사(와, 아, 오 등)는 제외
- 호격 조사(준아→준 제외, 인물 이름이면 제외)
- 조사, 어미, 접속사, 불용어(것, 수, 때 등) 제외
- 의성어/의태어는 부사로 포함 (짜잔→Adverb)
- 중복 제거
- JSON 배열만 반환 (설명 없이)

형식: [{"form":"단어","tag":"Noun|Verb|Adjective|Adverb"}]`

/**
 * 문장에서 수어 매핑용 핵심 단어 추출 (Groq LLM)
 */
async function extractKeywords(text) {
  const key = 'sent:' + text
  if (cache.has(key)) return cache.get(key)
  const client = getGroq()
  if (!client) return { text, keywords: [], count: 0, error: 'GROQ_API_KEY not set' }
  try {
    const r = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `문장: "${text}"\n\nJSON:` }
      ],
      max_tokens: 300,
      temperature: 0.1,  // 낮을수록 일관성 높음
    })

    const raw = r.choices[0].message.content.trim()
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in response')

    const keywords = JSON.parse(match[0])
    const result = { text, keywords, count: keywords.length }
    cache.set(key, result)
    return result
  } catch (e) {
    console.error('[groq] 오류:', e.message)
    return { text, keywords: [], count: 0, error: e.message }
  }
}

/**
 * 단어 하나의 기본형 추출 (문맥 없이)
 */
async function getBaseForm(word) {
  const key = 'word:' + word
  if (cache.has(key)) return cache.get(key)
  const client = getGroq()
  if (!client) return [{ form: word, tag: 'Unknown' }]
  try {
    const r = await client.chat.completions.create({
      model: MODEL,
      messages: [{
        role: 'user',
        content: `한국어 단어 "${word}"의 기본형과 품사를 JSON으로만 답해줘.\n{"form":"기본형","tag":"Noun|Verb|Adjective|Adverb"}`
      }],
      max_tokens: 60,
      temperature: 0.1,
    })

    const raw = r.choices[0].message.content.trim()
    const match = raw.match(/\{[\s\S]*?\}/)
    if (!match) throw new Error('No JSON')

    const result = [JSON.parse(match[0])]
    cache.set(key, result)
    return result
  } catch {
    return [{ form: word, tag: 'Unknown' }]
  }
}

module.exports = { extractKeywords, getBaseForm }
