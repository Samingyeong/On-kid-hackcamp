export interface Book {
  title: string
  description: string
  thumbnail: string
  nlcyThumb?: string
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
  storyType?: 'korean' | 'foreign' | 'creative' | 'kpicture'
  color: string
  spine: string
  bottom: string
}
