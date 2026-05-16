import type { Book } from '../types'
import { supabase } from '../lib/supabase'

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

// 현재 로그인된 유저 ID를 가져오는 헬퍼
export async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user?.id) return session.user.id
  // 세션 만료 시 refresh 시도
  const { data } = await supabase.auth.refreshSession()
  return data.session?.user?.id || ''
}

// ─── 백엔드 응답 → Book 타입 변환 ────────────────────────────
function toBook(row: Record<string, string>): Book {
  // thumbnail: 원본 nlcy URL (DB에 항상 저장됨)
  // local_img: 로컬 캐시 경로 (있으면 이미지 표시에 사용)
  const displayThumb = row.local_img
    ? `http://localhost:4000${row.local_img}`
    : row.thumbnail ? `/proxy?url=${encodeURIComponent(row.thumbnail)}` : ''

  return {
    title:       row.title       || '',
    description: row.description || '',
    thumbnail:   displayThumb,
    url:         row.url         || '',
    creator:     row.creator     || '',
    regDate:     row.reg_date    || '',
    language:    '',
    collectionDb: row.collection || '',
    storyType:   (row.story_type as Book['storyType']) || 'creative',
    source:      (row.source     as Book['source'])    || 'multilang',
    // 원본 nlcy URL 보존 (영상/VTT 경로 계산용)
    nlcyThumb:   row.thumbnail   || '',
  }
}

// ─── 공개 API ────────────────────────────────────────────────
export async function fetchBookForReader(title: string): Promise<{
  title: string; description: string; thumbnail: string
  nlcyThumb: string; url: string; creator: string; storyType: string
}> {
  const res  = await fetch(`${BASE}/api/books/reader?title=${encodeURIComponent(title)}`)
  if (!res.ok) throw new Error('not found')
  return res.json()
}

// 읽은 기록 저장
export async function saveReadingHistory(title: string) {
  const uid = await getUserId()
  await fetch(`${BASE}/api/reading-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify({ title }),
  })
}

// 읽은 책 목록 조회
export interface ReadHistory {
  title: string; readAt: string; thumbnail: string
  description: string; url: string; isToday: boolean
}
export async function fetchReadingHistory(): Promise<ReadHistory[]> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/reading-history`, { headers: { 'x-user-id': uid } })
  return res.json()
}

// 따라쓰기 채점 (Google Vision OCR)
export async function checkWriting(imageBase64: string, targetWord: string): Promise<{
  recognized: string; targetWord: string; correct: boolean
}> {
  const res = await fetch(`${BASE}/api/writing/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, targetWord }),
  })
  return res.json()
}

// 책에서 추출된 단어 목록 (learned 포함)
export interface BookWord { word: string; learned: number }
export async function fetchBookWords(title: string): Promise<BookWord[]> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/books/words?title=${encodeURIComponent(title)}`, { headers: { 'x-user-id': uid } })
  return res.json()
}

// 단어 학습 완료 표시
export async function markWordLearned(title: string, word: string) {
  const uid = await getUserId()
  await fetch(`${BASE}/api/books/words/learned`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify({ title, word }),
  })
}

// 책 문장 목록 조회
export interface BookSentence { sentence: string; learned: number }
export async function fetchBookSentences(title: string): Promise<BookSentence[]> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/books/sentences?title=${encodeURIComponent(title)}`, { headers: { 'x-user-id': uid } })
  return res.json()
}

// 문장 학습 완료 표시
export async function markSentenceLearned(title: string, sentence: string) {
  const uid = await getUserId()
  await fetch(`${BASE}/api/books/sentences/learned`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify({ title, sentence }),
  })
}

export async function fetchBooks(
  keyword: string,
  _source: 'multilang' | 'kpicture' | 'all' = 'all',
  storyTypeFilter?: Book['storyType'],
  page = 1,
  limit = 20,
  year?: string
): Promise<{ items: Book[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (keyword)         params.set('q',    keyword)
  if (storyTypeFilter) params.set('type', storyTypeFilter)
  if (year)            params.set('year', year)

  const res  = await fetch(`${BASE}/api/books?${params}`)
  const data = await res.json()
  return {
    total: data.total,
    items: (data.items as Record<string, string>[]).map(toBook),
  }
}

export async function fetchBookYears(): Promise<{ year: string; cnt: number }[]> {
  const res = await fetch(`${BASE}/api/books/years`)
  return res.json()
}

export async function fetchNewBooks(limit = 20): Promise<Book[]> {
  const res  = await fetch(`${BASE}/api/books/new?limit=${limit}`)
  const data = await res.json()
  return (data.items as Record<string, string>[]).map(toBook)
}

// ─── URL 헬퍼 ─────────────────────────────────────────────────
export function proxy(url: string) {
  if (!url) return ''
  // 이미 로컬 URL이면 그대로
  if (url.startsWith('http://localhost') || url.startsWith('/')) return url
  return `/proxy?url=${encodeURIComponent(url)}`
}
export function getProxiedThumb(thumbnail: string) { return thumbnail }

export function getVideoUrl(thumbnail: string, lang = 'ko') {
  if (!thumbnail) return ''
  // nlcy 원본 URL이면 직접 접근 (브라우저는 nlcy에 접근 가능)
  if (thumbnail.startsWith('https://www.nlcy.go.kr/')) {
    return thumbnail.replace('.png', `_${lang}.mp4`)
  }
  return ''
}

export function getVttUrl(thumbnail: string, lang = 'ko') {
  if (!thumbnail) return ''
  if (thumbnail.startsWith('https://www.nlcy.go.kr/')) {
    return `http://localhost:4000/proxy?url=${encodeURIComponent(thumbnail.replace('.png', `_${lang}.vtt`))}`
  }
  return ''
}

