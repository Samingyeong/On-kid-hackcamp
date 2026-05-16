export interface Book {
  title: string
  description: string
  thumbnail: string      // 표시용 (로컬 or 프록시)
  nlcyThumb?: string     // 원본 nlcy URL (영상/VTT 경로 계산용)
  url: string
  creator: string
  regDate: string
  language: string
  collectionDb: string
  storyType: 'korean' | 'foreign' | 'creative' | 'kpicture'
  source: 'multilang' | 'kpicture'
}

export type CategoryId = 'all' | 'korean' | 'foreign' | 'creative' | 'kpicture' | 'new'

export interface CategoryInfo {
  id: CategoryId
  label: string
  keyword: string
  source: 'multilang' | 'kpicture' | 'all'
  storyType?: 'korean' | 'foreign' | 'creative' | 'kpicture' // undefined = 필터 없음
  color: string
  spine: string
  bottom: string
}

// VTT 자막 큐
export interface Cue {
  start: number
  end: number
  text: string
}
