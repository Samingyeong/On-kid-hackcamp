import type { Book } from '../types'
import { getProxiedThumb } from '../api/library'
import './BookCard.css'

interface Props {
  book: Book
  onClick: () => void
}

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  '한국전래동화':  { label: '한국전래', color: '#8BBE71' },
  '창작동화':      { label: '창작동화', color: '#7191E7' },
  'K-그림책':      { label: 'K-그림책', color: '#A4EAEA' },
}

function getBadge(book: Book) {
  if (book.storyType === 'foreign') return { label: '외국전래', color: '#EEB654' }
  if (book.storyType === 'korean')  return { label: '한국전래', color: '#8BBE71' }
  if (book.storyType === 'kpicture') return { label: 'K-그림책', color: '#A4EAEA' }
  return { label: '창작동화', color: '#7191E7' }
}

export default function BookCard({ book, onClick }: Props) {
  const badge = getBadge(book)
  return (
    <div className="book-card" onClick={onClick}>
      <div className="book-card-cover">
        {book.thumbnail
          ? <img
              src={getProxiedThumb(book.thumbnail)}
              alt={book.title}
              loading="lazy"
              decoding="async"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          : <span>📖</span>
        }
        <span className="book-card-badge" style={{ color: badge.color }}>{badge.label}</span>
      </div>
      <div className="book-card-info">
        <p className="book-card-title">{book.title}</p>
        <p className="book-card-author">{book.creator || '국립어린이청소년도서관'}</p>
        {book.regDate && <p className="book-card-date">{book.regDate}</p>}
      </div>
    </div>
  )
}
