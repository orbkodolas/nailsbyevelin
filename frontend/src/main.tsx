import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/cormorant-garamond/300.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/300-italic.css'
import '@fontsource/cormorant-garamond/400-italic.css'
import '@fontsource/cormorant-garamond/500-italic.css'
import '@fontsource-variable/jost/index.css'
import '@fontsource/pinyon-script/400.css'
import './index.css'
import App from './App.tsx'
import { initTapFeedback } from './lib/tapFeedback'

// Keretvédelem (clickjacking ellen): ha egy idegen oldal iframe-be töltené, kitörünk belőle
if (window.top !== window.self) {
  try { window.top!.location.href = window.location.href } catch { document.documentElement.style.display = 'none' }
}

initTapFeedback()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
