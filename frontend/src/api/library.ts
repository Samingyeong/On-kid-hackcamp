import type { Book } from '../types'

const BASE = 'http://localhost:4000'

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
  await fetch(`${BASE}/api/reading-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

// 읽은 책 목록 조회
export interface ReadHistory {
  title: string; readAt: string; thumbnail: string
  description: string; url: string; isToday: boolean
}
export async function fetchReadingHistory(): Promise<ReadHistory[]> {
  const res = await fetch(`${BASE}/api/reading-history`)
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
  const res = await fetch(`${BASE}/api/books/words?title=${encodeURIComponent(title)}`)
  return res.json()
}

// 단어 학습 완료 표시
export async function markWordLearned(title: string, word: string) {
  await fetch(`${BASE}/api/books/words/learned`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, word }),
  })
}

// 책 문장 목록 조회
export interface BookSentence { sentence: string; learned: number }
export async function fetchBookSentences(title: string): Promise<BookSentence[]> {
  const res = await fetch(`${BASE}/api/books/sentences?title=${encodeURIComponent(title)}`)
  return res.json()
}

// 문장 학습 완료 표시
export async function markSentenceLearned(title: string, sentence: string) {
  await fetch(`${BASE}/api/books/sentences/learned`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
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
  await fetch(`${BASE}/api/words`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function fetchStudyWords(known?: 0 | 1): Promise<StudyWord[]> {
  const q = known !== undefined ? `?known=${known}` : ''
  const res = await fetch(`${BASE}/api/words${q}`)
  return res.json()
}

export async function updateWordKnown(id: number, known: number) {
  await fetch(`${BASE}/api/words/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
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
