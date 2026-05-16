/**
 * KT 믿음 (Mi:dm) AI 연동 모듈
 * 아키텍처: [고정 시스템 프롬프트] + [현재 상태 데이터(JSON)]
 * 
 * - 프롬프트 = AI 성격과 규칙 (거의 안 바뀜)
 * - 입력 JSON = 현재 상황 (step + child_profile + context)
 * - 판단 = 백엔드, 말하기 = AI
 */
const http = require('http')

const BASE_URL = process.env.MIDM_BASE_URL || 'http://127.0.0.1:8000/v1'
const MODEL    = process.env.MIDM_MODEL    || 'midm-mini'
const API_KEY  = process.env.MIDM_API_KEY  || ''

// 결과 캐시
const cache = new Map()

// ─── 통합 시스템 프롬프트 (고정) ──────────────────────────────
const SYSTEM_PROMPT = `너는 5세~10세 아동을 위한 AI 멀티모달 동화 학습 튜터다.

서비스 목표:
- 아이가 즐겁고 부담 없이 학습하도록 돕는다.
- 아이의 나이, 문해력, 장애 유형에 맞게 대화 수준을 조절한다.
- 튜토리얼 과정에서 아이의 선호 장르와 학습 수준을 파악한다.
- 테스트 결과를 기반으로 초급/중급/고급 동화를 추천한다.
- 아이에게는 따뜻하고 긍정적으로 말한다.
- 시스템 내부 분석은 JSON 필드에만 작성한다.

중요 규칙:
- 절대 아이에게 "틀렸다", "못한다", "수준이 낮다"라고 말하지 않는다.
- 항상 긍정적인 표현을 사용한다.
- 문장은 짧고 쉬워야 한다.
- 한 번에 하나의 질문만 한다.
- 장애 유형에 맞게 표현 방식을 조절한다.

나이별 대화 규칙:

[5~6세]
- 매우 짧고 쉬운 문장 사용
- 귀엽고 친근한 말투 사용
- 한 문장 최대 15자~20자 정도

[7~8세]
- 친근하지만 너무 유아적이지 않게
- 짧은 설명 가능
- 간단한 이유 설명 가능

[9~10세]
- 존중하는 느낌 유지
- 너무 아기처럼 말하지 않기
- 간단한 사고 유도 가능

장애 유형별 규칙:

[청각장애]
- "잘 들어봐" 같은 표현 금지
- 자막, 그림, 읽기 중심 표현 사용

[시각장애]
- "여기 그림을 봐" 같은 표현 금지
- 소리, 설명, 상황 묘사 중심 표현 사용

[문해력 낮음]
- 어려운 단어 금지
- 짧고 반복적인 표현 사용
- 긴 설명 금지

[일반]
- 기본 학습 튜터 말투 사용

현재 단계(step)에 따라 행동한다.

가능한 step 종류:
- INTRO
- ASK_GENRE
- WORD_TEST
- QUIZ_TEST
- LEVEL_ANALYSIS
- RECOMMEND_BOOK
- DAILY_FEEDBACK
- EXPLAIN_WORD
- BOOK_QUIZ
- WEEKLY_REPORT

출력 규칙: 반드시 JSON 형식만 출력한다.

출력 형식:
{
  "message_to_child": "",
  "system_analysis": "",
  "recommended_level": "",
  "recommended_content": [],
  "next_action": ""
}

message_to_child:
- 아이에게 직접 보여줄 문장

system_analysis:
- 시스템 내부 판단
- 아이에게 노출 금지

recommended_level:
- 초급 / 중급 / 고급 중 하나 (해당 시 작성)

recommended_content:
- 추천 장르 또는 동화 목록 (해당 시 작성)

next_action:
- 다음 단계 이름`


// ─── 저수준 API 호출 ──────────────────────────────────────────
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

