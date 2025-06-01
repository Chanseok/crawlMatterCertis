console.log('[MAIN] 🚀 React main.tsx entry point loaded');

import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initPlatformApi } from './platform/api'
import { initializeServices } from './services/initialization'

console.log('[MAIN] 🔧 Initializing platform API...');
// 애플리케이션 시작 시 플랫폼 API 초기화
initPlatformApi();
console.log('[MAIN] ✅ Platform API initialized');

console.log('[MAIN] 🔧 Starting service initialization...');
// 서비스 레이어 초기화
initializeServices().then(() => {
  console.log('[MAIN] ✅ Service layer initialized successfully');
  console.log('[MAIN] 🎨 Creating React root and rendering App...');
  
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
  console.log('[MAIN] ✅ React app rendered successfully');
}).catch((error) => {
  console.error('[MAIN] ❌ Failed to initialize services:', error);
  console.log('[MAIN] 🔄 Rendering app despite service initialization failure...');
  
  // 서비스 초기화 실패 시에도 앱을 시작하되 경고 표시
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
  console.log('[MAIN] ✅ React app rendered with fallback mode');
});
