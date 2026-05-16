import type { CategoryInfo } from '../types'

export const CATEGORIES: CategoryInfo[] = [
  {
    id: 'all',
    label: '전체',
    keyword: '',
    source: 'all',
    storyType: undefined,
    color: '#6370B4',
    spine: '#3A4787',
    bottom: '#3B4786',
  },
  {
    id: 'new',
    label: 'New',
    keyword: '',
    source: 'multilang',
    storyType: undefined,
    color: '#F16F6F',
    spine: '#CE5656',
    bottom: '#AB4444',
  },
  {
    id: 'korean',
    label: '한국전래동화',
    keyword: '',
    source: 'multilang',
    storyType: 'korean',   // collectionDb에 '한국전래동화' 포함된 것만
    color: '#8BBE71',
    spine: '#6F922D',
    bottom: '#516C1E',
  },
  {
    id: 'foreign',
    label: '외국전래동화',
    keyword: '',
    source: 'multilang',
    storyType: 'foreign',  // collectionDb에 '외국전래동화' 포함된 것만
    color: '#EEB654',
    spine: '#D6853E',
    bottom: '#BA6418',
  },
  {
    id: 'creative',
    label: '창작동화',
    keyword: '',
    source: 'multilang',
    storyType: 'creative', // collectionDb에 '창작동화' 포함된 것만
    color: '#7191E7',
    spine: '#4868BD',
    bottom: '#29458F',
  },
  {
    id: 'kpicture',
    label: 'K-그림책',
    keyword: '',
    source: 'kpicture',
    storyType: 'kpicture',
    color: '#A4EAEA',
    spine: '#7BBEBE',
    bottom: '#4D8888',
  },
]