// ─── 단어 학습 ───────────────────────────────────────────────
export interface StudyWord {
  id: number; word: string; base_form: string; pos: string
  definition: string; known: number; from_book: string; created_at: string
}

export async function saveWord(data: {
  word: string; base_form: string; pos?: string
  definition?: string; known: number; from_book?: string
}) {
  const uid = await getUserId()
  await fetch(`${BASE}/api/words`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify(data),
  })
}

export async function fetchStudyWords(known?: 0 | 1): Promise<StudyWord[]> {
  const uid = await getUserId()
  const q = known !== undefined ? `?known=${known}` : ''
  const res = await fetch(`${BASE}/api/words${q}`, { headers: { 'x-user-id': uid } })
  return res.json()
}

export async function updateWordKnown(id: number, known: number) {
  const uid = await getUserId()
  await fetch(`${BASE}/api/words/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify({ known }),
  })
}
export interface MorphToken { form: string; tag: string }
export interface MorphResult { text: string; keywords: (MorphToken & { start: number; len: number })[]; count: number }

export async function analyzeWord(word: string): Promise<MorphToken[]> {
  const res = await fetch(`${BASE}/api/morpheme?mode=word&q=${encodeURIComponent(word)}`)
  return res.json()
}

export async function analyzeSentence(text: string): Promise<MorphResult> {
  const res = await fetch(`${BASE}/api/morpheme?mode=sentence&q=${encodeURIComponent(text)}`)
  return res.json()
}

// 자막 전체 일괄 분석 (책 열 때 한번에 처리 → 단어 클릭 시 즉시 반환)
export async function analyzeBatch(sentences: string[]): Promise<Map<string, MorphResult>> {
  const res = await fetch(`${BASE}/api/morpheme/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentences }),
  })
  const data: (MorphResult & { sentence: string })[] = await res.json()
  const map = new Map<string, MorphResult>()
  for (const item of data) {
    map.set(item.sentence, item)
  }
  return map
}

// ─── 수어 따라하기 평가 ───────────────────────────────────────
export interface SignMotionSegment {
  id: number
  source_id: number
  source_title: string
  lemma: string
  surface: string
  pos: string
  start_sec: number
  end_sec: number
  duration_sec: number
  clip_path: string
  keypoints_path: string
  avatar_path: string
  clip_url: string
  keypoints_url: string
  avatar_url: string
  lexicon_id?: number
  sign_description?: string
  sign_images?: string
  sign_images_urls?: string[]
  confidence: number
  review_status: string
  notes: string
}

function withBackendBase(url: string) {
  if (!url || (!url.startsWith('/sign-motion/') && !url.startsWith('/sign-motion-keypoints/'))) return url
  return `${BASE}${url}`
}

function normalizeSignSegment(segment: SignMotionSegment | null): SignMotionSegment | null {
  if (!segment) return null
  return {
    ...segment,
    clip_url: withBackendBase(segment.clip_url),
    keypoints_url: withBackendBase(segment.keypoints_url),
    avatar_url: withBackendBase(segment.avatar_url),
  }
}

export async function fetchSignMotions(lemma: string, pos = ''): Promise<SignMotionSegment[]> {
  const params = new URLSearchParams({ lemma })
  if (pos) params.set('pos', pos)
  const res = await fetch(`${BASE}/api/sign-motions?${params}`)
  if (!res.ok) return []
  const data = await res.json() as { items?: SignMotionSegment[] }
  return (data.items || [])
    .map(item => normalizeSignSegment(item))
    .filter((item): item is SignMotionSegment => Boolean(item))
}

export interface SignPracticeFrame {
  time_ms: number
  width: number
  height: number
  pose: Array<{ x: number; y: number; z: number; visibility?: number }>
  hands: Array<{
    handedness?: string
    handedness_score?: number
    landmarks: Array<{ x: number; y: number; z: number }>
  }>
}

