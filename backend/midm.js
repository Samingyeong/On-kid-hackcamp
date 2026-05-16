/**
 * KT 믿음 (Mi:dm) AI 연동 모듈
 * OpenAI-compatible API (http://127.0.0.1:8000/v1)
 */
const http = require('http')

const BASE_URL = process.env.MIDM_BASE_URL || 'http://127.0.0.1:8000/v1'
const MODEL    = process.env.MIDM_MODEL    || 'midm-mini'
const API_KEY  = process.env.MIDM_API_KEY  || ''

// 결과 캐시
const cache = new Map()

/**
 * Mi:dm chat completion 호출
 */
function chatCompletion(messages, { maxTokens = 1024, temperature = 0.7 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/chat/completions`)
    const body = JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    })

    const options = {
      hostname: url.hostname,
      port: url.port || 8000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = http.request(options, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          if (data.error) return reject(new Error(data.error.message || 'Mi:dm API error'))
          const content = data.choices?.[0]?.message?.content || ''
          resolve(content)
        } catch (e) {
          reject(new Error('Mi:dm response parse error'))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Mi:dm timeout')) })
    req.write(body)
    req.end()
  })
}

// ─── 1. 학습 수준 진단 + 맞춤 추천 ──────────────────────────
async function getLearningFeedback(userData) {
  const { unknownWords = [], accuracy = 0, booksRead = [] } = userData
  const cacheKey = `feedback:${JSON.stringify(userData)}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const messages = [
    {
      role: 'system',
      content: `당신은 어린이 한국어 학습 전문가입니다. 아이의 학습 데이터를 분석하고 수준을 진단한 뒤, 다음 학습 방향을 추천합니다.
응답 형식 (JSON):
{
  "level": "초급/중급/고급",
  "analysis": "아이의 현재 수준 분석 (2-3문장)",
  "strengths": ["잘하는 점"],
  "improvements": ["개선할 점"],
  "recommendation": "다음 추천 동화 또는 학습 활동",
  "encouragement": "아이에게 전할 칭찬 한마디"
}`
    },
    {
      role: 'user',
      content: `아이의 학습 데이터:
- 모르는 단어 목록: ${unknownWords.slice(0, 20).join(', ') || '없음'}
- 따라쓰기 정답률: ${accuracy}%
- 읽은 책: ${booksRead.slice(0, 10).join(', ') || '없음'}

이 아이의 한국어 수준을 진단하고 다음 학습을 추천해주세요.`
    }
  ]

  const result = await chatCompletion(messages, { maxTokens: 512, temperature: 0.6 })
  try {
    const parsed = JSON.parse(result)
    cache.set(cacheKey, parsed)
    return parsed
  } catch {
    const fallback = { level: '분석중', analysis: result, strengths: [], improvements: [], recommendation: '', encouragement: '' }
    cache.set(cacheKey, fallback)
    return fallback
  }
}

// ─── 2. 동화 요약 + 퀴즈 생성 ────────────────────────────────
async function generateQuiz(subtitleText, bookTitle) {
  const cacheKey = `quiz:${bookTitle}:${subtitleText.slice(0, 50)}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const messages = [
    {
      role: 'system',
      content: `당신은 어린이 동화 교육 전문가입니다. 동화 내용을 아이 눈높이에 맞게 요약하고 퀴즈를 만듭니다.
응답 형식 (JSON):
{
  "summary": ["요약 문장1", "요약 문장2", "요약 문장3"],
  "quiz": [
    { "type": "ox", "question": "질문", "answer": true },
    { "type": "blank", "question": "___에 들어갈 말은?", "answer": "정답", "sentence": "원문 문장" }
  ]
}`
    },
    {
      role: 'user',
      content: `동화 제목: ${bookTitle}\n\n자막 내용:\n${subtitleText.slice(0, 2000)}\n\n5세~8세 아이가 이해할 수 있게 3줄 요약과 퀴즈 2~3개를 만들어주세요.`
    }
  ]

  const result = await chatCompletion(messages, { maxTokens: 768, temperature: 0.7 })
  try {
    const parsed = JSON.parse(result)
    cache.set(cacheKey, parsed)
    return parsed
  } catch {
    return { summary: [result], quiz: [] }
  }
}

// ─── 3. 단어 설명 (아이 눈높이) ──────────────────────────────
async function explainWord(word, definition) {
  const cacheKey = `explain:${word}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const messages = [
    {
      role: 'system',
      content: '당신은 5세 아이에게 단어를 설명하는 선생님입니다. 쉽고 재미있게, 예시를 들어 설명합니다. 2문장 이내로 답하세요.'
    },
    {
      role: 'user',
      content: `"${word}"의 사전 뜻: ${definition}\n\n5세 아이가 이해할 수 있게 쉽게 설명해줘.`
    }
  ]

  const result = await chatCompletion(messages, { maxTokens: 128, temperature: 0.8 })
  cache.set(cacheKey, result)
  return result
}

// ─── 4. 학부모 주간 리포트 ────────────────────────────────────
async function generateWeeklyReport(weekData) {
  const { booksRead = [], newWords = 0, accuracy = 0, studyDays = 0 } = weekData
  const cacheKey = `report:${JSON.stringify(weekData)}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const messages = [
    {
      role: 'system',
      content: `당신은 어린이 한국어 학습 리포트를 작성하는 AI입니다. 학부모에게 따뜻하고 격려하는 톤으로 주간 학습 결과를 알려줍니다.
응답 형식 (JSON):
{
  "summary": "이번 주 학습 요약 (2-3문장)",
  "stats": { "booksRead": 0, "newWords": 0, "accuracy": 0, "studyDays": 0 },
  "praise": "칭찬 포인트",
  "suggestion": "다음 주 개선 제안"
}`
    },
    {
      role: 'user',
      content: `이번 주 학습 데이터:
- 읽은 책: ${booksRead.join(', ') || '없음'} (${booksRead.length}권)
- 새로 배운 단어: ${newWords}개
- 따라쓰기 정답률: ${accuracy}%
- 학습 일수: ${studyDays}일

주간 리포트를 작성해주세요.`
    }
  ]

  const result = await chatCompletion(messages, { maxTokens: 512, temperature: 0.7 })
  try {
    const parsed = JSON.parse(result)
    cache.set(cacheKey, parsed)
    return parsed
  } catch {
    return { summary: result, stats: weekData, praise: '', suggestion: '' }
  }
}

module.exports = {
  chatCompletion,
  getLearningFeedback,
  generateQuiz,
  explainWord,
  generateWeeklyReport,
}
