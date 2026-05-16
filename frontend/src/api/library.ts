import type { Book } from '../types'

export interface FetchBooksResult {
  items: Book[]
  total: number
}

export interface BookYear {
  year: string
  cnt: number
}

export async function fetchBooks(
  _keyword: string,
  _source: string,
  _storyType: string | undefined,
  _page: number,
  _limit: number,
  _year?: string
): Promise<FetchBooksResult> {
  // TODO: 커밋 3에서 구현
  return { items: [], total: 0 }
}

export async function fetchBookForReader(_title: string): Promise<Book | null> {
  // TODO: 커밋 3에서 구현
  return null
}

export async function fetchBookYears(): Promise<BookYear[]> {
  // TODO: 커밋 3에서 구현
  return []
}

export async function fetchNewBooks(_limit: number): Promise<FetchBooksResult> {
  // TODO: 커밋 3에서 구현
  return { items: [], total: 0 }
}
