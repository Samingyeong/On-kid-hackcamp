import type { Book } from '../types'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export interface FetchBooksResult {
  items: Book[]
  total: number
}

export interface BookYear {
  year: string
  cnt: number
}

function toBook(row: Record<string, string>): Book {
  const displayThumb = row.local_img
    ? `${BASE}${row.local_img}`
    : row.thumbnail
      ? `${BASE}/proxy?url=${encodeURIComponent(row.thumbnail)}`
      : ''

  return {
    title: row.title,
    description: row.description,
    thumbnail: displayThumb,
    nlcyThumb: row.thumbnail,
    url: row.url,
    creator: row.creator,
    regDate: row.reg_date,
    language: row.language || '',
    collectionDb: row.collection || '',
    storyType: row.story_type as Book['storyType'],
    source: row.source as Book['source'],
  }
}

export async function fetchBooks(
  keyword: string,
  source: string,
  storyType: string | undefined,
  page: number,
  limit: number,
  year?: string
): Promise<FetchBooksResult> {
  const params = new URLSearchParams()
  if (keyword) params.set('q', keyword)
  if (storyType) params.set('type', storyType)
  params.set('page', String(page))
  params.set('limit', String(limit))
  if (year) params.set('year', year)

  const res = await fetch(`${BASE}/api/books?${params}`)
  if (!res.ok) return { items: [], total: 0 }

  const data = await res.json()
  return {
    total: data.total ?? 0,
    items: (data.items ?? []).map((r: Record<string, string>) => toBook(r)),
  }
}

export async function fetchBookForReader(title: string): Promise<Book | null> {
  const params = new URLSearchParams({ title })
  const res = await fetch(`${BASE}/api/books/reader?${params}`)
  if (!res.ok) return null

  const row = await res.json()
  return toBook(row)
}

export async function fetchBookYears(): Promise<BookYear[]> {
  const res = await fetch(`${BASE}/api/books/years`)
  if (!res.ok) return []
  return res.json()
}

export async function fetchNewBooks(limit: number): Promise<FetchBooksResult> {
  const res = await fetch(`${BASE}/api/books/new?limit=${limit}`)
  if (!res.ok) return { items: [], total: 0 }

  const data = await res.json()
  return {
    total: data.items?.length ?? 0,
    items: (data.items ?? []).map((r: Record<string, string>) => toBook(r)),
  }
}
