import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, createHashRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { HomePage } from '@/app/HomePage'
import { ExperimentPage } from '@/app/ExperimentPage'

const routes = [
  { path: '/', element: <HomePage /> },
  { path: '/e/:slug', element: <ExperimentPage /> },
]

const router =
  window.location.protocol === 'http:' || window.location.protocol === 'https:'
    ? createBrowserRouter(routes)
    : createHashRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
