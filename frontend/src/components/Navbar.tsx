import { Link, useLocation } from 'react-router-dom'
import './Navbar.css'

const NAV_ITEMS = [
  { label: '동화학습', path: '/books' },
  { label: '내 오답노트', path: '/notes' },
  { label: '학부모케어', path: '/parent' },
]

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* 로고 */}
        <Link to="/" className={`navbar-logo ${pathname === '/' ? 'active' : ''}`}>홈화면</Link>

        {/* 메뉴 */}
        <div className="navbar-menu">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`navbar-link ${pathname.startsWith(item.path) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="navbar-spacer" />

        {/* 유저 */}
        <div className="navbar-user">
          <div className="user-info">
            <span className="user-name">사민경</span>
            <span className="user-type">어린이</span>
          </div>
          <div className="user-avatar">
            <div className="avatar-circle-bg" />
            <img src="/svg/sentence_monkey2.png" alt="캐릭터" className="avatar-img" />
          </div>
        </div>
      </div>
    </nav>
  )
}
