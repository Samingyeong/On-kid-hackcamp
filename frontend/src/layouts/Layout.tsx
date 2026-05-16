import { Outlet, useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import './Layout.css'

export default function Layout() {
  const { pathname } = useLocation()
  const immersivePage = pathname.startsWith('/study/voice') || pathname.startsWith('/study/quiz')

  return (
    <div className={`layout ${immersivePage ? 'layout-immersive' : ''}`}>
      {!immersivePage && <Navbar />}
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  )
}
