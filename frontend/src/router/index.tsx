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
import StudySign from '../pages/StudySign'
import MidmTest from '../pages/MidmTest'
import TutorIntro from '../pages/TutorIntro'

const Placeholder = ({ title }: { title: string }) => (
  <div style={{ padding: 40, textAlign: 'center' }}>
    <h2>{title}</h2>
    <p>준비 중입니다</p>
  </div>
)

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/tutor', element: <TutorIntro /> },
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
      { path: 'study/sign', element: <StudySign /> },
      { path: 'midm-test', element: <MidmTest /> },
      { path: 'study/*', element: <Placeholder title="학습" /> },
    ],
  },
])

export default router
