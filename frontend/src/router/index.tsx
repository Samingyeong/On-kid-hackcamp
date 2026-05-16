import { createBrowserRouter } from 'react-router-dom'
import Layout from '../layouts/Layout'
import Home from '../pages/Home'
import BookList from '../pages/BookList'
import Reader from '../pages/Reader'
import Login from '../pages/Login'
import StudySelect from '../pages/StudySelect'
import StudyWrite from '../pages/StudyWrite'
import StudyTyping from '../pages/StudyTyping'
import StudySentence from '../pages/StudySentence'
import ScenarioModule from '../components/ScenarioModule'

const Placeholder = ({ title }: { title: string }) => (
  <div style={{ padding: 40, textAlign: 'center' }}>
    <h2>{title}</h2>
    <p>준비 중입니다</p>
  </div>
)

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'books', element: <BookList /> },
      { path: 'reader', element: <Reader /> },
      { path: 'notes', element: <Placeholder title="내 오답노트" /> },
      { path: 'parent', element: <Placeholder title="학부모케어" /> },
      { path: 'study/select', element: <StudySelect /> },
      { path: 'study/practice', element: <StudyWrite /> },
      { path: 'study/typing', element: <StudyTyping /> },
      { path: 'study/sentence', element: <StudySentence /> },
      // 선택형 시나리오 모듈 (?scenario=mock-001 등 쿼리로 시나리오 지정)
      { path: 'study/scenario', element: <ScenarioModule /> },
      { path: 'study/*', element: <Placeholder title="학습" /> },
    ],
  },
])

export default router
