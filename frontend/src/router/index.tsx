import { createBrowserRouter } from 'react-router-dom'
import Layout from '../layouts/Layout'
import Home from '../pages/Home'
import BookList from '../pages/BookList'
import Reader from '../pages/Reader'

const Placeholder = ({ title }: { title: string }) => (
  <div style={{ padding: 40, textAlign: 'center' }}>
    <h2>{title}</h2>
    <p>준비 중입니다</p>
  </div>
)

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'books', element: <BookList /> },
      { path: 'reader', element: <Reader /> },
      { path: 'notes', element: <Placeholder title="내 오답노트" /> },
      { path: 'parent', element: <Placeholder title="학부모케어" /> },
      { path: 'study/*', element: <Placeholder title="학습" /> },
    ],
  },
])

export default router
