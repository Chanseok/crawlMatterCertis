import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPlatformApi } from './platform/api'
import { initializeServices } from './services/initialization'

// 애플리케이션 시작 시 플랫폼 API 초기화
initPlatformApi();

// 서비스 레이어 초기화
initializeServices().then(() => {
  console.log('[App] Service layer initialized successfully');
  
  createRoot(document.getElementById('root')!).render(
    <App />
  );
}).catch((error) => {
  console.error('[App] Failed to initialize services:', error);
  
  // 서비스 초기화 실패 시에도 앱을 시작하되 경고 표시
  createRoot(document.getElementById('root')!).render(
    <App />
  );
});
