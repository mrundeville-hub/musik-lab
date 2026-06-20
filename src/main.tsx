import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { HomePage } from '@/app/HomePage'
import { ExperimentPage } from '@/app/ExperimentPage'

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/e/:slug', element: <ExperimentPage /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
