import { createBrowserRouter } from 'react-router-dom'
import Layout from '../layouts/Layout'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        lazy: () => import('../pages/Home'),
      },
    ],
  },
])

export default router
