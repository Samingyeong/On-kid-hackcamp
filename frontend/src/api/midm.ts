/**
 * KT 믿음 (Mi:dm) AI API 클라이언트
 */
import { supabase } from '../lib/supabase'

const BASE = 'http://localhost:4000'

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || ''
}

// ─── 타입 정의 ────────────────────────────────────────────────
export interface LearningFeedback {
  level: string
  analysis: string
  strengths: string[]
  improvements: string[]
  recommendation: string
  encouragement: string
}

export interface QuizItem {
  type: 'ox' | 'blank'
  question: string
  answer: boolean | string
  sentence?: string
}

export interface QuizResult {
  summary: string[]
  quiz: QuizItem[]
}

export interface WeeklyReport {
  summary: string
  stats: { booksRead: number; newWords: number; accuracy: number; studyDays: number }
  praise: string
  suggestion: string
}

// ─── API 호출 ─────────────────────────────────────────────────

/** 학습 수준 진단 + 맞춤 추천 */
export async function fetchLearningFeedback(accuracy = 0): Promise<LearningFeedback> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/midm/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify({ accuracy }),
  })
  return res.json()
}

/** 동화 요약 + 퀴즈 생성 */
export async function fetchQuiz(bookTitle: string, subtitleText: string): Promise<QuizResult> {
  const res = await fetch(`${BASE}/api/midm/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookTitle, subtitleText }),
  })
  return res.json()
}

/** 단어 설명 (아이 눈높이) */
export async function fetchWordExplanation(word: string, definition = ''): Promise<string> {
  const res = await fetch(`${BASE}/api/midm/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, definition }),
  })
  const data = await res.json()
  return data.explanation
}

/** 학부모 주간 리포트 */
export async function fetchWeeklyReport(accuracy = 0): Promise<WeeklyReport> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/midm/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify({ accuracy }),
  })
  return res.json()
}