// ─── 통합 호출 함수 ───────────────────────────────────────────
// 모든 기능이 이 하나의 함수를 통해 호출됨
// stateData = { step, child_profile, context }
async function callTutor(stateData) {
  const cacheKey = JSON.stringify(stateData)
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(stateData) },
  ]

  const result = await chatCompletion(messages, { maxTokens: 768, temperature: 0.6 })

  try {
    const parsed = JSON.parse(result)
    cache.set(cacheKey, parsed)
    return parsed
  } catch {
    // JSON 파싱 실패 시 텍스트를 message_to_child에 넣어 반환
    const fallback = {
      message_to_child: result,
      system_analysis: 'JSON 파싱 실패 - 원문 반환',
      recommended_level: '',
      recommended_content: [],
      next_action: '',
    }
    cache.set(cacheKey, fallback)
    return fallback
  }
}

// ─── 편의 함수들 (백엔드 엔드포인트에서 사용) ─────────────────

// 장애 유형 매핑 (DB값 → 프롬프트용)
const SUPPORT_TYPE_MAP = {
  slow: '문해력 낮음',
  study: '일반',
  hearing: '청각장애',
  vision: '시각장애',
}

function mapSupportType(disability) {
  return SUPPORT_TYPE_MAP[disability] || '일반'
}

// 나이 계산 (birth_date → 만 나이)
function calcAge(birthDate) {
  if (!birthDate) return 7 // 기본값
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  if (now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    age--
  }
  return Math.max(5, Math.min(10, age))
}


// ─── 1. 학습 수준 진단 + 맞춤 추천 (DAILY_FEEDBACK) ──────────
async function getLearningFeedback(childProfile, learningData) {
  const stateData = {
    step: 'DAILY_FEEDBACK',
    child_profile: {
      name: childProfile.name || '친구',
      age: calcAge(childProfile.birth_date),
      support_type: mapSupportType(childProfile.disability),
    },
    context: {
      unknown_words: learningData.unknownWords || [],
      writing_accuracy: learningData.accuracy || 0,
      books_read: learningData.booksRead || [],
      total_words_learned: learningData.totalWordsLearned || 0,
    },
  }
  return callTutor(stateData)
}

// ─── 2. 동화 요약 + 퀴즈 생성 (BOOK_QUIZ) ────────────────────
async function generateQuiz(childProfile, bookTitle, subtitleText) {
  const stateData = {
    step: 'BOOK_QUIZ',
    child_profile: {
      name: childProfile.name || '친구',
      age: calcAge(childProfile.birth_date),
      support_type: mapSupportType(childProfile.disability),
    },
    context: {
      book_title: bookTitle,
      subtitle_text: subtitleText.slice(0, 2000),
    },
  }
  return callTutor(stateData)
}

// ─── 3. 단어 설명 (EXPLAIN_WORD) ─────────────────────────────
async function explainWord(childProfile, word, definition) {
  const stateData = {
    step: 'EXPLAIN_WORD',
    child_profile: {
      name: childProfile.name || '친구',
      age: calcAge(childProfile.birth_date),
      support_type: mapSupportType(childProfile.disability),
    },
    context: {
      word,
      dictionary_definition: definition || '',
    },
  }
  return callTutor(stateData)
}

// ─── 4. 학부모 주간 리포트 (WEEKLY_REPORT) ────────────────────
async function generateWeeklyReport(childProfile, weekData) {
  const stateData = {
    step: 'WEEKLY_REPORT',
    child_profile: {
      name: childProfile.name || '친구',
      age: calcAge(childProfile.birth_date),
      support_type: mapSupportType(childProfile.disability),
    },
    context: {
      books_read: weekData.booksRead || [],
      new_words_count: weekData.newWords || 0,
      writing_accuracy: weekData.accuracy || 0,
      study_days: weekData.studyDays || 0,
    },
  }
  return callTutor(stateData)
}

// ─── 5. 튜토리얼 단계 (INTRO / ASK_GENRE / WORD_TEST 등) ─────
async function tutorialStep(childProfile, step, context = {}) {
  const stateData = {
    step,
    child_profile: {
      name: childProfile.name || '친구',
      age: calcAge(childProfile.birth_date),
      support_type: mapSupportType(childProfile.disability),
    },
    context,
  }
  return callTutor(stateData)
}

module.exports = {
  chatCompletion,
  callTutor,
  getLearningFeedback,
  generateQuiz,
  explainWord,
  generateWeeklyReport,
  tutorialStep,
  mapSupportType,
  calcAge,
}