export interface SignPracticeEvaluation {
  correct: boolean
  status: 'correct' | 'retry'
  score: number
  scores: {
    overall: number
    handShape: number
    handPosition: number
    direction: number
  }
  feedback: string[]
  method: string
  frames: { user: number; reference: number }
}

export interface SignPracticeWord {
  word: string
  base_form: string
  segment_count: number
  segment: SignMotionSegment
}

export async function fetchSignPracticeWords(): Promise<SignPracticeWord[]> {
  const res = await fetch(`${BASE}/api/sign-practice/words`)
  if (!res.ok) return []
  const data = await res.json() as { items?: Array<Omit<SignPracticeWord, 'segment'> & { segment: SignMotionSegment | null }> }
  return (data.items || [])
    .map(item => ({
      ...item,
      segment: normalizeSignSegment(item.segment),
    }))
    .filter((item): item is SignPracticeWord => Boolean(item.segment?.keypoints_url))
}

export async function evaluateSignPractice(
  segmentId: number,
  userSequence: SignPracticeFrame[],
): Promise<SignPracticeEvaluation> {
  const res = await fetch(`${BASE}/api/sign-practice/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segmentId, userSequence }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '수어 평가 실패')
  }
  return res.json()
}

// ─── 오디오 기반 동화 학습 ───────────────────────────────────
export type VoiceIntent =
  | 'START'
  | 'START_QUIZ'
  | 'ANSWER_QUIZ'
  | 'REPEAT'
  | 'HINT'
  | 'TODAY_RESULT'
  | 'NEXT'
  | 'PREVIOUS'
  | 'STOP'
  | 'CHANGE_BOOK'
  | 'LEVEL_DOWN'
  | 'LEVEL_UP'
  | 'EXPLAIN_WORD'
  | 'UNKNOWN'

export interface VoiceDialogResult {
  intent: VoiceIntent
  confidence: number
  slots: {
    answerText?: string
    targetWord?: string
    requestedSpeed?: 'normal' | 'slow'
  }
  requiresConfirmation: boolean
  spokenResponse: string
  nextAction: {
    tool: string
    args: Record<string, unknown>
  }
  source?: string
}

export async function startVoiceSession(bookTitle: string): Promise<{
  sessionId: number
  accessibilityProfile: Record<string, string>
}> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/voice/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify({ bookTitle }),
  })
  return res.json()
}

export async function routeVoiceDialog(data: {
  text: string
  sessionId?: number | null
  state?: string
  allowedIntents?: VoiceIntent[]
  childProfile?: Record<string, unknown>
  context?: Record<string, unknown>
}): Promise<VoiceDialogResult> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/voice/dialog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function fetchVoiceServiceHealth(): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/api/voice/service/health`)
  return res.json()
}

