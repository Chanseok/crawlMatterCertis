import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPlatformApi } from './platform/api'

// 애플리케이션 시작 시 플랫폼 API 초기화
initPlatformApi();

createRoot(document.getElementById('root')!).render(
  <App />
)
