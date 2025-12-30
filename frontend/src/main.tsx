import { createRoot } from 'react-dom/client'

import App from './App'
import './styles/globals.css'

const container = document.getElementById('root') as HTMLElement
createRoot(container).render(
  <App />
)
