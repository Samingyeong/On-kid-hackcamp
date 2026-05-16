import { createBrowserRouter } from 'react-router-dom'
import Layout from '../layouts/Layout'
import Home from '../pages/Home'

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
      { path: 'books', element: <Placeholder title="동화학습" /> },
      { path: 'reader', element: <Placeholder title="Reader" /> },
      { path: 'notes', element: <Placeholder title="내 오답노트" /> },
      { path: 'parent', element: <Placeholder title="학부모케어" /> },
      { path: 'study/*', element: <Placeholder title="학습" /> },
    ],
  },
])

export default router