export async function transcribeVoiceAudio(data: {
  audioBase64: string
  mimeType?: string
  language?: string
  prompt?: string
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/api/voice/stt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function synthesizeVoiceText(data: {
  text: string
  voice?: string
  rate?: number
  lang?: string
  format?: string
  totalSteps?: number
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/api/voice/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export interface VoiceQuizEvaluation {
  questionId: string
  sttText: string
  expectedAnswers: string[]
  matchType: 'exact_match' | 'partial_match' | 'no_match' | 'insufficient_data'
  score: number
  isCorrect: boolean
  needsRetry: boolean
  feedbackHint: string
  attemptId?: number
  progress?: VoiceProgressSummary
}

export interface VoiceProgressSummary {
  userId: string
  bookTitle: string
  sessionCount: number
  turnCount: number
  totalQuiz: number
  correctQuiz: number
  quizAccuracy: number
  recommendedLevel: 'beginner' | 'intermediate' | 'advanced'
  skillVector: {
    listeningComprehension: number
    vocabulary: number
    shortTermRecall: number
    commandFollowing: number
    helpRequestRate: number
    recommendedDifficulty: number
  }
  spokenSummary: string
  lastSessionAt: string
}

export interface VoiceBookRecommendation {
  title: string
  level: string
  reason: string
  rank: number
  thumbnail: string
  description: string
  storyType: string
}

export interface VoiceBookRecommendationResponse {
  progress: VoiceProgressSummary
  items: VoiceBookRecommendation[]
}

export interface ParentSummary {
  childProfile: Record<string, string>
  reading: {
    totalBooks: number
    recentBooks: Array<{ title: string; lastReadAt: string; readCount: number }>
    trend: Array<{ date: string; count: number }>
  }
  words: {
    total: number
    known: number
    unknown: number
  }
  voice: VoiceProgressSummary & {
    averageScore: number
    retryCount: number
    updatedAt: string
    recentSessions: Array<{ id: number; bookTitle: string; startedAt: string; endedAt: string }>
  }
  recommendations: Array<{ title: string; reason: string; rank: number; createdAt: string }>
  summary: {
    message_to_child?: string
    message_to_parent?: string
    system_analysis?: string
    observations?: string[]
    next_actions?: string[]
  }
  summarySource: 'midm' | 'rules'
}

export async function evaluateVoiceQuiz(data: {
  questionId: string
  sttText: string
  expectedAnswers: string[]
  sessionId?: number | null
}): Promise<VoiceQuizEvaluation> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/voice/quiz/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': uid },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function fetchVoiceProgress(bookTitle: string): Promise<VoiceProgressSummary> {
  const uid = await getUserId()
  const params = new URLSearchParams()
  if (bookTitle) params.set('bookTitle', bookTitle)
  const res = await fetch(`${BASE}/api/voice/progress?${params}`, { headers: { 'x-user-id': uid } })
  return res.json()
}

export async function fetchVoiceBookRecommendations(bookTitle: string, limit = 3): Promise<VoiceBookRecommendationResponse> {
  const uid = await getUserId()
  const params = new URLSearchParams({ limit: String(limit) })
  if (bookTitle) params.set('bookTitle', bookTitle)
  const res = await fetch(`${BASE}/api/voice/recommend/books?${params}`, { headers: { 'x-user-id': uid } })
  return res.json()
}

export async function fetchParentSummary(): Promise<ParentSummary> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/parent/summary`, { headers: { 'x-user-id': uid } })
  return res.json()
}

// ─── 한국어사전 ───────────────────────────────────────────────
export interface DictItem { word: string; pos: string; grade: string; definitions: string[] }

export function extractBase(word: string): string {
  const josa = ['을','를','이','가','은','는','도','의','에서','에게','한테','에','로','으로','와','과','랑','이랑','하고','부터','까지','만','조차','마저']
  for (const j of [...josa].sort((a, b) => b.length - a.length))
    if (word.endsWith(j) && word.length > j.length + 1) return word.slice(0, -j.length)
  const endings = ['았어요','었어요','겠어요','았습니다','었습니다','아요','어요','아서','어서','았다','었다','겠다','는다','고','며','면','지만','는데','은데','아','어','게','니','자','습니다','ㅂ니다','하는','해서','해도','했다','했어','하고']
  for (const e of [...endings].sort((a, b) => b.length - a.length))
    if (word.endsWith(e) && word.length > e.length + 1) return word.slice(0, -e.length) + '다'
  return word
}

const dictCache = new Map<string, DictItem[]>()

export function clearDictCache() {
  dictCache.clear()
}
export async function lookupDict(word: string): Promise<DictItem[]> {
  const base = extractBase(word)
  for (const q of [...new Set([base, word])]) {
    if (dictCache.has(q)) return dictCache.get(q)!
    try {
      const res   = await fetch(`${BASE}/dict?q=${encodeURIComponent(q)}`)
      const items: DictItem[] = await res.json()
      if (items.length) { dictCache.set(q, items); return items }
    } catch {}
  }
  return []
}

// ─── 책 난이도 기반 추천 ──────────────────────────────────────
export interface RecommendedBook {
  title: string
  level: string
  totalWords: number
  thumbnail: string
  description: string
  storyType: string
}

export async function fetchRecommendedBooks(level: 'beginner' | 'intermediate' | 'advanced', limit = 4): Promise<RecommendedBook[]> {
  const res = await fetch(`${BASE}/api/books/recommend?level=${level}&limit=${limit}`)
  return res.json()
}

export async function analyzeBookDifficulty(title: string, words: string[]): Promise<{
  title: string; level: string; total_words: number; beginner: number; intermediate: number; advanced: number
}> {
  const res = await fetch(`${BASE}/api/books/analyze-difficulty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, words }),
  })
  return res.json()
}

// ─── 튜토리얼 퀴즈 데이터 ────────────────────────────────────
export interface TutorQuizData {
  hasData: boolean
  wordTest: { word: string; hint: string; book: string }[]
  sentenceQuiz: { word: string; definition: string; sentence: string; book: string }[]
}

export async function fetchTutorQuizData(): Promise<TutorQuizData> {
  const uid = await getUserId()
  const res = await fetch(`${BASE}/api/tutor/quiz-data`, { headers: { 'x-user-id': uid } })
  return res.json()
}

// ─── 문장학습 데이터 ──────────────────────────────────────────
export interface StudySentenceData {
  sentences: { sentence: string; keyword: string }[]
  words: string[]
}

export async function fetchStudySentences(book?: string): Promise<StudySentenceData> {
  const uid = await getUserId()
  const q = book ? `?book=${encodeURIComponent(book)}` : ''
  const res = await fetch(`${BASE}/api/study/sentences${q}`, { headers: { 'x-user-id': uid } })
  return res.json()
}
