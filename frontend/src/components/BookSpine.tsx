import type { CategoryInfo } from '../types'
import './BookSpine.css'

interface Props {
  category: CategoryInfo
  onClick: () => void
}

export default function BookSpine({ category, onClick }: Props) {
  return (
    <div className="book-spine-wrap" onClick={onClick}>
      <div className="book-spine" style={{ background: category.color }}>
        {/* 책 등 왼쪽 어두운 부분 */}
        <div className="spine-left" style={{ background: category.spine }} />
        {/* 책 페이지 하단 */}
        <div className="spine-bottom" style={{ background: category.bottom }} />
        {/* 책 페이지 흰 부분 */}
        <div className="spine-pages" />
        {/* 노란 책갈피 */}
        <div className="spine-bookmark" />
      </div>
      <span className="spine-label">{category.label}</span>
    </div>
  )
}
