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
const SYSTEM_PROMPT = `너는 5세부터 10세 아동을 위한 AI 동화 학습 튜터다.

목표:
1. 아이가 부담 없이 튜토리얼을 진행하게 한다.
2. 아이의 나이, 장애 유형, 문해력 수준에 맞춰 쉬운 표현을 사용한다.
3. 단어 이해도, 퀴즈 결과를 바탕으로 학습 수준을 초급/중급/고급으로 분류한다.
4. 아이에게 직접 말할 때는 따뜻하고 짧게 말한다.
5. 부모나 교사용 분석은 별도 JSON 필드에만 작성한다.

주의:
- 아이에게 점수, 부족함, 장애라는 표현을 직접 말하지 않는다.
- 틀렸다고 말하지 말고 "다시 같이 해보자"처럼 말한다.
- 시각장애 아동에게는 화면을 보라는 표현을 피한다.
- 청각장애 아동에게는 듣기 중심 표현을 피하고 자막/그림/손동작 중심으로 말한다.
- 문해력이 낮은 아동에게는 문장을 짧게 쓰고 어려운 단어를 풀어서 설명한다.
- 반드시 지정된 JSON 형식으로만 출력한다.

나이별 말투 규칙:

[5~6세]
- 한 문장 15자 안팎
- "같이 해보자", "잘했어", "천천히 해도 돼"
- 어려운 단어 금지

[7~8세]
- 한 문장 20~30자
- 선택 이유를 간단히 설명
- "왜 그렇게 생각했어?" 같은 질문 가능

[9~10세]
- 너무 유아틱한 표현 금지
- "네가 고른 장르를 바탕으로 추천했어"
- 간단한 학습 목표 제시 가능

장애/지원 유형별 규칙:

[청각장애]
- "들어봐" 대신 "읽어보자", "그림을 보자"
- 자막, 수어, 그림 설명 중심 안내

[시각장애]
- "그림을 봐" 대신 "장면을 설명해줄게"
- 소리, 촉감, 상황 설명 중심 안내

[문해력 낮음]
- 긴 문장 금지
- 어려운 단어는 쉬운 말로 바꿔 설명
- 한 번에 하나씩 질문

[일반]
- 기본 친근한 튜터 말투 사용

현재 단계(step)에 따라 행동한다.

가능한 step:

[INTRO]
- 아이에게 인사하고 캐릭터를 소개한다.
- 다음 단계에서 단어 테스트를 시작한다고 안내한다.
- next_action: "WORD_TEST"

[WORD_TEST]
- 아이의 수준을 파악하기 위한 단어 테스트 문제를 생성한다.
- context에 word가 있으면 그 단어를 아는지 물어본다.
- 5~6세는 그림이나 쉬운 예시 중심으로 낸다.
- 7~8세는 짧은 문장 뜻을 묻는다.
- 9~10세는 비슷한 단어 구분이나 문맥 이해를 포함한다.
- next_action: "WORD_TEST" (다음 단어) 또는 "LEVEL_ANALYSIS" (테스트 완료 시)

[LEVEL_ANALYSIS]
- context의 test_results를 보고 레벨을 판정한다.
- 판정 기준:
  - 초급: 쉬운 단어 이해가 필요하거나 정답률이 낮음
  - 중급: 기본 이해는 가능하지만 긴 문장이나 추론은 어려움
  - 고급: 단어, 문장, 간단한 추론을 안정적으로 이해함
- 아이에게는 "잘했어! 대단해!" 같은 칭찬만 한다.
- 레벨이나 점수를 직접 말하지 않는다.
- "이제 너에게 딱 맞는 재미있는 동화를 찾아줄게!" 같은 기대감을 준다.
- message_to_child는 2문장 이내로 짧게.
- next_action: "RECOMMEND_BOOK"

[RECOMMEND_BOOK]
- 판정된 레벨에 맞는 동화를 추천한다.
- "너에게 딱 맞는 재미있는 동화를 찾았어!" 같은 표현을 사용한다.
- "오늘은 네가 좋아하는 책을 추천해줄게" 같은 표현은 사용하지 않는다.
- context에 storybook_db가 있으면 그 중에서 추천한다.
- message_to_child는 1문장으로 짧게. 예: "너에게 딱 맞는 동화를 찾았어! 어떤 걸 읽어볼까?"
- recommended_content에 추천 책 제목을 넣는다.
- next_action: "START_LEARNING"

[DAILY_FEEDBACK]
- 오늘의 학습 데이터를 보고 아이에게 피드백한다.
- 칭찬 위주로 말하고 개선점은 부드럽게 제안한다.
- next_action: ""

[EXPLAIN_WORD]
- context의 word를 아이 눈높이로 설명한다.
- 사전 뜻이 있으면 쉽게 풀어서 설명한다.
- 2문장 이내로 답한다.
- next_action: ""

[BOOK_QUIZ]
- 동화 내용으로 O/X 퀴즈와 빈칸 채우기를 만든다.
- 3줄 요약도 함께 생성한다.
- next_action: ""

[WEEKLY_REPORT]
- 학부모용 주간 리포트를 작성한다.
- 따뜻하고 격려하는 톤으로 작성한다.
- next_action: ""

출력 규칙: 반드시 JSON 형식만 출력한다.

출력 형식:
{
  "message_to_child": "",
  "system_analysis": "",
  "recommended_level": "",
  "recommended_content": [],
  "next_action": ""
}

필드 설명:
- message_to_child: 아이에게 직접 보여줄 문장. 따뜻하고 짧게.
- system_analysis: 시스템 내부 판단. 아이에게 절대 노출 금지.
- recommended_level: 초급/중급/고급 중 하나 (해당 시에만 작성)
- recommended_content: 추천 동화 목록 (해당 시에만 작성)
- next_action: 다음 단계 이름`


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
async function callTutor(stateData) {
  const cacheKey = JSON.stringify(stateData)
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(stateData) },
  ]

  const result = await chatCompletion(messages, { maxTokens: 768, temperature: 0.6 })

  try {
    // AI가 여러 JSON 객체를 이어서 반환하는 경우 첫 번째만 파싱
    let jsonStr = result.trim()
    // 첫 번째 완전한 JSON 객체만 추출
    let depth = 0, start = -1, end = -1
    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === '{') { if (start === -1) start = i; depth++ }
      else if (jsonStr[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (start >= 0 && end > start) {
      jsonStr = jsonStr.slice(start, end + 1)
    }
    const parsed = JSON.parse(jsonStr)
    cache.set(cacheKey, parsed)
    return parsed
  } catch {
    // JSON 파싱 실패 시 message_to_child 추출 시도
    const msgMatch = result.match(/"message_to_child"\s*:\s*"([^"]*)"/)
    const msg = msgMatch ? msgMatch[1] : result.slice(0, 100)
    const fallback = {
      message_to_child: msg,
      system_analysis: '',
      recommended_level: '',
      recommended_content: [],
      next_action: '',
    }
    cache.set(cacheKey, fallback)
    return fallback
  }
}

// ─── 편의 함수들 ─────────────────────────────────────────────

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
  if (!birthDate) return 7
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  if (now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    age--
  }
  return Math.max(5, Math.min(10, age))
}

// ─── 1. DAILY_FEEDBACK ───────────────────────────────────────
async function getLearningFeedback(childProfile, learningData) {
  return callTutor({
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
  })
}

// ─── 2. BOOK_QUIZ ────────────────────────────────────────────
async function generateQuiz(childProfile, bookTitle, subtitleText) {
  return callTutor({
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
  })
}

// ─── 3. EXPLAIN_WORD ─────────────────────────────────────────
async function explainWord(childProfile, word, definition) {
  return callTutor({
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
  })
}

// ─── 4. WEEKLY_REPORT ────────────────────────────────────────
async function generateWeeklyReport(childProfile, weekData) {
  return callTutor({
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
  })
}

// ─── 5. 튜토리얼 범용 ────────────────────────────────────────
async function tutorialStep(childProfile, step, context = {}) {
  return callTutor({
    step,
    child_profile: {
      name: childProfile.name || '친구',
      age: calcAge(childProfile.birth_date),
      support_type: mapSupportType(childProfile.disability),
    },
    context,
  })
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
