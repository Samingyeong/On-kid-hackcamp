/**
 * KT 믿음 (Mi:dm) AI API 클라이언트
 * 아키텍처: [고정 시스템 프롬프트] + [상태 JSON]
 * 프론트에서 childProfile을 함께 전송
 */
import { supabase } from '../lib/supabase'

const BASE = 'http://localhost:4000'

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || ''
}

// ─── 타입 정의 ────────────────────────────────────────────────
export interface ChildProfile {
  name: string
  birth_date: string
  disability: string
}

// Mi:dm 통합 응답 형식
export interface MidmResponse {
  message_to_child: string
  system_analysis: string
  recommended_level: string
  recommended_content: string[]
  next_action: string
}

// ─── API 호출 ─────────────────────────────────────────────────

/** 학습 수준 진단 + 맞춤 추천 (DAILY_FEEDBACK) */
export async function fetchLearningFeedback(childProfile: ChildProfile, accuracy = 0): Promise<MidmResponse> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/midm/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify({ accuracy, childProfile }),
  })
  return res.json()
}

/** 동화 요약 + 퀴즈 생성 (BOOK_QUIZ) */
export async function fetchQuiz(childProfile: ChildProfile, bookTitle: string, subtitleText: string): Promise<MidmResponse> {
  const res = await fetch(`${BASE}/api/midm/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookTitle, subtitleText, childProfile }),
  })
  return res.json()
}

/** 단어 설명 (EXPLAIN_WORD) */
export async function fetchWordExplanation(childProfile: ChildProfile, word: string, definition = ''): Promise<MidmResponse> {
  const res = await fetch(`${BASE}/api/midm/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, definition, childProfile }),
  })
  return res.json()
}

/** 학부모 주간 리포트 (WEEKLY_REPORT) */
export async function fetchWeeklyReport(childProfile: ChildProfile, accuracy = 0): Promise<MidmResponse> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/midm/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify({ accuracy, childProfile }),
  })
  return res.json()
}

/** 튜토리얼 범용 호출 (INTRO / ASK_GENRE / WORD_TEST 등) */
export async function fetchTutorialStep(
  childProfile: ChildProfile,
  step: string,
  context: Record<string, unknown> = {}
): Promise<MidmResponse> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/midm/tutorial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify({ step, context, childProfile }),
  })
  return res.json()
}
